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
  while (!api.isBlockInLoadedChunk(...pos)) {
    yield void api.getBlock(pos);
  }
  api.setBlockData(...pos, { persisted: { shared: { text } } });
}
