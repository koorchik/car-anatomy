// "What this changes" for the car builder (whole-car plan, results): the model runs twice, as the build stands and with
// one control moved, and the figures that moved are named. The wording is shared with the other designers
// (src/shared/sensitivity-core.ts); the figures (metrics.ts), the edit (editBuild) and the controls are the builder's.
//
// A build runs four section models, so one pass over every control takes a few hundred milliseconds. It never holds
// the page that long: sensitivityPass is a generator that yields between the heavy parts of every run (evaluateSteps),
// and runPass drives it within a time budget per slice, so the page gives each slice an idle callback or a frame.
// The plan's bound is 50 ms per slice (tests/car-build).

import { compareMetrics, describe, type Effect, type Metric } from '../shared/sensitivity-core.ts';
import { t } from '../i18n/t.ts';
import type { CarBuild } from './build.ts';
import { buildControls, type BuildControl } from './controls.ts';
import { evaluateSteps, type CarPerformance } from './evaluate.ts';
import { carMetrics } from './metrics.ts';

/** Values to try for a control instead of its own: a tenth of its range up and down, every other option of a choice. */
export function controlTries(b: CarBuild, c: BuildControl, share = 0.1): Array<{ build: CarBuild; label: string }> {
  if (c.kind === 'number') {
    const { min, max } = c.range(b);
    const value = c.get(b);
    const step = Math.max(c.step, (max - min) * share);
    const out: Array<{ build: CarBuild; label: string }> = [];
    if (value + step <= max + 1e-9) out.push({ build: c.set(b, Math.min(max, value + step)), label: t('більше') });
    if (value - step >= min - 1e-9) out.push({ build: c.set(b, Math.max(min, value - step)), label: t('менше') });
    return out;
  }
  const current = c.get(b);
  return c.options(b).filter(([v]) => v !== current && v !== 'design').map(([v, label]) => ({ build: c.set(b, v), label }));
}

/** The figures of a build, a heavy part between yields. */
function* snapshotSteps(b: CarBuild): Generator<void, Metric[], void> {
  const p: CarPerformance = yield* evaluateSteps(b);
  return carMetrics(p);
}

const drain = <T>(g: Generator<void, T, void>): T => {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
};

/** The figures of a build in one go. */
export const buildSnapshot = (b: CarBuild): Metric[] => drain(snapshotSteps(b));

export interface ControlEffects {
  id: string;
  label: string;
  effects: Effect[];
}

/**
 * One pass of "what this changes" over every control of the build: each control moved once (its first try), the model
 * run, the changes listed; the build itself does not change. Yields between the heavy parts.
 */
export function* sensitivityPass(b: CarBuild): Generator<void, ControlEffects[], void> {
  const before = yield* snapshotSteps(b);
  const out: ControlEffects[] = [];
  for (const control of buildControls(b)) {
    if (control.only) continue;
    const attempt = controlTries(b, control)[0];
    if (!attempt) continue;
    yield;
    const after = yield* snapshotSteps(attempt.build);
    out.push({ id: control.id, label: attempt.label, effects: compareMetrics(before, after) });
  }
  return out;
}

/**
 * Drives a pass for at most `budgetMs` of work, then stops at the next yield. Returns the result once the pass is done,
 * or null when there is more to do: call again with the same generator on the next idle slice.
 */
export function runPass<T>(pass: Generator<void, T, void>, budgetMs: number, now: () => number = () => performance.now()): T | null {
  const start = now();
  for (;;) {
    const r = pass.next();
    if (r.done) return r.value;
    if (now() - start >= budgetMs) return null;
  }
}

export interface BuildCause {
  id: string;
  label: string;
  effect: Effect;
}

/** Tries of one control the causes look at: a choice of the whole engine catalogue would cost seconds. */
const CAUSE_TRIES = 8;

/** What moves one figure the most, for this build, from where it stands. Runs through; use it on a click. */
export function buildCausesOf(b: CarBuild, metricId: string, limit = 5): BuildCause[] {
  const base = buildSnapshot(b).find((m) => m.id === metricId);
  if (!base) return [];
  const found: BuildCause[] = [];
  for (const control of buildControls(b)) {
    let best: BuildCause | null = null;
    for (const attempt of controlTries(b, control).slice(0, CAUSE_TRIES)) {
      const after = buildSnapshot(attempt.build).find((m) => m.id === metricId);
      if (!after) continue;
      const effect = describe(base, after);
      if (effect && (!best || effect.size > best.effect.size)) best = { id: control.id, label: attempt.label, effect };
    }
    if (best) found.push(best);
  }
  return found.sort((x, y) => y.effect.size - x.effect.size).slice(0, limit);
}

/** A preview of a changed build, without changing it. */
export function previewBuildEffects(before: CarBuild, after: CarBuild, limit = 5): Effect[] {
  return compareMetrics(buildSnapshot(before), buildSnapshot(after)).slice(0, limit);
}
