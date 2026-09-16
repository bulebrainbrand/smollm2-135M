const ALPHABET = [
  "!",
  '"',
  "|",
  "$",
  "%",
  "&",
  "'",
  "(",
  ")",
  "*",
  "+",
  ",",
  "-",
  ".",
  "/",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ":",
  ";",
  "<",
  "=",
  ">",
  "?",
  "@",
];
const REVERSE = new Map(ALPHABET.map((ch, i) => [ch, i]));
const CODES = Uint8Array.from(ALPHABET, (ch) => ch.charCodeAt(0));

export function decodeSymbol(ch: string): number {
  const value = REVERSE.get(ch);
  if (value === undefined) {
    throw new Error(`Invalid safe32 character: ${JSON.stringify(ch)}`);
  }
  return value;
}

/**
 * バイト列をエンコードする。
 * @param {Uint8Array} bytes
 * @returns {string}
 */
/**
 * バイト列をエンコードする。
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encode(bytes: Uint8Array): string {
  const outLen = Math.ceil((bytes.length * 8) / 5);
  const out = new Uint8Array(outLen);
  let idx = 0;

  let buffer = 0; // ビットアキュムレータ
  let bits = 0; // buffer内の有効ビット数

  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out[idx++] = CODES[(buffer >> bits) & 0x1f];
    }
    buffer &= (1 << bits) - 1; // 消費済みの上位ビットを捨てて桁あふれを防ぐ
  }

  if (bits > 0) {
    // 端数ビットは右側をゼロ埋めして最後の1文字にする
    out[idx++] = CODES[(buffer << (5 - bits)) & 0x1f];
  }

  // TextDecoder/Bufferなしで文字列化する
  const CHUNK = 4096;
  const parts: string[] = [];
  for (let i = 0; i < out.length; i += CHUNK) {
    const slice = out.subarray(i, i + CHUNK);
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return parts.join("");
}

/**
 * 文字列をデコードする。
 * @param {string} str
 * @param {number} [byteLength] 元のバイト長がわかっていれば渡す(末尾のパディングビットを正しく切り捨てるため)
 * @returns {Uint8Array}
 */
export function decode(str: string): Uint8Array {
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (const ch of str) {
    const val = REVERSE.get(ch);
    if (val === undefined) {
      throw new Error(`不正な文字です: ${JSON.stringify(ch)}`);
    }
    buffer = (buffer << 5) | val;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
    buffer &= (1 << bits) - 1;
  }

  return Uint8Array.from(bytes);
}
