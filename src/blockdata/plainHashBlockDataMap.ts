import type { EndThisTickStr } from "../eventLoop.ts";
import { readData, writeData } from "./dataIO.ts";
import type { HashBlockDataMap } from "./types.ts";
/**
 * [pos1,pos2)
 */
export class PlainHashBlockDataMap implements HashBlockDataMap<
  string | undefined
> {
  private readonly pos1: Readonly<[number, number, number]>;
  private readonly pos2: Readonly<[number, number, number]>;
  /**
   * expect pos1 < pos2
   * @param pos1
   * @param pos2
   */
  constructor(
    pos1: Readonly<[number, number, number]>,
    pos2: Readonly<[number, number, number]>,
  ) {
    this.pos1 = pos1;
    this.pos2 = pos2;
  }

  *read(key: string): Generator<EndThisTickStr, string | undefined, unknown> {
    const hashNumber = hash(key);
    const [x1, y1, z1] = this.pos1;
    const [x2, y2, z2] = this.pos2;
    const [x, y, z] = hashNumberToPos(hashNumber, x2 - x1, y2 - y1, z2 - z1);
    return yield* readData([x + x1, y + y1, z + z1]);
  }
  *write(key: string, value: string): Generator<EndThisTickStr, void, unknown> {
    const hashNumber = hash(key);
    const [x1, y1, z1] = this.pos1;
    const [x2, y2, z2] = this.pos2;
    const [x, y, z] = hashNumberToPos(hashNumber, x2 - x1, y2 - y1, z2 - z1);
    yield* writeData([x + x1, y + y1, z + z1], value);
  }
}
export const hashNumberToPos = (
  hashNumber: number,
  xWidth: number,
  yWidth: number,
  zWidth: number,
): [number, number, number] => {
  const x = hashNumber % xWidth;
  const y = Math.floor(hashNumber / xWidth) % yWidth;
  const z = Math.floor((hashNumber / (xWidth * yWidth)) % zWidth);
  return [x, y, z];
};
export const hash = (input: string): number => {
  let h = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);

    h = Math.imul(h, 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }

  h ^= h >>> 16;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0;
};
