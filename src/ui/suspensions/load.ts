// What the suspensions section needs before it can show an address. The loader (src/main.ts) carries this, so it holds
// nothing but the section's chunk, fetched after its English. A designer address (#/suspensions/designer) fetches the
// designer's chunk alongside, so its first view is the designer; the host asks for that chunk again should it fail.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import type { Route } from '../../shell/routes.ts';
import type { Section } from '../../shell/section.ts';

export async function loadSuspensions(route: Route): Promise<Section> {
  const designer =
    route.page === 'designer' ? withDictionaries(['suspension', 'suspension-designer'], () => import('../suspension-designer/page.ts')).catch(() => null) : null;
  const [{ SuspensionSection }, { SuspensionsHost }, designerModule] = await Promise.all([
    withDictionaries(['suspension', 'suspension-macpherson', 'suspension-double-wishbone', 'suspension-multilink'], () => import('./section.ts')),
    withDictionaries(['suspension'], () => import('./host.ts')),
    designer,
  ]);
  return new SuspensionsHost(new SuspensionSection(), designerModule);
}
