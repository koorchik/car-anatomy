// The model against what the makers publish, for every donor as made: what tests/car-build holds and what
// scripts/car-table.ts prints. No visitor sees this module's notes.
//
// - v_max is the calibration of the road load (docs/vehicle-model.md, the C_dA rule): a car calibrated on its top speed
//   reaches it within 2 % on the gearbox model; a car with an EPA coast-down is an independent check, within 7 % as
//   the gearbox plan asks.
// - 0–100 km/h is an independent check within ±15 % (whole-car plan, tests/car-build). It is the gearbox designer's
//   quasi-static run, the figure the gearbox page shows too (tests/vehicle-consistency), so where that run is slower
//   for reasons of its own the exception is written down here, with the reason, and bounded by the gearbox
//   section's own ±25 % (tests/drivetrain-vehicle) instead of being hidden by a wider bound for every car.

import { roadLoadRule } from '../vehicle/road-load.ts';
import type { CarPerformance } from './evaluate.ts';

export const VMAX_CALIBRATED = 0.02;
export const VMAX_EPA = 0.07;
export const ZERO_TO_100 = 0.15;
/** The gearbox section's own bound on its 0–100 km/h against the maker's (tests/drivetrain-vehicle). */
export const ZERO_TO_100_SECTION = 0.25;

/**
 * Donors whose 0–100 km/h the shared run protocol (runs.ts: a careful driver at 98 % of the tyres' grip, 0.25 s
 * shifts with the throttle lifted) and the site's tyres put outside ±15 %. docs/gearbox-model.md describes both.
 */
export const ZERO_TO_100_EXCEPTIONS: Readonly<Record<string, string>> = {
  'bmw-m3-e30':
    'The run is 23 % slower than BMW\'s 6.7 s: first and second gear are held by the "classic" tyre, whose μ 0.8 is our estimate for 1980s tyres (μ 0.9 gives 7.6 s, μ 1.0 7.1 s), and second ends at 98 km/h, so the run takes third before 100.',
  'civic-type-r-fk8':
    'The run is 19 % slower than Honda\'s 5.7 s: a front-driven car on the careful driver of the shared protocol, with two shifts of 0.25 s before 100 km/h.',
};

export interface PublishedRow {
  figure: 'vmax' | 'zeroTo100';
  model: number;
  published: number;
  /** model / published − 1. */
  error: number;
  bound: number;
  ok: boolean;
  note: string | null;
}

/** The donor as made against its published figures; a figure the maker does not publish is left out. */
export function publishedRows(p: CarPerformance): PublishedRow[] {
  const car = p.donor;
  const rows: PublishedRow[] = [];
  if (!car.published.vmaxLimited) {
    const bound = roadLoadRule(car) === 'epa' ? VMAX_EPA : VMAX_CALIBRATED;
    const error = p.vmaxKmh / car.published.vmaxKmh - 1;
    rows.push({ figure: 'vmax', model: p.vmaxKmh, published: car.published.vmaxKmh, error, bound, ok: Math.abs(error) <= bound, note: null });
  }
  if (car.published.zeroTo100S !== null && p.zeroTo100S !== null) {
    const note = ZERO_TO_100_EXCEPTIONS[car.id] ?? null;
    const bound = note ? ZERO_TO_100_SECTION : ZERO_TO_100;
    const error = p.zeroTo100S / car.published.zeroTo100S - 1;
    rows.push({ figure: 'zeroTo100', model: p.zeroTo100S, published: car.published.zeroTo100S, error, bound, ok: Math.abs(error) <= bound, note });
  }
  return rows;
}
