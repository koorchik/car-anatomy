// Closed-form position of a knuckle that turns about one axis fixed in the body: trailing arm, semi-trailing arm, swing
// axle. Conventions are at the top of kinematics.ts.
//
// The knuckle turns by φ about the unit axis e through A. With r0 = c0 − A split into r∥ along e and r⊥ across it, and
// m = e × r⊥, the wheel centre is W(φ) = A + r∥ + cos φ·r⊥ + sin φ·m. The driver asks W_z − c0_z = travel, which is
// a·cos φ + b·sin φ = a + travel with a = r⊥_z, b = m_z: one trigonometric equation, solved exactly, with the root
// taken nearest the warm start. Derivatives are exact too: dW/dφ = e × (W − A) and dφ/dtravel = 1/(dW_z/dφ).
//
// PivotSolver extends CornerSolver so that everything typed as a corner solver (the tables, the 3D, the setup) takes
// it unchanged. The base class is built on the same axis written as five distances: the wheel centre and a second
// knuckle point each held at their distances to A and B (a point on a circle about the axis), and a third point held
// at its distance to A. They allow exactly the rotation about A–B, so anything that asks the base class for its rows
// sees the same mechanism; solve and derivatives are replaced by the closed form, and a test checks that Newton on the
// five distances lands on the same pose.

import type { AxleSpec, CornerLinkage, PivotLinkage, Vec3 } from './spec.ts';
import { CornerSolver, SOLVE_TOLERANCE_M, type SolveResult } from './solve.ts';
import { add, cross, dot, scale, sub, unit } from './vec.ts';

/** The axis of `link` written as five distances on the knuckle around the wheel centre `c0` (see the header). */
export function pivotAsLinks(link: PivotLinkage, c0: Vec3): CornerLinkage {
  const A = link.axisA;
  const B = link.axisB;
  const e = unit(sub(B, A));
  const r0 = sub(c0, A);
  const radial = unit(sub(r0, scale(e, dot(r0, e))));
  const tangent = cross(e, radial);
  // Second point across the arm, third along the axis: the only motion left besides the rotation about A–B would be
  // a turn about the line from c0 to the second point, and that changes the third point's distance to A.
  const k2 = add(c0, scale(tangent, 0.1));
  const k3 = add(c0, scale(e, 0.1));
  return {
    kind: 'links',
    wishbones: [
      { id: 'pivot-centre', front: A, rear: B, ball: c0, part: link.armPart },
      { id: 'pivot-across', front: A, rear: B, ball: k2, part: link.armPart },
    ],
    rods: [{ id: 'pivot-along', body: A, knuckle: k3, part: link.armPart }],
  };
}

/**
 * Where the pivot axis meets the transverse plane at `x`: the front-view instant centre of a corner whose points move
 * at that x. Null when the axis runs across the car (a trailing arm: the centre is at infinity).
 */
export function pivotFrontViewCentre(link: PivotLinkage, x: number): { y: number; z: number } | null {
  const e = unit(sub(link.axisB, link.axisA));
  if (Math.abs(e[0]) < 1e-12) return null;
  const s = (x - link.axisA[0]) / e[0];
  return { y: link.axisA[1] + s * e[1], z: link.axisA[2] + s * e[2] };
}

export class PivotSolver extends CornerSolver {
  readonly pivot: PivotLinkage;
  /** Axis point and unit direction. */
  private readonly ax: Vec3;
  private readonly dir: Vec3;
  /** r∥, r⊥ and m of the header. */
  private readonly along: Vec3;
  private readonly across: Vec3;
  private readonly turn: Vec3;

  constructor(spec: AxleSpec<PivotLinkage>) {
    super({ ...spec, linkage: pivotAsLinks(spec.linkage, spec.wheelCentre) });
    this.pivot = spec.linkage;
    this.ax = spec.linkage.axisA;
    this.dir = unit(sub(spec.linkage.axisB, spec.linkage.axisA));
    const r0 = sub(spec.wheelCentre, this.ax);
    this.along = scale(this.dir, dot(r0, this.dir));
    this.across = sub(r0, this.along);
    this.turn = cross(this.dir, this.across);
  }

  /**
   * The base class's rows here are only the axis written as distances; the closed form never reads them. Changing a
   * row length or a strut top would be silently ignored, so both refuse: a pivot corner has nothing to adjust there.
   */
  override setLength(_i: number, _lengthM: number): void {
    throw new Error('A pivot corner has no rod whose length can be set');
  }

  override setTopShift(_top: Vec3, _shift: Vec3): void {
    throw new Error('A pivot corner has no strut top to move');
  }

  /** Turn of the knuckle about the axis in `pose` (its rotation projected on the axis), rad. */
  angleOf(pose: Float64Array): number {
    const e = this.dir;
    return 2 * Math.atan2(pose[3] * e[0] + pose[4] * e[1] + pose[5] * e[2], pose[6]);
  }

  /** Writes the pose of turn `phi` into `pose`. */
  setAngle(pose: Float64Array, phi: number): void {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    for (let k = 0; k < 3; k++) {
      pose[k] = this.ax[k] + this.along[k] + c * this.across[k] + s * this.turn[k] - this.c0[k];
    }
    const h = Math.sin(phi / 2);
    pose[3] = this.dir[0] * h;
    pose[4] = this.dir[1] * h;
    pose[5] = this.dir[2] * h;
    pose[6] = Math.cos(phi / 2);
  }

  /** dW_z/dφ at turn `phi`. */
  private rise(phi: number): number {
    return -this.across[2] * Math.sin(phi) + this.turn[2] * Math.cos(phi);
  }

  /**
   * Exact pose for `travel`; the root nearest the turn of the warm start `pose` is taken. `rack` does nothing: no
   * single-axis corner is steered. The iteration count is 0.
   */
  override solve(pose: Float64Array, travel: number, _rack: number, _maxIterations = 8): SolveResult {
    const a = this.across[2];
    const b = this.turn[2];
    const d = a + travel;
    const rho = Math.hypot(a, b);
    if (!(Math.abs(d) <= rho)) {
      const residual = Number.isFinite(d) ? Math.abs(d) - rho : Infinity;
      return { ok: false, iterations: 0, residual, detSign: 0, worst: 'pivot' };
    }
    const psi = Math.atan2(b, a);
    const spread = Math.acos(d / rho);
    const warm = this.angleOf(pose);
    // Each root moved by whole turns to the one nearest the warm start; then the nearer of the two. Inline, as the 3D
    // calls this every frame.
    const TWO_PI = 2 * Math.PI;
    let p1 = psi + spread;
    p1 += TWO_PI * Math.round((warm - p1) / TWO_PI);
    let p2 = psi - spread;
    p2 += TWO_PI * Math.round((warm - p2) / TWO_PI);
    const phi = Math.abs(p1 - warm) <= Math.abs(p2 - warm) ? p1 : p2;
    this.setAngle(pose, phi);
    const residual = Math.abs(pose[2] - travel);
    const rise = this.rise(phi);
    return { ok: residual < SOLVE_TOLERANCE_M, iterations: 0, residual, detSign: Math.sign(rise), worst: 'pivot' };
  }

  /** Exact dq/dtravel = (e × (W − A), e)·dφ/dtravel; dq/drack is zero. Returns the sign of dW_z/dφ. */
  override derivatives(
    pose: Float64Array,
    _travel: number,
    _rack: number,
    dTravel: Float64Array | null,
    dRack: Float64Array | null,
  ): number {
    const phi = this.angleOf(pose);
    const rise = this.rise(phi);
    if (dTravel) {
      const e = this.dir;
      const w = 1 / rise;
      const rx = this.c0[0] + pose[0] - this.ax[0];
      const ry = this.c0[1] + pose[1] - this.ax[1];
      const rz = this.c0[2] + pose[2] - this.ax[2];
      dTravel[0] = (e[1] * rz - e[2] * ry) * w;
      dTravel[1] = (e[2] * rx - e[0] * rz) * w;
      dTravel[2] = (e[0] * ry - e[1] * rx) * w;
      dTravel[3] = e[0] * w;
      dTravel[4] = e[1] * w;
      dTravel[5] = e[2] * w;
    }
    if (dRack) dRack.fill(0);
    return Math.sign(rise);
  }
}
