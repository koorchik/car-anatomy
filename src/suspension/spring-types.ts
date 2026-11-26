// What a spring does when the load on it changes (stage P14-core, the springs scene's graph "frequency from load"): a
// steel coil (or a torsion bar or leaf, which follow the same linear law at their own motion ratio) keeps its rate and
// sinks, so the body frequency falls as m^−0.5; a levelled air spring keeps its height and its rate grows with the load,
// so the frequency stays nearly where it was; a levelled hydropneumatic strut keeps its height by adding oil, its gas
// shrinks, k ∝ p^(1 + 1/n) and the frequency rises as m^(1/(2n)) ≈ m^0.36 (docs/research/suspensions.md 1.3). Without
// levelling a gas spring sinks like a coil but stiffens as it goes. All along the element's own axis; a corner converts
// through its motion ratio.

import { gasSpringFor, gasSpringForce, gasSpringRate, levelGasSpring, type GasKind } from './forces.ts';

export type SpringType = 'coil' | GasKind;
export const SPRING_TYPES = ['coil', 'air', 'hydro'] as const satisfies readonly SpringType[];

/** A spring as built for its design load: the force and rate along it there and its length. */
export interface SpringAtDesign {
  type: SpringType;
  staticN: number;
  rateNm: number;
  lenM: number;
  /** Whether a gas spring's height is levelled (a coil never is). */
  levelled: boolean;
}

/** The spring under another static load: its rate along the element, N/m, and how far it sank from design, m. */
export interface SpringUnderLoad {
  rateNm: number;
  sagM: number;
}

/** The rate and the sag of the spring when its static load becomes `staticN`. */
export function springUnderLoad(s: SpringAtDesign, staticN: number): SpringUnderLoad {
  if (s.type === 'coil') return { rateNm: s.rateNm, sagM: (staticN - s.staticN) / s.rateNm };
  const g = gasSpringFor(s.type, s.staticN, s.rateNm, s.lenM);
  if (s.levelled) return { rateNm: gasSpringRate(levelGasSpring(g, staticN), s.lenM), sagM: 0 };
  // Sinks (or rises) until the gas carries the load: bisection on the length.
  let lo = s.lenM - 2 * s.lenM;
  let hi = s.lenM + s.lenM;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (gasSpringForce(g, mid) > staticN) lo = mid;
    else hi = mid;
  }
  const len = (lo + hi) / 2;
  return { rateNm: gasSpringRate(g, len), sagM: s.lenM - len };
}

/**
 * Natural frequency of a mass on the spring alone (no tyre, motion ratio 1), Hz, when the mass changes from the design's
 * `designKg` to `kg`: the springs scene's curve.
 */
export function frequencyAtLoad(type: SpringType, levelled: boolean, designKg: number, designHz: number, kg: number, g = 9.81): number {
  const rateNm = designKg * (2 * Math.PI * designHz) ** 2;
  const s: SpringAtDesign = { type, staticN: designKg * g, rateNm, lenM: 0.3, levelled };
  return Math.sqrt(springUnderLoad(s, kg * g).rateNm / kg) / (2 * Math.PI);
}
