import { JSONHashBlockDataMap } from "./blockdata/jsonHashBlockDataMap";
import { PlainHashBlockDataMap } from "./blockdata/plainHashBlockDataMap";
import {
  KeySafe32JSONHashBlockDataMap,
  ValueSafe32JSONHashBlockDataMap,
} from "./blockdata/safe32JSONHashBlockDataMap";
import { BPETokenizer } from "./tokenizer/tokenizer";

const tokenizer = new BPETokenizer(
  // @ts-expect-error numberしか返さないと約束しよう
  new KeySafe32JSONHashBlockDataMap(
    new JSONHashBlockDataMap(new PlainHashBlockDataMap([0, 0, 0], [0, 0, 0])),
  ),
  new ValueSafe32JSONHashBlockDataMap(
    new JSONHashBlockDataMap(new PlainHashBlockDataMap([0, 0, 0], [0, 0, 0])),
  ),
  new KeySafe32JSONHashBlockDataMap(
    new JSONHashBlockDataMap(new PlainHashBlockDataMap([0, 0, 0], [0, 0, 0])),
  ),
);
