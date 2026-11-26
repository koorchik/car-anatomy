// The time controls (TimeControl in section.ts): a button per mode, shown when the page offers it and greyed out, with
// the reason in its hint, when the page offers it but not now. The slow-down ×k has its factors beside it and a clock
// of the simulated time, which the page sets.

import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
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

/** Where a visitor goes on from a mode the page does not offer, in this order. */
const FALLBACK: readonly TimeMode[] = ['readable', 'real'];

/** A factor of the slow-down as the control prints it: ×¼, ×½ or ×0,1. */
export function factorLabel(factor: number): string {
  const fractions: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  return `×${fractions[factor] ?? factor.toLocaleString(numberLocale, { maximumFractionDigits: 3 })}`;
}

/** The clock beside the slow-down: '×0.1 · 0.312 s', in the page's language. */
export function clockLabel(factor: number, seconds: number): string {
  return `${factorLabel(factor)} · ${t('{s} с', { s: seconds.toLocaleString(numberLocale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) })}`;
}

/** The slow-down's factor chooser and clock beside the mode buttons. */
export interface TimeExtras {
  /** A list of the factors k, shown while the slow-down is on and has more than one. */
  factor?: HTMLSelectElement | null;
  /** The simulated time, shown while the slow-down is on and the page sets it. */
  clock?: HTMLElement | null;
}

/** Whether the page offers `mode` and it can be chosen now. */
function choosable(offered: TimeCapabilities, mode: TimeMode): boolean {
  return offered.modes.includes(mode) && offered.unavailable?.[mode] === undefined;
}

export class ShellTime implements TimeControl {
  mode: TimeMode = 'readable';
  factor = 1;
  frozen: FreezeOptions | null = null;
  /** The mode last chosen by the visitor or a page, which a fallback in refresh() does not replace. */
  private chosen: { mode: TimeMode; factor: number } = { mode: 'readable', factor: 1 };
  private readonly group: HTMLElement;
  private readonly capabilities: () => TimeCapabilities;
  private readonly listeners = new Set<(mode: TimeMode) => void>();
  private readonly extras: TimeExtras;
  /** The factors the list holds now, so that it is rebuilt only when a page offers others. */
  private listed = '';
  private seconds: number | null = null;

  /** `group` is the segmented control with a button per mode (data-v). */
  constructor(group: HTMLElement, capabilities: () => TimeCapabilities, extras: TimeExtras = {}) {
    this.group = group;
    this.capabilities = capabilities;
    this.extras = extras;
    onSegment(group, (value) => this.set(value as TimeMode));
    extras.factor?.addEventListener('change', () => this.set('slowdown', Number(extras.factor!.value)));
  }

  set(mode: TimeMode, factor?: number): boolean {
    if (!this.apply(mode, factor)) return false;
    this.chosen = { mode, factor: this.factor };
    return true;
  }

  /** set() without remembering the mode as chosen: a fallback for a page that does not offer the chosen one. */
  private apply(mode: TimeMode, factor?: number): boolean {
    const offered = this.capabilities();
    if (!choosable(offered, mode)) return false;
    const factors = offered.slowdown ?? [];
    // A factor the page does not offer gives way to the one chosen before, then to the page's first.
    const keep = (k: number | undefined): k is number => k !== undefined && (factors.includes(k) || (!factors.length && k > 0 && k <= 1));
    this.factor = mode !== 'slowdown' ? 1 : keep(factor) ? factor : this.mode === 'slowdown' && keep(this.factor) ? this.factor : (factors[0] ?? 1);
    this.mode = mode;
    setSegment(this.group, mode);
    this.showExtras();
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
      const reason = offered.unavailable?.[mode];
      button.hidden = !offered.modes.includes(mode);
      button.disabled = reason !== undefined;
      // The hint beside a mode that cannot be chosen says why.
      button.title = reason ?? '';
    }
    this.listFactors(offered.slowdown ?? []);
    // A page never runs in a mode it does not offer, such as the readable mode carried over from another section,
    // or slow motion once the dyno is on: the visitor goes on in the readable or the real mode, else the page's first.
    if (choosable(offered, this.mode)) {
      this.showExtras();
      return;
    }
    const next = FALLBACK.find((mode) => choosable(offered, mode)) ?? offered.modes.find((mode) => choosable(offered, mode));
    if (next) this.apply(next);
  }

  /**
   * The shell shows another section: refresh(), and back to the mode the visitor chose if this page offers it. A
   * section that offers fewer modes (the suspensions' rig, only the real time) does not take the engine pages' slow
   * or readable mode away for good.
   */
  showSection(): void {
    this.refresh();
    const { mode, factor } = this.chosen;
    if (mode !== this.mode || factor !== this.factor) this.apply(mode, factor);
  }

  clock(seconds: number | null): void {
    this.seconds = seconds;
    const clock = this.extras.clock;
    if (!clock) return;
    const text = seconds === null || this.mode !== 'slowdown' ? '' : clockLabel(this.factor, seconds);
    if (clock.textContent !== text) clock.textContent = text;
    clock.hidden = text === '';
  }

  /** The factors of the slow-down in its list, rebuilt when the page offers others. */
  private listFactors(factors: readonly number[]): void {
    const select = this.extras.factor;
    const key = factors.join(',');
    if (!select || key === this.listed) return;
    this.listed = key;
    select.replaceChildren(
      ...factors.map((k) => {
        const option = document.createElement('option');
        option.value = String(k);
        option.textContent = factorLabel(k);
        return option;
      }),
    );
  }

  /** The factor list and the clock follow the mode. */
  private showExtras(): void {
    const select = this.extras.factor;
    if (select) {
      select.hidden = this.mode !== 'slowdown' || select.options.length < 2;
      select.value = String(this.factor);
    }
    this.clock(this.seconds);
  }

  /** Holds the page still for a snapshot, or lets it go (null). Each call is a new freeze, even with the same options. */
  freeze(options: FreezeOptions | null): void {
    this.frozen = options && { ...options };
  }
}
