// Cause and effect, computed rather than written down. Every statement of the form "this changes that" on the page
// comes from running the same model twice, so it stays true for the engine actually on screen.

import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { paramRange, type NumericKey } from './constraints.ts';
import type { Design } from './design.ts';
import { evaluate, type Performance } from './physics.ts';
import { editDesign } from './presets.ts';
import { assessReliability, type Reliability } from './reliability.ts';

export interface Metric {
  id: string;
  name: string;
  value: number;
  /** How the change is written. */
  format: 'percent' | 'load' | 'rpm';
}

export function metricsOf(perf: Performance, rel: Reliability): Metric[] {
  const metrics: Metric[] = [
    { id: 'power', name: t('Потужність'), value: perf.peakPower.powerHp, format: 'percent' },
    { id: 'torque', name: t('Момент'), value: perf.peakTorque.torqueNm, format: 'percent' },
    { id: 'cruise', name: t('Витрата на трасі'), value: perf.cruise.reachable ? perf.cruise.fuelLh : Number.NaN, format: 'percent' },
    { id: 'bsfc', name: t('Питома витрата'), value: perf.bestBsfc.bsfc < 2000 ? perf.bestBsfc.bsfc : Number.NaN, format: 'percent' },
    { id: 'mass', name: t('Маса'), value: perf.massKg, format: 'percent' },
    { id: 'rev', name: t('Час набору обертів'), value: perf.revTimeS, format: 'percent' },
    { id: 'peakRpm', name: t('Оберти піку потужності'), value: perf.peakPower.rpm, format: 'rpm' },
    { id: 'safeRpm', name: t('Безпечні оберти'), value: rel.safeRpm, format: 'rpm' },
  ];
  for (const item of rel.items) metrics.push({ id: item.id, name: item.name, value: item.load, format: 'load' });
  return metrics;
}

export interface Effect {
  id: string;
  name: string;
  text: string;
  /** Size of the change, to rank by. Percent of the old value, or load points. */
  size: number;
}

const rpmText = (v: number): string => (Math.round(v / 50) * 50).toLocaleString(numberLocale);

const describe = (before: Metric, after: Metric): Effect | null => {
  const a = before.value;
  const b = after.value;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (before.format === 'load') {
    const size = Math.abs(b - a) * 100;
    if (size < 1) return null;
    return { id: before.id, name: before.name, text: `${Math.round(a * 100)}→${Math.round(b * 100)}%`, size: size * 1.1 };
  }
  const size = (Math.abs(b - a) / Math.max(Math.abs(a), 1e-6)) * 100;
  if (size < 1) return null;
  if (before.format === 'rpm') return { id: before.id, name: before.name, text: `${rpmText(a)}→${rpmText(b)}`, size };
  return { id: before.id, name: before.name, text: `${b > a ? '+' : '−'}${Math.round(size)}%`, size };
};

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

/** The state with factory figures set aside, so that what's compared is the model's response alone. */
export function snapshot(d: Design): Metric[] {
  const plain = d.factory ? { ...d, factory: null } : d;
  const perf = evaluate(plain);
  return metricsOf(perf, assessReliability(plain, perf));
}

export interface Probe {
  key: keyof Design;
  name: string;
  /** Values to try instead of the current one, each with how to say it. */
  tries: (d: Design) => Array<{ value: unknown; label: string }>;
}

/** A number can go both ways: tries ten percent of its range up and down, where there is room. */
export function numberProbe(key: NumericKey, name: string): Probe {
  return {
    key,
    name,
    tries(d) {
      const value = d[key];
      if (typeof value !== 'number') return [];
      const range = paramRange(d, key);
      const step = (range.max - range.min) * 0.1;
      const out: Array<{ value: unknown; label: string }> = [];
      if (value + step <= range.max) out.push({ value: value + step, label: t('більше') });
      if (value - step >= range.min) out.push({ value: value - step, label: t('менше') });
      return out;
    },
  };
}

export function choiceProbe(key: keyof Design, name: string, options: Array<[string | number, string]>): Probe {
  return {
    key,
    name,
    tries: (d) => options.filter(([value]) => value !== d[key]).map(([value, label]) => ({ value, label })),
  };
}

export interface Cause {
  key: keyof Design;
  name: string;
  label: string;
  effect: Effect;
}

/** What moves one metric the most, for this engine, from where it stands. */
export function causesOf(d: Design, metricId: string, probes: Probe[], limit = 5): Cause[] {
  const base = snapshot(d).find((m) => m.id === metricId);
  if (!base) return [];
  const found: Cause[] = [];
  for (const probe of probes) {
    let best: Cause | null = null;
    for (const attempt of probe.tries(d)) {
      const changed = editDesign({ ...d, factory: null }, { [probe.key]: attempt.value } as Partial<Design>);
      const after = snapshot(changed).find((m) => m.id === metricId);
      if (!after) continue;
      const effect = describe(base, after);
      if (effect && (!best || effect.size > best.effect.size)) best = { key: probe.key, name: probe.name, label: attempt.label, effect };
    }
    if (best) found.push(best);
  }
  return found.sort((a, b) => b.effect.size - a.effect.size).slice(0, limit);
}

/** A preview of moving one control, without moving it. */
export function previewEffects(d: Design, key: keyof Design, value: unknown, limit = 5): Effect[] {
  const before = snapshot(d);
  const after = snapshot(editDesign({ ...d, factory: null }, { [key]: value } as Partial<Design>));
  return compareMetrics(before, after).slice(0, limit);
}
