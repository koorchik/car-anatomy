import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans-extra-condensed/600.css';
import '@fontsource/fira-sans-extra-condensed/700.css';
import '@fontsource/fira-sans-extra-condensed/800.css';
import './style.css';
import type { Drive } from './audio/drive.ts';
import type { Stage } from './scene/stage.ts';
import { Shell } from './shell/app.ts';
import type { FreezeOptions } from './shell/freeze.ts';
import type { DesignerPage } from './ui/designer/designer-page.ts';
import type { DynoPanel } from './ui/dyno/dyno-panel.ts';
import { EnginesSection } from './ui/engines/section.ts';
import type { SumpPage } from './ui/sump/sump-page.ts';
import type { SystemsView } from './ui/systems-view.ts';

const engines = new EnginesSection();
const shell = new Shell(document.getElementById('app')!, [engines]);
shell.start();

// Handy for manual checks in the browser console, and what the snapshots of the pages hold still with.
declare global {
  interface Window {
    __engine: { drive: Drive; stage: Stage; designer: DesignerPage; systems: SystemsView; dyno: DynoPanel; readonly sump: SumpPage | null; freeze: (options: FreezeOptions | null) => void };
  }
}
window.__engine = {
  drive: engines.drive,
  stage: shell.stage,
  designer: engines.designer.page,
  systems: engines.features.systems,
  dyno: engines.features.dyno,
  get sump() {
    return engines.sump.page;
  },
  freeze: (options) => shell.freeze(options),
};
