import { PlainHashBlockDataMap } from "./plainHashBlockDataMap";
import { HashBlockDataMap } from "./types";

export class JSONHashBlockDataMap
  extends PlainHashBlockDataMap
  implements
    HashBlockDataMap<string | number | boolean | object | null | undefined>
{
  override *read(
    key: string,
  ): Generator<
    undefined,
    string | number | boolean | object | null | undefined,
    unknown
  > {
    const result = yield* super.read(key);
    if (result === undefined) return undefined;
    const json = JSON.parse(result)[key];
    return json;
  }
}
