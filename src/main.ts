// The loader: the fonts, the table of addresses and the list of sections, nothing else. It reads the address and
// fetches the shell (the main chunk: Three.js, the stage, the skeleton) and the section of that address at the same
// time, so a page costs one round trip more than the loader and not two.

import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans-extra-condensed/600.css';
import '@fontsource/fira-sans-extra-condensed/700.css';
import '@fontsource/fira-sans-extra-condensed/800.css';
import type { Drive } from './audio/drive.ts';
import type { Stage } from './scene/stage.ts';
import type { FreezeOptions } from './shell/freeze.ts';
import { SECTIONS, sectionEntry } from './shell/registry.ts';
import { parseRoute } from './shell/routes.ts';
import type { DesignerPage } from './ui/designer/designer-page.ts';
import type { DynoPanel } from './ui/dyno/dyno-panel.ts';
import type { EnginesSection } from './ui/engines/section.ts';
import type { SumpPage } from './ui/sump/sump-page.ts';
import type { SystemsView } from './ui/systems-view.ts';

const route = parseRoute(location.hash);
const [{ Shell }, first] = await Promise.all([import('./shell/app.ts'), sectionEntry(route).load(route)]);
const shell = new Shell(document.getElementById('app')!, SECTIONS);
shell.start(first);

// Handy for manual checks in the browser console, and what the snapshots of the pages hold still with. A feature that
// loads on first use is null until then; loadAll() brings every one, as the pages had them before they were lazy.
declare global {
  interface Window {
    __engine: {
      drive: Drive;
      stage: Stage;
      readonly designer: DesignerPage | null;
      systems: SystemsView;
      readonly dyno: DynoPanel | null;
      readonly sump: SumpPage | null;
      freeze: (options: FreezeOptions | null) => void;
      loadAll: () => Promise<void>;
    };
  }
}
const engines = first as EnginesSection;
window.__engine = {
  drive: engines.drive,
  stage: shell.stage,
  get designer() {
    return engines.designer?.page ?? null;
  },
  systems: engines.features.systems,
  get dyno() {
    return engines.features.dyno;
  },
  get sump() {
    return engines.sump.page;
  },
  freeze: (options) => shell.freeze(options),
  loadAll: () => engines.loadAll(),
};
