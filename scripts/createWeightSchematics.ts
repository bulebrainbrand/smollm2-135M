/// <reference types="@types/node" />

import {
  type LongestNormailedSchema,
  LongestSchema,
  calcBlocksIndex,
  splitSchematicByAxis,
} from "@bloxdjs/schematic";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const INPUT_PATH = "./out/weights_safe32.txt";
const OUTPUT_DIR = "./schematics";
const CODE_BLOCK_ID = 1510;
const CODE_BLOCK_CHARS = 16000;
const BLOCKS_PER_SPATIAL_CHUNK = 8;
const SLOT_SPACING = 4;

const createBlockDataStr = (text: string) =>
  JSON.stringify({
    persisted: {
      shared: {
        text,
        uncensoredText: text,
        textSize: 0,
      },
      author: "ZlzvebAKbQPWuyiA8_08q",
      builder: "ZlzvebAKbQPWuyiA8_08q",
      builderCanEditCode: true,
    },
  });

const encoded = readFileSync(INPUT_PATH, { encoding: "utf8" });
if (encoded.length === 0) {
  throw new Error(`${INPUT_PATH} is empty`);
}

const codeBlockCount = Math.ceil(encoded.length / CODE_BLOCK_CHARS);
const spatialChunkCount = Math.ceil(codeBlockCount / BLOCKS_PER_SPATIAL_CHUNK);
const size: [number, number, number] = [spatialChunkCount * 32, 32, 32];

const chunks = [];
for (let x = 0; x < spatialChunkCount; x++) {
  chunks.push({
    pos: [x, 0, 0] as [number, number, number],
    blocks: Array(32 * 32 * 32).fill(0),
  });
}

const blockdatas: LongestNormailedSchema["blockdatas"] = [];
for (let index = 0; index < codeBlockCount; index++) {
  const spatialIndex = Math.floor(index / BLOCKS_PER_SPATIAL_CHUNK);
  const slot = index % BLOCKS_PER_SPATIAL_CHUNK;
  const x = spatialIndex * 32 + slot * SLOT_SPACING;
  const chunk = chunks[spatialIndex];

  chunk.blocks[calcBlocksIndex(slot * SLOT_SPACING, 0, 0)] = CODE_BLOCK_ID;
  blockdatas.push({
    blockX: x,
    blockY: 0,
    blockZ: 0,
    blockdataStr: createBlockDataStr(
      encoded.slice(index * CODE_BLOCK_CHARS, (index + 1) * CODE_BLOCK_CHARS),
    ),
  });
}

const schematic: LongestNormailedSchema = {
  name: "weights",
  size,
  pos: [0, 0, 0],
  chunks,
  blockdatas,
  globalPosition: [0, 0, 0],
};

mkdirSync(OUTPUT_DIR, { recursive: true });
splitSchematicByAxis(schematic, 32 * 5, "x")
  .map((schem, i) => {
    schem.chunks.find(
      (chunk) => chunk.pos[0] === 0 && chunk.pos[1] === 0 && chunk.pos[2] === 0,
    )!.blocks[calcBlocksIndex(0, 0, 31)] = CODE_BLOCK_ID;
    schem.blockdatas.push({
      blockX: 0,
      blockY: 0,
      blockZ: 31,
      blockdataStr: createBlockDataStr(`${i}`),
    });
    return schem;
  })
  .map(LongestSchema.normalizedSchemaToSchemaObject)
  .map(LongestSchema.schemaObjectToBuffer)
  .forEach((buffer, index) => {
    const suffix = String(index).padStart(3, "0");
    writeFileSync(`${OUTPUT_DIR}/weights_${suffix}.bloxdschem`, buffer);
  });
