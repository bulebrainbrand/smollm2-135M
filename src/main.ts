import { JSONHashBlockDataMap } from "./blockdata/jsonHashBlockDataMap.ts";
import { PlainHashBlockDataMap } from "./blockdata/plainHashBlockDataMap.ts";
import {
  KeySafe32JSONHashBlockDataMap,
  ValueSafe32JSONHashBlockDataMap,
} from "./blockdata/safe32JSONHashBlockDataMap.ts";
import type { HashBlockDataMap } from "./blockdata/types.ts";
import {
  DECODE_DATA_POS,
  ENCODE_DATA_POS,
  MERGE_DATA_POS,
} from "./constants.ts";
// @ts-expect-error
export const encodeData: HashBlockDataMap<number | undefined> =
  new KeySafe32JSONHashBlockDataMap(
    new JSONHashBlockDataMap(
      new PlainHashBlockDataMap(ENCODE_DATA_POS.pos1, ENCODE_DATA_POS.pos2),
    ),
  );

export const decodeData: HashBlockDataMap<string | undefined> =
  new ValueSafe32JSONHashBlockDataMap(
    new JSONHashBlockDataMap(
      new PlainHashBlockDataMap(DECODE_DATA_POS.pos1, DECODE_DATA_POS.pos2),
    ),
  );
// @ts-expect-error
export const mergesData: HashBlockDataMap<number | undefined> =
  new KeySafe32JSONHashBlockDataMap(
    new JSONHashBlockDataMap(
      new PlainHashBlockDataMap(MERGE_DATA_POS.pos1, MERGE_DATA_POS.pos2),
    ),
  );
