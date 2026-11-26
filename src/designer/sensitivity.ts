// Cause and effect, computed rather than written down. Every statement of the form "this changes that" on the page
// comes from running the same model twice, so it stays true for the engine actually on screen. The wording of a change
// and the checks themselves are shared with the suspension designer (src/shared/sensitivity-core.ts).

import { t } from '../i18n/t.ts';
import {
  causesOf as coreCausesOf, compareMetrics, previewEffects as corePreviewEffects, type Cause as CoreCause, type Effect,
  type Metric, type Probe as CoreProbe, type SensitivityModel,
} from '../shared/sensitivity-core.ts';
import { paramRange, type NumericKey } from './constraints.ts';
import type { Design } from './design.ts';
import { evaluate, type Performance } from './physics.ts';
import { editDesign } from './presets.ts';
import { assessReliability, type Reliability } from './reliability.ts';
import { lubricationFigures } from './lubrication-figures.ts';

export { compareMetrics, type Effect, type Metric };

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
  for (const item of rel.items) if (!item.trackOnly) metrics.push({ id: item.id, name: item.name, value: item.load, format: 'load' });
  return metrics;
}

/** The state with factory figures set aside, so that what's compared is the model's response alone. */
export function snapshot(d: Design): Metric[] {
  const plain = d.factory ? { ...d, factory: null } : d;
  const perf = evaluate(plain);
  const lube = lubricationFigures(plain);
  return [
    ...metricsOf(perf, assessReliability(plain, perf)),
    { id: 'crankHeight', name: t('Висота колінвала над дном піддона'), value: lube.crankHeightMm, format: 'percent' },
    { id: 'oil', name: t('Об’єм оливи'), value: lube.oilL, format: 'percent' },
  ];
}

export type Probe = CoreProbe<Design>;

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

export type Cause = CoreCause<Design>;

/** The engine model as the shared checks run it: the factory figures set aside, so only the model's response counts. */
const MODEL: SensitivityModel<Design> = {
  snapshot,
  edit: (d, patch) => editDesign({ ...d, factory: null }, patch),
};

/** What moves one metric the most, for this engine, from where it stands. */
export function causesOf(d: Design, metricId: string, probes: Probe[], limit = 5): Cause[] {
  return coreCausesOf(MODEL, d, metricId, probes, limit);
}

/** A preview of moving one control, without moving it. */
export function previewEffects(d: Design, key: keyof Design, value: unknown, limit = 5): Effect[] {
  return corePreviewEffects(MODEL, d, key, value, limit);
}
