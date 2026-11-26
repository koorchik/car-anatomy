// Steering gears and linkages (suspensions plan, stage 13, decision 20): what turns the road wheels when the steering
// wheel turns. Pure geometry, no text; conventions are at the top of kinematics.ts.
//
// Gears. A rack moves its two tie rods across the car by `rackPerRevM` per turn of the steering wheel (the c-factor).
// A box (worm and roller, or recirculating ball) turns a pitman arm by the steering-wheel angle over `boxRatio`. A
// variable ratio quickens the gear away from the centre: its gain rises from 1 on centre to `variable` at
// VARIABLE_RAMP_RAD of steering-wheel angle and stays there (a rack with a variable tooth pitch, or a variable box; an
// active planetary gear does the same with a motor). The shape of the ramp is a choice of the model, not a maker's.
//
// Linkages.
//   - Rack: the tie rods' inner joints move with the rack along y (CornerSolver's `rack`).
//   - Box on an independent axle (decision 20's front axle with a pitman arm, a centre link and an idler arm): the
//     pitman and idler arms are equal and parallel, so the centre link moves across the car by `pitmanArmM·sin φ`,
//     and the tie rods' inner joints with it. Its fore-and-aft motion, pitmanArmM·(1 − cos φ) (about 15 mm at 25° on
//     a 140 mm arm), is left out: the corner solver moves the inner joints along y only.
//   - Box on a steered solid axle (SteeredBeam): the pitman arm swings across the car on the body, a drag link runs
//     from it to the steering arm of the right knuckle, and a tie rod joins the two knuckles. The knuckles turn about
//     their kingpins in the axle, which the solid axle solver places (solid-kinematics.ts); the drag link's length then
//     fixes the right knuckle's turn and the tie rod's the left one's. When the axle moves on its springs the drag
//     link's end moves on its own arc about the pitman ball while the axle follows the Panhard rod's: the difference
//     turns the wheels without the steering wheel moving (bump steer), and it vanishes to first order when the drag
//     link is parallel to the Panhard rod.
//
// Road-wheel steer angles are positive to the left (a left turn), for both wheels: the left wheel's is −(toe − toe₀),
// the right's +(toe − toe₀). The right corner of a mirrored pair at rack r is the left corner at −r.
//
// Ackermann: with both wheels square to their paths about one turn centre on the rear axle's line,
// cot δ_o − cot δ_i = t/L (t between the steering axes at the road, L the wheelbase). The share is
// (δ_i − δ_o)/(δ_i,ideal − δ_o) at the same outer angle: 1 is full Ackermann, 0 parallel steer, negative anti-Ackermann.
// The Jeantaud rule puts the steering arms on the lines from the kingpins to the middle of the rear axle; `withAckermann`
// turns the arms to a share of that angle, a first-order rule that the measured share then reports honestly.

import type { AxleSpec, CornerLinkage, SolidAxleLinkage, Vec3 } from './spec.ts';
import { Axle, newCornerSample, type CornerSample } from './kinematics.ts';
import { CornerSolver, POSE_SIZE } from './solve.ts';
import { SolidAxle } from './solid-kinematics.ts';
import { add, cross, dot, mirrorY, rotateQuatBy, scale, sub, unit } from './vec.ts';

export type SteeringGearKind = 'rack' | 'worm-roller' | 'recirculating-ball';
export const STEERING_GEARS = ['rack', 'worm-roller', 'recirculating-ball'] as const satisfies readonly SteeringGearKind[];

/** How the steering is assisted: none; a pump driven by the engine; a pump driven by an electric motor; an electric
 *  motor on the column, on the pinion or on the rack; or no mechanical link at all (steer by wire). */
export type SteeringAssist =
  | 'none' | 'hydraulic' | 'electro-hydraulic' | 'electric-column' | 'electric-pinion' | 'electric-rack' | 'by-wire';
export const STEERING_ASSISTS = [
  'none', 'hydraulic', 'electro-hydraulic', 'electric-column', 'electric-pinion', 'electric-rack', 'by-wire',
] as const satisfies readonly SteeringAssist[];

export interface SteeringGear {
  kind: SteeringGearKind;
  /** Rack: rack travel per turn of the steering wheel on centre, m. */
  rackPerRevM: number;
  /** Box: steering-wheel angle per pitman-arm angle on centre. */
  boxRatio: number;
  /** Box: pitman arm, ball to sector shaft, m. */
  pitmanArmM: number;
  /** Gain of the gear past the ramp over its gain on centre: 1 is a constant ratio, above 1 quicker toward the lock. */
  variable: number;
}

/** Steering-wheel angle over which a variable ratio reaches its end gain, rad (half a turn; a model choice). */
export const VARIABLE_RAMP_RAD = Math.PI;

/**
 * Forward efficiency of each gear (driver to wheels), the share of the work at the steering wheel that reaches the
 * kingpins. Estimates of the model, not a maker's figures (docs/suspension-model.md).
 */
export const GEAR_EFFICIENCY: Record<SteeringGearKind, number> = { rack: 0.9, 'recirculating-ball': 0.85, 'worm-roller': 0.75 };

/** The gear's gain at steering-wheel angle `theta` over its gain on centre. */
export function gearGain(gear: SteeringGear, theta: number): number {
  const u = Math.min(1, Math.abs(theta) / VARIABLE_RAMP_RAD);
  return 1 + (gear.variable - 1) * u * u;
}

/** ∫₀^θ gain, rad: the steering-wheel angle a constant gear of the centre gain would need for the same output. */
function gainIntegral(gear: SteeringGear, theta: number): number {
  const a = Math.abs(theta);
  const r = VARIABLE_RAMP_RAD;
  const extra = a < r ? (a * a * a) / (3 * r * r) : a - (2 * r) / 3;
  return Math.sign(theta) * (a + (gear.variable - 1) * extra);
}

/** What the gear moves for steering-wheel angle `theta` (rad, positive left): rack travel, m, or pitman angle, rad. */
export function gearOutput(gear: SteeringGear, theta: number): number {
  const i = gainIntegral(gear, theta);
  return gear.kind === 'rack' ? (gear.rackPerRevM * i) / (2 * Math.PI) : i / gear.boxRatio;
}

/** d(gearOutput)/dθ: m or rad per radian of steering wheel. */
export const gearOutputRate = (gear: SteeringGear, theta: number): number =>
  (gear.kind === 'rack' ? gear.rackPerRevM / (2 * Math.PI) : 1 / gear.boxRatio) * gearGain(gear, theta);

/** Travel of the tie rods' inner joints across the car on an independent axle, m: the rack, or the centre link. */
export function linkTravel(gear: SteeringGear, theta: number): number {
  const out = gearOutput(gear, theta);
  // A pitman arm past square to the centre link would bring it back: the travel stops there.
  return gear.kind === 'rack' ? out : gear.pitmanArmM * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, out)));
}

/** d(linkTravel)/dθ, m/rad. */
export function linkTravelRate(gear: SteeringGear, theta: number): number {
  const rate = gearOutputRate(gear, theta);
  if (gear.kind === 'rack') return rate;
  const out = gearOutput(gear, theta);
  return Math.abs(out) >= Math.PI / 2 ? 0 : gear.pitmanArmM * Math.cos(out) * rate;
}

/** The steering-wheel angle that gives `out` of `fn` (monotonic in θ), rad; bisection to a microradian. */
export function gearInputFor(fn: (theta: number) => number, out: number, maxTheta = 8 * Math.PI): number {
  let lo = 0;
  let hi = maxTheta;
  const target = Math.abs(out);
  if (fn(hi) < target) return Math.sign(out) * Infinity;
  for (let i = 0; i < 80 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
  }
  return Math.sign(out) * (lo + hi) / 2;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ackermann and the turning circle.

/** The inner wheel's angle that full Ackermann gives for outer angle `outer` (rad), wheelbase L and axis track t. */
export function ackermannInner(outer: number, wheelbaseM: number, axisTrackM: number): number {
  if (outer <= 0) return 0;
  return Math.atan(1 / (1 / Math.tan(outer) - axisTrackM / wheelbaseM));
}

/** Share of full Ackermann of a pair of inner and outer angles (rad). NaN when the outer wheel is straight. */
export function ackermannShare(inner: number, outer: number, wheelbaseM: number, axisTrackM: number): number {
  if (!(outer > 1e-6)) return NaN;
  return (inner - outer) / (ackermannInner(outer, wheelbaseM, axisTrackM) - outer);
}

/** Diameter of the circle the outer front wheel runs on, m: its path square to the wheel about a centre on the rear
 *  axle's line, L / sin δ_o. */
export const turningCircleM = (outer: number, wheelbaseM: number): number => (2 * wheelbaseM) / Math.sin(outer);

/** Where a steering axis meets a plane of height z: the point on the axis through `lower` and `upper`. */
function axisAt(lower: Vec3, upper: Vec3, z: number): Vec3 {
  const k = (z - lower[2]) / (upper[2] - lower[2]);
  return add(lower, scale(sub(upper, lower), k));
}

/**
 * The corner with its steering arm turned to `share` of the Jeantaud angle for wheelbase `wheelbaseM`: the steered
 * rod's knuckle end (the outer tie-rod joint) and its inner end both move across the car, so the tie rod keeps its
 * length and its line in the front view. The kingpin point is the steering axis at the joint's height at design.
 */
export function withAckermann(spec: AxleSpec, share: number, wheelbaseM: number): AxleSpec {
  const axle = new Axle(spec, { table: false });
  const pose = CornerSolver.identity();
  const point = new Float64Array(3);
  const dir = new Float64Array(3);
  if (!axle.steeringAxis(pose, 0, point, dir)) throw new Error('The corner has no steering axis');
  const rodIndex = spec.linkage.rods.findIndex((r) => r.steer);
  if (rodIndex < 0) throw new Error('The corner has no steered rod');
  const rod = spec.linkage.rods[rodIndex];
  const T = rod.knuckle;
  const k = (T[2] - point[2]) / dir[2];
  const K: Vec3 = [point[0] + dir[0] * k, point[1] + dir[1] * k, T[2]];
  const y = K[1] + ((T[0] - K[0]) * K[1] * share) / wheelbaseM;
  const dy = y - T[1];
  const rods = spec.linkage.rods.slice();
  rods[rodIndex] = { ...rod, knuckle: [T[0], y, T[2]], body: [rod.body[0], rod.body[1] + dy, rod.body[2]] };
  const linkage: CornerLinkage = { ...spec.linkage, rods };
  return { ...spec, linkage };
}

/** The share of the Jeantaud angle a corner's steering arm has as drawn (withAckermann's inverse). */
export function ackermannArmShare(spec: AxleSpec, wheelbaseM: number): number {
  const axle = new Axle(spec, { table: false });
  const point = new Float64Array(3);
  const dir = new Float64Array(3);
  if (!axle.steeringAxis(CornerSolver.identity(), 0, point, dir)) return NaN;
  const rod = spec.linkage.rods.find((r) => r.steer);
  if (!rod) return NaN;
  const T = rod.knuckle;
  const k = (T[2] - point[2]) / dir[2];
  const K: Vec3 = [point[0] + dir[0] * k, point[1] + dir[1] * k, T[2]];
  return ((T[1] - K[1]) * wheelbaseM) / ((T[0] - K[0]) * K[1]);
}

// ---------------------------------------------------------------------------------------------------------------------
// An independent steered axle.

/** Both front wheels at one travel of the steering linkage. Angles in radians, lengths in metres. */
export interface SteerSample {
  /** Travel of the rack or centre link toward a left turn, m. */
  travel: number;
  /** Road-wheel steer angles, positive to the left. */
  left: number;
  right: number;
  /** Camber of each wheel (positive: top out, as kinematics.ts). */
  camberLeft: number;
  camberRight: number;
  /** How far each wheel centre has dropped relative to the body from straight ahead: the tyre stays on the road, so
   *  the body rises by this much over that wheel. The wheel centre, not the lowest point of the wheel's circle: a tyre's
   *  crown is round, and the camber the steer brings barely lifts its contact (the circle's lowest point would rise
   *  by r·(1 − cos γ), a thin disc's). */
  dropLeft: number;
  dropRight: number;
}

/** Largest step of the rack between two solves of a sweep, m. */
const RACK_STEP_M = 0.01;

/**
 * Steering of an independent front axle: the left corner solved at the rack travels that both wheels need (the right
 * wheel at rack r is the left corner at −r). Solves are exact, walked out from straight ahead with a first-order
 * predictor and kept, so a sweep to the lock and back pays for each travel once.
 */
export class CornerSteering {
  readonly axle: Axle;
  /** The left corner straight ahead. */
  readonly design: CornerSample;
  /** +1 when the rack moving left (+y) turns the car left, −1 when it turns it right. */
  readonly sign: number;
  /** Steer of each wheel per metre of rack travel toward a left turn on centre, rad/m. */
  readonly ratePerM: number;
  /** Distance between the two steering axes at the road at design, m. */
  readonly axisTrackM: number;
  /** Solved left-corner poses by rack, walked out in RACK_STEP_M steps: index k holds rack k·step·dir. */
  private readonly walks: { [dir: number]: Float64Array[] } = { 1: [], [-1]: [] };
  private readonly v: Float64Array;
  private readonly sample = newCornerSample();

  constructor(spec: AxleSpec) {
    if (!spec.linkage.rods.some((r) => r.steer)) throw new Error('The corner has no steered rod');
    this.axle = new Axle(spec, { table: false });
    const solver = this.axle.solver;
    const pose = CornerSolver.identity();
    const res = solver.solve(pose, 0, 0, 40);
    if (!res.ok) throw new Error(`The corner does not assemble at design: ${res.worst}`);
    this.design = newCornerSample();
    this.axle.measure(pose, 0, 0, this.design);
    this.walks[1].push(pose);
    this.walks[-1].push(pose);
    this.v = new Float64Array(solver.n);
    // Toe of the left wheel per metre of rack at design (axle-lite.ts does the same).
    const dr = new Float64Array(solver.n);
    solver.derivatives(pose, 0, 0, null, dr);
    const s = [0, 0, 0];
    solver.direction(pose, spec.spinAxis, s);
    const dsx = dr[4] * s[2] - dr[5] * s[1];
    const dsy = dr[5] * s[0] - dr[3] * s[2];
    const toeRate = (s[1] * dsx - s[0] * dsy) / (s[0] * s[0] + s[1] * s[1]);
    if (!(Math.abs(toeRate) > 1e-6)) throw new Error('The rack does not steer the wheel');
    this.sign = toeRate < 0 ? 1 : -1;
    this.ratePerM = Math.abs(toeRate);
    const d = this.design;
    this.axisTrackM = 2 * (d.contactY - d.scrub);
  }

  /** The left corner at rack `rack` (along +y in its own frame), measured into `out`; throws past what it reaches. */
  corner(rack: number, out: CornerSample): void {
    const dir = rack >= 0 ? 1 : -1;
    const walk = this.walks[dir];
    const solver = this.axle.solver;
    const step = RACK_STEP_M;
    const need = Math.ceil(Math.abs(rack) / step - 1e-9);
    while (walk.length <= need) {
      const k = walk.length;
      const from = walk[k - 1];
      const r0 = (k - 1) * step * dir;
      const r1 = k * step * dir;
      const next = new Float64Array(POSE_SIZE);
      next.set(from);
      solver.derivatives(next, 0, r0, null, this.v);
      predict(next, this.v, r1 - r0, solver.split);
      const res = solver.solve(next, 0, r1, 20);
      if (!res.ok) throw new Error(`The steering linkage does not reach ${(r1 * 1000).toFixed(0)} mm of rack: ${res.worst}`);
      walk.push(next);
    }
    // From the nearest walked pose below.
    const k = Math.min(need, Math.max(0, Math.floor(Math.abs(rack) / step)));
    const pose = new Float64Array(POSE_SIZE);
    pose.set(walk[k]);
    const r0 = k * step * dir;
    solver.derivatives(pose, 0, r0, null, this.v);
    predict(pose, this.v, rack - r0, solver.split);
    const res = solver.solve(pose, 0, rack, 20);
    if (!res.ok) throw new Error(`The steering linkage does not reach ${(rack * 1000).toFixed(0)} mm of rack: ${res.worst}`);
    this.axle.measure(pose, 0, rack, out);
  }

  /** Both wheels with the rack (or centre link) moved `travel` toward a left turn, m. */
  at(travel: number): SteerSample {
    const d = this.design;
    const s = this.sample;
    this.corner(this.sign * travel, s);
    const left = -(s.toe - d.toe);
    const camberLeft = s.camber;
    // The solver holds the wheel centre's height, so the steer moves the links instead: the spring shortened by ΔL is
    // a wheel ΔL/mr lower at the spring's own length.
    const drop = (x: CornerSample): number => (d.springLen - x.springLen) / d.mrSpring;
    const dropLeft = drop(s);
    this.corner(-this.sign * travel, s);
    return { travel, left, right: s.toe - d.toe, camberLeft, camberRight: s.camber, dropLeft, dropRight: drop(s) };
  }

  /**
   * The rack travel toward a left turn at which the wheel that turns more (the inner, left one, unless the arms are
   * anti-Ackermann) reaches `lockRad`, and both wheels there; the last travel the linkage reaches, when it cannot get
   * that far.
   */
  lock(lockRad: number, maxTravelM = 0.2): SteerSample {
    // The first step goes most of the way the centre's rate says (steer grows faster than the travel toward the lock
    // on a typical arm, so this stays short of it).
    const first = Math.min(maxTravelM, (0.8 * lockRad) / this.ratePerM);
    return findLock((x) => this.at(x), lockRad, 2 * RACK_STEP_M, maxTravelM, first);
  }
}

/** The larger of the two wheels' steer: what the knuckle's stop limits. */
const steerOf = (s: SteerSample): number => Math.max(s.left, s.right);

/**
 * Where `steerOf` of a linkage's sample reaches `lockRad` (to 10⁻⁶ rad), walking out from straight ahead, `first`
 * and then in `step`s of its input to `max`, and closing in by secant steps; the last sample the linkage reaches when
 * it stops short or turns back.
 */
function findLock(at: (x: number) => SteerSample, lockRad: number, step: number, max: number, first = step): SteerSample {
  let lo = 0;
  let loSample = at(0);
  let hi = 0;
  let hiSample: SteerSample | null = null;
  while (hi < max) {
    const next = Math.min(max, hi === 0 ? first : hi + step);
    let s: SteerSample;
    try {
      s = at(next);
    } catch {
      return loSample;
    }
    if (!(steerOf(s) > steerOf(loSample))) return loSample;
    if (steerOf(s) >= lockRad) {
      hi = next;
      hiSample = s;
      break;
    }
    lo = next;
    loSample = s;
    hi = next;
  }
  if (!hiSample) return loSample;
  // The Illinois variant of regula falsi: a plain one stalls on one side of a curved bracket.
  let fLo = steerOf(loSample) - lockRad;
  let fHi = steerOf(hiSample) - lockRad;
  let side = 0;
  for (let i = 0; i < 40; i++) {
    const x = (lo * fHi - hi * fLo) / (fHi - fLo);
    const s = at(x);
    const f = steerOf(s) - lockRad;
    if (Math.abs(f) < 1e-6 || hi - lo < 1e-12) return s;
    if (f < 0) {
      lo = x;
      fLo = f;
      loSample = s;
      if (side === -1) fHi /= 2;
      side = -1;
    } else {
      hi = x;
      fHi = f;
      hiSample = s;
      if (side === 1) fLo /= 2;
      side = 1;
    }
  }
  return Math.abs(steerOf(loSample) - lockRad) < Math.abs(steerOf(hiSample) - lockRad) ? loSample : hiSample;
}

/** pose ← pose + v·Δ (translation, rotation, and the split knuckle's turn). */
function predict(pose: Float64Array, v: Float64Array, delta: number, split: boolean): void {
  pose[0] += v[0] * delta;
  pose[1] += v[1] * delta;
  pose[2] += v[2] * delta;
  rotateQuatBy(pose, 3, v[3] * delta, v[4] * delta, v[5] * delta);
  if (split) pose[7] += v[6] * delta;
}

// ---------------------------------------------------------------------------------------------------------------------
// A steered solid axle.

/**
 * The steering of a solid front axle, left side given where a side is meant (the right is the mirror). Points are axle
 * points at design (they move with the axle), except the pitman arm's, which are body points.
 */
export interface SteeredBeamSpec {
  /** Left kingpin: its lower and upper ends (the ball joints of the knuckle on the axle). */
  kingpinLower: Vec3;
  kingpinUpper: Vec3;
  /** Left steering arm's ball, where the tie rod meets it. */
  armBall: Vec3;
  /** The drag link's end on the right knuckle. */
  dragKnuckle: Vec3;
  /** The pitman arm's ball on the body at design, and its sector shaft: a point and the shaft's direction. */
  pitmanBall: Vec3;
  pitmanShaft: Vec3;
  shaftAxis: Vec3;
}

/** Rotation of point p about the axis through `a` with unit direction `u` by angle t (Rodrigues). */
export function rotateAbout(p: Vec3, a: Vec3, u: Vec3, t: number): Vec3 {
  const r = sub(p, a);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return add(a, add(add(scale(r, c), scale(cross(u, r), s)), scale(u, dot(u, r) * (1 - c))));
}

/** A solid axle with its knuckles, tie rod, drag link and pitman arm. */
export class SteeredBeam {
  readonly axle: SolidAxle;
  readonly beam: SteeredBeamSpec;
  /** Lengths of the drag link and the tie rod, m. */
  readonly dragLinkM: number;
  readonly tieRodM: number;
  /** Kingpins: a point and the unit direction (upward) of each, axle frame; [left, right]. */
  private readonly kingpins: ReadonlyArray<{ point: Vec3; dir: Vec3 }>;
  private readonly rest: Float64Array;
  /** +1 when a positive pitman angle turns the car left. */
  readonly sign: number;
  private readonly scratch = [0, 0, 0];

  constructor(spec: AxleSpec<SolidAxleLinkage>, beam: SteeredBeamSpec) {
    this.axle = new SolidAxle(spec);
    this.beam = beam;
    const dirL = unit(sub(beam.kingpinUpper, beam.kingpinLower));
    this.kingpins = [
      { point: beam.kingpinLower, dir: dirL },
      { point: mirrorY(beam.kingpinLower), dir: mirrorY(dirL) },
    ];
    this.dragLinkM = Math.hypot(...sub(beam.pitmanBall, beam.dragKnuckle));
    this.tieRodM = 2 * Math.abs(beam.armBall[1]);
    this.rest = this.axle.rest();
    this.sign = 1;
    const probe = this.knuckleTurn(this.rest, 1e-3);
    if (!Number.isFinite(probe) || probe === 0) throw new Error('The pitman arm does not steer the axle');
    (this as { sign: number }).sign = probe > 0 ? 1 : -1;
  }

  /** The pitman ball for pitman angle `phi`, body frame. */
  pitmanBall(phi: number): Vec3 {
    const b = this.beam;
    return rotateAbout(b.pitmanBall, b.pitmanShaft, unit(b.shaftAxis), phi);
  }

  /** A body point of an axle point `p` (design) for the axle state. */
  private body(state: Float64Array, p: Vec3): Vec3 {
    const s = this.scratch;
    this.axle.solver.point(state, p, s);
    return [s[0], s[1], s[2]];
  }

  /**
   * The right knuckle's turn about its kingpin relative to the axle (rad, about the upward axis: positive turns the
   * wheel left) that keeps the drag link's length, for the axle `state` and pitman angle `phi` (sign-corrected unless
   * `raw`). Newton from straight ahead; NaN where the drag link cannot reach.
   */
  knuckleTurn(state: Float64Array, phi: number, raw = false): number {
    const P = this.pitmanBall(raw ? phi : this.sign * phi);
    const kp = this.kingpins[1];
    const L = this.dragLinkM;
    const f = (d: number): number => {
      const D = this.body(state, rotateAbout(this.beam.dragKnuckle, kp.point, kp.dir, d));
      return Math.hypot(P[0] - D[0], P[1] - D[1], P[2] - D[2]) - L;
    };
    let d = 0;
    for (let i = 0; i < 30; i++) {
      const fd = f(d);
      if (Math.abs(fd) < 1e-11) return d;
      const h = 1e-6;
      const slope = (f(d + h) - f(d - h)) / (2 * h);
      if (!(Math.abs(slope) > 1e-9)) return NaN;
      const step = fd / slope;
      d -= Math.max(-0.2, Math.min(0.2, step));
      if (Math.abs(d) > 1.4) return NaN;
    }
    return Math.abs(f(d)) < 1e-8 ? d : NaN;
  }

  /** The left knuckle's turn that keeps the tie rod's length for the right knuckle's turn `right` (rad). */
  leftTurn(right: number): number {
    const [kl, kr] = this.kingpins;
    const AR = rotateAbout(mirrorY(this.beam.armBall), kr.point, kr.dir, right);
    const L = this.tieRodM;
    const f = (d: number): number => {
      const AL = rotateAbout(this.beam.armBall, kl.point, kl.dir, d);
      return Math.hypot(AL[0] - AR[0], AL[1] - AR[1], AL[2] - AR[2]) - L;
    };
    let d = right;
    for (let i = 0; i < 30; i++) {
      const fd = f(d);
      if (Math.abs(fd) < 1e-11) return d;
      const h = 1e-6;
      const slope = (f(d + h) - f(d - h)) / (2 * h);
      if (!(Math.abs(slope) > 1e-9)) return NaN;
      d -= Math.max(-0.2, Math.min(0.2, fd / slope));
    }
    return d;
  }

  /** Heading of a wheel whose knuckle has turned by `turn` about its kingpin (side 0 left, 1 right), axle frame:
   *  the road-wheel steer angle, positive left, and its camber. */
  wheel(side: 0 | 1, turn: number): { steer: number; camber: number } {
    const kp = this.kingpins[side];
    const spin = side === 0 ? this.axle.spec.spinAxis : mirrorY(this.axle.spec.spinAxis);
    const s = rotateAbout(spin, [0, 0, 0], kp.dir, turn);
    const heading = (v: Vec3): number => (side === 0 ? Math.atan2(-v[0], v[1]) : Math.atan2(v[0], -v[1]));
    // Camber is positive with the top out on both sides: the outboard spin axis then points down.
    return { steer: heading(s) - heading(spin), camber: -Math.asin(s[2]) };
  }

  /** Both wheels on the axle at rest for pitman angle `phi` toward a left turn. */
  at(phi: number): SteerSample {
    const right = this.knuckleTurn(this.rest, phi);
    const left = this.leftTurn(right);
    const wl = this.wheel(0, left);
    const wr = this.wheel(1, right);
    return {
      travel: phi,
      left: wl.steer,
      right: wr.steer,
      camberLeft: wl.camber,
      camberRight: wr.camber,
      dropLeft: this.centreDrop(0, left),
      dropRight: this.centreDrop(1, right),
    };
  }

  /** How far a wheel centre drops relative to the axle when its knuckle turns by `turn`, m (as CornerSteering). */
  private centreDrop(side: 0 | 1, turn: number): number {
    const kp = this.kingpins[side];
    const W0 = side === 0 ? this.axle.spec.wheelCentre : mirrorY(this.axle.spec.wheelCentre);
    return W0[2] - rotateAbout(W0, kp.point, kp.dir, turn)[2];
  }

  /** The pitman angle toward a left turn at which the wheel that turns more reaches `lockRad`, and both wheels there. */
  lock(lockRad: number): SteerSample {
    return findLock((phi) => {
      const s = this.at(phi);
      if (!Number.isFinite(s.left) || !Number.isFinite(s.right)) throw new Error('The drag link does not reach');
      return s;
    }, lockRad, 0.05, 1.4);
  }

  /** Steer of each wheel per radian of pitman arm on centre, rad/rad. */
  ratePerPitman(): number {
    const h = 1e-4;
    const a = this.at(h);
    const b = this.at(-h);
    return (a.left + a.right - b.left - b.right) / (4 * h);
  }

  /** Turn of the knuckles relative to the axle when both wheels rise by `heave` (m) with the pitman arm held straight:
   *  the bump steer of the drag link, rad, positive to the left. */
  heaveSteer(heave: number): number {
    const state = this.axle.rest();
    this.axle.solve(state, heave, heave);
    const right = this.knuckleTurn(state, 0);
    return this.wheel(1, right).steer - this.wheel(1, this.knuckleTurn(this.rest, 0)).steer;
  }

  /** The steering axis of the left knuckle at design: caster, KPI, scrub radius, trail and kingpin offset at the hub,
   *  with the conventions of kinematics.ts. */
  axis(): { caster: number; kpi: number; scrub: number; trail: number; kingpinOffset: number } {
    const { kingpinLower: lo, kingpinUpper: up } = this.beam;
    const W = this.axle.spec.wheelCentre;
    const a = unit(sub(up, lo));
    const ground = axisAt(lo, up, 0);
    const hub = axisAt(lo, up, W[2]);
    return {
      caster: Math.atan2(-a[0], a[2]),
      kpi: Math.atan2(-a[1], a[2]),
      scrub: W[1] - ground[1],
      trail: ground[0] - W[0],
      kingpinOffset: W[1] - hub[1],
    };
  }
}
