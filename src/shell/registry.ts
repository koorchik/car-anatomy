// The sections of the site and how each one loads. The loader (src/main.ts) carries this list, so a section is a
// function here: its code and its text come only when one of its addresses is opened.
//
// The menu is built from this list too (menu.ts): a section's item is a link once its entry lists a page, and says
// 'coming soon' until then. A section that registers here never edits the menu.

import { DEFAULT_ENGINE } from '../ui/engines/routes.ts';
import { loadEngines } from '../ui/engines/load.ts';
import { GEARBOX_PAGES_SHOWN, loadGearboxes } from '../ui/gearboxes/load.ts';
import { loadSuspensions } from '../ui/suspensions/load.ts';
import type { Route, SectionId } from './routes.ts';
import type { Section } from './section.ts';

/** A page a visitor reaches from the menu: a tab under the section's item. */
export interface MenuPage {
  /** The page as the menu knows it; the tab's name is the shell's (menu-model.ts, under `<section>/<key>`). */
  readonly key: string;
  /** Where the tab leads, `#/…`. */
  readonly href: string;
}

export interface SectionEntry {
  readonly id: SectionId;
  /**
   * The pages a link from another section may lead to, by the id in their address (`#/gearboxes/<page>`). Left out for
   * a section whose every page is open; empty for a section whose addresses open but are not shown yet (a hidden page
   * in the making). The menu goes by `pages` below.
   */
  readonly openPages?: readonly string[];
  /** Fetches the section's code (after its English, in English) and what the route needs of it, and makes the section. */
  load(route: Route): Promise<Section>;
  /**
   * The pages the menu shows, in the order of the tabs; the section's item leads to the first. Left out or empty, the
   * section's addresses still open but the menu shows it as 'coming soon': a page in the making, reached by its address.
   */
  readonly pages?: readonly MenuPage[];
  /** Which of `pages` a route of this section shows, by key. Left out: the route's page. */
  tab?(route: Route): string;
}

/** The first is the home of every address no other section claims. */
export const SECTIONS: readonly SectionEntry[] = [
  {
    id: 'engines',
    load: loadEngines,
    pages: [
      { key: 'catalogue', href: `#/engines/${DEFAULT_ENGINE}` },
      { key: 'designer', href: '#/designer' },
      { key: 'sump', href: '#/sump' },
    ],
  },
  {
    id: 'gearboxes',
    load: loadGearboxes,
    openPages: GEARBOX_PAGES_SHOWN,
    pages: [{ key: 'catalogue', href: `#/gearboxes/${GEARBOX_PAGES_SHOWN[0]!}` }],
  },
  // At a hidden address until its first visible page (P1d): no link leads there yet.
  { id: 'suspensions', load: loadSuspensions, openPages: [] },
];

/** The entry of the section a route belongs to. */
export function sectionEntry(route: Route): SectionEntry {
  return SECTIONS.find((s) => s.id === route.section) ?? SECTIONS[0]!;
}

/** Whether a link may lead to a page of a section: listed in its entry's openPages, or the section has every page open. */
export function pageShown(section: SectionId, page: string): boolean {
  const entry = SECTIONS.find((s) => s.id === section);
  return entry !== undefined && (entry.openPages === undefined || entry.openPages.includes(page));
}
