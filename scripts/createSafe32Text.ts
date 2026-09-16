/// <reference types="@types/node" />

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { encode as encodeSafe32 } from "../src/safe32/index.ts";

const INPUT_PATH = "./out/weights_int8.bin";
const OUTPUT_PATH = "./out/weights_safe32.txt";

const rawBytes = readFileSync(INPUT_PATH);
const encoded = encodeSafe32(rawBytes);

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, encoded, { encoding: "ascii" });

console.log(
  `safe32 text written: ${OUTPUT_PATH} ` +
    `(${rawBytes.byteLength.toLocaleString()} raw bytes -> ` +
    `${encoded.length.toLocaleString()} characters)`,
);
