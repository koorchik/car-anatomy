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
//   Camber gain dγ/dq and bump steer dτ/dq are per metre of travel; negative gain is more negative camber in bump,
//   negative bump steer is toe-out. The roll centre of symmetric bump is y_C·tanβ above the road. Instant centres are
//   those of the knuckle's motion seen from the front (plane x = W_x) and from the side (plane y = W_y), body frame,
//   NaN when farther than a kilometre. Kingpin offset is the steering axis's lateral distance from the wheel centre at
//   wheel-centre height, positive when the axis is inboard.
//   Roll is positive when the left side goes up, pitch positive nose down.
//
// buildAxle solves the corner on a grid of travel (2 mm steps between the end stops) once; the simulation reads the
// table with linear interpolation, the 3D solves each frame exactly starting from the table (solvePose), so links on
// screen never stretch. buildAxleLite (axle-lite.ts) takes the static numbers from a few exact solves instead.
//
// Steering axis: the lower ball joint to the strut top (MacPherson), the two ball joints (double wishbone), the split
// axis in the carrier (dual-axis, RevoKnuckle), or two virtual pivots where pairs of links come closest (multilink).
// A split knuckle's pose carries its turn in the carrier as the eighth number; the strut and its spring sit on the
// carrier, the wheel on the knuckle.

import type { AxleSpec, Vec3 } from './spec.ts';
import { CornerSolver, POSE_SIZE, type SolveResult } from './solve.ts';
import { cross, dist, dot, nlerpInto, rotateQuatBy, sub, unit } from './vec.ts';

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
  /** dγ/dq and dτ/dq, rad/m. */
  camberGain: number;
  bumpSteer: number;
  /** Roll centre of symmetric bump above the road under the wheel, y_C·tanβ, m. */
  rcHeight: number;
  /** Instant centres of the knuckle in the front view (y, z) and the side view (x, z), m; NaN at infinity. */
  icFrontY: number;
  icFrontZ: number;
  icSideX: number;
  icSideZ: number;
  /** Lateral distance from the wheel centre to the steering axis at wheel-centre height, m, positive inboard. */
  kingpinOffset: number;
}

const FIELDS = [
  'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ', 'springLen', 'damperLen',
  'mrSpring', 'mrDamper', 'tanBeta', 'tanThetaCP', 'tanThetaWC', 'caster', 'kpi', 'scrub', 'trail', 'plunge', 'cvInner',
  'cvOuter', 'camberGain', 'bumpSteer', 'rcHeight', 'icFrontY', 'icFrontZ', 'icSideX', 'icSideZ', 'kingpinOffset',
] as const;
export type CornerField = (typeof FIELDS)[number];
type Field = CornerField;
/** Fields whose sign flips on the right corner (lateral positions and slopes). */
const MIRRORED: ReadonlySet<Field> = new Set<Field>(['contactY', 'wheelY', 'tanBeta', 'icFrontY']);

/** An instant centre farther than this from the wheel counts as at infinity, m. */
const IC_FAR_M = 1000;

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

/** Where the steering axis of a corner comes from. */
type AxisSource =
  /** Two knuckle points: two ball joints, or the axis of a split knuckle (shared by carrier and knuckle). */
  | { kind: 'points'; lower: Vec3; upper: Vec3 }
  /** The lower ball joint (a knuckle point) to the strut top mount (a body point). */
  | { kind: 'strut'; lower: Vec3; top: Vec3 }
  /** Two virtual pivots of a multilink, each where the lines of two rods come closest (rod indices). */
  | { kind: 'virtual'; lower: [number, number]; upper: [number, number] };

/** The wheel end of a spring or damper that is not on the strut: on the knuckle (or a split knuckle's carrier), on a
 *  wishbone (rigid with it, turning about its pivot axis), or on a rod's own line. */
type Mount =
  | { kind: 'knuckle'; body: Vec3; wheel: Vec3 }
  | { kind: 'wishbone'; body: Vec3; wheel: Vec3; front: Vec3; axis: Vec3; ball: Vec3 }
  | { kind: 'rod'; body: Vec3; rodBody: Vec3; rodKnuckle: Vec3; along: number };

export class Axle {
  readonly spec: AxleSpec;
  readonly solver: CornerSolver;
  /** Loaded radius at design: the contact point is this far below the wheel centre in the wheel plane. */
  readonly radius: number;
  private readonly axis: AxisSource | null;
  private readonly rods: AxleSpec['linkage']['rods'];
  private readonly strutLower: Vec3 | null;
  /** Strut top mount on the body, setup shift included. */
  private readonly strutTop: Vec3 | null;
  private readonly springMount: Mount | null;
  private readonly damperMount: Mount | null;
  private readonly seats: number;
  private readonly shaftLength: number;
  // Scratch
  private readonly v = new Float64Array(7);
  private readonly p = new Float64Array(3);
  private readonly s = new Float64Array(3);
  private readonly k = new Float64Array(3);
  private readonly u = new Float64Array(3);
  private readonly w = new Float64Array(3);
  private readonly pv = new Float64Array(3);

  private tables: AxleTable | null = null;

  /**
   * With `table: false` the grid is built on first use, so a few exact solves (buildAxleLite) do not pay for it; the
   * default builds it at once and throws there if the corner cannot travel its whole range.
   */
  constructor(spec: AxleSpec, options: { table?: boolean } = {}) {
    this.spec = spec;
    this.solver = new CornerSolver(spec);
    this.radius = spec.wheelCentre[2];
    const link = spec.linkage;
    const strut = link.strut;
    this.rods = link.rods;
    this.strutLower = strut ? strut.lower : null;
    const shift = strut?.topShift ?? [0, 0, 0];
    this.strutTop = strut ? [strut.top[0] + shift[0], strut.top[1] + shift[1], strut.top[2] + shift[2]] : null;
    // Steering axis: the split axis of a dual-axis or RevoKnuckle strut; the lower ball joint to the strut top
    // (MacPherson); the two ball joints (two wishbones); or the virtual pivots of a multilink.
    const rodIndex = (id: string): number => {
      const i = link.rods.findIndex((r) => r.id === id);
      if (i < 0) throw new Error(`The virtual steering axis names a rod the corner lacks: ${id}`);
      return i;
    };
    const ball0 = link.wishbones[0]?.ball;
    const ball1 = link.wishbones[1]?.ball;
    this.axis = link.knuckle
      ? { kind: 'points', lower: link.knuckle.axisLower, upper: link.knuckle.axisUpper }
      : strut && ball0 && this.strutTop
        ? { kind: 'strut', lower: ball0, top: this.strutTop }
        : ball0 && ball1
          ? { kind: 'points', lower: ball1[2] < ball0[2] ? ball1 : ball0, upper: ball1[2] < ball0[2] ? ball0 : ball1 }
          : link.virtualAxis
            ? {
                kind: 'virtual',
                lower: [rodIndex(link.virtualAxis.lower[0]), rodIndex(link.virtualAxis.lower[1])],
                upper: [rodIndex(link.virtualAxis.upper[0]), rodIndex(link.virtualAxis.upper[1])],
              }
            : null;
    const mount = (body: Vec3, wheel: Vec3 | 'strut', on: string | undefined): Mount | null => {
      if (wheel === 'strut') return null;
      if (!on) return { kind: 'knuckle', body, wheel };
      const arm = link.wishbones.find((w) => w.id === on);
      if (arm) return { kind: 'wishbone', body, wheel, front: arm.front, axis: unit(sub(arm.rear, arm.front)), ball: arm.ball };
      const rod = link.rods.find((r) => r.id === on);
      if (!rod) throw new Error(`A spring or damper sits on a link the corner lacks: ${on}`);
      const d = sub(rod.knuckle, rod.body);
      return { kind: 'rod', body, rodBody: rod.body, rodKnuckle: rod.knuckle, along: dot(sub(wheel, rod.body), d) / dot(d, d) };
    };
    this.springMount = mount(spec.spring.body, spec.spring.wheel, spec.spring.on);
    this.damperMount = mount(spec.damper.body, spec.damper.wheel, spec.damper.on);
    const seats = spec.spring.strutSeats;
    this.seats = seats ? seats.upperM + seats.lowerM : 0;
    const shaft = spec.halfshaft;
    this.shaftLength = shaft ? dist(shaft.diffOutput, shaft.outerJoint) : 0;
    if (options.table !== false) this.tables = this.build();
  }

  /** The grid over the whole travel (rack 0). */
  get table(): AxleTable {
    return (this.tables ??= this.build());
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
    // γ = −asin(s_z), τ = atan2(s_x, s_y)
    out.camberGain = -dsz / Math.sqrt(Math.max(1e-300, 1 - sz * sz));
    out.bumpSteer = (sy * dsx - sx * dsy) / (sx * sx + sy * sy);
    out.rcHeight = out.contactY * out.tanBeta;
    // Instant centres: where the velocity field of the knuckle vanishes in the plane x = W_x (front) and y = W_y (side).
    const fvsa = v[2] / v[3];
    const svsa = v[2] / v[4];
    const near = (d: number): boolean => Number.isFinite(d) && Math.abs(d) <= IC_FAR_M;
    out.icFrontY = near(fvsa) ? Wy - fvsa : NaN;
    out.icFrontZ = near(fvsa) ? Wz + v[1] / v[3] : NaN;
    out.icSideX = near(svsa) ? Wx + svsa : NaN;
    out.icSideZ = near(svsa) ? Wz - v[0] / v[4] : NaN;

    // Strut and spring.
    if (this.strutLower && this.strutTop) {
      const T = this.strutTop;
      const p = this.p;
      solver.carrierPoint(pose, this.strutLower, p);
      const lx = p[0] - T[0];
      const ly = p[1] - T[1];
      const lz = p[2] - T[2];
      const L = Math.hypot(lx, ly, lz);
      const pv = this.pv;
      solver.pointVelocity(pose, v, this.strutLower, false, pv);
      const mr = -(lx * pv[0] + ly * pv[1] + lz * pv[2]) / L;
      out.damperLen = L;
      out.mrDamper = mr;
      if (this.spec.spring.wheel === 'strut') {
        out.springLen = L - this.seats;
        out.mrSpring = mr;
      }
    }
    if (this.springMount) this.element(pose, this.springMount, out, 'spring');
    if (this.damperMount) this.element(pose, this.damperMount, out, 'damper');

    // Steering axis and its traces on the road.
    const k = this.k;
    const a = this.u;
    if (this.axis && this.steeringAxis(pose, rack, k, a)) {
      const ax = a[0];
      const ay = a[1];
      const az = a[2];
      out.kpi = Math.atan2(-ay, az);
      out.caster = Math.atan2(-ax, az);
      const lambda = (out.contactZ - k[2]) / az;
      out.scrub = out.contactY - (k[1] + ay * lambda);
      out.trail = k[0] + ax * lambda - out.contactX;
      out.kingpinOffset = Wy - (k[1] + (ay * (Wz - k[2])) / az);
    } else {
      out.kpi = NaN;
      out.caster = NaN;
      out.scrub = NaN;
      out.trail = NaN;
      out.kingpinOffset = NaN;
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

  /**
   * The steering axis for a solved pose: a point on it into `point` and its unit direction (upward) into `dir`. False
   * when the virtual pivots of a multilink are undefined (two links parallel).
   */
  steeringAxis(pose: Float64Array, rack: number, point: Float64Array, dir: Float64Array): boolean {
    const axis = this.axis;
    if (!axis) return false;
    const solver = this.solver;
    const up = this.w;
    if (axis.kind === 'points') {
      solver.point(pose, axis.lower, point);
      solver.point(pose, axis.upper, up);
    } else if (axis.kind === 'strut') {
      solver.point(pose, axis.lower, point);
      for (let i = 0; i < 3; i++) up[i] = axis.top[i];
    } else if (!this.virtualPivot(pose, rack, axis.lower, point) || !this.virtualPivot(pose, rack, axis.upper, up)) {
      return false;
    }
    let n = 0;
    for (let i = 0; i < 3; i++) {
      dir[i] = up[i] - point[i];
      n += dir[i] * dir[i];
    }
    n = (dir[2] < 0 ? -1 : 1) / Math.sqrt(n);
    for (let i = 0; i < 3; i++) dir[i] *= n;
    return true;
  }

  /** Midpoint of the shortest segment between the lines of two rods for a solved pose. */
  private virtualPivot(pose: Float64Array, rack: number, [i, j]: [number, number], out: Float64Array): boolean {
    const a = this.rods[i];
    const b = this.rods[j];
    const p = this.p;
    const q = this.pv;
    this.solver.point(pose, a.knuckle, p);
    this.solver.point(pose, b.knuckle, q);
    const ay = a.steer ? rack : 0;
    const by = b.steer ? rack : 0;
    // Lines P + s·d (from the rod's knuckle end to its body end) and Q + t·e.
    const d: Vec3 = [a.body[0] - p[0], a.body[1] + ay - p[1], a.body[2] - p[2]];
    const e: Vec3 = [b.body[0] - q[0], b.body[1] + by - q[1], b.body[2] - q[2]];
    const w: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const A = dot(d, d);
    const B = dot(d, e);
    const C = dot(e, e);
    const den = A * C - B * B;
    if (den < 1e-12 * A * C) return false;
    const s = (B * dot(e, w) - C * dot(d, w)) / den;
    const t = (A * dot(e, w) - B * dot(d, w)) / den;
    for (let k = 0; k < 3; k++) out[k] = (p[k] + s * d[k] + q[k] + t * e[k]) / 2;
    return true;
  }

  /** Length and motion ratio of a spring or damper whose wheel end is on the knuckle, a wishbone or a rod. */
  private element(pose: Float64Array, m: Mount, out: CornerSample, which: 'spring' | 'damper'): void {
    const solver = this.solver;
    const v = this.v;
    const p = this.p;
    const pv = this.pv;
    if (m.kind === 'knuckle') {
      solver.carrierPoint(pose, m.wheel, p);
      solver.pointVelocity(pose, v, m.wheel, false, pv);
    } else if (m.kind === 'rod') {
      // On the rod's line, a fixed share of the way from its body end to its knuckle end.
      const k = this.k;
      solver.point(pose, m.rodKnuckle, k);
      solver.pointVelocity(pose, v, m.rodKnuckle, true, pv);
      for (let i = 0; i < 3; i++) {
        p[i] = m.rodBody[i] + m.along * (k[i] - m.rodBody[i]);
        pv[i] *= m.along;
      }
    } else {
      // Rigid with the arm: the arm turns about its pivot axis by the angle its ball joint has turned.
      const B = this.k;
      const vB = this.w;
      solver.carrierPoint(pose, m.ball, B);
      solver.pointVelocity(pose, v, m.ball, false, vB);
      const [ax, ay, az] = m.axis;
      const perp = (x: number, y: number, z: number): Vec3 => {
        const t = x * ax + y * ay + z * az;
        return [x - t * ax, y - t * ay, z - t * az];
      };
      const r0 = perp(m.ball[0] - m.front[0], m.ball[1] - m.front[1], m.ball[2] - m.front[2]);
      const r1 = perp(B[0] - m.front[0], B[1] - m.front[1], B[2] - m.front[2]);
      const phi = Math.atan2(dot(m.axis, cross(r0, r1)), dot(r0, r1));
      const ur = cross(m.axis, r1);
      const rate = dot([vB[0], vB[1], vB[2]], ur) / dot(r1, r1);
      // P = F + Rot(axis, φ)·(P0 − F) by Rodrigues; v_P = φ̇·axis × (P − F).
      const q = sub(m.wheel, m.front);
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const axq = cross(m.axis, q);
      const aq = dot(m.axis, q);
      const rel: Vec3 = [
        q[0] * c + axq[0] * sn + ax * aq * (1 - c),
        q[1] * c + axq[1] * sn + ay * aq * (1 - c),
        q[2] * c + axq[2] * sn + az * aq * (1 - c),
      ];
      const vel = cross(m.axis, rel);
      for (let i = 0; i < 3; i++) {
        p[i] = m.front[i] + rel[i];
        pv[i] = rate * vel[i];
      }
    }
    const lx = p[0] - m.body[0];
    const ly = p[1] - m.body[1];
    const lz = p[2] - m.body[2];
    const L = Math.hypot(lx, ly, lz);
    const mr = -(lx * pv[0] + ly * pv[1] + lz * pv[2]) / L;
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
      if (this.solver.split) cur[7] += this.v[6] * dz;
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
    out[7] = t.pose[a + 7] + (t.pose[b + 7] - t.pose[a + 7]) * x;
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

/**
 * The right corner's pose from the left one: mirror across the xz plane. A split knuckle's turn changes sign, since the
 * mirror of a turn by ψ about an axis is a turn by −ψ about the mirrored axis.
 */
export function mirrorPose(left: Float64Array, out: Float64Array): void {
  out[0] = left[0];
  out[1] = -left[1];
  out[2] = left[2];
  out[3] = -left[3];
  out[4] = left[4];
  out[5] = -left[5];
  out[6] = left[6];
  out[7] = -left[7];
}

export function buildAxle(spec: AxleSpec): Axle {
  return new Axle(spec);
}
