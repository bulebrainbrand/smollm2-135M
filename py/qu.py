"""
HF上のLlama系小型モデルを int8 量子化し、生バイナリ(.bin)として書き出す
スクリプト。SimpleStories-1.25M用に作ったが、--model で他のLlama
アーキテクチャのモデル(SmolLM2など)にも流用できる。

Bloxd.io向けのテキストエンコード(伏せ字回避の31進数化)・チャンク分割は
このスクリプトの範囲外。まずは.binでの量子化結果の確認・検証を先に行う。

使い方:
  pip install torch transformers --break-system-packages
  python export_quantized.py                                      # デフォルト: SimpleStories-1.25M
  python export_quantized.py --model HuggingFaceTB/SmolLM2-135M    # 他モデルに切り替え

出力:
  out/weights_int8.bin       -> 量子化済み重み全体を1本のバイト列にした生バイナリ
  out/manifest.json          -> 各テンソルの name/shape/scale/オフセット情報
                                 (offset/lengthはweights_int8.bin内でのバイト位置)
                                 + ModelWeights/ModelConfig型にそのまま代入できる構造化データ
  out/tokenizer_vocab.json   -> トークンID -> 文字列 の対応表(そのままJS配列に変換可能)
                                 ※WordPiece前提のJS実装は他アーキテクチャの
                                 トークナイザー(BPE等)にはそのまま使えないので注意

  ⚠ モデルサイズがSimpleStories-1.25Mより大きい場合、データ量はパラメータ数に
    比例して増える。例えばSmolLM2-135M(135Mパラメータ)は約108倍のパラメータ数が
    あるため、Bloxdへの実運用は現実的でない可能性が高い。実行前に総パラメータ数を
    確認すること。
"""

import argparse
import json
import os
import sys

# Windows環境(cp932コンソール)でUnicode文字を含む出力がクラッシュしないよう、
# 標準出力/エラー出力をUTF-8に強制する。
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = "SimpleStories/SimpleStories-1.25M"
OUT_DIR = "out"


def quantize_tensor_int8(tensor: torch.Tensor):
    """対称量子化(per-tensor)。int8配列とscale(float)を返す。"""
    flat = tensor.detach().float()
    max_val = flat.abs().max().item()
    if max_val == 0:
        scale = 1.0
    else:
        scale = max_val / 127.0

    q = torch.clamp(torch.round(flat / scale), -127, 127).to(torch.int8)
    return q.cpu().numpy(), scale


def export_model_config(model) -> dict:
    """model.config から ModelConfig(TypeScript側の型)と同じキー名で抜き出す。"""
    cfg = model.config
    return {
        "hiddenSize": cfg.hidden_size,
        "numLayers": cfg.num_hidden_layers,
        "numAttentionHeads": cfg.num_attention_heads,
        "numKeyValueHeads": cfg.num_key_value_heads,
        "headDim": cfg.head_dim,
        "intermediateSize": cfg.intermediate_size,
        "vocabSize": cfg.vocab_size,
        "ropeTheta": cfg.rope_theta,
        "rmsNormEps": cfg.rms_norm_eps,
        # generate()の呼び出しに必要だが ModelConfig型には含めていない値も
        # 参考までに一緒に出しておく
        "eosTokenId": model.generation_config.eos_token_id,
        "bosTokenId": model.generation_config.bos_token_id,
    }


def find_tensor(tensors: list, name: str) -> dict:
    for t in tensors:
        if t["name"] == name:
            return t
    keyword = name.split(".")[-1]
    similar = [t["name"] for t in tensors if keyword in t["name"]][:5]
    hint = f" (似た名前: {similar})" if similar else ""
    raise KeyError(f"テンソルが見つかりません: {name!r}{hint}")


def build_structured_weights(manifest_tensors: list, num_layers: int) -> dict:
    """フラットな manifest_tensors を TypeScript側の ModelWeights と
    そのままキー名が一致する形(camelCase)に組み立てる。
    こうしておけば Bloxd 側では文字列マッチングのbuildModelWeights()を
    呼ばず、manifest.modelWeights をそのまま ModelWeights として使える。
    """
    embed_tokens = find_tensor(manifest_tensors, "model.embed_tokens.weight")
    final_norm = find_tensor(manifest_tensors, "model.norm.weight")

    layers = []
    for i in range(num_layers):
        p = f"model.layers.{i}."
        layers.append({
            "inputNorm": find_tensor(manifest_tensors, p + "input_layernorm.weight"),
            "postAttnNorm": find_tensor(manifest_tensors, p + "post_attention_layernorm.weight"),
            "qProj": find_tensor(manifest_tensors, p + "self_attn.q_proj.weight"),
            "kProj": find_tensor(manifest_tensors, p + "self_attn.k_proj.weight"),
            "vProj": find_tensor(manifest_tensors, p + "self_attn.v_proj.weight"),
            "oProj": find_tensor(manifest_tensors, p + "self_attn.o_proj.weight"),
            "gateProj": find_tensor(manifest_tensors, p + "mlp.gate_proj.weight"),
            "upProj": find_tensor(manifest_tensors, p + "mlp.up_proj.weight"),
            "downProj": find_tensor(manifest_tensors, p + "mlp.down_proj.weight"),
        })

    return {
        "embedTokens": embed_tokens,
        "layers": layers,
        "finalNorm": final_norm,
    }


def export_weights(model, out_dir: str):
    manifest_tensors = []
    raw_chunks = []  # バイト列の断片を集めて最後に連結
    offset = 0

    # 名前順で固定(復元側と順序を一致させるため)
    named_params = sorted(model.named_parameters(), key=lambda kv: kv[0])

    for name, param in named_params:
        q_np, scale = quantize_tensor_int8(param.data)
        raw_bytes = q_np.tobytes()  # int8なので1要素=1バイト
        length = len(raw_bytes)

        manifest_tensors.append({
            "name": name,
            "shape": list(param.shape),
            "scale": scale,
            "offset": offset,
            "length": length,
        })

        raw_chunks.append(raw_bytes)
        offset += length

    full_bytes = b"".join(raw_chunks)

    bin_path = os.path.join(out_dir, "weights_int8.bin")
    with open(bin_path, "wb") as f:
        f.write(full_bytes)
    print(f"生バイナリ書き出し: {bin_path} ({len(full_bytes):,} bytes)")

    num_layers = model.config.num_hidden_layers
    structured = build_structured_weights(manifest_tensors, num_layers)

    manifest = {
        "total_raw_bytes": len(full_bytes),
        "tensors": manifest_tensors,       # フラット版(デバッグ・検算用に残す)
        "modelWeights": structured,        # ModelWeights型にそのまま代入できる構造化版
        "modelConfig": export_model_config(model),  # ModelConfig型にそのまま代入できる
    }
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"量子化後の生バイト数: {len(full_bytes):,} bytes")
    print(f"-> {bin_path} に書き出し完了")
    print(f"-> {os.path.join(out_dir, 'manifest.json')} に書き出し完了")


def export_tokenizer(tokenizer, out_dir: str):
    vocab = tokenizer.get_vocab()  # token(str) -> id(int)
    id_to_token = [None] * len(vocab)
    for token, idx in vocab.items():
        id_to_token[idx] = token

    path = os.path.join(out_dir, "tokenizer_vocab.json")
    with open(path, "w",encoding="utf-8") as f:
        json.dump(id_to_token, f, ensure_ascii=False)

    total_len = sum(len(t) for t in id_to_token if t)
    print(f"語彙サイズ: {len(id_to_token)} トークン (概算文字数: {total_len:,})")
    print(f"-> {path} に書き出し完了")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        type=str,
        default=MODEL_NAME,
        help="HF上のモデル名 (Llamaアーキテクチャ前提)。例: HuggingFaceTB/SmolLM2-135M",
    )
    args = parser.parse_args()
    model_name = args.model

    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"モデル読み込み中: {model_name}")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(model_name)
    model.eval()

    n_params = sum(p.numel() for p in model.parameters())
    print(f"パラメータ数: {n_params:,}")

    # SimpleStories-1.25Mで実測した「1チャンクあたりの読み込みコスト」を基準に、
    # このモデルサイズだとどのくらいのチャンク数・生成速度になるかの概算を出す。
    REFERENCE_PARAMS = 1_234_816       # SimpleStories-1.25Mの実パラメータ数
    REFERENCE_CHUNKS = 156             # 31進数エンコード時の実測チャンク数
    REFERENCE_SEC_PER_TOKEN = 3.0      # 実機で計測された1トークンあたりの秒数
    scale_factor = n_params / REFERENCE_PARAMS
    estimated_chunks = int(REFERENCE_CHUNKS * scale_factor)
    estimated_sec_per_token = REFERENCE_SEC_PER_TOKEN * scale_factor

    print(f"推定チャンク数: 約{estimated_chunks:,}個 (SimpleStories-1.25M比 {scale_factor:.1f}倍)")
    print(f"推定生成速度: 約{estimated_sec_per_token:.1f}秒/トークン (実測ベースの概算)")
    if scale_factor > 5:
        print(
            "⚠ SimpleStories-1.25Mの5倍を超える規模です。Bloxdでの実運用は"
            "現実的でない可能性が高いので、続行前によく検討してください。"
        )
    print()

    print("=== 重みの量子化・書き出し ===")
    export_weights(model, OUT_DIR)

    print("\n=== トークナイザー語彙の書き出し ===")
    export_tokenizer(tokenizer, OUT_DIR)


if __name__ == "__main__":
    main()