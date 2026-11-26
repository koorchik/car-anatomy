// Work done in pieces inside the frame's budget (IdleQueue in section.ts), so that a long calculation never stalls a
// frame. The oil page still slices its own laps; it moves here later.

import type { IdleQueue } from './section.ts';

/** Milliseconds of each frame the queue may take. */
const BUDGET_MS = 6;

export class ShellIdle implements IdleQueue {
  private readonly steps: Array<() => boolean> = [];
  private readonly now: () => number;

  /** `now` is the clock the budget is measured on, in ms; a test passes its own. */
  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  add(step: () => boolean): () => void {
    this.steps.push(step);
    return () => {
      const i = this.steps.indexOf(step);
      if (i >= 0) this.steps.splice(i, 1);
    };
  }

  /** Pieces of work still waiting. */
  get pending(): number {
    return this.steps.length;
  }

  /**
   * Runs the oldest work first, piece by piece, until it is all done or the frame's budget is used. A piece that
   * throws is dropped and reported: the frame loop calls this before the section's frame and the render, so an error
   * left in the queue would stop the page drawing on every frame after.
   */
  run(): void {
    const start = this.now();
    while (this.steps.length && this.now() - start < BUDGET_MS) {
      const step = this.steps[0]!;
      let done: boolean;
      try {
        done = step();
      } catch (error) {
        done = true;
        console.error('Idle work failed and was dropped:', error);
      }
      if (done && this.steps[0] === step) this.steps.shift();
    }
  }
}
