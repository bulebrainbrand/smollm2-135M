let queue: Iterator<unknown>[] = [];
export const queueGenerator = <T>(iter: Iterator<T>): void => {
  queue.push(iter);
};
const MAX_TIMES = 10;
export const update = () => {
  let count = 0;
  while (!api.isNearInterrupt() && count < MAX_TIMES && queue.length >= 1) {
    count++;
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
