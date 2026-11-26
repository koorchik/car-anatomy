// The designer page (`#/designer`) inside the engines section: what its DesignerPage asks of the page around it.
// The designer's chunk starts here (chunks.ts): its code loads the first time the page is opened.

import { t } from '../../i18n/t.ts';
import { DesignerPage } from '../designer/designer-page.ts';
import { $ } from './dom.ts';
import type { EnginesSection } from './section.ts';

export { DesignerPage };

export class DesignerHost {
  readonly page: DesignerPage;
  private readonly section: EnginesSection;
  private lastDistress = 0;
  private lastZones: { safe: number; failure: number; cut: number } | null = null;

  constructor(section: EnginesSection) {
    this.section = section;
    const s = section;
    this.page = new DesignerPage({
      showEngine(next) {
        s.showEngine(next, true);
      },
      sameShape(next) {
        s.features.sameShape(next);
      },
      heading: () => {
        this.syncHeading();
      },
      soundEngine: (next, perf) => {
        const running = s.drive.snapshot().state === 'running';
        s.drive.setEngine(next);
        // Mixture, ignition and boost change the systems' numbers without changing the model.
        s.features.systems.retune(next);
        s.features.setDynoEngine(next, { kind: 'designer', design: this.page.current, perf });
        if (running && !perf.catches) s.drive.stop();
      },
      setTrim(trim) {
        s.drive.setTrim(trim);
      },
      wreck: () => {
        s.features.dyno?.abort('broken');
        s.drive.bang();
        s.drive.setDistress(0);
        s.drive.stop();
        // A repaired engine must not start at the throttle that just killed it.
        s.dash.pedal.letGo();
        $('wreck').textContent = this.page.wreckMessage;
        $('wreck').hidden = false;
        $('strain').hidden = true;
      },
      zones: (safe, failure, cut) => {
        this.lastZones = { safe, failure, cut };
        this.applyZones();
      },
      health: (share, suffering, distress) => {
        const percent = Math.round(share * 100);
        $('health-bar').style.width = `${percent}%`;
        $('health-bar').classList.toggle('low', share < 0.35);
        $('health-value').textContent = `${percent}%`;
        $('health').setAttribute('aria-valuenow', String(percent));
        $('strain').hidden = !suffering;
        if (suffering) $('strain').textContent = t('Зношується: {part}', { part: suffering.toLowerCase() });
        if (distress !== this.lastDistress) {
          this.lastDistress = distress;
          s.drive.setDistress(distress);
        }
        if (share === 1) $('wreck').hidden = true;
      },
      showFailure(part) {
        s.model?.setFailure(part);
      },
    });
    $('designer-host').append(this.page.controlsHost);
    $('results-host').append(this.page.results.root);
  }

  /** The rev limit draws the dial, exactly as in the catalogue. Zones are added on top of it. */
  applyZones(): void {
    if (!this.lastZones || !this.section.onDesigner) return;
    const { safe, failure, cut } = this.lastZones;
    this.section.dash.zones(safe, failure, cut);
  }

  syncHeading(): void {
    $('engine-title').textContent = this.page.title;
    $('engine-sub').textContent = this.page.summary;
    document.title = t('{title}. Анатомія авто', { title: this.page.title });
  }
}
