// Position of the knuckle of an independent corner, by Newton's method on its constraints. Conventions are at the top
// of kinematics.ts.
//
// Unknowns: the knuckle pose relative to its design pose, stored as 7 numbers: translation t of the wheel centre and a
// unit quaternion. A knuckle point k sits at p = c0 + t + R·(k − c0), c0 being the wheel centre at design. A Newton
// step (δt, δθ) moves t by δt and turns R by the world rotation vector δθ about the wheel centre, so every point moves
// by δt + δθ × (p − W) and the Jacobian is analytic.
//
// Rows: one per distance (each rod, two per wishbone), two for a strut (its knuckle-fixed axis must pass through the
// top mount), one for the driver (wheel centre height = design + travel). Five constraints and one driver make the
// square 6×6 system. Derivatives with respect to travel and rack come from the same Jacobian by the implicit function
// theorem: J·dq/ds = −∂r/∂s.

import type { AxleSpec, Vec3 } from './spec.ts';
import { cross, dist, perpendicular, rotateQuatBy, solveLinear, sub, unit } from './vec.ts';

/** Pose layout: [tx, ty, tz, qx, qy, qz, qw]. */
export const POSE_SIZE = 7;

export interface SolveResult {
  ok: boolean;
  iterations: number;
  /** Largest residual left, m. */
  residual: number;
  /** Sign of det J at the solution: a change along a sweep means the linkage jumped to another branch. */
  detSign: number;
  /** The constraint with the largest residual, for the error message. */
  worst: string;
}

/** Residual below which a pose counts as solved, m. */
export const SOLVE_TOLERANCE_M = 1e-11;

const fillResult = (out: SolveResult | undefined, ok: boolean, iterations: number, residual: number, detSign: number, worst: string): SolveResult => {
  if (!out) return { ok, iterations, residual, detSign, worst };
  out.ok = ok;
  out.iterations = iterations;
  out.residual = residual;
  out.detSign = detSign;
  out.worst = worst;
  return out;
};

export class CornerSolver {
  /** Wheel centre at design. */
  readonly c0: Vec3;
  /** Names of the six rows, for messages. */
  readonly rows: string[] = [];
  private readonly nDist: number;
  private readonly body: Float64Array;
  /** Knuckle points relative to c0, in the knuckle (design) frame. */
  private readonly knuckle: Float64Array;
  private readonly len: Float64Array;
  private readonly steer: Uint8Array;
  private readonly strut: boolean;
  private readonly lower = new Float64Array(3);
  private readonly top = new Float64Array(3);
  private readonly e1 = new Float64Array(3);
  private readonly e2 = new Float64Array(3);
  // Scratch, so a solve allocates nothing.
  private readonly R = new Float64Array(9);
  private readonly r = new Float64Array(6);
  private readonly J = new Float64Array(36);
  private readonly A = new Float64Array(36);
  private readonly b = new Float64Array(6);

  constructor(spec: AxleSpec) {
    const link = spec.linkage;
    this.c0 = spec.wheelCentre;
    const dists: Array<{ name: string; body: Vec3; knuckle: Vec3; len: number; steer: boolean }> = [];
    for (const w of link.wishbones) {
      dists.push({ name: `${w.id}.front`, body: w.front, knuckle: w.ball, len: dist(w.front, w.ball), steer: false });
      dists.push({ name: `${w.id}.rear`, body: w.rear, knuckle: w.ball, len: dist(w.rear, w.ball), steer: false });
    }
    for (const r of link.rods) {
      const len = r.lengthM ?? dist(r.body, r.knuckle);
      dists.push({ name: r.id, body: r.body, knuckle: r.knuckle, len, steer: !!r.steer });
    }
    this.strut = !!link.strut;
    const count = dists.length + (this.strut ? 2 : 0);
    if (count !== 5) throw new Error(`An independent corner needs 5 constraints, this one has ${count}`);
    this.nDist = dists.length;
    this.body = new Float64Array(3 * this.nDist);
    this.knuckle = new Float64Array(3 * this.nDist);
    this.len = new Float64Array(this.nDist);
    this.steer = new Uint8Array(this.nDist);
    dists.forEach((d, i) => {
      for (let a = 0; a < 3; a++) {
        this.body[3 * i + a] = d.body[a];
        this.knuckle[3 * i + a] = d.knuckle[a] - this.c0[a];
      }
      this.len[i] = d.len;
      this.steer[i] = d.steer ? 1 : 0;
      this.rows.push(d.name);
    });
    if (link.strut) {
      const s = link.strut;
      const axis = unit(sub(s.top, s.lower));
      const e1 = perpendicular(axis);
      const e2 = cross(axis, e1);
      const shift = s.topShift ?? [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        this.lower[a] = s.lower[a] - this.c0[a];
        this.top[a] = s.top[a] + shift[a];
        this.e1[a] = e1[a];
        this.e2[a] = e2[a];
      }
      this.rows.push('strut', 'strut');
    }
    this.rows.push('travel');
  }

  /** Changes the length of distance row `i` (a turnbuckle). */
  setLength(i: number, lengthM: number): void {
    this.len[i] = lengthM;
  }

  lengthOf(i: number): number {
    return this.len[i];
  }

  /** Moves the strut top mount on the body to `top + shift`. */
  setTopShift(top: Vec3, shift: Vec3): void {
    for (let a = 0; a < 3; a++) this.top[a] = top[a] + shift[a];
  }

  /** Number of distance rows (two per wishbone, then one per rod); the strut's two rows follow, the travel row is last. */
  get distanceRows(): number {
    return this.nDist;
  }

  /**
   * The 6×6 Jacobian of the rows at `pose` into `out` (row-major; columns δt, then δθ about the wheel centre). Row i
   * read as a force is the direction its constraint pushes the knuckle with (knuckle-statics.ts).
   */
  jacobian(pose: Float64Array, travel: number, rack: number, out: Float64Array): void {
    this.assemble(pose, travel, rack);
    out.set(this.J);
  }

  /** Index of the first steered rod among the distance rows, or −1. */
  steerRow(): number {
    for (let i = 0; i < this.nDist; i++) if (this.steer[i]) return i;
    return -1;
  }

  /** The identity pose: the knuckle where the drawing has it. */
  static identity(out = new Float64Array(POSE_SIZE)): Float64Array {
    out.fill(0);
    out[6] = 1;
    return out;
  }

  /** Rotation matrix of the pose into this.R. */
  private matrix(pose: Float64Array): void {
    const x = pose[3];
    const y = pose[4];
    const z = pose[5];
    const w = pose[6];
    const R = this.R;
    R[0] = 1 - 2 * (y * y + z * z);
    R[1] = 2 * (x * y - z * w);
    R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w);
    R[4] = 1 - 2 * (x * x + z * z);
    R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w);
    R[7] = 2 * (y * z + x * w);
    R[8] = 1 - 2 * (x * x + y * y);
  }

  /** World position of knuckle point `k` (given at design) for `pose`, into out[o..o+2]. */
  point(pose: Float64Array, k: Vec3, out: Float64Array | number[], o = 0): void {
    this.matrix(pose);
    const R = this.R;
    const kx = k[0] - this.c0[0];
    const ky = k[1] - this.c0[1];
    const kz = k[2] - this.c0[2];
    out[o] = this.c0[0] + pose[0] + R[0] * kx + R[1] * ky + R[2] * kz;
    out[o + 1] = this.c0[1] + pose[1] + R[3] * kx + R[4] * ky + R[5] * kz;
    out[o + 2] = this.c0[2] + pose[2] + R[6] * kx + R[7] * ky + R[8] * kz;
  }

  /** World direction of knuckle vector `v` for `pose`. */
  direction(pose: Float64Array, v: Vec3, out: Float64Array | number[], o = 0): void {
    this.matrix(pose);
    const R = this.R;
    out[o] = R[0] * v[0] + R[1] * v[1] + R[2] * v[2];
    out[o + 1] = R[3] * v[0] + R[4] * v[1] + R[5] * v[2];
    out[o + 2] = R[6] * v[0] + R[7] * v[1] + R[8] * v[2];
  }

  /** Residuals and Jacobian at `pose` into this.r and this.J. */
  private assemble(pose: Float64Array, travel: number, rack: number): void {
    this.matrix(pose);
    const R = this.R;
    const r = this.r;
    const J = this.J;
    const Wx = this.c0[0] + pose[0];
    const Wy = this.c0[1] + pose[1];
    const Wz = this.c0[2] + pose[2];
    let row = 0;
    for (let i = 0; i < this.nDist; i++, row++) {
      const kx = this.knuckle[3 * i];
      const ky = this.knuckle[3 * i + 1];
      const kz = this.knuckle[3 * i + 2];
      const ax = R[0] * kx + R[1] * ky + R[2] * kz;
      const ay = R[3] * kx + R[4] * ky + R[5] * kz;
      const az = R[6] * kx + R[7] * ky + R[8] * kz;
      const dx = Wx + ax - this.body[3 * i];
      const dy = Wy + ay - this.body[3 * i + 1] - (this.steer[i] ? rack : 0);
      const dz = Wz + az - this.body[3 * i + 2];
      const L = this.len[i];
      r[row] = (dx * dx + dy * dy + dz * dz - L * L) / (2 * L);
      const o = 6 * row;
      J[o] = dx / L;
      J[o + 1] = dy / L;
      J[o + 2] = dz / L;
      J[o + 3] = (ay * dz - az * dy) / L;
      J[o + 4] = (az * dx - ax * dz) / L;
      J[o + 5] = (ax * dy - ay * dx) / L;
    }
    if (this.strut) {
      const lx = this.lower[0];
      const ly = this.lower[1];
      const lz = this.lower[2];
      const px = Wx + R[0] * lx + R[1] * ly + R[2] * lz;
      const py = Wy + R[3] * lx + R[4] * ly + R[5] * lz;
      const pz = Wz + R[6] * lx + R[7] * ly + R[8] * lz;
      const tx = this.top[0] - px;
      const ty = this.top[1] - py;
      const tz = this.top[2] - pz;
      const hx = this.top[0] - Wx;
      const hy = this.top[1] - Wy;
      const hz = this.top[2] - Wz;
      for (const e of [this.e1, this.e2]) {
        const ex = R[0] * e[0] + R[1] * e[1] + R[2] * e[2];
        const ey = R[3] * e[0] + R[4] * e[1] + R[5] * e[2];
        const ez = R[6] * e[0] + R[7] * e[1] + R[8] * e[2];
        r[row] = tx * ex + ty * ey + tz * ez;
        const o = 6 * row;
        J[o] = -ex;
        J[o + 1] = -ey;
        J[o + 2] = -ez;
        // ∂/∂δθ of (T − p)·e: e × (T − W)
        J[o + 3] = ey * hz - ez * hy;
        J[o + 4] = ez * hx - ex * hz;
        J[o + 5] = ex * hy - ey * hx;
        row++;
      }
    }
    r[row] = pose[2] - travel;
    const o = 6 * row;
    J[o] = 0;
    J[o + 1] = 0;
    J[o + 2] = 1;
    J[o + 3] = 0;
    J[o + 4] = 0;
    J[o + 5] = 0;
  }

  /**
   * Solves the pose for `travel` (wheel centre height above design, m, bump positive) and `rack` (inner ends of
   * steered rods moved along +y, m). `pose` is the warm start and receives the solution. `result`, when given, is
   * filled and returned instead of a new object, so a caller that solves every frame allocates nothing.
   */
  solve(pose: Float64Array, travel: number, rack: number, maxIterations = 8, result?: SolveResult): SolveResult {
    let iterations = 0;
    let detSign = 0;
    for (;;) {
      this.assemble(pose, travel, rack);
      let worst = 0;
      let worstRow = 0;
      for (let i = 0; i < 6; i++) {
        const a = Math.abs(this.r[i]);
        if (a > worst) {
          worst = a;
          worstRow = i;
        }
      }
      if (worst < SOLVE_TOLERANCE_M || iterations >= maxIterations || !Number.isFinite(worst)) {
        if (detSign === 0) {
          this.A.set(this.J);
          this.b.fill(0);
          detSign = solveLinear(this.A, this.b, 6);
        }
        const ok = worst < SOLVE_TOLERANCE_M;
        return fillResult(result, ok, iterations, worst, detSign, this.rows[worstRow]);
      }
      this.A.set(this.J);
      for (let i = 0; i < 6; i++) this.b[i] = -this.r[i];
      detSign = solveLinear(this.A, this.b, 6);
      if (detSign === 0) return fillResult(result, false, iterations, worst, detSign, this.rows[worstRow]);
      // Damped step: never move more than 20 mm or 0.2 rad at once, so a bad start cannot fling the knuckle away.
      const b = this.b;
      const big = Math.max(Math.hypot(b[0], b[1], b[2]) / 0.02, Math.hypot(b[3], b[4], b[5]) / 0.2, 1);
      pose[0] += b[0] / big;
      pose[1] += b[1] / big;
      pose[2] += b[2] / big;
      rotateQuatBy(pose, 3, b[3] / big, b[4] / big, b[5] / big);
      iterations++;
    }
  }

  /**
   * Velocities of the pose with respect to travel and rack at a solved pose: dq/ds = (dt, dθ). Either output may be
   * null. Returns the sign of det J.
   */
  derivatives(
    pose: Float64Array,
    travel: number,
    rack: number,
    dTravel: Float64Array | null,
    dRack: Float64Array | null,
  ): number {
    this.assemble(pose, travel, rack);
    let sign = 0;
    if (dTravel) {
      this.A.set(this.J);
      dTravel.fill(0);
      dTravel[5] = 1;
      sign = solveLinear(this.A, dTravel, 6);
    }
    if (dRack) {
      // ∂r/∂rack = −(p − b)_y / L for steered rods; the right-hand side is its negative.
      this.A.set(this.J);
      dRack.fill(0);
      for (let i = 0; i < this.nDist; i++) if (this.steer[i]) dRack[i] = this.J[6 * i + 1];
      sign = solveLinear(this.A, dRack, 6);
    }
    return sign;
  }
}
