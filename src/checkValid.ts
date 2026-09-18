import { readData } from "./blockdata/dataIO.ts";
import { chunkSize } from "./manifest.ts";
import { createWeightCoordFn } from "./weightCoordFn.ts";

export function* checkValid() {
  const coordFn = createWeightCoordFn();
  let i = 0;
  while (++i < 374 * 8) {
    const pos = coordFn(i);
    const data = yield* readData(pos);
    if (data?.length !== chunkSize) {
      console.log(`invalid ${pos} ${data?.length}`);
    }
  }
}
