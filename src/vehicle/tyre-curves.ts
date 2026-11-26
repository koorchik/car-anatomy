// What the tyre scene plots and quotes, straight from the Magic Formula (tyre.ts): side force against slip angle at
// several loads, force along against slip, the friction envelope of combined slip, the aligning moment, and the
// numbers of camber («1° of camber is worth about 0.05° of slip angle», «−2° on the outer wheel: peak +1.5 %»). All on a
// left tyre with the slip angle positive, so the side force points to the wheel's right; the plots show it positive.
// No DOM and no text.

import { inclinationOf, mfForces, newMfForces } from './tyre.ts';
import type { MfSet } from './tyre-data.ts';

const DEG = Math.PI / 180;
const o = newMfForces();

/** One point of a tyre: forces in N (side force positive to the wheel's right), aligning moment in N·m. */
export interface TyrePoint {
  fx: number;
  fy: number;
  mz: number;
}

/** The left tyre at slip angle α, slip κ and camber (ISO), all in rad, under load `fz`. */
export function tyrePoint(set: MfSet, fz: number, alpha: number, kappa: number, camber: number): TyrePoint {
  mfForces(set, 'left', kappa, alpha, inclinationOf('left', camber), fz, 1, o);
  return { fx: o.fx, fy: -o.fy, mz: o.mz };
}

/** Side force over slip angles `alphasDeg`, N (positive). */
export const lateralCurve = (set: MfSet, fz: number, camber: number, alphasDeg: readonly number[]): number[] =>
  alphasDeg.map((a) => tyrePoint(set, fz, a * DEG, 0, camber).fy);

/** Force along over slips `kappas`, N. */
export const longitudinalCurve = (set: MfSet, fz: number, camber: number, kappas: readonly number[]): number[] =>
  kappas.map((k) => tyrePoint(set, fz, 0, k, camber).fx);

/** Aligning moment over slip angles `alphasDeg`, N·m. */
export const aligningCurve = (set: MfSet, fz: number, camber: number, alphasDeg: readonly number[]): number[] =>
  alphasDeg.map((a) => tyrePoint(set, fz, a * DEG, 0, camber).mz);

/** Evenly spaced values from a to b, `n` of them. */
export const span = (a: number, b: number, n: number): number[] => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

/** The largest value of a curve and where it is. */
export function peakOf(xs: readonly number[], ys: readonly number[]): { x: number; y: number } {
  let best = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i]! > ys[best]!) best = i;
  return { x: xs[best]!, y: ys[best]! };
}

/** Slip angles of the search for a peak, deg: fine enough for 0.05°, up to 30° (P2 found peaks as late as 20°). */
const SEARCH_DEG = span(0, 30, 601);

/** Peak side force and its slip angle, deg. */
export function lateralPeak(set: MfSet, fz: number, camber = 0): { alphaDeg: number; fy: number } {
  const p = peakOf(SEARCH_DEG, lateralCurve(set, fz, camber, SEARCH_DEG));
  return { alphaDeg: p.x, fy: p.y };
}

/** Peak aligning moment and its slip angle, deg. */
export function aligningPeak(set: MfSet, fz: number, camber = 0): { alphaDeg: number; mz: number } {
  const p = peakOf(SEARCH_DEG, aligningCurve(set, fz, camber, SEARCH_DEG));
  return { alphaDeg: p.x, mz: p.y };
}

/** Steps of the envelope's coarse search along each slip direction, and of its fine search on each side of the best. */
const ENVELOPE_COARSE = 25;
const ENVELOPE_FINE = 5;

/**
 * The friction envelope: for each direction of the slip vector, the largest force the tyre makes along any slip in
 * that direction. Slip directions run round the circle with α and κ scaled to their own saturation (`alphaSat` rad,
 * `kappaSat`), so every direction reaches its peak. Points as [fx, fy], N.
 */
export function frictionEnvelope(set: MfSet, fz: number, camber: number, directions = 48, alphaSat = 0.3, kappaSat = 0.3): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < directions; i++) {
    const th = (i / directions) * 2 * Math.PI;
    let best: [number, number] = [0, 0];
    let bestMag = -1;
    let bestS = 0;
    const tryAt = (s: number): void => {
      const p = tyrePoint(set, fz, Math.sin(th) * alphaSat * s, Math.cos(th) * kappaSat * s, camber);
      const mag = Math.hypot(p.fx, p.fy);
      if (mag > bestMag) {
        bestMag = mag;
        best = [p.fx, p.fy];
        bestS = s;
      }
    };
    // A coarse pass over the whole slip, then a fine one round its best: the scene redraws this on every change of
    // load or camber, and a fine pass all along costs four times as much for the same envelope.
    for (let k = 1; k <= ENVELOPE_COARSE; k++) tryAt(k / ENVELOPE_COARSE);
    const coarseBest = bestS;
    const step = 1 / ENVELOPE_COARSE;
    for (let k = -ENVELOPE_FINE; k <= ENVELOPE_FINE; k++) {
      const s = coarseBest + (k / ENVELOPE_FINE) * step;
      if (k !== 0 && s > 0 && s <= 1) tryAt(s);
    }
    out.push(best);
  }
  return out;
}

export interface CamberNumbers {
  /** Degrees of slip angle that one degree of negative camber is worth at zero slip: camber stiffness over cornering stiffness. */
  slipPerCamber: number;
  /** Change of the peak side force, %, with the wheel leaning `camberDeg` into the force (an outer wheel's negative camber)… */
  gainPct: number;
  /** …and the same camber leaning away from it (an inner wheel's). */
  lossPct: number;
}

/** What camber does to this tyre under load `fz`: the camber thrust in slip angle, and the peak with ±`camberDeg`. */
export function camberNumbers(set: MfSet, fz: number, camberDeg = 2): CamberNumbers {
  const h = 1e-4;
  const camberStiffness = (tyrePoint(set, fz, 0, 0, -h).fy - tyrePoint(set, fz, 0, 0, h).fy) / (2 * h);
  const corneringStiffness = (tyrePoint(set, fz, h, 0, 0).fy - tyrePoint(set, fz, -h, 0, 0).fy) / (2 * h);
  const flat = lateralPeak(set, fz, 0).fy;
  return {
    slipPerCamber: camberStiffness / corneringStiffness,
    gainPct: (lateralPeak(set, fz, -camberDeg * DEG).fy / flat - 1) * 100,
    lossPct: (lateralPeak(set, fz, camberDeg * DEG).fy / flat - 1) * 100,
  };
}

export interface ToeNumbers {
  /** Slip angle of each wheel, deg, for the axle's total toe spread evenly over its two wheels. */
  perWheelDeg: number;
  /** How far sideways the wheel would be carried per kilometre if the tread did not flex, mm: an upper bound. */
  scrubMmPerKm: number;
  /** Drag of one wheel from that slip angle, N: the side force's component along the travel. */
  dragN: number;
}

/**
 * Toe as the tyre sees it: `totalMm` of total toe measured across a tyre of diameter `diameterM` is a slip angle of
 * atan(totalMm/2 / D) on each wheel. The drag grows with the square of the angle (C_α·α²), so doubling the toe makes
 * four times the drag (docs/suspension-research/alignment_evidence.md, toe).
 */
export function toeNumbers(set: MfSet, fz: number, totalMm: number, diameterM: number): ToeNumbers {
  const alpha = Math.atan(totalMm / 2 / 1000 / diameterM);
  // The mean of the axle's two wheels: the right one is the left's mirror, so the files' zero-slip side force (ply
  // steer, conicity) cancels and only the force the toe itself makes is left.
  const fy = (tyrePoint(set, fz, alpha, 0, 0).fy - tyrePoint(set, fz, -alpha, 0, 0).fy) / 2;
  return { perWheelDeg: alpha / DEG, scrubMmPerKm: Math.tan(alpha) * 1e6, dragN: fy * Math.sin(alpha) };
}
