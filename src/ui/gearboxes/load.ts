// What the gearbox section needs before it can show an address. The loader (src/main.ts) carries this, so it holds
// nothing but the list of pages a visitor can open and the chunk to fetch.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import type { Route } from '../../shell/routes.ts';
import type { Section } from '../../shell/section.ts';

/**
 * The gearbox pages built so far, by the id in `#/gearboxes/<page>` (every variant of a page shown is shown too, at
 * `#/gearboxes/<page>/<variant>`): the first is where the menu leads. A page's data
 * may exist before its page does (src/data/gearboxes.ts); it joins this list with the stage that shows it.
 */
export const GEARBOX_PAGES_SHOWN: readonly string[] = ['manual-rwd', 'manual-transaxle'];

/**
 * The engines' dictionary too: the page runs the car's engine from the engine catalogue, which brings its words. A
 * designer address (#/gearboxes/designer) fetches the designer's chunk alongside, so its first view is the designer;
 * the section asks for that chunk again should it fail to come.
 */
export async function loadGearboxes(route: Route): Promise<Section> {
  const designer = route.page === 'designer' ? withDictionaries(['engines', 'gearboxes', 'gearbox-parts', 'gearbox-designer', 'presets'], () => import('../gearbox-designer/page.ts')) : null;
  const [{ GearboxSection }] = await Promise.all([withDictionaries(['engines', 'gearboxes', 'gearbox-parts'], () => import('./section.ts')), designer?.catch(() => null)]);
  return new GearboxSection();
}
