// Picks the teeth of a pair for a wanted ratio when the centre distance is shared (every pair of a layshaft box spans
// the same countershaft-to-mainshaft distance) and the module belongs to the pair. The helix angle is what is left
// to close the centre distance, so a tooth sum is allowed only if its helix falls in the range.
//
// Teeth are whole numbers, so only a grid of ratios is reachable; `step` says how fine it is around the target.
// Coprime teeth are preferred by default ("hunting tooth"): every tooth then meets every tooth of the mate and wear
// spreads evenly. Real boxes do not always follow it, so a reconstruction of published ratios may turn it off.
//
// Used by the reconstruction of catalogue gearboxes, the settings panel of the gearbox pages and the designer.

import { centreDistance, helixForCentre } from './gear-geometry.ts';

export interface PairRequest {
  /** Wanted ratio of the pair: driven teeth over driving teeth, > 0. */
  ratio: number;
  /** Centre distance the pair has to span, mm. */
  centreMm: number;
  /** Normal module of the pair, mm. */
  module: number;
  /** Allowed helix angles, degrees, [lowest, highest]. Spur pairs pass [0, 0]. */
  helixRange: [number, number];
  /** Normal pressure angle, degrees. Default 20. */
  pressureAngle?: number;
  /** Profile shift sum of the pair. Default 0. */
  shiftSum?: number;
  /** Fewest and most teeth on either gear. Defaults 12 and 120. */
  minTeeth?: number;
  maxTeeth?: number;
  /** Only coprime pairs. Default true. */
  coprime?: boolean;
}

export interface PairPick {
  /** Driving and driven teeth. */
  teeth: [number, number];
  ratio: number;
  /** ratio − wanted. */
  error: number;
  /** Helix angle that closes the centre distance, degrees. */
  helix: number;
  coprime: boolean;
  /** Distance between the nearest reachable ratios below and above the wanted one; Infinity outside the grid. */
  step: number;
}

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Every allowed pair, nearest the wanted ratio first; among equals, the helix nearest the middle of the range. */
export function pairCandidates(req: PairRequest): PairPick[] {
  const alpha = req.pressureAngle ?? 20;
  const shiftSum = req.shiftSum ?? 0;
  const minTeeth = req.minTeeth ?? 12;
  const maxTeeth = req.maxTeeth ?? 120;
  const coprimeOnly = req.coprime ?? true;
  const [lo, hi] = req.helixRange;
  const middle = (lo + hi) / 2;
  const found: Array<Omit<PairPick, 'step'>> = [];
  const spur = lo === 0 && hi === 0;
  for (let sum = 2 * minTeeth; sum <= 2 * maxTeeth; sum++) {
    // A spur pair has no helix to give: its tooth sum must span the centre distance as it is.
    const helix = spur ? 0 : helixForCentre(req.centreMm, req.module, 1, sum - 1, alpha, shiftSum);
    const fits = spur
      ? Math.abs(centreDistance(req.module, 1, sum - 1, 0, alpha, shiftSum) - req.centreMm) < 1e-6
      : Number.isFinite(helix) && helix >= lo - 1e-9 && helix <= hi + 1e-9;
    if (!fits) continue;
    for (let z1 = Math.max(minTeeth, sum - maxTeeth); z1 <= Math.min(maxTeeth, sum - minTeeth); z1++) {
      const z2 = sum - z1;
      const coprime = gcd(z1, z2) === 1;
      if (coprimeOnly && !coprime) continue;
      const ratio = z2 / z1;
      found.push({ teeth: [z1, z2], ratio, error: ratio - req.ratio, helix, coprime });
    }
  }
  const below = Math.max(...found.filter((p) => p.ratio <= req.ratio).map((p) => p.ratio));
  const above = Math.min(...found.filter((p) => p.ratio >= req.ratio).map((p) => p.ratio));
  const step = Number.isFinite(below) && Number.isFinite(above) ? above - below : Infinity;
  return found
    .sort((p, q) => Math.abs(p.error) - Math.abs(q.error) || Math.abs(p.helix - middle) - Math.abs(q.helix - middle))
    .map((p) => ({ ...p, step }));
}

/** The pair nearest the wanted ratio, or null when no tooth sum fits the centre distance with this module. */
export function pickPair(req: PairRequest): PairPick | null {
  return pairCandidates(req)[0] ?? null;
}
