// Cause and effect, computed rather than written down, for any designer: run the same model twice, once as the design
// stands and once with one control moved, and say which figures moved and how far. The engine designer
// (src/designer/sensitivity.ts) and the suspension designer (src/suspension-designer/sensitivity.ts) bring their own
// figures, edits and probes; the wording of a change lives here, so both say it the same way. No text of its own: the
// names and units come with the figures.

import { numberLocale } from '../i18n/locale.ts';

export interface Metric {
  id: string;
  name: string;
  value: number;
  /** How the change is written: a percentage of the old value, load points, revs, or both values with a unit. */
  format: 'percent' | 'load' | 'rpm' | 'value';
  /** For 'value': the unit after the numbers (already translated), the decimals, and the change that counts as 100 %
   *  when effects are ranked (by default the old value itself; a figure that crosses zero needs its own). */
  unit?: string;
  digits?: number;
  scale?: number;
}

export interface Effect {
  id: string;
  name: string;
  text: string;
  /** Size of the change, to rank by. Percent of the old value (or of the metric's scale), or load points. */
  size: number;
}

const rpmText = (v: number): string => (Math.round(v / 50) * 50).toLocaleString(numberLocale);

/** One formatter per number of decimals: toLocaleString with options builds a new one on every call, which took most
 *  of a sensitivity pass. */
const FORMATS = new Map<number, Intl.NumberFormat>();
function valueText(v: number, digits: number): string {
  let f = FORMATS.get(digits);
  if (!f) {
    f = new Intl.NumberFormat(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    FORMATS.set(digits, f);
  }
  return f.format(v);
}

/** How one figure changed, or null when the change is too small to mention (under 1 %). */
export function describe(before: Metric, after: Metric): Effect | null {
  const a = before.value;
  const b = after.value;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (before.format === 'load') {
    const size = Math.abs(b - a) * 100;
    if (size < 1) return null;
    return { id: before.id, name: before.name, text: `${Math.round(a * 100)}→${Math.round(b * 100)}%`, size: size * 1.1 };
  }
  if (before.format === 'value') {
    const scale = before.scale ?? Math.max(Math.abs(a), 1e-6);
    const size = (Math.abs(b - a) / scale) * 100;
    if (size < 1) return null;
    const digits = before.digits ?? 0;
    // Degrees and percent stand right after the number, as elsewhere on the site; other units after a space.
    const unit = !before.unit ? '' : /^[°%]/.test(before.unit) ? before.unit : ` ${before.unit}`;
    return { id: before.id, name: before.name, text: `${valueText(a, digits)}→${valueText(b, digits)}${unit}`, size };
  }
  const size = (Math.abs(b - a) / Math.max(Math.abs(a), 1e-6)) * 100;
  if (size < 1) return null;
  if (before.format === 'rpm') return { id: before.id, name: before.name, text: `${rpmText(a)}→${rpmText(b)}`, size };
  return { id: before.id, name: before.name, text: `${b > a ? '+' : '−'}${Math.round(size)}%`, size };
}

/** Differences worth showing, biggest first. */
export function compareMetrics(before: Metric[], after: Metric[]): Effect[] {
  const out: Effect[] = [];
  for (const m of before) {
    const other = after.find((x) => x.id === m.id);
    if (!other) continue;
    const effect = describe(m, other);
    if (effect) out.push(effect);
  }
  return out.sort((x, y) => y.size - x.size);
}

/** One control to try, with the values to try instead of the current one, each with how to say it. */
export interface Probe<D, K extends keyof D = keyof D> {
  key: K;
  name: string;
  tries: (d: D) => Array<{ value: unknown; label: string }>;
}

export interface Cause<D, K extends keyof D = keyof D> {
  key: K;
  name: string;
  label: string;
  effect: Effect;
}

/** A designer's model as the checks need it: its figures for a design, and one edit with its consequences. */
export interface SensitivityModel<D> {
  snapshot: (d: D) => Metric[];
  edit: (d: D, patch: Partial<D>) => D;
}

/** What moves one metric the most, for this design, from where it stands. */
export function causesOf<D, K extends keyof D>(model: SensitivityModel<D>, d: D, metricId: string, probes: Probe<D, K>[], limit = 5): Cause<D, K>[] {
  const base = model.snapshot(d).find((m) => m.id === metricId);
  if (!base) return [];
  const found: Cause<D, K>[] = [];
  for (const probe of probes) {
    let best: Cause<D, K> | null = null;
    for (const attempt of probe.tries(d)) {
      const changed = model.edit(d, { [probe.key]: attempt.value } as unknown as Partial<D>);
      const after = model.snapshot(changed).find((m) => m.id === metricId);
      if (!after) continue;
      const effect = describe(base, after);
      if (effect && (!best || effect.size > best.effect.size)) best = { key: probe.key, name: probe.name, label: attempt.label, effect };
    }
    if (best) found.push(best);
  }
  return found.sort((a, b) => b.effect.size - a.effect.size).slice(0, limit);
}

/** A preview of moving one control, without moving it. */
export function previewEffects<D>(model: SensitivityModel<D>, d: D, key: keyof D, value: unknown, limit = 5): Effect[] {
  const before = model.snapshot(d);
  const after = model.snapshot(model.edit(d, { [key]: value } as unknown as Partial<D>));
  return compareMetrics(before, after).slice(0, limit);
}
