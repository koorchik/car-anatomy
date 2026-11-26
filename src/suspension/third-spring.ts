// What a pushrod axle's third spring adds in heave and in roll (stage P14, the pushrod page). Both rockers turn alike
// when both wheels rise, and the spring between them is squeezed; when one wheel rises and the other drops they turn
// against each other and its length barely changes. Measured here the exact way, not by a motion ratio: the rocker's
// angle at a travel from the corner spring's length there (kinematics.ts), the third spring's length through both
// rockers (rocker.ts), and its energy ½·k₃·ΔL₃² shared by the two wheels, so each wheel gets k₃·(ΔL₃/q)²/2.

import { buildAxle, newCornerSample } from './kinematics.ts';
import { Rocker, thirdSpringLength, thirdSpringRatio } from './rocker.ts';
import type { AxleSpec, Vec3 } from './spec.ts';
import { thirdSpringRate } from './templates/pushrod.ts';

/** Travel of each wheel the rates are measured over, m: 10 mm, both up for heave, one up and one down for roll. */
export const MODE_TRAVEL_M = 0.01;

/** Wheel rates of an axle in heave and in roll, N/m at each wheel, and its roll stiffness from them, N·m/rad. */
export interface AxleModes {
  /** The corner spring alone, at the wheel. */
  springWheelNm: number;
  /** What the third spring adds at each wheel: both wheels up, one up and one down. */
  thirdHeaveNm: number;
  thirdRollNm: number;
  heaveNm: number;
  rollWheelNm: number;
  /** Roll stiffness of the springs, k_roll·t²/2 (no anti-roll bar). */
  rollNmRad: number;
}

/** A pushrod axle's modes with a third spring that adds `thirdWheelNm` at each wheel in heave (0: none). */
export function axleModes(spec: AxleSpec, thirdWheelNm: number): AxleModes {
  const r = spec.spring.rocker;
  const third = spec.thirdSpring;
  if (!r || spec.spring.wheel === 'strut' || !third) throw new Error('Only a pushrod axle with a third spring has these modes');
  const axle = buildAxle(spec);
  const s = newCornerSample();
  axle.measureAt(0, s);
  const springWheelNm = spec.spring.rate * s.mrSpring * s.mrSpring;
  const rocker = new Rocker(r, spec.spring.wheel as Vec3);
  const body = spec.spring.body;
  const E = [0, 0, 0];
  const lenAt = (theta: number): number => {
    rocker.elementEndAt(theta, E);
    return Math.hypot(E[0] - body[0], E[1] - body[1], E[2] - body[2]);
  };
  // The rocker's angle at a travel, from the spring's length there: it shortens as the rocker turns up.
  const angleAt = (q: number): number => {
    axle.measureAt(q, s);
    const want = s.springLen;
    let lo = -1;
    let hi = 1;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (lenAt(mid) > want) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const k3 = thirdSpringRate(spec, third.rockerPoint, thirdWheelNm);
  const q = MODE_TRAVEL_M;
  const up = angleAt(q);
  const down = angleAt(-q);
  const L0 = thirdSpringLength(rocker, third.rockerPoint, angleAt(0), angleAt(0));
  const perWheel = (dL: number): number => (k3 * (dL / q) ** 2) / 2;
  const thirdHeaveNm = perWheel(L0 - thirdSpringLength(rocker, third.rockerPoint, up, up));
  const thirdRollNm = perWheel(L0 - thirdSpringLength(rocker, third.rockerPoint, up, down));
  const rollWheelNm = springWheelNm + thirdRollNm;
  return {
    springWheelNm,
    thirdHeaveNm,
    thirdRollNm,
    heaveNm: springWheelNm + thirdHeaveNm,
    rollWheelNm,
    rollNmRad: (rollWheelNm * spec.track * spec.track) / 2,
  };
}

/** What the axle's own third spring adds at each wheel in heave, N/m: k₃·mr₃²·2 at design (0 without one). */
export function ownThirdWheelNm(spec: AxleSpec): number {
  const third = spec.thirdSpring;
  if (!third || !spec.spring.rocker || !(third.rate > 0)) return 0;
  const s = newCornerSample();
  buildAxle(spec).measureAt(0, s);
  const mr3 = thirdSpringRatio(spec, third.rockerPoint) * s.mrSpring;
  return 2 * third.rate * mr3 * mr3;
}
