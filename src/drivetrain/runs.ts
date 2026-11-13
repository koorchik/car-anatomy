// Standing starts and top speed of a catalogue car, two ways that must agree (drivetrain-vehicle 7):
// - quasi-static: the car as one equivalent mass per gear with the engine's full-load curve through the gears'
//   efficiencies, the traction limit with weight transfer, the tyre's steady slip, and shifts as a pause;
// - dynamic: the whole core stepped on the longitudinal chassis by a scripted driver who does the same things.
// Both follow one protocol: launch with the engine held at LAUNCH_SHARE of the rev limit (or at peak torque, if lower)
// and the clutch torque rising over LAUNCH_RAMP_S to what the tyres can take, full load after the clutch locks, the
// driver easing off so the driven tyres pull GRIP_TARGET of their peak; at the rev limit an upshift: the foot comes
// off over TORQUE_RAMP_S, the clutch stays open for SHIFT_S while the engine is matched to the new gear, and the
// torque comes back over TORQUE_RAMP_S. The dynamic driver also feels the wheels: when the
// driven tyres slip past their peak slip it eases off, as a driver would; a run that keeps it at that is a sign the
// two models disagree. The protocol is ours [estimate]; the figures it gives are checked against the maker's 0–100
// within ±25 % (drivetrain-vehicle 3).
//
// Scripts and tests only; the worklet will get its driver from control/ (stage K2c).

import { peakTorque } from '../engine/torque-map.ts';
import { drivingMassKg } from '../vehicle/car.ts';
import { G } from '../vehicle/constants.ts';
import { LongitudinalChassis, longitudinalSpec } from '../vehicle/longitudinal.ts';
import { roadLoadCoeffs, roadLoadN, type RoadLoadCoeffs } from '../vehicle/road-load.ts';
import { longitudinalOf, mfEval, newMfForces } from '../vehicle/tyre.ts';
import type { VehicleStep } from '../vehicle/vehicle-step.ts';
import { FL, FR, RL, RR, WHEELS } from '../vehicle/wheel-bus.ts';
import { carVehicle, CLUTCH, CRANK, modalCore, rigidMass, type CarDrive, type CarGear } from './car-model.ts';
import { elementIndex, memberIndex } from './core.ts';
import { stribeckMu } from './elements.ts';
import { fullLoadTorque, stubTorque } from './engine-stub.ts';
import { DIFF_CASE, PINION, PROP_FRONT, SIDE_LEFT, SIDE_RIGHT } from './final-drive.ts';
import { LOCKED } from './solver.ts';

const RPM = 30 / Math.PI;
const KMH = 3.6;
/** Below this road speed the dynamic driver allows the slip of this speed, m/s: the tyre's low-speed range. */
const SLIP_SPEED = 3;

/** The protocol of both runs [estimates of a quick, clean driver]. */
export const RUN = {
  /** Launch speed as a share of the rev limit, unless the engine's torque peaks lower. */
  launchShare: 0.65,
  /** The clutch torque of the launch rises over this time, s, so the first shunt does not spin the wheels. */
  launchRampS: 0.3,
  shiftMarginRpm: 0,
  /** Clutch open during an upshift, s. */
  shiftS: 0.25,
  /** Before and after an upshift the torque goes and comes back over this time, s, as the driver's foot does. */
  torqueRampS: 0.15,
  /** Share of the driven tyres' peak force the driver asks for. */
  gripTarget: 0.98,
  /** Sleeve force of a firm shift, N (gearbox plan: 600 N "normal"). */
  sleeveN: 600,
  /** Time constant of the acceleration the dynamic driver feels, s. */
  feelS: 0.05,
};

/** Engine speed of the launch, rad/s. */
export const launchOmega = (cd: CarDrive): number => Math.min(peakTorque(cd.map).rpm, RUN.launchShare * cd.map.limitRpm) / RPM;
const shiftOmega = (cd: CarDrive): number => (cd.map.limitRpm - RUN.shiftMarginRpm) / RPM;

/** Radius of the driven wheels, m. */
const drivenRadius = (cd: CarDrive): number => cd.radius[cd.driven[0]]!;
const overall = (cd: CarDrive, g: CarGear): number => g.ratio * cd.axle.ratio;
const spinNm = (cd: CarDrive, omegaIn: number): number => cd.spinLoss.a * Math.sign(omegaIn) + cd.spinLoss.b * omegaIn;

/**
 * Steady force at the driven tyres from torque T at the gearbox input, N: the gear's and the final drive's
 * efficiencies on it and the spin loss at the input speed, as the core applies them.
 */
export const forceFromInput = (cd: CarDrive, g: CarGear, torque: number, omegaIn: number): number =>
  (cd.axle.ratio * cd.axle.efficiency * g.ratio * (g.efficiency * torque - spinNm(cd, omegaIn))) / drivenRadius(cd);

/** The input torque that gives force F at the driven tyres in steady drive: forceFromInput inverted. */
export const inputForForce = (cd: CarDrive, g: CarGear, force: number, omegaIn: number): number =>
  ((force * drivenRadius(cd)) / (cd.axle.ratio * cd.axle.efficiency * g.ratio) + spinNm(cd, omegaIn)) / g.efficiency;

/** What the driver asks of the driven tyres at these loads and surfaces: GRIP_TARGET of their peak, N. */
export function gripForce(cd: CarDrive, fz: ArrayLike<number>, surfaceMu: ArrayLike<number>): number {
  const tyre = longitudinalOf(cd.tyre);
  return cd.driven.reduce((s, i) => s + RUN.gripTarget * tyre.peakMu(fz[i]!) * fz[i]! * surfaceMu[i]!, 0);
}

const mf = newMfForces();
const peaks = new WeakMap<object, Map<number, number>>();
/** Steady longitudinal slip at which one tyre at load fz pulls `force` on a dry road; the peak slip if it cannot. */
export function slipFor(cd: CarDrive, force: number, fz: number): number {
  const set = cd.tyre.set;
  const at = (k: number) => {
    mfEval(set, k, 0, 0, fz, 1, mf);
    return mf.fx;
  };
  // The peak slip, by golden section below κ = 0.5 (every set of tyre-data.ts peaks there), cached per 10 N of load.
  let cache = peaks.get(set);
  if (!cache) peaks.set(set, (cache = new Map()));
  const key = Math.round(fz / 10);
  let peak = cache.get(key);
  if (peak === undefined) {
    let lo = 0;
    let hi = 0.5;
    for (let i = 0; i < 50; i++) {
      const m1 = hi - 0.618 * (hi - lo);
      const m2 = lo + 0.618 * (hi - lo);
      if (at(m1) < at(m2)) lo = m1;
      else hi = m2;
    }
    peak = (lo + hi) / 2;
    cache.set(key, peak);
  }
  if (force >= at(peak)) return peak;
  let lo = -0.5;
  let hi = peak;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < force) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Each driven wheel's load at rest on the level, N. */
const staticDrivenLoad = (cd: CarDrive): number => {
  const m = drivingMassKg(cd.car);
  const share = cd.car.drive === 'fwd' ? cd.car.body.frontShare : 1 - cd.car.body.frontShare;
  return (m * G * share) / 2;
};

/**
 * Force at the driven tyres at full load in gear `g` at road speed v, steady, N; null when the engine would be past
 * its rev limit. The engine turns with the wheels and their slip at that force (a fixed point of a few rounds).
 */
export function wheelForceN(cd: CarDrive, g: CarGear, v: number): number | null {
  const fz = staticDrivenLoad(cd);
  let kappa = 0;
  let force = 0;
  for (let i = 0; i < 8; i++) {
    const omegaIn = ((v * (1 + kappa)) / drivenRadius(cd)) * overall(cd, g);
    if (omegaIn * RPM > cd.map.limitRpm) return null;
    force = forceFromInput(cd, g, fullLoadTorque(cd.map, omegaIn), omegaIn);
    kappa = slipFor(cd, force / 2, fz);
  }
  return force;
}

/** The best force any forward gear gives at v, with the gear; null when every gear is past its limit. */
export function bestWheelForce(cd: CarDrive, v: number): { force: number; gear: CarGear } | null {
  let best: { force: number; gear: CarGear } | null = null;
  for (const g of cd.gears) {
    const f = wheelForceN(cd, g, v);
    if (f !== null && (!best || f > best.force)) best = { force: f, gear: g };
  }
  return best;
}

/** Steady top speed with this road load, m/s, and the gear it is reached in. */
export function steadyTopSpeed(cd: CarDrive, rl: RoadLoadCoeffs = roadLoadCoeffs(cd.car)): { v: number; gear: string } {
  const surplus = (v: number) => (bestWheelForce(cd, v)?.force ?? 0) - roadLoadN(rl, v, 0);
  let lo = 5;
  let hi = 150;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (surplus(mid) > 0) lo = mid;
    else hi = mid;
  }
  return { v: lo, gear: bestWheelForce(cd, lo)?.gear.name ?? '' };
}

export interface RunResult {
  /** Time to 100 km/h and to 400 m, s; null if not reached. */
  zeroTo100S: number | null;
  zeroTo400mS: number | null;
  /** Speed at 400 m, km/h. */
  at400mKmh: number | null;
  /** Speed every `sampleS`, m/s, from the start. */
  speeds: number[];
  sampleS: number;
}

export interface RunOptions {
  /** Called before every step of the dynamic run (probes and tables). */
  observe?: (veh: VehicleStep, phase: string, gear: number) => void;
  /** Step, s: the quasi-static default 1 ms; the dynamic run's default is its stable step, at most 1 ms. */
  dt?: number;
  /** Stop after this long, s. */
  maxS?: number;
  sampleS?: number;
}

/** Masses of the quasi-static model per gear: everything locked, everything but the engine, and the body alone. */
export function runMasses(cd: CarDrive): { locked: number[]; down: number[]; body: number } {
  const core = modalCore(cd);
  const undriven = [FL, FR, RL, RR].filter((i) => !cd.driven.includes(i));
  return {
    locked: cd.gears.map((g) => rigidMass(cd, core, [CLUTCH, g.element])),
    down: cd.gears.map((g) => rigidMass(cd, core, [g.element], [CRANK])),
    body: drivingMassKg(cd.car) + undriven.reduce((s, i) => s + cd.wheelInertia[i]! / cd.radius[i]! ** 2, 0),
  };
}

class Recorder {
  readonly result: RunResult;
  private next = 0;
  constructor(sampleS: number) {
    this.result = { zeroTo100S: null, zeroTo400mS: null, at400mKmh: null, speeds: [], sampleS };
  }
  /** Records the step from (t0, v0, x0) to (t1, v1, x1); true once both marks are passed. */
  add(t0: number, v0: number, x0: number, t1: number, v1: number, x1: number): boolean {
    const r = this.result;
    while (this.next * r.sampleS <= t1 + 1e-12) {
      const t = this.next * r.sampleS;
      r.speeds.push(t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1);
      this.next++;
    }
    const mark = 100 / KMH;
    if (r.zeroTo100S === null && v1 >= mark && v1 > v0) r.zeroTo100S = t0 + ((mark - v0) / (v1 - v0)) * (t1 - t0);
    if (r.zeroTo400mS === null && x1 >= 400 && x1 > x0) {
      const s = (400 - x0) / (x1 - x0);
      r.zeroTo400mS = t0 + s * (t1 - t0);
      r.at400mKmh = (v0 + s * (v1 - v0)) * KMH;
    }
    return r.zeroTo100S !== null && r.zeroTo400mS !== null;
  }
}

/** The standing start by the quasi-static model. */
export function quasiStaticRun(cd: CarDrive, o: RunOptions = {}): RunResult {
  const dt = o.dt ?? 0.001;
  const rec = new Recorder(o.sampleS ?? 0.1);
  const rl = roadLoadCoeffs(cd.car);
  const chassis = new LongitudinalChassis(longitudinalSpec(cd.car));
  const masses = runMasses(cd);
  const r = drivenRadius(cd);
  const fz = new Float64Array(WHEELS);
  const dry = Float64Array.of(1, 1, 1, 1);
  const omegaL = launchOmega(cd);
  let phase: 'launch' | 'drive' | 'lift' | 'shift' = 'launch';
  let g = 0;
  let shiftT = 0;
  let liftT = 0;
  let backT = Number.NEGATIVE_INFINITY;
  let t = 0;
  let v = 0;
  let x = 0;
  let a = 0;
  while (t < (o.maxS ?? 60)) {
    chassis.ax = a;
    const { front, rear } = chassis.axleLoads();
    fz.set([front / 2, front / 2, rear / 2, rear / 2]);
    const grip = gripForce(cd, fz, dry);
    const resist = v > 0 ? roadLoadN(rl, v, 0) : 0;
    const gear = cd.gears[g]!;
    // The engine turns with the driven wheels and their slip at the force the tyres pull now.
    const tyreForce = masses.body * a + resist;
    const kappa = v > 3 ? slipFor(cd, tyreForce / 2, fz[cd.driven[0]]!) : 0;
    const omegaIn = ((v * (1 + kappa)) / r) * overall(cd, gear);
    if (phase === 'launch') {
      const engine = forceFromInput(cd, gear, fullLoadTorque(cd.map, omegaL) * Math.min(1, t / RUN.launchRampS), omegaIn);
      a = Math.max(0, Math.min((engine - resist) / masses.down[g]!, (grip - resist) / masses.body));
      if (omegaIn >= omegaL) phase = 'drive';
    } else if (phase === 'drive' || phase === 'lift') {
      if (phase === 'drive' && omegaIn >= shiftOmega(cd) && g < cd.gears.length - 1) {
        phase = 'lift';
        liftT = t;
      }
      const ramp = phase === 'lift' ? Math.max(0, 1 - (t - liftT) / RUN.torqueRampS) : Math.min(1, (t - backT) / RUN.torqueRampS);
      const engine = forceFromInput(cd, gear, ramp * fullLoadTorque(cd.map, omegaIn), omegaIn);
      a = Math.min((engine - resist) / masses.locked[g]!, (ramp * grip - resist) / masses.body);
      if (phase === 'lift' && t - liftT >= RUN.torqueRampS) {
        phase = 'shift';
        shiftT = t;
      }
    }
    if (phase === 'shift') {
      a = -resist / masses.down[g + 1]!;
      if (t - shiftT >= RUN.shiftS) {
        g++;
        phase = 'drive';
        backT = t;
      }
    }
    const v1 = Math.max(0, v + a * dt);
    const x1 = x + v1 * dt;
    const done = rec.add(t, v, x, t + dt, v1, x1);
    t += dt;
    v = v1;
    x = x1;
    if (done && o.maxS === undefined) break;
  }
  return rec.result;
}

/** Sets the car rolling at v in gear `g` with the clutch closed: every member at its rigid speed, the tyres untwisted. */
export function setRolling(cd: CarDrive, veh: VehicleStep, v: number, g: CarGear): void {
  const ch = veh.chassis as LongitudinalChassis;
  ch.v = v;
  for (let i = 0; i < WHEELS; i++) veh.bus.omega[i] = v / cd.radius[i]!;
  const wheel = v / drivenRadius(cd);
  const output = wheel * cd.axle.ratio;
  const input = output * g.ratio;
  const speeds: Record<string, number> = {
    crank: input, disc: input, 'disc-hub': input, input, output, [PROP_FRONT]: output, [PINION]: output, [DIFF_CASE]: wheel, [SIDE_LEFT]: wheel, [SIDE_RIGHT]: wheel,
  };
  const { core } = veh.solver;
  core.coords.forEach((id, k) => {
    const s = speeds[id];
    if (s === undefined) throw new Error(`setRolling: no speed for coordinate ${id}`);
    veh.solver.phiDot[k] = s;
  });
  veh.solver.command[elementIndex(core, CLUTCH)] = 1;
  veh.solver.command[elementIndex(core, g.element)] = RUN.sleeveN;
}

/** The standing start by the whole core on the longitudinal chassis, driven by the protocol at the top. */
export function dynamicRun(cd: CarDrive, o: RunOptions = {}): RunResult {
  const veh = carVehicle(cd);
  const s = veh.solver;
  const { core } = s;
  const ch = veh.chassis as LongitudinalChassis;
  const dt = o.dt ?? 0.001;
  const rec = new Recorder(o.sampleS ?? 0.1);
  const masses = runMasses(cd);
  const crank = memberIndex(core, CRANK);
  const clutch = elementIndex(core, CLUTCH);
  const E = core.elements;
  const omegaL = launchOmega(cd);
  let phase: 'launch' | 'drive' | 'lift' | 'shift' | 'close' = 'launch';
  let g = 0;
  let shiftT = 0;
  let liftT = 0;
  let backT = Number.NEGATIVE_INFINITY;
  let feel = 0;
  const peakSlip = slipFor(cd, Number.POSITIVE_INFINITY, staticDrivenLoad(cd));
  /** Share of the asked torque the driver keeps when the driven tyres slip past their peak slip. */
  const easing = (): number => {
    const [l, r] = cd.driven;
    const slip = (veh.bus.omega[l]! * cd.radius[l]! + veh.bus.omega[r]! * cd.radius[r]!) / 2 - ch.v;
    const allowed = peakSlip * Math.max(ch.v, SLIP_SPEED);
    return slip <= allowed ? 1 : Math.max(0, 2 - slip / allowed);
  };
  s.drive[crank] = omegaL;
  core.coords.forEach((id, k) => {
    if (id === CRANK || id === 'disc') s.phiDot[k] = omegaL;
  });
  s.command[elementIndex(core, cd.gears[0]!.element)] = RUN.sleeveN;
  while (veh.time < (o.maxS ?? 60)) {
    feel += (dt / (RUN.feelS + dt)) * (ch.ax - feel);
    const grip = gripForce(cd, veh.bus.fz, veh.bus.surfaceMu);
    const gear = cd.gears[g]!;
    const omegaE = s.memberSpeed(crank);
    // Speeds from the driven wheels, which the body steadies: the shafts between them and the box ring.
    const wheel = (veh.bus.omega[cd.driven[0]]! + veh.bus.omega[cd.driven[1]]!) / 2;
    const omegaIn = wheel * overall(cd, gear);
    if (phase === 'launch') {
      // The clutch passes what the tyres take with the downstream masses accelerating, up to the engine's full load.
      const ramp = Math.min(1, veh.time / RUN.launchRampS);
      const want = ramp * easing() * Math.min(fullLoadTorque(cd.map, omegaL), inputForForce(cd, gear, grip + (masses.down[g]! - masses.body) * feel, omegaIn));
      const mu = stribeckMu(E.muStatic[clutch]!, E.muKinetic[clutch]!, E.stribeck[clutch]!, s.slip[clutch]!);
      s.command[clutch] = Math.min(1, Math.max(0, want) / (mu * E.scale[clutch]!));
      if (s.state[clutch] === LOCKED) {
        s.drive[crank] = Number.NaN;
        s.command[clutch] = 1;
        phase = 'drive';
      }
    } else if (phase === 'drive' || phase === 'lift') {
      if (phase === 'drive' && omegaE >= shiftOmega(cd) && g < cd.gears.length - 1) {
        phase = 'lift';
        liftT = veh.time;
      }
      if (phase === 'lift' && veh.time - liftT >= RUN.torqueRampS) {
        phase = 'shift';
        shiftT = veh.time;
        s.memberTorque[crank] = 0;
        s.command[clutch] = 0;
        s.command[elementIndex(core, gear.element)] = 0;
        s.command[elementIndex(core, cd.gears[g + 1]!.element)] = RUN.sleeveN;
      } else {
        const ramp = phase === 'lift' ? Math.max(0, 1 - (veh.time - liftT) / RUN.torqueRampS) : Math.min(1, (veh.time - backT) / RUN.torqueRampS);
        const want = ramp * easing() * Math.min(fullLoadTorque(cd.map, omegaE), inputForForce(cd, gear, grip + (masses.locked[g]! - masses.body) * feel, omegaIn));
        s.memberTorque[crank] = omegaE * RPM > cd.map.limitRpm ? stubTorque(cd.map, omegaE, 1) : want;
      }
    }
    if (phase === 'shift' || phase === 'close') {
      // The engine follows the new gear's input speed, so the clutch closes on no slip.
      s.drive[crank] = wheel * overall(cd, cd.gears[g + 1]!);
      if (phase === 'shift' && veh.time - shiftT >= RUN.shiftS && s.state[elementIndex(core, cd.gears[g + 1]!.element)] === LOCKED) {
        s.command[clutch] = 1;
        phase = 'close';
      }
      if (phase === 'close' && s.state[clutch] === LOCKED) {
        s.drive[crank] = Number.NaN;
        s.memberTorque[crank] = 0;
        g++;
        phase = 'drive';
        backT = veh.time;
      }
    }
    o.observe?.(veh, phase, g);
    const [t0, v0, x0] = [veh.time, ch.v, ch.x];
    veh.step(dt);
    const done = rec.add(t0, v0, x0, veh.time, ch.v, ch.x);
    if (done && o.maxS === undefined) break;
  }
  return rec.result;
}

/** Top speed of the whole core: rolling at v0 in gear `g` at full load for `seconds`, the speed it ends at, m/s. */
export function dynamicTopSpeed(cd: CarDrive, g: CarGear, v0: number, seconds: number, dt = 0.001): { v: number; drift: number } {
  const veh = carVehicle(cd);
  const s = veh.solver;
  const ch = veh.chassis as LongitudinalChassis;
  setRolling(cd, veh, v0, g);
  const crank = memberIndex(s.core, CRANK);
  let before = 0;
  while (veh.time < seconds) {
    s.memberTorque[crank] = stubTorque(cd.map, s.memberSpeed(crank), 1);
    veh.step(dt);
    if (before === 0 && veh.time >= seconds - 1) before = ch.v;
  }
  return { v: ch.v, drift: ch.v - before };
}
