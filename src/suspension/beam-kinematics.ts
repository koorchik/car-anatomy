// What a twist-beam axle does at a pair of wheel travels: the numbers a corner table holds (kinematics.ts), measured
// exactly from the closed form of solve-twist-beam.ts. Conventions are at the top of kinematics.ts.
//
// Each wheel of a beam moves with both travels, so every slope comes twice: per metre of the wheel's own travel with
// the other wheel held (the plain names, as a corner has them), and per metre of the other wheel's travel with this one
// held (`…Cross`). Heave is their sum, roll (this wheel up, the other down) their difference, so the roll centre is
// y_C·(tanβ − tanβ_cross) and the road-relative roll camber factor 1 − (t/2)·|dγ/dq_roll|. A corner's cross slopes
// are zero, and then these are its own formulas. There is no table yet: the stage that animates the beam decides
// whether it needs one.

import type { AxleSpec, TwistBeamLinkage, Vec3 } from './spec.ts';
import type { Side } from './kinematics.ts';
import { POSE_SIZE, type SolveResult } from './solve.ts';
import { TwistBeamSolver } from './solve-twist-beam.ts';

/** One wheel of a beam axle at one pair of travels. Angles in radians, lengths in metres. */
export interface BeamSample {
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
  /** Per metre of this wheel's travel, the other wheel held. */
  mrSpring: number;
  mrDamper: number;
  tanBeta: number;
  tanThetaCP: number;
  tanThetaWC: number;
  /** The arm's own point at the contact patch (it turns with the arm, unlike the wheel's lowest point): what outboard
   *  brakes react through. */
  tanThetaKP: number;
  camberGain: number;
  bumpSteer: number;
  /** The same per metre of the other wheel's travel, this wheel held. */
  mrSpringCross: number;
  mrDamperCross: number;
  tanBetaCross: number;
  tanThetaCPCross: number;
  tanThetaWCCross: number;
  tanThetaKPCross: number;
  camberGainCross: number;
  bumpSteerCross: number;
  /** Roll centre of opposite travels at this state, above the road under the wheel: y_C·(tanβ − tanβ_cross). */
  rcHeight: number;
  /** Twist of the beam, positive when the left wheel is up (the same number on both sides), and its slope per metre of
   *  this wheel's travel. The beam's torsion pushes this wheel toward bump with −k·τ·dτ/dq. */
  beamTwist: number;
  twistRate: number;
}

const FIELDS = [
  'travel', 'otherTravel', 'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ',
  'springLen', 'damperLen', 'mrSpring', 'mrDamper', 'tanBeta', 'tanThetaCP', 'tanThetaWC', 'tanThetaKP', 'camberGain',
  'bumpSteer', 'mrSpringCross', 'mrDamperCross', 'tanBetaCross', 'tanThetaCPCross', 'tanThetaWCCross', 'tanThetaKPCross',
  'camberGainCross', 'bumpSteerCross', 'rcHeight', 'beamTwist', 'twistRate',
] as const satisfies readonly (keyof BeamSample)[];

/** Fields whose sign flips on the right wheel (lateral positions and slopes), as Axle.sample does. */
const MIRRORED = ['contactY', 'wheelY', 'tanBeta', 'tanBetaCross'] as const;

export const newBeamSample = (): BeamSample => {
  const s = {} as BeamSample;
  for (const f of FIELDS) s[f] = 0;
  return s;
};

/** Slopes of one wheel along one velocity of its knuckle. */
interface Slopes {
  tanBeta: number;
  tanThetaCP: number;
  tanThetaWC: number;
  tanThetaKP: number;
  camberGain: number;
  bumpSteer: number;
  mrSpring: number;
  mrDamper: number;
}

export class TwistBeamAxle {
  readonly spec: AxleSpec<TwistBeamLinkage>;
  readonly solver: TwistBeamSolver;
  /** Loaded radius at design: the contact point is this far below the wheel centre in the wheel plane. */
  readonly radius: number;
  private readonly springWheel: Vec3;
  private readonly damperWheel: Vec3;
  /** Sign of the determinant at design: a solve that lands on another sign is on another branch. */
  readonly detSign: number;
  // Scratch
  private readonly pose = new Float64Array(POSE_SIZE);
  private readonly own = new Float64Array(6);
  private readonly other = new Float64Array(6);
  private readonly rates = new Float64Array(2);
  private readonly s = new Float64Array(3);
  private readonly p = new Float64Array(3);
  private readonly slopes: Slopes = {
    tanBeta: 0, tanThetaCP: 0, tanThetaWC: 0, tanThetaKP: 0, camberGain: 0, bumpSteer: 0, mrSpring: 0, mrDamper: 0,
  };

  constructor(spec: AxleSpec<TwistBeamLinkage>) {
    this.spec = spec;
    this.solver = new TwistBeamSolver(spec);
    this.radius = spec.wheelCentre[2];
    const { spring, damper } = spec;
    if (spring.wheel === 'strut' || damper.wheel === 'strut') throw new Error('A twist beam has no strut');
    this.springWheel = spring.wheel;
    this.damperWheel = damper.wheel;
    const state = TwistBeamSolver.rest();
    const res = this.solver.solve(state, 0, 0);
    if (!res.ok) throw new Error('The twist beam does not assemble at design');
    this.detSign = res.detSign;
  }

  /** Angles for travels `zL`, `zR` into `state`, warm-started from it; throws off the design branch. */
  solve(state: Float64Array, zL: number, zR: number): SolveResult {
    const res = this.solver.solve(state, zL, zR, 30);
    const at = `${(zL * 1000).toFixed(0)} / ${(zR * 1000).toFixed(0)} mm of travel`;
    if (!res.ok) throw new Error(`The twist beam does not solve at ${at}`);
    if (res.detSign !== this.detSign) throw new Error(`The twist beam jumps to another branch at ${at}`);
    return res;
  }

  /** Solves from rest and measures `side`; returns the state. */
  measureAt(zL: number, zR: number, side: Side, out: BeamSample): Float64Array {
    const state = TwistBeamSolver.rest();
    this.solve(state, zL, zR);
    this.measure(state, side, out);
    return state;
  }

  /** Everything about `side`'s wheel at a solved `state` into `out`. The right wheel's lateral fields are mirrored. */
  measure(state: Float64Array, side: Side, out: BeamSample): void {
    const solver = this.solver;
    const pose = this.pose;
    const c0 = solver.c0;
    solver.pose(state, side, pose);
    solver.derivatives(state, side, this.own, this.other);
    const Wx = c0[0] + pose[0];
    const Wy = c0[1] + pose[1];
    const Wz = c0[2] + pose[2];
    out.travel = Wz - c0[2];
    // The other wheel's height, by the mirror symmetry of the axle: this side's arm at the opposite roll.
    out.otherTravel = solver.travelAt(state[0], side === 'left' ? -state[1] : state[1]);
    out.wheelX = Wx;
    out.wheelY = Wy;
    out.wheelZ = Wz;

    const s = this.s;
    solver.direction(pose, this.spec.spinAxis, s);
    const sx = s[0];
    const sy = s[1];
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

    const spring = this.length(pose, this.spec.spring.body, this.springWheel);
    const damper = this.length(pose, this.spec.damper.body, this.damperWheel);
    out.springLen = spring;
    out.damperLen = damper;

    const k = this.slopes;
    this.along(pose, this.own, un, k);
    out.tanBeta = k.tanBeta;
    out.tanThetaCP = k.tanThetaCP;
    out.tanThetaWC = k.tanThetaWC;
    out.tanThetaKP = k.tanThetaKP;
    out.camberGain = k.camberGain;
    out.bumpSteer = k.bumpSteer;
    out.mrSpring = k.mrSpring;
    out.mrDamper = k.mrDamper;
    this.along(pose, this.other, un, k);
    out.tanBetaCross = k.tanBeta;
    out.tanThetaCPCross = k.tanThetaCP;
    out.tanThetaWCCross = k.tanThetaWC;
    out.tanThetaKPCross = k.tanThetaKP;
    out.camberGainCross = k.camberGain;
    out.bumpSteerCross = k.bumpSteer;
    out.mrSpringCross = k.mrSpring;
    out.mrDamperCross = k.mrDamper;
    out.rcHeight = out.contactY * (out.tanBeta - out.tanBetaCross);

    out.beamTwist = solver.twist(state);
    solver.rollRates(state, this.rates);
    out.twistRate = solver.twistPerRoll(state) * this.rates[side === 'left' ? 0 : 1];

    if (side === 'right') for (const f of MIRRORED) out[f] = -out[f];
  }

  /** Length of a spring or damper between a body point and an arm point. */
  private length(pose: Float64Array, body: Vec3, wheel: Vec3): number {
    const p = this.p;
    this.solver.point(pose, wheel, p);
    return Math.hypot(p[0] - body[0], p[1] - body[1], p[2] - body[2]);
  }

  /** Slopes of the wheel at `pose` when its knuckle moves with velocity `v` = (dt, dθ), into `out`. */
  private along(pose: Float64Array, v: Float64Array, un: number, out: Slopes): void {
    const s = this.s;
    const sx = s[0];
    const sy = s[1];
    const sz = s[2];
    const ux = (-sx * sz) / un;
    const uy = (-sy * sz) / un;
    const uz = (1 - sz * sz) / un;
    // ds = dθ × s; the in-plane up direction u = (ẑ − s·s_z)/|…| moves with it.
    const dsx = v[4] * sz - v[5] * sy;
    const dsy = v[5] * sx - v[3] * sz;
    const dsz = v[3] * sy - v[4] * sx;
    const dux0 = -dsx * sz - sx * dsz;
    const duy0 = -dsy * sz - sy * dsz;
    const duz0 = -2 * sz * dsz;
    const along = ux * dux0 + uy * duy0 + uz * duz0;
    const dux = (dux0 - ux * along) / un;
    const duy = (duy0 - uy * along) / un;
    const r = this.radius;
    out.tanBeta = v[1] - r * duy;
    out.tanThetaCP = v[0] - r * dux;
    out.tanThetaWC = v[0];
    // The arm's point at the contact patch, W − r·u: its velocity is v_W + ω × (−r·u).
    out.tanThetaKP = v[0] - r * (v[4] * uz - v[5] * uy);
    // γ = −asin(s_z), τ = atan2(s_x, s_y)
    out.camberGain = -dsz / Math.sqrt(Math.max(1e-300, 1 - sz * sz));
    out.bumpSteer = (sy * dsx - sx * dsy) / (sx * sx + sy * sy);
    out.mrSpring = this.ratio(pose, v, this.spec.spring.body, this.springWheel);
    out.mrDamper = this.ratio(pose, v, this.spec.damper.body, this.damperWheel);
  }

  /** Motion ratio −dL/dq of the element from `body` to the arm point `wheel` along the knuckle velocity `v`. */
  private ratio(pose: Float64Array, v: Float64Array, body: Vec3, wheel: Vec3): number {
    const c0 = this.solver.c0;
    const p = this.p;
    this.solver.point(pose, wheel, p);
    const lx = p[0] - body[0];
    const ly = p[1] - body[1];
    const lz = p[2] - body[2];
    const L = Math.hypot(lx, ly, lz);
    const px = p[0] - c0[0] - pose[0];
    const py = p[1] - c0[1] - pose[1];
    const pz = p[2] - c0[2] - pose[2];
    const vx = v[0] + v[4] * pz - v[5] * py;
    const vy = v[1] + v[5] * px - v[3] * pz;
    const vz = v[2] + v[3] * py - v[4] * px;
    return -(lx * vx + ly * vy + lz * vz) / L;
  }

  /** Roll centre at design ride height, m above the road. */
  rollCentre(): number {
    const s = newBeamSample();
    this.measureAt(0, 0, 'left', s);
    return s.rcHeight;
  }
}

export function buildTwistBeam(spec: AxleSpec<TwistBeamLinkage>): TwistBeamAxle {
  return new TwistBeamAxle(spec);
}
