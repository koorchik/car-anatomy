// Position of a twist-beam axle: both arms and their wheels from the travels of the two wheels. Conventions are at the
// top of kinematics.ts.
//
// The beam bends little and twists easily, so the research's kinematic analogy (docs/suspension-research/
// kinematics_geometry.md §2, after a torsion-beam paper known by its abstract) moves each arm about two axes through
// its bush B: in heave both arms swing about the line through the two bushes (the y axis through B), like trailing
// arms; in roll each arm turns about its own line from B to the shear centre S of the beam's section on the centre
// line, like a semi-trailing arm. A first-order analogy, not the elastic beam: it neither bends nor warps.
//
// State: two angles, heave h and roll r. The left arm turns by R = R_y(h)·R_e(r), e the unit axis from B to S at
// design: a twist r about that axis, then a turn h about the bushes' line. Read the other way round, heave carries the
// whole beam, S with it, and the arm then twists about the moved line from B to S. That is how we read the real part
// (its only body mounts are the bushes); no source gives the order (docs/suspension-model.md).
// The right arm is the mirror of the left one at (h, −r). An arm point k (given at design) sits at p = B + R·(k − B).
//
// With r0 = c0 − B split into r∥ along e and r⊥ across it, and m = e × r⊥, the twisted arm is v(r) = r∥ + cos r·r⊥ +
// sin r·m (as in solve-pivot.ts), and the heave turn makes the wheel centre's height
//   W_z(h, r) = B_z − v_x(r)·sin h + v_z(r)·cos h.
// Each wheel's travel is a closed form of the two angles, and so is every pose. The two travels asked, z_L and z_R, are
// two coupled equations W_z(h, r) − c0_z = z_L and W_z(h, −r) − c0_z = z_R; Newton on the two angles with the exact 2×2
// Jacobian meets them in a few steps (dW/dh = ŷ × (W − B), dW/dr = R_y(h)·e × (W − B)). Derivatives per metre of
// either wheel's travel come from the same Jacobian.
//
// Poses use the corner layout of solve.ts: translation of the wheel centre from its design place and a unit
// quaternion, so a knuckle point k is at c0 + t + R·(k − c0). The right wheel's pose is written as the left corner sees
// it (the left arm at (h, −r)), and mirrorPose in kinematics.ts turns it into the right one, as for a corner.

import type { TwistBeamLinkage, AxleSpec, Vec3 } from './spec.ts';
import type { Side } from './kinematics.ts';
import { SOLVE_TOLERANCE_M, type SolveResult } from './solve.ts';
import { cross, dot, rotateInto, scale, sub, unit } from './vec.ts';

/** State layout: [heave angle h, roll angle r], rad. */
export const BEAM_STATE_SIZE = 2;

/** Largest Newton step of either angle, rad. */
const MAX_STEP_RAD = 0.3;
/** Newton goes on to this residual, well under the tolerance, as one more step costs little and keeps the slopes of
 *  neighbouring solves consistent (finite differences of poses need it). */
const TARGET_M = 1e-13;

export class TwistBeamSolver {
  readonly beam: TwistBeamLinkage;
  /** Left wheel centre at design. */
  readonly c0: Vec3;
  /** Left bush. */
  readonly bush: Vec3;
  /** Unit axis of the left arm's roll turn at design, from the bush to the shear centre. */
  readonly rollAxis: Vec3;
  /** r∥, r⊥ and m of the header. */
  private readonly along: Vec3;
  private readonly across: Vec3;
  private readonly turn: Vec3;
  // Scratch, so a solve allocates nothing.
  private readonly v = new Float64Array(3);
  private readonly g = new Float64Array(2);
  private readonly q = new Float64Array(4);
  /** The roll axis turned by heave, and W − B, for the velocities. */
  private readonly roll = new Float64Array(3);
  private readonly arm = new Float64Array(3);

  constructor(spec: AxleSpec<TwistBeamLinkage>) {
    this.beam = spec.linkage;
    this.c0 = spec.wheelCentre;
    this.bush = spec.linkage.bush;
    const e = sub(spec.linkage.shearCentre, this.bush);
    if (!(Math.hypot(e[0], e[1], e[2]) > 1e-9)) throw new Error('The shear centre sits on the bush');
    this.rollAxis = unit(e);
    const r0 = sub(this.c0, this.bush);
    this.along = scale(this.rollAxis, dot(r0, this.rollAxis));
    this.across = sub(r0, this.along);
    this.turn = cross(this.rollAxis, this.across);
  }

  /** The rest state (design): both angles zero. */
  static rest(out: Float64Array = new Float64Array(BEAM_STATE_SIZE)): Float64Array {
    out.fill(0);
    return out;
  }

  /** v(r) of the header into this.v. */
  private twisted(r: number): void {
    const c = Math.cos(r);
    const s = Math.sin(r);
    for (let k = 0; k < 3; k++) this.v[k] = this.along[k] + c * this.across[k] + s * this.turn[k];
  }

  /** Travel of the left wheel (W_z − c0_z) at angles (h, r). */
  travelAt(h: number, r: number): number {
    this.twisted(r);
    return this.bush[2] - this.v[0] * Math.sin(h) + this.v[2] * Math.cos(h) - this.c0[2];
  }

  /** ∂W_z/∂h and ∂W_z/∂r of the left wheel at (h, r), into this.g. */
  private slopes(h: number, r: number): void {
    this.twisted(r);
    const v = this.v;
    const e = this.rollAxis;
    const ch = Math.cos(h);
    const sh = Math.sin(h);
    // d = W − B = R_y(h)·v and a = R_y(h)·e; ∂W/∂h = ŷ × d, ∂W/∂r = a × d.
    const dx = v[0] * ch + v[2] * sh;
    const dy = v[1];
    const ax = e[0] * ch + e[2] * sh;
    this.g[0] = -dx;
    this.g[1] = ax * dy - e[1] * dx;
  }

  /**
   * Angles that put the left wheel at travel `zL` and the right one at `zR`, by Newton from `state` (the warm start),
   * written back into `state`. The determinant's sign at the solution plays the part of a corner's: it changes only
   * where an arm passes the vertical or the two axes stop telling heave from roll.
   */
  solve(state: Float64Array, zL: number, zR: number, maxIterations = 12): SolveResult {
    let h = state[0];
    let r = state[1];
    let residual = Infinity;
    let det = 0;
    let iterations = 0;
    for (;;) {
      const fL = this.travelAt(h, r) - zL;
      const fR = this.travelAt(h, -r) - zR;
      residual = Math.max(Math.abs(fL), Math.abs(fR));
      this.slopes(h, r);
      const a = this.g[0];
      const b = this.g[1];
      this.slopes(h, -r);
      const c = this.g[0];
      const d = -this.g[1];
      det = a * d - b * c;
      if (!(residual >= TARGET_M) || iterations >= maxIterations) break;
      if (!(Math.abs(det) > 1e-300)) break;
      let dh = -(d * fL - b * fR) / det;
      let dr = -(a * fR - c * fL) / det;
      const big = Math.max(Math.abs(dh), Math.abs(dr));
      if (big > MAX_STEP_RAD) {
        dh *= MAX_STEP_RAD / big;
        dr *= MAX_STEP_RAD / big;
      }
      h += dh;
      r += dr;
      iterations++;
    }
    const ok = residual < SOLVE_TOLERANCE_M && Number.isFinite(h) && Number.isFinite(r);
    if (ok) {
      state[0] = h;
      state[1] = r;
    }
    return {
      ok,
      iterations,
      residual: Number.isFinite(residual) ? residual : Infinity,
      detSign: Math.sign(det),
      worst: 'twist-beam',
    };
  }

  /** Pose of `side`'s knuckle at `state`, as the left corner sees it (mirrorPose gives the right one). */
  pose(state: Float64Array, side: Side, out: Float64Array): void {
    const h = state[0];
    const r = side === 'left' ? state[1] : -state[1];
    // q = q_y(h) ⊗ q_e(r)
    const e = this.rollAxis;
    const sr = Math.sin(r / 2);
    const bx = e[0] * sr;
    const by = e[1] * sr;
    const bz = e[2] * sr;
    const bw = Math.cos(r / 2);
    const sh = Math.sin(h / 2);
    const ch = Math.cos(h / 2);
    const q = this.q;
    q[0] = ch * bx + sh * bz;
    q[1] = ch * by + sh * bw;
    q[2] = ch * bz - sh * bx;
    q[3] = ch * bw - sh * by;
    // W = B + R·(c0 − B), so t = W − c0.
    const B = this.bush;
    rotateInto(q, 0, this.c0[0] - B[0], this.c0[1] - B[1], this.c0[2] - B[2], out, 0);
    for (let k = 0; k < 3; k++) out[k] += B[k] - this.c0[k];
    out.set(q, 3);
  }

  /**
   * Velocities of `side`'s knuckle (as the left corner sees it) per metre of its own travel, the other wheel held, into
   * `dOwn`, and per metre of the other wheel's travel, this one held, into `dOther`: (dt, dθ), dt of the wheel centre.
   * Returns the sign of the 2×2 determinant (own, other) by (h, this side's r).
   */
  derivatives(state: Float64Array, side: Side, dOwn: Float64Array | null, dOther: Float64Array | null): number {
    const h = state[0];
    const r = side === 'left' ? state[1] : -state[1];
    // (own, other) = (W_z(h, r), W_z(h, −r)) − c0_z for this side's r.
    this.slopes(h, -r);
    const c = this.g[0];
    const d = -this.g[1];
    this.slopes(h, r);
    const a = this.g[0];
    const b = this.g[1];
    const det = a * d - b * c;
    // d(h, r)/d own = (d, −c)/det, d(h, r)/d other = (−b, a)/det.
    const ch = Math.cos(h);
    const sh = Math.sin(h);
    const e = this.rollAxis;
    const roll = this.roll;
    roll[0] = e[0] * ch + e[2] * sh;
    roll[1] = e[1];
    roll[2] = -e[0] * sh + e[2] * ch;
    // W − B = R_y(h)·v(r); this.v holds v(r) after slopes(h, r).
    const v = this.v;
    const arm = this.arm;
    arm[0] = v[0] * ch + v[2] * sh;
    arm[1] = v[1];
    arm[2] = -v[0] * sh + v[2] * ch;
    if (dOwn) this.velocity(dOwn, d / det, -c / det);
    if (dOther) this.velocity(dOther, -b / det, a / det);
    return Math.sign(det);
  }

  /** (dt, dθ) of the knuckle for angle rates dh, dr: ω = ŷ·dh + this.roll·dr, dt = ω × this.arm. */
  private velocity(out: Float64Array, dh: number, dr: number): void {
    const ox = this.roll[0] * dr;
    const oy = dh + this.roll[1] * dr;
    const oz = this.roll[2] * dr;
    const w = this.arm;
    out[0] = oy * w[2] - oz * w[1];
    out[1] = oz * w[0] - ox * w[2];
    out[2] = ox * w[1] - oy * w[0];
    out[3] = ox;
    out[4] = oy;
    out[5] = oz;
  }

  /** dr/d(left travel) and dr/d(right travel) at `state`, into `out`. */
  rollRates(state: Float64Array, out: Float64Array): void {
    const h = state[0];
    const r = state[1];
    this.slopes(h, -r);
    const c = this.g[0];
    const d = -this.g[1];
    this.slopes(h, r);
    const a = this.g[0];
    const b = this.g[1];
    const det = a * d - b * c;
    out[0] = -c / det;
    out[1] = a / det;
  }

  /**
   * Twist of the beam: the turn of the left arm relative to the right one about +y (along the beam, in the arms'
   * design frame), rad, so positive when the left wheel is up. It depends on r alone, as heave turns both arms alike:
   * τ = 2·atan2(e_y·sin r, 1 − e_y²·(1 − cos r)).
   */
  twist(state: Float64Array): number {
    const ey = this.rollAxis[1];
    const r = state[1];
    return 2 * Math.atan2(ey * Math.sin(r), 1 - ey * ey * (1 - Math.cos(r)));
  }

  /** dτ/dr at `state`. */
  twistPerRoll(state: Float64Array): number {
    const ey = this.rollAxis[1];
    const r = state[1];
    const n = ey * Math.sin(r);
    const dn = ey * Math.cos(r);
    const den = 1 - ey * ey * (1 - Math.cos(r));
    const dden = -ey * ey * Math.sin(r);
    return (2 * (dn * den - n * dden)) / (n * n + den * den);
  }

  /** World point of a knuckle (arm) point `k`, given at design, for a pose of this solver. */
  point(pose: Float64Array, k: Vec3, out: Float64Array | number[], o = 0): void {
    rotateInto(pose, 3, k[0] - this.c0[0], k[1] - this.c0[1], k[2] - this.c0[2], out, o);
    out[o] += this.c0[0] + pose[0];
    out[o + 1] += this.c0[1] + pose[1];
    out[o + 2] += this.c0[2] + pose[2];
  }

  /** A knuckle direction `d` (given at design) turned by a pose. */
  direction(pose: Float64Array, d: Vec3, out: Float64Array | number[], o = 0): void {
    rotateInto(pose, 3, d[0], d[1], d[2], out, o);
  }
}
