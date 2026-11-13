// The gearbox designer's model up to strength (gearbox plan, the designer's model; stage K9a): ratios, steps and
// range, traction of every gear against the road load, v_max and its gear, revs at 100 and 120 km/h in top, the drop
// on every upshift and whether the engine stays in its power band, the steepest grade first gear pulls away on, and
// the standing start to 100 km/h and over 400 m with the synchroniser's time on every shift, and each gear's
// efficiency. Strength, the synchronisers' heat, the clutch, sound and mass come with stage K9b.
//
// Quasi-static: the sensitivity checks run the model twice per control, and the plan wants it inside 15 ms on the
// heaviest box (tests/gearbox-designer 7), where the whole core would need about 20 000 steps. The standing start
// follows the protocol of src/drivetrain/runs.ts step for step (the launch at a held engine speed with the clutch's
// torque rising, full load after it locks, the driver keeping the driven tyres at GRIP_TARGET of their peak with weight
// transfer, the tyre's steady slip in the engine speed, upshifts at the rev limit with the torque going and coming
// back), on the same masses, efficiencies, tyre and road load, but with steps sized by speed instead of 1 ms. Two
// things are the designer's own:
// - the synchroniser: the clutch stays open for the driver's RUN.shiftS or until the synchroniser of the new gear has
//   matched the speeds (synchro-math.ts, with the design's cones, lining, cone angle and the driver's force), whichever
//   is longer, as the whole model's driver waits for the sleeve to lock;
// - the clutch: at the launch it passes no more than its kinetic capacity.
// On a catalogue car both agree with the whole model within 3 % (tests/drivetrain-vehicle 7).

import { coneTorque, syncTime } from '../drivetrain/synchro-math.ts';
import { DISC_HUB } from '../drivetrain/elements.ts';
import { speedRatio } from '../drivetrain/layouts/transaxle.ts';
import { RUN } from '../drivetrain/runs.ts';
import type { Gearbox, StateInfo } from '../drivetrain/topology.ts';
import { mapValue, peakPower, peakTorque, powerKw, type EngineTorqueMap } from '../engine/torque-map.ts';
import { G } from '../vehicle/constants.ts';
import { roadLoadN } from '../vehicle/road-load.ts';
import { longitudinalPeakN, mfEval, newMfForces } from '../vehicle/tyre.ts';
import type { MfSet } from '../vehicle/tyre-data.ts';
import type { GearboxDesign } from './design.ts';
import { designBuild, type DesignTeeth } from './to-spec.ts';
import type { PickedPair } from './teeth.ts';
import { clutchKineticNm, designVehicle, type DesignVehicle } from './vehicle.ts';

const RPM = 30 / Math.PI;
const KMH = 3.6;
/** Below this road speed the slip is not in the engine speed: the tyre's low-speed range (runs.ts). */
const SLIP_SPEED = 3;
/** Share of the peak power that counts as the engine's power band [estimate]. */
export const BAND_SHARE = 0.85;

export interface GearFigures {
  gear: number;
  /** The gear's own ratio, input over output shaft (what makers publish), and with the final drive. */
  ratio: number;
  overall: number;
  /** What the ladder or the visitor asked for. */
  target: number;
  /** i_k/i_{k+1}; null in top. */
  step: number | null;
  /** The gear's power path with the final drive. */
  efficiency: number;
  kmhPer1000: number;
  kmhAtLimit: number;
  /** Force at the wheels at the engine's peak torque, N. */
  peakForceN: number;
  /** Null: the direct gear. */
  pair: PickedPair | null;
}

export interface ShiftFigures {
  from: number;
  to: number;
  rpmBefore: number;
  rpmAfter: number;
  /** The engine lands at or above the bottom of its power band. */
  inBand: boolean;
  /** The new gear's synchroniser matching the speeds, s (synchro-math.ts). */
  syncS: number;
  /** How long the drive is broken at the clutch: the driver's RUN.shiftS or the synchroniser, whichever is longer, s. */
  pauseS: number;
}

export interface TractionCurves {
  kmh: number[];
  /** Per forward gear, the force at the wheels at full load, N; null outside idle to the rev limit. */
  gears: Array<Array<number | null>>;
  roadLoadN: number[];
}

export interface GearboxPerformance {
  gears: GearFigures[];
  reverse: { ratio: number; overall: number; teeth: number[] };
  /** Layshaft: the constant-mesh pair's ratio. */
  mainRatio: number | null;
  /** The final drive: a transaxle's from its teeth. */
  finalDrive: number;
  /** First over top. */
  range: number;
  vmaxKmh: number;
  vmaxGear: number;
  /** v_max is where the rev limiter stops the car, not the drag. */
  vmaxAtLimiter: boolean;
  topRpmAt100: number;
  topRpmAt120: number;
  /** Steepest grade, per cent, on which first gear pulls the car away. */
  startGradePct: number;
  zeroTo100S: number | null;
  zeroTo400mS: number | null;
  at400mKmh: number | null;
  shifts: ShiftFigures[];
  /** Engine speeds where the full-load power is at least BAND_SHARE of its peak. */
  powerBand: [number, number];
  /** Inertia that changes speed with the input shaft while the clutch is open, kg·m². */
  inputInertia: number;
  traction: TractionCurves;
}

/** A forward gear as the quasi-static model drives it. */
interface GearModel {
  /** Input speed per wheel speed. */
  overall: number;
  /** The box's own efficiency in this gear (the final drive's is the vehicle's axleEfficiency). */
  efficiency: number;
  /** Equivalent masses at the driven tyres: everything locked, and with the engine side standing (clutch open). */
  mLocked: number;
  mDown: number;
}

// ---- The tyre's steady slip (as runs.ts, by Newton instead of bisection) ----

const mf = newMfForces();
const peaks = new WeakMap<MfSet, Map<number, { kappa: number; fx: number }>>();

/** The peak of the force along the road at this load, by golden section below κ = 0.5, cached per 10 N of load. */
function peakSlip(set: MfSet, fz: number): { kappa: number; fx: number } {
  let cache = peaks.get(set);
  if (!cache) peaks.set(set, (cache = new Map()));
  const key = Math.round(fz / 10);
  const hit = cache.get(key);
  if (hit) return hit;
  const at = (k: number) => {
    mfEval(set, k, 0, 0, fz, 1, mf);
    return mf.fx;
  };
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 50; i++) {
    const m1 = hi - 0.618 * (hi - lo);
    const m2 = lo + 0.618 * (hi - lo);
    if (at(m1) < at(m2)) lo = m1;
    else hi = m2;
  }
  const kappa = (lo + hi) / 2;
  const peak = { kappa, fx: at(kappa) };
  cache.set(key, peak);
  return peak;
}

/** Steady slip at which one tyre at load fz pulls `force`; the peak slip if it cannot. */
export function steadySlip(set: MfSet, force: number, fz: number): number {
  const peak = peakSlip(set, fz);
  if (force >= peak.fx) return peak.kappa;
  let lo = -0.5;
  let hi = peak.kappa;
  let k = 0;
  for (let i = 0; i < 40; i++) {
    mfEval(set, k, 0, 0, fz, 1, mf);
    const f = mf.fx - force;
    if (Math.abs(f) < 1e-7 * fz) return k;
    if (f < 0) lo = k;
    else hi = k;
    const next = k - f / mf.dFxdKappa;
    k = mf.dFxdKappa > 0 && next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return k;
}

// ---- The model ----

interface Model {
  v: DesignVehicle;
  box: Gearbox;
  teeth: DesignTeeth;
  gears: GearModel[];
  states: StateInfo[];
  /** Body mass with the undriven wheels, kg. */
  mBody: number;
  /** Engine speed of the launch and of the upshifts, rad/s. */
  omegaLaunch: number;
  omegaShift: number;
  /** Clutch-open time of each upshift k → k+1, s. */
  pauses: number[];
  syncs: number[];
  inputInertia: number;
}

/**
 * Full-load torque at input speed ω, N·m: the map's steady full load with the boost a turbo holds at that speed. The
 * engine stub the runs of runs.ts step with (engine-stub.ts) asks for an atmospheric charge, which is the same on an
 * engine without a turbo; turbo lag is not in a quasi-static run.
 */
const fullLoadTorque = (map: EngineTorqueMap, omega: number): number => mapValue(map, map.wotNm, Math.min(omega * RPM, map.limitRpm));

const spin = (v: DesignVehicle, omegaIn: number): number => v.spinLoss.a * Math.sign(omegaIn) + v.spinLoss.b * omegaIn;

/** Steady force at the driven tyres from torque T at the input, N (runs.ts forceFromInput). */
const forceFrom = (m: Model, g: GearModel, torque: number, omegaIn: number): number =>
  (g.overall * m.v.axleEfficiency * (g.efficiency * torque - spin(m.v, omegaIn))) / m.v.radius;

/** Driven axle load at acceleration ax on a grade, N (longitudinal.ts). */
function drivenAxleN(v: DesignVehicle, ax: number, grade = 0): number {
  const m = v.massKg;
  const a = v.wheelbaseM * (1 - v.frontShare);
  const rear = (m * G * (a * Math.cos(grade) + v.cgHeightM * Math.sin(grade))) / v.wheelbaseM + (m * ax * v.cgHeightM) / v.wheelbaseM;
  return v.drive === 'rwd' ? rear : m * G * Math.cos(grade) - rear;
}

function buildModel(d: GearboxDesign): Model {
  const { box, teeth } = designBuild(d);
  const v = designVehicle(d);
  const map = v.map;
  const states = box.states.filter((s) => s.kind === 'gear' && s.ratio! > 0);
  const inertia = box.inertia;
  const r = v.radius;
  const mBody = v.massKg + (2 * v.wheelInertia) / v.otherRadius ** 2;
  const engineSide = map.inertia + v.damper.inertia;
  const gears = states.map((s): GearModel => {
    const overall = s.ratio! * v.axleRatio;
    let box2 = 0;
    s.speeds!.forEach((w, i) => (box2 += inertia[i]! * w * w));
    // Per unit wheel speed: the box and the disc hub at the input's speed, the axle beyond it, the driven wheels.
    const down = (box2 + DISC_HUB) * overall * overall + v.axleInertia + 2 * v.wheelInertia;
    return {
      overall,
      efficiency: s.efficiency ?? 1,
      mLocked: (down + engineSide * overall * overall) / (r * r) + mBody,
      mDown: down / (r * r) + mBody,
    };
  });
  // The input side with the clutch open and the output held: the input coordinate's column of P.
  const col = box.basis.indexOf(box.spec.input);
  let inputInertia = DISC_HUB;
  box.P.forEach((row, i) => (inputInertia += inertia[i]! * row[col]! ** 2));
  const omegaShift = map.limitRpm / RPM;
  const omegaLaunch = Math.min(peakTorque(map).rpm, RUN.launchShare * map.limitRpm) / RPM;
  const syncs: number[] = [];
  const pauses: number[] = [];
  for (let k = 0; k + 1 < gears.length; k++) {
    const t = upshiftSync(d, box, k + 2, gears[k]!.overall, gears[k + 1]!.overall, omegaShift, inputInertia, v);
    syncs.push(t);
    pauses.push(Math.max(RUN.shiftS, t));
  }
  return { v, box, teeth, gears, states, mBody, omegaLaunch, omegaShift, pauses, syncs, inputInertia };
}

/**
 * Synchronising time of gear `to` on an upshift at input speed omegaIn (synchro-math.ts): the input side slows by
 * ω_wheel·(N_from − N_to), the cone works on it through the ratio between the input and the side of the synchroniser
 * that turns with it, and the spin loss at the mean input speed helps.
 */
function upshiftSync(d: GearboxDesign, box: Gearbox, to: number, nFrom: number, nTo: number, omegaIn: number, inputInertia: number, v: DesignVehicle): number {
  const element = box.spec.elements.find((e) => e.id === `sync-${to}`);
  if (!element || !element.synchro) return 0;
  const col = box.basis.indexOf(box.spec.input);
  const speedOf = (member: string | null): number => (member === null ? 0 : box.P[box.members.indexOf(member)]![col]!);
  const sa = Math.abs(speedOf(element.a));
  const sb = Math.abs(speedOf(element.b));
  const side = Math.max(sa, sb);
  if (!(side > 0)) return 0;
  const wheel = omegaIn / nFrom;
  const change = wheel * Math.abs(nFrom - nTo);
  const after = wheel * nTo;
  return syncTime({
    inputInertia,
    inputSpeedChange: change,
    ratio: 1 / side,
    coneNm: coneTorque(element.synchro, d.shiftForceN),
    dragNm: spin(v, (omegaIn + after) / 2),
    direction: 'up',
  });
}

/** Force per unit slip of the driven tyres at rest on the level, N: at road-load forces the slip is linear in the force. */
function slipStiffness(m: Model): number {
  mfEval(m.v.tyre.set, 0, 0, 0, drivenAxleN(m.v, 0) / 2, 1, mf);
  return 2 * mf.dFxdKappa;
}

/** Road speed at which gear g brings the engine to its rev limit while the tyres pull only the road load, m/s. */
function limiterSpeed(m: Model, g: GearModel, stiffness: number): number {
  const plain = (m.v.map.limitRpm / RPM / g.overall) * m.v.radius;
  let v = plain;
  for (let k = 0; k < 6; k++) v = plain / (1 + roadLoadN(m.v.roadLoad, v, 0) / stiffness);
  return v;
}

/** The standing start: times to 100 km/h and over 400 m. */
function standingStart(m: Model): { zeroTo100S: number | null; zeroTo400mS: number | null; at400mKmh: number | null } {
  const { v, gears } = m;
  const map = v.map;
  const rl = v.roadLoad;
  const set = v.tyre.set;
  const r = v.radius;
  const launchNm = Math.min(fullLoadTorque(map, m.omegaLaunch), clutchKineticNm(v.clutch));
  const hold = limiterSpeed(m, gears[gears.length - 1]!, slipStiffness(m));
  const mark = 100 / KMH;
  let z100: number | null = null;
  let z400: number | null = null;
  let at400: number | null = null;
  // 'limit': top gear at the rev limit, where the limiter holds the car (runs.ts never gets there on a catalogue car).
  let phase: 'launch' | 'drive' | 'lift' | 'shift' | 'limit' = 'launch';
  let g = 0;
  let liftT = 0;
  let shiftT = 0;
  let backT = Number.NEGATIVE_INFINITY;
  let t = 0;
  let vel = 0;
  let x = 0;
  let aPrev = 0;

  /** Slip, input speed and acceleration at (t, vel) with the weight transfer and slip of acceleration `aw`. */
  const state = (tt: number, vv: number, aw: number): { a: number; omegaIn: number } => {
    const fz = drivenAxleN(v, aw) / 2;
    const grip = 2 * RUN.gripTarget * longitudinalPeakN(set, fz);
    const resist = vv > 0 ? roadLoadN(rl, vv, 0) : 0;
    const gear = gears[g]!;
    const kappa = vv > SLIP_SPEED ? steadySlip(set, (m.mBody * aw + resist) / 2, fz) : 0;
    const omegaIn = ((vv * (1 + kappa)) / r) * gear.overall;
    let a: number;
    if (phase === 'launch') {
      const engine = forceFrom(m, gear, launchNm * Math.min(1, tt / RUN.launchRampS), omegaIn);
      a = Math.max(0, Math.min((engine - resist) / gear.mDown, (grip - resist) / m.mBody));
    } else if (phase === 'shift') {
      a = -resist / gears[g + 1]!.mDown;
    } else {
      const ramp = phase === 'lift' ? Math.max(0, 1 - (tt - liftT) / RUN.torqueRampS) : Math.min(1, (tt - backT) / RUN.torqueRampS);
      const engine = forceFrom(m, gear, ramp * fullLoadTorque(map, omegaIn), omegaIn);
      a = Math.min((engine - resist) / gear.mLocked, (ramp * grip - resist) / m.mBody);
      // The limiter cuts the fuel as often as it takes to hold the speed it allows; past the drag the car slows on its own.
      if (phase === 'limit' && vv >= hold) a = Math.min(a, 0);
    }
    return { a, omegaIn };
  };

  /** Road speed at which the input reaches omega in the present gear with this slip. */
  const speedAt = (omega: number, omegaIn: number): number => (omegaIn > 0 ? (vel * omega) / omegaIn : Infinity);

  while (t < 60) {
    const now = state(t, vel, aPrev);
    // Phase changes, checked at the start of each step as runs.ts does.
    if (phase === 'launch' && now.omegaIn >= m.omegaLaunch * (1 - 1e-9)) phase = 'drive';
    if (phase === 'drive' && now.omegaIn >= m.omegaShift * (1 - 1e-9)) {
      if (g < gears.length - 1) {
        phase = 'lift';
        liftT = t;
      } else phase = 'limit';
    }
    if (phase === 'lift' && t - liftT >= RUN.torqueRampS - 1e-12) {
      phase = 'shift';
      shiftT = t;
    }
    if (phase === 'shift' && t - shiftT >= m.pauses[g]! - 1e-12) {
      g++;
      phase = 'drive';
      backT = t;
    }
    const k1 = state(t, vel, aPrev);
    // The step: short in the ramps, else sized so that the speed changes by about 0.3 m/s; landing on the next event.
    let dt: number;
    if (phase === 'lift') dt = Math.min(0.015, liftT + RUN.torqueRampS - t);
    else if (phase === 'shift') dt = Math.min(0.05, shiftT + m.pauses[g]! - t);
    else {
      // A car that has nearly stopped gaining speed takes long steps: nothing happens there but the slow approach.
      dt = Math.min(0.25, 0.3 / Math.max(Math.abs(k1.a), 0.1));
      if (phase === 'launch' && t < RUN.launchRampS) dt = Math.min(dt, 0.01, RUN.launchRampS - t);
      if (phase === 'drive' && t - backT < RUN.torqueRampS) dt = Math.min(dt, 0.015, backT + RUN.torqueRampS - t);
      const target = phase === 'launch' ? m.omegaLaunch : phase === 'drive' ? m.omegaShift : Infinity;
      const reach = speedAt(target, k1.omegaIn);
      if (k1.a > 0 && Number.isFinite(reach)) dt = Math.min(dt, Math.max(1e-4, ((reach - vel) / k1.a) * 1.0005));
      if (phase === 'limit' && k1.a > 0 && vel < hold) dt = Math.min(dt, Math.max(1e-4, ((hold - vel) / k1.a) * 1.0005));
    }
    dt = Math.max(dt, 1e-5);
    const half = state(t + dt / 2, Math.max(0, vel + (k1.a * dt) / 2), k1.a);
    const free = Math.max(0, vel + half.a * dt);
    const v1 = phase === 'limit' && vel <= hold ? Math.min(hold, free) : free;
    const x1 = x + ((vel + v1) / 2) * dt;
    if (z100 === null && v1 >= mark && v1 > vel) z100 = t + ((mark - vel) / (v1 - vel)) * dt;
    if (z400 === null && x1 >= 400 && x1 > x) {
      const s = (400 - x) / (x1 - x);
      z400 = t + s * dt;
      at400 = (vel + s * (v1 - vel)) * KMH;
    }
    aPrev = half.a;
    t += dt;
    vel = v1;
    x = x1;
    if (z100 !== null && z400 !== null) break;
  }
  return { zeroTo100S: z100, zeroTo400mS: z400, at400mKmh: at400 };
}

/**
 * Steady force at the driven tyres at full load in gear g at speed vel, N, with the tyre's small slip at that force; the
 * engine's torque is the limit's where that slip would take it past the limit.
 */
function wheelForce(m: Model, g: GearModel, vel: number, slipStiffness: number): number {
  const omegaMax = m.v.map.limitRpm / RPM;
  let kappa = 0;
  let force = 0;
  for (let i = 0; i < 4; i++) {
    const omegaIn = Math.min(omegaMax, ((vel * (1 + kappa)) / m.v.radius) * g.overall);
    force = forceFrom(m, g, fullLoadTorque(m.v.map, omegaIn), omegaIn);
    kappa = force / slipStiffness;
  }
  return force;
}

/**
 * Top speed on the level, its gear and whether the rev limiter sets it (runs.ts steadyTopSpeed, the slip linear in
 * the force at these small forces). Each gear tops out where its full-load force meets the road load, or at the speed
 * where the engine reaches the limit while the tyres pull only the road load, whichever is lower; the best gear wins.
 */
function topSpeed(m: Model): { v: number; gear: number; atLimiter: boolean } {
  const stiffness = slipStiffness(m);
  const rl = m.v.roadLoad;
  let best = { v: 0, gear: m.gears.length, atLimiter: false };
  m.gears.forEach((g, i) => {
    const limit = limiterSpeed(m, g, stiffness);
    const surplus = (vel: number) => wheelForce(m, g, vel, stiffness) - roadLoadN(rl, vel, 0);
    let top = { v: limit, atLimiter: true };
    if (!(surplus(limit) > 0)) {
      let lo = 0;
      let hi = limit;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (surplus(mid) > 0) lo = mid;
        else hi = mid;
      }
      top = { v: lo, atLimiter: false };
    }
    if (top.v > best.v) best = { ...top, gear: i + 1 };
  });
  return best;
}

/** Steepest grade first gear pulls away on: the engine's peak torque through the slipping clutch, or the grip. */
function startGrade(m: Model): number {
  const v = m.v;
  const first = m.gears[0]!;
  const torque = Math.min(peakTorque(v.map).nm, clutchKineticNm(v.clutch));
  const engine = forceFrom(m, first, torque, 0);
  const pulls = (theta: number): boolean => {
    const grip = 2 * longitudinalPeakN(v.tyre.set, drivenAxleN(v, 0, theta) / 2);
    return Math.min(engine, grip) >= v.massKg * G * Math.sin(theta) + v.roadLoad.a;
  };
  if (!pulls(0)) return 0;
  let lo = 0;
  let hi = Math.PI / 3;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pulls(mid)) lo = mid;
    else hi = mid;
  }
  return 100 * Math.tan(lo);
}

function powerBand(m: Model): [number, number] {
  const map = m.v.map;
  const top = peakPower(map);
  const at = (rpm: number) => powerKw(mapValue(map, map.wotNm, rpm), rpm);
  let lo = top.rpm;
  while (lo - 50 >= map.rpm[0]! && at(lo - 50) >= BAND_SHARE * top.kw) lo -= 50;
  let hi = top.rpm;
  while (hi + 50 <= map.limitRpm && at(hi + 50) >= BAND_SHARE * top.kw) hi += 50;
  return [lo, hi];
}

function traction(m: Model, vTop: number): TractionCurves {
  const map = m.v.map;
  const kmh: number[] = [];
  const steps = 48;
  const vEnd = Math.max(vTop, ...m.gears.map((g) => (map.limitRpm / RPM / g.overall) * m.v.radius));
  for (let i = 0; i <= steps; i++) kmh.push(((vEnd * i) / steps) * KMH);
  const gears = m.gears.map((g) =>
    kmh.map((k) => {
      const omegaIn = ((k / KMH) / m.v.radius) * g.overall;
      const rpm = omegaIn * RPM;
      return rpm < map.idleRpm || rpm > map.limitRpm ? null : forceFrom(m, g, fullLoadTorque(map, omegaIn), omegaIn);
    }),
  );
  return { kmh, gears, roadLoadN: kmh.map((k) => roadLoadN(m.v.roadLoad, k / KMH, 0)) };
}

/** Everything the designer shows of a resolved design. */
export function evaluateGearbox(d: GearboxDesign): GearboxPerformance {
  const m = buildModel(d);
  const { v, box, teeth } = m;
  const map = v.map;
  const peakNm = peakTorque(map).nm;
  // A transaxle's output shaft turns against the input (one mesh): its own ratio is published as a magnitude.
  const own = (s: StateInfo): number => Math.abs(speedRatio(box, s)!);
  const kmhAt = (rpm: number, overall: number) => ((rpm / RPM / overall) * v.radius) * KMH;
  const gears = m.gears.map((g, i): GearFigures => {
    const s = m.states[i]!;
    const next = m.states[i + 1];
    return {
      gear: i + 1,
      ratio: own(s),
      overall: g.overall,
      target: teeth.targets[i]!,
      step: next ? own(s) / own(next) : null,
      efficiency: g.efficiency * v.axleEfficiency,
      kmhPer1000: kmhAt(1000, g.overall),
      kmhAtLimit: kmhAt(map.limitRpm, g.overall),
      peakForceN: forceFrom(m, g, peakNm, 0),
      pair: teeth.speeds[i] ?? null,
    };
  });
  const rev = box.states.find((s) => s.name === 'R')!;
  const top = topSpeed(m);
  const topGear = m.gears[m.gears.length - 1]!;
  const band = powerBand(m);
  const shifts = m.syncs.map((syncS, k): ShiftFigures => {
    const rpmAfter = (map.limitRpm * m.gears[k + 1]!.overall) / m.gears[k]!.overall;
    return { from: k + 1, to: k + 2, rpmBefore: map.limitRpm, rpmAfter, inBand: rpmAfter >= band[0], syncS, pauseS: m.pauses[k]! };
  });
  return {
    gears,
    reverse: { ratio: Math.abs(own(rev)), overall: Math.abs(rev.ratio! * v.axleRatio), teeth: teeth.reverse.teeth },
    mainRatio: d.type === 'layshaft' ? teeth.mainRatio : null,
    finalDrive: d.type === 'layshaft' ? d.finalDrive : teeth.final!.ratio,
    range: gears[0]!.ratio / gears[gears.length - 1]!.ratio,
    vmaxKmh: top.v * KMH,
    vmaxGear: top.gear,
    vmaxAtLimiter: top.atLimiter,
    topRpmAt100: ((100 / KMH / v.radius) * topGear.overall) * RPM,
    topRpmAt120: ((120 / KMH / v.radius) * topGear.overall) * RPM,
    startGradePct: startGrade(m),
    ...standingStart(m),
    shifts,
    powerBand: band,
    inputInertia: m.inputInertia,
    traction: traction(m, top.v),
  };
}
