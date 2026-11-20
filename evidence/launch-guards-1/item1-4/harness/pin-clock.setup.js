'use strict';
const pin = process.env.PIN_CLOCK;
if (pin) {
  jest.useFakeTimers({
    now: new Date(pin),
    advanceTimers: true,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
  });
}
