import { PlainHashBlockDataMap } from "./plainHashBlockDataMap";
import { HashBlockDataMap } from "./types";

export class JSONHashBlockDataMap implements HashBlockDataMap<
  string | number | boolean | object | null | undefined
> {
  constructor(private readonly plainHashBlockDataMap: PlainHashBlockDataMap) {}
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
}
