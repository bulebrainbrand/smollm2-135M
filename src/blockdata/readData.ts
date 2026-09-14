/// <reference path="../../node_modules/@bloxd/types/globals.d.ts" />

export function* readData(
  pos: [number, number, number],
): Generator<undefined, string | undefined, unknown> {
  while (!api.isBlockInLoadedChunk(...pos)) {
    yield void api.getBlock(pos);
  }
  return api.getBlockData(...pos)?.persisted?.shared?.text;
}
