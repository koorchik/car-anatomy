// Kinematic tables of a suspension corner. Pure geometry: no rendering, no audio, no text, safe to run anywhere.
//
// Conventions
//   ISO 8855: x forward, y left, z up; metres, newtons, kilograms, radians, seconds. Degrees and millimetres only in
//   data a person writes and in the interface. The origin is on the road under the middle of the axle at design ride
//   height; hardpoints are body points (or knuckle points at design) of the left corner. The right corner is the mirror
//   (y → −y). Scene: scene = (y, z, x)·10, 1 unit = 100 mm.
//   Travel q is the wheel centre's height relative to the body, measured from design ride height, positive in bump.
//   Camber is positive when the top of the wheel leans out, toe positive when the wheel points in (toe-in), caster
//   positive when the steering axis leans back at the top, KPI positive when it leans in at the top, scrub positive
//   when the axis meets the road inboard of the contact patch, trail positive when it meets the road ahead of it. These
//   are relative to the side of the car, so both wheels give the same numbers.
//   Motion ratio mr = −dL/dq: shortening of the spring (or damper) per metre of bump. Positive, about 0.94 on a strut.
//   tanβ = dC_y/dq (left corner: the contact point moving out in bump is positive), tanθ = dP_x/dq.
//   Roll is positive when the left side goes up, pitch positive nose down.
//
// buildAxle solves the corner on a grid of travel (2 mm steps between the end stops) once; the simulation reads the
// table with linear interpolation, the 3D solves each frame exactly starting from the table (solvePose), so links on
// screen never stretch.

import type { AxleSpec, Vec3 } from './spec.ts';
import { CornerSolver, POSE_SIZE, type SolveResult } from './solve.ts';
import { dist, nlerpInto, rotateQuatBy } from './vec.ts';

export type Side = 'left' | 'right';

/** Largest step of the travel grid, m. */
export const GRID_STEP_M = 0.002;

/** Everything a table node holds, also the out-parameter of Axle.sample. Angles in radians, lengths in metres. */
export interface CornerSample {
  travel: number;
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
  mrSpring: number;
  mrDamper: number;
  tanBeta: number;
  tanThetaCP: number;
  tanThetaWC: number;
  caster: number;
  kpi: number;
  scrub: number;
  trail: number;
  /** Halfshaft: plunge into the inner joint (positive pushed in) and the joint angles; 0 on an undriven corner. */
  plunge: number;
  cvInner: number;
  cvOuter: number;
}

const FIELDS = [
  'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ', 'springLen', 'damperLen',
  'mrSpring', 'mrDamper', 'tanBeta', 'tanThetaCP', 'tanThetaWC', 'caster', 'kpi', 'scrub', 'trail', 'plunge', 'cvInner',
  'cvOuter',
] as const;
export type CornerField = (typeof FIELDS)[number];
type Field = CornerField;
/** Fields whose sign flips on the right corner (lateral positions and slopes). */
const MIRRORED: ReadonlySet<Field> = new Set<Field>(['contactY', 'wheelY', 'tanBeta']);

export const newCornerSample = (): CornerSample => {
  const s = { travel: 0 } as CornerSample;
  for (const f of FIELDS) s[f] = 0;
  return s;
};

export interface AxleTable {
  n: number;
  /** Travel of node 0 and the step, m. */
  travel0: number;
  step: number;
  pose: Float64Array;
  fields: Record<Field, Float64Array>;
  /** Newton iterations each node took from its predicted start. */
  iterations: Uint8Array;
  /** Sign of det J, the same on every node (checked). */
  detSign: number;
}

export class Axle {
  readonly spec: AxleSpec;
  readonly solver: CornerSolver;
  readonly table: AxleTable;
  /** Loaded radius at design: the contact point is this far below the wheel centre in the wheel plane. */
  readonly radius: number;
  private readonly kingpinLower: Vec3 | null;
  private readonly kingpinUpper: Vec3 | null;
  private readonly strutLower: Vec3 | null;
  /** Strut top mount on the body, setup shift included. */
  private readonly strutTop: Vec3 | null;
  private readonly seats: number;
  private readonly shaftLength: number;
  // Scratch
  private readonly v = new Float64Array(6);
  private readonly p = new Float64Array(3);
  private readonly s = new Float64Array(3);
  private readonly k = new Float64Array(3);

  constructor(spec: AxleSpec) {
    this.spec = spec;
    this.solver = new CornerSolver(spec);
    this.radius = spec.wheelCentre[2];
    const link = spec.linkage;
    const strut = link.strut;
    this.strutLower = strut ? strut.lower : null;
    const shift = strut?.topShift ?? [0, 0, 0];
    this.strutTop = strut ? [strut.top[0] + shift[0], strut.top[1] + shift[1], strut.top[2] + shift[2]] : null;
    // Steering axis: lower ball joint to strut top (MacPherson), or lower to upper ball joint (two wishbones).
    this.kingpinLower = link.wishbones[0]?.ball ?? null;
    this.kingpinUpper = strut ? null : (link.wishbones[1]?.ball ?? null);
    const seats = spec.spring.strutSeats;
    this.seats = seats ? seats.upperM + seats.lowerM : 0;
    const shaft = spec.halfshaft;
    this.shaftLength = shaft ? dist(shaft.diffOutput, shaft.outerJoint) : 0;
    this.table = this.build();
  }

  /**
   * Every derived quantity of a solved pose of the left corner into `out` (also writes `this.v` = dq/dtravel). Exact:
   * the table stores these at its nodes, and the 3D may call it for any pose.
   */
  measure(pose: Float64Array, travel: number, rack: number, out: CornerSample): void {
    const solver = this.solver;
    const c0 = solver.c0;
    const v = this.v;
    solver.derivatives(pose, travel, rack, v, null);
    const Wx = c0[0] + pose[0];
    const Wy = c0[1] + pose[1];
    const Wz = c0[2] + pose[2];
    out.travel = travel;
    out.wheelX = Wx;
    out.wheelY = Wy;
    out.wheelZ = Wz;
    out.tanThetaWC = v[0];

    // Wheel plane: spin axis s, in-plane up direction u = ẑ − s·s_z.
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
    // d(contact)/dq = dW − r·du_unit, ds = dθ × s
    const dsx = v[4] * sz - v[5] * sy;
    const dsy = v[5] * sx - v[3] * sz;
    const dsz = v[3] * sy - v[4] * sx;
    const dux0 = -dsx * sz - sx * dsz;
    const duy0 = -dsy * sz - sy * dsz;
    const duz0 = -2 * sz * dsz;
    const along = ux * dux0 + uy * duy0 + uz * duz0;
    const dux = (dux0 - ux * along) / un;
    const duy = (duy0 - uy * along) / un;
    out.tanBeta = v[1] - r * duy;
    out.tanThetaCP = v[0] - r * dux;

    // Strut and spring.
    if (this.strutLower && this.strutTop) {
      const T = this.strutTop;
      const p = this.p;
      solver.point(pose, this.strutLower, p);
      const lx = p[0] - T[0];
      const ly = p[1] - T[1];
      const lz = p[2] - T[2];
      const L = Math.hypot(lx, ly, lz);
      const px = p[0] - Wx;
      const py = p[1] - Wy;
      const pz = p[2] - Wz;
      // velocity of the lower strut point: dt + dθ × (p − W)
      const vx = v[0] + v[4] * pz - v[5] * py;
      const vy = v[1] + v[5] * px - v[3] * pz;
      const vz = v[2] + v[3] * py - v[4] * px;
      const mr = -(lx * vx + ly * vy + lz * vz) / L;
      out.damperLen = L;
      out.mrDamper = mr;
      if (this.spec.spring.wheel === 'strut') {
        out.springLen = L - this.seats;
        out.mrSpring = mr;
      } else {
        this.elementOnKnuckle(pose, this.spec.spring.body, this.spec.spring.wheel, out, 'spring');
      }
    } else {
      const sw = this.spec.spring.wheel;
      const dw = this.spec.damper.wheel;
      if (sw !== 'strut') this.elementOnKnuckle(pose, this.spec.spring.body, sw, out, 'spring');
      if (dw !== 'strut') this.elementOnKnuckle(pose, this.spec.damper.body, dw, out, 'damper');
    }

    // Steering axis and its traces on the road.
    if (this.kingpinLower && (this.strutTop || this.kingpinUpper)) {
      const k = this.k;
      solver.point(pose, this.kingpinLower, k);
      let ax: number;
      let ay: number;
      let az: number;
      if (this.kingpinUpper) {
        const up = this.p;
        solver.point(pose, this.kingpinUpper, up);
        ax = up[0] - k[0];
        ay = up[1] - k[1];
        az = up[2] - k[2];
      } else {
        const T = this.strutTop!;
        ax = T[0] - k[0];
        ay = T[1] - k[1];
        az = T[2] - k[2];
      }
      const an = Math.hypot(ax, ay, az);
      ax /= an;
      ay /= an;
      az /= an;
      out.kpi = Math.atan2(-ay, az);
      out.caster = Math.atan2(-ax, az);
      const lambda = (out.contactZ - k[2]) / az;
      out.scrub = out.contactY - (k[1] + ay * lambda);
      out.trail = k[0] + ax * lambda - out.contactX;
    } else {
      out.kpi = NaN;
      out.caster = NaN;
      out.scrub = NaN;
      out.trail = NaN;
    }

    // Halfshaft: straight between the two joint centres.
    const shaft = this.spec.halfshaft;
    if (shaft) {
      const o = this.p;
      solver.point(pose, shaft.outerJoint, o);
      const dx = o[0] - shaft.diffOutput[0];
      const dy = o[1] - shaft.diffOutput[1];
      const dz = o[2] - shaft.diffOutput[2];
      const len = Math.hypot(dx, dy, dz);
      out.plunge = this.shaftLength - len;
      out.cvInner = Math.acos(Math.min(1, dy / len));
      out.cvOuter = Math.acos(Math.min(1, (dx * sx + dy * sy + dz * sz) / len));
    } else {
      out.plunge = 0;
      out.cvInner = 0;
      out.cvOuter = 0;
    }
  }

  /** Length and motion ratio of a spring or damper between a body point and a knuckle point. */
  private elementOnKnuckle(
    pose: Float64Array,
    body: Vec3,
    wheel: Vec3,
    out: CornerSample,
    which: 'spring' | 'damper',
  ): void {
    const v = this.v;
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
    const mr = -(lx * vx + ly * vy + lz * vz) / L;
    if (which === 'spring') {
      out.springLen = L;
      out.mrSpring = mr;
    } else {
      out.damperLen = L;
      out.mrDamper = mr;
    }
  }

  private build(): AxleTable {
    const { bumpM, droopM } = this.spec.travel;
    const n = Math.ceil((bumpM + droopM) / GRID_STEP_M - 1e-9) + 1;
    const step = (bumpM + droopM) / (n - 1);
    const travel0 = -droopM;
    const pose = new Float64Array(POSE_SIZE * n);
    const fields = {} as Record<Field, Float64Array>;
    for (const f of FIELDS) fields[f] = new Float64Array(n);
    const iterations = new Uint8Array(n);
    const sample = newCornerSample();

    // Design pose first (from the drawing), then the node nearest to it, then outward with a first-order predictor.
    const start = CornerSolver.identity();
    const first = this.solver.solve(start, 0, 0, 40);
    if (!first.ok) {
      const off = (first.residual * 1000).toFixed(2);
      throw new Error(`The corner does not assemble at design: ${first.worst} is off by ${off} mm`);
    }
    const detSign = first.detSign;
    const i0 = Math.min(n - 1, Math.max(0, Math.round(-travel0 / step)));
    const cur = new Float64Array(POSE_SIZE);
    const solveNode = (i: number, from: Float64Array, fromTravel: number): void => {
      const travel = travel0 + i * step;
      cur.set(from);
      // Predictor: q + dq/dz·Δz.
      this.solver.derivatives(cur, fromTravel, 0, this.v, null);
      const dz = travel - fromTravel;
      cur[0] += this.v[0] * dz;
      cur[1] += this.v[1] * dz;
      cur[2] += this.v[2] * dz;
      rotateQuatBy(cur, 3, this.v[3] * dz, this.v[4] * dz, this.v[5] * dz);
      const res = this.solver.solve(cur, travel, 0);
      this.check(res, travel, detSign);
      iterations[i] = res.iterations;
      pose.set(cur, POSE_SIZE * i);
      this.measure(cur, travel, 0, sample);
      for (const f of FIELDS) fields[f][i] = sample[f];
    };
    solveNode(i0, start, 0);
    const node = (i: number): Float64Array => pose.subarray(POSE_SIZE * i, POSE_SIZE * (i + 1));
    for (let i = i0 + 1; i < n; i++) solveNode(i, node(i - 1), travel0 + (i - 1) * step);
    for (let i = i0 - 1; i >= 0; i--) solveNode(i, node(i + 1), travel0 + (i + 1) * step);
    return { n, travel0, step, pose, fields, iterations, detSign };
  }

  private check(res: SolveResult, travel: number, detSign: number): void {
    const at = `${(travel * 1000).toFixed(0)} mm of travel`;
    const off = (res.residual * 1000).toFixed(3);
    if (!res.ok) throw new Error(`The corner does not solve at ${at}: ${res.worst} is off by ${off} mm`);
    if (res.detSign !== detSign) throw new Error(`The linkage jumps to another branch at ${at} (${res.worst})`);
  }

  /** Table value of one field at `travel` (left corner), linear between nodes and beyond the ends. */
  value(field: Field, travel: number): number {
    const t = this.table;
    let x = (travel - t.travel0) / t.step;
    let i = Math.floor(x);
    if (i < 0) i = 0;
    else if (i > t.n - 2) i = t.n - 2;
    x -= i;
    const a = t.fields[field];
    return a[i] + (a[i + 1] - a[i]) * x;
  }

  /**
   * Reads the table at `travel` for one side into `out`, allocating nothing. The rack is 0 in stage 1a tables, so
   * `rack` is ignored for now; steering joins the grid with the steered layouts.
   */
  sample(side: Side, travel: number, _rack: number, out: CornerSample): void {
    const t = this.table;
    let x = (travel - t.travel0) / t.step;
    let i = Math.floor(x);
    if (i < 0) i = 0;
    else if (i > t.n - 2) i = t.n - 2;
    x -= i;
    out.travel = travel;
    for (const f of FIELDS) {
      const a = t.fields[f];
      const value = a[i] + (a[i + 1] - a[i]) * x;
      out[f] = side === 'right' && MIRRORED.has(f) ? -value : value;
    }
  }

  /**
   * Exact pose for the 3D at `travel` and `rack`, warm-started from `warm` (or the table when null). The pose is of
   * the left corner; mirrorPose gives the right one.
   */
  solvePose(travel: number, rack: number, warm: Float64Array | null, out: Float64Array): SolveResult {
    if (warm) out.set(warm);
    else this.tablePose(travel, out);
    return this.solver.solve(out, travel, rack, 20);
  }

  /** Pose interpolated from the table: translation linear, rotation normalised-linear. */
  tablePose(travel: number, out: Float64Array): void {
    const t = this.table;
    let x = (travel - t.travel0) / t.step;
    let i = Math.floor(x);
    if (i < 0) i = 0;
    else if (i > t.n - 2) i = t.n - 2;
    x -= i;
    const a = POSE_SIZE * i;
    const b = a + POSE_SIZE;
    for (let k = 0; k < 3; k++) out[k] = t.pose[a + k] + (t.pose[b + k] - t.pose[a + k]) * x;
    nlerpInto(t.pose, a + 3, t.pose, b + 3, x, out, 3);
  }

  /** World point of a knuckle point (given at design) for a left-corner pose. */
  knucklePoint(pose: Float64Array, k: Vec3, out: Float64Array | number[]): void {
    this.solver.point(pose, k, out);
  }

  /** Static pose and quantities at `travel` (exact solve, from the table). */
  measureAt(travel: number, out: CornerSample): Float64Array {
    const pose = new Float64Array(POSE_SIZE);
    const res = this.solvePose(travel, 0, null, pose);
    if (!res.ok) throw new Error(`The corner does not solve at ${(travel * 1000).toFixed(0)} mm: ${res.worst}`);
    this.measure(pose, travel, 0, out);
    return pose;
  }
}

/** The right corner's pose from the left one: mirror across the xz plane. */
export function mirrorPose(left: Float64Array, out: Float64Array): void {
  out[0] = left[0];
  out[1] = -left[1];
  out[2] = left[2];
  out[3] = -left[3];
  out[4] = left[4];
  out[5] = -left[5];
  out[6] = left[6];
}

export function buildAxle(spec: AxleSpec): Axle {
  return new Axle(spec);
}
