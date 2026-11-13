// One axle as the chassis reads it: both wheels' numbers at a pair of travels (q_L, q_R), whatever holds the wheels.
// Conventions are at the top of kinematics.ts.
//
// An independent axle is two mirrored corners: each wheel's numbers depend on its own travel only, read from the
// corner's table (buildAxle), and its slopes per metre of the other wheel's travel (`…Cross`) are zero. A twist beam
// or a solid axle carries both wheels on one part, so each wheel's numbers depend on both travels: those are read from
// a grid over (q_L, q_R) with bilinear interpolation, solved once by beam-kinematics.ts or solid-kinematics.ts from
// node to node. Everything is in the car's frame: the right wheel's lateral positions and slopes are negative, as
// Axle.sample gives them.
//
// Two slopes are not in the tables of the axle modules and come from differences of the stored positions on the grid
// (second order, central inside, one-sided at the ends): tanβ_WC = dW_y/dq of the wheel centre, which carries the
// unsprung mass's own side force into the links, and the anti-roll bar's motion ratio, the rise of its drop link per
// metre of travel. The link rises with its point on the knuckle (or the arm, or the axle): the drop link is taken as
// upright and short against the bar's arm (SwayBarSpec).

import type {
  AnyAxleLinkage, AxleSpec, CornerLinkage, PivotLinkage, SolidAxleLinkage, SwayBarSpec, TwistBeamLinkage, Vec3,
} from './spec.ts';
import { Axle, type Side } from './kinematics.ts';
import { POSE_SIZE, type CornerSolver } from './solve.ts';
import { TwistBeamAxle, newBeamSample } from './beam-kinematics.ts';
import { SolidAxle, newSolidSample } from './solid-kinematics.ts';
import { TwistBeamSolver } from './solve-twist-beam.ts';
import { mirrorY, scale, sub, unit, dot, cross } from './vec.ts';

/** One wheel of an axle at a pair of travels. Angles in radians, lengths in metres, car frame. */
export interface WheelSample {
  /** Camber and toe relative to the body (camber positive top out, toe positive in), as the axle modules give them. */
  camber: number;
  toe: number;
  /** Contact point and wheel centre relative to the axle's origin (on the road under its middle at design). */
  contactX: number;
  contactY: number;
  contactZ: number;
  wheelX: number;
  wheelY: number;
  wheelZ: number;
  /** Lengths of this wheel's spring and damper; rise of its bar link from design (0 without a bar). */
  springLen: number;
  damperLen: number;
  barZ: number;
  /** Slopes per metre of this wheel's travel, the other held: −dL/dq of the spring and damper, the bar link's rise,
   *  dC_y/dq and dW_y/dq (car frame), dC_x/dq of the contact point (as the axle module defines it) and of the wheel
   *  centre, dγ/dq. */
  mrSpring: number;
  mrDamper: number;
  mrBar: number;
  tanBeta: number;
  tanBetaWC: number;
  tanThetaCP: number;
  tanThetaWC: number;
  camberGain: number;
  /** The same per metre of the other wheel's travel, this one held; zero on an independent axle. */
  mrSpringCross: number;
  mrDamperCross: number;
  mrBarCross: number;
  tanBetaCross: number;
  tanBetaWCCross: number;
  tanThetaCPCross: number;
  tanThetaWCCross: number;
  camberGainCross: number;
  /** Roll centre above the road under this wheel, m (symmetric travel on a corner, opposite travel on a beam). */
  rcHeight: number;
  /** Twist of a twist beam, rad (left wheel up positive, the same on both sides), and its slope per metre of this
   *  wheel's travel; zero on other axles. */
  beamTwist: number;
  twistRate: number;
}

const FIELDS = [
  'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ', 'springLen', 'damperLen', 'barZ',
  'mrSpring', 'mrDamper', 'mrBar', 'tanBeta', 'tanBetaWC', 'tanThetaCP', 'tanThetaWC', 'camberGain', 'mrSpringCross',
  'mrDamperCross', 'mrBarCross', 'tanBetaCross', 'tanBetaWCCross', 'tanThetaCPCross', 'tanThetaWCCross',
  'camberGainCross', 'rcHeight', 'beamTwist', 'twistRate',
] as const satisfies readonly (keyof WheelSample)[];
type Field = (typeof FIELDS)[number];
const NF = FIELDS.length;

export const newWheelSample = (): WheelSample => ({
  camber: 0, toe: 0, contactX: 0, contactY: 0, contactZ: 0, wheelX: 0, wheelY: 0, wheelZ: 0, springLen: 0, damperLen: 0,
  barZ: 0, mrSpring: 0, mrDamper: 0, mrBar: 0, tanBeta: 0, tanBetaWC: 0, tanThetaCP: 0, tanThetaWC: 0, camberGain: 0,
  mrSpringCross: 0, mrDamperCross: 0, mrBarCross: 0, tanBetaCross: 0, tanBetaWCCross: 0, tanThetaCPCross: 0,
  tanThetaWCCross: 0, camberGainCross: 0, rcHeight: 0, beamTwist: 0, twistRate: 0,
});

/**
 * One interpolated row (FIELDS order) into a sample. Named stores, not `out[f]` with a variable key: V8 boxes every
 * number a keyed store writes into an object, which allocated 1.4–1.7 kB per chassis step and took most of its time.
 */
function unpack(b: Float64Array, o: WheelSample): void {
  o.camber = b[0];
  o.toe = b[1];
  o.contactX = b[2];
  o.contactY = b[3];
  o.contactZ = b[4];
  o.wheelX = b[5];
  o.wheelY = b[6];
  o.wheelZ = b[7];
  o.springLen = b[8];
  o.damperLen = b[9];
  o.barZ = b[10];
  o.mrSpring = b[11];
  o.mrDamper = b[12];
  o.mrBar = b[13];
  o.tanBeta = b[14];
  o.tanBetaWC = b[15];
  o.tanThetaCP = b[16];
  o.tanThetaWC = b[17];
  o.camberGain = b[18];
  o.mrSpringCross = b[19];
  o.mrDamperCross = b[20];
  o.mrBarCross = b[21];
  o.tanBetaCross = b[22];
  o.tanBetaWCCross = b[23];
  o.tanThetaCPCross = b[24];
  o.tanThetaWCCross = b[25];
  o.camberGainCross = b[26];
  o.rcHeight = b[27];
  o.beamTwist = b[28];
  o.twistRate = b[29];
}

/** The right wheel of two mirrored corners: the left corner's lateral numbers with the other sign. */
function mirrorLateral(o: WheelSample): void {
  o.contactY = -o.contactY;
  o.wheelY = -o.wheelY;
  o.tanBeta = -o.tanBeta;
  o.tanBetaWC = -o.tanBetaWC;
  o.tanBetaCross = -o.tanBetaCross;
  o.tanBetaWCCross = -o.tanBetaWCCross;
}

/** Per-field tables to rows of NF numbers per node (FIELDS order), so a sample reads one contiguous run per node. */
function pack(t: Record<Field, Float64Array>, nodes: number): Float64Array {
  const rows = new Float64Array(nodes * NF);
  for (let f = 0; f < NF; f++) {
    const a = t[FIELDS[f]];
    for (let k = 0; k < nodes; k++) rows[k * NF + f] = a[k];
  }
  return rows;
}

/** Grid step of a beam axle's (q_L, q_R) table, m. Its slopes vary slowly, and a node costs a least-squares solve on a
 *  solid axle. */
export const BEAM_GRID_STEP_M = 0.005;

/** d/dx of samples `f` on a uniform grid of step h, at index i of n (stride `s` between neighbours). */
function slopeAt(f: Float64Array, i: number, n: number, h: number, base: number, s: number): number {
  if (n < 2) return 0;
  if (n === 2) return (f[base + s] - f[base]) / h;
  if (i === 0) return (-3 * f[base] + 4 * f[base + s] - f[base + 2 * s]) / (2 * h);
  if (i === n - 1) return (3 * f[base + i * s] - 4 * f[base + (i - 1) * s] + f[base + (i - 2) * s]) / (2 * h);
  return (f[base + (i + 1) * s] - f[base + (i - 1) * s]) / (2 * h);
}

/** A point rigid with the knuckle, a wishbone or a rod of an independent corner: where it is for a solved pose. */
type CornerPoint = (pose: Float64Array, out: Float64Array) => void;

function cornerPoint(spec: AxleSpec<CornerLinkage | PivotLinkage>, solver: CornerSolver, k: Vec3, on: string | undefined): CornerPoint {
  if (!on) return (pose, out) => solver.carrierPoint(pose, k, out);
  const link = spec.linkage;
  const wishbones = link.kind === 'links' ? link.wishbones : [];
  const rods = link.kind === 'links' ? link.rods : [];
  const arm = wishbones.find((w) => w.id === on);
  if (arm) {
    // Rigid with the arm: it turns about its pivot axis by the angle its ball joint has turned (as Axle.element does).
    const axis = unit(sub(arm.rear, arm.front));
    const r = sub(arm.ball, arm.front);
    const r0 = sub(r, scale(axis, dot(r, axis)));
    const q = sub(k, arm.front);
    const axq = cross(axis, q);
    const aq = dot(axis, q);
    const B = new Float64Array(3);
    return (pose, out) => {
      solver.carrierPoint(pose, arm.ball, B);
      const r1 = sub([B[0], B[1], B[2]], arm.front);
      const r1p = sub(r1, scale(axis, dot(r1, axis)));
      const phi = Math.atan2(dot(axis, cross(r0, r1p)), dot(r0, r1p));
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      for (let i = 0; i < 3; i++) out[i] = arm.front[i] + q[i] * c + axq[i] * sn + axis[i] * aq * (1 - c);
    };
  }
  const rod = rods.find((r) => r.id === on);
  if (!rod) throw new Error(`The anti-roll bar sits on a link the corner lacks: ${on}`);
  const d = sub(rod.knuckle, rod.body);
  const along = dot(sub(k, rod.body), d) / dot(d, d);
  const K = new Float64Array(3);
  return (pose, out) => {
    solver.point(pose, rod.knuckle, K);
    for (let i = 0; i < 3; i++) out[i] = rod.body[i] + along * (K[i] - rod.body[i]);
  };
}

/** Both wheels of one axle of a chassis at a pair of travels. */
export class ChassisAxle {
  readonly spec: AxleSpec<AnyAxleLinkage>;
  readonly bar: SwayBarSpec | null;
  /** 'corner': two mirrored corners; 'beam': a twist beam or a solid axle on a (q_L, q_R) grid. */
  readonly kind: 'corner' | 'beam';
  /** Travel of node 0 and the step of each grid axis, and the node counts (one axis for a corner). */
  readonly travel0: number;
  readonly step: number;
  readonly n: number;
  /** The corner of an independent axle, for its exact poses (null on a beam). */
  readonly corner: Axle<CornerLinkage | PivotLinkage> | null;
  /** Tables, a row of the FIELDS per node: the left corner's on a corner axle; on a beam, the left and the right
   *  wheel's, node (i, j) at i + n·j for q_L = travel0 + i·step, q_R = travel0 + j·step. */
  private readonly left: Float64Array;
  private readonly right: Float64Array | null;
  /** Interpolated rows of the two wheels, reused by every sample. */
  private readonly rowL = new Float64Array(NF);
  private readonly rowR = new Float64Array(NF);

  constructor(spec: AxleSpec<AnyAxleLinkage>, bar: SwayBarSpec | null) {
    this.spec = spec;
    this.bar = bar;
    const link = spec.linkage;
    if (link.kind === 'twist-beam' || link.kind === 'solid') {
      this.kind = 'beam';
      this.corner = null;
      const { droopM, bumpM } = spec.travel;
      const h = BEAM_GRID_STEP_M;
      const down = Math.ceil(droopM / h - 1e-9);
      const up = Math.ceil(bumpM / h - 1e-9);
      this.travel0 = -down * h;
      this.step = h;
      this.n = down + up + 1;
      const tables = buildBeam(spec as AxleSpec<TwistBeamLinkage | SolidAxleLinkage>, bar, this.travel0, h, this.n, down);
      this.left = pack(tables.left, this.n * this.n);
      this.right = pack(tables.right, this.n * this.n);
    } else {
      this.kind = 'corner';
      const corner = new Axle(spec as AxleSpec<CornerLinkage | PivotLinkage>);
      this.corner = corner;
      const t = corner.table;
      this.travel0 = t.travel0;
      this.step = t.step;
      this.n = t.n;
      this.left = pack(buildCorner(corner, bar), this.n);
      this.right = null;
    }
  }

  /** Both wheels at travels q_L, q_R into `l` and `r`. Linear (bilinear on a beam) between nodes and beyond the ends.
   *  Allocates nothing. */
  sample(qL: number, qR: number, l: WheelSample, r: WheelSample): void {
    const n = this.n;
    let x = (qL - this.travel0) / this.step;
    let i = Math.floor(x);
    if (i < 0) i = 0;
    else if (i > n - 2) i = n - 2;
    x -= i;
    let y = (qR - this.travel0) / this.step;
    let j = Math.floor(y);
    if (j < 0) j = 0;
    else if (j > n - 2) j = n - 2;
    y -= j;
    const a = this.left;
    const bl = this.rowL;
    const br = this.rowR;
    if (!this.right) {
      // Two mirrored corners: the left at q_L, the right at q_R mirrored.
      const i0 = i * NF;
      const j0 = j * NF;
      for (let f = 0; f < NF; f++) {
        bl[f] = a[i0 + f] + (a[i0 + NF + f] - a[i0 + f]) * x;
        br[f] = a[j0 + f] + (a[j0 + NF + f] - a[j0 + f]) * y;
      }
      unpack(bl, l);
      unpack(br, r);
      mirrorLateral(r);
      return;
    }
    const b = this.right;
    const k00 = (i + n * j) * NF;
    const k10 = k00 + NF;
    const k01 = k00 + n * NF;
    const k11 = k01 + NF;
    const w00 = (1 - x) * (1 - y);
    const w10 = x * (1 - y);
    const w01 = (1 - x) * y;
    const w11 = x * y;
    for (let f = 0; f < NF; f++) {
      bl[f] = a[k00 + f] * w00 + a[k10 + f] * w10 + a[k01 + f] * w01 + a[k11 + f] * w11;
      br[f] = b[k00 + f] * w00 + b[k10 + f] * w10 + b[k01 + f] * w01 + b[k11 + f] * w11;
    }
    unpack(bl, l);
    unpack(br, r);
  }
}

/** The left corner's table with the chassis's extra slopes, on the corner's own grid. */
function buildCorner(axle: Axle<CornerLinkage | PivotLinkage>, bar: SwayBarSpec | null): Record<Field, Float64Array> {
  const t = axle.table;
  const n = t.n;
  const out = {} as Record<Field, Float64Array>;
  for (const f of FIELDS) out[f] = new Float64Array(n);
  const copied = [
    'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ', 'springLen', 'damperLen',
    'mrSpring', 'mrDamper', 'tanBeta', 'tanThetaCP', 'tanThetaWC', 'camberGain', 'rcHeight',
  ] as const;
  for (const f of copied) out[f].set(t.fields[f]);
  for (let i = 0; i < n; i++) out.tanBetaWC[i] = slopeAt(out.wheelY, i, n, t.step, 0, 1);
  if (bar) {
    const point = cornerPoint(axle.spec, axle.solver, bar.link, bar.on);
    const p = new Float64Array(3);
    const design = new Float64Array(POSE_SIZE);
    axle.solvePose(0, 0, null, design);
    point(design, p);
    const z0 = p[2];
    for (let i = 0; i < n; i++) {
      point(t.pose.subarray(POSE_SIZE * i, POSE_SIZE * (i + 1)), p);
      out.barZ[i] = p[2] - z0;
    }
    for (let i = 0; i < n; i++) out.mrBar[i] = slopeAt(out.barZ, i, n, t.step, 0, 1);
  }
  return out;
}

/** The (q_L, q_R) grid of a twist beam or a solid axle: both wheels per node. Node (i, j) is solved from a solved
 *  neighbour: first along q_L with q_R = 0, then out along q_R from each of those. */
function buildBeam(
  spec: AxleSpec<TwistBeamLinkage | SolidAxleLinkage>,
  bar: SwayBarSpec | null,
  travel0: number,
  h: number,
  n: number,
  zero: number,
): { left: Record<Field, Float64Array>; right: Record<Field, Float64Array> } {
  const nodes = n * n;
  const left = {} as Record<Field, Float64Array>;
  const right = {} as Record<Field, Float64Array>;
  for (const f of FIELDS) {
    left[f] = new Float64Array(nodes);
    right[f] = new Float64Array(nodes);
  }
  const twist = spec.linkage.kind === 'twist-beam';
  const beam = twist ? new TwistBeamAxle(spec as AxleSpec<TwistBeamLinkage>) : null;
  const solid = twist ? null : new SolidAxle(spec as AxleSpec<SolidAxleLinkage>);
  const rest = (): Float64Array => (beam ? TwistBeamSolver.rest() : solid!.rest());
  const solve = (state: Float64Array, zL: number, zR: number): void => {
    if (beam) beam.solve(state, zL, zR);
    else solid!.solve(state, zL, zR);
  };
  const beamSample = newBeamSample();
  const solidSample = newSolidSample();
  const pose = new Float64Array(POSE_SIZE);
  const p = new Float64Array(3);
  const links: readonly [Vec3, Vec3] | null = bar ? [bar.link, mirrorY(bar.link)] : null;
  const linkZ = (state: Float64Array, side: Side): number => {
    if (!links) return 0;
    if (beam) {
      beam.solver.pose(state, side, pose);
      beam.solver.point(pose, links[0], p);
    } else {
      solid!.solver.point(state, links[side === 'left' ? 0 : 1], p);
    }
    return p[2];
  };
  const record = (state: Float64Array, k: number): void => {
    for (const side of ['left', 'right'] as const) {
      const into = side === 'left' ? left : right;
      if (beam) {
        beam.measure(state, side, beamSample);
        for (const f of BEAM_FIELDS) into[f][k] = beamSample[f];
        into.beamTwist[k] = beamSample.beamTwist;
        into.twistRate[k] = beamSample.twistRate;
      } else {
        solid!.measure(state, side, solidSample);
        for (const f of BEAM_FIELDS) into[f][k] = solidSample[f];
      }
      into.barZ[k] = linkZ(state, side);
    }
  };
  const row = new Float64Array(rest().length * n);
  const size = rest().length;
  // Along q_L at q_R = 0.
  const start = rest();
  solve(start, 0, 0);
  row.set(start, size * zero);
  record(start, zero + n * zero);
  const s = new Float64Array(size);
  for (const dir of [1, -1]) {
    s.set(start);
    for (let i = zero + dir; i >= 0 && i < n; i += dir) {
      solve(s, travel0 + i * h, 0);
      row.set(s, size * i);
      record(s, i + n * zero);
    }
  }
  // Out along q_R from each.
  for (let i = 0; i < n; i++) {
    for (const dir of [1, -1]) {
      s.set(row.subarray(size * i, size * (i + 1)));
      for (let j = zero + dir; j >= 0 && j < n; j += dir) {
        solve(s, travel0 + i * h, travel0 + j * h);
        record(s, i + n * j);
      }
    }
  }
  // Bar link heights from design, and the slopes by differences along each axis.
  for (const into of [left, right]) {
    const z0 = into.barZ[zero + n * zero];
    for (let k = 0; k < nodes; k++) into.barZ[k] -= z0;
  }
  for (const [into, own] of [[left, 'L'], [right, 'R']] as const) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = i + n * j;
        // Along q_L (stride 1) and along q_R (stride n).
        const dL = (f: Float64Array): number => slopeAt(f, i, n, h, n * j, 1);
        const dR = (f: Float64Array): number => slopeAt(f, j, n, h, i, n);
        const ownD = own === 'L' ? dL : dR;
        const otherD = own === 'L' ? dR : dL;
        into.tanBetaWC[k] = ownD(into.wheelY);
        into.tanBetaWCCross[k] = otherD(into.wheelY);
        if (bar) {
          into.mrBar[k] = ownD(into.barZ);
          into.mrBarCross[k] = otherD(into.barZ);
        }
      }
    }
  }
  return { left, right };
}

/** Fields a beam or solid sample shares with WheelSample (the axle modules' names). */
const BEAM_FIELDS = [
  'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ', 'springLen', 'damperLen',
  'mrSpring', 'mrDamper', 'tanBeta', 'tanThetaCP', 'tanThetaWC', 'camberGain', 'mrSpringCross', 'mrDamperCross',
  'tanBetaCross', 'tanThetaCPCross', 'tanThetaWCCross', 'camberGainCross', 'rcHeight',
] as const;
