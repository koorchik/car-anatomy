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

import type { Axle } from './kinematics.ts';
import type { CornerSolver } from './solve.ts';
import { solveLinear } from './vec.ts';

export class KnuckleStatics {
  readonly solver: CornerSolver;
  /** Multiplier of each row after solve(), N. */
  readonly lambda = new Float64Array(6);
  private readonly J = new Float64Array(36);
  private readonly A = new Float64Array(36);
  private readonly g = new Float64Array(6);
  private wx = 0;
  private wy = 0;
  private wz = 0;

  constructor(axle: Axle) {
    this.solver = axle.solver;
  }

  /** Starts a new set of forces at a solved pose. */
  begin(pose: Float64Array, travel: number, rack: number): void {
    this.solver.jacobian(pose, travel, rack, this.J);
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

  /** Solves Jᵀ·λ = −g. Returns false when the linkage is singular here. */
  solve(): boolean {
    const { A, J, lambda } = this;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) A[i * 6 + j] = J[j * 6 + i];
    for (let i = 0; i < 6; i++) lambda[i] = -this.g[i];
    return solveLinear(A, lambda, 6) !== 0;
  }

  /** The force row `i` puts on the knuckle, N, into out[o..o+2]. */
  rowForce(i: number, out: Float64Array | number[], o = 0): void {
    const l = this.lambda[i];
    out[o] = l * this.J[6 * i];
    out[o + 1] = l * this.J[6 * i + 1];
    out[o + 2] = l * this.J[6 * i + 2];
  }
}
