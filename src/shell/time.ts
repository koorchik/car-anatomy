// The time controls (TimeControl in section.ts). This is the simplest form: the speed buttons the engine pages always
// had (slow, readable and real), switched on and off by the page's capabilities. The slow-down ×k and its clock come
// later behind the same interface.

import type { FreezeOptions } from './freeze.ts';
import { onSegment, setSegment } from './segmented.ts';
import type { TimeCapabilities, TimeControl, TimeMode } from './section.ts';

/**
 * How fast a shaft turns on screen in the readable mode, degrees a second. It rises with rpm but stays followable: the
 * same rule for every page, so that the parts of one assembly, each slowed by readable/(6·rpm), stay in mesh.
 */
export function readableDegreesPerSecond(rpm: number, idleRpm: number, redlineRpm: number): number {
  const x = Math.min(1, Math.max(0, (rpm - idleRpm) / (redlineRpm - idleRpm)));
  const shownRpm = 42 * Math.pow(8.5, x);
  return (rpm < idleRpm ? (shownRpm * rpm) / idleRpm : shownRpm) * 6;
}

export class ShellTime implements TimeControl {
  mode: TimeMode = 'readable';
  factor = 1;
  frozen: FreezeOptions | null = null;
  private readonly group: HTMLElement;
  private readonly capabilities: () => TimeCapabilities;
  private readonly listeners = new Set<(mode: TimeMode) => void>();

  /** `group` is the segmented control with a button per mode (data-v). */
  constructor(group: HTMLElement, capabilities: () => TimeCapabilities) {
    this.group = group;
    this.capabilities = capabilities;
    onSegment(group, (value) => this.set(value as TimeMode));
  }

  set(mode: TimeMode, factor?: number): boolean {
    const offered = this.capabilities();
    if (!offered.modes.includes(mode) || offered.unavailable?.[mode] !== undefined) return false;
    this.mode = mode;
    this.factor = mode === 'slowdown' ? (factor ?? offered.slowdown?.[0] ?? 1) : 1;
    setSegment(this.group, mode);
    for (const listener of this.listeners) listener(mode);
    return true;
  }

  onChange(listener: (mode: TimeMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh(): void {
    const offered = this.capabilities();
    for (const button of this.group.querySelectorAll<HTMLButtonElement>('button[data-v]')) {
      const mode = button.dataset.v as TimeMode;
      button.hidden = !offered.modes.includes(mode);
      button.disabled = offered.unavailable?.[mode] !== undefined;
    }
  }

  clock(_seconds: number | null): void {
    // Nothing to show yet: no page offers the slow-down ×k so far.
  }

  /** Holds the page still for a snapshot, or lets it go (null). Each call is a new freeze, even with the same options. */
  freeze(options: FreezeOptions | null): void {
    this.frozen = options && { ...options };
  }
}
