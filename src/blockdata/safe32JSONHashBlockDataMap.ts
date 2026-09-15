import {
  decode as decodeSafe32,
  encode as encodeSafe32,
} from "../safe32/index.ts";
import { decode as decodeUnicode } from "../tokenizer/decode.ts";
import { encode as encodeUnicode } from "../tokenizer/encode.ts";
import { JSONHashBlockDataMap } from "./jsonHashBlockDataMap.ts";
import type { HashBlockDataMap } from "./types.ts";
/**
 * keyのunicodeをsafe32エンコードし、それでデータを引き、その結果をsafe32decodeする
 */
export class Safe32JSONHashBlockDataMap implements HashBlockDataMap<
  string | undefined
> {
  private readonly JSONHashBlockDataMap: JSONHashBlockDataMap;
  constructor(JSONHashBlockDataMap: JSONHashBlockDataMap) {
    this.JSONHashBlockDataMap = JSONHashBlockDataMap;
  }
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
  *write(
    key: string,
    value: string | undefined,
  ): Generator<undefined, void, unknown> {
    const safe32Key = encodeSafe32(encodeUnicode(key));
    const safe32Value =
      value === undefined ? undefined : encodeSafe32(encodeUnicode(value));
    yield* this.JSONHashBlockDataMap.write(safe32Key, safe32Value);
  }
}

export class KeySafe32JSONHashBlockDataMap implements HashBlockDataMap<
  string | number | boolean | object | null | undefined
> {
  private readonly JSONHashBlockDataMap: JSONHashBlockDataMap;
  constructor(JSONHashBlockDataMap: JSONHashBlockDataMap) {
    this.JSONHashBlockDataMap = JSONHashBlockDataMap;
  }
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
  *write(
    key: string,
    value: string | number | boolean | object | null | undefined,
  ): Generator<undefined, void, unknown> {
    const safe32Key = encodeSafe32(encodeUnicode(key));
    yield* this.JSONHashBlockDataMap.write(safe32Key, value);
  }
}

export class ValueSafe32JSONHashBlockDataMap implements HashBlockDataMap<
  string | undefined
> {
  private readonly JSONHashBlockDataMap: JSONHashBlockDataMap;
  constructor(JSONHashBlockDataMap: JSONHashBlockDataMap) {
    this.JSONHashBlockDataMap = JSONHashBlockDataMap;
  }
  *read(key: string): Generator<undefined, string | undefined, unknown> {
    const result = yield* this.JSONHashBlockDataMap.read(key);
    if (result === undefined) return undefined;
    if (typeof result !== "string")
      throw new TypeError(
        "ValueSafe32JSONHashBlockMap.read can't parse non-string value",
      );
    return decodeUnicode(decodeSafe32(result));
  }
  *write(
    key: string,
    value: string | undefined,
  ): Generator<undefined, void, unknown> {
    const safe32Value =
      value === undefined ? undefined : encodeSafe32(encodeUnicode(value));
    yield* this.JSONHashBlockDataMap.write(key, safe32Value);
  }
}
