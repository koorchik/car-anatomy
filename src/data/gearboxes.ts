// Registry of the gearbox pages, one line per page (each page's data has its own file in src/data/gearboxes/), and
// the records that have no page.

import type { GearboxPage, GearboxRecord } from '../drivetrain/catalogue.ts';
import { MANUAL_RWD } from './gearboxes/manual-rwd.ts';
import { MANUAL_TRANSAXLE } from './gearboxes/manual-transaxle.ts';
import { TR6060_MZ6 } from './gearboxes/tr6060-mz6.ts';
import { AUTOMATIC } from './gearboxes/automatic.ts';
import { ZF_8HP45, ZF_8HP50, ZF_8HP70 } from './gearboxes/zf-8hp.ts';

export const GEARBOX_PAGES: GearboxPage[] = [
  MANUAL_RWD,
  MANUAL_TRANSAXLE,
  AUTOMATIC,
];

/** Records without a page: real tooth counts the derivation and the designer are calibrated on. */
export const CALIBRATION_GEARBOXES: GearboxRecord[] = [TR6060_MZ6, ZF_8HP45, ZF_8HP70, ZF_8HP50];

export const ALL_GEARBOXES: GearboxRecord[] = [...GEARBOX_PAGES.flatMap((p) => [p.base, ...p.variants]), ...CALIBRATION_GEARBOXES];

export const gearboxById = (id: string): GearboxRecord | undefined => ALL_GEARBOXES.find((g) => g.id === id);
