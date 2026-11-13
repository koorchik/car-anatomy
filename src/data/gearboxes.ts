// Registry of the gearbox pages, one line per page (each page's data has its own file in src/data/gearboxes/), and
// the records that have no page.

import type { GearboxPage, GearboxRecord } from '../drivetrain/catalogue.ts';
import { MANUAL_RWD } from './gearboxes/manual-rwd.ts';
import { TR6060_MZ6 } from './gearboxes/tr6060-mz6.ts';

export const GEARBOX_PAGES: GearboxPage[] = [
  MANUAL_RWD,
];

/** Records without a page: real tooth counts the derivation and the designer are calibrated on. */
export const CALIBRATION_GEARBOXES: GearboxRecord[] = [TR6060_MZ6];

export const ALL_GEARBOXES: GearboxRecord[] = [...GEARBOX_PAGES.flatMap((p) => [p.base, ...p.variants]), ...CALIBRATION_GEARBOXES];

export const gearboxById = (id: string): GearboxRecord | undefined => ALL_GEARBOXES.find((g) => g.id === id);
