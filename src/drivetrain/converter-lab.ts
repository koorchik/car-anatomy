// The torque converter's lab (stage K12a, demonstration 9): one run computed ahead with the same core and solver the
// car will use, at 0.25 ms, and played back at any slow-down (gearbox plan, decision 7). The page, the 3D and the
// tests all read this run.
//
// The car stands in drive, first gear (A, B and C closed), its brake floored. Our protocol [estimates]:
// - the stall test: the throttle floored for STALL_S; the engine rises until its full-load torque meets what the pump
//   absorbs with the turbine standing, T(n) = (n/K_stall)², and stays there;
// - the throttle shut, the engine back toward idle;
// - the pull-away: the brake released, the pedal at PULL_PEDAL (with the converter's 1.8 times more torque at the
//   start, a floored pedal would spin the tyres, which this lab does not model); the speed ratio rises, the torque
//   ratio falls along the measured curve to 1 at the coupling point, and the stator starts to freewheel;
// - the cruise: the rig holds the car's speed from here on, as a level road would at the pedal's steady speed; the
//   engine settles where the open converter carries its torque, at the converter's own slip;
// - the lock-up: the clutch closes under a slip controller (control/lockup.ts) to SLIP_TARGET_RPM, at the same speed
//   and pedal, so the change in slip is the clutch's alone. Without the hold the car would keep accelerating in first,
//   and the open converter's slip falls by itself as its speed rises (T ∝ n² at a given SR): a lock-up shown that way
//   would show the engine's speed, not the clutch.
//
// The engine is the dyno's torque map on the crank member (engine-stub.ts) with the boost the turbo holds at each
// speed (a steady turbo, no spool lag); the car is one inertia behind the final drive, without road load or tyre
// slip. Scripts, tests and the main thread: it derives (topology.ts).

import { brakeTorque, holdCharge, leakCharge, mapValue, peakTorque, type EngineTorqueMap } from '../engine/torque-map.ts';
import { automaticCore, withPlanetaryFriction, WHEELS, type AutomaticLoad } from './automatic.ts';
import { converterDamper, couplingPoint, lockupClutch, stallSpeed, TURBINE_INERTIA } from './converter.ts';
import { LockupControl } from './control/lockup.ts';
import { BRAKE, CRANK, elementIndex, LOCKUP, memberIndex, PUMP, TURBINE } from './core.ts';
import { DrivetrainSolver } from './solver.ts';
import type { GearboxSpec } from './spec.ts';
import { buildGearbox, stateByName } from './topology.ts';

const RPM = 30 / Math.PI;

/**
 * Gain of the idle governor in drive, charge per relative speed error [estimate]: stronger than the stub's, since the
 * converter at stall loads the idling engine. A proportional governor leaves the idle a little low in drive, as a real
 * one sags a little: the B58 idles about 60 rpm under its 940 against the 8HP51's converter (a gain of 8 left it
 * 170 rpm under, while the lab said the engine was back at idle).
 */
const IDLE_GAIN = 30;

/** The lab's step, s (gearbox plan: labs run offline at 0.25 ms). */
export const LAB_STEP_S = 0.00025;
/** A frame of the run every this many seconds. */
export const LAB_FRAME_S = 0.005;

/** The protocol [estimates]. */
export const LAB = {
  idleS: 0.5,
  /** Throttle floored with the brake held. */
  stallS: 3,
  /** Throttle shut, brake still held. */
  settleS: 1.5,
  /** Pedal of the pull-away. */
  pullPedal: 0.35,
  /** From the brake's release to the speed hold. */
  pullS: 1.5,
  /** The speed held with the converter open, long enough for the engine to settle. */
  cruiseS: 0.8,
  /** The lock-up closing and holding, the speed still held. */
  lockS: 2,
  /** The throttle and the brake move over this time, s. */
  rampS: 0.2,
};

/** The phases of the run, in order, for the page's steps. */
export type LabPhase = 'idle' | 'stall' | 'settle' | 'pull' | 'cruise' | 'lockup';

/** One run of the lab: equal-time frames, LAB_FRAME_S apart, in flat arrays. */
export interface ConverterLabRun {
  frameS: number;
  frames: number;
  /** Where each phase starts, s. */
  phases: Record<LabPhase, number>;
  /** Run length, s. */
  durationS: number;
  kStall: number;
  /** The stall speed the curves give, rpm: the root of T(n) = (n/K)². */
  stallRpm: number;
  /** The speed ratio where TR reaches 1. */
  coupling: number;
  /** Full-load torque against speed, for the stall chart: rpm and N·m. */
  curve: { rpm: number[]; nm: number[] };
  engineRpm: Float32Array;
  turbineRpm: Float32Array;
  speedKmh: Float32Array;
  sr: Float32Array;
  tr: Float32Array;
  /** Engine torque on the crank, pump and turbine torques of the converter, N·m. */
  engineNm: Float32Array;
  pumpNm: Float32Array;
  turbineNm: Float32Array;
  /** Torque the lock-up clutch passes, N·m, and its slip, rpm. */
  lockupNm: Float32Array;
  slipRpm: Float32Array;
  pedal: Float32Array;
  brake: Float32Array;
  /** 1 while the stator freewheels (past the coupling point, forward flow). */
  statorFree: Uint8Array;
}

/**
 * Brake torque of the engine at ω, rad/s, with the pedal 0…1: the charge from what leaks past a shut throttle up to
 * the boost the turbo holds at that speed (wotNm at a floored pedal), fuel cut above the rev limit, the idle
 * governor below idle (as engine-stub.ts).
 */
export function labEngineTorque(map: EngineTorqueMap, omega: number, pedal: number): number {
  const rpm = omega * RPM;
  if (rpm > map.limitRpm) return brakeTorque(map, rpm, 0);
  const top = map.boostKind === 'none' ? 1 : Math.max(1, mapValue(map, map.pressureRatio, rpm));
  const leak = leakCharge(map, rpm);
  let charge = leak + (top - leak) * Math.min(1, Math.max(0, pedal));
  if (rpm < map.idleRpm) charge = Math.max(charge, Math.min(1, holdCharge(map, rpm) * (1 + (IDLE_GAIN * (map.idleRpm - rpm)) / map.idleRpm)));
  return brakeTorque(map, rpm, charge);
}

/** The full-load torque at `rpm`: what the stall test meets. */
export const fullLoad = (map: EngineTorqueMap, rpm: number): number => labEngineTorque(map, rpm / RPM, 1);

export interface LabInput {
  /** The automatic's spec (gearboxSpec of its record), with its converter in `launch`. */
  spec: GearboxSpec;
  ratedInputNm: number;
  map: EngineTorqueMap;
  load: AutomaticLoad;
}

const ramp = (t: number, from: number, s: number): number => Math.min(1, Math.max(0, (t - from) / s));

/** Computes the run. About 50 000 steps: a few hundred milliseconds. */
export function runConverterLab(input: LabInput): ConverterLabRun {
  const { map, load } = input;
  const launch = input.spec.launch;
  if (launch?.kind !== 'converter') throw new Error(`${input.spec.id}: the lab needs a gearbox with a converter`);
  const spec = withPlanetaryFriction(input.spec, input.ratedInputNm);
  const box = buildGearbox(spec);
  const core = automaticCore(
    box,
    { engineInertia: map.inertia, damper: converterDamper(map.inertia), turbineInertia: TURBINE_INERTIA, kStall: launch.kStall, lockup: lockupClutch(peakTorque(map).nm) },
    load,
  );
  const s = new DrivetrainSolver(core);
  const crank = memberIndex(core, CRANK);
  const pump = memberIndex(core, PUMP);
  const turbine = memberIndex(core, TURBINE);
  const wheels = memberIndex(core, WHEELS);
  const lockup = elementIndex(core, LOCKUP);
  const brake = elementIndex(core, BRAKE);
  for (const id of stateByName(box, '1').closed) s.command[elementIndex(core, id)] = 1;
  // Start at idle: the crank, the pump and the spring at idle speed, the turbine and the car standing.
  const idle = map.idleRpm / RPM;
  core.coords.forEach((id, k) => {
    if (id === CRANK || id === PUMP) s.phiDot[k] = idle;
  });

  const phases: Record<LabPhase, number> = { idle: 0, stall: LAB.idleS, settle: 0, pull: 0, cruise: 0, lockup: 0 };
  phases.settle = phases.stall + LAB.stallS;
  phases.pull = phases.settle + LAB.settleS;
  phases.cruise = phases.pull + LAB.pullS;
  phases.lockup = phases.cruise + LAB.cruiseS;
  const durationS = phases.lockup + LAB.lockS;
  const frames = Math.floor(durationS / LAB_FRAME_S) + 1;
  const f32 = () => new Float32Array(frames);
  const run: ConverterLabRun = {
    frameS: LAB_FRAME_S, frames, phases, durationS, kStall: launch.kStall,
    stallRpm: stallSpeed((rpm) => fullLoad(map, rpm), launch.kStall, map.idleRpm, map.limitRpm) ?? Number.NaN,
    coupling: couplingPoint(),
    curve: { rpm: [], nm: [] },
    engineRpm: f32(), turbineRpm: f32(), speedKmh: f32(), sr: f32(), tr: f32(), engineNm: f32(), pumpNm: f32(), turbineNm: f32(),
    lockupNm: f32(), slipRpm: f32(), pedal: f32(), brake: f32(), statorFree: new Uint8Array(frames),
  };
  for (let rpm = map.idleRpm; rpm <= Math.min(map.limitRpm, 4500); rpm += 50) {
    run.curve.rpm.push(rpm);
    run.curve.nm.push(fullLoad(map, rpm));
  }

  const control = new LockupControl();
  const steps = Math.round(durationS / LAB_STEP_S);
  const every = Math.round(LAB_FRAME_S / LAB_STEP_S);
  let frame = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * LAB_STEP_S;
    const pedal = t < phases.settle ? ramp(t, phases.stall, LAB.rampS) : t < phases.pull ? 1 - ramp(t, phases.settle, LAB.rampS) : LAB.pullPedal * ramp(t, phases.pull, LAB.rampS);
    const brakeShare = 1 - ramp(t, phases.pull, LAB.rampS);
    s.command[brake] = brakeShare;
    // The rig takes the car's speed as it is when the cruise starts and holds it.
    if (t >= phases.cruise && Number.isNaN(s.drive[wheels]!)) s.drive[wheels] = s.memberSpeed(wheels);
    const wc = s.memberSpeed(crank);
    const engineNm = labEngineTorque(map, wc, pedal);
    s.memberTorque[crank] = engineNm;
    const slip = s.memberSpeed(pump) - s.memberSpeed(turbine);
    s.command[lockup] = control.step(LAB_STEP_S, t >= phases.lockup, slip);
    if (i % every === 0 && frame < frames) {
      const c = s.converter;
      run.engineRpm[frame] = wc * RPM;
      run.turbineRpm[frame] = s.memberSpeed(turbine) * RPM;
      run.speedKmh[frame] = s.memberSpeed(wheels) * load.radiusM * 3.6;
      run.sr[frame] = Math.max(0, c.sr);
      run.tr[frame] = c.tr;
      run.engineNm[frame] = engineNm;
      run.pumpNm[frame] = c.pump;
      run.turbineNm[frame] = c.turbine;
      run.lockupNm[frame] = Math.abs(s.torque[lockup]!);
      run.slipRpm[frame] = slip * RPM;
      run.pedal[frame] = pedal;
      run.brake[frame] = brakeShare;
      // Past the coupling point the stator would have to push the flow forward: its one-way clutch lets it go.
      run.statorFree[frame] = !c.reverse && c.sr > 0 && c.tr <= 1 ? 1 : 0;
      frame++;
    }
    s.step(LAB_STEP_S);
  }
  return run;
}
