// What the car mode's dash shows, from Drive's snapshot alone (stage K3a): the dash never keeps figures of its own, so
// what it says is what drive.snapshot() says (tests/gearbox-car.test.ts). Numbers and codes; the section words them.

import type { DriveSnapshot } from '../../audio/drive.ts';

export type ClutchState = 'locked' | 'slipping' | 'open';

export interface CarReadings {
  /** Road speed, km/h, whole. */
  kmh: number;
  /** Engine speed, rpm, whole. */
  rpm: number;
  /** The gear that holds, 'N' while none does, and the one asked for. */
  gear: string;
  selected: string;
  clutch: ClutchState;
}

/** Below this slip, rad/s, a fully clamped clutch counts as locked. */
const LOCKED_SLIP = 0.5;

/** The dash of a snapshot; null without a car on the crank. */
export function carReadings(snap: DriveSnapshot): CarReadings | null {
  const v = snap.vehicle;
  if (!v) return null;
  const clutch: ClutchState = v.clutch <= 0 ? 'open' : v.clutch >= 1 && Math.abs(v.clutchSlip) < LOCKED_SLIP ? 'locked' : 'slipping';
  return { kmh: Math.round(Math.abs(v.speed) * 3.6), rpm: Math.round(snap.rpm), gear: v.gear, selected: v.selected, clutch };
}
