// What a solid axle does at a pair of wheel travels: the numbers a corner table holds (kinematics.ts), measured from
// the solved pose and the implicit derivatives of solve-axle.ts. Conventions are at the top of kinematics.ts.
//
// As on a twist beam (beam-kinematics.ts), each wheel moves with both travels, so every slope comes twice: per metre of
// the wheel's own travel with the other wheel held (the plain names), and per metre of the other wheel's travel with
// this one held (`…Cross`). Roll (this wheel up, the other down) is their difference, so the roll centre is
// y_C·(tanβ − tanβ_cross) and the roll camber factor 1 − (t/2)·|dγ/dq_roll|. The right wheel is measured in the mirror
// of the car, so its numbers read as the left one's, and its lateral positions and slopes are given back in the car's
// frame (negative y), as Axle.sample does. Axle-wide numbers (roll, steer, pitch, sideways shift, binding) are those of
// the car, the same on both sides.
//
// tanθ_CP here is the slope of the axle's own point at the contact patch, which carries the axle's pitch: the line from
// the contact patch to the axle's side-view instant centre, as anti-squat of a live axle and anti-dive or anti-lift with
// the brakes on the axle need it. A corner's tanθ_CP (kinematics.ts) is the slope of the geometric lowest point of the
// wheel instead; that is the wheel-centre slope where the camber holds, and on a pitching axle it is far off (on the
// triangulated template −0.038 against −0.140 from the link lines).
//
// There is no table yet: the stage that animates the axle decides whether it needs one. A solve walks to the asked
// travels in steps of at most STEP_M with a first-order predictor, so it stays on the design branch: a corrector that
// lands farther from the prediction than JUMP_M or JUMP_RAD has found another assembly of the linkage, and the walk
// throws. (The least-squares KKT matrix cannot tell: its determinant keeps its sign on every assembly.)

import type { AxleSpec, SolidAxleLinkage, Vec3 } from './spec.ts';
import type { Side } from './kinematics.ts';
import { AXLE_STATE_SIZE, SolidAxleSolver, type AxleSolveResult } from './solve-axle.ts';
import { dist, mirrorY, rotateQuatBy } from './vec.ts';

/** Largest step of a walk between two pairs of travels, m. */
const STEP_M = 0.01;
/** Largest move of the corrector from the prediction of one step: of the axle centre (m), of the axle's turn and of a
 *  Watt rocker's or shackle's swing (rad). The templates' correctors move under 0.3 mm, 2 mrad and 8 mrad; another
 *  assembly (a crossed Watt rocker, a shackle over its dead point) lies a good part of a radian away. */
const JUMP_M = 0.005;
const JUMP_RAD = 0.1;
const X_AXIS: Vec3 = [1, 0, 0];

const travelText = (zL: number, zR: number): string => `${(zL * 1000).toFixed(0)} / ${(zR * 1000).toFixed(0)} mm of travel`;

/** One wheel of a solid axle at one pair of travels. Angles in radians, lengths in metres. */
export interface SolidSample {
  /** Travel of this wheel and of the other one. */
  travel: number;
  otherTravel: number;
  camber: number;
  toe: number;
  /** Contact point (the lowest point of the tilted wheel circle of the design loaded radius), body frame. */
  contactX: number;
  contactY: number;
  contactZ: number;
  wheelX: number;
  wheelY: number;
  wheelZ: number;
  springLen: number;
  damperLen: number;
  /** Per metre of this wheel's travel, the other wheel held. tanThetaCP follows the axle's own point at the contact
   *  patch (see the top of the file), tanThetaWC the wheel centre. */
  mrSpring: number;
  mrDamper: number;
  tanBeta: number;
  tanThetaCP: number;
  tanThetaWC: number;
  camberGain: number;
  bumpSteer: number;
  /** The same per metre of the other wheel's travel, this wheel held. */
  mrSpringCross: number;
  mrDamperCross: number;
  tanBetaCross: number;
  tanThetaCPCross: number;
  tanThetaWCCross: number;
  camberGainCross: number;
  bumpSteerCross: number;
  /** Roll centre of opposite travels at this state, above the road under the wheel: y_C·(tanβ − tanβ_cross). */
  rcHeight: number;
  /** The axle relative to the body: roll (left wheel up positive), steer (turned anticlockwise seen from above, the
   *  wheels pointing left, positive), pitch (its front, the pinion, dipping positive), and the sideways shift of its
   *  centre (to the left positive). */
  axleRoll: number;
  axleSteer: number;
  axlePitch: number;
  axleShiftY: number;
  /** Largest stretch of a rod: the binding the bushes take. */
  bind: number;
  /** De Dion half-shaft: plunge into the inner joint (positive pushed in) and the joint angles; 0 without one. */
  plunge: number;
  cvInner: number;
  cvOuter: number;
}

const FIELDS = [
  'travel', 'otherTravel', 'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ',
  'springLen', 'damperLen', 'mrSpring', 'mrDamper', 'tanBeta', 'tanThetaCP', 'tanThetaWC', 'camberGain', 'bumpSteer',
  'mrSpringCross', 'mrDamperCross', 'tanBetaCross', 'tanThetaCPCross', 'tanThetaWCCross', 'camberGainCross',
  'bumpSteerCross', 'rcHeight', 'axleRoll', 'axleSteer', 'axlePitch', 'axleShiftY', 'bind', 'plunge', 'cvInner',
  'cvOuter',
] as const satisfies readonly (keyof SolidSample)[];

/** Fields whose sign flips on the right wheel (lateral positions and slopes), as Axle.sample does. */
const MIRRORED = ['contactY', 'wheelY', 'tanBeta', 'tanBetaCross'] as const;

export const newSolidSample = (): SolidSample => {
  const s = {} as SolidSample;
  for (const f of FIELDS) s[f] = 0;
  return s;
};

/** Slopes of one wheel along one velocity of the axle. */
interface Slopes {
  tanBeta: number;
  tanThetaCP: number;
  tanThetaWC: number;
  camberGain: number;
  bumpSteer: number;
  mrSpring: number;
  mrDamper: number;
}

export class SolidAxle {
  readonly spec: AxleSpec<SolidAxleLinkage>;
  readonly solver: SolidAxleSolver;
  /** Loaded radius at design: the contact point is this far below the wheel centre in the wheel plane. */
  readonly radius: number;
  /** Spring, damper and spin axis of each side: [left, right], the right one the mirror. */
  private readonly springBody: readonly [Vec3, Vec3];
  private readonly springWheel: readonly [Vec3, Vec3];
  private readonly damperBody: readonly [Vec3, Vec3];
  private readonly damperWheel: readonly [Vec3, Vec3];
  private readonly spin: readonly [Vec3, Vec3];
  private readonly outerJoint: readonly [Vec3, Vec3] | null;
  private readonly shaftLength: number;
  // Scratch
  private readonly dL: Float64Array;
  private readonly dR: Float64Array;
  private readonly dz = new Float64Array(2);
  private readonly p = new Float64Array(3);
  private readonly q = new Float64Array(3);
  private readonly s = new Float64Array(3);
  private readonly predicted = new Float64Array(AXLE_STATE_SIZE);
  private readonly slopes: Slopes = {
    tanBeta: 0, tanThetaCP: 0, tanThetaWC: 0, camberGain: 0, bumpSteer: 0, mrSpring: 0, mrDamper: 0,
  };

  constructor(spec: AxleSpec<SolidAxleLinkage>) {
    this.spec = spec;
    this.solver = new SolidAxleSolver(spec);
    this.radius = spec.wheelCentre[2];
    const { spring, damper } = spec;
    if (spring.wheel === 'strut' || damper.wheel === 'strut') throw new Error('A solid axle has no strut');
    const sides = (p: Vec3): readonly [Vec3, Vec3] => [p, mirrorY(p)];
    this.springBody = sides(spring.body);
    this.springWheel = sides(spring.wheel);
    this.damperBody = sides(damper.body);
    this.damperWheel = sides(damper.wheel);
    this.spin = sides(spec.spinAxis);
    const shaft = spec.halfshaft;
    this.outerJoint = shaft ? sides(shaft.outerJoint) : null;
    this.shaftLength = shaft ? dist(shaft.diffOutput, shaft.outerJoint) : 0;
    this.dL = new Float64Array(this.solver.n);
    this.dR = new Float64Array(this.solver.n);
    const res = this.solver.solve(SolidAxleSolver.rest(), 0, 0);
    if (!res.ok) throw new Error(`The solid axle does not assemble at design: ${res.worst}`);
  }

  /** The design state. */
  rest(): Float64Array {
    return SolidAxleSolver.rest();
  }

  /**
   * Walks `state` to the travels `zL`, `zR` in steps of at most 10 mm, each started by a first-order predictor; throws
   * when a step does not solve or its corrector lands on another assembly of the linkage (farther from the prediction
   * than JUMP_M or JUMP_RAD). Returns the last step's result: its iterations and binding.
   */
  solve(state: Float64Array, zL: number, zR: number): AxleSolveResult {
    if (!Number.isFinite(zL) || !Number.isFinite(zR)) throw new Error(`The solid axle's travels must be numbers, not ${zL} / ${zR}`);
    const solver = this.solver;
    const from = this.dz;
    solver.travels(state, from);
    const zL0 = from[0];
    const zR0 = from[1];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(zL - zL0), Math.abs(zR - zR0)) / STEP_M - 1e-9));
    let res: AxleSolveResult | null = null;
    let atL = zL0;
    let atR = zR0;
    for (let k = 1; k <= steps; k++) {
      const toL = zL0 + ((zL - zL0) * k) / steps;
      const toR = zR0 + ((zR - zR0) * k) / steps;
      this.predict(state, atL, atR, toL - atL, toR - atR);
      this.predicted.set(state);
      res = solver.solve(state, toL, toR);
      if (!res.ok) throw new Error(`The solid axle does not solve at ${travelText(toL, toR)} (${res.worst})`);
      if (this.jumped(this.predicted, state)) throw new Error(`The solid axle jumps to another assembly at ${travelText(toL, toR)}`);
      atL = toL;
      atR = toR;
    }
    return res!;
  }

  /** Whether the corrector moved from the prediction `a` to the solution `b` farther than one branch allows. */
  private jumped(a: Float64Array, b: Float64Array): boolean {
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > JUMP_M) return true;
    const cos = Math.abs(a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6]);
    if (2 * Math.acos(Math.min(1, cos)) > JUMP_RAD) return true;
    for (let e = 6; e < this.solver.n; e++) if (Math.abs(a[7 + e - 6] - b[7 + e - 6]) > JUMP_RAD) return true;
    return false;
  }

  /** state ← state + dq/dz_L·ΔzL + dq/dz_R·ΔzR. */
  private predict(state: Float64Array, zL: number, zR: number, dzL: number, dzR: number): void {
    const { dL, dR } = this;
    this.solver.derivatives(state, zL, zR, dL, dR);
    const v = (i: number): number => dL[i] * dzL + dR[i] * dzR;
    state[0] += v(0);
    state[1] += v(1);
    state[2] += v(2);
    rotateQuatBy(state, 3, v(3), v(4), v(5));
    for (let e = 6; e < this.solver.n; e++) state[7 + e - 6] += v(e);
  }

  /** Solves from rest and measures `side`; returns the state. */
  measureAt(zL: number, zR: number, side: Side, out: SolidSample): Float64Array {
    const state = this.rest();
    this.solve(state, zL, zR);
    this.measure(state, side, out);
    return state;
  }

  /** Everything about `side`'s wheel at a solved `state` into `out`. */
  measure(state: Float64Array, side: Side, out: SolidSample): void {
    const solver = this.solver;
    const { dL, dR, p, q, s } = this;
    const tr = this.dz;
    solver.travels(state, tr);
    solver.derivatives(state, tr[0], tr[1], dL, dR);
    const left = side === 'left';
    const own = left ? dL : dR;
    const cross = left ? dR : dL;
    // The mirror of the car, for the right wheel: points and velocities y → −y, angular velocities (−x, y, −z).
    const my = left ? 1 : -1;
    const c0 = solver.c0;
    const Cx = c0[0] + state[0];
    const Cy = c0[1] + state[1];
    const Cz = c0[2] + state[2];

    // Axle-wide numbers, from both wheel centres in the car's frame.
    solver.point(state, solver.wheelL, p);
    solver.point(state, solver.wheelR, q);
    out.axleRoll = Math.atan2(p[2] - q[2], p[1] - q[1]);
    out.axleSteer = Math.atan2(q[0] - p[0], p[1] - q[1]);
    out.axleShiftY = (p[1] + q[1]) / 2;
    solver.direction(state, X_AXIS, s);
    out.axlePitch = -Math.atan2(s[2], s[0]);
    out.bind = solver.bind(state);

    // This wheel, seen as a left one.
    const W = left ? p : q;
    const Wx = W[0];
    const Wy = my * W[1];
    const Wz = W[2];
    // W − C in the car's frame, for the wheel's velocity.
    const armX = Wx - Cx;
    const armY = W[1] - Cy;
    const armZ = Wz - Cz;
    out.travel = left ? tr[0] : tr[1];
    out.otherTravel = left ? tr[1] : tr[0];
    out.wheelX = Wx;
    out.wheelY = Wy;
    out.wheelZ = Wz;
    const at = left ? 0 : 1;
    solver.direction(state, this.spin[at], s);
    const sx = s[0];
    const sy = my * s[1];
    const sz = s[2];
    out.camber = -Math.atan2(sz, Math.hypot(sx, sy));
    out.toe = Math.atan2(sx, sy);
    let ux = -sx * sz;
    let uy = -sy * sz;
    let uz = 1 - sz * sz;
    const un = Math.hypot(ux, uy, uz);
    ux /= un;
    uy /= un;
    uz /= un;
    const r = this.radius;
    out.contactX = Wx - r * ux;
    out.contactY = Wy - r * uy;
    out.contactZ = Wz - r * uz;

    // Spring and damper of this side: lengths are mirror-blind, so they are measured in the car's frame.
    out.springLen = this.length(state, this.springBody[at], this.springWheel[at]);
    out.damperLen = this.length(state, this.damperBody[at], this.damperWheel[at]);

    const k = this.slopes;
    this.along(state, own, armX, armY, armZ, my, sx, sy, sz, un, left, k);
    out.tanBeta = k.tanBeta;
    out.tanThetaCP = k.tanThetaCP;
    out.tanThetaWC = k.tanThetaWC;
    out.camberGain = k.camberGain;
    out.bumpSteer = k.bumpSteer;
    out.mrSpring = k.mrSpring;
    out.mrDamper = k.mrDamper;
    this.along(state, cross, armX, armY, armZ, my, sx, sy, sz, un, left, k);
    out.tanBetaCross = k.tanBeta;
    out.tanThetaCPCross = k.tanThetaCP;
    out.tanThetaWCCross = k.tanThetaWC;
    out.camberGainCross = k.camberGain;
    out.bumpSteerCross = k.bumpSteer;
    out.mrSpringCross = k.mrSpring;
    out.mrDamperCross = k.mrDamper;
    out.rcHeight = out.contactY * (out.tanBeta - out.tanBetaCross);

    // De Dion half-shaft: straight between the two joint centres, seen as the left one.
    const shaft = this.spec.halfshaft;
    if (shaft && this.outerJoint) {
      solver.point(state, this.outerJoint[at], p);
      const dx = p[0] - shaft.diffOutput[0];
      const dy = my * p[1] - shaft.diffOutput[1];
      const dz = p[2] - shaft.diffOutput[2];
      const len = Math.hypot(dx, dy, dz);
      out.plunge = this.shaftLength - len;
      out.cvInner = Math.acos(Math.min(1, dy / len));
      out.cvOuter = Math.acos(Math.min(1, (dx * sx + dy * sy + dz * sz) / len));
    } else {
      out.plunge = 0;
      out.cvInner = 0;
      out.cvOuter = 0;
    }

    if (!left) for (const f of MIRRORED) out[f] = -out[f];
  }

  /** Length of an element from a body point to an axle point (given at design). */
  private length(state: Float64Array, body: Vec3, wheel: Vec3): number {
    const p = this.p;
    this.solver.point(state, wheel, p);
    return Math.hypot(p[0] - body[0], p[1] - body[1], p[2] - body[2]);
  }

  /**
   * Slopes of the wheel when the axle moves with state velocity `v` (δt of the axle centre, δθ), into `out`. The arm
   * (ax, ay, az) is W − C in the car's frame; the wheel's velocity is mirrored for the right wheel (`my` = −1), as are its spin axis
   * (sx, sy, sz, already mirrored) and the angular velocity.
   */
  private along(
    state: Float64Array,
    v: Float64Array,
    ax: number,
    ay: number,
    az: number,
    my: number,
    sx: number,
    sy: number,
    sz: number,
    un: number,
    left: boolean,
    out: Slopes,
  ): void {
    // Wheel-centre velocity in the car's frame, then mirrored; angular velocity mirrored as a pseudo-vector.
    const vx = v[0] + v[4] * az - v[5] * ay;
    const vy = my * (v[1] + v[5] * ax - v[3] * az);
    const wx = my * v[3];
    const wy = v[4];
    const wz = my * v[5];
    const ux = (-sx * sz) / un;
    const uy = (-sy * sz) / un;
    const uz = (1 - sz * sz) / un;
    // ds = ω × s; the in-plane up direction u = (ẑ − s·s_z)/|…| moves with it.
    const dsx = wy * sz - wz * sy;
    const dsy = wz * sx - wx * sz;
    const dsz = wx * sy - wy * sx;
    const dux0 = -dsx * sz - sx * dsz;
    const duy0 = -dsy * sz - sy * dsz;
    const duz0 = -2 * sz * dsz;
    const along = ux * dux0 + uy * duy0 + uz * duz0;
    const duy = (duy0 - uy * along) / un;
    const r = this.radius;
    out.tanBeta = vy - r * duy;
    // The axle's point at the contact patch, W − r·u: its velocity is v_W + ω × (−r·u).
    out.tanThetaCP = vx - r * (wy * uz - wz * uy);
    out.tanThetaWC = vx;
    // γ = −asin(s_z), τ = atan2(s_x, s_y)
    out.camberGain = -dsz / Math.sqrt(Math.max(1e-300, 1 - sz * sz));
    out.bumpSteer = (sy * dsx - sx * dsy) / (sx * sx + sy * sy);
    const side = left ? 0 : 1;
    out.mrSpring = this.ratio(state, v, this.springBody[side], this.springWheel[side]);
    out.mrDamper = this.ratio(state, v, this.damperBody[side], this.damperWheel[side]);
  }

  /** Motion ratio −dL/dq of the element from `body` to the axle point `wheel` along the state velocity `v`. */
  private ratio(state: Float64Array, v: Float64Array, body: Vec3, wheel: Vec3): number {
    const c0 = this.solver.c0;
    const p = this.q;
    this.solver.point(state, wheel, p);
    const lx = p[0] - body[0];
    const ly = p[1] - body[1];
    const lz = p[2] - body[2];
    const L = Math.hypot(lx, ly, lz);
    const px = p[0] - c0[0] - state[0];
    const py = p[1] - c0[1] - state[1];
    const pz = p[2] - c0[2] - state[2];
    const vx = v[0] + v[4] * pz - v[5] * py;
    const vy = v[1] + v[5] * px - v[3] * pz;
    const vz = v[2] + v[3] * py - v[4] * px;
    return -(lx * vx + ly * vy + lz * vz) / L;
  }

  /** Roll centre at design ride height, m above the road. */
  rollCentre(): number {
    const s = newSolidSample();
    this.measureAt(0, 0, 'left', s);
    return s.rcHeight;
  }

  /** Pose of `side`'s wheel for the 3D, in the corner layout (see SolidAxleSolver.wheelPose). */
  wheelPose(state: Float64Array, side: Side, out: Float64Array): void {
    this.solver.wheelPose(state, side, out);
  }
}

export function buildSolidAxle(spec: AxleSpec<SolidAxleLinkage>): SolidAxle {
  return new SolidAxle(spec);
}

export { AXLE_STATE_SIZE };
