import { WEIGHT_ORIGIN } from "./constants.ts";

const BLOCK_SIZE = 32;
const SLOT_SPACING = 4;
const BLOCKS_PER_SPATIAL_CHUNK = 8;

type Position = [number, number, number];

export function createWeightCoordFn(
  origin: Readonly<Position> = WEIGHT_ORIGIN,
): (index: number) => Position {
  return (index: number): Position => {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError(`Invalid weight chunk index: ${index}`);
    }

    const spatialIndex = Math.floor(index / BLOCKS_PER_SPATIAL_CHUNK);
    const slot = index % BLOCKS_PER_SPATIAL_CHUNK;

    return [
      origin[0] + spatialIndex * BLOCK_SIZE + slot * SLOT_SPACING,
      origin[1],
      origin[2],
    ];
  };
}
