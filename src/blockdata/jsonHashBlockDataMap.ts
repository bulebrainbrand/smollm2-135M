import { PlainHashBlockDataMap } from "./plainHashBlockDataMap";
import type { HashBlockDataMap } from "./types";

export class JSONHashBlockDataMap implements HashBlockDataMap<
  string | number | boolean | object | null | undefined
> {
  private readonly plainHashBlockDataMap: PlainHashBlockDataMap;
  constructor(plainHashBlockDataMap: PlainHashBlockDataMap) {
    this.plainHashBlockDataMap = plainHashBlockDataMap;
  }
  *read(
    key: string,
  ): Generator<
    undefined,
    string | number | boolean | object | null | undefined,
    unknown
  > {
    const result = yield* this.plainHashBlockDataMap.read(key);
    if (result === undefined) return undefined;
    const json = JSON.parse(result)[key];
    return json;
  }
  *write(
    key: string,
    value: string | number | boolean | object | null | undefined,
  ): Generator<undefined, void, unknown> {
    const result = yield* this.plainHashBlockDataMap.read(key);
    if (result === undefined) return undefined;
    const json = JSON.parse(result)[key];
    return json;
  }
}
