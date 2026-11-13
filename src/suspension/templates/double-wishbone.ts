// Double wishbone (short-long arm) corner from engineering intents. No measured hardpoints are published for a road car
// of this type (docs/suspension-research/kinematics_geometry.md), so this is typical geometry: the points come from the
// intents, and the defaults are tuned until the corner lands inside the research ranges the tests guard (roll centre
// 30–90 mm front and 90–120 mm rear, side-view swing-arm slope 0.05–0.15, KPI 8–11°, kingpin offset at the hub
// 45–60 mm, camber gain 15–25°/m and negative over the whole bump travel).
//
// Construction, left corner, ISO 8855 (x forward, y left, z up), wheel centre W = (0, t/2, r):
//   - the steering axis passes the road at the scrub point and the wheel centre's x at hub height, leaning in by the
//     KPI and back by the caster; the two ball joints sit on it at their heights;
//   - each arm runs inboard from its ball joint, in the front view, by its length: the lower to the pivot height, the
//     upper at its slope; its pivot axis is tilted in the side view by the anti angle, its bushes ±`pivotSpreadM`
//     along it, so the arms swing in parallel planes in the side view (no caster change in bump);
//   - the tie rod (or the toe link at the rear) runs from the steering arm on the knuckle to the inner joint that makes
//     the toe curve flat at design (no bump steer, and no change of it), then `tieRodDzM` higher;
//   - the coilover sits on the lower arm and leans in; the spring rate gives the wished wheel rate at design.

import type { AxleSpec, HalfshaftSpec, Vec3, Wishbone } from '../spec.ts';
import { add, cross, dot, scale, sub, unit } from '../vec.ts';
import { Axle, newCornerSample } from '../kinematics.ts';
import { CornerSolver } from '../solve.ts';

const DEG = Math.PI / 180;

export interface WishboneIntent {
  /** Front or rear axle: sets the side of the anti effect and the defaults. */
  axle: 'front' | 'rear';
  trackM: number;
  /** Wheel centre height above the road at design: the loaded radius, m. */
  wheelCentreZM: number;
  /** Lengths of the arms in the front view, ball joint to pivot axis, m. */
  lowerArmM: number;
  upperArmM: number;
  /** Front-view slope of the upper arm, degrees, positive when its inner pivot is lower than the ball joint. It moves
   *  the instant centre and with it the roll centre and the camber gain. */
  upperAngleDeg: number;
  /** Height of the lower arm's inner pivots above the road, m. */
  lowerPivotZM: number;
  /** Heights of the ball joints above the road, m. */
  lowerBallZM: number;
  upperBallZM: number;
  /** Side-view tilt of both arm axes toward the anti effect, degrees: anti-dive in front (the wheel moves forward in
   *  bump), anti-squat and anti-lift at the rear (it moves back). */
  svAngleDeg: number;
  /** Half the bush spacing along each arm's pivot axis, m. */
  pivotSpreadM: number;
  kpiDeg: number;
  casterDeg: number;
  /** Scrub radius, m, positive when the steering axis meets the road inboard of the contact patch. */
  scrubM: number;
  /** x of the steering arm (or toe-link) end on the knuckle, m, negative behind the axle. */
  tieRodXM: number;
  /** Height of that end, m. */
  tieRodZM: number;
  /** Height shift of the inner tie-rod joint from where it gives no bump steer at design, m. */
  tieRodDzM: number;
  steered: boolean;
  driven: boolean;
  /** Distance of the differential output from the centre line, m (driven corners). */
  diffOutputYM: number;
  /** Wheel rate the spring gives at design, N/m. */
  wheelRateNm: number;
}

/**
 * Defaults of a road car. Front: steered, undriven (a rear-drive car); rear: driven. Every number is typical geometry
 * tuned to the research ranges, not taken from a car.
 */
export function wishboneDefaults(axle: 'front' | 'rear'): WishboneIntent {
  const front = axle === 'front';
  return {
    axle,
    trackM: front ? 1.52 : 1.54,
    wheelCentreZM: 0.31,
    lowerArmM: 0.38,
    upperArmM: 0.27,
    // Instant centre about 2.9 m inboard (camber gain 20°/m) at the height that puts the roll centre at 60 mm in front
    // and 105 mm at the rear.
    upperAngleDeg: front ? 5 : 1.64,
    lowerPivotZM: front ? 0.143 : 0.165,
    lowerBallZM: 0.13,
    upperBallZM: 0.47,
    svAngleDeg: front ? 5 : 6,
    pivotSpreadM: 0.14,
    kpiDeg: front ? 9.5 : 6,
    casterDeg: front ? 5.5 : 0,
    scrubM: front ? 0 : 0.02,
    tieRodXM: front ? -0.13 : -0.15,
    tieRodZM: front ? 0.29 : 0.22,
    tieRodDzM: 0,
    steered: front,
    driven: !front,
    diffOutputYM: front ? 0.22 : 0.17,
    wheelRateNm: 25000,
  };
}

/** Wheel travel from design to the bump stop, m, as on the strut page: typical. */
export const BUMP_STOP_TRAVEL_M = 0.08;

/** Hardpoints shared by the double wishbone and the multilink: the two virtual (or real) ball joints, the arms' body
 *  pivots, the steering axis, the tie rod and the coilover. */
export interface WishboneFrame {
  wheelCentre: Vec3;
  lower: Wishbone;
  upper: Wishbone;
  /** The steering axis at design: a point at road level and the unit direction upward. */
  axisGround: Vec3;
  axisDir: Vec3;
  tieRodKnuckle: Vec3;
}

/** The ball joints, arms and steering axis of the intent (no tie-rod inner point yet). */
export function wishboneFrame(it: WishboneIntent): WishboneFrame {
  const half = it.trackM / 2;
  const r = it.wheelCentreZM;
  const W: Vec3 = [0, half, r];
  const axisDir = unit([-Math.tan(it.casterDeg * DEG), -Math.tan(it.kpiDeg * DEG), 1]);
  // The axis meets the road at the scrub point and passes the wheel centre's x at hub height.
  const ground: Vec3 = [(-axisDir[0] / axisDir[2]) * r, half - it.scrubM, 0];
  const onAxis = (z: number): Vec3 => add(ground, scale(axisDir, z / axisDir[2]));
  const lowerBall = onAxis(it.lowerBallZM);
  const upperBall = onAxis(it.upperBallZM);
  const anti = (it.axle === 'front' ? -1 : 1) * Math.tan(it.svAngleDeg * DEG);
  const pivotDir = unit([1, 0, anti]);
  const arm = (id: string, part: string, ball: Vec3, dy: number, dz: number): Wishbone => {
    // Pivot axis through (ball x, ball y − dy, ball z + dz) along pivotDir.
    const centre: Vec3 = [ball[0], ball[1] - dy, ball[2] + dz];
    return {
      id,
      front: add(centre, scale(pivotDir, it.pivotSpreadM)),
      rear: add(centre, scale(pivotDir, -it.pivotSpreadM)),
      ball,
      part,
    };
  };
  const lowerDz = it.lowerPivotZM - it.lowerBallZM;
  if (!(it.lowerArmM > Math.abs(lowerDz))) throw new Error('The lower arm is shorter than the height between its ends');
  const lowerDy = Math.sqrt(it.lowerArmM ** 2 - lowerDz ** 2);
  const a = it.upperAngleDeg * DEG;
  const lower = arm('lower-arm', 'susp.lower-arm', lowerBall, lowerDy, lowerDz);
  const upper = arm('upper-arm', 'susp.upper-arm', upperBall, it.upperArmM * Math.cos(a), -it.upperArmM * Math.sin(a));
  // The steering arm: at its height on the axis, `tieRodXM` along x, 30 mm inboard of the axis.
  const kp = onAxis(it.tieRodZM);
  const tieRodKnuckle: Vec3 = [kp[0] + it.tieRodXM, kp[1] - 0.03, it.tieRodZM];
  return { wheelCentre: W, lower, upper, axisGround: ground, axisDir, tieRodKnuckle };
}

/**
 * The inner tie-rod (toe-link) joint for a flat toe curve: no bump steer at design and none changing there either (its
 * slope over ±10 mm of travel is zero). Height sets the first, the rod's length (the joint's y) the second, so a 2×2
 * Newton on (y, z) finds it; it starts from the classic drawing, the front-view line through the arms' inner pivots.
 * `build` makes the axle for a trial inner point (a joint on the body).
 */
export function zeroBumpSteerInner(
  frame: WishboneFrame,
  lowerInner: Vec3,
  upperInner: Vec3,
  build: (inner: Vec3) => AxleSpec,
): Vec3 {
  const x = frame.tieRodKnuckle[0];
  const steerAt = (solver: CornerSolver, spec: AxleSpec, pose: Float64Array, travel: number): number => {
    const res = solver.solve(pose, travel, 0, 40);
    if (!res.ok) return NaN;
    const d = new Float64Array(solver.n);
    solver.derivatives(pose, travel, 0, d, null);
    const s = [0, 0, 0];
    solver.direction(pose, spec.spinAxis, s);
    const ds = cross([d[3], d[4], d[5]], [s[0], s[1], s[2]]);
    return (s[1] * ds[0] - s[0] * ds[1]) / (s[0] * s[0] + s[1] * s[1]);
  };
  const h = 0.01;
  const residual = (y: number, z: number): [number, number] => {
    const spec = build([x, y, z]);
    const solver = new CornerSolver(spec);
    const pose = CornerSolver.identity();
    const s0 = steerAt(solver, spec, pose, 0);
    const up = steerAt(solver, spec, pose, h);
    pose.set(CornerSolver.identity());
    const down = steerAt(solver, spec, pose, -h);
    return [s0, (up - down) / (2 * h)];
  };
  let z = frame.tieRodKnuckle[2];
  const t = (z - lowerInner[2]) / (upperInner[2] - lowerInner[2]);
  let y = lowerInner[1] + t * (upperInner[1] - lowerInner[1]);
  for (let i = 0; ; i++) {
    const [f1, f2] = residual(y, z);
    if (Math.abs(f1) < 1e-11 && Math.abs(f2) < 1e-8) break;
    // NaN when the corner does not assemble with this joint; a flat toe curve may also be out of reach.
    if (i === 40 || !Number.isFinite(f1) || !Number.isFinite(f2)) {
      throw new Error('No inner tie-rod joint gives this corner a flat toe curve');
    }
    const e = 1e-6;
    const [a1, a2] = residual(y + e, z);
    const [b1, b2] = residual(y, z + e);
    const j11 = (a1 - f1) / e;
    const j21 = (a2 - f2) / e;
    const j12 = (b1 - f1) / e;
    const j22 = (b2 - f2) / e;
    const det = j11 * j22 - j12 * j21;
    let dy = -(j22 * f1 - j12 * f2) / det;
    let dz = -(j11 * f2 - j21 * f1) / det;
    // Never move the joint more than 20 mm at once.
    const big = Math.max(1, Math.hypot(dy, dz) / 0.02);
    dy /= big;
    dz /= big;
    y += dy;
    z += dz;
  }
  return [x, y, z];
}

/** The halfshaft of a driven corner: outer joint on the hub axis nearest the steering axis, inner joint level with it
 *  at `diffOutputYM` from the centre line. GKN limits as on the strut page. */
export function halfshaftFor(W: Vec3, axisGround: Vec3, axisDir: Vec3, diffOutputYM: number): HalfshaftSpec {
  // The point of the hub axis (W, ŷ) nearest the steering axis.
  const d: Vec3 = [0, 1, 0];
  const w = sub(W, axisGround);
  const b = dot(d, axisDir);
  const s = (b * dot(axisDir, w) - dot(d, w)) / (1 - b * b);
  const outer = add(W, scale(d, s));
  return {
    diffOutput: [outer[0], diffOutputYM, outer[2]],
    outerJoint: outer,
    inner: 'tripod',
    outer: 'fixed-ball',
    innerMaxDeg: 23,
    outerMaxDeg: 47,
    plungeM: [-0.025, 0.025],
    diameterM: 0.024,
  };
}

/** Sets the bump-stop gap so the stop touches `BUMP_STOP_TRAVEL_M` into bump, and the spring rate for the wheel rate. */
export function finishElements(spec: AxleSpec, wheelRateNm: number): AxleSpec {
  const axle = new Axle(spec);
  const s = newCornerSample();
  axle.measureAt(0, s);
  const design = s.damperLen;
  const mr = s.mrSpring;
  axle.measureAt(BUMP_STOP_TRAVEL_M, s);
  return {
    ...spec,
    spring: { ...spec.spring, rate: wheelRateNm / (mr * mr) },
    bumpStop: { ...spec.bumpStop, gapM: design - s.damperLen },
  };
}

/** The coilover on the lower arm: 65 % of the way out from its pivot axis, leaning in by 12° and 0.38 m long. */
export function coiloverOnArm(arm: Wishbone): { body: Vec3; wheel: Vec3 } {
  const centre = scale(add(arm.front, arm.rear), 0.5);
  const wheel = add(centre, scale(sub(arm.ball, centre), 0.65));
  const lean = 12 * DEG;
  const body: Vec3 = [wheel[0], wheel[1] - 0.38 * Math.sin(lean), wheel[2] + 0.38 * Math.cos(lean)];
  return { body, wheel };
}

/** A double wishbone corner from its intent. */
export function doubleWishbone(it: WishboneIntent): AxleSpec {
  const f = wishboneFrame(it);
  const coil = coiloverOnArm(f.lower);
  const lowerInner = scale(add(f.lower.front, f.lower.rear), 0.5);
  const upperInner = scale(add(f.upper.front, f.upper.rear), 0.5);
  const build = (inner: Vec3): AxleSpec => ({
    layout: 'double-wishbone',
    track: it.trackM,
    linkage: {
      kind: 'links',
      wishbones: [f.lower, f.upper],
      rods: [
        {
          id: it.steered ? 'tie-rod' : 'toe-link',
          body: inner,
          knuckle: f.tieRodKnuckle,
          part: it.steered ? 'susp.tie-rod' : 'susp.toe-link',
          steer: it.steered,
        },
      ],
    },
    wheelCentre: f.wheelCentre,
    spinAxis: [0, 1, 0],
    spring: { kind: 'coil', rate: 60000, progressive: null, body: coil.body, wheel: coil.wheel, on: 'lower-arm' },
    damper: {
      kind: 'passive',
      body: coil.body,
      wheel: coil.wheel,
      on: 'lower-arm',
      compression: 0,
      rebound: 0,
      kneeMs: 0.1,
      highRatio: 0.5,
      strokeM: 0.16,
    },
    bumpStop: { gapM: 0, lengthM: 0.05, rate: 81000 },
    driven: it.driven,
    diff: it.driven ? 'body' : 'none',
    halfshaft: it.driven ? halfshaftFor(f.wheelCentre, f.axisGround, f.axisDir, it.diffOutputYM) : null,
    travel: { bumpM: 0.11, droopM: 0.1 },
  });
  const inner = zeroBumpSteerInner(f, lowerInner, upperInner, build);
  return finishElements(build([inner[0], inner[1], inner[2] + it.tieRodDzM]), it.wheelRateNm);
}
