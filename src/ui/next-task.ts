// The next task of the event loop for work done in slices.

/**
 * Runs `fn` as the next task without a timer's clamp: browsers stretch setTimeout(0) to a second in a tab that isn't
 * focused, which would stall the lap's slices. A message to ourselves is not a timer.
 */
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const queue: Array<() => void> = [];
if (channel) channel.port1.onmessage = () => queue.shift()?.();
export const nextTask = (fn: () => void): void => {
  if (!channel) {
    setTimeout(fn, 0);
    return;
  }
  queue.push(fn);
  channel.port2.postMessage(0);
};
