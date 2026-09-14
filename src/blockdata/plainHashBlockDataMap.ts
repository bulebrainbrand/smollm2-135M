import { readData } from "./readData";
import { HashBlockDataMap } from "./types";

export class PlainHashBlockDataMap implements HashBlockDataMap<
  string | undefined
> {
  /**
   * expect pos1 < pos2
   * @param pos1
   * @param pos2
   */
  constructor(
    private readonly pos1: [number, number, number],
    private readonly pos2: [number, number, number],
  ) {}

  *read(key: string): Generator<undefined, string | undefined, unknown> {
    const hash = this.hash(key);
    const [x1, y1, z1] = this.pos1;
    const [x2, y2, z2] = this.pos2;
    const x = hash % (x2 - x1);
    const y = Math.floor(hash / (x2 - x1)) % (y2 - y1);
    const z = Math.floor(hash / ((x2 - x1) * (y2 - y1))) % (z2 - z1);
    return yield* readData([x, y, z]);
  }
  private hash(input: string): number {
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
  }
}
