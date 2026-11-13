// The sections of the site and how each one loads. The loader (src/main.ts) carries this list, so a section is a
// function here: its code and its text come only when one of its addresses is opened.

import { loadEngines } from '../ui/engines/load.ts';
import type { Route, SectionId } from './routes.ts';
import type { Section } from './section.ts';

export interface SectionEntry {
  readonly id: SectionId;
  /** Fetches the section's code (after its English, in English) and what the route needs of it, and makes the section. */
  load(route: Route): Promise<Section>;
}

/** The first is the home of every address no other section claims. */
export const SECTIONS: readonly SectionEntry[] = [{ id: 'engines', load: loadEngines }];

/** The entry of the section a route belongs to. */
export function sectionEntry(route: Route): SectionEntry {
  return SECTIONS.find((s) => s.id === route.section) ?? SECTIONS[0]!;
}
