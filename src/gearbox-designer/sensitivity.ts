// Cause and effect in the gearbox designer, computed rather than written down (gearbox plan, honesty and links): every
// statement of the form "this control changes that" comes from running the quasi-static model twice, so it holds for
// the box on screen. Possible only because evaluate.ts stays quasi-static and fast.

import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { paramRange } from './constraints.ts';
import type { GearboxControl } from './controls.ts';
import type { GearboxDesign } from './design.ts';
import { editGearboxDesign } from './edit.ts';
import { evaluateGearbox, type GearboxPerformance } from './evaluate.ts';
import { assessGearbox, type GearboxReliability } from './reliability.ts';

export interface GearboxMetric {
  id: string;
  name: string;
  value: number;
  /** How a change is written. */
  format: 'percent' | 'load' | 'rpm' | 'db';
}

export function gearboxMetrics(perf: GearboxPerformance, rel: GearboxReliability): GearboxMetric[] {
  const up12 = perf.synchro.shifts.find((s) => s.from === 1 && s.to === 2);
  const downs = perf.synchro.shifts.filter((s) => s.direction === 'down').reduce((sum, s) => sum + s.timeS, 0);
  const loudest = Math.max(...perf.tones.flatMap((g) => g.meshes.map((m) => m.db)));
  const metrics: GearboxMetric[] = [
    { id: 'zeroTo100', name: t('Розгін 0–100 км/год'), value: perf.zeroTo100S ?? Number.NaN, format: 'percent' },
    { id: 'zeroTo400', name: t('400 м з місця'), value: perf.zeroTo400mS ?? Number.NaN, format: 'percent' },
    { id: 'vmax', name: t('Найбільша швидкість'), value: perf.vmaxKmh, format: 'percent' },
    { id: 'rpm120', name: t('Оберти на 120 км/год'), value: perf.topRpmAt120, format: 'rpm' },
    { id: 'startGrade', name: t('Найкрутіший ухил рушання'), value: perf.startGradePct, format: 'percent' },
    { id: 'range', name: t('Діапазон чисел'), value: perf.range, format: 'percent' },
    { id: 'mass', name: t('Маса коробки'), value: perf.mass.totalKg, format: 'percent' },
    { id: 'sync12', name: t('Синхронізація 1→2'), value: up12?.timeS ?? Number.NaN, format: 'percent' },
    // Every synchroniser's own time: the upshifts of the run and the downshifts judged.
    { id: 'syncAll', name: t('Час усіх синхронізацій'), value: perf.shifts.reduce((s, x) => s + x.syncS, 0) + downs, format: 'percent' },
    { id: 'blocking', name: t('Запас блокування кільця'), value: perf.synchro.blocking, format: 'percent' },
    { id: 'clutchMargin', name: t('Запас зчеплення'), value: perf.clutch.margin, format: 'percent' },
    { id: 'launch', name: t('Робота зчеплення при рушанні'), value: perf.clutch.launchJ, format: 'percent' },
    { id: 'damper', name: t('Частота демпфера'), value: perf.clutch.damperHz, format: 'percent' },
    { id: 'whine', name: t('Завивання шестерень'), value: Number.isFinite(loudest) ? loudest : Number.NaN, format: 'db' },
  ];
  for (const item of rel.items) metrics.push({ id: item.id, name: item.name, value: item.load, format: 'load' });
  return metrics;
}

/** The model's figures with the factory record set aside, so that what is compared is the model alone. */
export function gearboxSnapshot(d: GearboxDesign): GearboxMetric[] {
  const plain = d.factory ? { ...d, factory: null } : d;
  const perf = evaluateGearbox(plain);
  return gearboxMetrics(perf, assessGearbox(perf));
}

export interface GearboxEffect {
  id: string;
  name: string;
  text: string;
  /** Size of the change, to rank by: per cent of the old value, or load points. */
  size: number;
}

const rpmText = (v: number): string => (Math.round(v / 50) * 50).toLocaleString(numberLocale);
const dbText = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function describe(before: GearboxMetric, after: GearboxMetric): GearboxEffect | null {
  const a = before.value;
  const b = after.value;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (before.format === 'load') {
    const size = Math.abs(b - a) * 100;
    if (size < 1) return null;
    return { id: before.id, name: before.name, text: `${Math.round(a * 100)}→${Math.round(b * 100)}%`, size: size * 1.1 };
  }
  if (before.format === 'db') {
    const size = Math.abs(b - a);
    // About 0.5 dB is the smallest step a listener tells apart; it ranks with a 5 % change.
    if (size < 0.5) return null;
    return { id: before.id, name: before.name, text: t('{sign}{db} дБ', { sign: b > a ? '+' : '−', db: dbText(size) }), size: size * 10 };
  }
  const size = (Math.abs(b - a) / Math.max(Math.abs(a), 1e-6)) * 100;
  if (size < 1) return null;
  if (before.format === 'rpm') return { id: before.id, name: before.name, text: `${rpmText(a)}→${rpmText(b)}`, size };
  return { id: before.id, name: before.name, text: `${b > a ? '+' : '−'}${Math.round(size)}%`, size };
}

/** Differences worth showing, biggest first. */
export function compareGearboxMetrics(before: GearboxMetric[], after: GearboxMetric[]): GearboxEffect[] {
  const out: GearboxEffect[] = [];
  for (const m of before) {
    const other = after.find((x) => x.id === m.id);
    if (!other) continue;
    const effect = describe(m, other);
    if (effect) out.push(effect);
  }
  return out.sort((x, y) => y.size - x.size);
}

/** Values to try instead of the current one, each with how to say it. */
export function controlTries(d: GearboxDesign, c: GearboxControl, share = 0.1): Array<{ patch: Partial<GearboxDesign>; label: string }> {
  if (c.kind === 'choice') return c.options(d).filter(([value]) => value !== c.get(d)).map(([value, label]) => ({ patch: c.patch(d, value), label }));
  const value = d[c.key];
  const range = paramRange(d, c.key);
  const whole = c.step ?? 0;
  const step = whole ? Math.max(whole, Math.round(((range.max - range.min) * share) / whole) * whole) : (range.max - range.min) * share;
  const out: Array<{ patch: Partial<GearboxDesign>; label: string }> = [];
  if (value + step <= range.max + 1e-9) out.push({ patch: { [c.key]: Math.min(range.max, value + step) }, label: t('більше') });
  if (value - step >= range.min - 1e-9) out.push({ patch: { [c.key]: Math.max(range.min, value - step) }, label: t('менше') });
  return out;
}

export interface GearboxCause {
  control: string;
  name: string;
  label: string;
  effect: GearboxEffect;
}

/** What moves one metric the most, for this box, from where it stands. */
export function gearboxCausesOf(d: GearboxDesign, metricId: string, controls: GearboxControl[], limit = 5): GearboxCause[] {
  const base = gearboxSnapshot(d).find((m) => m.id === metricId);
  if (!base) return [];
  const found: GearboxCause[] = [];
  for (const c of controls) {
    if (c.only) continue;
    let best: GearboxCause | null = null;
    for (const attempt of controlTries(d, c)) {
      const after = gearboxSnapshot(editGearboxDesign(d, attempt.patch)).find((m) => m.id === metricId);
      if (!after) continue;
      const effect = describe(base, after);
      if (effect && (!best || effect.size > best.effect.size)) best = { control: c.id, name: c.label, label: attempt.label, effect };
    }
    if (best) found.push(best);
  }
  return found.sort((a, b) => b.effect.size - a.effect.size).slice(0, limit);
}

/** A preview of moving one control, without moving it. */
export function previewGearboxEffects(d: GearboxDesign, patch: Partial<GearboxDesign>, limit = 5): GearboxEffect[] {
  return compareGearboxMetrics(gearboxSnapshot(d), gearboxSnapshot(editGearboxDesign(d, patch))).slice(0, limit);
}
