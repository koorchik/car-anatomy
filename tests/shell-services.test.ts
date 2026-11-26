// The shell's services that sections share (src/shell/idle.ts, src/shell/run-store.ts): work sliced into the frame's
// budget, and results that outlive a page.

import { describe, expect, it, vi } from 'vitest';
import { ShellIdle } from '../src/shell/idle.ts';
import { ShellRuns } from '../src/shell/run-store.ts';

/** A clock that moves only when a piece of work says it took time. */
function clock() {
  const state = { ms: 0 };
  return { state, now: () => state.ms };
}

describe('IdleQueue', () => {
  it('keeps to the frame budget and carries the rest over to the next frame', () => {
    const { state, now } = clock();
    const idle = new ShellIdle(now);
    let pieces = 0;
    idle.add(() => {
      state.ms += 1;
      pieces++;
      return pieces === 20;
    });
    idle.run();
    // 6 ms of budget at 1 ms a piece.
    expect(pieces).toBe(6);
    idle.run();
    idle.run();
    idle.run();
    expect(pieces).toBe(20);
    expect(idle.pending).toBe(0);
  });

  it('finishes the oldest work before it starts the next', () => {
    const { state, now } = clock();
    const idle = new ShellIdle(now);
    const order: string[] = [];
    let a = 0;
    idle.add(() => {
      state.ms += 1;
      order.push('a');
      return ++a === 3;
    });
    idle.add(() => {
      state.ms += 1;
      order.push('b');
      return true;
    });
    idle.run();
    expect(order).toEqual(['a', 'a', 'a', 'b']);
  });

  it('drops work that is cancelled, even from inside its own piece', () => {
    const { state, now } = clock();
    const idle = new ShellIdle(now);
    let runs = 0;
    const cancel = idle.add(() => {
      state.ms += 1;
      runs++;
      cancel();
      return false;
    });
    idle.run();
    idle.run();
    expect(runs).toBe(1);
    expect(idle.pending).toBe(0);
  });

  it('drops a piece that throws, so the frames after it still run', () => {
    const { state, now } = clock();
    const idle = new ShellIdle(now);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let after = 0;
    idle.add(() => {
      throw new Error('broken lap');
    });
    idle.add(() => {
      state.ms += 1;
      after++;
      return true;
    });
    expect(() => idle.run()).not.toThrow();
    expect(after).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe('RunStore', () => {
  it('gives back the very object a page left, so a page that mutates it in place keeps its runs', () => {
    const runs = new ShellRuns();
    expect(runs.get('engines.dyno-runs')).toBeUndefined();
    const kept = { current: null as number | null };
    runs.set('engines.dyno-runs', kept);
    kept.current = 42;
    expect(runs.get<typeof kept>('engines.dyno-runs')).toBe(kept);
    expect(runs.get<typeof kept>('engines.dyno-runs')?.current).toBe(42);
  });
});
