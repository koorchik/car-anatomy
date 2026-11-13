// Links between sections are built from the car records, never typed into text: a record knows its engine, gearbox
// and suspensions, so an article can say where else the same car appears. Only pages that exist get a link, and
// which ones exist the caller says through a PageIndex, because sections land one by one.

import type { CarRecord } from './car.ts';

export type LinkSection = 'engines' | 'sump' | 'gearboxes' | 'suspensions' | 'car';

export interface CarLink {
  section: LinkSection;
  /** Page id or page/variant, suspension type or car id: what the section looks up. */
  target: string;
  /** Hash route, as in the address table of the whole-car plan. */
  href: string;
}

/** Which pages exist now. */
export interface PageIndex {
  has(section: LinkSection, target: string): boolean;
}

/** A PageIndex from one test per section; a section without one has no pages yet. */
export function pageIndex(tests: Partial<Record<LinkSection, (target: string) => boolean>>): PageIndex {
  return { has: (section, target) => tests[section]?.(target) ?? false };
}

/** Cars whose catalogue engine is exactly this page or page/variant. */
export const carsWithEngine = (engineId: string, cars: readonly CarRecord[]): CarRecord[] => cars.filter((c) => c.engine === engineId);

/** Where this car appears across the site, in reading order: engine, oil on track, gearbox, suspensions, the car. */
export function carLinks(car: CarRecord, pages: PageIndex): CarLink[] {
  const links: CarLink[] = [];
  const add = (section: LinkSection, target: string, href: string): void => {
    if (pages.has(section, target) && !links.some((l) => l.href === href)) links.push({ section, target, href });
  };
  add('engines', car.engine, `#/engines/${car.engine}`);
  add('sump', car.engine, `#/sump/${car.engine}`);
  if (car.gearbox) add('gearboxes', car.gearbox, `#/gearboxes/${car.gearbox}`);
  if (car.suspension) {
    add('suspensions', car.suspension.front, `#/suspensions/${car.suspension.front}/${car.id}`);
    add('suspensions', car.suspension.rear, `#/suspensions/${car.suspension.rear}/${car.id}`);
  }
  add('car', car.id, `#/car/${car.id}`);
  return links;
}
