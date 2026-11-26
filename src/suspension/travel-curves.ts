// What the travel scene reads off a corner (suspensions plan, the travel scene; stage P4): the four curves over the
// wheel's travel (camber, toe, half-track change and the roll centre's height), where a strut's camber turns back, the
// halfshaft's joints over the travel and the lock, the corner with its inner tie-rod (toe-link) joint moved up or down,
// and the motions the links leave free when some are taken away. Pure: no DOM, no three.js, no text.

import { Axle, newCornerSample, type CornerSample } from './kinematics.ts';
import { POSE_SIZE } from './solve.ts';
import type { AxleSpec, Rod } from './spec.ts';

/** The curves of a corner over its travel, rack 0. Travel in m, angles in degrees, lengths in mm. */
export interface TravelCurves {
  /** Travel of each point, m, from full droop to a fully pressed bump stop. */
  travel: Float64Array;
  camberDeg: Float64Array;
  toeDeg: Float64Array;
  /** Lateral move of the contact patch from design, mm, positive outboard: half the change of the track. */
  halfTrackMm: Float64Array;
  /** Roll centre of symmetric bump above the road, mm. */
  rcHeightMm: Float64Array;
}

export type CurveId = 'camber' | 'toe' | 'halfTrack' | 'rcHeight';
export const CURVE_IDS: readonly CurveId[] = ['camber', 'toe', 'halfTrack', 'rcHeight'];

const DEG = 180 / Math.PI;
/** Points of the curves per metre of travel: one every 4 mm, twice the table's grid. */
const STEP_M = 0.004;

/** The curves of `axle` from its table. */
export function travelCurves(axle: Axle): TravelCurves {
  const { droopM, bumpM } = axle.spec.travel;
  const n = Math.round((droopM + bumpM) / STEP_M) + 1;
  const out: TravelCurves = {
    travel: new Float64Array(n),
    camberDeg: new Float64Array(n),
    toeDeg: new Float64Array(n),
    halfTrackMm: new Float64Array(n),
    rcHeightMm: new Float64Array(n),
  };
  const y0 = axle.value('contactY', 0);
  for (let i = 0; i < n; i++) {
    const q = i === n - 1 ? bumpM : -droopM + i * STEP_M;
    out.travel[i] = q;
    out.camberDeg[i] = axle.value('camber', q) * DEG;
    out.toeDeg[i] = axle.value('toe', q) * DEG;
    out.halfTrackMm[i] = (axle.value('contactY', q) - y0) * 1000;
    out.rcHeightMm[i] = axle.value('rcHeight', q) * 1000;
  }
  return out;
}

/** The array of one curve. */
export function curveOf(c: TravelCurves, id: CurveId): Float64Array {
  return id === 'camber' ? c.camberDeg : id === 'toe' ? c.toeDeg : id === 'halfTrack' ? c.halfTrackMm : c.rcHeightMm;
}

/** A curve's value at `travel`, linear between its points and held past its ends. */
export function curveAt(c: TravelCurves, id: CurveId, travel: number): number {
  const xs = c.travel;
  const ys = curveOf(c, id);
  const n = xs.length;
  if (travel <= xs[0]!) return ys[0]!;
  if (travel >= xs[n - 1]!) return ys[n - 1]!;
  let i = Math.min(n - 2, Math.floor((travel - xs[0]!) / STEP_M));
  while (i > 0 && xs[i]! > travel) i--;
  while (i < n - 2 && xs[i + 1]! < travel) i++;
  const x = (travel - xs[i]!) / (xs[i + 1]! - xs[i]!);
  return ys[i]! + (ys[i + 1]! - ys[i]!) * x;
}

/**
 * Where the camber stops gaining in bump and turns back, m of travel: the most negative camber on the bump side of
 * `from`, when it lies inside the travel (a MacPherson strut's arm and strut swing past square to each other). Null
 * when the camber keeps gaining to the bump stop, as a double wishbone's does.
 */
export function camberReversal(c: TravelCurves, from = 0): number | null {
  let best = -1;
  for (let i = 0; i < c.travel.length; i++) {
    if (c.travel[i]! < from) continue;
    if (best < 0 || c.camberDeg[i]! < c.camberDeg[best]!) best = i;
  }
  if (best < 0 || best === c.travel.length - 1) return null;
  return c.travel[best]!;
}

/** Camber gained in bump from `from` to the reversal (or to the bump stop), degrees: negative is gained. */
export function camberGainLeft(c: TravelCurves, from: number): number {
  const turn = camberReversal(c, from);
  return curveAt(c, 'camber', turn ?? c.travel[c.travel.length - 1]!) - curveAt(c, 'camber', from);
}

/** The rod that sets the toe: the steered tie rod of a front corner, or a rear corner's toe link. Null without one. */
export function toeRodOf(spec: AxleSpec): Rod | null {
  return spec.linkage.rods.find((r) => r.steer) ?? spec.linkage.rods.find((r) => r.id === 'toe-link') ?? null;
}

/**
 * The corner with the inner joint of its tie rod (toe link) moved up by `dzM` (the tie-rod height pad of the travel
 * scene, step 6). The rod takes the length that keeps the toe at design, as a shop sets it again after moving the
 * joint, so the toe curve tilts about the design point instead of moving as a whole: that tilt is bump steer. A corner
 * without such a rod comes back as it was.
 */
export function withInnerToeShift(spec: AxleSpec, dzM: number): AxleSpec {
  const rod = toeRodOf(spec);
  if (!rod || dzM === 0) return spec;
  const rods = spec.linkage.rods.map((r): Rod => {
    if (r !== rod) return r;
    const { lengthM: _drawn, ...rest } = r;
    return { ...rest, body: [r.body[0], r.body[1], r.body[2] + dzM] };
  });
  return { ...spec, linkage: { ...spec.linkage, rods } };
}

/** Toe change over the travel, degrees per 25 mm of bump at design: the slope the tie-rod pad tilts. */
export function bumpSteerPer25(axle: Axle): number {
  return axle.value('bumpSteer', 0) * DEG * 0.025;
}

/** The halfshaft's joints over the travel and the lock (suspensions plan, the travel scene, step 8). */
export interface JointRange {
  /** Plunge of the inner joint, m: least and most, positive pushed in. */
  plunge: [number, number];
  /** Largest angles of the inner and the outer joint, degrees. */
  innerDeg: number;
  outerDeg: number;
  /** Where the outer joint bends most: its travel (m) and rack (m). */
  outerAt: { travel: number; rack: number };
  /** The maker's limits of this shaft (HalfshaftSpec). */
  limits: { plunge: readonly [number, number]; innerDeg: number; outerDeg: number };
}

/**
 * The joints' extremes over the travel at rack 0 and at ±`rackM`, from exact solves: 2 mm steps of travel, each from
 * the last pose. Null on an undriven corner.
 */
export function jointRange(axle: Axle, rackM: number): JointRange | null {
  const shaft = axle.spec.halfshaft;
  if (!shaft) return null;
  const { droopM, bumpM } = axle.spec.travel;
  const s: CornerSample = newCornerSample();
  const pose = new Float64Array(POSE_SIZE);
  const out: JointRange = {
    plunge: [Infinity, -Infinity],
    innerDeg: 0,
    outerDeg: 0,
    outerAt: { travel: 0, rack: 0 },
    limits: { plunge: shaft.plungeM, innerDeg: shaft.innerMaxDeg, outerDeg: shaft.outerMaxDeg },
  };
  const racks = rackM > 0 ? [0, rackM, -rackM] : [0];
  for (const rack of racks) {
    let warm = false;
    for (let q = -droopM; q <= bumpM + 1e-9; q += 0.002) {
      if (!warm) axle.tablePose(q, pose);
      const res = axle.solver.solve(pose, q, rack, 30);
      if (!res.ok) {
        warm = false;
        continue;
      }
      warm = true;
      axle.measure(pose, q, rack, s);
      out.plunge[0] = Math.min(out.plunge[0], s.plunge);
      out.plunge[1] = Math.max(out.plunge[1], s.plunge);
      out.innerDeg = Math.max(out.innerDeg, s.cvInner * DEG);
      if (s.cvOuter * DEG > out.outerDeg) {
        out.outerDeg = s.cvOuter * DEG;
        out.outerAt = { travel: q, rack };
      }
    }
  }
  return out;
}

/** Whether a joint range leaves the maker's limits anywhere. */
export const jointsOver = (r: JointRange): boolean =>
  r.plunge[0] < r.limits.plunge[0] || r.plunge[1] > r.limits.plunge[1] || r.innerDeg > r.limits.innerDeg || r.outerDeg > r.limits.outerDeg;

/**
 * The rows of the constraint Jacobian a link fills, by the solver's names: a rod its id, a wishbone both legs, the
 * strut its own name. The order of `links` is the order a visitor takes them away.
 */
export function linkRows(spec: AxleSpec): Array<{ id: string; rows: string[] }> {
  const link = spec.linkage;
  return [
    ...link.rods.map((r) => ({ id: r.id, rows: [r.id] })),
    ...link.wishbones.map((w) => ({ id: w.id, rows: [`${w.id}.front`, `${w.id}.rear`] })),
    ...(link.strut ? [{ id: 'strut', rows: ['strut'] }] : []),
  ];
}

/**
 * The motions the knuckle is free to make at `travel` with the named links taken away (the five links, one motion; step
 * 7): an orthonormal basis of pose velocities (δt in m, δθ in rad). One with every link in place: the travel.
 */
export function freeMotions(axle: Axle, travel: number, removed: readonly string[]): Float64Array[] {
  const pose = new Float64Array(POSE_SIZE);
  axle.tablePose(travel, pose);
  const without = linkRows(axle.spec).filter((l) => removed.includes(l.id)).flatMap((l) => l.rows);
  return axle.solver.freeMotions(pose, 0, without);
}

/** The wheel angle the steering slider of the travel scene reaches either way, degrees: a typical lock, not a car's. */
export const SCENE_LOCK_DEG = 30;

/**
 * Rack travel, m, at which the left wheel at design height turns SCENE_LOCK_DEG either way (the smaller of the two), or
 * as far as the corner assembles, at most 80 mm. Zero on a corner that does not steer.
 */
export function sceneRackRange(axle: Axle): number {
  if (!axle.spec.linkage.rods.some((r) => r.steer)) return 0;
  const s: CornerSample = newCornerSample();
  const pose = new Float64Array(POSE_SIZE);
  const limit = (SCENE_LOCK_DEG * Math.PI) / 180;
  let range = 0.08;
  for (const sign of [1, -1]) {
    axle.tablePose(0, pose);
    for (let rack = 0.002; rack <= 0.08 + 1e-9; rack += 0.002) {
      const res = axle.solver.solve(pose, 0, sign * rack, 30);
      if (!res.ok) {
        range = Math.min(range, rack - 0.002);
        break;
      }
      axle.measure(pose, 0, sign * rack, s);
      if (Math.abs(s.toe) >= limit) {
        range = Math.min(range, rack);
        break;
      }
    }
  }
  return range;
}
