// "What this changes" for the suspension designer (suspensions plan, results): the model runs twice, as the design
// stands and with one control moved, and the figures that moved are named, the way the engine designer does it. The
// wording and the checks are shared with it (src/shared/sensitivity-core.ts); the figures, the edit and the probes are
// the suspension's. Everything goes through the quick estimates (evaluate-chassis.ts) and their caches, so a pass over
// every control takes a fraction of a second (tests: under 150 ms).

import { t } from '../i18n/t.ts';
import { G } from '../suspension/forces.ts';
import { evaluateChassis, type ChassisPerformance } from '../suspension/evaluate-chassis.ts';
import {
  causesOf as coreCausesOf, compareMetrics, previewEffects as corePreviewEffects, type Cause, type Effect, type Metric,
  type Probe, type SensitivityModel,
} from '../shared/sensitivity-core.ts';
import { paramRange, type NumericKey } from './constraints.ts';
import type { ChassisDesign, DesignKey } from './design.ts';
import { controlsFor, axleControl, type ChassisControl } from './controls.ts';
import { editChassis } from './edit.ts';
import { springRateNm, chassisToSpec } from './to-spec.ts';
import { withDesignOnlyGeometry } from './geometry.ts';

const DEG = 180 / Math.PI;

/** The figures the checks compare. Signed ones and those near zero say both values; the rest a percentage. */
export function chassisMetrics(perf: ChassisPerformance): Metric[] {
  const [f, r] = perf.axles;
  const pct = (id: string, name: string, value: number): Metric => ({ id, name, value, format: 'percent' });
  const val = (id: string, name: string, value: number, unit: string, digits: number, scale: number): Metric => ({ id, name, value, format: 'value', unit, digits, scale });
  const mm = t('мм');
  const deg = '°';
  const share = '%';
  return [
    pct('rideF', t('Частота кузова спереду'), f.rideHz),
    pct('rideR', t('Частота кузова ззаду'), r.rideHz),
    pct('zetaF', t('Демпфування кузова спереду'), f.body.zeta),
    pct('zetaR', t('Демпфування кузова ззаду'), r.body.zeta),
    pct('comfort', t('Прискорення кузова на дорозі'), perf.comfortAw),
    val('roughGrip', t('Зчеплення на поганій дорозі'), perf.roughGrip * 100, share, 1, 5),
    pct('roll', t('Крен'), perf.rollPerG),
    val('frontTransfer', t('Частка перенесення спереду'), perf.frontTransferShare * 100, share, 0, 10),
    val('understeer', t('Недостатня поворотність'), perf.understeerPerG * DEG, t('°/g'), 2, 1),
    pct('skidpad', t('Межа на скідпеді'), perf.skidpadAcc / G),
    pct('braking', t('Гальмівний шлях 100–0'), perf.brakingM),
    pct('lockup', t('Межа гальмування без ABS'), perf.lockAcc / G),
    pct('pitch', t('Тангаж на гальмах'), perf.pitchPerG),
    pct('rollover', t('Поріг перекидання'), perf.rolloverAcc / G),
    val('outerCamberF', t('Розвал зовнішнього колеса на 0,8 g спереду'), f.outerCamberRoad * DEG, deg, 1, 1),
    val('outerCamberR', t('Розвал зовнішнього колеса на 0,8 g ззаду'), r.outerCamberRoad * DEG, deg, 1, 1),
    val('rollCentreF', t('Центр крену спереду'), f.rollCentreM * 1000, mm, 0, 50),
    val('rollCentreR', t('Центр крену ззаду'), r.rollCentreM * 1000, mm, 0, 50),
    val('rolledRollCentreF', t('Центр крену спереду на крені 3°'), f.rolledRollCentreM * 1000, mm, 0, 50),
    val('rolledRollCentreR', t('Центр крену ззаду на крені 3°'), r.rolledRollCentreM * 1000, mm, 0, 50),
    val('bumpSteerF', t('Підрулювання на ходу спереду'), f.bumpSteer * DEG, t('°/м'), 1, 10),
    val('bumpSteerR', t('Підрулювання на ходу ззаду'), r.bumpSteer * DEG, t('°/м'), 1, 10),
    val('camberGainF', t('Набір розвалу спереду'), f.camberGain * DEG, t('°/м'), 1, 10),
    val('camberGainR', t('Набір розвалу ззаду'), r.camberGain * DEG, t('°/м'), 1, 10),
    val('scrub', t('Плече обкатки'), f.scrubM * 1000, mm, 0, 20),
    val('trail', t('Винос'), f.trailM * 1000, mm, 0, 20),
    val('kpi', t('Нахил осі повороту'), f.kpi * DEG, deg, 1, 5),
    // A rear corner on ball joints has the same axis, though nothing steers it: its caster, inclination and scrub are
    // controls of their own (NaN, and so silent, on every other rear axle).
    val('scrubR', t('Плече обкатки ззаду'), r.scrubM * 1000, mm, 0, 20),
    val('trailR', t('Винос ззаду'), r.trailM * 1000, mm, 0, 20),
    val('kpiR', t('Нахил осі повороту ззаду'), r.kpi * DEG, deg, 1, 5),
    val('antiDive', t('Анти-клювання'), perf.anti.braking[0], share, 0, 20),
    val('antiLift', t('Анти-підйом ззаду на гальмах'), perf.anti.braking[1], share, 0, 20),
    val('antiLiftDrive', t('Анти-підйом спереду під газом'), perf.anti.drive[0], share, 0, 20),
    val('antiSquat', t('Анти-присідання'), perf.anti.drive[1], share, 0, 20),
    val('toeDrag', t('Опір від сходження'), perf.toeDragShare * 100, share, 1, 5),
    val('jointF', t('Навантаження шарніра піввісі спереду'), f.jointUse * 100, share, 0, 20),
    val('jointR', t('Навантаження шарніра піввісі ззаду'), r.jointUse * 100, share, 0, 20),
    val('reserveF', t('Запас ходу до відбійника спереду'), f.travelReserveM * 1000, mm, 0, 20),
    val('reserveR', t('Запас ходу до відбійника ззаду'), r.travelReserveM * 1000, mm, 0, 20),
    pct('unsprung', t('Непідресорена маса'), perf.unsprungShare),
    pct('ladenRideF', t('Частота кузова з вантажем спереду'), f.laden.rideHz),
    pct('ladenRideR', t('Частота кузова з вантажем ззаду'), r.laden.rideHz),
    val('ladenSagF', t('Просідання з вантажем спереду'), f.laden.sagM * 1000, mm, 0, 10),
    val('ladenSagR', t('Просідання з вантажем ззаду'), r.laden.sagM * 1000, mm, 0, 10),
    val('propUnload', t('Розвантаження заднього колеса під газом'), perf.propUnload * 100, share, 1, 5),
  ];
}

/** The figures of a design; none when its chassis cannot stand on its springs. */
export function chassisSnapshot(d: ChassisDesign): Metric[] {
  let perf: ChassisPerformance;
  try {
    perf = evaluateChassis(chassisToSpec(d));
  } catch {
    return [];
  }
  return chassisMetrics(perf);
}

/** The edits of the checks solve their axles at design only (withDesignOnlyGeometry). */
const MODEL: SensitivityModel<ChassisDesign> = {
  snapshot: chassisSnapshot,
  edit: (d, patch) => withDesignOnlyGeometry(() => editChassis(d, patch)),
};

/** The value a control shows now: a number, or the typical spring's rate when the design keeps it. */
function shownValue(d: ChassisDesign, control: ChassisControl): unknown {
  const v = (d as unknown as Record<string, unknown>)[control.key];
  if (control.kind !== 'spring' || v !== null) return v;
  const axle = axleControl(control.key);
  return axle ? Math.round(springRateNm(d, axle[0])) / 1000 : v;
}

/** Values to try for a control instead of its own: ten percent of its range up and down where there is room, every
 *  other option of a choice, the other side of a toggle. */
export function controlTries(d: ChassisDesign, control: ChassisControl): Array<{ value: unknown; label: string }> {
  if (control.kind === 'number' || control.kind === 'spring') {
    const value = shownValue(d, control);
    if (typeof value !== 'number') return [];
    const range = paramRange(d, control.key as NumericKey);
    const step = (range.max - range.min) * 0.1;
    const out: Array<{ value: unknown; label: string }> = [];
    // Below its range a value means "none" (no bar, a solid bar): the first step up is a step into the range.
    if (value < range.min) return step > 0 ? [{ value: range.min + step, label: t('більше') }] : [];
    if (step > 0 && value + step <= range.max) out.push({ value: value + step, label: t('більше') });
    if (step > 0 && value - step >= range.min) out.push({ value: value - step, label: t('менше') });
    return out;
  }
  if (control.kind === 'toggle') return [{ value: !(d as unknown as Record<string, unknown>)[control.key], label: t('навпаки') }];
  const current = (d as unknown as Record<string, unknown>)[control.key];
  return (control.options?.(d) ?? []).filter((v) => v !== current).map((v) => ({ value: v, label: String(v) }));
}

/** A probe of one control for causesOfChassis; the page gives it its name. */
export function chassisProbe(control: ChassisControl, name: string): Probe<ChassisDesign, DesignKey> {
  return { key: control.key, name, tries: (d) => controlTries(d, control) };
}

/** What moves one figure the most, for this design, from where it stands. */
export function causesOfChassis(d: ChassisDesign, metricId: string, probes: Probe<ChassisDesign, DesignKey>[], limit = 5): Cause<ChassisDesign, DesignKey>[] {
  return withDesignOnlyGeometry(() => coreCausesOf(MODEL, d, metricId, probes, limit));
}

/** A preview of moving one control, without moving it. */
export function previewChassisEffects(d: ChassisDesign, key: DesignKey, value: unknown, limit = 5): Effect[] {
  return withDesignOnlyGeometry(() => corePreviewEffects(MODEL, d, key, value, limit));
}

export interface ControlEffects {
  key: DesignKey;
  value: unknown;
  label: string;
  effects: Effect[];
}

/**
 * One pass of "what this changes" over every control of the design: each control moved once (its first try), the
 * model run, the changes listed. The page shows them beside the controls; the design itself is not changed.
 */
export function sensitivityPass(d: ChassisDesign): ControlEffects[] {
  return withDesignOnlyGeometry(() => pass(d));
}

function pass(d: ChassisDesign): ControlEffects[] {
  const before = chassisSnapshot(d);
  const out: ControlEffects[] = [];
  for (const control of controlsFor(d)) {
    const attempt = controlTries(d, control)[0];
    if (!attempt) continue;
    const after = chassisSnapshot(MODEL.edit(d, { [control.key]: attempt.value } as Partial<ChassisDesign>));
    out.push({ key: control.key, value: attempt.value, label: attempt.label, effects: compareMetrics(before, after) });
  }
  return out;
}
