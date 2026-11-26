// A rocker (bell crank) driven by a push or pull rod (stage P14-core, the pushrod layout). Conventions are at the top
// of kinematics.ts; the rocker's spec is RockerSpec in spec.ts.
//
// The rocker turns by θ about its axis n through the pivot C. A rocker point R₀ at design is at
//   R(θ) = C + a + cos θ·r + sin θ·(n × r),   a = n·(R₀ − C)·n,  r = R₀ − C − a.
// The rod keeps its length ℓ = |R₀ − P₀| from its outer end P (on the arm or knuckle): |R(θ) − P|² = ℓ², with
// D = P − C − a_rod this is cos θ·(D·r) + sin θ·(D·(n × r)) = (|r|² + |D|² − ℓ²)/2, closed form on the branch that
// holds θ = 0 at design. Differentiating the constraint, θ̇ = (R − P)·Ṗ / ((R − P)·n × (R − C)). Any other rocker
// point E then moves with Ė = θ̇·n × (E − C), which gives the element's length and its motion ratio
// mr = −(E − B)·Ė/|E − B| per unit of Ṗ the corner hands in (kinematics.ts). The motion ratio is not constant: it
// follows the angles of the rod and of the element to their rocker arms, which is what a designer tunes for a rising
// rate.

import type { AxleSpec, RockerSpec, Vec3 } from './spec.ts';
import { cross, dist, dot, mirrorY, scale, sub, unit } from './vec.ts';

/** A rocker point in the rocker's frame: its offset along the axis, and its arm square to it at design. */
interface ArmPoint { along: Vec3; r: Vec3; nr: Vec3 }

export class Rocker {
  readonly spec: RockerSpec;
  readonly n: Vec3;
  readonly rodLengthM: number;
  private readonly rod: ArmPoint;
  private readonly elementArm: ArmPoint;
  /** Branch of the closed form: θ = φ + branch·acos(…). */
  private readonly branch: 1 | -1;
  /** Angle of the last solve, rad. */
  theta = 0;

  constructor(spec: RockerSpec, rodOuterAtDesign: Vec3) {
    this.spec = spec;
    this.n = unit(spec.axis);
    this.rod = this.armPoint(spec.rodEnd);
    this.elementArm = this.armPoint(spec.elementEnd);
    this.rodLengthM = dist(spec.rodEnd, rodOuterAtDesign);
    if (!(dot(this.rod.r, this.rod.r) > 1e-8)) throw new Error('The rod meets the rocker on its axis');
    // The branch whose solution at design is θ = 0.
    const [phi, acos] = this.angles(rodOuterAtDesign);
    this.branch = Math.abs(phi + acos) <= Math.abs(phi - acos) ? 1 : -1;
    const t0 = this.solveAngle(rodOuterAtDesign);
    if (!(Math.abs(t0) < 1e-6)) throw new Error('The rocker does not close at design');
  }

  private armPoint(p: Vec3): ArmPoint {
    const rel = sub(p, this.spec.pivot);
    const along = scale(this.n, dot(rel, this.n));
    const r = sub(rel, along);
    return { along, r, nr: cross(this.n, r) };
  }

  /** φ and acos(K/ρ) of the closed form for the rod's outer end at P. */
  private angles(P: Vec3): [number, number] {
    const rp = this.rod;
    const D = sub(sub(P, this.spec.pivot), rp.along);
    const d1 = dot(D, rp.r);
    const d2 = dot(D, rp.nr);
    const r2 = dot(rp.r, rp.r);
    // |r|·(cos θ·D·r̂ + sin θ·D·(n×r)^) = (|r|² + |D|² − ℓ²)/2, with r and n × r of the same length |r|.
    const K = (r2 + dot(D, D) - this.rodLengthM ** 2) / 2;
    const rho = Math.hypot(d1, d2);
    const c = K / rho;
    if (!(Math.abs(c) <= 1 + 1e-12)) throw new Error('The rod cannot reach the rocker');
    return [Math.atan2(d2, d1), Math.acos(Math.max(-1, Math.min(1, c)))];
  }

  /** The rocker's angle for the rod's outer end at P, rad (0 at design). */
  solveAngle(P: Vec3): number {
    const [phi, acos] = this.angles(P);
    let t = phi + this.branch * acos;
    // Keep it near 0: the closed form returns it up to whole turns.
    t -= 2 * Math.PI * Math.round(t / (2 * Math.PI));
    this.theta = t;
    return t;
  }

  /** A rocker point (given at design by its arm) at angle θ, into `out`. */
  private pointAt(a: ArmPoint, theta: number, out: Float64Array | number[]): void {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const C = this.spec.pivot;
    for (let i = 0; i < 3; i++) out[i] = C[i] + a.along[i] + c * a.r[i] + s * a.nr[i];
  }

  /** The rod end and the element end at angle θ. */
  rodEndAt(theta: number, out: Float64Array | number[]): void {
    this.pointAt(this.rod, theta, out);
  }

  elementEndAt(theta: number, out: Float64Array | number[]): void {
    this.pointAt(this.elementArm, theta, out);
  }

  /** Any rocker point given at design, at angle θ. */
  pointOf(p: Vec3, theta: number): Vec3 {
    const out = [0, 0, 0];
    this.pointAt(this.armPoint(p), theta, out);
    return out as unknown as Vec3;
  }

  /** θ̇ for the rod's outer end at P moving with velocity Pv, at the rocker's angle θ. */
  angleRate(P: ArrayLike<number>, Pv: ArrayLike<number>, theta: number): number {
    const R = [0, 0, 0];
    this.pointAt(this.rod, theta, R);
    const C = this.spec.pivot;
    const n = this.n;
    const dx = R[0] - P[0];
    const dy = R[1] - P[1];
    const dz = R[2] - P[2];
    // n × (R − C)
    const rx = R[0] - C[0];
    const ry = R[1] - C[1];
    const rz = R[2] - C[2];
    const tx = n[1] * rz - n[2] * ry;
    const ty = n[2] * rx - n[0] * rz;
    const tz = n[0] * ry - n[1] * rx;
    const den = dx * tx + dy * ty + dz * tz;
    if (Math.abs(den) < 1e-12) return NaN;
    return (dx * Pv[0] + dy * Pv[1] + dz * Pv[2]) / den;
  }

  /**
   * The element end for the rod's outer end at P moving with Pv: its position into `out` and its velocity into `outV`.
   * Returns the rocker's angle.
   */
  element(P: ArrayLike<number>, Pv: ArrayLike<number>, out: Float64Array, outV: Float64Array): number {
    const theta = this.solveAngle([P[0], P[1], P[2]]);
    this.pointAt(this.elementArm, theta, out);
    const rate = this.angleRate(P, Pv, theta);
    const C = this.spec.pivot;
    const n = this.n;
    const ex = out[0] - C[0];
    const ey = out[1] - C[1];
    const ez = out[2] - C[2];
    outV[0] = rate * (n[1] * ez - n[2] * ey);
    outV[1] = rate * (n[2] * ex - n[0] * ez);
    outV[2] = rate * (n[0] * ey - n[1] * ex);
    return theta;
  }

  /** d|E − B|/dθ of a rocker point E (given at design) to a body point B, at angle θ. */
  lengthRate(point: Vec3, body: Vec3, theta: number): number {
    const E = this.pointOf(point, theta);
    const d = sub(E, body);
    const v = cross(this.n, sub(E, this.spec.pivot));
    return dot(d, v) / Math.hypot(d[0], d[1], d[2]);
  }
}

/**
 * The third spring's motion ratio at design over the corner spring's: mr₃ = −∂L₃/∂q_L = mr_s·(∂L₃/∂θ_L)/(∂L_s/∂θ), the
 * two on one rocker. L₃ = |T_L − T_R| with T_R the mirror of T_L, so ∂L₃/∂θ_L = (T_L − T_R)·(n × (T_L − C))/L₃.
 */
export function thirdSpringRatio(spec: AxleSpec, third: Vec3): number {
  const r = spec.spring.rocker;
  if (!r || spec.spring.wheel === 'strut') throw new Error('A third spring sits on the rocker of the corner spring');
  const rocker = new Rocker(r, spec.spring.wheel);
  const d = sub(third, mirrorY(third));
  const v = cross(rocker.n, sub(third, r.pivot));
  const dL3 = dot(d, v) / Math.hypot(d[0], d[1], d[2]);
  return dL3 / rocker.lengthRate(r.elementEnd, spec.spring.body, 0);
}

/** Length of the third spring with the left and right rockers at θ_L and θ_R (the right one mirrored), m. */
export function thirdSpringLength(rocker: Rocker, third: Vec3, thetaL: number, thetaR: number): number {
  return dist(rocker.pointOf(third, thetaL), mirrorY(rocker.pointOf(third, thetaR)));
}
