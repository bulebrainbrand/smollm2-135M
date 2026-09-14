/**
 * Byte-level BPE tokenizer compatible with GPT-2 / SmolLM2's `tokenizer.json`
 * (Hugging Face "tokenizers" fast-tokenizer format, model.type === "BPE").
 *
 * No external dependencies. Works in Node.js, browsers, and any modern JS
 * engine that supports Unicode property escapes in RegExp (`\p{L}`, `\p{N}`
 * with the `u` flag) and `TextEncoder`/`TextDecoder`.
 */

type Vocab = Record<string, number>;
type MergeRule = [string, string];

interface AddedToken {
  id: number;
  content: string;
  special: boolean;
}

interface TokenizerJson {
  model: {
    type: string;
    vocab: Vocab;
    merges: string[] | MergeRule[];
  };
  added_tokens?: AddedToken[];
}

/**
 * GPT-2's byte <-> printable-unicode-char mapping.
 * Every one of the 256 byte values gets mapped to a *single* unicode
 * codepoint so that raw UTF-8 bytes can be represented as ordinary
 * "characters" and fed through a text-based BPE merge algorithm.
 * Direct port of `bytes_to_unicode()` from the original GPT-2 repo.
 */
function bytesToUnicode(): Map<number, string> {
  const bs: number[] = [];
  const range = (a: number, b: number) => {
    for (let i = a; i <= b; i++) bs.push(i);
  };
  range("!".charCodeAt(0), "~".charCodeAt(0));
  range("\u00a1".charCodeAt(0), "\u00ac".charCodeAt(0));
  range("\u00ae".charCodeAt(0), "\u00ff".charCodeAt(0));

  const cs: number[] = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  const map = new Map<number, string>();
  for (let i = 0; i < bs.length; i++) {
    map.set(bs[i], String.fromCharCode(cs[i]));
  }
  return map;
}

// GPT-2 pre-tokenizer regex. `u` flag enables \p{L} / \p{N} Unicode classes.
const PRETOKENIZE_PATTERN =
  /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class BPETokenizer {
  private readonly encoder: Map<string, number>;
  private readonly decoder: Map<number, string>;
  private readonly bpeRanks: Map<string, number>;
  private readonly byteEncoder: Map<number, string>;
  private readonly byteDecoder: Map<string, number>;
  private readonly cache = new Map<string, string>();
  private readonly specialTokenToId: Map<string, number>;
  private readonly idToSpecialToken: Map<number, string>;
  private readonly specialSplitRegex: RegExp | null;

  constructor(
    vocab: Vocab,
    merges: MergeRule[],
    specialTokens: Array<{ id: number; content: string }> = [],
  ) {
    this.encoder = new Map(Object.entries(vocab));
    this.decoder = new Map([...this.encoder].map(([tok, id]) => [id, tok]));
    this.bpeRanks = new Map(merges.map(([a, b], i) => [a + "\u0001" + b, i]));
    this.byteEncoder = bytesToUnicode();
    this.byteDecoder = new Map([...this.byteEncoder].map(([b, c]) => [c, b]));

    this.specialTokenToId = new Map(
      specialTokens.map((t) => [t.content, t.id]),
    );
    this.idToSpecialToken = new Map(
      specialTokens.map((t) => [t.id, t.content]),
    );

    if (specialTokens.length > 0) {
      const sorted = [...this.specialTokenToId.keys()].sort(
        (a, b) => b.length - a.length,
      );
      this.specialSplitRegex = new RegExp(
        "(" + sorted.map(escapeRegExp).join("|") + ")",
      );
    } else {
      this.specialSplitRegex = null;
    }
  }

  /** Build directly from a parsed `tokenizer.json` (fast-tokenizer format). */
  static fromTokenizerJson(json: TokenizerJson): BPETokenizer {
    if (json.model.type !== "BPE") {
      throw new Error(`Unsupported tokenizer model type: ${json.model.type}`);
    }
    const merges: MergeRule[] = json.model.merges.map((m) =>
      typeof m === "string" ? (m.split(" ") as MergeRule) : m,
    );
    const special = (json.added_tokens ?? [])
      .filter((t) => t.special)
      .map((t) => ({ id: t.id, content: t.content }));
    return new BPETokenizer(json.model.vocab, merges, special);
  }

  private getPairs(word: string[]): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < word.length - 1; i++)
      pairs.push([word[i], word[i + 1]]);
    return pairs;
  }

  /** Run BPE merges on a single byte-mapped "word", returns space-joined subwords. */
  private bpe(token: string): string {
    const cached = this.cache.get(token);
    if (cached !== undefined) return cached;

    let word = Array.from(token);
    if (word.length <= 1) {
      this.cache.set(token, token);
      return token;
    }

    let pairs = this.getPairs(word);
    while (true) {
      let minRank = Infinity;
      let minPair: [string, string] | null = null;
      for (const p of pairs) {
        const rank = this.bpeRanks.get(p[0] + "\u0001" + p[1]);
        if (rank !== undefined && rank < minRank) {
          minRank = rank;
          minPair = p;
        }
      }
      if (!minPair) break;

      const [first, second] = minPair;
      const newWord: string[] = [];
      let i = 0;
      while (i < word.length) {
        const j = word.indexOf(first, i);
        if (j === -1) {
          newWord.push(...word.slice(i));
          break;
        }
        newWord.push(...word.slice(i, j));
        i = j;
        if (
          word[i] === first &&
          i < word.length - 1 &&
          word[i + 1] === second
        ) {
          newWord.push(first + second);
          i += 2;
        } else {
          newWord.push(word[i]);
          i += 1;
        }
      }
      word = newWord;
      if (word.length === 1) break;
      pairs = this.getPairs(word);
    }

    const result = word.join(" ");
    this.cache.set(token, result);
    return result;
  }

  private encodeChunk(text: string, ids: number[]): void {
    const unkId = this.encoder.get("<|endoftext|>");
    for (const m of text.matchAll(PRETOKENIZE_PATTERN)) {
      const chunk = m[0];
      const bytes = new TextEncoder().encode(chunk);
      let mapped = "";
      for (const b of bytes) mapped += this.byteEncoder.get(b);

      for (const tok of this.bpe(mapped).split(" ")) {
        const id = this.encoder.get(tok);
        if (id !== undefined) ids.push(id);
        else if (unkId !== undefined) ids.push(unkId);
      }
    }
  }

  /** Text -> token ids. Special tokens (e.g. `<|im_start|>`) are matched verbatim. */
  encode(text: string): number[] {
    const ids: number[] = [];
    const segments = this.specialSplitRegex
      ? text.split(this.specialSplitRegex)
      : [text];
    for (const seg of segments) {
      if (seg.length === 0) continue;
      if (this.specialTokenToId.has(seg)) {
        ids.push(this.specialTokenToId.get(seg)!);
      } else {
        this.encodeChunk(seg, ids);
      }
    }
    return ids;
  }

  /** Token ids -> text. */
  decode(ids: number[], skipSpecialTokens = false): string {
    let mapped = "";
    for (const id of ids) {
      const special = this.idToSpecialToken.get(id);
      if (special !== undefined) {
        if (!skipSpecialTokens) mapped += special;
        continue;
      }
      mapped += this.decoder.get(id) ?? "";
    }
    const bytes: number[] = [];
    for (const ch of mapped) {
      const b = this.byteDecoder.get(ch);
      if (b !== undefined) bytes.push(b);
    }
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }

  get vocabSize(): number {
    return this.encoder.size;
  }
}
