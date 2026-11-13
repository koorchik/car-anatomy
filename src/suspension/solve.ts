// Position of the knuckle of an independent corner, by Newton's method on its constraints. Conventions are at the top
// of kinematics.ts.
//
// Unknowns: the knuckle pose relative to its design pose, stored as 7 numbers: translation t of the wheel centre and a
// unit quaternion. A knuckle point k sits at p = c0 + t + R·(k − c0), c0 being the wheel centre at design. A Newton
// step (δt, δθ) moves t by δt and turns R by the world rotation vector δθ about the wheel centre, so every point moves
// by δt + δθ × (p − W) and the Jacobian is analytic.
//
// A split knuckle (dual-axis strut, RevoKnuckle) has one unknown more, the eighth pose number ψ: the turn of the wheel
// knuckle relative to the strut carrier about the steering axis fixed in both. The pose stays the wheel's, and the
// carrier is the knuckle turned back by ψ about that axis: a carrier point c sits at A + R·Rot(â, −ψ)·(c − a0), A being
// the axis point a0 carried by the knuckle. A step δψ moves a carrier point by −δψ·(R·â) × (p − A).
//
// Rows: one per distance (each rod, two per wishbone), two for a strut (its axis, fixed in the carrier, must pass
// through the top mount), one for the hold of a split carrier, one for the driver (wheel centre height = design +
// travel). Five constraints and one driver make the square 6×6 system (7×7 on a split knuckle). Derivatives with
// respect to travel and rack come from the same Jacobian by the implicit function theorem: J·dq/ds = −∂r/∂s.
//
// Without the driver the rows are the constraint Jacobian; its null space (vec.ts nullSpace) holds the motions the links
// leave free: one, the travel, with all links in place, and one more for every link taken away.

import type { AxleSpec, Vec3 } from './spec.ts';
import { cross, dist, dot, nullSpace, perpendicular, rotateQuatBy, solveLinear, sub, unit } from './vec.ts';

/** Pose layout: [tx, ty, tz, qx, qy, qz, qw, ψ]. ψ is 0 on every corner without a split knuckle. */
export const POSE_SIZE = 8;

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

/** Largest number of unknowns (a split knuckle). */
const MAX_N = 7;

export class CornerSolver {
  /** Wheel centre at design. */
  readonly c0: Vec3;
  /** Names of the rows, the driver last, for messages. */
  readonly rows: string[] = [];
  /** Number of unknowns: 6, or 7 with a split knuckle. */
  readonly n: number;
  /** Whether the corner has a split knuckle (a carrier between the strut and the wheel). */
  readonly split: boolean;
  private readonly nDist: number;
  private readonly body: Float64Array;
  /** Knuckle points relative to c0 (carrier points relative to a0), in the design frame. */
  private readonly knuckle: Float64Array;
  /** 1 where the distance row acts on the carrier of a split knuckle. */
  private readonly onCarrier: Uint8Array;
  private readonly len: Float64Array;
  private readonly steer: Uint8Array;
  private readonly strut: boolean;
  private readonly lower = new Float64Array(3);
  private readonly top = new Float64Array(3);
  private readonly e1 = new Float64Array(3);
  private readonly e2 = new Float64Array(3);
  /** Split knuckle: the axis point relative to c0, the axis direction, the hold directions (design frame). */
  private readonly a0 = new Float64Array(3);
  private readonly axis = new Float64Array(3);
  private readonly holdBody = new Float64Array(3);
  private readonly holdCarrier = new Float64Array(3);
  // Scratch, so a solve allocates nothing.
  private readonly R = new Float64Array(9);
  /** Carrier rotation R·Rot(â, −ψ), and the world axis point A and direction. */
  private readonly Rc = new Float64Array(9);
  private readonly A = new Float64Array(3);
  private readonly aw = new Float64Array(3);
  private readonly r = new Float64Array(MAX_N);
  private readonly J = new Float64Array(MAX_N * MAX_N);
  private readonly M = new Float64Array(MAX_N * MAX_N);
  private readonly b = new Float64Array(MAX_N);
  private readonly p = new Float64Array(3);

  constructor(spec: AxleSpec) {
    const link = spec.linkage;
    this.c0 = spec.wheelCentre;
    const split = link.knuckle ?? null;
    this.split = !!split;
    this.n = split ? 7 : 6;
    const dists: Array<{ name: string; body: Vec3; knuckle: Vec3; len: number; steer: boolean; carrier: boolean }> = [];
    for (const w of link.wishbones) {
      const carrier = this.split;
      dists.push({ name: `${w.id}.front`, body: w.front, knuckle: w.ball, len: dist(w.front, w.ball), steer: false, carrier });
      dists.push({ name: `${w.id}.rear`, body: w.rear, knuckle: w.ball, len: dist(w.rear, w.ball), steer: false, carrier });
    }
    for (const r of link.rods) {
      const len = r.lengthM ?? dist(r.body, r.knuckle);
      dists.push({ name: r.id, body: r.body, knuckle: r.knuckle, len, steer: !!r.steer, carrier: false });
    }
    this.strut = !!link.strut;
    const count = dists.length + (this.strut ? 2 : 0) + (split ? 1 : 0);
    if (count !== this.n - 1) {
      throw new Error(`An independent corner needs ${this.n - 1} constraints, this one has ${count}`);
    }
    if (split) {
      const axis = unit(sub(split.axisUpper, split.axisLower));
      const hb = unit(split.hold.body);
      const hc = unit(split.hold.carrier);
      if (Math.abs(dot(hb, hc)) > 1e-9) throw new Error('The hold directions of a split knuckle must be square at design');
      for (let a = 0; a < 3; a++) {
        this.a0[a] = split.axisLower[a] - this.c0[a];
        this.axis[a] = axis[a];
        this.holdBody[a] = hb[a];
        this.holdCarrier[a] = hc[a];
      }
    }
    this.nDist = dists.length;
    this.body = new Float64Array(3 * this.nDist);
    this.knuckle = new Float64Array(3 * this.nDist);
    this.onCarrier = new Uint8Array(this.nDist);
    this.len = new Float64Array(this.nDist);
    this.steer = new Uint8Array(this.nDist);
    dists.forEach((d, i) => {
      for (let a = 0; a < 3; a++) {
        this.body[3 * i + a] = d.body[a];
        this.knuckle[3 * i + a] = d.knuckle[a] - this.c0[a] - (d.carrier ? this.a0[a] : 0);
      }
      this.onCarrier[i] = d.carrier ? 1 : 0;
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
        this.lower[a] = s.lower[a] - this.c0[a] - this.a0[a];
        this.top[a] = s.top[a] + shift[a];
        this.e1[a] = e1[a];
        this.e2[a] = e2[a];
      }
      this.rows.push('strut', 'strut');
    }
    if (split) this.rows.push('hold');
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
    // A split knuckle has seven unknowns and a 7×7 J; the statics are written for the plain knuckle only.
    if (this.split) throw new Error('jacobian: split knuckles have no 6×6 Jacobian');
    this.assemble(pose, travel, rack);
    // Only the first 36 numbers: the 6×6 matrix of a corner with six unknowns, whatever room J has.
    out.set(this.J.subarray(0, 36));
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

  /** Rotation matrix of the pose into this.R; with a split knuckle also the carrier rotation, axis point and direction. */
  private matrix(pose: ArrayLike<number>): void {
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
    if (!this.split) return;
    // Rot(â, −ψ) by Rodrigues, then Rc = R·Rot.
    const [ax, ay, az] = this.axis;
    const c = Math.cos(pose[7]);
    const s = -Math.sin(pose[7]);
    const k = 1 - c;
    const r0 = c + ax * ax * k;
    const r1 = ax * ay * k - az * s;
    const r2 = ax * az * k + ay * s;
    const r3 = ay * ax * k + az * s;
    const r4 = c + ay * ay * k;
    const r5 = ay * az * k - ax * s;
    const r6 = az * ax * k - ay * s;
    const r7 = az * ay * k + ax * s;
    const r8 = c + az * az * k;
    const Rc = this.Rc;
    for (let i = 0; i < 3; i++) {
      const a = R[3 * i];
      const b = R[3 * i + 1];
      const d = R[3 * i + 2];
      Rc[3 * i] = a * r0 + b * r3 + d * r6;
      Rc[3 * i + 1] = a * r1 + b * r4 + d * r7;
      Rc[3 * i + 2] = a * r2 + b * r5 + d * r8;
    }
    const [px, py, pz] = this.a0;
    for (let i = 0; i < 3; i++) {
      this.A[i] = this.c0[i] + pose[i] + R[3 * i] * px + R[3 * i + 1] * py + R[3 * i + 2] * pz;
      this.aw[i] = R[3 * i] * ax + R[3 * i + 1] * ay + R[3 * i + 2] * az;
    }
  }

  /** World position of knuckle point `k` (given at design) for `pose`, into out[o..o+2]. */
  point(pose: ArrayLike<number>, k: Vec3, out: Float64Array | number[], o = 0): void {
    this.matrix(pose);
    const R = this.R;
    const kx = k[0] - this.c0[0];
    const ky = k[1] - this.c0[1];
    const kz = k[2] - this.c0[2];
    out[o] = this.c0[0] + pose[0] + R[0] * kx + R[1] * ky + R[2] * kz;
    out[o + 1] = this.c0[1] + pose[1] + R[3] * kx + R[4] * ky + R[5] * kz;
    out[o + 2] = this.c0[2] + pose[2] + R[6] * kx + R[7] * ky + R[8] * kz;
  }

  /** World position of a point of the strut carrier (given at design): the knuckle's own point without a split. */
  carrierPoint(pose: ArrayLike<number>, k: Vec3, out: Float64Array | number[], o = 0): void {
    if (!this.split) return this.point(pose, k, out, o);
    this.matrix(pose);
    const Rc = this.Rc;
    const kx = k[0] - this.c0[0] - this.a0[0];
    const ky = k[1] - this.c0[1] - this.a0[1];
    const kz = k[2] - this.c0[2] - this.a0[2];
    out[o] = this.A[0] + Rc[0] * kx + Rc[1] * ky + Rc[2] * kz;
    out[o + 1] = this.A[1] + Rc[3] * kx + Rc[4] * ky + Rc[5] * kz;
    out[o + 2] = this.A[2] + Rc[6] * kx + Rc[7] * ky + Rc[8] * kz;
  }

  /**
   * Velocity of a carrier point (given at design) for the pose velocity `dq` (δt, δθ and, split, δψ), into out. With
   * `onKnuckle` the point is the knuckle's.
   */
  pointVelocity(pose: ArrayLike<number>, dq: ArrayLike<number>, k: Vec3, onKnuckle: boolean, out: Float64Array | number[]): void {
    const p = this.p;
    if (onKnuckle) this.point(pose, k, p);
    else this.carrierPoint(pose, k, p);
    const rx = p[0] - this.c0[0] - pose[0];
    const ry = p[1] - this.c0[1] - pose[1];
    const rz = p[2] - this.c0[2] - pose[2];
    out[0] = dq[0] + dq[4] * rz - dq[5] * ry;
    out[1] = dq[1] + dq[5] * rx - dq[3] * rz;
    out[2] = dq[2] + dq[3] * ry - dq[4] * rx;
    if (this.split && !onKnuckle) {
      // −δψ·(â_w × (p − A))
      const sx = p[0] - this.A[0];
      const sy = p[1] - this.A[1];
      const sz = p[2] - this.A[2];
      const [ax, ay, az] = this.aw;
      out[0] -= dq[6] * (ay * sz - az * sy);
      out[1] -= dq[6] * (az * sx - ax * sz);
      out[2] -= dq[6] * (ax * sy - ay * sx);
    }
  }

  /** World direction of knuckle vector `v` for `pose`. */
  direction(pose: ArrayLike<number>, v: Vec3, out: Float64Array | number[], o = 0): void {
    this.matrix(pose);
    const R = this.R;
    out[o] = R[0] * v[0] + R[1] * v[1] + R[2] * v[2];
    out[o + 1] = R[3] * v[0] + R[4] * v[1] + R[5] * v[2];
    out[o + 2] = R[6] * v[0] + R[7] * v[1] + R[8] * v[2];
  }

  /** World direction of carrier vector `v` for `pose`: the knuckle's without a split. */
  carrierDirection(pose: ArrayLike<number>, v: Vec3, out: Float64Array | number[], o = 0): void {
    if (!this.split) return this.direction(pose, v, out, o);
    this.matrix(pose);
    const Rc = this.Rc;
    out[o] = Rc[0] * v[0] + Rc[1] * v[1] + Rc[2] * v[2];
    out[o + 1] = Rc[3] * v[0] + Rc[4] * v[1] + Rc[5] * v[2];
    out[o + 2] = Rc[6] * v[0] + Rc[7] * v[1] + Rc[8] * v[2];
  }

  /** Residuals and Jacobian at `pose` into this.r and this.J (n columns). */
  private assemble(pose: ArrayLike<number>, travel: number, rack: number): void {
    this.matrix(pose);
    const n = this.n;
    const split = this.split;
    const R = this.R;
    const Rc = this.Rc;
    const r = this.r;
    const J = this.J;
    const Wx = this.c0[0] + pose[0];
    const Wy = this.c0[1] + pose[1];
    const Wz = this.c0[2] + pose[2];
    const [Ax, Ay, Az] = this.A;
    const [ux, uy, uz] = this.aw;
    let row = 0;
    for (let i = 0; i < this.nDist; i++, row++) {
      const kx = this.knuckle[3 * i];
      const ky = this.knuckle[3 * i + 1];
      const kz = this.knuckle[3 * i + 2];
      const carrier = this.onCarrier[i] === 1;
      const M = carrier ? Rc : R;
      const ox = carrier ? Ax : Wx;
      const oy = carrier ? Ay : Wy;
      const oz = carrier ? Az : Wz;
      // p = o + M·k; a = p − W
      const px = ox + M[0] * kx + M[1] * ky + M[2] * kz;
      const py = oy + M[3] * kx + M[4] * ky + M[5] * kz;
      const pz = oz + M[6] * kx + M[7] * ky + M[8] * kz;
      const ax = px - Wx;
      const ay = py - Wy;
      const az = pz - Wz;
      const dx = px - this.body[3 * i];
      const dy = py - this.body[3 * i + 1] - (this.steer[i] ? rack : 0);
      const dz = pz - this.body[3 * i + 2];
      const L = this.len[i];
      r[row] = (dx * dx + dy * dy + dz * dz - L * L) / (2 * L);
      const o = n * row;
      J[o] = dx / L;
      J[o + 1] = dy / L;
      J[o + 2] = dz / L;
      J[o + 3] = (ay * dz - az * dy) / L;
      J[o + 4] = (az * dx - ax * dz) / L;
      J[o + 5] = (ax * dy - ay * dx) / L;
      if (split) {
        if (carrier) {
          // dp/dψ = −â_w × (p − A)
          const sx = px - Ax;
          const sy = py - Ay;
          const sz = pz - Az;
          const vx = -(uy * sz - uz * sy);
          const vy = -(uz * sx - ux * sz);
          const vz = -(ux * sy - uy * sx);
          J[o + 6] = (dx * vx + dy * vy + dz * vz) / L;
        } else J[o + 6] = 0;
      }
    }
    if (this.strut) {
      const M = split ? Rc : R;
      const ox = split ? Ax : Wx;
      const oy = split ? Ay : Wy;
      const oz = split ? Az : Wz;
      const lx = this.lower[0];
      const ly = this.lower[1];
      const lz = this.lower[2];
      const px = ox + M[0] * lx + M[1] * ly + M[2] * lz;
      const py = oy + M[3] * lx + M[4] * ly + M[5] * lz;
      const pz = oz + M[6] * lx + M[7] * ly + M[8] * lz;
      const tx = this.top[0] - px;
      const ty = this.top[1] - py;
      const tz = this.top[2] - pz;
      const hx = this.top[0] - Wx;
      const hy = this.top[1] - Wy;
      const hz = this.top[2] - Wz;
      for (let side = 0; side < 2; side++) {
        const e = side === 0 ? this.e1 : this.e2;
        const ex = M[0] * e[0] + M[1] * e[1] + M[2] * e[2];
        const ey = M[3] * e[0] + M[4] * e[1] + M[5] * e[2];
        const ez = M[6] * e[0] + M[7] * e[1] + M[8] * e[2];
        r[row] = tx * ex + ty * ey + tz * ez;
        const o = n * row;
        J[o] = -ex;
        J[o + 1] = -ey;
        J[o + 2] = -ez;
        // ∂/∂δθ of (T − p)·e: e × (T − W)
        J[o + 3] = ey * hz - ez * hy;
        J[o + 4] = ez * hx - ex * hz;
        J[o + 5] = ex * hy - ey * hx;
        if (split) {
          // dp/dψ = −â_w × (p − A), de/dψ = −â_w × e; ∂r/∂ψ = −dp·e + (T − p)·de
          const sx = px - Ax;
          const sy = py - Ay;
          const sz = pz - Az;
          const dpx = -(uy * sz - uz * sy);
          const dpy = -(uz * sx - ux * sz);
          const dpz = -(ux * sy - uy * sx);
          const dex = -(uy * ez - uz * ey);
          const dey = -(uz * ex - ux * ez);
          const dez = -(ux * ey - uy * ex);
          J[o + 6] = -(dpx * ex + dpy * ey + dpz * ez) + tx * dex + ty * dey + tz * dez;
        }
        row++;
      }
    }
    if (split) {
      // b̂·(Rc·ĉ) = 0: ∂/∂δθ = ĉ_w × b̂, ∂/∂ψ = b̂·(−â_w × ĉ_w)
      const [bx, by, bz] = this.holdBody;
      const [cx0, cy0, cz0] = this.holdCarrier;
      const cx = Rc[0] * cx0 + Rc[1] * cy0 + Rc[2] * cz0;
      const cy = Rc[3] * cx0 + Rc[4] * cy0 + Rc[5] * cz0;
      const cz = Rc[6] * cx0 + Rc[7] * cy0 + Rc[8] * cz0;
      r[row] = bx * cx + by * cy + bz * cz;
      const o = n * row;
      J[o] = 0;
      J[o + 1] = 0;
      J[o + 2] = 0;
      J[o + 3] = cy * bz - cz * by;
      J[o + 4] = cz * bx - cx * bz;
      J[o + 5] = cx * by - cy * bx;
      J[o + 6] = -(bx * (uy * cz - uz * cy) + by * (uz * cx - ux * cz) + bz * (ux * cy - uy * cx));
      row++;
    }
    r[row] = pose[2] - travel;
    const o = n * row;
    for (let c = 0; c < n; c++) J[o + c] = 0;
    J[o + 2] = 1;
  }

  /**
   * Solves the pose for `travel` (wheel centre height above design, m, bump positive) and `rack` (inner ends of
   * steered rods moved along +y, m). `pose` is the warm start and receives the solution.
   */
  solve(pose: Float64Array, travel: number, rack: number, maxIterations = 8): SolveResult {
    const n = this.n;
    let iterations = 0;
    let detSign = 0;
    for (;;) {
      this.assemble(pose, travel, rack);
      let worst = 0;
      let worstRow = 0;
      for (let i = 0; i < n; i++) {
        const a = Math.abs(this.r[i]);
        if (a > worst) {
          worst = a;
          worstRow = i;
        }
      }
      if (worst < SOLVE_TOLERANCE_M || iterations >= maxIterations || !Number.isFinite(worst)) {
        if (detSign === 0) {
          this.M.set(this.J);
          this.b.fill(0);
          detSign = solveLinear(this.M, this.b, n);
        }
        const ok = worst < SOLVE_TOLERANCE_M;
        return { ok, iterations, residual: worst, detSign, worst: this.rows[worstRow] };
      }
      this.M.set(this.J);
      for (let i = 0; i < n; i++) this.b[i] = -this.r[i];
      detSign = solveLinear(this.M, this.b, n);
      if (detSign === 0) return { ok: false, iterations, residual: worst, detSign, worst: this.rows[worstRow] };
      // Damped step: never move more than 20 mm or 0.2 rad at once, so a bad start cannot fling the knuckle away.
      const b = this.b;
      const turn = n > 6 ? Math.abs(b[6]) / 0.2 : 0;
      const big = Math.max(Math.hypot(b[0], b[1], b[2]) / 0.02, Math.hypot(b[3], b[4], b[5]) / 0.2, turn, 1);
      pose[0] += b[0] / big;
      pose[1] += b[1] / big;
      pose[2] += b[2] / big;
      rotateQuatBy(pose, 3, b[3] / big, b[4] / big, b[5] / big);
      if (n > 6) pose[7] += b[6] / big;
      iterations++;
    }
  }

  /**
   * Velocities of the pose with respect to travel and rack at a solved pose: dq/ds = (dt, dθ, and dψ on a split
   * knuckle). Either output may be null; each needs room for `n` numbers. Returns the sign of det J.
   */
  derivatives(
    pose: ArrayLike<number>,
    travel: number,
    rack: number,
    dTravel: Float64Array | null,
    dRack: Float64Array | null,
  ): number {
    const n = this.n;
    this.assemble(pose, travel, rack);
    let sign = 0;
    if (dTravel) {
      this.M.set(this.J);
      dTravel.fill(0);
      dTravel[n - 1] = 1;
      sign = solveLinear(this.M, dTravel, n);
    }
    if (dRack) {
      // ∂r/∂rack = −(p − b)_y / L for steered rods; the right-hand side is its negative.
      this.M.set(this.J);
      dRack.fill(0);
      for (let i = 0; i < this.nDist; i++) if (this.steer[i]) dRack[i] = this.J[n * i + 1];
      sign = solveLinear(this.M, dRack, n);
    }
    return sign;
  }

  /**
   * The constraint Jacobian at `pose` without the driver row: (n − 1) × n, row-major, rows named as in `rows`. Columns
   * are δt, δθ (and δψ): a pose velocity v keeps every constraint when J·v = 0.
   */
  constraintJacobian(pose: ArrayLike<number>, rack: number): Float64Array {
    this.assemble(pose, 0, rack);
    return this.J.slice(0, (this.n - 1) * this.n);
  }

  /**
   * The motions of the knuckle the constraints leave free at `pose` with the named rows taken away (a wishbone leg is
   * `<id>.front` or `<id>.rear`, a rod its id, the strut 'strut'): an orthonormal basis of the null space of the
   * remaining constraint rows, each a pose velocity (δt, δθ[, δψ]). With every link in place this is one motion, the
   * travel; each link taken away frees one more.
   */
  freeMotions(pose: ArrayLike<number>, rack: number, without: readonly string[] = []): Float64Array[] {
    const n = this.n;
    const J = this.constraintJacobian(pose, rack);
    const keep: number[] = [];
    for (let i = 0; i < n - 1; i++) if (!without.includes(this.rows[i])) keep.push(i);
    const a = new Float64Array(keep.length * n);
    keep.forEach((i, k) => a.set(J.subarray(n * i, n * (i + 1)), n * k));
    return nullSpace(a, keep.length, n);
  }
}
