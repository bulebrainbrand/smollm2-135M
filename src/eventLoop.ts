let queue: Iterator<unknown>[] = [];
export const queueGenerator = <T>(iter: Iterator<T>): void => {
  queue.unshift(iter);
};
export const update = () => {
  try {
    while (!api.isNearInterrupt() && queue.length >= 1) {
      // A generator can enqueue another generator from inside `next()` (the
      // token callback does this to decode each newly generated token).  Do not
      // assume that the iterator that started at queue[0] is still there when
      // `next()` returns.
      const current = queue[0];
      const result = current.next();
      const currentIndex = queue.indexOf(current);
      if (result.done) {
        if (currentIndex !== -1) queue.splice(currentIndex, 1);
      } else if (result.value === END_THIS_TICK_STR) {
        break;
      }
    }
  } catch (error) {
    console.log(error.stack);
    throw error;
  }
};
export const END_THIS_TICK_STR = "!!end!!";
export type EndThisTickStr = typeof END_THIS_TICK_STR;
