// A power-split car on the road with its real engine (stage K15a): EngineSim on a LoadedCrank drives HybridLoad, so the
// engine starts and stops through EngineRequest.ignition exactly as it will on the page. Standing starts, top speed with
// and without the limiter, and where MG1 changes direction with the engine held at a speed. Scripts and tests only.

import { synthConfig } from '../audio/synth.ts';
import { buildEngine } from '../engine/kinematics.ts';
import { LoadedCrank } from '../engine/loaded-crank.ts';
import { EngineSim } from '../engine/sim.ts';
import { HybridLoad, type HybridReadings } from '../vehicle/hybrid-load.ts';
import { LINE_SHARE } from './control/ths.ts';
import { hybridLoadSpec, type PowerSplitDrive } from './power-split-car.ts';

export interface HybridRig {
  pd: PowerSplitDrive;
  sim: EngineSim;
  crank: LoadedCrank<HybridReadings>;
  load: HybridLoad;
  /** Step, s: the drivetrain's stable step, at most 1 ms. */
  dt: number;
}

/** The car switched on and standing, the engine stopped: nothing cranks it, the control decides when it runs. */
export function hybridRig(pd: PowerSplitDrive, o: { soc?: number; cap?: boolean } = {}): HybridRig {
  const spec = hybridLoadSpec(pd);
  const load = new HybridLoad(spec);
  if (o.soc !== undefined) load.control.soc = o.soc;
  load.control.capOn = o.cap ?? true;
  const sim = new EngineSim(synthConfig(buildEngine(pd.engine)).sim);
  const crank = new LoadedCrank<HybridReadings>(pd.map, load);
  sim.attach(crank);
  return { pd, sim, crank, load, dt: Math.min(0.001, spec.maxStepS) };
}

/** Steps the rig for `seconds`; `each` sees it after every step and may stop it by returning true. */
export function runRig(r: HybridRig, seconds: number, each?: (r: HybridRig) => boolean | void): void {
  const steps = Math.round(seconds / r.dt);
  for (let i = 0; i < steps; i++) {
    r.sim.step(r.dt);
    if (each?.(r)) return;
  }
}

export interface HybridRunResult {
  /** Time to 100 km/h, s; null if not reached. */
  zeroTo100S: number | null;
  /** When the engine first ran, s; null if it never did. */
  engineRunsS: number | null;
  /** Road speed at the end, km/h, and how much it still rose over the last 10 s. */
  endKmh: number;
  driftKmh: number;
  /** Speed every second, km/h. */
  kmh: number[];
}

/** Floors the pedal from rest for `seconds` and records the run. `cap: false` lifts the limited top speed. */
export function hybridRun(pd: PowerSplitDrive, o: { cap?: boolean; seconds?: number; observe?: (r: HybridRig) => void } = {}): HybridRunResult {
  const r = hybridRig(pd, { cap: o.cap ?? true });
  const seconds = o.seconds ?? 20;
  r.load.control.pedal = 1;
  let t = 0;
  let zeroTo100S: number | null = null;
  let engineRunsS: number | null = null;
  let before = 0;
  const kmh: number[] = [0];
  let v0 = 0;
  runRig(r, seconds, () => {
    t += r.dt;
    o.observe?.(r);
    const v = r.load.chassis.v;
    if (zeroTo100S === null && v >= 100 / 3.6) zeroTo100S = t - (r.dt * (v - 100 / 3.6)) / Math.max(v - v0, 1e-9);
    if (engineRunsS === null && r.sim.state === 'running') engineRunsS = t;
    if (Math.abs(t - Math.round(t)) < r.dt / 2) kmh.push(v * 3.6);
    if (before === 0 && t >= seconds - 10) before = v;
    v0 = v;
  });
  const end = r.load.chassis.v;
  return { zeroTo100S, engineRunsS, endKmh: end * 3.6, driftKmh: (end - before) * 3.6, kmh };
}

/**
 * Where MG1 stands with the engine held at `rpm` while the car pulls away and gathers speed: the road speed, m/s, and
 * the ring's speed, rpm, at the step MG1's speed turns from forward to backward (interpolated); null when the car does
 * not get there in `seconds`.
 */
export function mg1Crossing(pd: PowerSplitDrive, rpm: number, seconds = 90): { speed: number; ringRpm: number } | null {
  const r = hybridRig(pd, { cap: false });
  const c = r.load.control;
  c.holdOmega = (rpm * Math.PI) / 30;
  c.holdShare = LINE_SHARE;
  c.pedal = 0.6;
  const out = r.load.vehicle.solver.core.members.indexOf(pd.box.spec.output);
  let found: { speed: number; ringRpm: number } | null = null;
  let last = Number.NaN;
  let lastV = 0;
  let lastRing = 0;
  runRig(r, seconds, () => {
    const s = r.load.vehicle.solver;
    const w1 = s.memberSpeed(c.spec.mg1);
    const ring = (s.memberSpeed(out) * pd.kin.ring * 30) / Math.PI;
    const v = r.load.chassis.v;
    // Only once the engine runs at the held speed does the crossing say anything about the set.
    const settled = r.sim.state === 'running' && Math.abs(r.sim.rpm - rpm) < 0.02 * rpm;
    if (settled && last > 0 && w1 <= 0) {
      const f = last / (last - w1);
      found = { speed: lastV + f * (v - lastV), ringRpm: lastRing + f * (ring - lastRing) };
      return true;
    }
    last = settled ? w1 : Number.NaN;
    lastV = v;
    lastRing = ring;
  });
  return found;
}

/** The road speed, m/s, where MG1 changes direction with the engine held at `rpm` (mg1Crossing), or null. */
export const mg1CrossingOnRoad = (pd: PowerSplitDrive, rpm: number): number | null => mg1Crossing(pd, rpm)?.speed ?? null;
