export interface HashBlockDataMap<T> {
  read(key: string): Generator<undefined, T, unknown>;
}
