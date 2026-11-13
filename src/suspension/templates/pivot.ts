// Trailing arm, semi-trailing arm and swing axle: one family of corners whose wheel carrier is rigid to one arm turning
// about one axis fixed in the body. The plan-view angle of the axis (sweep) runs from 0° (across the car: trailing arm)
// through 10–25° (semi-trailing, the range of the suspensions plan) to 90° (along the car through the inner joint:
// swing axle), so one slider turns each layout into the next. The knuckle's position is a closed form
// (solve-pivot.ts).
//
// The axis passes through the inner pivot Q, `armM` ahead of the wheel centre, `pivotYM` from the car's centre line,
// `pivotZM` above the road, and leans out and forward by the sweep α. In the front view it pierces the wheel's
// transverse plane at y = pivotYM − armM·cot α, height pivotZM (a horizontal axis), which is the instant centre; the
// line from the contact patch through it crosses the centre line at the roll centre
//   h_RC = pivotZM·y_C / (y_C − pivotYM + armM·cot α),
// zero for a trailing arm (cot α → ∞) and the pivot height for a swing axle about the centre line. The camber gain at
// design is −sin α / d, d being the plan-view distance from the wheel centre to the axis.
//
// No drawing of a real car is behind these numbers: every point here is typical geometry, an estimate
// (docs/suspension-model.md has the table). The half-shaft joint limits are the GKN figures of the macpherson corner.

import type { AxleSpec, LayoutId, PivotLinkage, Vec3 } from '../spec.ts';
import { add, cross, dist, dot, scale, sub, unit } from '../vec.ts';
import { pivotFrontViewCentre, PivotSolver } from '../solve-pivot.ts';
import { CornerSolver } from '../solve.ts';

export type PivotLayout = Extract<LayoutId, 'trailing-arm' | 'semi-trailing' | 'swing-axle'>;

export interface PivotIntent {
  /** Plan-view angle of the pivot axis from the car's transverse axis, degrees, outer end forward: 0 a trailing arm,
   *  90 a swing axle. */
  sweepDeg: number;
  /** Side-view slope of the axis, degrees, positive when it rises toward the front. A transverse axis has none. */
  svAngleDeg: number;
  /** The inner pivot Q: how far ahead of the wheel centre, how far from the car's centre line, how high above the road
   *  at design, m. A swing axle turns about its inner joint, so there Q's y and z are the joint's. */
  armM: number;
  pivotYM: number;
  pivotZM: number;
  /** From the inner pivot to the outer bush along the axis, m (where the drawing puts the second bush). */
  bushSpanM: number;
  /** Track and wheel centre height above the road at design, m. */
  trackM: number;
  wheelCentreZM: number;
  driven: boolean;
  /** Lateral position of the half-shaft's inner joint (the differential output) of a driven trailing or semi-trailing
   *  corner, m, at wheel-centre height. A swing axle's joint is where its axis crosses the wheel's transverse plane. */
  diffOutputYM: number;
}

/** The layout a sweep angle gives. */
export function pivotLayout(sweepDeg: number): PivotLayout {
  if (sweepDeg <= 0) return 'trailing-arm';
  if (sweepDeg >= 90) return 'swing-axle';
  return 'semi-trailing';
}

const COMMON = { svAngleDeg: 0, pivotZM: 0.3, bushSpanM: 0.35, trackM: 1.4, wheelCentreZM: 0.3 } as const;

/**
 * Typical intents of each layout, estimates. The semi-trailing sweep sits in the plan's 10–25° and puts the roll centre
 * into the research's 90–120 mm for a rear axle; the swing axle turns about joints 0.1 m off the centre line, as at a
 * differential.
 */
export const PIVOT_TYPICAL: Record<PivotLayout, PivotIntent> = {
  'trailing-arm': { ...COMMON, sweepDeg: 0, armM: 0.4, pivotYM: 0.25, driven: false, diffOutputYM: 0.2 },
  'semi-trailing': { ...COMMON, sweepDeg: 15, armM: 0.35, pivotYM: 0.2, driven: true, diffOutputYM: 0.2 },
  'swing-axle': { ...COMMON, sweepDeg: 90, armM: 0, pivotYM: 0.1, driven: true, diffOutputYM: 0.1 },
};

const ARM_PART: Record<PivotLayout, string> = {
  'trailing-arm': 'susp.trailing-arm',
  'semi-trailing': 'susp.semi-trailing-arm',
  'swing-axle': 'susp.swing-axle',
};

/** Wheel travel from design to the bump stop, m, as on the macpherson corner (the plan's figure for the bump scene). */
export const PIVOT_BUMP_STOP_TRAVEL_M = 0.08;
/** Travel range of the tables, m: to a pressed bump stop and to damper top-out. Typical, an estimate. */
export const PIVOT_TRAVEL = { bumpM: 0.12, droopM: 0.1 } as const;
/** Where the coil-over sits on the arm: this share of the way from the axis to the wheel centre, then this far inboard;
 *  and how long it is at design. Typical, an estimate. */
const SPRING_SHARE = 0.75;
const SPRING_INBOARD_M = 0.15;
const SPRING_LENGTH_M = 0.3;
/** Outer CV joint of a trailing or semi-trailing half-shaft: on the hub axis this far inboard of the wheel centre, m.
 *  An estimate. */
const OUTER_JOINT_INBOARD_M = 0.12;

const DEG = Math.PI / 180;

/** Unit direction of the pivot axis, pointing out (and forward when swept). */
export function pivotAxisDirection(sweepDeg: number, svAngleDeg: number): Vec3 {
  const a = sweepDeg * DEG;
  const sa = Math.sin(a);
  return unit([sa, Math.cos(a), sa * Math.tan(svAngleDeg * DEG)]);
}

/** A single-axis corner from its intent. Spring and damper coefficients are left for the corner, as on macpherson. */
export function pivotAxle(intent: PivotIntent): AxleSpec<PivotLinkage> {
  const { sweepDeg, svAngleDeg, armM, pivotYM, pivotZM, bushSpanM, trackM, wheelCentreZM } = intent;
  if (!(sweepDeg >= 0 && sweepDeg <= 90)) {
    // Swept the other way the axis leans out and back: the roll centre goes below the road (research, semi-trailing).
    throw new Error(`The sweep of a pivot axis runs from 0° to 90°, not ${sweepDeg}°`);
  }
  if (!(Math.abs(svAngleDeg) < 45)) throw new Error(`The side-view slope ${svAngleDeg}° is not a pivot axis`);
  // A number that is not one would otherwise surface far away (a NaN plunge in the table, or a misleading message).
  for (const key of ['armM', 'pivotYM', 'pivotZM', 'bushSpanM', 'trackM', 'wheelCentreZM', 'diffOutputYM'] as const) {
    if (!Number.isFinite(intent[key])) throw new Error(`The pivot corner's ${key} is not a number: ${intent[key]}`);
  }
  if (!(bushSpanM > 0)) throw new Error(`The second bush must sit along the axis from the first, not ${bushSpanM} m`);
  if (!(trackM > 0 && wheelCentreZM > 0)) throw new Error('The track and the wheel centre height must be positive');
  const layout = pivotLayout(sweepDeg);
  const W: Vec3 = [0, trackM / 2, wheelCentreZM];
  const e = pivotAxisDirection(sweepDeg, svAngleDeg);
  const Q: Vec3 = [armM, pivotYM, pivotZM];
  const armPart = ARM_PART[layout];
  const linkage: PivotLinkage = { kind: 'pivot', axisA: Q, axisB: add(Q, scale(e, bushSpanM)), armPart };
  // Foot of the wheel centre on the axis, and the arm across it.
  const foot = add(Q, scale(e, dot(sub(W, Q), e)));
  const arm = sub(W, foot);
  // The wheel centre runs on a circle of radius |arm| about the axis; its height is c0_z + arm_z·(cos φ − 1) +
  // (e × arm)_z·sin φ (solve-pivot.ts). It reaches every height of the travel, without the arm passing the vertical
  // where the travel stops rising, only while arm_z + bump and arm_z − droop stay inside ±hypot(arm_z, (e × arm)_z).
  const reach = Math.hypot(arm[2], cross(e, arm)[2]);
  if (!(arm[2] + PIVOT_TRAVEL.bumpM < reach && arm[2] - PIVOT_TRAVEL.droopM > -reach)) {
    throw new Error('The arm is too short or too steep for the wheel travel: it would pass the vertical');
  }

  const seat = add(add(foot, scale(arm, SPRING_SHARE)), [0, -SPRING_INBOARD_M, 0]);
  const top = add(seat, [0, 0, SPRING_LENGTH_M]);

  // The swing axle's shaft is its arm: the inner joint sits on the axis, there is no outer joint, and the wheel is
  // square to the shaft. Other driven layouts run a two-joint half-shaft from the differential to the hub.
  let spinAxis: Vec3 = [0, 1, 0];
  let halfshaft: AxleSpec['halfshaft'] = null;
  if (layout === 'swing-axle') {
    const centre = pivotFrontViewCentre(linkage, W[0])!;
    const joint: Vec3 = [W[0], centre.y, centre.z];
    // The shaft runs out from its joint to the hub; a joint at or beyond the wheel centre leaves no shaft.
    if (!(joint[1] < W[1])) throw new Error(`The swing axle's joint at ${joint[1]} m is not inboard of the wheel`);
    spinAxis = unit(sub(W, joint));
    if (intent.driven) {
      halfshaft = {
        diffOutput: joint,
        outerJoint: W,
        inner: 'cross',
        outer: 'none',
        // No maker figure found for the joint; the shaft swings about ±11° over the typical travel; an estimate.
        innerMaxDeg: 20,
        outerMaxDeg: 0,
        plungeM: [0, 0],
        diameterM: 0.03,
      };
    }
  } else if (intent.driven) {
    const outerY = W[1] - OUTER_JOINT_INBOARD_M;
    if (!(intent.diffOutputYM >= 0 && intent.diffOutputYM < outerY)) {
      throw new Error(`The differential output at ${intent.diffOutputYM} m is not between the centre line and the hub`);
    }
    halfshaft = {
      diffOutput: [W[0], intent.diffOutputYM, wheelCentreZM],
      outerJoint: [W[0], outerY, W[2]],
      inner: 'tripod',
      outer: 'fixed-ball',
      // GKN, by a search excerpt of the «Spidan» brochure: tripod GI up to 23° and 50 mm of plunge, fixed AC 47°.
      innerMaxDeg: 23,
      outerMaxDeg: 47,
      plungeM: [-0.025, 0.025],
      diameterM: 0.024,
    };
  }

  const spec: AxleSpec<PivotLinkage> = {
    layout,
    track: trackM,
    linkage,
    wheelCentre: W,
    spinAxis,
    spring: { kind: 'coil', rate: 30000, progressive: null, body: top, wheel: seat },
    damper: {
      kind: 'passive',
      body: top,
      wheel: seat,
      compression: 0,
      rebound: 0,
      // As on the macpherson corner: knee at 0.1 m/s, an estimate.
      kneeMs: 0.1,
      highRatio: 0.5,
      strokeM: 0.2,
    },
    // The macpherson corner's illustrative stop; the gap is set below.
    bumpStop: { gapM: 0, lengthM: 0.06, rate: 81000 },
    driven: intent.driven,
    diff: intent.driven ? 'body' : 'none',
    halfshaft,
    travel: { ...PIVOT_TRAVEL },
  };
  spec.bumpStop.gapM = dist(top, seat) - damperLengthAt(spec, PIVOT_BUMP_STOP_TRAVEL_M);
  return spec;
}

/** Length of the damper of a single-axis corner at `travel`, by the closed form. */
export function damperLengthAt(spec: AxleSpec<PivotLinkage>, travel: number): number {
  const d = spec.damper;
  if (d.wheel === 'strut') throw new Error('A pivot arm has no strut');
  const solver = new PivotSolver(spec);
  const pose = CornerSolver.identity();
  const res = solver.solve(pose, travel, 0);
  if (!res.ok) throw new Error(`The arm does not reach ${travel} m of travel`);
  const p = [0, 0, 0];
  solver.point(pose, d.wheel, p);
  return dist(d.body, [p[0], p[1], p[2]]);
}
