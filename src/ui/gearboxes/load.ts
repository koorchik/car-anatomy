// What the gearbox section needs before it can show an address. The loader (src/main.ts) carries this, so it holds
// nothing but the list of pages a visitor can open and the chunk to fetch.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import type { Section } from '../../shell/section.ts';

/**
 * The gearbox pages built so far, by the id in `#/gearboxes/<page>`: the first is where the menu leads. A page's data
 * may exist before its page does (src/data/gearboxes.ts); it joins this list with the stage that shows it.
 */
export const GEARBOX_PAGES_SHOWN: readonly string[] = ['manual-rwd', 'automatic'];

/** The engines' dictionary too: the page runs the car's engine from the engine catalogue, which brings its words. */
export async function loadGearboxes(): Promise<Section> {
  const { GearboxPages } = await withDictionaries(['engines', 'gearboxes', 'gearbox-parts', 'gearbox-automatic'], () => import('./pages.ts'));
  return new GearboxPages();
}
