// The sections of the site and how each one loads. The loader (src/main.ts) carries this list, so a section is a
// function here: its code and its text come only when one of its addresses is opened.

import { loadEngines } from '../ui/engines/load.ts';
import { GEARBOX_PAGES_SHOWN, loadGearboxes } from '../ui/gearboxes/load.ts';
import type { Route, SectionId } from './routes.ts';
import type { Section } from './section.ts';

export interface SectionEntry {
  readonly id: SectionId;
  /**
   * The pages a visitor can open, by the id in their address (`#/gearboxes/<page>`), the first being where the menu
   * leads. Left out for a section whose every page is open. A section in the menu without an entry, or with no page
   * here, is still being prepared (marked as coming), and a link from another section goes only to a page listed here.
   */
  readonly pages?: readonly string[];
  /** Fetches the section's code (after its English, in English) and what the route needs of it, and makes the section. */
  load(route: Route): Promise<Section>;
}

/** The first is the home of every address no other section claims. */
export const SECTIONS: readonly SectionEntry[] = [
  { id: 'engines', load: loadEngines },
  { id: 'gearboxes', pages: GEARBOX_PAGES_SHOWN, load: loadGearboxes },
];

/** The entry of the section a route belongs to. */
export function sectionEntry(route: Route): SectionEntry {
  return SECTIONS.find((s) => s.id === route.section) ?? SECTIONS[0]!;
}

/** Whether a page of a section can be opened: listed in its entry, or the section has every page open. */
export function pageShown(section: SectionId, page: string): boolean {
  const entry = SECTIONS.find((s) => s.id === section);
  return entry !== undefined && (entry.pages === undefined || entry.pages.includes(page));
}
