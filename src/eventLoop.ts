let queue: Iterator<unknown>[] = [];
export const queueGenerator = <T>(iter: Iterator<T>): void => {
  queue.push(iter);
};
const MAX_TIMES = 20;
export const update = () => {
  let count = 0;
  while (!api.isNearInterrupt() && count < MAX_TIMES && queue.length >= 1) {
    count++;
    const result = queue[0].next();
    if (result.done) {
      queue.shift();
    }
  }
};
