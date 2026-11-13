// The engines section: the catalogue, the designer and the oil on track, with the dyno, the systems layers, the force
// arrows and the valve gear's labels on top. A thin dispatcher over those pages: what they share (the engine on stage,
// its sound, the dash and the frame) lives here.

import type { Drive } from '../../audio/drive.ts';
import type { Engine } from '../../engine/kinematics.ts';
import { liveScratch, liveTiming, type ValveState } from '../../engine/valve-control.ts';
import { plural, t } from '../../i18n/t.ts';
import type { EngineModel } from '../../scene/model-types.ts';
import { PistonEngineModel } from '../../scene/piston-engine.ts';
import { RotaryEngineModel } from '../../scene/rotary-engine.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import type { KeyBinding, PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import { readableDegreesPerSecond } from '../../shell/time.ts';
import { shownAdvance, type SystemsFrame } from '../../systems/sim.ts';
import { DesignerPage } from '../designer/designer-page.ts';
import { tableHtml } from '../table.ts';
import { CataloguePage } from './catalogue-page.ts';
import { EngineDash } from './dash.ts';
import { DesignerHost } from './designer-host.ts';
import { $ } from './dom.ts';
import { EngineFeatures } from './features.ts';
import { actionsHtml, afterDashHtml, badgeHtml, dashHtml, panelHtml, resultsHtml, SLOW_RPM_DEFAULT, statusHtml, tableHeadHtml, titleHtml, toolsHtml } from './markup.ts';
import { enginesPage, type EnginesPage } from './routes.ts';
import { SumpMode } from './sump-host.ts';

export class EnginesSection implements Section {
  readonly id = 'engines' as const;
  readonly solidLabel = t('Двигун');
  ctx!: SectionContext;
  engine!: Engine;
  drive!: Drive;
  model: EngineModel | null = null;
  dash!: EngineDash;
  features!: EngineFeatures;
  catalogue!: CataloguePage;
  designer!: DesignerHost;
  sump!: SumpMode;
  explode = 0;
  slowRpm = SLOW_RPM_DEFAULT;
  visualTheta = 0;
  /** Before the first start the mechanism turns gently so the page isn't dead on arrival. */
  demoMode = true;
  onDesigner = false;
  reducedMotion = false;
  private shake = 0.45;
  /** True while the audio thread is loading after the first press of the start button. */
  private starting = false;
  /** The freeze the camera has gone home for (see TimeControl.frozen). */
  private homedFor: FreezeOptions | null = null;
  /** Reused every frame: the systems step allocates nothing. */
  private readonly systemsFrame: SystemsFrame = { theta: 0, advance: 0, rpm: 0, load: 0, throttle: 0, boost: 0, running: false, cranking: false, fuelCut: true, live: false, dt: 0, timeScale: 1 };
  /** Valve events and firing cylinders for the systems layers, written in place each frame. */
  private readonly systemsTiming = liveScratch();
  private readonly systemsActive: boolean[] = [];
  private firingTextShown = '';
  private spectrumTextShown = '';

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    const { slots } = ctx;
    slots.backdrop.add(badgeHtml());
    slots.actions.add(actionsHtml());
    slots.title.add(titleHtml());
    slots.tools.add(toolsHtml());
    slots.status.add(statusHtml());
    slots.panel.add(panelHtml());
    slots.results.add(resultsHtml());
    slots.dash.add(dashHtml());
    slots.afterDash.add(afterDashHtml());
    slots.table.head.add(tableHeadHtml());
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.catalogue = new CataloguePage(this);
    this.engine = this.catalogue.resolveEngine();
    this.drive = ctx.audio.drive(this.engine);
    this.dash = new EngineDash(this);
    this.features = new EngineFeatures(this);
    this.designer = new DesignerHost(this);
    this.sump = new SumpMode(this);
    // The force card turns compact, grows or hides on its own schedule.
    const card = slots.root.querySelector<HTMLElement>('.forces-card');
    if (card) new ResizeObserver(() => this.catalogue.fitVariants()).observe(card);
    this.listen();
    this.bindKeys();
    this.catalogue.load(this.engine, false);
  }

  enter(_route: Route, from: Route | null): void {
    if (from === null || this.page() !== 'catalogue' || this.onDesigner || this.sump.on) {
      this.applyRoute();
      return;
    }
    this.catalogue.enter();
  }

  /** The page the address opens now. Read afresh, because leaving a page may rewrite the address in place. */
  private page(): EnginesPage {
    return enginesPage(this.ctx.router.current);
  }

  leave(_to: Route): void {
    // Nothing else to switch to yet: this keeps the sound and the pages' timers from running behind another section.
    this.features.dyno.setActive(false);
    this.drive.stop();
    if (this.onDesigner) this.designer.page.leave();
    if (this.sump.on) this.sump.page?.leave();
    this.ctx.keys.use([]);
  }

  layout({ width }: Viewport): PanelSizes {
    const narrowDesk = width < 1500;
    return {
      right: this.onDesigner ? (narrowDesk ? 360 : 420) : 400,
      left: this.onDesigner ? (narrowDesk ? 300 : 340) : 0,
      dash: this.sump.on ? $('sump-dash').offsetHeight : $('tacho-wrap').parentElement!.offsetHeight,
      rightLabel: this.onDesigner ? t('Параметри') : this.sump.on ? t('Налаштування') : t('Про двигун'),
    };
  }

  laidOut(): void {
    const fb = $('firing-body');
    this.dash.firing.resize(fb.clientWidth, fb.clientHeight);
    const sb = $('spectrum-body');
    this.dash.spectrum.resize(sb.clientWidth, sb.clientHeight);
    if (this.sump.on) this.sump.page?.resize();
    this.catalogue.fitVariants();
  }

  time(): TimeCapabilities {
    const modes = ['slow', 'readable', 'real'] as const;
    // Slow motion locks the crank at walking pace, where no absorber can work.
    if (this.features.dyno.isActive) return { modes, unavailable: { slow: t('Стенд не працює на {rpm} об/хв', { rpm: this.slowRpm }) } };
    return { modes };
  }

  /** Everything drawn from the engine's geometry. Shared by the catalogue, the designer and the oil page. */
  showEngine(next: Engine, keepCamera: boolean): void {
    this.engine = next;
    const spec = next.spec;
    const { stage, view, slots } = this.ctx;
    const { balance, systems, dyno, valves } = this.features;
    const newModel: EngineModel = next.isRotary ? new RotaryEngineModel(next) : new PistonEngineModel(next);
    // A rotary explains itself from the front, a piston engine from a three-quarter view.
    // The same scale for a whole page, or for a design as its sliders move, so that size can be seen.
    const onSump = this.sump.on;
    stage.setModel(newModel, next.isRotary ? [0.34, 0.22, 1] : onSump ? [0.95, 0.1, 0.7] : undefined, keepCamera, true, this.onDesigner || onSump ? 1 : this.catalogue.pageFrameScale(next));
    this.model = newModel;
    newModel.setView(view.mode);
    newModel.setExplode(this.explode);
    balance.setEngine(next, newModel, this.onDesigner);
    systems.attach(next, newModel);
    dyno.attachModel(newModel);
    this.dash.configure(spec.redlineRpm);
    this.designer.applyZones();
    this.dash.firing.setEngine(next);
    this.dash.firing.setInactive([]);
    valves.setEngine(spec);
    $('badge').textContent = spec.badge;
    $('badge').style.setProperty('--badge-fit', String(spec.badge.length > 2 ? 0.46 : 0.62));
    slots.partCard.hidden = true;
  }

  setPanel(open: boolean): void {
    this.ctx.panels.setOpen('right', open);
    this.ctx.panels.relayout();
  }

  async toggleIgnition(): Promise<void> {
    const state = this.drive.snapshot().state;
    const ignition = this.dash.ignition;
    if (state === 'running' || state === 'cranking') {
      this.features.dyno.abort('stopped');
      this.drive.stop();
      ignition.show(false);
      return;
    }
    this.demoMode = false;
    this.starting = true;
    $('wreck').hidden = true;
    if (this.onDesigner && this.designer.page.isBroken) this.designer.page.repair();
    ignition.show(true);
    await this.drive.ensureAudio();
    this.drive.start();
    this.starting = false;
    if (this.drive.audioFailed) {
      $('spectrum-text').textContent = t('звук недоступний у цьому браузері');
    }
  }

  /** Touching the pedal on a silent engine also starts it, which is what people try first. */
  async pressThrottle(): Promise<void> {
    const state = this.drive.snapshot().state;
    if (state === 'off' || state === 'stopping') await this.toggleIgnition();
  }

  /** Switches the panels and the engine between the catalogue, the designer and the oil page. */
  private applyRoute(): void {
    const { stage, panels, slots, router } = this.ctx;
    const wantsSump = this.page() === 'sump';
    if (wantsSump !== this.sump.on) {
      this.sump.set(wantsSump);
      if (!wantsSump && this.page() !== 'designer') {
        this.catalogue.load(this.catalogue.resolveEngine(), true);
        slots.table.open(false);
      }
    }
    if (wantsSump) {
      slots.table.open(false);
      this.sump.enter();
      return;
    }
    const wantsDesigner = this.page() === 'designer';
    const small = window.innerWidth <= 860;
    if (wantsDesigner !== this.onDesigner) {
      const on = wantsDesigner;
      this.onDesigner = on;
      document.body.classList.toggle('designer-mode', on);
      stage.fitScale = on ? 0.82 : 0.68;
      $('nav-engines').classList.toggle('current', !on);
      $('nav-designer').classList.toggle('current', on);
      $('article').hidden = on;
      $('designer-host').hidden = !on;
      $('results-panel').hidden = !on;
      for (const id of ['prev', 'next', 'to-designer']) $(id).hidden = on;
      if (on) $('variants').hidden = true;
      $('health').hidden = !on;
      $('strain').hidden = true;
      $('to-catalog').hidden = !on;
      $('wreck').hidden = true;
      if (on) {
        panels.setOpen('right', !small);
        panels.setOpen('left', !small);
        slots.panelTitle.textContent = t('Конструкція');
        slots.table.body.innerHTML = tableHtml('');
      } else {
        this.designer.page.leave();
        panels.setOpen('right', !small);
        this.catalogue.load(this.catalogue.resolveEngine(), true);
      }
      panels.relayout();
    }
    if (this.onDesigner) {
      this.designer.page.enter(DesignerPage.designFromRoute(router.current));
      this.designer.syncHeading();
      slots.table.open(false);
    }
  }

  /** The tools under the stage and the pages' own clicks. */
  private listen(): void {
    const { view, time, slots } = this.ctx;
    view.onChange((mode) => {
      this.model?.setView(mode);
      this.features.systems.setView(mode);
      this.features.dyno.setView(mode);
    });
    time.onChange((mode) => {
      $('slow-tool').hidden = mode !== 'slow';
      this.drive.lock(mode === 'slow' ? this.slowRpm : null);
    });
    $<HTMLInputElement>('slow-rpm').addEventListener('input', (event) => {
      this.slowRpm = Number((event.target as HTMLInputElement).value);
      $('slow-value').textContent = String(this.slowRpm);
      if (time.mode === 'slow') this.drive.lock(this.slowRpm);
    });
    $<HTMLInputElement>('explode').addEventListener('input', (event) => {
      this.explode = Number((event.target as HTMLInputElement).value);
      this.model?.setExplode(this.explode);
      this.features.systems.setExplode(this.explode);
      this.features.dyno.setExplode(this.explode);
    });
    $<HTMLInputElement>('shake').addEventListener('change', (event) => {
      this.shake = (event.target as HTMLInputElement).checked ? 2.6 : 0.45;
    });
    // The article can switch the force arrows on; a phone then needs the sheet out of the way.
    $('article').addEventListener('click', (event) => {
      if (!(event.target as HTMLElement).closest('[data-show-forces]')) return;
      this.features.balance.show(true);
      if (window.innerWidth <= 860) this.setPanel(false);
    });
    $('open-table').addEventListener('click', () => slots.table.open(true));
  }

  private bindKeys(): void {
    const { keys, slots } = this.ctx;
    const pedal = this.dash.pedal;
    const gas: Pick<KeyBinding, 'label' | 'down' | 'up'> = {
      label: t('Газ'),
      down: (event) => {
        event.preventDefault();
        if (event.repeat) return;
        pedal.holdKey(true);
        (document.activeElement as HTMLElement | null)?.blur?.();
        void this.pressThrottle();
      },
      up: (event) => {
        event.preventDefault();
        pedal.holdKey(false);
      },
    };
    const layer = (code: string, id: 'oil' | 'coolant' | 'fuel' | 'air', label: string): KeyBinding => ({
      codes: [code],
      label,
      down: () => {
        this.features.systems.toggle(id);
      },
    });
    keys.bind('engines', [
      // Space works on a slider too: it is the gas wherever the visitor is.
      { codes: ['Space'], reach: 'controls', ...gas },
      { codes: ['ArrowUp'], ...gas },
      { codes: ['KeyS'], label: t('Запустити двигун'), down: () => void this.toggleIgnition() },
      {
        codes: ['ArrowLeft'],
        label: t('Попередній двигун'),
        down: () => {
          if (!this.onDesigner) this.catalogue.step(-1);
        },
      },
      {
        codes: ['ArrowRight'],
        label: t('Наступний двигун'),
        down: () => {
          if (!this.onDesigner) this.catalogue.step(1);
        },
      },
      { codes: ['KeyT'], label: t('Усі двигуни'), down: () => slots.table.open(true) },
      { codes: ['KeyM'], label: t('Вимкнути звук'), down: () => this.dash.toggleMute() },
      layer('Digit4', 'oil', t('Олива')),
      layer('Digit5', 'coolant', t('Охолодження')),
      layer('Digit6', 'fuel', t('Паливо')),
      layer('Digit7', 'air', t('Повітря')),
    ]);
    // The oil page plays its lap with Space and moves through it with the arrows; its engine is the lap's to drive.
    const lap = (event: KeyboardEvent): boolean => {
      const page = this.sump.page;
      if (!page || !page.key(event)) return false;
      event.preventDefault();
      return true;
    };
    const digits = Array.from({ length: 10 }, (_, i) => `Digit${i}`);
    keys.bind('engines/sump', [
      { codes: ['Space'], label: t('Поїхали або пауза'), down: lap },
      { codes: ['ArrowLeft', 'ArrowRight'], label: t('На 5 с назад або вперед'), down: lap },
      { codes: [...digits, 'KeyS'], label: null, down: lap },
    ]);
    keys.use(['engines']);
  }

  frame(dt: number): void {
    this.dash.pedal.frame(dt);
    const { stage, time } = this.ctx;
    const frozen = time.frozen;
    const drive = this.drive;
    const snap = this.ctx.audio.snapshot!;
    const spec = this.engine.spec;
    const running = snap.state === 'running';
    const sump = this.sump;
    const { balance, systems, dyno, valves } = this.features;
    const lap = sump.on && sump.page?.isActive ? sump.page.frame(dt) : null;
    if (lap) {
      // The oil layer's own flat surface gives way to the page's sloshing oil.
      const layer = systems.sceneLayers?.layer('oil') ?? null;
      if (layer && layer !== sump.flattenedLayer) {
        layer.setOilSurface(-1000, 0, 0);
        sump.flattenedLayer = layer;
      }
    }

    let theta: number;
    let shownSpeed: number;
    let shownRunning = running;
    let shownLoad = snap.load;
    let shownCut = snap.fuelCut;
    if (lap) {
      shownSpeed = this.reducedMotion ? 0 : this.readable(lap.rpm);
      this.visualTheta = (this.visualTheta + shownSpeed * dt) % this.engine.cycle;
      theta = this.visualTheta;
      shownRunning = true;
      shownLoad = lap.throttle;
      shownCut = lap.throttle < 0.02;
    } else if (this.demoMode) {
      // Before the first start the mechanism turns gently so the page isn't dead on arrival.
      shownSpeed = this.reducedMotion ? 0 : 30 * 6;
      this.visualTheta = (this.visualTheta + shownSpeed * dt) % this.engine.cycle;
      theta = this.visualTheta;
      shownRunning = true;
      shownLoad = 0.35;
      shownCut = false;
    } else if (time.mode === 'readable') {
      shownSpeed = snap.state === 'off' ? 0 : this.readable(snap.rpm);
      this.visualTheta = (this.visualTheta + shownSpeed * dt) % this.engine.cycle;
      theta = this.visualTheta;
    } else {
      shownSpeed = snap.rpm * 6;
      theta = snap.angle;
      this.visualTheta = theta;
    }
    if (frozen) {
      const cycle = this.engine.cycle;
      theta = ((frozen.theta % cycle) + cycle) % cycle;
      this.visualTheta = theta;
    }

    const demo = this.demoMode;
    this.model?.update({
      theta,
      rpm: lap ? lap.rpm : demo ? spec.idleRpm : snap.rpm,
      load: shownLoad,
      fuelCut: shownCut,
      running: shownRunning,
      boost: snap.boost,
      dt,
      held: frozen !== null,
      shake: demo ? 0 : this.shake,
      valves: demo ? undefined : snap.valves,
    });
    balance.frame(theta, demo ? spec.idleRpm : snap.rpm);
    // The systems are worked out at idle in the demo and in slow motion: at 40 rpm oil would barely flow at all.
    const slowed = !lap && (demo || time.mode === 'slow');
    const systemsRpm = lap ? lap.rpm : slowed && shownRunning ? spec.idleRpm : snap.rpm;
    const sf = this.systemsFrame;
    // How far the shown angle really moved: in real mode Drive keeps nudging it toward the audio thread's angle.
    sf.advance = frozen ? 0 : shownAdvance(sf.theta, theta, shownSpeed * dt, this.engine.cycle);
    sf.theta = theta;
    sf.rpm = systemsRpm;
    sf.load = shownLoad;
    sf.throttle = snap.throttle;
    sf.boost = snap.boost;
    sf.running = shownRunning;
    sf.cranking = snap.state === 'cranking';
    sf.fuelCut = shownCut;
    sf.live = !slowed && !lap;
    sf.demo = demo;
    sf.dt = dt;
    sf.hold = frozen?.time;
    sf.timeScale = Math.min(1, shownSpeed / Math.max(systemsRpm * 6, 1));
    this.systemsValves(sf, demo ? undefined : snap.valves);
    systems.frame(sf);
    dyno.frame(snap, theta, dt);
    if (!frozen) {
      this.homedFor = null;
    } else if (frozen !== this.homedFor) {
      // The camera is framed on the model as it now stands, at the frozen angle: framed on the pose freeze() was called
      // in, it would depend on where the crank happened to stop.
      this.homedFor = frozen;
      stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
      if (sump.on) sump.lookAtOil();
    }

    const { tacho, firing, spectrum, ignition } = this.dash;
    tacho.update(snap.rpm, running && snap.fuelCut && snap.rpm > spec.redlineRpm - 200);
    if (this.onDesigner) this.designer.page.frame(snap.rpm, running, snap.load, dt, snap.valves);
    valves.withhold(sump.on && !running);
    valves.update(snap.valves, running && !demo);
    firing.setInactive(running ? (snap.valves?.off ?? []) : []);
    firing.draw(theta);

    // Resting cylinders don't fire: the firing tone drops with them.
    const firesPerSecond = (((snap.rpm / 60) * 720 * spec.cylinders) / 720 / 2) * (running ? (snap.valves?.active ?? 1) : 1);
    const rotaryFires = (snap.rpm / 60) * spec.cylinders;
    const firingHz = this.engine.isRotary ? rotaryFires : firesPerSecond;
    spectrum.draw(drive.audioReady ? drive.analyser : null, drive.sampleRate, snap.state === 'off' ? 0 : firingHz);
    const fires = Math.round(firingHz);
    const firingText =
      snap.state === 'off' ? '' : plural(fires, { one: t('{count} спалах за секунду', { count: fires }), few: t('{count} спалахи за секунду', { count: fires }), many: t('{count} спалахів за секунду', { count: fires }) });
    if (firingText !== this.firingTextShown) {
      $('firing-text').textContent = firingText;
      this.firingTextShown = firingText;
    }
    const spectrumText = snap.state === 'off' || drive.audioFailed ? (drive.audioFailed ? t('звук недоступний') : '') : t('основний тон {hz} Гц', { hz: Math.round(firingHz) });
    if (spectrumText !== this.spectrumTextShown) {
      $('spectrum-text').textContent = spectrumText;
      this.spectrumTextShown = spectrumText;
    }

    const shouldBeOn = snap.state === 'running' || snap.state === 'cranking';
    if (shouldBeOn !== ignition.on && !demo && !this.starting) ignition.show(shouldBeOn);
  }

  /** How fast the crank turns on screen in the readable mode. */
  private readable(rpm: number): number {
    const spec = this.engine.spec;
    return readableDegreesPerSecond(rpm, spec.idleRpm, spec.redlineRpm);
  }

  /** Where the valve gear has moved the events and which cylinders rest, so the fuel and air layers follow it. */
  private systemsValves(sf: SystemsFrame, valves: ValveState | undefined): void {
    const engine = this.engine;
    const vvt = engine.spec.vvt;
    if (!valves || !vvt) {
      sf.timing = undefined;
      sf.active = undefined;
      return;
    }
    sf.timing = liveTiming(engine.timing, vvt, valves, this.systemsTiming).timing;
    const cylinders = engine.cylinders;
    this.systemsActive.length = cylinders.length;
    // Resting cylinders get neither fuel nor a spark, whether their valves stay shut or only the fuel is cut.
    for (let i = 0; i < cylinders.length; i++) this.systemsActive[i] = !valves.off.includes(cylinders[i]!.n);
    sf.active = this.systemsActive;
  }
}
