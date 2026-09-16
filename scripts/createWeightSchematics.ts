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
const CODE_BLOCK_CHARS = 24_000;
const SPATIAL_CHUNK_CHARS = 100 * 1024;
const SPATIAL_CHUNKS_Y = 8;
const SPATIAL_CHUNKS_Z = 8;
const BLOCKS_PER_SPATIAL_CHUNK = Math.ceil(
  SPATIAL_CHUNK_CHARS / CODE_BLOCK_CHARS,
);

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

const chunkKey = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

const countCodeBlocks = (encodedLength: number) => {
  const completeSpatialChunks = Math.floor(
    encodedLength / SPATIAL_CHUNK_CHARS,
  );
  const remainder = encodedLength % SPATIAL_CHUNK_CHARS;
  return (
    completeSpatialChunks * BLOCKS_PER_SPATIAL_CHUNK +
    (remainder === 0
      ? 0
      : Math.ceil(remainder / CODE_BLOCK_CHARS))
  );
};

const getChunkText = (encoded: string, index: number) => {
  const spatialIndex = Math.floor(index / BLOCKS_PER_SPATIAL_CHUNK);
  const slot = index % BLOCKS_PER_SPATIAL_CHUNK;
  const spatialStart = spatialIndex * SPATIAL_CHUNK_CHARS;
  const start = spatialStart + slot * CODE_BLOCK_CHARS;
  const end = Math.min(
    start + CODE_BLOCK_CHARS,
    spatialStart + SPATIAL_CHUNK_CHARS,
    encoded.length,
  );
  return encoded.slice(start, end);
};

const encoded = readFileSync(INPUT_PATH, { encoding: "utf8" });
if (encoded.length === 0) {
  throw new Error(`${INPUT_PATH} is empty`);
}
for (const ch of encoded) {
  const code = ch.charCodeAt(0);
  if (code < 0x21 || code > 0x40) {
    throw new Error(`Invalid safe32 character in ${INPUT_PATH}: ${JSON.stringify(ch)}`);
  }
}

const codeBlockCount = countCodeBlocks(encoded.length);
const spatialChunkCount = Math.ceil(
  encoded.length / SPATIAL_CHUNK_CHARS,
);
const chunksX = Math.max(
  1,
  Math.ceil(
    spatialChunkCount / (SPATIAL_CHUNKS_Y * SPATIAL_CHUNKS_Z),
  ),
);
const size: [number, number, number] = [
  chunksX * 32,
  SPATIAL_CHUNKS_Y * 32,
  SPATIAL_CHUNKS_Z * 32,
];

const chunks = [];
const chunkMap = new Map<
  string,
  { pos: [number, number, number]; blocks: number[] }
>();
for (let x = 0; x < chunksX; x++) {
  for (let y = 0; y < SPATIAL_CHUNKS_Y; y++) {
    for (let z = 0; z < SPATIAL_CHUNKS_Z; z++) {
      const chunk = {
        pos: [x, y, z] as [number, number, number],
        blocks: Array(32 * 32 * 32).fill(0),
      };
      chunks.push(chunk);
      chunkMap.set(chunkKey(x, y, z), chunk);
    }
  }
}

const blockdatas: LongestNormailedSchema["blockdatas"] = [];
for (let index = 0; index < codeBlockCount; index++) {
  const spatialIndex = Math.floor(index / BLOCKS_PER_SPATIAL_CHUNK);
  const slot = index % BLOCKS_PER_SPATIAL_CHUNK;
  const chunkX = spatialIndex % chunksX;
  const chunkY = Math.floor(spatialIndex / chunksX) % SPATIAL_CHUNKS_Y;
  const chunkZ = Math.floor(
    spatialIndex / (chunksX * SPATIAL_CHUNKS_Y),
  );
  const x = chunkX * 32 + slot;
  const y = chunkY * 32;
  const z = chunkZ * 32;
  const chunk = chunkMap.get(chunkKey(chunkX, chunkY, chunkZ));
  if (!chunk) {
    throw new Error(`Missing schematic chunk for ${chunkX},${chunkY},${chunkZ}`);
  }

  chunk.blocks[calcBlocksIndex(slot, 0, 0)] = CODE_BLOCK_ID;
  blockdatas.push({
    blockX: x,
    blockY: y,
    blockZ: z,
    blockdataStr: createBlockDataStr(getChunkText(encoded, index)),
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
splitSchematicByAxis(schematic, 32, "x")
  .map(LongestSchema.normalizedSchemaToSchemaObject)
  .map(LongestSchema.schemaObjectToBuffer)
  .forEach((buffer, index) => {
    const suffix = String(index).padStart(3, "0");
    writeFileSync(`${OUTPUT_DIR}/weights_${suffix}.bloxdschem`, buffer);
  });
