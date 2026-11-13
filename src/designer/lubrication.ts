// What the sump does to the designer's engine: the oil it holds, the windage it saves, the mass it adds. Pure functions
// of the design; the pan's shape and the crank height need a built engine and live in lubrication-figures.ts.
// Formulas and their status: docs/lubrication-model.md.

import type { SumpKind } from '../engine/systems-spec.ts';
import { t } from '../i18n/t.ts';
import { derivedOilL } from '../systems/oil-capacity.ts';
import { displacementL, isRotary, type Design } from './design.ts';

export const SUMP_NAMES: Record<SumpKind, string> = {
  wet: t('мокрий картер'),
  baffled: t('мокрий картер із перегородками'),
  'integrated-dry': t('інтегрований сухий картер'),
  dry: t('сухий картер'),
};

/**
 * Per sump kind: the share of the crank's windage loss left (a windage screen and scraper strip the oil off the
 * crank; a dry sump keeps the bays nearly empty and under vacuum), and the hardware's mass, kg (box and screen;
 * scavenge stages; pump, tank and lines). Estimates; see docs/lubrication-model.md.
 */
export const SUMP_HARDWARE: Record<SumpKind, { windage: number; massKg: number }> = {
  wet: { windage: 1, massKg: 0 },
  baffled: { windage: 0.75, massKg: 0.6 },
  'integrated-dry': { windage: 0.7, massKg: 2.5 },
  dry: { windage: 0.25, massKg: 6 },
};

/**
 * Windage friction of a wet sump at 20 m/s mean piston speed, bar: what a windage screen and a dry sump take away,
 * at most WINDAGE_CAP_BAR, because the calibrated friction term already holds part of the dry sumps' gain (the fast
 * engines of tests/real-engines.ts are mostly dry). A dry sump's scavenge stages cost SCAVENGE_DRIVE_BAR back.
 */
export const WINDAGE_BAR = 0.4;
export const WINDAGE_CAP_BAR = 0.3;
export const SCAVENGE_DRIVE_BAR = 0.05;

export const effectiveSump = (d: Design): SumpKind => d.sump ?? 'wet';

/** Displacement as a four-stroke engine, litres. */
const litres = (d: Design): number => displacementL(d) * (isRotary(d) ? 2 : 1);

/** Oil capacity the design's size and sump imply, litres. */
export const derivedDesignOilL = (d: Design): number => derivedOilL(litres(d), effectiveSump(d));

export const effectiveOilL = (d: Design): number => d.oilL ?? derivedDesignOilL(d);

/** Change of friction mean effective pressure from the sump, bar, at a mean piston speed in m/s. Zero for a rotary. */
export function sumpFrictionBar(d: Design, sp: number): number {
  if (isRotary(d)) return 0;
  const kind = effectiveSump(d);
  const saved = Math.min(WINDAGE_CAP_BAR, (1 - SUMP_HARDWARE[kind].windage) * WINDAGE_BAR * (sp / 20) ** 2);
  return -saved + (kind === 'dry' ? (SCAVENGE_DRIVE_BAR * sp) / 20 : 0);
}

/** Mass the sump hardware adds, kg. Oil is not counted, as elsewhere. Zero for a rotary, whose figures stay. */
export const sumpMassKg = (d: Design): number => (isRotary(d) ? 0 : SUMP_HARDWARE[effectiveSump(d)].massKg);
