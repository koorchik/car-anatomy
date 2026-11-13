// The cheap way to an axle's static kinematics, for the designer and its sensitivity runs: a handful of exact solves at
// design instead of the whole grid of buildAxle. Everything first-order (camber gain, bump steer, roll centre, instant
// centres, motion ratios, the steering axis and its traces) comes from the solver's Jacobian at travel 0; two solves
// ±2 mm away give the rising rate of the motion ratio and how the camber gain grows; two at the travel of a 3° body
// roll give where the roll centre goes in roll. Conventions are at the top of kinematics.ts.

import type { AxleSpec } from './spec.ts';
import { Axle, newCornerSample, type CornerSample } from './kinematics.ts';
import { CornerSolver, POSE_SIZE } from './solve.ts';
import { rotateQuatBy } from './vec.ts';

/** Travel step of the second-order differences, m. */
export const LITE_STEP_M = 0.002;
/** Body roll at which the roll centre's migration is measured, rad. */
export const LITE_ROLL_RAD = (3 * Math.PI) / 180;

export interface AxleLite {
  spec: AxleSpec;
  /** Every quantity the table holds, exactly, at design (travel 0, rack 0), left corner. */
  design: CornerSample;
  /** Road-relative roll camber factor: the share of body roll that reaches the outer wheel's camber to the road,
   *  1 − (t/2)·|dγ/dq|. */
  rcf: number;
  /** d(mr)/dq of the spring and the damper, 1/m: positive for a rising rate. */
  mrSpringSlope: number;
  mrDamperSlope: number;
  /** d(camber gain)/dq, rad/m². */
  camberGainSlope: number;
  /** Geometric roll centre with the body rolled by LITE_ROLL_RAD: the outer wheel `(t/2)·sin φ` into bump, the inner as
   *  far into droop (rolledRollCentre); m. */
  rolled: RolledRollCentre;
  /** Toe change of the left wheel per metre of rack moving left (+y) at design, rad/m; NaN when the axle does not
   *  steer. */
  steerPerRack: number;
  /** Exact solves it took. */
  solves: number;
}

export interface RolledRollCentre {
  /** Height above the road under the rolled body, m. */
  heightM: number;
  /** Shift along the road from the middle between the two contact points toward the outer wheel, m. */
  lateralM: number;
}

/** Slope of a left corner's force line, rising inboard: from the contact point through the front-view instant centre,
 *  square to the knuckle's motion there; tanβ when the knuckle only translates (instant centre at infinity). */
function forceLineSlope(c: CornerSample): number {
  return Number.isNaN(c.icFrontY) ? c.tanBeta : (c.icFrontZ - c.contactZ) / (c.contactY - c.icFrontY);
}

/**
 * Geometric roll centre of a rolled axle: where the force lines of the two wheels cross. `outer` is the left corner at
 * its travel (into bump), `inner` the left corner at the inner wheel's travel; the right corner is its mirror. Each line
 * runs from its contact point through its instant centre, in the body frame, where the contact points are not level:
 * the outer one sits about its travel higher, the inner one lower, and the road under the rolled body is the line
 * through the two. The research's closed form (z = T·tanβ_o·tanβ_i/(tanβ_o + tanβ_i)) puts both contact points on one
 * level, which holds for slopes measured from the road; with the body's slopes it drops a swing axle's roll centre
 * below its pivot and moves it sideways. At design the slope equals tanβ, so with no roll this is y_C·tanβ. NaN when
 * the lines are parallel.
 */
export function rolledRollCentre(outer: CornerSample, inner: CornerSample): RolledRollCentre {
  const yo = outer.contactY;
  const zo = outer.contactZ;
  const yi = -inner.contactY;
  const zi = inner.contactZ;
  const bo = forceLineSlope(outer);
  // The mirrored inner line rises inboard, toward +y, with the inner corner's slope.
  const bi = forceLineSlope(inner);
  // z = zo + bo·(yo − y) and z = zi + bi·(y − yi)
  const y = (zo - zi + bo * yo + bi * yi) / (bo + bi);
  const z = zo + bo * (yo - y);
  // The road: from the inner contact point to the outer one, measured from its middle.
  const ry = yo - yi;
  const rz = zo - zi;
  const len = Math.hypot(ry, rz);
  const my = y - (yo + yi) / 2;
  const mz = z - (zo + zi) / 2;
  return { heightM: (ry * mz - rz * my) / len, lateralM: (ry * my + rz * mz) / len };
}

/** Static kinematics of an axle from about ten exact solves (see the header). */
export function buildAxleLite(spec: AxleSpec): AxleLite {
  const axle = new Axle(spec, { table: false });
  const solver = axle.solver;
  let solves = 0;
  const design = newCornerSample();
  const pose = CornerSolver.identity();
  const first = solver.solve(pose, 0, 0, 40);
  solves++;
  if (!first.ok) throw new Error(`The corner does not assemble at design: ${first.worst}`);
  axle.measure(pose, 0, 0, design);

  // Exact solve at `travel`, warm-started from design with the first-order predictor.
  const v = new Float64Array(solver.n);
  solver.derivatives(pose, 0, 0, v, null);
  const at = (travel: number): CornerSample => {
    const p = new Float64Array(POSE_SIZE);
    p.set(pose);
    p[0] += v[0] * travel;
    p[1] += v[1] * travel;
    p[2] += v[2] * travel;
    rotateQuatBy(p, 3, v[3] * travel, v[4] * travel, v[5] * travel);
    if (solver.split) p[7] += v[6] * travel;
    const res = solver.solve(p, travel, 0, 20);
    solves++;
    if (!res.ok) throw new Error(`The corner does not solve at ${(travel * 1000).toFixed(1)} mm: ${res.worst}`);
    const s = newCornerSample();
    axle.measure(p, travel, 0, s);
    return s;
  };
  const h = LITE_STEP_M;
  const up = at(h);
  const down = at(-h);
  const dz = (spec.track / 2) * Math.sin(LITE_ROLL_RAD);
  const rolled = rolledRollCentre(at(dz), at(-dz));

  let steerPerRack = NaN;
  if (solver.steerRow() >= 0) {
    const dr = new Float64Array(solver.n);
    solver.derivatives(pose, 0, 0, null, dr);
    const s = [0, 0, 0];
    solver.direction(pose, spec.spinAxis, s);
    // dτ = (s_y·ds_x − s_x·ds_y)/(s_x² + s_y²), ds = ω × s
    const dsx = dr[4] * s[2] - dr[5] * s[1];
    const dsy = dr[5] * s[0] - dr[3] * s[2];
    steerPerRack = (s[1] * dsx - s[0] * dsy) / (s[0] * s[0] + s[1] * s[1]);
  }

  return {
    spec,
    design,
    rcf: 1 - (spec.track / 2) * Math.abs(design.camberGain),
    mrSpringSlope: (up.mrSpring - down.mrSpring) / (2 * h),
    mrDamperSlope: (up.mrDamper - down.mrDamper) / (2 * h),
    camberGainSlope: (up.camberGain - down.camberGain) / (2 * h),
    rolled,
    steerPerRack,
    solves,
  };
}
