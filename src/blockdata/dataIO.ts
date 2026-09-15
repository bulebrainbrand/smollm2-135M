/// <reference path="../../node_modules/@bloxd/types/globals.d.ts" />

export function* readData(
  pos: [number, number, number],
): Generator<undefined, string | undefined, unknown> {
  while (!api.isBlockInLoadedChunk(...pos)) {
    yield void api.getBlock(pos);
  }
  return api.getBlockData(...pos)?.persisted?.shared?.text;
}

export function* writeData(
  pos: [number, number, number],
  text: string,
): Generator<undefined, void, unknown> {
  let block = api.getBlock(pos);
  while (!api.isBlockInLoadedChunk(...pos)) {
    block = api.getBlock(pos);
    yield;
  }
  if (block !== "Code Block") {
    api.setBlock(pos, "Code Block");
  }
  api.setBlockData(...pos, { persisted: { shared: { text } } });
}
