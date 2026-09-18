import type { EndThisTickStr } from "../eventLoop.ts";

export interface HashBlockDataMap<T> {
  read(key: string): Generator<EndThisTickStr, T, unknown>;
  write(key: string, value: T): Generator<EndThisTickStr, void, unknown>;
}
