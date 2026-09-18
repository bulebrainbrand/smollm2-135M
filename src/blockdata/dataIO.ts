/// <reference path="../../node_modules/@bloxd/types/globals.d.ts" />

import { END_THIS_TICK_STR, type EndThisTickStr } from "../eventLoop.ts";

export function* readData(
  pos: [number, number, number],
): Generator<EndThisTickStr, string | undefined, unknown> {
  while (!api.isBlockInLoadedChunk(...pos)) {
    api.getBlock(pos);
    yield END_THIS_TICK_STR;
  }
  return api.getBlockData(...pos)?.persisted?.shared?.text;
}

export function* writeData(
  pos: [number, number, number],
  text: string,
): Generator<EndThisTickStr, void, unknown> {
  let block = api.getBlock(pos);
  while (!api.isBlockInLoadedChunk(...pos)) {
    block = api.getBlock(pos);
    yield END_THIS_TICK_STR;
  }
  if (block !== "Code Block") {
    api.setBlock(pos, "Code Block");
  }
  api.setBlockData(...pos, { persisted: { shared: { text } } });
}
