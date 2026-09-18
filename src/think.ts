/**
 * SimpleStories-1.25M (Llamaアーキテクチャ) の1トークン分forwardパス。
 * 重みは全て ByteCursor 経由で必要な範囲だけ遅延読み込みする。
 *
 * 前提インターフェース(既存の ByteCursor 実装がこの形と違う場合は
 * readBytes の呼び出し部分だけ合わせてください):
 *
 *   class ByteCursor {
 *     readBytes(tensorOffset: number, length: number): Uint8Array;
 *   }
 *
 * config.json の実測値:
 *   hiddenSize=128, numLayers=4, numAttentionHeads=4, numKeyValueHeads=2,
 *   headDim=32, intermediateSize=341, vocabSize=4019, tieWordEmbeddings=true
 */

import type { TensorMeta } from "./types.ts";

// ==== 型定義 ====

interface LayerWeights {
  inputNorm: TensorMeta; // [hiddenSize]
  postAttnNorm: TensorMeta; // [hiddenSize]
  qProj: TensorMeta; // [numAttentionHeads*headDim, hiddenSize]
  kProj: TensorMeta; // [numKeyValueHeads*headDim, hiddenSize]
  vProj: TensorMeta; // [numKeyValueHeads*headDim, hiddenSize]
  oProj: TensorMeta; // [hiddenSize, numAttentionHeads*headDim]
  gateProj: TensorMeta; // [intermediateSize, hiddenSize]
  upProj: TensorMeta; // [intermediateSize, hiddenSize]
  downProj: TensorMeta; // [hiddenSize, intermediateSize]
}

interface ModelConfig {
  hiddenSize: number;
  numLayers: number;
  numAttentionHeads: number;
  numKeyValueHeads: number;
  headDim: number;
  intermediateSize: number;
  /** Fraction of the MLP intermediate neurons to evaluate (1.0 = exact). */
  mlpKeepRatio?: number;
  vocabSize: number;
  ropeTheta: number;
  rmsNormEps: number;
}

interface ModelWeights {
  embedTokens: TensorMeta; // [vocabSize, hiddenSize] tie_word_embeddings=trueなので出力層と共用
  layers: LayerWeights[];
  finalNorm: TensorMeta; // [hiddenSize]
}

// KVキャッシュ: レイヤーごとに、これまでの全トークン分のkey/valueを保持
interface KVCache {
  keys: Float32Array[][]; // [layer][position] -> [numKeyValueHeads*headDim]
  values: Float32Array[][]; // 同上
}
import type { ByteCursor as ByteCursorLike } from "./byte_cursur.ts";
import { END_THIS_TICK_STR, type EndThisTickStr } from "./eventLoop.ts";

// The forward pass used to call console.log at every layer/sub-step of
// every generated token. In an embedded engine console.log usually crosses
// a host bridge and isn't free, and it runs literally every token - flip
// this to true only when actively debugging.
const DEBUG_LOG = true;
function log(...args: unknown[]): void {
  if (DEBUG_LOG) console.log(...args);
}

// A generator suspension per multiply is extremely expensive in the game
// runtime. Eight rows is still small enough to yield regularly, while cutting
// millions of useless suspends from each token. This does not change results.
const LINEAR_ROW_BATCH = 8;
// ==== 量子化復元ユーティリティ ====

function toSignedInt8(v: number): number {
  return v > 127 ? v - 256 : v;
}

/** テンソルのrow行目(長さrowLen)を読んでdequantizeする。 */
function* readRowDequantized(
  cursor: ByteCursorLike,
  tensor: TensorMeta,
  row: number,
  rowLen: number,
): Generator<EndThisTickStr, Float32Array<ArrayBuffer>, any> {
  const raw = yield* cursor.readBytes(tensor.offset + row * rowLen, rowLen);
  const out = new Float32Array(rowLen);
  for (let i = 0; i < rowLen; i++) {
    out[i] = toSignedInt8(raw[i]) * tensor.scale;
  }
  return out;
}

/** ベクトルをそのままdequantizeして返す(RMSNormの重みなど、1次元の小さいテンソル用)。 */
function readVectorDequantized(
  cursor: ByteCursorLike,
  tensor: TensorMeta,
): Generator<EndThisTickStr, Float32Array<ArrayBuffer>, any> {
  return readRowDequantized(cursor, tensor, 0, tensor.length);
}

/**
 * y = W x  (Wの形状は [outDim, inDim]、PyTorch Linearと同じ行優先レイアウト)
 * 行を1本ずつ順番に読みながら計算するので、ByteCursorの連続アクセス最適化が効く。
 */
function* linear(
  cursor: ByteCursorLike,
  weight: TensorMeta,
  input: Float32Array,
  outDim: number,
  inDim: number,
  rowStride = inDim,
): Generator<EndThisTickStr | undefined, Float32Array<ArrayBuffer>, any> {
  const out = new Float32Array(outDim);
  const scale = weight.scale;
  for (let o = 0; o < outDim; o++) {
    if ((o & (LINEAR_ROW_BATCH - 1)) === 0) yield;
    const raw = yield* cursor.readBytes(weight.offset + o * rowStride, inDim);
    // raw is already two's-complement int8 data (that's what quantization
    // produced), so reinterpreting the buffer as Int8Array gives the signed
    // value directly with zero branches/calls per element - no need for
    // toSignedInt8(). dot(scale*w, x) === scale*dot(w, x), so the scale
    // multiply (and the float32 rounding via Math.fround) moves out of the
    // O(inDim) loop to a single O(1) op per row.
    const signed = new Int8Array(raw.buffer, raw.byteOffset, inDim);
    let sum = 0;
    for (let i = 0; i < inDim; i++) {
      // int8の0は積に寄与しないため、乗算を省略する。
      const w = signed[i];
      if (w === 0) continue;
      sum += w * input[i];
    }
    out[o] = Math.fround(sum * scale);
  }
  return out;
}

// ==== RMSNorm ====

function* rmsNorm(
  x: Float32Array,
  weight: Float32Array,
  eps: number,
): Generator<never, Float32Array<ArrayBuffer>, unknown> {
  let sumSq = 0;
  for (let i = 0; i < x.length; i++) sumSq += x[i] * x[i];
  const rms = Math.sqrt(sumSq / x.length + eps);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] / rms) * weight[i];
  return out;
}

// ==== RoPE (Rotary Position Embedding) ====

/** headDim次元のベクトルに対し、位置posに応じた回転を適用する(in-place)。 */
function applyRope(
  vec: Float32Array,
  headDim: number,
  pos: number,
  theta: number,
): void {
  const half = headDim / 2;
  for (let i = 0; i < half; i++) {
    const freq = 1.0 / Math.pow(theta, (2 * i) / headDim);
    const angle = pos * freq;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x0 = vec[i];
    const x1 = vec[i + half];
    vec[i] = x0 * cos - x1 * sin;
    vec[i + half] = x0 * sin + x1 * cos;
  }
}

// ==== SiLU (Swish) 活性化関数 ====

function silu(x: number): number {
  return x / (1 + Math.exp(-x));
}

// ==== Attention (Grouped Query Attention) ====

function* attention(
  cursor: ByteCursorLike,
  layerWeights: LayerWeights,
  layerIdx: number,
  normedInput: Float32Array,
  pos: number,
  cfg: ModelConfig,
  kvCache: KVCache,
): Generator<EndThisTickStr | undefined, Float32Array<ArrayBuffer>, any> {
  const {
    numAttentionHeads,
    numKeyValueHeads,
    headDim,
    hiddenSize,
    ropeTheta,
  } = cfg;
  const qDim = numAttentionHeads * headDim;
  const kvDim = numKeyValueHeads * headDim;
  const groupSize = numAttentionHeads / numKeyValueHeads; // 1クエリヘッドグループあたりのクエリヘッド数

  // Q, K, V を計算
  const q = yield* linear(
    cursor,
    layerWeights.qProj,
    normedInput,
    qDim,
    hiddenSize,
  );
  log("attention q end");
  const k = yield* linear(
    cursor,
    layerWeights.kProj,
    normedInput,
    kvDim,
    hiddenSize,
  );
  log("attention k end");
  const v = yield* linear(
    cursor,
    layerWeights.vProj,
    normedInput,
    kvDim,
    hiddenSize,
  );
  log("attention v end");
  // ヘッドごとにRoPEを適用
  for (let h = 0; h < numAttentionHeads; h++) {
    applyRope(
      q.subarray(h * headDim, (h + 1) * headDim),
      headDim,
      pos,
      ropeTheta,
    );
  }
  for (let h = 0; h < numKeyValueHeads; h++) {
    applyRope(
      k.subarray(h * headDim, (h + 1) * headDim),
      headDim,
      pos,
      ropeTheta,
    );
  }

  // KVキャッシュに今回のk, vを追加
  kvCache.keys[layerIdx].push(k);
  kvCache.values[layerIdx].push(v);

  const seqLen = kvCache.keys[layerIdx].length; // 現在位置を含めた系列長
  const attnOut = new Float32Array(qDim);
  const scale = 1 / Math.sqrt(headDim);

  for (let qh = 0; qh < numAttentionHeads; qh++) {
    const kvh = Math.floor(qh / groupSize); // GQA: 複数のクエリヘッドが同じKVヘッドを共有
    const qVec = q.subarray(qh * headDim, (qh + 1) * headDim);

    // スコア計算 (causal: 自分より後ろの位置は見ない。今回は毎回最新posまでなので全部見てOK)
    const scores = new Float32Array(seqLen);
    let maxScore = -Infinity;
    for (let t = 0; t < seqLen; t++) {
      const kVec = kvCache.keys[layerIdx][t].subarray(
        kvh * headDim,
        (kvh + 1) * headDim,
      );
      let dot = 0;
      for (let i = 0; i < headDim; i++) dot += qVec[i] * kVec[i];
      scores[t] = dot * scale;
      if (scores[t] > maxScore) maxScore = scores[t];
    }

    // softmax
    let sumExp = 0;
    for (let t = 0; t < seqLen; t++) {
      scores[t] = Math.exp(scores[t] - maxScore);
      sumExp += scores[t];
    }
    for (let t = 0; t < seqLen; t++) scores[t] /= sumExp;

    // 加重和
    const outSlice = attnOut.subarray(qh * headDim, (qh + 1) * headDim);
    for (let t = 0; t < seqLen; t++) {
      const vVec = kvCache.values[layerIdx][t].subarray(
        kvh * headDim,
        (kvh + 1) * headDim,
      );
      const w = scores[t];
      for (let i = 0; i < headDim; i++) outSlice[i] += w * vVec[i];
    }
  }

  // 出力射影
  return yield* linear(cursor, layerWeights.oProj, attnOut, hiddenSize, qDim);
}

// ==== SwiGLU MLP ====

function* mlp(
  cursor: ByteCursorLike,
  layerWeights: LayerWeights,
  normedInput: Float32Array,
  cfg: ModelConfig,
): Generator<EndThisTickStr | undefined, Float32Array<ArrayBuffer>, any> {
  const { hiddenSize, intermediateSize } = cfg;
  // Keep the selected neurons contiguous so the Safe32 cursor can read one
  // compact slice per row. Set to 1.0 for the original full-width MLP.
  const keepRatio = Math.max(0.05, Math.min(1, cfg.mlpKeepRatio ?? 1));
  const activeIntermediateSize = Math.max(
    1,
    Math.floor(intermediateSize * keepRatio),
  );
  const gate = yield* linear(
    cursor,
    layerWeights.gateProj,
    normedInput,
    activeIntermediateSize,
    hiddenSize,
  );
  log("created gate");
  const up = yield* linear(
    cursor,
    layerWeights.upProj,
    normedInput,
    activeIntermediateSize,
    hiddenSize,
  );
  log("creaed up");
  const swiglu = new Float32Array(activeIntermediateSize);
  for (let i = 0; i < activeIntermediateSize; i++)
    swiglu[i] = silu(gate[i]) * up[i];
  log("created swiglu");
  return yield* linear(
    cursor,
    layerWeights.downProj,
    swiglu,
    hiddenSize,
    activeIntermediateSize,
    intermediateSize,
  );
}

// ==== 埋め込み取得 (1トークン分だけ読む: 軽い) ====

function getTokenEmbedding(
  cursor: ByteCursorLike,
  embedTokens: TensorMeta,
  tokenId: number,
  hiddenSize: number,
): Generator<EndThisTickStr, Float32Array<ArrayBuffer>, any> {
  return readRowDequantized(cursor, embedTokens, tokenId, hiddenSize);
}

// ==== 出力層 (tie_word_embeddings=true: 埋め込み行列を転置して使い回す) ====
// vocabSize行すべてを読む必要があるため、ここが唯一「全部読む」コスト。

function* computeLogits(
  cursor: ByteCursorLike,
  embedTokens: TensorMeta,
  hiddenState: Float32Array,
  vocabSize: number,
  hiddenSize: number,
): Generator<EndThisTickStr | undefined, Float32Array<ArrayBuffer>, any> {
  // This is the one place that reads the whole embedding table, once per
  // generated token, so it's the single most-called hot loop in the model.
  // readRowDequantized() would decode each row into its own new
  // Float32Array(hiddenSize) (vocabSize allocations per token) and multiply
  // in `scale` per element; here we dot-product straight off the raw int8
  // bytes and apply `scale` once per row instead, same trick as linear().
  const logits = new Float32Array(vocabSize);
  const raw = new Uint8Array(hiddenSize);
  const signed = new Int8Array(raw.buffer, raw.byteOffset, hiddenSize);
  const scale = embedTokens.scale;
  for (let v = 0; v < vocabSize; v++) {
    if (v % 100 === 0) {
      log("computeLogits vocab progress", v);
    }
    yield* cursor.readBytesInto(
      raw,
      embedTokens.offset + v * hiddenSize,
      hiddenSize,
    );
    let sum = 0;
    yield;
    for (let i = 0; i < hiddenSize; i++) {
      const w = signed[i];
      if (w === 0) continue;
      sum += w * hiddenState[i];
    }
    logits[v] = Math.fround(sum * scale);
  }
  return logits;
}

// ==== 1トークン分のforwardパス本体 ====

function* forwardStep(
  cursor: ByteCursorLike,
  weights: ModelWeights,
  cfg: ModelConfig,
  tokenId: number,
  pos: number,
  kvCache: KVCache,
): Generator<EndThisTickStr | undefined, Float32Array<ArrayBuffer>, any> {
  let hidden = yield* getTokenEmbedding(
    cursor,
    weights.embedTokens,
    tokenId,
    cfg.hiddenSize,
  );

  for (let l = 0; l < cfg.numLayers; l++) {
    yield END_THIS_TICK_STR;
    log("layer", l);
    const layerWeights = weights.layers[l];

    const inputNormWeight = yield* readVectorDequantized(
      cursor,
      layerWeights.inputNorm,
    );
    const normed1 = yield* rmsNorm(hidden, inputNormWeight, cfg.rmsNormEps);
    const attnOut = yield* attention(
      cursor,
      layerWeights,
      l,
      normed1,
      pos,
      cfg,
      kvCache,
    );
    log("layer:", l, "attention end");
    const hiddenAfterAttn = new Float32Array(cfg.hiddenSize);
    for (let i = 0; i < cfg.hiddenSize; i++)
      hiddenAfterAttn[i] = hidden[i] + attnOut[i];
    log("created hidden after attn");
    const postAttnNormWeight = yield* readVectorDequantized(
      cursor,
      layerWeights.postAttnNorm,
    );
    log("created postAttnNormWeight");
    const normed2 = yield* rmsNorm(
      hiddenAfterAttn,
      postAttnNormWeight,
      cfg.rmsNormEps,
    );
    log("created normed2");
    yield END_THIS_TICK_STR;
    const mlpOut = yield* mlp(cursor, layerWeights, normed2, cfg);
    log("created mlp");
    log("layer:", l, "mlp end");
    yield;
    hidden = new Float32Array(cfg.hiddenSize);
    for (let i = 0; i < cfg.hiddenSize; i++)
      hidden[i] = hiddenAfterAttn[i] + mlpOut[i];
  }

  const finalNormWeight = yield* readVectorDequantized(
    cursor,
    weights.finalNorm,
  );
  const normedFinal = yield* rmsNorm(hidden, finalNormWeight, cfg.rmsNormEps);
  yield END_THIS_TICK_STR;
  return yield* computeLogits(
    cursor,
    weights.embedTokens,
    normedFinal,
    cfg.vocabSize,
    cfg.hiddenSize,
  );
}

// ==== サンプリング (greedy: 最も確率の高いトークンを選ぶ) ====

function argmax(logits: Float32Array): number {
  let best = 0;
  for (let i = 1; i < logits.length; i++) {
    if (logits[i] > logits[best]) best = i;
  }
  return best;
}

// ==== 生成ループ ====

function* generate(
  cursor: ByteCursorLike,
  weights: ModelWeights,
  cfg: ModelConfig,
  promptTokenIds: number[],
  maxNewTokens: number,
  eosTokenId: number,
  callback: (token: number[]) => void,
): Generator<EndThisTickStr | undefined, number[], any> {
  const kvCache: KVCache = {
    keys: Array.from({ length: cfg.numLayers }, () => []),
    values: Array.from({ length: cfg.numLayers }, () => []),
  };

  const generated: number[] = [...promptTokenIds];
  let logits: Float32Array = new Float32Array(cfg.vocabSize);

  // プロンプト部分を1トークンずつ流してKVキャッシュを構築
  for (let pos = 0; pos < promptTokenIds.length; pos++) {
    logits = yield* forwardStep(
      cursor,
      weights,
      cfg,
      promptTokenIds[pos],
      pos,
      kvCache,
    );
  }

  // 新規トークンを1個ずつ生成
  for (let step = 0; step < maxNewTokens; step++) {
    log("step:", step);
    const nextToken = argmax(logits);
    generated.push(nextToken);
    callback(generated);
    if (nextToken === eosTokenId) break;
    const pos = generated.length - 1;
    logits = yield* forwardStep(cursor, weights, cfg, nextToken, pos, kvCache);
  }

  return generated;
}

export { forwardStep, generate, argmax };
export type {
  ByteCursorLike,
  ModelConfig,
  ModelWeights,
  LayerWeights,
  TensorMeta,
  KVCache,
};
