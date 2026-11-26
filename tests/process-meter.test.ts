// The audio thread's clock of its own time (process-meter.ts, whole-car plan «Бюджет реального часу»): which clock a scope
// gives, the share over a window, the mean of a millisecond clock being the true mean, and when the step goes coarse.

import { describe, expect, it } from 'vitest';
import { COARSE_WINDOWS, ProcessMeter, scopeClock, WINDOW_S } from '../src/audio/process-meter.ts';

const FS = 48000;
const BLOCK = 128;

/** A meter on a fake clock, and a process() that takes `ms` of it, starting up to 0.4 ms late (the thread's jitter). */
function fake(method: 'performance' | 'date-average', quantum = 0) {
  let now = 1000;
  let seed = 12345;
  const jitter = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648) * 0.4;
  };
  const meter = new ProcessMeter({ method, now: () => (quantum ? Math.floor(now / quantum) * quantum : now) }, FS);
  const run = (ms: number) => {
    const late = quantum ? jitter() : 0;
    now += late;
    meter.begin();
    now += ms;
    meter.end(BLOCK);
    // The rest of the block's time passes outside process().
    now += (BLOCK / FS) * 1000 - ms - late;
  };
  return { meter, run };
}

describe('process() meter', () => {
  it('times with performance.now() where the scope has it, else with Date.now()', () => {
    expect(scopeClock({ performance: { now: () => 1 } }).method).toBe('performance');
    expect(scopeClock({}).method).toBe('date-average');
    // AudioWorkletGlobalScope in Chrome 158 and Firefox 157 has no performance (checked 2026-11-26).
    expect(scopeClock({ performance: undefined }).method).toBe('date-average');
  });

  it('gives the share of the block time process() took over each window, and nothing before the first one ends', () => {
    const { meter, run } = fake('performance');
    const blocks = Math.ceil((WINDOW_S * FS) / BLOCK);
    for (let i = 0; i < blocks - 1; i++) run(0.8);
    expect(meter.share).toBe(0);
    run(0.8);
    expect(meter.share).toBeCloseTo(0.8 / ((BLOCK / FS) * 1000), 6);
  });

  it('the mean of a 1 ms clock is the true share, to 0.02, though no block is timed right: the start jitters', () => {
    for (const ms of [0.27, 0.9, 1.6]) {
      const { meter, run } = fake('date-average', 1);
      for (let i = 0; i < 2 * Math.ceil(FS / BLOCK); i++) run(ms);
      expect(Math.abs(meter.share - ms / ((BLOCK / FS) * 1000)), `${ms} ms`).toBeLessThan(0.02);
    }
  });

  it('asks for the coarse step only after the share has stayed above half for two windows running', () => {
    const { meter, run } = fake('performance');
    const window = Math.ceil((WINDOW_S * FS) / BLOCK);
    const heavy = 0.6 * (BLOCK / FS) * 1000;
    for (let i = 0; i < window; i++) run(heavy);
    expect(meter.wantsCoarse).toBe(false);
    // A light window between resets the count.
    for (let i = 0; i < window; i++) run(0.1);
    for (let i = 0; i < window; i++) run(heavy);
    expect(meter.wantsCoarse).toBe(false);
    for (let w = 1; w < COARSE_WINDOWS; w++) for (let i = 0; i < window; i++) run(heavy);
    expect(meter.wantsCoarse).toBe(true);
    expect(meter.peak).toBeCloseTo(0.6, 2);
  });
});
