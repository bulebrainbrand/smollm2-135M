export interface HashBlockDataMap<T> {
  read(key: string): Generator<undefined, T, unknown>;
  write(key: string, value: T): Generator<undefined, void, unknown>;
}
