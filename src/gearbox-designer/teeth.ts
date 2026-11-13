// The designer's teeth (gearbox plan, what the designer derives): every pair the ladder asks for, picked by gear-pick.ts at the
// shared centre distance with the pair's own module, the profile shift for small gears, the reverse with its idler,
// and a transaxle's final drive. A pair set by hand is taken as it is.
//
// - A helical pair's helix is what closes the shared centre distance; the picker looks within HELIX_SPREAD of the
//   nominal angle and prefers coprime teeth.
// - A spur pair has no helix to give: its tooth sum must span the centre distance as it is, and a profile shift sum of
//   up to ±1 lets it reach the sums next to 2a/m_n. So spur ratios sit on a coarser grid: the real compromise of
//   racing boxes.
// - Shift x = max(0, (17 − z)/17) on the smaller gear and its negative on the mate, so the centre distance stays.
// - Shared gears are one unknown: the reverse idler meshes both reverse gears with one module and one helix, and its
//   own axis follows from its two centre distances (layouts/*.ts place it).
//
// Picks are cached: the sensitivity checks run the model twice per control, and most controls leave the teeth alone.

import { centreDistance, shiftSumForCentre } from '../drivetrain/gear-geometry.ts';
import { gcd, pairCandidates, type PairPick } from '../drivetrain/gear-pick.ts';
import { HELIX_SPREAD, MAX_HELIX, MAX_TEETH, MIN_TEETH, type FinalSetting, type PairSetting, type ReverseSetting } from './design.ts';

const DEG = Math.PI / 180;

/** A pair as the layout gets it, with what the picker made of it. */
export interface PickedPair extends PairSetting {
  /** z2/z1. */
  ratio: number;
  /** What the pair was asked for; null for a pair set by hand. */
  target: number | null;
  /** Distance between the reachable ratios around the target (gear-pick.ts); Infinity outside the grid or by hand. */
  step: number;
  coprime: boolean;
  hand: boolean;
}

/** Undercut-free shift of a small gear by the simple rule of the plan, rounded to a thousandth. */
export const smallGearShift = (teeth: number): number => Math.round(Math.max(0, (17 - teeth) / 17) * 1000) / 1000;

/**
 * A pair's two shifts. Without a sum: the rule on the smaller gear and its negative on the mate. A spur pair's sum
 * goes half to each gear when it is positive; a negative one all to the larger gear, so the small one keeps clear of
 * undercut.
 */
export function pairShift(teeth: [number, number], sum = 0): [number, number] {
  const small = teeth[0] <= teeth[1] ? 0 : 1;
  const x = smallGearShift(teeth[small]);
  const xs = sum >= 0 ? x + sum / 2 : x;
  const xb = sum >= 0 ? -x + sum / 2 : sum - x;
  // Plain 0, never −0, which toEqual and snapshots tell apart.
  const zero = (v: number): number => (v === 0 ? 0 : v);
  return small === 0 ? [zero(xs), zero(xb)] : [zero(xb), zero(xs)];
}

/** The helix range the picker searches around a nominal angle, degrees; [0, 0] for spur. */
export const helixRange = (nominal: number): [number, number] =>
  nominal === 0 ? [0, 0] : [Math.max(0, nominal - HELIX_SPREAD), Math.min(MAX_HELIX, nominal + HELIX_SPREAD)];

export interface CylRequest {
  /** Driven over driving teeth, > 0. */
  ratio: number;
  centreMm: number;
  module: number;
  /** Nominal helix, degrees; 0 is spur. */
  helix: number;
  pressureAngle: number;
  faceWidth: number;
}

/** Nearest first; the grid step around the target, as gear-pick.ts measures it. */
function nearest(found: Array<PairPick & { shiftSum: number }>): { pick: PairPick & { shiftSum: number }; step: number } | null {
  if (!found.length) return null;
  const EXACT = 1e-12;
  const exact = found.some((p) => Math.abs(p.error) <= EXACT);
  const below = Math.max(...found.filter((p) => p.error < -EXACT).map((p) => p.ratio));
  const above = Math.min(...found.filter((p) => p.error > EXACT).map((p) => p.ratio));
  const step = Number.isFinite(below) && Number.isFinite(above) ? (above - below) / (exact ? 2 : 1) : Infinity;
  const pick = [...found].sort((p, q) => Math.abs(p.error) - Math.abs(q.error) || Math.abs(p.shiftSum) - Math.abs(q.shiftSum) || p.teeth[0] - q.teeth[0])[0]!;
  return { pick, step };
}

/** Candidates of one request: coprime when there are any, else all. */
function candidates(req: CylRequest, shiftSum: number): Array<PairPick & { shiftSum: number }> {
  const base = {
    ratio: req.ratio, centreMm: req.centreMm, module: req.module, helixRange: helixRange(req.helix), pressureAngle: req.pressureAngle,
    shiftSum, minTeeth: MIN_TEETH, maxTeeth: MAX_TEETH,
  };
  let found = pairCandidates(base);
  if (!found.length) found = pairCandidates({ ...base, coprime: false });
  return found.map((p) => ({ ...p, shiftSum }));
}

/** Spur tooth sums the centre distance allows with a shift sum within ±1, and that sum. */
export function spurSums(centreMm: number, module: number, pressureAngle: number): Array<{ sum: number; shiftSum: number }> {
  const z0 = (2 * centreMm) / module;
  const out: Array<{ sum: number; shiftSum: number }> = [];
  for (let sum = Math.floor(z0) - 2; sum <= Math.ceil(z0) + 2; sum++) {
    if (sum < 2 * MIN_TEETH) continue;
    const exact = Math.abs((module * sum) / 2 - centreMm) < 1e-9;
    const shiftSum = exact ? 0 : shiftSumForCentre(centreMm, module, 1, sum - 1, 0, pressureAngle);
    if (Number.isFinite(shiftSum) && Math.abs(shiftSum) <= 1) out.push({ sum, shiftSum });
  }
  return out;
}

const pairCache = new Map<string, PickedPair | null>();
const remember = <T>(cache: Map<string, T>, key: string, make: () => T): T => {
  const hit = cache.get(key);
  if (hit !== undefined || cache.has(key)) return hit as T;
  const v = make();
  if (cache.size > 4000) cache.clear();
  cache.set(key, v);
  return v;
};

/** The pair of a speed or of the constant mesh at the shared centre distance; null when none fits. */
export function pickCylPair(req: CylRequest): PickedPair | null {
  const key = `${req.ratio}|${req.centreMm}|${req.module}|${req.helix}|${req.pressureAngle}|${req.faceWidth}`;
  return remember(pairCache, key, () => {
    const spur = (): Array<PairPick & { shiftSum: number }> =>
      spurSums(req.centreMm, req.module, req.pressureAngle).flatMap(({ sum, shiftSum }) =>
        candidates({ ...req, helix: 0 }, shiftSum).filter((p) => p.teeth[0] + p.teeth[1] === sum),
      );
    // A nominal helix of a few degrees may leave no whole tooth sum inside its narrow range: then the pair goes spur.
    let found = req.helix === 0 ? spur() : candidates(req, 0);
    if (!found.length && req.helix < HELIX_SPREAD) found = spur();
    const best = nearest(found);
    if (!best) return null;
    const teeth: [number, number] = [best.pick.teeth[0], best.pick.teeth[1]];
    return {
      teeth, module: req.module, faceWidth: req.faceWidth, shift: pairShift(teeth, best.pick.shiftSum),
      ratio: teeth[1] / teeth[0], target: req.ratio, step: best.step, coprime: gcd(teeth[0], teeth[1]) === 1, hand: false,
    };
  });
}

/** A pair set by hand, as the layouts get it. */
export const handPair = (p: PairSetting): PickedPair => ({
  teeth: [p.teeth[0], p.teeth[1]], module: p.module, faceWidth: p.faceWidth, shift: [p.shift[0], p.shift[1]],
  ratio: p.teeth[1] / p.teeth[0], target: null, step: Infinity, coprime: gcd(p.teeth[0], p.teeth[1]) === 1, hand: true,
});

// ---- Reverse ----

/** The layouts' shafts are steel of 0.4 times the centre distance across (layouts/layshaft.ts): their radius. */
export const shaftRadius = (centreMm: number): number => 0.2 * centreMm;
/** Tip radius of a spur or helical gear, mm. */
const tipRadius = (teeth: number, module: number, helix: number, shift: number): number => (module * teeth) / (2 * Math.cos(helix * DEG)) + module * (1 + shift);
/** Clearance between tips that never mesh, in modules. */
const TIP_CLEARANCE = 0.5;
/** The idler sits off the line between the shafts by at least this share of the centre distance [layout rule]. */
const IDLER_OFFSET = 0.4;
/** A transaxle's reverse gears carry no profile shift in the layout, so they keep clear of undercut. */
const TRANSAXLE_REVERSE_MIN = 15;

export interface PickedReverse extends ReverseSetting {
  /** Shift of each gear (layshaft only; zeros otherwise). */
  shift: number[];
  /** Magnitude of the reverse's own ratio: driven over driving, through the idler. */
  ratio: number;
  target: number | null;
  hand: boolean;
}

/** Offset of the idler's axis from the line between the two shafts, mm, or NaN when it cannot reach both gears. */
export function idlerOffset(centreMm: number, d1: number, d2: number): number {
  const t = (d1 * d1 - d2 * d2 + centreMm * centreMm) / (2 * centreMm);
  const h2 = d1 * d1 - t * t;
  return h2 > 0 ? Math.sqrt(h2) : NaN;
}

const reverseRatio = (teeth: number[]): number =>
  teeth.length === 4 ? (teeth[1]! / teeth[0]!) * (teeth[3]! / teeth[2]!) : teeth[2]! / teeth[0]!;

export const handReverse = (r: ReverseSetting, shift?: number[]): PickedReverse => ({
  teeth: [...r.teeth], module: r.module, helix: r.helix, faceWidth: r.faceWidth, shift: shift ?? r.teeth.map(() => 0),
  ratio: reverseRatio(r.teeth), target: null, hand: true,
});

/** The smallest idler from MIN_TEETH up whose axis sits at least IDLER_OFFSET·a off the shafts' line. */
function pickIdler(a: number, m: number, alpha: number, z1: number, z2: number, x1: number, x2: number): number | null {
  for (let zi = MIN_TEETH; zi <= MAX_TEETH; zi++) {
    const d1 = centreDistance(m, z1, zi, 0, alpha, x1);
    const d2 = centreDistance(m, zi, z2, 0, alpha, x2);
    const h = idlerOffset(a, d1, d2);
    if (h >= IDLER_OFFSET * a) return zi;
  }
  return null;
}

const reverseCache = new Map<string, PickedReverse | null>();

/**
 * A reverse through one idler between two gears on the two shafts that never mesh with each other, spur: the driving
 * gear on the countershaft (layshaft) or the input shaft (transaxle), the driven one on the output shaft. Their tips
 * must clear each other at the centre distance, which caps the ratio a single idler can reach; a transaxle then turns
 * to a compound idler (two gears on one idler shaft), as the Civic and the 911 do.
 * @param ratio the reverse's own ratio (a layshaft's overall reverse over its constant-mesh ratio), magnitude.
 */
export function pickReverse(kind: 'layshaft' | 'transaxle', ratio: number, centreMm: number, module: number, faceWidth: number, pressureAngle: number): PickedReverse | null {
  const key = `${kind}|${ratio}|${centreMm}|${module}|${faceWidth}|${pressureAngle}`;
  return remember(reverseCache, key, () => {
    const a = centreMm;
    const m = module;
    const min = kind === 'layshaft' ? MIN_TEETH : TRANSAXLE_REVERSE_MIN;
    let best: { teeth: [number, number]; err: number; shift: [number, number] } | null = null;
    for (let z1 = min; z1 <= MAX_TEETH; z1++) {
      const z2 = Math.round(ratio * z1);
      for (const zz of [z2 - 1, z2, z2 + 1]) {
        if (zz < min || zz > MAX_TEETH) continue;
        const shift: [number, number] = kind === 'layshaft' ? [smallGearShift(z1), smallGearShift(zz)] : [0, 0];
        if (tipRadius(z1, m, 0, shift[0]) + tipRadius(zz, m, 0, shift[1]) > a - TIP_CLEARANCE * m) continue;
        const err = Math.abs(zz / z1 - ratio);
        // The nearest ratio; among equals the larger gears, which carry the load on more teeth.
        if (!best || err < best.err - 1e-12 || (Math.abs(err - best.err) <= 1e-12 && z1 + zz > best.teeth[0] + best.teeth[1])) best = { teeth: [z1, zz], err, shift };
      }
    }
    const single = (b: NonNullable<typeof best>): PickedReverse | null => {
      const zi = pickIdler(a, m, pressureAngle, b.teeth[0], b.teeth[1], b.shift[0], b.shift[1]);
      if (zi === null) return null;
      return {
        teeth: [b.teeth[0], zi, b.teeth[1]], module: m, helix: 0, faceWidth, shift: [b.shift[0], 0, b.shift[1]],
        ratio: b.teeth[1] / b.teeth[0], target: ratio, hand: false,
      };
    };
    if (best && (kind === 'layshaft' || best.err / ratio <= 0.02)) {
      const s = single(best);
      if (s) return s;
    }
    if (kind === 'layshaft') return null;
    return compoundReverse(ratio, a, m, faceWidth, pressureAngle) ?? (best ? single(best) : null);
  });
}

/**
 * A compound idler: input gear zIn drives idler gear zI1; idler gear zI2 on the same shaft drives the output gear
 * zOut; i = (zI1/zIn)·(zOut/zI2). Each idler gear's tips must clear the other shaft that passes through its plane.
 */
function compoundReverse(ratio: number, a: number, m: number, faceWidth: number, pressureAngle: number): PickedReverse | null {
  const min = TRANSAXLE_REVERSE_MIN;
  const shaft = shaftRadius(a);
  let best: { teeth: number[]; err: number; size: number } | null = null;
  for (let zIn = min; zIn <= min + 10; zIn++) {
    for (let zI2 = min; zI2 <= min + 12; zI2++) {
      for (let zI1 = min; zI1 <= 60; zI1++) {
        const zOut = Math.round((ratio * zIn * zI2) / zI1);
        if (zOut < min || zOut > MAX_TEETH) continue;
        const d1 = centreDistance(m, zIn, zI1, 0, pressureAngle);
        const d2 = centreDistance(m, zI2, zOut, 0, pressureAngle);
        const h = idlerOffset(a, d1, d2);
        if (!(h >= 0.25 * a)) continue;
        if (d2 < tipRadius(zI1, m, 0, 0) + shaft + 2 || d1 < tipRadius(zI2, m, 0, 0) + shaft + 2) continue;
        const err = Math.abs((zI1 / zIn) * (zOut / zI2) - ratio);
        const size = zI1 + zOut;
        if (!best || err < best.err - 1e-12 || (Math.abs(err - best.err) <= 1e-12 && size < best.size)) best = { teeth: [zIn, zI1, zI2, zOut], err, size };
      }
    }
  }
  if (!best) return null;
  return { teeth: best.teeth, module: m, helix: 0, faceWidth, shift: [0, 0, 0, 0], ratio: reverseRatio(best.teeth), target: ratio, hand: false };
}

// ---- A transaxle's final drive ----

export interface PickedFinal extends FinalSetting {
  kind: 'helical' | 'bevel';
  ratio: number;
  target: number | null;
  hand: boolean;
}

/** Pinion teeth the picker tries: a crown wheel's pinion has few (the 911's 9), a helical one more (the Civic's 18). */
const PINION_RANGE = { helical: [14, 22], bevel: [9, 13] } as const;
const PINION_PREFERRED = { helical: 18, bevel: 9 } as const;

/**
 * The final drive's teeth. Its centre distance is its own (a helical pair spans what its teeth and helix give; a
 * crown wheel's axis crosses the shafts), so the nearest ratio wins outright: coprime first, then the pinion nearest
 * the usual size.
 */
export function pickFinal(kind: 'helical' | 'bevel', ratio: number, module: number, helix: number, faceWidth: number): PickedFinal {
  const [lo, hi] = PINION_RANGE[kind];
  let best: { teeth: [number, number]; score: number } | null = null;
  for (let zp = lo; zp <= hi; zp++) {
    const zr = Math.round(ratio * zp);
    const err = Math.abs(zr / zp - ratio);
    const score = err + (gcd(zp, zr) === 1 ? 0 : 1e-3) + Math.abs(zp - PINION_PREFERRED[kind]) * 1e-6;
    if (!best || score < best.score) best = { teeth: [zp, zr], score };
  }
  const teeth = best!.teeth;
  return {
    kind, teeth, module, faceWidth, helix: kind === 'helical' ? helix : 0, shift: kind === 'bevel' ? smallGearShift(teeth[0]) : 0,
    ratio: teeth[1] / teeth[0], target: ratio, hand: false,
  };
}

export const handFinal = (kind: 'helical' | 'bevel', f: FinalSetting): PickedFinal => ({
  kind, teeth: [f.teeth[0], f.teeth[1]], module: f.module, faceWidth: f.faceWidth, helix: kind === 'helical' ? f.helix : 0,
  shift: kind === 'bevel' ? f.shift : 0, ratio: f.teeth[1] / f.teeth[0], target: null, hand: true,
});

/**
 * Coarsest module with which a pair of ratio u still leaves room for a pinion of MIN_TEETH at this centre distance:
 * the tooth sum 2a·cos β_lo/m must reach a little more than MIN_TEETH·(1 + max(u, 1/u)). This is the plan's "the largest gear fits
 * between the shafts": past it the big gear crowds the other shaft's pinion below the fewest teeth.
 */
export function maxModuleFor(u: number, centreMm: number, nominalHelix: number): number {
  const [lo] = helixRange(nominalHelix);
  // One tooth more than the fewest, and one over: a coprime ratio on the far side of the target stays on the grid.
  const need = (MIN_TEETH + 1) * (1 + Math.max(u, 1 / u)) + 1;
  return (2 * centreMm * Math.cos(lo * DEG)) / need;
}

/**
 * Finest module with which the pair's big gear stays within MAX_TEETH − 1 at the smallest tooth sum the helix range
 * allows: finer still, the sum forces a gear past the most teeth the picker gives.
 */
export function minModuleFor(u: number, centreMm: number, nominalHelix: number): number {
  const [, hi] = helixRange(nominalHelix);
  const k = Math.max(u, 1 / u);
  return (2 * centreMm * Math.cos(hi * DEG) * k) / ((1 + k) * (MAX_TEETH - 2));
}
