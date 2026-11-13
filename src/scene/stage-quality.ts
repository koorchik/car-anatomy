// How sharp the stage draws: a machine that cannot keep up gets fewer pixels, and gets them back once it can (the plan
// of the whole car, «Stage для всіх розділів», change 7). No DOM: the stage feeds it each drawn frame's time, and
// tests/stage.test.ts plays frames through it. A frozen page (a snapshot) does not feed it, so its quality stands.

/** The resolution as a share of the device's: from the best down to the least, a step at a time. */
export const QUALITY_BEST = 1;
export const QUALITY_LEAST = 0.6;
export const QUALITY_STEP = 0.2;
/** A frame slower than this counts against the machine. */
export const SLOW_FRAME_S = 1 / 28;
/** Slow frames, net of the quicker ones, before the resolution drops a step. */
export const SLOW_FRAMES_TO_DROP = 45;
/** A frame at least this quick counts toward a step back: well inside the slow mark, so the step it costs fits. */
export const FAST_FRAME_S = 1 / 45;
/** Seconds of quick frames, with no slower one between, before the resolution comes back a step. */
export const FAST_SECONDS_TO_RAISE = 10;
/** A drop this soon after a raise means the raise did not fit: the next one waits twice as long. */
const RETRACTED_WITHIN_S = 30;
const LONGEST_WAIT_S = 160;

/** Tenths, so that steps of 0.2 land on 0.8 and 0.6 and not a hair beside them. */
const tenths = (x: number): number => Math.round(x * 10) / 10;

export class QualityGovernor {
  /** The resolution now, as a share of the device's. */
  scale = QUALITY_BEST;
  private slowFrames = 0;
  private fastFor = 0;
  private wait = FAST_SECONDS_TO_RAISE;
  /** Seconds of frames since the last raise; Infinity before the first. */
  private sinceRaise = Number.POSITIVE_INFINITY;

  /**
   * One drawn frame that took `dt` seconds. True when the scale changed. A drop needs SLOW_FRAMES_TO_DROP more slow
   * frames than quick ones, as it always has; a raise needs FAST_SECONDS_TO_RAISE of quick frames in a row.
   */
  frame(dt: number): boolean {
    this.sinceRaise += dt;
    if (dt > SLOW_FRAME_S) {
      this.fastFor = 0;
      this.slowFrames++;
      if (this.slowFrames > SLOW_FRAMES_TO_DROP && this.scale > QUALITY_LEAST) {
        this.scale = Math.max(QUALITY_LEAST, tenths(this.scale - QUALITY_STEP));
        this.slowFrames = 0;
        if (this.sinceRaise < RETRACTED_WITHIN_S) this.wait = Math.min(LONGEST_WAIT_S, this.wait * 2);
        return true;
      }
      return false;
    }
    if (this.slowFrames > 0) this.slowFrames--;
    if (dt > FAST_FRAME_S) {
      this.fastFor = 0;
      return false;
    }
    this.fastFor += dt;
    if (this.scale < QUALITY_BEST && this.fastFor >= this.wait) {
      this.scale = Math.min(QUALITY_BEST, tenths(this.scale + QUALITY_STEP));
      this.fastFor = 0;
      this.slowFrames = 0;
      this.sinceRaise = 0;
      return true;
    }
    return false;
  }

  /** Sets the scale outright, such as for a snapshot; the counting starts over. */
  set(scale: number): void {
    this.scale = scale;
    this.slowFrames = 0;
    this.fastFor = 0;
  }
}
