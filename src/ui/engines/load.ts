// What the engines section needs before it can show an address. The loader (src/main.ts) carries this, so it holds
// nothing but the chunks to fetch: the section's own, and the page's when the address opens the designer or the oil.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import type { Route } from '../../shell/routes.ts';
import type { Section } from '../../shell/section.ts';
import { DESIGNER, SUMP } from './chunks.ts';
import { enginesPage } from './routes.ts';

export async function loadEngines(route: Route): Promise<Section> {
  const page = enginesPage(route);
  // Fetched side by side, so the first view is the page asked for and not the catalogue on its way there. A page whose
  // code fails to come still leaves the section to show: the section asks for that code again when it opens the page.
  const pageCode = page === 'designer' ? DESIGNER.load() : page === 'sump' ? SUMP.load() : null;
  const [{ EnginesSection }] = await Promise.all([withDictionaries(['engines'], () => import('./section.ts')), pageCode?.catch(() => null)]);
  return new EnginesSection();
}
