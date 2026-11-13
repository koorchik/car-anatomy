// Forces the links put on the knuckle, by statics on the solver's Jacobian. Conventions are at the top of
// kinematics.ts.
//
// The wheel, hub, knuckle and strut tube are one rigid body. Its virtual motion (δt, δθ about the wheel centre W)
// makes a force F at point p do the work F·δt + ((p − W) × F)·δθ, so a set of applied forces is one generalised
// force g. Each row of the solver's Jacobian is the virtual work of its constraint's reaction per unit multiplier,
// so the reactions λ that hold the body satisfy Jᵀ·λ = −g:
//   - a distance row (a rod, one leg of a wishbone) pushes the knuckle point along the link from its body end with
//     λ newtons: positive λ is compression;
//   - the strut's two rows push the strut sideways at the top mount, perpendicular to its axis: the side load that
//     bends the rod;
//   - the travel row is not hardware. Its λ is the vertical force at W left over by everything else: what accelerates
//     the unsprung mass. At rest it is zero, so the tyre, the spring and the links balance exactly.
// Row i's force on the knuckle is λ_i times the first three numbers of Jacobian row i, applied at the knuckle point of
// a rod or wishbone, at the top mount for the strut, and at W for the travel row.
//
// A split knuckle (dual-axis, RevoKnuckle) is two bodies, the strut carrier and the wheel knuckle turning in it by ψ,
// so the virtual motion has a seventh number δψ and the system is 7×7. A force on the wheel knuckle does no work
// through δψ (the pose is the wheel's); a force on the carrier does, F·(dp/dψ), so it goes in through carrierForce().
// The hold's row is a pure couple on the carrier: no force to draw.

import type { Vec3 } from './spec.ts';
import type { Axle } from './kinematics.ts';
import type { CornerSolver } from './solve.ts';
import { solveLinear } from './vec.ts';

/** Largest number of unknowns (a split knuckle). */
const MAX_N = 7;

export class KnuckleStatics {
  readonly solver: CornerSolver;
  /** Multiplier of each row after solve(), N. */
  readonly lambda: Float64Array;
  private readonly n: number;
  private readonly J = new Float64Array(MAX_N * MAX_N);
  private readonly A = new Float64Array(MAX_N * MAX_N);
  private readonly g = new Float64Array(MAX_N);
  private readonly dq = new Float64Array(MAX_N);
  private readonly p = new Float64Array(3);
  private readonly v = new Float64Array(3);
  private pose: Float64Array | null = null;
  private wx = 0;
  private wy = 0;
  private wz = 0;

  constructor(axle: Axle) {
    this.solver = axle.solver;
    this.n = this.solver.n;
    this.lambda = new Float64Array(this.n);
  }

  /** Starts a new set of forces at a solved pose. */
  begin(pose: Float64Array, travel: number, rack: number): void {
    this.solver.fullJacobian(pose, travel, rack, this.J);
    this.pose = pose;
    const c0 = this.solver.c0;
    this.wx = c0[0] + pose[0];
    this.wy = c0[1] + pose[1];
    this.wz = c0[2] + pose[2];
    this.g.fill(0);
  }

  /** Adds an applied force (N) acting on the knuckle body at point p (m), body frame. */
  force(px: number, py: number, pz: number, fx: number, fy: number, fz: number): void {
    const g = this.g;
    const ax = px - this.wx;
    const ay = py - this.wy;
    const az = pz - this.wz;
    g[0] += fx;
    g[1] += fy;
    g[2] += fz;
    g[3] += ay * fz - az * fy;
    g[4] += az * fx - ax * fz;
    g[5] += ax * fy - ay * fx;
  }

  /**
   * Adds an applied force (N) on the carrier of a split knuckle at its point `k` (given at design): the strut's own
   * force at the strut's lower point. Without a split the carrier is the knuckle, and this is force() at that point.
   */
  carrierForce(k: Vec3, fx: number, fy: number, fz: number): void {
    const p = this.p;
    const pose = this.pose!;
    this.solver.carrierPoint(pose, k, p);
    this.force(p[0], p[1], p[2], fx, fy, fz);
    if (this.n < 7) return;
    // dp/dψ: the carrier point's velocity for a unit turn of the knuckle in the carrier.
    this.dq.fill(0);
    this.dq[6] = 1;
    this.solver.pointVelocity(pose, this.dq, k, false, this.v);
    this.g[6] += fx * this.v[0] + fy * this.v[1] + fz * this.v[2];
  }

  /** Solves Jᵀ·λ = −g. Returns false when the linkage is singular here. */
  solve(): boolean {
    const { A, J, lambda, n } = this;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i * n + j] = J[j * n + i];
    for (let i = 0; i < n; i++) lambda[i] = -this.g[i];
    return solveLinear(A, lambda, n) !== 0;
  }

  /** The force row `i` puts on the knuckle (or the carrier), N, into out[o..o+2]. */
  rowForce(i: number, out: Float64Array | number[], o = 0): void {
    const l = this.lambda[i];
    const n = this.n;
    out[o] = l * this.J[n * i];
    out[o + 1] = l * this.J[n * i + 1];
    out[o + 2] = l * this.J[n * i + 2];
  }
}
