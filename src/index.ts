import { ByteCursor } from "./byte_cursur.ts";
import { queueGenerator, update } from "./eventLoop.ts";
import { decodeData, encodeData, mergesData } from "./main.ts";
import { chunkSize, modelConfig, modelWeight } from "./manifest.ts";
import { BPETokenizer } from "./tokenizer/tokenizer.ts";
import { createWeightCoordFn } from "./weightCoordFn.ts";
import { generate } from "./think.ts";
import { checkValid } from "./checkValid.ts";
tick = () => {
  update();
};

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
queueGenerator(
  (function* () {
    //  yield* checkValid();
  })(),
);
const cursor = new ByteCursor(chunkSize, createWeightCoordFn());
// @ts-expect-error
globalThis.queue = queueGenerator;
// @ts-expect-error
globalThis.tokenizer = tokenizer;
// @ts-expect-error
globalThis.generate = generate;
// @ts-expect-error
globalThis.cursor = cursor;
// @ts-expect-error
globalThis.modelWeight = modelWeight;
// @ts-expect-error
globalThis.modelConfig = modelConfig;

onPlayerClick = (id) => {
  if (api.getHeldItem(id)?.name !== "Stick") return;
  const pos = api.getPosition(id);
  const chunk = api.blockCoordToChunkId(pos);
  const [x, y, z] = api.chunkIdToBotLeftCoord(chunk);
  api.setPosition(id, x + 32 * 5 + 0.5, 1, 0);
  console.log((x + 32 * 5 - 96) / 32 / 5);
  if (
    api.getBlockData(x, y + 1, z + 31).persisted.shared.text !==
    String((x - 96) / 32 / 5)
  ) {
    console.log(
      `error! \nexpect: ${(x - 96) / 32 / 5}\nactual: ${api.getBlockData(x, y + 1, z + 31).persisted.shared.text}`,
    );
  }
};

globalThis.think = () =>
  queueGenerator(
    generate(cursor, modelWeight, modelConfig, [28120], 5, 2, (a) => {
      queueGenerator(
        (function* () {
          const text = yield* tokenizer.decode(a);
          console.log(text);
        })(),
      );
    }),
  );
