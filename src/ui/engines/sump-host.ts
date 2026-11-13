// The oil-on-track page (`#/sump`) inside the engines section: its own panel, dash and summary, the X-ray with the oil
// layer on. The page's code is a chunk of its own (chunks.ts) and loads the first time the page is visited.

import type { ViewMode } from '../../scene/model-types.ts';
import type { SystemLayer } from '../../scene/systems/layer.ts';
import { t } from '../../i18n/t.ts';
import type { SumpHost, SumpPage } from '../sump/sump-page.ts';
import { SUMP } from './chunks.ts';
import { $ } from './dom.ts';
import type { EnginesSection } from './section.ts';

export class SumpMode {
  on = false;
  page: SumpPage | null = null;
  /** The oil layer's own flat surface, once it has given way to the page's sloshing oil. */
  flattenedLayer: SystemLayer | null = null;
  readonly host: SumpHost;
  private readonly section: EnginesSection;
  private oilLayerBefore = false;
  /** The force arrows are about the crank, not the oil: they are put away on the oil page and come back after it. */
  private forcesBefore = false;
  /** The view and the explode slider before the page, given back on leaving it. */
  private viewBefore: ViewMode = 'xray';
  private explodeBefore = 0;
  /** The page wants its engine heard: a start that lands after the page has gone or gone quiet is dropped. */
  private soundWanted = false;

  constructor(section: EnginesSection) {
    this.section = section;
    const s = section;
    this.host = {
      showEngine: (next, keepCamera) => {
        s.drive.setEngine(next);
        s.showEngine(next, keepCamera);
        if (!keepCamera) this.lookAtOil();
        return s.model!;
      },
      heading(title, sub) {
        $('engine-title').textContent = title;
        $('engine-sub').textContent = sub;
        document.title = t('{title}. Анатомія авто', { title });
      },
      sound: (rpm, throttle) => {
        const drive = s.drive;
        this.soundWanted = rpm !== null;
        if (rpm === null) {
          drive.lock(null);
          drive.setPedal(0);
          drive.stop();
          return;
        }
        const state = drive.snapshot().state;
        if (!drive.wantsRunning || state === 'off' || state === 'stopping') {
          s.demoMode = false;
          // The page may have been left, or the sound switched off, while the audio was starting.
          void drive.ensureAudio().then(() => {
            if (this.soundWanted && this.on) drive.start();
          });
        }
        drive.lock(rpm === 'idle' ? null : rpm);
        drive.setPedal(rpm === 'idle' ? 0 : throttle);
      },
      oilSupply(share) {
        s.features.systems.sim.oilSupply = share;
      },
      showFailure(part) {
        s.model?.setFailure(part);
      },
    };
  }

  /** Looks at the bottom half of the engine, where the oil is: the oil page's home view. */
  lookAtOil(): void {
    const stage = this.section.ctx.stage;
    const drop = 0.15 * stage.camera.position.distanceTo(stage.controls.target) * Math.tan((stage.camera.fov * Math.PI) / 360);
    stage.controls.target.y -= drop;
    stage.camera.position.y -= drop;
  }

  /** In and out of the page. */
  set(on: boolean): void {
    const s = this.section;
    const { stage, view, time, panels } = s.ctx;
    const { balance, systems, dyno } = s.features;
    this.on = on;
    document.body.classList.toggle('sump-mode', on);
    $('nav-sump').classList.toggle('current', on);
    for (const id of ['sump-host', 'sump-dash', 'sump-summary']) $(id).hidden = !on;
    if (on) {
      if (s.onDesigner) {
        s.designer?.page.leave();
        s.onDesigner = false;
        document.body.classList.remove('designer-mode');
        $('designer-host').hidden = true;
        $('results-panel').hidden = true;
        $('health').hidden = true;
        $('to-catalog').hidden = true;
      }
      $('nav-engines').classList.remove('current');
      $('nav-designer').classList.remove('current');
      $('article').hidden = true;
      $('variants').hidden = true;
      s.ctx.slots.panelTitle.textContent = t('Олива на треку');
      for (const id of ['prev', 'next', 'to-designer']) $(id).hidden = true;
      // The lap drives the engine through drive.lock, which a dyno load would fight.
      dyno?.setActive(false);
      this.forcesBefore = balance?.isOn ?? false;
      balance?.show(false);
      // The lap works the pedal and lets it go on leaving: a held pedal would come back showing a throttle the engine no longer gets.
      s.dash.pedal.letGo();
      s.drive.stop();
      this.viewBefore = view.mode;
      this.explodeBefore = s.explode;
      s.explode = 0;
      $<HTMLInputElement>('explode').value = '0';
      stage.fitScale = 0.6;
      // The oil stays in view: no slow orbit here.
      stage.setOrbit(false);
      view.set('xray');
      this.oilLayerBefore = systems.isOn('oil');
      if (!this.oilLayerBefore) systems.toggle('oil', false);
      panels.setOpen('right', window.innerWidth > 860);
    } else {
      this.page?.leave();
      this.soundWanted = false;
      s.drive.lock(time.mode === 'slow' ? s.slowRpm : null);
      // The next engine is built with these.
      view.set(this.viewBefore);
      s.explode = this.explodeBefore;
      $<HTMLInputElement>('explode').value = String(this.explodeBefore);
      systems.setExplode(this.explodeBefore);
      if (!this.oilLayerBefore && systems.isOn('oil')) systems.toggle('oil', false);
      systems.sim.oilSupply = 1;
      if (this.forcesBefore) balance?.show(true);
      $('article').hidden = false;
      for (const id of ['prev', 'next', 'to-designer']) $(id).hidden = false;
      stage.fitScale = 0.68;
      stage.setOrbit(!s.reducedMotion);
      $('nav-engines').classList.add('current');
    }
    // Space plays the lap here and the arrows move through it; the layer keys and the ignition stay off.
    s.useKeys();
    panels.relayout();
  }

  /** Each address of the page: loads its code the first time, then hands it the route. */
  enter(): void {
    void SUMP.load().then(({ SumpPage }) => {
      if (!this.on) return;
      if (!this.page) {
        this.page = new SumpPage(this.host);
        $('sump-host').append(this.page.panel);
        $('sump-dash').append(this.page.dash);
        $('sump-summary').append(this.page.summary, this.page.liveRegion);
      }
      this.page.enter(this.section.ctx.router.current);
      this.section.ctx.panels.relayout();
    });
  }
}
