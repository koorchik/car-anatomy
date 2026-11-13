// How much oil an engine holds when nobody says, from its displacement and sump. Shared by the engine side
// (systemsOf, for specs built by hand) and the designer, which cannot be imported from src/engine.

import type { SumpKind } from '../engine/systems-spec.ts';

/**
 * Oil capacity with the filter, litres: 2.4·Vd^0.55 for a wet sump, more for the dry kinds, whose tank or extra stages
 * hold oil too (estimates, fitted to petrol car engines). Checks against GM TechLink: a C7 Corvette LT1 6.2 wet
 * takes 6.6 L and its Z51 dry sump 9.3 L, the formula gives 6.9 and 9.3 L. A small single gets about a litre.
 */
export function derivedOilL(litres: number, sump: SumpKind): number {
  const wet = Math.max(0.6, 2.4 * Math.max(0, litres) ** 0.55);
  const factor = sump === 'dry' ? 1.35 : sump === 'integrated-dry' ? 1.2 : 1;
  return Math.round(wet * factor * 10) / 10;
}

/** Oil that stays in the filter, the galleries and the cooler while the engine runs, litres (estimate). */
export const fixedOilL = (litres: number): number => 0.05 + 0.12 * Math.max(0, litres);
