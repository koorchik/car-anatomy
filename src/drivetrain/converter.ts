// The torque converter (stage K12a, research §9): a pump on the engine side, a turbine on the gearbox input and a
// stator on a one-way clutch to the case between them. Plain maths on two speeds, no state: the solver (solver.ts)
// takes its torques and their slopes every step, the lab (converter-lab.ts) and the tests read the same functions.
//
// The law is the K-factor model of the EPA's ALPHA (SAE 2015-01-1140), with the GM 6T40's measured curve:
//   SR = n_t/n_p,   T_p = (n_p/(K_stall·k̂(SR)))²,   T_t = TR(SR)·T_p.
// TR and k̂ = K/K_stall are the points read off the paper's figure 7 (research §9), linear between them. K_stall,
// rpm/√(N·m), is the converter's only size: the engine stalls where its full-load torque meets (n/K_stall)².
//
// Two choices of ours at the ends of the measured range:
// - At SR 1 the K factor is "poorly defined or near infinite" (the paper): no circulation, no torque. The EPA caps it
//   at 7.5 times the highest measured K, which leaves a small step in torque where the flow reverses. We take the
//   limit instead: the capacity 1/k̂² falls linearly from the last measured point (SR 0.95) to zero at SR 1, so the
//   torque passes zero without a step and the implicit slope keeps the step stable there.
// - Reverse flow (the wheels drive the engine): TR 0.98 at any ratio and the K curve raised by 70 % (the paper). Its
//   speed ratio is that of the driven member over the driving one, n_p/n_t, so a turning turbine still drags a
//   stopped pump; near SR 1 this is the paper's mirror about SR 1 to first order.
//
// Past the coupling point TR has reached 1: the stator would have to push the flow forward, its one-way clutch lets it
// turn, and the converter works as a plain fluid coupling. That is where the stator freewheels in the 3D.

import { CLUTCH_RESERVE, stiffDisc, WET_PACK } from './elements.ts';
import type { DamperDef, FrictionDef } from './spec.ts';

/** Speed ratios of the measured points (research §9, the GM 6T40 by FEV for the EPA; below 0.35 FEV's extrapolation). */
export const CONVERTER_SR: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.925, 0.95];
/** Torque ratio T_t/T_p at those points. */
export const CONVERTER_TR: readonly number[] = [1.81, 1.72, 1.63, 1.54, 1.45, 1.36, 1.27, 1.19, 1.1, 1.03, 0.99, 0.98, 1.0];
/** K factor over K at stall at those points. */
export const CONVERTER_K: readonly number[] = [1, 1, 1, 0.98, 0.975, 0.96, 0.96, 0.96, 0.97, 1.01, 1.12, 1.3, 1.89];
/** Torque ratio of reverse flow, the turbine driving the pump (the paper). */
export const REVERSE_TR = 0.98;
/** The reverse K curve over the forward one (the paper: shifted upward by 70 %). */
export const REVERSE_K = 1.7;

const RPM = 30 / Math.PI;
const LAST = CONVERTER_SR.length - 1;
const SR_LAST = CONVERTER_SR[LAST]!;

/** Torque ratio at a forward speed ratio, held at 1.00 between the last point and SR 1. */
export function torqueRatio(sr: number): number {
  return interpolate(CONVERTER_TR, sr);
}

/** K over K_stall at a forward speed ratio (the measured range; beyond it see capacity()). */
export function kRatio(sr: number): number {
  return interpolate(CONVERTER_K, sr);
}

/** The capacity 1/k̂² at a speed ratio 0…1: the measured curve, then linearly down to zero at SR 1. */
export function capacity(sr: number): number {
  if (sr >= 1) return 0;
  if (sr > SR_LAST) {
    const k = CONVERTER_K[LAST]!;
    return ((1 - sr) / (1 - SR_LAST)) / (k * k);
  }
  const k = kRatio(sr);
  return 1 / (k * k);
}

/** d capacity/d SR. */
function capacitySlope(sr: number): number {
  if (sr >= 1) return 0;
  if (sr > SR_LAST) {
    const k = CONVERTER_K[LAST]!;
    return -1 / ((1 - SR_LAST) * k * k);
  }
  const k = kRatio(sr);
  return (-2 * slope(CONVERTER_K, sr)) / (k * k * k);
}

/** The speed ratio where TR first reaches 1, between the measured points: past it the stator freewheels. */
export function couplingPoint(): number {
  for (let i = 1; i <= LAST; i++) {
    const a = CONVERTER_TR[i - 1]!;
    const b = CONVERTER_TR[i]!;
    if (a > 1 && b <= 1) return CONVERTER_SR[i - 1]! + ((a - 1) / (a - b)) * (CONVERTER_SR[i]! - CONVERTER_SR[i - 1]!);
  }
  return 1;
}

/** Torque the pump absorbs at stall for a pump speed, N·m: (n/K_stall)². */
export const stallTorque = (rpm: number, kStall: number): number => (rpm / kStall) ** 2;

/**
 * The stall test: brake held, throttle floored, the engine stops rising where its full-load torque equals what the
 * pump absorbs with the turbine standing, T(n) = (n/K_stall)². Bisection between `lo` and `hi`, rpm; null when the
 * curves do not cross there.
 */
export function stallSpeed(torqueAt: (rpm: number) => number, kStall: number, lo = 300, hi = 8000): number | null {
  const gap = (rpm: number) => torqueAt(rpm) - stallTorque(rpm, kStall);
  if (gap(lo) <= 0 || gap(hi) >= 0) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (gap(m) > 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** The K_stall that makes an engine stall at `rpm`: rpm/√T(rpm). */
export const kForStall = (torqueAt: (rpm: number) => number, rpm: number): number => rpm / Math.sqrt(torqueAt(rpm));

/** What the converter does at two speeds, with the slopes the solver's implicit part needs. */
export interface ConverterPoint {
  /** Torque the pump takes from the engine side, N·m (negative: the pump is driven, reverse flow). */
  pump: number;
  /** Torque the turbine passes to the gearbox, N·m (negative: it brakes the gearbox, reverse flow). */
  turbine: number;
  /** n_t/n_p, 0 when the pump stands. */
  sr: number;
  /** Torque ratio turbine over pump. */
  tr: number;
  /** The turbine drives the pump. */
  reverse: boolean;
  /** ∂pump/∂ω_p, ∂pump/∂ω_t, ∂turbine/∂ω_p, ∂turbine/∂ω_t, N·m·s/rad. */
  dPumpP: number;
  dPumpT: number;
  dTurbineP: number;
  dTurbineT: number;
}

export const newConverterPoint = (): ConverterPoint => ({ pump: 0, turbine: 0, sr: 0, tr: CONVERTER_TR[0]!, reverse: false, dPumpP: 0, dPumpT: 0, dTurbineP: 0, dTurbineT: 0 });

/**
 * The converter's torques at pump speed `wp` and turbine speed `wt`, rad/s, with K_stall in rpm/√(N·m), into `out`
 * (no allocation: the audio thread calls it every step).
 */
export function converterTorques(wp: number, wt: number, kStall: number, out: ConverterPoint): void {
  const q = (RPM / kStall) ** 2;
  out.sr = wp > 1e-9 ? wt / wp : 0;
  if (wt <= wp) {
    // Forward flow: the pump drives. A turbine turning backward (a car rolling back in drive) is held at stall.
    out.reverse = false;
    if (wp <= 0) {
      setZero(out, CONVERTER_TR[0]!);
      return;
    }
    const free = wt > 0;
    const s = free ? wt / wp : 0;
    const c = capacity(s);
    const dc = free ? capacitySlope(s) : 0;
    const tr = torqueRatio(s);
    const dtr = free ? slope(CONVERTER_TR, s) : 0;
    const t = c * q * wp * wp;
    const dtP = q * wp * (2 * c - dc * s);
    const dtT = dc * q * wp;
    out.tr = tr;
    out.pump = t;
    out.turbine = tr * t;
    out.dPumpP = dtP;
    out.dPumpT = dtT;
    out.dTurbineP = tr * dtP - (t * dtr * s) / wp;
    out.dTurbineT = tr * dtT + (t * dtr) / wp;
    return;
  }
  // Reverse flow: the turbine drives; the speed ratio is the pump's over the turbine's.
  out.reverse = true;
  if (wt <= 0) {
    setZero(out, REVERSE_TR);
    return;
  }
  const free = wp > 0;
  const s = free ? wp / wt : 0;
  const k2 = REVERSE_K * REVERSE_K;
  const c = capacity(s) / k2;
  const dc = free ? capacitySlope(s) / k2 : 0;
  const a = c * q * wt * wt;
  const daT = q * wt * (2 * c - dc * s);
  const daP = dc * q * wt;
  out.tr = 1 / REVERSE_TR;
  out.turbine = -a;
  out.pump = -REVERSE_TR * a;
  out.dTurbineT = -daT;
  out.dTurbineP = -daP;
  out.dPumpT = -REVERSE_TR * daT;
  out.dPumpP = -REVERSE_TR * daP;
}

function setZero(out: ConverterPoint, tr: number): void {
  out.tr = tr;
  out.pump = 0;
  out.turbine = 0;
  out.dPumpP = 0;
  out.dPumpT = 0;
  out.dTurbineP = 0;
  out.dTurbineT = 0;
}

/** Index of the segment of the measured points that holds `sr` (the last one beyond them). */
function segment(sr: number): number {
  let i = 0;
  while (i < LAST - 1 && sr > CONVERTER_SR[i + 1]!) i++;
  return i;
}

function interpolate(values: readonly number[], sr: number): number {
  if (sr <= 0) return values[0]!;
  if (sr >= SR_LAST) return values[LAST]!;
  const i = segment(sr);
  const x0 = CONVERTER_SR[i]!;
  const x1 = CONVERTER_SR[i + 1]!;
  return values[i]! + ((values[i + 1]! - values[i]!) * (sr - x0)) / (x1 - x0);
}

function slope(values: readonly number[], sr: number): number {
  if (sr < 0 || sr >= SR_LAST) return 0;
  const i = segment(sr);
  return (values[i + 1]! - values[i]!) / (CONVERTER_SR[i + 1]! - CONVERTER_SR[i]!);
}

// ---- The parts in front of an automatic ----

/**
 * The converter of the 6T40 (the paper): 12.568 kg, Ø 273 mm, 0.0585 kg·m², two thirds of it the pump with the cover,
 * one third the turbine. An automatic without its own figures takes this size [estimate].
 */
export const CONVERTER_DIAMETER_MM = 273;
export const CONVERTER_INERTIA = 0.0585;
export const PUMP_INERTIA = (2 / 3) * CONVERTER_INERTIA;
export const TURBINE_INERTIA = CONVERTER_INERTIA / 3;

/**
 * The spring between the crank and the pump. The cover is bolted to the flexplate, and the torsional damper of a real
 * converter sits behind the lock-up clutch; the model keeps the rule that a spring always joins the engine to the
 * drivetrain (gearbox plan, decision 4) and puts one spring there, the stiffest that keeps the mode at STIFF_DISC_HZ
 * between the engine and the pump: stiffDisc with the pump in place of the disc ring [model choice].
 */
export function converterDamper(engineInertia: number, pump = PUMP_INERTIA): DamperDef {
  return { ...stiffDisc(engineInertia, pump), kind: 'converter' };
}

/**
 * The lock-up clutch [estimate for a 273 mm converter]: one wet plate between the cover and the turbine, two faces of
 * 105–130 mm, ATF friction with almost no Stribeck excess (lock-up linings are made flat against shudder), the
 * clamp at full pressure for CLUTCH_RESERVE times the engine's peak torque.
 */
export function lockupClutch(engineMaxNm: number): FrictionDef {
  const rIn = 105;
  const rOut = 130;
  const faces = 2;
  const muStatic = WET_PACK.muStatic;
  const clampN = (CLUTCH_RESERVE * engineMaxNm) / (muStatic * ((rIn + rOut) / 2000) * faces);
  return { faces, rIn, rOut, muStatic, muKinetic: 0.12, stribeck: 5, clampN, actuator: 'hydraulic' };
}
