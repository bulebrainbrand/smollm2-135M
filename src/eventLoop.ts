let queue: Iterator<unknown>[] = [];
export const queueGenerator = <T>(iter: Iterator<T>): void => {
  queue.unshift(iter);
};
export const update = () => {
  while (!api.isNearInterrupt() && queue.length >= 1) {
    const result = queue[0].next();
    if (result.done) {
      queue.shift();
    } else if (result.value === END_THIS_TICK_STR) {
      break;
    }
  }
};
export const END_THIS_TICK_STR = "!!end!!";
export type EndThisTickStr = typeof END_THIS_TICK_STR;
