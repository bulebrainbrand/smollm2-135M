/// <reference types="@types/node" />

import {
  type LongestSchemaObject,
  type LongestNormailedSchema,
  LongestSchema,
  calcBlocksIndex,
  splitSchematicByAxis,
} from "@bloxdjs/schematic";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  hash,
  hashNumberToPos,
} from "../src/blockdata/plainHashBlockDataMap.ts";
import { encode as encodeSafe32 } from "../src/safe32/index.ts";
import { encode as encodeUnicode } from "../src/tokenizer/encode.ts";

const recordToBuffer = (
  record: Record<string, unknown>,
  name: string,
  size: [number, number, number],
): Buffer[] => {
  const schem: LongestNormailedSchema = {
    name,
    size,
    pos: [0, 0, 0],
    chunks: [],
    blockdatas: [],
    globalPosition: [0, 0, 0],
  };
  for (let x = 0; x < Math.ceil(size[0] / 32); x++) {
    for (let y = 0; y < Math.ceil(size[1] / 32); y++) {
      for (let z = 0; z < Math.ceil(size[2] / 32); z++) {
        schem.chunks.push({
          pos: [x, y, z],
          blocks: Array(32 * 32 * 32).fill(0),
        });
      }
    }
  }
  const hashs = new Map<
    `${number}|${number}|${number}`,
    Record<string, unknown>
  >();
  for (const [key, value] of Object.entries(record)) {
    const hashNumber = hash(key);
    const [x, y, z] = hashNumberToPos(hashNumber, ...size);
    if (hashs.has(`${x}|${y}|${z}`)) {
      hashs.get(`${x}|${y}|${z}`)![key] = value;
    } else {
      hashs.set(`${x}|${y}|${z}`, { [key]: value });
    }
  }
  for (const [id, record] of hashs) {
    const [x, y, z] = id.split("|").map(Number) as [number, number, number];
    const chunkX = Math.floor(x / 32);
    const chunkY = Math.floor(y / 32);
    const chunkZ = Math.floor(z / 32);
    const chunk = schem.chunks.find(
      ({ pos: [x, y, z] }) => x === chunkX && y === chunkY && z === chunkZ,
    );
    if (!chunk) throw new Error("not found");
    chunk.blocks[calcBlocksIndex(x % 32, y % 32, z % 32)] = 1510;
    schem.blockdatas.push({
      blockX: x,
      blockY: y,
      blockZ: z,
      blockdataStr: createBlockDataStr(JSON.stringify(record)),
    });
  }
  return splitSchematicByAxis(schem, 32, "x")
    .map(LongestSchema.normalizedSchemaToSchemaObject)
    .map(LongestSchema.schemaObjectToBuffer);
};

const createBlockDataStr = (str: string) => {
  return JSON.stringify({
    persisted: {
      shared: {
        text: str,
        uncensoredText: str,
        textSize: 0,
      },
      author: "ZlzvebAKbQPWuyiA8_08q",
      builder: "ZlzvebAKbQPWuyiA8_08q",
      builderCanEditCode: true,
    },
  });
};

const json = JSON.parse(
  readFileSync("./model/tokenizer.json", { encoding: "utf-8" }).toString(),
);
const vocab: Record<string, number> = json.model.vocab;

const merges: string[] = json.model.merges;

const decode = Object.fromEntries(
  Object.entries(vocab)
    .map(([key, value]): [number, string] => [value, key])
    .map(([_, key]): [number, string] => [
      _,
      encodeSafe32(encodeUnicode(String(key))),
    ]),
);
const encode = Object.fromEntries(
  Object.entries(vocab).map(([key, _]): [string, number] => [
    encodeSafe32(encodeUnicode(String(key))),
    _,
  ]),
);

const mergesRecord = Object.fromEntries(
  merges
    .entries()
    .map(([key, value]) => [encodeSafe32(encodeUnicode(value)), key]),
);

mkdirSync("./schematics", { recursive: true });
// Record<number,safe32>
recordToBuffer(decode, "decode", [32 * 8, 32 * 8, 32 * 8]).forEach(
  (buffer, i) => writeFileSync(`./schematics/decode_${i}.bloxdschem`, buffer),
);
// Record<safe32,number>
recordToBuffer(encode, "encode", [32 * 8, 32 * 8, 32 * 8]).forEach(
  (buffer, i) => writeFileSync(`./schematics/encode_${i}.bloxdschem`, buffer),
);
// Record<safe32,number>
recordToBuffer(mergesRecord, "merges", [32 * 8, 32 * 8, 32 * 8]).forEach(
  (buffer, i) => writeFileSync(`./schematics/merges_${i}.bloxdschem`, buffer),
);
