// Registry of the suspension pages, one line per page (each page has its own file in src/data/suspensions/ and its own
// dictionary), in the order of the catalogue: the arrow keys and the previous and next buttons go through it.

import type { PageCar, SuspensionPage } from '../suspension-designer/page-cars.ts';
import { DOUBLE_WISHBONE_PAGE } from './suspensions/double-wishbone.ts';
import { MACPHERSON_PAGE } from './suspensions/macpherson.ts';
import { MULTILINK_PAGE } from './suspensions/multilink.ts';
import { PUSHROD_PAGE } from './suspensions/pushrod.ts';

export const SUSPENSION_PAGES: readonly SuspensionPage[] = [MACPHERSON_PAGE, DOUBLE_WISHBONE_PAGE, MULTILINK_PAGE, PUSHROD_PAGE];

export const suspensionPage = (id: string): SuspensionPage | undefined => SUSPENSION_PAGES.find((p) => p.id === id);

/** A car of a page by its id, or undefined. */
export const pageCar = (page: SuspensionPage, id: string): PageCar | undefined => page.cars.find((c) => c.link.car === id);
