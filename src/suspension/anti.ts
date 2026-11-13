// Anti-dive, anti-lift and anti-squat of a chassis at design: what share of each axle's longitudinal load transfer its
// links carry, so its springs need not (docs/research/suspensions.md, 2.2). Conventions are at the top of
// kinematics.ts; axles front and rear.
//
// The transfer m·a_x·h/L moves load between the axles whatever the links do; the links only decide how much of it goes
// through the springs, and so how far the body pitches. Axle k carries F_x,k = share_k·m·a_x along the road, through
// the heave slope T of the point that holds its torque (chassis-sim.ts: tanθ_KP of the knuckle for outboard brakes and
// a differential on the axle, tanθ_WC of the wheel centre for inboard brakes and a differential on the body), and its
// unsprung mass's own inertia through the wheel centre's slope T_WC. The links push the body up with
// −F_x,k·T + m_u,k·a_x·T_WC, so the share of the transfer they carry is
//   front:  100·(L/h)·(share_f·T_f − (m_u,f/m)·T_WC,f)
//   rear:   100·(L/h)·(−share_r·T_r + (m_u,r/m)·T_WC,r)
// in braking (anti-dive, anti-lift; share the brake balance) and under drive (anti-lift, anti-squat; share the drive
// split). Without the unsprung term it is the textbook 100·β·(L/h)·tanθ; with it, 100 % on both axles leaves the
// springs where they were (tests: under 0.2 mm of travel), while the textbook figure overstates it by m_u,k/(share·m)
// of itself, a tenth on the front of the test sedan. Slopes in heave: both wheels of the axle together, own plus cross.
// At design only: the slopes move with the travel, and a body that pitches also moves its centre of mass over the
// patches, which adds transfer the anti at design does not cover.

import type { Chassis } from './chassis.ts';
import { newWheelSample } from './chassis-axle.ts';

/** Per cent, front and rear. */
export type AxlePair = [number, number];

export interface AntiGeometry {
  /** In braking: anti-dive in front, anti-lift at the rear, %. */
  braking: AxlePair;
  /** Under drive: anti-lift in front, anti-squat at the rear, %. An undriven axle keeps only its wheels' own inertia. */
  drive: AxlePair;
  /** The same by the textbook formula, without the wheels' own inertia. */
  textbookBraking: AxlePair;
  textbookDrive: AxlePair;
  /** Heave slopes at design: of the knuckle's (axle's) point at the contact patch and of the wheel centre. */
  slopeKP: AxlePair;
  slopeWC: AxlePair;
}

export function antiGeometry(chassis: Chassis): AntiGeometry {
  const c = chassis;
  const lon = c.spec.longitudinal;
  const L = newWheelSample();
  const R = newWheelSample();
  const kp: AxlePair = [0, 0];
  const wc: AxlePair = [0, 0];
  for (const k of [0, 1] as const) {
    c.axles[k].sample(0, 0, L, R);
    kp[k] = L.tanThetaKP + L.tanThetaKPCross;
    wc[k] = L.tanThetaWC + L.tanThetaWCCross;
  }
  const driven = [c.spec.front.axle.driven, c.spec.rear.axle.driven];
  const front = driven[0] && driven[1] ? lon.driveFront : driven[0] ? 1 : 0;
  const driveShare = [driven[0] ? front : 0, driven[1] ? 1 - front : 0];
  const brakeShare = [lon.brakeFront, 1 - lon.brakeFront];
  const brakeSlope = [0, 1].map((k) => (lon.brakeInboard[k] ? wc[k] : kp[k]));
  const driveSlope = [c.spec.front.axle, c.spec.rear.axle].map((a, k) => (a.diff === 'axle' ? kp[k] : wc[k]));
  const scale = (100 * c.wheelbaseM) / c.cgHeightM;
  const unsprung = (k: number): number => (2 * c.corners[2 * k].unsprungKg * wc[k]) / c.massKg;
  const sign = [1, -1];
  const model = (share: number[], slope: number[]): AxlePair => [0, 1].map((k) => scale * sign[k] * (share[k] * slope[k] - unsprung(k))) as AxlePair;
  const textbook = (share: number[], slope: number[]): AxlePair => [0, 1].map((k) => scale * sign[k] * share[k] * slope[k]) as AxlePair;
  return {
    braking: model(brakeShare, brakeSlope),
    drive: model(driveShare, driveSlope),
    textbookBraking: textbook(brakeShare, brakeSlope),
    textbookDrive: textbook(driveShare, driveSlope),
    slopeKP: kp,
    slopeWC: wc,
  };
}
