// Position of a solid axle (a live axle or a de Dion tube): one rigid part that carries both wheels, held by rods, a
// lateral locator (Panhard rod, Watt's linkage) or two leaf springs. Conventions are at the top of kinematics.ts.
//
// Unknowns: the axle's pose relative to design, as for a corner (translation t of the axle centre c0, the middle of the
// two wheel centres, and a unit quaternion: an axle point a sits at C + R·(a − c0), C = c0 + t), and up to two more
// numbers: the turn ψ of a Watt rocker on the axle, or the swing σ of each leaf's shackle. A Newton step (δt, δθ, δe)
// moves an axle point by δt + δθ × (p − C), so the Jacobian is analytic.
//
// Drivers: the heights of the two wheel centres, z_L and z_R, are held exactly (two hard equations h = 0). Everything
// else is a weighted row: a rod gives its stretch |p − b| − L, weighted by √k. A solid axle has two freedoms (heave and
// roll), and a set with more independent rods than four (four parallel links and a Panhard rod, a few centimetres off
// parallel) has no exact pose off design. The solver then finds the pose of least elastic energy, ½·Σ k_i·r_i², and
// the stretch that remains is the binding the bushes take. It is reported, not hidden (`bind`).
//
// Solve: minimise ½·Σ(w_i·r_i)² subject to h(q) = 0 by Gauss–Newton on the KKT system
//   [JᵀW²J + μ·diag   Aᵀ] [δ]   [−JᵀW²r]
//   [A                 0] [λ] = [−h    ]
// with Levenberg–Marquardt damping μ, raised when a step does not lower the exact merit ½Σ(w·r)² + ν·Σ|h| (ν at
// least 0.1 m and above twice the largest multiplier λ seen) and dropped again after.
// A set that can move exactly converges quadratically; a binding one linearly, and fast, as its stretch is small.
// Unlike a corner's square Jacobian, this KKT matrix says nothing about the branch: JᵀW²J is never indefinite, so its
// determinant keeps its sign on every assembly of the linkage (a crossed Watt rocker, a shackle past its dead point).
// SolidAxle.solve guards the branch by how far the corrector moves from its first-order prediction instead.
// Derivatives with respect to z_L and z_R come from the same system with the full Hessian of the Lagrangian:
// [∇²L Aᵀ; A 0]·[dq; dλ] = [0; e_L or e_R]. Gauss–Newton's JᵀW²J is exact only where every row is met; a binding rod, and
// a leaf's wind-up rows that are never met off design, need the terms Σ w²·r·∇²r + Σ λ·∇²h too (without them the cross
// motion ratio of a leaf axle's damper is 10 % off). ∇²L comes from central differences of the analytic gradient.
//
// Leaf springs follow the SAE three-link model as Project Chrono's ChSAELeafspringAxle builds it: a front leaf on a
// spherical joint at the front eye and a rear leaf on a spherical joint at the shackle, each on a joint about the axle's
// y axis at the clamp, and a shackle swinging about y on the body. Each leaf link is LEAF_LINK_SHARE of its half of the
// spring, so the clamp reaches from A, a quarter of the front half ahead of the seat, to B, a quarter of the rear half
// behind it. Rows per leaf: the two link lengths (rigid), the two links square to the axle's y axis (the joints at the
// clamp; soft, LEAF_LATERAL, for the leaf's lateral give), and the two wind-up angles at the clamp (softer still,
// LEAF_WINDUP, equal front and rear: in Chrono's model these joints carry the leaf's vertical rate, and with the wheel
// heights driven they only choose the axle's pitch). The weights are model choices, not measured.

import type { AxleSpec, LeafSpec, SolidAxleLinkage, Vec3 } from './spec.ts';
import type { Side } from './kinematics.ts';
import { SOLVE_TOLERANCE_M } from './solve.ts';
import { add, dist, mirrorY, nullSpace, rotateQuatBy, scale, solveLinear, sub } from './vec.ts';

/** State layout: [tx, ty, tz, qx, qy, qz, qw, e0, e1, e2]. e0 is the Watt rocker's turn, or e0 and e1 the left and
 *  right shackles' swing; unused extras stay 0. */
export const AXLE_STATE_SIZE = 10;
const EXTRA = 7;

/** Each leaf link is this share of its half of the spring (SAE three-link model, from memory of the SAE spring design
 *  manual HS-788; not checked against it). */
export const LEAF_LINK_SHARE = 0.75;
/** Weights of a leaf's soft rows as shares of the rod stiffness: its lateral give at the clamp, and its wind-up per
 *  radian (as a stretch of 1 m per radian). Model choices: small enough not to strain the rigid rows. */
export const LEAF_LATERAL = 1e-3;
export const LEAF_WINDUP = 1e-6;

/** Least weight ν of the drivers in the merit, m: the multipliers λ start at zero on a set that moves exactly, and the
 *  merit must still prefer meeting the drivers to keeping the rods' first, tiny stretch. */
const NU_MIN_M = 0.1;
/** Step of the central differences of ∇L, m or rad. */
const HESSIAN_STEP = 1e-6;
/** A step this small (m, rad) with the drivers met ends the solve. */
const STEP_TOLERANCE = 1e-11;

/** Row kinds. Rod: length from an axle point to a body point or a shackle end. Watt: length from a Watt rocker end to
 *  a body point. Square: a leaf link square to the axle's y axis, (p − Q)·R·ŷ. Windup: turn of a leaf link relative to
 *  the axle in the side view, rad. */
const ROD = 0;
const WATT = 1;
const SQUARE = 2;
const WINDUP = 3;
type Kind = typeof ROD | typeof WATT | typeof SQUARE | typeof WINDUP;

interface Row {
  kind: Kind;
  name: string;
  /** Weight relative to a rod: √(k_row/k_rod). */
  w: number;
  /** A link meant to keep its length (weight 1): the free motions count these. */
  rigid: boolean;
  /** A rod (trailing link, Panhard rod, Watt rod) whose stretch is binding. A leaf's links give as the leaf works. */
  binds: boolean;
  /** Axle point relative to c0 at design (a rod's axle end, a Watt pivot, a leaf clamp end). */
  a: Vec3;
  /** Body point: a rod's body end, a leaf's front eye, a shackle's body pivot. */
  b: Vec3;
  L: number;
  /** Index (into the state) of the extra unknown the row reads, or −1. */
  extra: number;
  /** Watt: the rocker end's signed height above the pivot at design. Shackle: its length. */
  h: number;
  /** Wind-up: side-view angle of the leaf link and of the axle's x axis at design. */
  link0: number;
}

export interface AxleSolveResult {
  ok: boolean;
  iterations: number;
  /** Largest driver residual left, m. */
  residual: number;
  /** Largest stretch of a rod (trailing link, Panhard rod, Watt rod), m: the binding. 0 on leaves alone. */
  bind: number;
  /** The rod stretched most, '' without rods. */
  worst: string;
}

/** Left and right leaf of a spec: (seat, eyes, shackle pivot, clamp ends A and B). */
function leafPoints(leaf: LeafSpec, mirror: boolean) {
  const m = (p: Vec3): Vec3 => (mirror ? mirrorY(p) : p);
  const seat = m(leaf.axleSeat);
  const front = m(leaf.frontEye);
  const rear = m(leaf.rearEye);
  const pivot = add(rear, [0, 0, leaf.shackleM]);
  const A = add(seat, scale(sub(front, seat), 1 - LEAF_LINK_SHARE));
  const B = add(seat, scale(sub(rear, seat), 1 - LEAF_LINK_SHARE));
  return { seat, front, rear, pivot, A, B };
}

export class SolidAxleSolver {
  readonly spec: AxleSpec<SolidAxleLinkage>;
  /** Axle centre at design: the middle of the two wheel centres. */
  readonly c0: Vec3;
  /** Wheel centres at design, left and right. */
  readonly wheelL: Vec3;
  readonly wheelR: Vec3;
  /** Unknowns: 6, and 1 more with a Watt rocker, 2 with leaf springs. */
  readonly n: number;
  /** Names of the weighted rows, in order. */
  readonly rows: readonly string[];
  private readonly list: Row[];
  private readonly m: number;
  // Scratch: a solve allocates only its result, and the derivatives nothing.
  private readonly R = new Float64Array(9);
  private readonly r: Float64Array;
  private readonly G: Float64Array;
  private readonly h = new Float64Array(2);
  private readonly A: Float64Array;
  private readonly K: Float64Array;
  private readonly x: Float64Array;
  private readonly H: Float64Array;
  private readonly trial = new Float64Array(AXLE_STATE_SIZE);
  private readonly lambda = new Float64Array(2);
  private readonly gPlus: Float64Array;
  private readonly gMinus: Float64Array;
  private readonly p = new Float64Array(3);
  /** Largest rod stretch of the last worstRod() call and its row (−1 with no rods). */
  private worstStretch = 0;
  private worstAt = -1;

  constructor(spec: AxleSpec<SolidAxleLinkage>) {
    this.spec = spec;
    const link = spec.linkage;
    this.wheelL = spec.wheelCentre;
    this.wheelR = mirrorY(spec.wheelCentre);
    this.c0 = [spec.wheelCentre[0], 0, spec.wheelCentre[2]];
    if (!(spec.wheelCentre[1] > 0)) throw new Error('The left wheel centre of a solid axle must be on the left (y > 0)');
    if (!(link.rodStiffness > 0)) throw new Error(`A solid axle's rods need a stiffness, not ${link.rodStiffness}`);
    const rel = (p: Vec3): Vec3 => sub(p, this.c0);
    const rows: Row[] = [];
    const rod = (name: string, body: Vec3, axle: Vec3, extra = -1, h = 0): Row => ({
      kind: ROD, name, w: 1, rigid: true, binds: true, a: rel(axle), b: body, L: 0, extra, h, link0: 0,
    });
    for (const r of link.rods) {
      if (r.steer) throw new Error('A solid axle has no steered rod yet');
      const row = rod(r.id, r.body, r.knuckle);
      row.L = r.lengthM ?? dist(r.body, r.knuckle);
      rows.push(row);
    }
    let extras = 0;
    const lat = link.lateral;
    if (lat.kind === 'panhard') {
      const row = rod('panhard', lat.body, lat.axle);
      row.L = dist(lat.body, lat.axle);
      rows.push(row);
    } else if (lat.kind === 'watt') {
      const w = lat.spec;
      if (!(w.centreLinkM > 0)) throw new Error(`A Watt rocker needs a length, not ${w.centreLinkM}`);
      const half = w.centreLinkM / 2;
      extras = 1;
      for (const [name, body, sign] of [['watt.upper', w.upperBody, 1], ['watt.lower', w.lowerBody, -1]] as const) {
        const end: Vec3 = [w.pivotOnAxle[0], w.pivotOnAxle[1], w.pivotOnAxle[2] + sign * half];
        rows.push({ kind: WATT, name, w: 1, rigid: true, binds: true, a: rel(w.pivotOnAxle), b: body, L: dist(body, end), extra: EXTRA, h: sign * half, link0: 0 });
      }
    } else if (lat.kind === 'leaf') {
      const leaf = lat.spec;
      if (!(leaf.shackleM > 0)) throw new Error(`A leaf shackle needs a length, not ${leaf.shackleM}`);
      extras = 2;
      const lateral = Math.sqrt(LEAF_LATERAL);
      const windup = Math.sqrt(LEAF_WINDUP);
      for (const side of ['left', 'right'] as const) {
        const q = leafPoints(leaf, side === 'right');
        const sigma = EXTRA + (side === 'left' ? 0 : 1);
        const id = `leaf-${side}`;
        if (!(q.front[0] > q.A[0] && q.A[0] > q.B[0] && q.B[0] > q.rear[0])) {
          throw new Error('A leaf runs from its front eye through the seat to its rear eye, front to back');
        }
        const front = { ...rod(`${id}.front`, q.front, q.A), binds: false };
        front.L = dist(q.front, q.A);
        const rear = { ...rod(`${id}.rear`, q.pivot, q.B, sigma, leaf.shackleM), binds: false };
        rear.L = dist(q.rear, q.B);
        rows.push(front, rear);
        rows.push({ ...front, kind: SQUARE, name: `${id}.front-square`, w: lateral, rigid: false });
        rows.push({ ...rear, kind: SQUARE, name: `${id}.rear-square`, w: lateral, rigid: false });
        const angle = (from: Vec3, to: Vec3): number => Math.atan2(to[2] - from[2], to[0] - from[0]);
        rows.push({ ...front, kind: WINDUP, name: `${id}.front-windup`, w: windup, rigid: false, link0: angle(q.front, q.A) });
        rows.push({ ...rear, kind: WINDUP, name: `${id}.rear-windup`, w: windup, rigid: false, link0: angle(q.rear, q.B) });
      }
    }
    this.list = rows;
    this.rows = rows.map((r) => r.name);
    this.m = rows.length;
    this.n = 6 + extras;
    const n = this.n;
    this.r = new Float64Array(this.m);
    this.G = new Float64Array(this.m * n);
    this.A = new Float64Array(2 * n);
    this.K = new Float64Array((n + 2) * (n + 2));
    this.x = new Float64Array(n + 2);
    this.H = new Float64Array(n * n);
    this.gPlus = new Float64Array(n);
    this.gMinus = new Float64Array(n);
  }

  /** The design state: the axle where the drawing has it. */
  static rest(out: Float64Array = new Float64Array(AXLE_STATE_SIZE)): Float64Array {
    out.fill(0);
    out[6] = 1;
    return out;
  }

  /** Rotation matrix of the state into this.R. */
  private matrix(s: ArrayLike<number>): void {
    const x = s[3];
    const y = s[4];
    const z = s[5];
    const w = s[6];
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

  /** World position of axle point `a` (given at design) for state `s`, into out[o..o+2]. */
  point(s: ArrayLike<number>, a: Vec3, out: Float64Array | number[], o = 0): void {
    this.matrix(s);
    const R = this.R;
    const ax = a[0] - this.c0[0];
    const ay = a[1] - this.c0[1];
    const az = a[2] - this.c0[2];
    out[o] = this.c0[0] + s[0] + R[0] * ax + R[1] * ay + R[2] * az;
    out[o + 1] = this.c0[1] + s[1] + R[3] * ax + R[4] * ay + R[5] * az;
    out[o + 2] = this.c0[2] + s[2] + R[6] * ax + R[7] * ay + R[8] * az;
  }

  /** World direction of axle vector `v` for state `s`. */
  direction(s: ArrayLike<number>, v: Vec3, out: Float64Array | number[], o = 0): void {
    this.matrix(s);
    const R = this.R;
    out[o] = R[0] * v[0] + R[1] * v[1] + R[2] * v[2];
    out[o + 1] = R[3] * v[0] + R[4] * v[1] + R[5] * v[2];
    out[o + 2] = R[6] * v[0] + R[7] * v[1] + R[8] * v[2];
  }

  /** Travels of both wheel centres in state `s` (height above design, m), into out[0], out[1]. */
  travels(s: ArrayLike<number>, out: Float64Array | number[]): void {
    const p = this.p;
    this.point(s, this.wheelL, p);
    out[0] = p[2] - this.wheelL[2];
    this.point(s, this.wheelR, p);
    out[1] = p[2] - this.wheelR[2];
  }

  /** World position of a Watt rocker end (`upper` or not) for state `s`. */
  rockerEnd(s: ArrayLike<number>, upper: boolean, out: Float64Array | number[]): void {
    const row = this.list.find((r) => r.kind === WATT && r.h > 0 === upper);
    if (!row) throw new Error('This axle has no Watt rocker');
    const psi = s[EXTRA];
    const a = row.a;
    this.point(s, [a[0] + this.c0[0], a[1] - row.h * Math.sin(psi) + this.c0[1], a[2] + row.h * Math.cos(psi) + this.c0[2]], out);
  }

  /** World position of a leaf's rear eye, the shackle's lower pin, for state `s`. */
  shackleEnd(s: ArrayLike<number>, side: Side, out: Float64Array | number[]): void {
    const row = this.list.find((r) => r.kind === ROD && r.extra === EXTRA + (side === 'left' ? 0 : 1));
    if (!row) throw new Error('This axle has no leaf springs');
    const sigma = s[row.extra];
    out[0] = row.b[0] + row.h * Math.sin(sigma);
    out[1] = row.b[1];
    out[2] = row.b[2] - row.h * Math.cos(sigma);
  }

  /**
   * Residuals and their weighted gradients at `s` into this.r (weighted residuals w·r) and this.G (w·∂r/∂(δt, δθ, δe)),
   * the drivers into this.h and this.A. Returns ½Σ(w·r)².
   */
  private assemble(s: ArrayLike<number>, zL: number, zR: number): number {
    this.matrix(s);
    const R = this.R;
    const n = this.n;
    const r = this.r;
    const G = this.G;
    const Cx = this.c0[0] + s[0];
    const Cy = this.c0[1] + s[1];
    const Cz = this.c0[2] + s[2];
    // The axle's x and y axes in the world.
    const xx = R[0];
    const xy = R[3];
    const xz = R[6];
    const yx = R[1];
    const yy = R[4];
    const yz = R[7];
    let cost = 0;
    for (let i = 0; i < this.m; i++) {
      const row = this.list[i];
      const o = n * i;
      for (let c = 0; c < n; c++) G[o + c] = 0;
      let ax = row.a[0];
      let ay = row.a[1];
      let az = row.a[2];
      // Watt: the rocker end, turned by ψ about the axle's x axis.
      const dax = 0;
      let day = 0;
      let daz = 0;
      if (row.kind === WATT) {
        const psi = s[row.extra];
        const c = Math.cos(psi);
        const sn = Math.sin(psi);
        ay -= row.h * sn;
        az += row.h * c;
        day = -row.h * c;
        daz = -row.h * sn;
      }
      // p = C + R·a, and p − C
      const qx = R[0] * ax + R[1] * ay + R[2] * az;
      const qy = R[3] * ax + R[4] * ay + R[5] * az;
      const qz = R[6] * ax + R[7] * ay + R[8] * az;
      const px = Cx + qx;
      const py = Cy + qy;
      const pz = Cz + qz;
      // The other end Q: a body point, or a shackle end swinging by σ about the body pivot b.
      let Qx = row.b[0];
      const Qy = row.b[1];
      let Qz = row.b[2];
      let dQx = 0;
      let dQz = 0;
      const shackle = row.kind !== WATT && row.extra >= 0;
      if (shackle) {
        const sigma = s[row.extra];
        Qx += row.h * Math.sin(sigma);
        Qz -= row.h * Math.cos(sigma);
        dQx = row.h * Math.cos(sigma);
        dQz = row.h * Math.sin(sigma);
      }
      const dx = px - Qx;
      const dy = py - Qy;
      const dz = pz - Qz;
      const w = row.w;
      let res: number;
      if (row.kind === ROD || row.kind === WATT) {
        const len = Math.hypot(dx, dy, dz);
        const ux = dx / len;
        const uy = dy / len;
        const uz = dz / len;
        res = len - row.L;
        G[o] = w * ux;
        G[o + 1] = w * uy;
        G[o + 2] = w * uz;
        // (p − C) × u
        G[o + 3] = w * (qy * uz - qz * uy);
        G[o + 4] = w * (qz * ux - qx * uz);
        G[o + 5] = w * (qx * uy - qy * ux);
        if (row.kind === WATT) {
          // dp/dψ = R·(0, −h·cos ψ, −h·sin ψ)
          const ex = R[0] * dax + R[1] * day + R[2] * daz;
          const ey = R[3] * dax + R[4] * day + R[5] * daz;
          const ez = R[6] * dax + R[7] * day + R[8] * daz;
          G[o + row.extra - 1] = w * (ux * ex + uy * ey + uz * ez);
        } else if (shackle) G[o + row.extra - 1] = -w * (ux * dQx + uz * dQz);
      } else if (row.kind === SQUARE) {
        // r = (p − Q)·n, n = R·ŷ: ∂/∂δt = n, ∂/∂δθ = (p − C) × n + n × (p − Q), ∂/∂σ = −n·dQ
        res = dx * yx + dy * yy + dz * yz;
        G[o] = w * yx;
        G[o + 1] = w * yy;
        G[o + 2] = w * yz;
        G[o + 3] = w * (qy * yz - qz * yy + (yy * dz - yz * dy));
        G[o + 4] = w * (qz * yx - qx * yz + (yz * dx - yx * dz));
        G[o + 5] = w * (qx * yy - qy * yx + (yx * dy - yy * dx));
        if (shackle) G[o + row.extra - 1] = -w * (yx * dQx + yz * dQz);
      } else {
        // r = (θ(p − Q) − θ0) − (θ(R·x̂) − 0), θ(v) = atan2(v_z, v_x); dθ = k·dv, k = (−v_z, 0, v_x)/(v_x² + v_z²).
        const dl = dx * dx + dz * dz;
        const klx = -dz / dl;
        const klz = dx / dl;
        const da = xx * xx + xz * xz;
        const kax = -xz / da;
        const kaz = xx / da;
        // The front link points back from its eye, near ±π: wrap its turn.
        let turn = Math.atan2(dz, dx) - row.link0;
        if (turn > Math.PI) turn -= 2 * Math.PI;
        else if (turn < -Math.PI) turn += 2 * Math.PI;
        res = turn - Math.atan2(xz, xx);
        G[o] = w * klx;
        G[o + 2] = w * klz;
        // (p − C) × k_l − v × k_a, both k with no y part
        G[o + 3] = w * (qy * klz - (xy * kaz));
        G[o + 4] = w * (qz * klx - qx * klz - (xz * kax - xx * kaz));
        G[o + 5] = w * (-qy * klx - (-xy * kax));
        if (shackle) G[o + row.extra - 1] = -w * (klx * dQx + klz * dQz);
      }
      r[i] = w * res;
      cost += r[i] * r[i];
    }
    // Drivers: W_z − (c_z + z) for each wheel; ∂/∂δt = ẑ, ∂/∂δθ = (W − C) × ẑ.
    const A = this.A;
    A.fill(0);
    for (let k = 0; k < 2; k++) {
      const c = k === 0 ? this.wheelL : this.wheelR;
      const ax = c[0] - this.c0[0];
      const ay = c[1] - this.c0[1];
      const az = c[2] - this.c0[2];
      const wx = R[0] * ax + R[1] * ay + R[2] * az;
      const wy = R[3] * ax + R[4] * ay + R[5] * az;
      const wz = R[6] * ax + R[7] * ay + R[8] * az;
      this.h[k] = Cz + wz - c[2] - (k === 0 ? zL : zR);
      A[n * k + 2] = 1;
      A[n * k + 3] = wy;
      A[n * k + 4] = -wx;
    }
    return 0.5 * cost;
  }

  /** The KKT matrix with damping μ into this.K (its upper-left block also into this.H, undamped). */
  private kkt(mu: number): void {
    const n = this.n;
    const N = n + 2;
    const G = this.G;
    const H = this.H;
    const K = this.K;
    H.fill(0);
    for (let i = 0; i < this.m; i++) {
      const o = n * i;
      for (let a = 0; a < n; a++) {
        const ga = G[o + a];
        if (ga === 0) continue;
        for (let b = a; b < n; b++) H[n * a + b] += ga * G[o + b];
      }
    }
    for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) H[n * a + b] = H[n * b + a];
    K.fill(0);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) K[N * a + b] = H[n * a + b];
      K[N * a + a] += mu * Math.max(H[n * a + a], 1e-9);
      for (let k = 0; k < 2; k++) {
        K[N * a + n + k] = this.A[n * k + a];
        K[N * (n + k) + a] = this.A[n * k + a];
      }
    }
  }

  /** Right-hand side of the Gauss–Newton step into this.x: [−Gᵀ·(w·r); −h]. */
  private stepRhs(): void {
    const n = this.n;
    const x = this.x;
    x.fill(0);
    for (let i = 0; i < this.m; i++) {
      const ri = this.r[i];
      if (ri === 0) continue;
      for (let c = 0; c < n; c++) x[c] -= this.G[n * i + c] * ri;
    }
    x[n] = -this.h[0];
    x[n + 1] = -this.h[1];
  }

  /** Moves state `s` by the step (δt, δθ, δe) in this.x, scaled down by `scaleBy`. */
  private apply(s: Float64Array, scaleBy: number): void {
    const x = this.x;
    s[0] += x[0] / scaleBy;
    s[1] += x[1] / scaleBy;
    s[2] += x[2] / scaleBy;
    rotateQuatBy(s, 3, x[3] / scaleBy, x[4] / scaleBy, x[5] / scaleBy);
    for (let e = 6; e < this.n; e++) s[EXTRA + e - 6] += x[e] / scaleBy;
  }

  /** Largest stretch of a rod at the last assembled state into this.worstStretch, its row into this.worstAt. */
  private worstRod(): void {
    let worst = 0;
    let at = -1;
    for (let i = 0; i < this.m; i++) {
      const row = this.list[i];
      if (!row.binds) continue;
      const v = Math.abs(this.r[i] / row.w);
      if (v > worst || at < 0) {
        worst = v;
        at = i;
      }
    }
    this.worstStretch = worst;
    this.worstAt = at;
  }

  /**
   * Solves the axle for the wheel-centre travels `zL`, `zR` (m above design, bump positive). `s` is the warm start and
   * receives the solution. Use SolidAxle.solve for big moves: it walks there in short steps.
   */
  solve(s: Float64Array, zL: number, zR: number, maxIterations = 40): AxleSolveResult {
    const n = this.n;
    let cost = this.assemble(s, zL, zR);
    let mu = 0;
    let nu = 0;
    let iterations = 0;
    let ok = false;
    for (;;) {
      const hmax = Math.max(Math.abs(this.h[0]), Math.abs(this.h[1]));
      let rmax = 0;
      for (let i = 0; i < this.m; i++) rmax = Math.max(rmax, Math.abs(this.r[i]));
      if (hmax < SOLVE_TOLERANCE_M && rmax < 1e-13) {
        ok = true;
        break;
      }
      if (iterations >= maxIterations || !Number.isFinite(cost)) break;
      // The undamped step first: it decides convergence (and is the step itself when μ = 0).
      this.kkt(0);
      this.stepRhs();
      iterations++;
      const singular = solveLinear(this.K, this.x, n + 2) === 0;
      let big = 0;
      for (let c = 0; c < n; c++) big = Math.max(big, Math.abs(this.x[c]));
      if (!singular && hmax < SOLVE_TOLERANCE_M && big < STEP_TOLERANCE) {
        ok = true;
        break;
      }
      if (!singular) nu = Math.max(nu, NU_MIN_M, 2 * Math.max(Math.abs(this.x[n]), Math.abs(this.x[n + 1])));
      if (singular || mu > 0) {
        if (singular && mu === 0) mu = 1e-6;
        this.kkt(mu);
        this.stepRhs();
        if (solveLinear(this.K, this.x, n + 2) === 0) {
          mu *= 10;
          continue;
        }
        big = 0;
        for (let c = 0; c < n; c++) big = Math.max(big, Math.abs(this.x[c]));
      }
      const merit = cost + nu * (Math.abs(this.h[0]) + Math.abs(this.h[1]));
      // Never move more than 20 mm or 0.2 rad at once.
      const scaleBy = Math.max(
        Math.hypot(this.x[0], this.x[1], this.x[2]) / 0.02,
        Math.hypot(this.x[3], this.x[4], this.x[5]) / 0.2,
        n > 6 ? Math.abs(this.x[6]) / 0.2 : 0,
        n > 7 ? Math.abs(this.x[7]) / 0.2 : 0,
        1,
      );
      const trial = this.trial;
      trial.set(s);
      this.apply(trial, scaleBy);
      const next = this.assemble(trial, zL, zR);
      // A step near the rounding of the merit is taken whatever the merit says: it is the last few digits.
      if (next + nu * (Math.abs(this.h[0]) + Math.abs(this.h[1])) <= merit * (1 + 1e-12) || big < 1e3 * STEP_TOLERANCE) {
        s.set(trial);
        cost = next;
        mu = mu < 1e-9 ? 0 : mu / 10;
      } else {
        mu = mu === 0 ? 1e-6 : mu * 10;
        cost = this.assemble(s, zL, zR);
      }
    }
    this.assemble(s, zL, zR);
    this.worstRod();
    const residual = Math.max(Math.abs(this.h[0]), Math.abs(this.h[1]));
    return { ok, iterations, residual, bind: this.worstStretch, worst: this.worstAt >= 0 ? this.rows[this.worstAt] : '' };
  }

  /**
   * Velocities of the state with respect to z_L and z_R at a solved state: (δt, δθ, δe) per metre, n numbers each.
   * Either output may be null. Returns the sign of det of the KKT matrix.
   */
  derivatives(s: Float64Array, zL: number, zR: number, dL: Float64Array | null, dR: Float64Array | null): number {
    const n = this.n;
    const N = n + 2;
    // Multipliers at the solution: [H Aᵀ; A 0]·[δ; λ] = [−g; −h], δ ≈ 0.
    this.assemble(s, zL, zR);
    this.kkt(0);
    this.stepRhs();
    solveLinear(this.K, this.x, N);
    const lambda = this.lambda;
    lambda[0] = this.x[n];
    lambda[1] = this.x[n + 1];
    // ∇²L by central differences of ∇L along each unknown, into H (symmetrised).
    const H = this.H;
    const trial = this.trial;
    for (let k = 0; k < n; k++) {
      trial.set(s);
      this.nudge(trial, k, HESSIAN_STEP);
      this.lagrangianGradient(trial, this.gPlus);
      trial.set(s);
      this.nudge(trial, k, -HESSIAN_STEP);
      this.lagrangianGradient(trial, this.gMinus);
      for (let c = 0; c < n; c++) H[n * c + k] = (this.gPlus[c] - this.gMinus[c]) / (2 * HESSIAN_STEP);
    }
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const v = (H[n * a + b] + H[n * b + a]) / 2;
        H[n * a + b] = v;
        H[n * b + a] = v;
      }
    }
    this.assemble(s, zL, zR);
    let sign = 0;
    for (let k = 0; k < 2; k++) {
      const out = k === 0 ? dL : dR;
      if (!out) continue;
      const K = this.K;
      K.fill(0);
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) K[N * a + b] = H[n * a + b];
        for (let j = 0; j < 2; j++) {
          K[N * a + n + j] = this.A[n * j + a];
          K[N * (n + j) + a] = this.A[n * j + a];
        }
      }
      this.x.fill(0);
      this.x[n + k] = 1;
      sign = solveLinear(K, this.x, N);
      for (let c = 0; c < n; c++) out[c] = this.x[c];
    }
    return sign;
  }

  /** Moves state `s` by `step` along unknown `k` (δt, δθ, δe). */
  private nudge(s: Float64Array, k: number, step: number): void {
    if (k < 3) s[k] += step;
    else if (k < 6) rotateQuatBy(s, 3, k === 3 ? step : 0, k === 4 ? step : 0, k === 5 ? step : 0);
    else s[EXTRA + k - 6] += step;
  }

  /** ∇L = Jᵀ·W²·r + Aᵀ·λ at state `s`, with this.lambda, into `out`. */
  private lagrangianGradient(s: Float64Array, out: Float64Array): void {
    const n = this.n;
    this.assemble(s, 0, 0);
    for (let c = 0; c < n; c++) out[c] = this.lambda[0] * this.A[c] + this.lambda[1] * this.A[n + c];
    for (let i = 0; i < this.m; i++) {
      const ri = this.r[i];
      if (ri === 0) continue;
      for (let c = 0; c < n; c++) out[c] += this.G[n * i + c] * ri;
    }
  }

  /** Every row's residual at a solved state into `out` (m for rods, Watt rods and squares; rad for wind-up). */
  residuals(s: Float64Array, out: Float64Array): void {
    this.assemble(s, 0, 0);
    for (let i = 0; i < this.m; i++) out[i] = this.r[i] / this.list[i].w;
  }

  /** Largest stretch of a rod at state `s`, m: the binding. */
  bind(s: Float64Array): number {
    this.assemble(s, 0, 0);
    this.worstRod();
    return this.worstStretch;
  }

  /** Whether row `i` is a rod, whose stretch is binding (a leaf's rows give as the leaf works). */
  binds(i: number): boolean {
    return this.list[i].binds;
  }

  /**
   * The rigid rows' Jacobian at `s` (unweighted, m_rigid × n, row-major) without the named rows, and the motions it
   * leaves free: an orthonormal basis of its null space, each a state velocity (δt, δθ, δe). Two for an axle located
   * exactly (heave and roll), one when the rods leave it unable to roll.
   */
  freeMotions(s: Float64Array, without: readonly string[] = []): Float64Array[] {
    const n = this.n;
    this.assemble(s, 0, 0);
    const keep: number[] = [];
    for (let i = 0; i < this.m; i++) if (this.list[i].rigid && !without.includes(this.rows[i])) keep.push(i);
    const a = new Float64Array(keep.length * n);
    keep.forEach((i, k) => {
      for (let c = 0; c < n; c++) a[n * k + c] = this.G[n * i + c] / this.list[i].w;
    });
    return nullSpace(a, keep.length, n);
  }

  /**
   * Pose of one wheel in the corner layout of solve.ts (translation of the wheel centre from the left wheel's design
   * place and a unit quaternion, POSE_SIZE numbers), as the left corner sees it: the right wheel's pose is the mirror of
   * the axle's, so mirrorPose in kinematics.ts turns it into the right one, as for a corner.
   */
  wheelPose(s: ArrayLike<number>, side: Side, out: Float64Array): void {
    const p = this.p;
    this.point(s, side === 'left' ? this.wheelL : this.wheelR, p);
    const m = side === 'left' ? 1 : -1;
    out[0] = p[0] - this.wheelL[0];
    out[1] = m * p[1] - this.wheelL[1];
    out[2] = p[2] - this.wheelL[2];
    out[3] = m * s[3];
    out[4] = s[4];
    out[5] = m * s[5];
    out[6] = s[6];
    if (out.length > 7) out[7] = 0;
  }
}
