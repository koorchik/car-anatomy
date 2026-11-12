// Absolute engine torque for a crank under load: full load from the performance model, part load on the
// Willans line. It runs on the audio thread too, so it holds plain data and imports nothing from the designer.

/** The same fields as PublishedFigures in the designer, repeated so the worklet never imports it. */
export interface PublishedFiguresLike {
  powerHp: number;
  powerRpm: number | null;
  torqueNm: number | null;
  torqueRpm: number | null;
}

/**
 * How a catalogue curve was brought to the figures its article quotes: one factor on the model's curve, with the
 * published torque and power as ceilings. A factor of 1 and no figures mean the model as it is.
 */
export interface AnchorInfo {
  scale: number;
  /** The factor hit its limit, so the curve only partly reaches the published figures. */
  clamped: boolean;
  published: PublishedFiguresLike | null;
  /** The model's own peaks before scaling, for the note under the charts. */
  modelHp: number;
  modelNm: number;
}

export interface EngineTorqueMap {
  /** Engine speeds, ascending: the performance model's points from its lowest speed to the rev limit. */
  rpm: number[];
  /** Brake torque at full load with the boost the turbo holds at that speed, N·m. */
  wotNm: number[];
  /** Brake torque at full load with the compressor bypassed. Equal to wotNm without a turbo. */
  baseNm: number[];
  /** Willans intercept: friction, accessories and pumping out of an empty manifold, positive, N·m. */
  interceptNm: number[];
  /** Pumping torque that one atmosphere in the manifold gives back, N·m. */
  atmosphereNm: number;
  /** Manifold pressure at full load over atmospheric pressure. */
  pressureRatio: number[];
  /** Air mass flow at full load without boost, relative to its value at spoolRpm. */
  flowShare: number[];
  idleRpm: number;
  limitRpm: number;
  /** Rotating parts and flywheel, kg·m². */
  inertia: number;
  boostKind: 'none' | 'turbo' | 'mechanical';
  diesel: boolean;
  /** The turbo's time constant at spoolRpm, s. */
  spoolS: number;
  /** Speed where full-load boost first reaches 90 % of its highest value. */
  spoolRpm: number;
  anchor: AnchorInfo;
}

/** Atmospheric pressure in bar, as the performance model takes it. */
export const ATM_BAR = 1.013;
/** One metric horsepower is 735.49875 W. */
export const HP_PER_KW = 1.35962;
/** Turbo coming down when the throttle shuts: the wastegate or the dump valve, s. */
const SPOOL_DOWN_S = 0.3;
/** Compressor exponent (gamma - 1) / gamma for air. */
const COMPRESSOR_EXP = 0.286;
/** Share of the idle air that passes a shut throttle plate; the idle governor's own air path gives the rest. */
const LEAK_SHARE = 0.6;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Linear interpolation over the map's speeds, held at both ends. */
export function mapValue(map: EngineTorqueMap, values: number[], rpm: number): number {
  const xs = map.rpm;
  const last = xs.length - 1;
  if (rpm <= xs[0]!) return values[0]!;
  if (rpm >= xs[last]!) return values[last]!;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= rpm) lo = mid;
    else hi = mid;
  }
  const t = (rpm - xs[lo]!) / (xs[hi]! - xs[lo]!);
  return values[lo]! + (values[hi]! - values[lo]!) * t;
}

/** The Willans line's offset at this speed. A diesel's manifold is always full, so it pumps almost nothing. */
const intercept = (map: EngineTorqueMap, rpm: number): number =>
  mapValue(map, map.interceptNm, rpm) - (map.diesel ? map.atmosphereNm : 0);

/**
 * Brake torque with fuel, N·m. `charge` is the trapped charge relative to a full atmospheric one: below 1 the
 * throttle (or a diesel's fuelling) holds it back, above 1 it is boost. Linear in fuel between closed and full,
 * the Willans line; boost adds what the model gives at the boost the turbo holds.
 */
export function brakeTorque(map: EngineTorqueMap, rpm: number, charge: number): number {
  const m0 = intercept(map, rpm);
  const base = mapValue(map, map.baseNm, rpm);
  let torque = -m0 + (base + m0) * clamp(charge, 0, 1);
  const ratio = mapValue(map, map.pressureRatio, rpm);
  if (charge > 1 && ratio > 1.001) {
    const wot = mapValue(map, map.wotNm, rpm);
    torque += (wot - base) * Math.min(1, (charge - 1) / (ratio - 1));
  }
  return torque;
}

/** Torque it takes to turn the engine with no fuel at this charge, positive, N·m. */
export function motoringTorque(map: EngineTorqueMap, rpm: number, charge: number): number {
  const m0 = intercept(map, rpm);
  return map.diesel ? m0 : m0 - clamp(charge, 0, 1) * map.atmosphereNm;
}

/** Charge at which the engine makes no net torque: what holds a free engine at this speed. */
export function holdCharge(map: EngineTorqueMap, rpm: number): number {
  const m0 = intercept(map, rpm);
  const base = mapValue(map, map.baseNm, rpm);
  return clamp(m0 / Math.max(base + m0, 1e-6), 0, 1);
}

/**
 * Charge that leaks past a shut throttle. The gap is small enough for the air to pass at the speed of sound, so the
 * mass flow is fixed and the charge per cycle falls as 1/rpm. Taken as 60 % of the idle charge at idle (estimate):
 * the idle governor's own air path makes up the rest. Zero for a diesel, which has no throttle and cuts its fuel.
 */
export function leakCharge(map: EngineTorqueMap, rpm: number): number {
  if (map.diesel) return 0;
  return (LEAK_SHARE * holdCharge(map, map.idleRpm) * map.idleRpm) / Math.max(rpm, map.idleRpm * 0.25);
}

/**
 * Highest charge the boost allows right now. `pressure` is the manifold pressure ratio the turbo gives at this moment;
 * a belt-driven compressor always gives what the speed allows.
 */
export function chargeLimit(map: EngineTorqueMap, rpm: number, pressure: number): number {
  if (map.boostKind === 'none') return 1;
  if (map.boostKind === 'mechanical') return mapValue(map, map.pressureRatio, rpm);
  return Math.max(1, pressure);
}

/**
 * Time constant of the turbo at this speed, s, for the manifold pressure it gives to follow its steady value. The
 * exhaust drives the wheel up to speed, and at the start of a spool-up the exhaust flows as much as the engine
 * breathes unboosted, so the time goes as one over that flow.
 */
export function spoolTime(map: EngineTorqueMap, rpm: number, rising: boolean): number {
  if (!rising) return SPOOL_DOWN_S;
  const flow = mapValue(map, map.flowShare, rpm);
  return map.spoolS * clamp(1 / Math.max(flow, 1e-3), 0.5, 2.5);
}

/**
 * Turbo shaft speed 0..1 at a pressure ratio, as the sound expects it. The compressor's enthalpy rise goes with the
 * square of its tip speed, and the enthalpy rise with the pressure ratio to the power (gamma - 1) / gamma.
 */
export function turboShaft(map: EngineTorqueMap, pressure: number): number {
  if (map.boostKind !== 'turbo') return 0;
  const top = Math.max(...map.pressureRatio);
  if (top <= 1.001) return 0;
  return Math.sqrt(clamp((Math.max(1, pressure) ** COMPRESSOR_EXP - 1) / (top ** COMPRESSOR_EXP - 1), 0, 1));
}

/** The pressure ratio a turbo shaft speed gives: the inverse of turboShaft. */
export function pressureForShaft(map: EngineTorqueMap, shaft: number): number {
  if (map.boostKind !== 'turbo') return 1;
  const top = Math.max(...map.pressureRatio);
  return (1 + clamp(shaft, 0, 1) ** 2 * (top ** COMPRESSOR_EXP - 1)) ** (1 / COMPRESSOR_EXP);
}

/** Manifold pressure over atmospheric, bar. A diesel's manifold sits at whatever the compressor gives. */
export function manifoldBar(map: EngineTorqueMap, rpm: number, charge: number, pressure: number): number {
  if (map.diesel) return (chargeLimit(map, rpm, pressure) - 1) * ATM_BAR;
  return (Math.max(0, charge) - 1) * ATM_BAR;
}

export function peakTorque(map: EngineTorqueMap): { rpm: number; nm: number } {
  let best = 0;
  map.wotNm.forEach((v, i) => {
    if (v > map.wotNm[best]!) best = i;
  });
  return { rpm: map.rpm[best]!, nm: map.wotNm[best]! };
}

export function peakPower(map: EngineTorqueMap): { rpm: number; kw: number } {
  let best = 0;
  let bestKw = -Infinity;
  map.wotNm.forEach((v, i) => {
    const kw = powerKw(v, map.rpm[i]!);
    if (kw > bestKw) {
      bestKw = kw;
      best = i;
    }
  });
  return { rpm: map.rpm[best]!, kw: bestKw };
}

/** P[kW] = M[N·m] · n[rpm] / 9549, where 9549 = 60 · 1000 / 2π. */
export const powerKw = (nm: number, rpm: number): number => (nm * rpm) / 9549.296585513721;
