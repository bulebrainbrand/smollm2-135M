import { decode as decodeSafe32, encode as encodeSafe32 } from "../safe32";
import { decode as decodeUnicode } from "../tokenizer/decode";
import { encode as encodeUnicode } from "../tokenizer/encode";
import { JSONHashBlockDataMap } from "./jsonHashBlockDataMap";
import { HashBlockDataMap } from "./types";
/**
 * keyのunicodeをsafe32エンコードし、それでデータを引き、その結果をsafe32decodeする
 */
export class Safe32JSONHashBlockDataMap implements HashBlockDataMap<
  string | undefined
> {
  constructor(private readonly JSONHashBlockDataMap: JSONHashBlockDataMap) {}
  *read(key: string): Generator<undefined, string | undefined, unknown> {
    const safe32Key = encodeSafe32(encodeUnicode(key));
    const result = yield* this.JSONHashBlockDataMap.read(safe32Key);
    if (result === undefined) return undefined;
    if (typeof result !== "string")
      throw new TypeError(
        "Safe32JSONHashBlockMap.read can't parse non-string value",
      );
    return decodeUnicode(decodeSafe32(result));
  }
}

export class KeySafe32JSONHashBlockDataMap implements HashBlockDataMap<
  string | number | boolean | object | null | undefined
> {
  constructor(private readonly JSONHashBlockDataMap: JSONHashBlockDataMap) {}
  *read(
    key: string,
  ): Generator<
    undefined,
    string | number | boolean | object | null | undefined,
    unknown
  > {
    const safe32Key = encodeSafe32(encodeUnicode(key));
    const result = yield* this.JSONHashBlockDataMap.read(safe32Key);
    return result;
  }
}

export class ValueSafe32JSONHashBlockDataMap implements HashBlockDataMap<
  string | undefined
> {
  constructor(private readonly JSONHashBlockDataMap: JSONHashBlockDataMap) {}
  *read(key: string): Generator<undefined, string | undefined, unknown> {
    const result = yield* this.JSONHashBlockDataMap.read(key);
    if (result === undefined) return undefined;
    if (typeof result !== "string")
      throw new TypeError(
        "ValueSafe32JSONHashBlockMap.read can't parse non-string value",
      );
    return decodeUnicode(decodeSafe32(result));
  }
}
