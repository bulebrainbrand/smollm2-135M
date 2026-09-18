"use worldcode";
import { readData } from "./blockdata/dataIO.ts";
import type { EndThisTickStr } from "./eventLoop.ts";
import { decodeSymbol } from "./safe32/index.ts";

export class ByteCursor {
  readonly chunkSize: number;
  readonly coordFn: (index: number) => [number, number, number];
  chunkIndex: number;
  chunkText: string;
  constructor(
    chunkSize: number,
    coordFn: (index: number) => [number, number, number],
  ) {
    this.chunkSize = chunkSize;
    this.coordFn = coordFn;
    this.chunkIndex = -1;
    this.chunkText = "";
  }

  *_ensureChunkLoaded(
    charOffset: number,
  ): Generator<EndThisTickStr, number, unknown> {
    const neededChunk = Math.floor(charOffset / this.chunkSize);
    if (neededChunk !== this.chunkIndex) {
      const pos = this.coordFn(neededChunk);
      api.getBlock(pos[0] + 32, pos[1], pos[2]); // try next chunk load for next read
      this.chunkText = (yield* readData(pos)) ?? "";
      this.chunkIndex = neededChunk;
    }
    return charOffset - neededChunk * this.chunkSize;
  }

  *readBytes(
    tensorOffset: number,
    length: number,
  ): Generator<EndThisTickStr, Uint8Array<ArrayBuffer>, unknown> {
    const out = new Uint8Array(length);
    let encodedCharOffset = Math.floor((tensorOffset * 8) / 5);
    let skipBits = (tensorOffset * 8) % 5;
    let bitBuffer = 0;
    let bitCount = 0;
    let outIdx = 0;

    while (outIdx < length) {
      const localPos = yield* this._ensureChunkLoaded(encodedCharOffset);
      const charsLeftInChunk = this.chunkText.length - localPos;
      if (charsLeftInChunk <= 0) {
        throw new Error(
          `stalled safe32 read: chunk ${this.chunkIndex} exhausted at localPos=${localPos}, ` +
            `encodedCharOffset=${encodedCharOffset}, targetLength=${length}`,
        );
      }

      for (
        let i = 0;
        i < charsLeftInChunk && outIdx < length;
        i++, encodedCharOffset++
      ) {
        let value = decodeSymbol(this.chunkText[localPos + i]);
        let valueBits = 5;
        if (skipBits !== 0) {
          value &= (1 << (5 - skipBits)) - 1;
          valueBits = 5 - skipBits;
          skipBits = 0;
        }

        bitBuffer = (bitBuffer << valueBits) | value;
        bitCount += valueBits;
        while (bitCount >= 8 && outIdx < length) {
          bitCount -= 8;
          out[outIdx++] = (bitBuffer >> bitCount) & 0xff;
          bitBuffer &= (1 << bitCount) - 1;
        }
      }
    }
    return out;
  }
}
