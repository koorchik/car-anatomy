// Work done in pieces inside the frame's budget (IdleQueue in section.ts), so that a long calculation never stalls a
// frame. The oil page still slices its own laps; it moves here later.

import type { IdleQueue } from './section.ts';

/** Milliseconds of each frame the queue may take. */
const BUDGET_MS = 6;

export class ShellIdle implements IdleQueue {
  private readonly steps: Array<() => boolean> = [];

  add(step: () => boolean): () => void {
    this.steps.push(step);
    return () => {
      const i = this.steps.indexOf(step);
      if (i >= 0) this.steps.splice(i, 1);
    };
  }

  /** Runs the oldest work first, piece by piece, until it is all done or the frame's budget is used. */
  run(): void {
    const start = performance.now();
    while (this.steps.length && performance.now() - start < BUDGET_MS) {
      const step = this.steps[0]!;
      if (step() && this.steps[0] === step) this.steps.shift();
    }
  }
}
