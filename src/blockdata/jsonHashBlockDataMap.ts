import type { EndThisTickStr } from "../eventLoop.ts";
import { PlainHashBlockDataMap } from "./plainHashBlockDataMap.ts";
import type { HashBlockDataMap } from "./types.ts";

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
    EndThisTickStr,
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
  ): Generator<EndThisTickStr, void, unknown> {
    const result = yield* this.plainHashBlockDataMap.read(key);
    const json = result === undefined ? {} : JSON.parse(result);
    json[key] = value;
    yield* this.plainHashBlockDataMap.write(key, JSON.stringify(json));
  }
}
