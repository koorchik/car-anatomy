// What the suspensions section needs before it can show an address. The loader (src/main.ts) carries this, so it holds
// nothing but the section's chunk, fetched after its English.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import type { Route } from '../../shell/routes.ts';
import type { Section } from '../../shell/section.ts';

export async function loadSuspensions(_route: Route): Promise<Section> {
  const { SuspensionSection } = await withDictionaries(['suspension', 'suspension-macpherson', 'suspension-double-wishbone', 'suspension-multilink'], () => import('./section.ts'));
  return new SuspensionSection();
}
