// What the car section needs before it can show an address. The loader (src/main.ts) carries this, so it holds nothing
// but the section's chunk, fetched after its English: the car's own text, and the cards of the engine, gearbox and
// suspension models it shows.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import type { Route } from '../../shell/routes.ts';
import type { Section } from '../../shell/section.ts';

export async function loadCar(_route: Route): Promise<Section> {
  const { CarSection } = await withDictionaries(['car', 'engines', 'gearbox-parts', 'suspension'], () => import('./section.ts'));
  return new CarSection();
}
