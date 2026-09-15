import { JSONHashBlockDataMap } from "./blockdata/jsonHashBlockDataMap.ts";
import { PlainHashBlockDataMap } from "./blockdata/plainHashBlockDataMap.ts";
import {
  KeySafe32JSONHashBlockDataMap,
  ValueSafe32JSONHashBlockDataMap,
} from "./blockdata/safe32JSONHashBlockDataMap.ts";
import { queueGenerator, update } from "./eventLoop.ts";
import { decodeData, encodeData, mergesData } from "./main.ts";
import { data } from "./temp/data.ts";
import { BPETokenizer } from "./tokenizer/tokenizer.ts";
tick = () => {
  update();
};

queueGenerator(
  (function* () {
    let c = 0;
    for (const key of Object.keys(data)) {
      if (c++ % 100 === 0) console.log(c);
      const value = data[key];
      yield* encodeData.write(key, value);
      yield* decodeData.write(String(value), key);
    }
    for (let i = 0; i < 20; i++) {
      yield;
    }
  })(),
);

const tokenizer = new BPETokenizer(encodeData, decodeData, mergesData, [
  {
    id: 0,
    content: "<|endoftext|>",
  },
  {
    id: 1,
    content: "<|im_start|>",
  },
  {
    id: 2,
    content: "<|im_end|>",
  },
  {
    id: 3,
    content: "<repo_name>",
  },
  {
    id: 4,
    content: "<reponame>",
  },
  {
    id: 5,
    content: "<file_sep>",
  },
  {
    id: 6,
    content: "<filename>",
  },
  {
    id: 7,
    content: "<gh_stars>",
  },
  {
    id: 8,
    content: "<issue_start>",
  },
  {
    id: 9,
    content: "<issue_comment>",
  },
  {
    id: 10,
    content: "<issue_closed>",
  },
  {
    id: 11,
    content: "<jupyter_start>",
  },
  {
    id: 12,
    content: "<jupyter_text>",
  },
  {
    id: 13,
    content: "<jupyter_code>",
  },
  {
    id: 14,
    content: "<jupyter_output>",
  },
  {
    id: 15,
    content: "<jupyter_script>",
  },
  {
    id: 16,
    content: "<empty_output>",
  },
]);
