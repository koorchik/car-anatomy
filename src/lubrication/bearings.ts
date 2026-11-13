// What the bearings need and how long they last without it. Oil enters the crank's drilling at the main journal and
// has to get to the axis against the drilling's own centrifugal head, ½ρω²R², before it can reach the rod journal
// (SAE 981404, connecting rod bearings with aerated oil). Below that the rod bearings run on what is left in their
// clearance and the drillings, a fraction of a second.

import { FILM_BAR, FILM_RESERVE_S, MAIN_JOURNAL_SHARE, OIL_DENSITY, RESERVE_REFILL } from './constants.ts';

/** Main journal radius, metres, from the bore in mm. */
export const mainJournalRadius = (boreMm: number): number => (MAIN_JOURNAL_SHARE * boreMm) / 2000;

/** Gallery pressure the rod bearings need at a crank speed, bar gauge. */
export function pressureNeed(rpm: number, journalRadius: number): number {
  const w = (rpm * 2 * Math.PI) / 60;
  return (0.5 * OIL_DENSITY * w * w * journalRadius * journalRadius) / 1e5 + FILM_BAR;
}

/** The builders' rule of thumb, 10 psi per 1000 rpm, bar: drawn on the gauge for comparison only. */
export const buildersRule = (rpm: number): number => (10 * 0.0689476 * rpm) / 1000;

/** The film left in the bearings, seconds of running. */
export class FilmReserve {
  seconds = FILM_RESERVE_S;

  reset(): void {
    this.seconds = FILM_RESERVE_S;
  }

  /** Uses it up as fast as the pressure falls short, fills it again once the pressure is back. */
  step(pressure: number, need: number, dt: number): void {
    if (pressure < need) this.seconds = Math.max(0, this.seconds - dt * (1 - pressure / need));
    else this.seconds = Math.min(FILM_RESERVE_S, this.seconds + dt * RESERVE_REFILL);
  }

  get left(): boolean {
    return this.seconds > 0;
  }
}
