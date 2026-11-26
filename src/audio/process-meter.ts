// How much of the audio thread's time process() takes (whole-car plan, the real-time budget; gearbox plan, stage 3a).
// The worklet times each call and reports the share of the block's time it used, over windows of WINDOW_S. A share
// above COARSE_SHARE for COARSE_WINDOWS windows in a row asks for the coarser step: 32 samples instead of 16.
//
// Which clock: AudioWorkletGlobalScope need not have `performance`. Checked 2026-11-26 on Linux: Chrome 158 and
// Firefox 157 have neither `performance` nor any other sub-millisecond clock there, and Date.now() steps by 1 ms;
// Safari is not checked yet (the owner's list, Q3). So the meter uses performance.now() when the scope has it and the
// mean of Date.now() differences otherwise: a block of 128 samples lasts 2.7 ms at 48 kHz, so one difference says
// nothing, but with the call's start at a random phase of the millisecond the mean over a window of ~375 blocks is
// the true mean time (the 'date-average' method). The main thread adds its own check, the audio clock against the wall
// clock (Drive's audioLag), which catches lost blocks whatever the worklet's clock.
//
// No DOM, no Web Audio: the tests drive it with a fake clock.

/** How the share was measured; 'lateness' is the main thread's check alone, for a scope without any clock. */
export type LoadMethod = 'performance' | 'date-average' | 'lateness';

/** Seconds of audio a share is averaged over. */
export const WINDOW_S = 1;
/** Above this share of the block's time the step goes coarse, once it has held for COARSE_WINDOWS windows. */
export const COARSE_SHARE = 0.5;
export const COARSE_WINDOWS = 2;

export interface MeterClock {
  method: LoadMethod;
  /** Milliseconds. */
  now(): number;
}

/** The best clock a scope has: performance.now() if there is one, else Date.now(). */
export function scopeClock(scope: { performance?: { now?: () => number } } = globalThis as never): MeterClock {
  const perf = scope.performance;
  if (perf && typeof perf.now === 'function') return { method: 'performance', now: () => perf.now!() };
  return { method: 'date-average', now: () => Date.now() };
}

export class ProcessMeter {
  readonly method: LoadMethod;
  private readonly clock: () => number;
  private readonly windowFrames: number;
  private readonly sampleRate: number;
  private started = 0;
  private busyMs = 0;
  private frames = 0;
  /** Windows in a row above COARSE_SHARE. */
  private over = 0;
  /** Share of the block's time process() took over the last whole window, 0 until the first one ends. */
  share = 0;
  /** The highest share of a window so far. */
  peak = 0;

  constructor(clock: MeterClock, sampleRate: number) {
    this.method = clock.method;
    this.clock = clock.now;
    this.sampleRate = sampleRate;
    this.windowFrames = Math.round(WINDOW_S * sampleRate);
  }

  /** At the start of process(). */
  begin(): void {
    this.started = this.clock();
  }

  /** At the end of process(), which rendered `frames` samples. */
  end(frames: number): void {
    this.busyMs += this.clock() - this.started;
    this.frames += frames;
    if (this.frames < this.windowFrames) return;
    const share = this.busyMs / ((this.frames / this.sampleRate) * 1000);
    this.share = share;
    this.peak = Math.max(this.peak, share);
    this.over = share > COARSE_SHARE ? this.over + 1 : 0;
    this.busyMs = 0;
    this.frames = 0;
  }

  /** The share has stayed above COARSE_SHARE for COARSE_WINDOWS windows in a row. */
  get wantsCoarse(): boolean {
    return this.over >= COARSE_WINDOWS;
  }
}
