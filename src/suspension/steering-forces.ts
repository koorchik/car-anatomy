// Forces in the steering (suspensions plan, stage 13): moments about the steering axes, the torque at the steering
// wheel with and without assist, braking on a split-μ road, and the tug of the drive force on the kingpin offset at the
// hub. No text; conventions are at the top of kinematics.ts and steering.ts.
//
// Moments about a steering axis, per wheel, positive when they turn the wheel back to straight ahead (aligning):
//   - side force F_y on the trail: F_y·(n + t_p)·u_z, n the mechanical trail at the road, t_p the tyre's pneumatic
//     trail, which the Magic Formula gives through its aligning moment M_z (t_p = −M_z/F_y), and u_z the vertical part of
//     the axis' unit direction, 1/√(1 + tan²ν + tan²σ): both act about the vertical through the contact patch, and the
//     steering axis, leaning back by the caster ν and in by the inclination σ, takes that share of them;
//   - the body's weight lifted by the steer (the nose lift, steering.ts): F_z·dh/dδ, the work of raising the body;
//   - standing still, the tyre twisting in its contact patch: M = (μ/3)·√(F_z³/p) with p the inflation pressure, a
//     rule of thumb for a tyre turned on the spot (docs/suspension-model.md; its source is still to be checked). The scrub radius lets the
//     patch roll on a small circle instead of twisting and lowers it; that is left out.
// The torque at the steering wheel without assist is Σ M / (i·η): i the overall ratio there (steering-wheel angle per
// road-wheel angle, the local one at a variable gear) and η the gear's efficiency (steering.ts).
//
// Assist (illustrative, as the plan asks: makers do not publish their control laws): below ASSIST_THRESHOLD_NM the
// driver carries the torque alone, so the wheel keeps its feel on centre; above it the assist carries `gain` times
// what the driver adds, up to its `capacity` (in steering-wheel newton-metres), past which the driver carries the rest.
// The numbers of each kind are choices of the model that order the kinds the way the plan's article describes them (a
// motor on the column is the weakest, on the rack the strongest); none is a maker's figure.

import type { Tyre } from '../vehicle/tyre.ts';
import { mfForces, newMfForces } from '../vehicle/tyre.ts';
import type { SteeringAssist } from './steering.ts';

/** Steering-wheel torque the driver carries alone before the assist starts, N·m (illustrative). */
export const ASSIST_THRESHOLD_NM = 1;

/** Each assist: how many times the driver's torque past the threshold it adds, and the most it adds, in N·m at the
 *  steering wheel. Illustrative (see the header). By wire there is no shaft: the feel is the motor's, shaped like the
 *  others, and the road wheels have their own motor with no limit the driver feels. */
export const ASSIST_CURVES: Record<SteeringAssist, { gain: number; capacityNm: number }> = {
  none: { gain: 0, capacityNm: 0 },
  hydraulic: { gain: 8, capacityNm: 100 },
  'electro-hydraulic': { gain: 8, capacityNm: 80 },
  'electric-column': { gain: 6, capacityNm: 60 },
  'electric-pinion': { gain: 8, capacityNm: 80 },
  'electric-rack': { gain: 10, capacityNm: 120 },
  'by-wire': { gain: 10, capacityNm: Infinity },
};

/** The torque the driver feels at the steering wheel when the steering needs `manualNm` without assist (signed). */
export function driverTorque(assist: SteeringAssist, manualNm: number): number {
  const { gain, capacityNm } = ASSIST_CURVES[assist];
  const m = Math.abs(manualNm);
  if (m <= ASSIST_THRESHOLD_NM || gain === 0) return manualNm;
  const boosted = ASSIST_THRESHOLD_NM + (m - ASSIST_THRESHOLD_NM) / (1 + gain);
  return Math.sign(manualNm) * Math.max(boosted, m - capacityNm);
}

/** Torque at the steering wheel without assist for a sum of moments about the steering axes (N·m), the overall ratio
 *  there and the gear's efficiency. */
export const manualTorque = (kingpinNm: number, ratio: number, efficiency: number): number => kingpinNm / (ratio * efficiency);

const mf = newMfForces();

/**
 * One wheel's side force and aligning moment at load `fz` for the side force `fy` it must make (N, positive), on a
 * straight wheel: the slip angle found by bisection, then the Magic Formula's M_z. NaN past the tyre's peak.
 */
export function tyreAligning(tyre: Tyre, fz: number, fy: number): { alpha: number; mz: number; pneumaticTrail: number } {
  const force = (a: number): number => {
    mfForces(tyre.set, 'left', 0, -a, 0, fz, 1, mf);
    return mf.fy;
  };
  if (!(fy > 0)) return { alpha: 0, mz: 0, pneumaticTrail: NaN };
  let lo = 0;
  let hi = 0.02;
  while (force(hi) < fy) {
    if (hi > 0.5) return { alpha: NaN, mz: NaN, pneumaticTrail: NaN };
    lo = hi;
    hi *= 1.5;
  }
  for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (force(mid) < fy) lo = mid;
    else hi = mid;
  }
  const alpha = (lo + hi) / 2;
  mfForces(tyre.set, 'left', 0, -alpha, 0, fz, 1, mf);
  // A left-pushing force from a negative α: the aligning moment turns the wheel back to the right, M_z < 0.
  return { alpha, mz: mf.mz, pneumaticTrail: -mf.mz / mf.fy };
}

/** Moment about a steering axis from a side force on a wheel, aligning positive: (F_y·n − M_z)·u_z (see the header). */
export function sideForceMoment(fy: number, mz: number, trailM: number, caster: number, kpi: number): number {
  const uz = 1 / Math.sqrt(1 + Math.tan(caster) ** 2 + Math.tan(kpi) ** 2);
  return (fy * trailM - mz) * uz;
}

/** Inflation pressure the standstill rule uses, Pa: a typical 2.3 bar (an estimate). */
export const TYRE_PRESSURE_PA = 2.3e5;

/** Moment to twist one tyre on the spot, N·m: (μ/3)·√(F_z³/p) (see the header). */
export const standstillMoment = (mu: number, fz: number, pressurePa = TYRE_PRESSURE_PA): number =>
  (mu / 3) * Math.sqrt((fz * fz * fz) / pressurePa);

/**
 * Braking on a split-μ road: the left wheels on the low μ, the right ones on the high, each front wheel at its own
 * limit (an ABS that holds each wheel, as most do at the front). Moments about the steering axes come from the brake
 * forces on the scrub radius (outboard brakes: the force acts in the patch; positive scrub puts the patch outboard of
 * the axis) or, with the brakes inboard, the force at the hub on the kingpin offset there.
 *
 * Returns the net moment the brakes put on the steering, positive turning the wheels toward the high-μ side, and the
 * difference of the front brake forces. Positive scrub turns the wheels toward the grippier side, where the car's yaw
 * already pulls it; negative scrub turns them away and so against the pull.
 */
export function splitMuSteer(input: {
  /** Load on each front wheel, N. */
  fz: number;
  muLow: number;
  muHigh: number;
  /** Lever of the brake force about the steering axis: the scrub radius, or the kingpin offset at the hub when the
   *  brakes sit inboard, m (positive with the axis inboard). */
  leverM: number;
}): { kingpinNm: number; forceDifferenceN: number } {
  const forceDifferenceN = (input.muHigh - input.muLow) * input.fz;
  return { kingpinNm: forceDifferenceN * input.leverM, forceDifferenceN };
}

/** Moment about one steering axis from a drive force at the hub on the kingpin offset there, N·m: the tug that each
 *  front wheel puts on the steering under power (it cancels only while both wheels pull alike). */
export const spindleMoment = (driveForceN: number, kingpinOffsetM: number): number => driveForceN * kingpinOffsetM;
