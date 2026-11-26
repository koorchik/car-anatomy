// The gearbox section (stage K1b): `#/gearboxes/<page>`, so far the manual layshaft box of the BMW M3 E30 on the table.
// The car's engine runs on its free path (the shared Drive, no load) and turns the input shaft; the output turns free;
// the buttons pick N, the forward speeds and R, and the sleeves travel in 0.2 s (TableDrive). Beside it the article,
// the settings panel (owner decision A3) and demonstration 1.
//
// Time: the real mode turns the input at the engine's revs, the readable mode slows the whole box by one factor
// (readableDegreesPerSecond, so every member stays in mesh), slow motion holds the crank at walking pace through
// Drive.lock, as on the engine pages. Before the engine is first started the box turns as at idle, so the page is not
// dead on arrival. There are no keys of its own yet: they come with the drive mode through the KeyMap.

import * as THREE from 'three';
import type { Drive } from '../../audio/drive.ts';
import { CARS } from '../../data/cars.ts';
import { driveCarById } from '../../data/drive-cars.ts';
import { engineById, engineFacts } from '../../data/engines.ts';
import { GEARBOX_PAGES } from '../../data/gearboxes.ts';
import type { GearboxPage } from '../../drivetrain/catalogue.ts';
import type { LayshaftDesc } from '../../drivetrain/layouts/layshaft.ts';
import { speedRatios } from '../../drivetrain/layouts/layshaft-setup.ts';
import { layshaftSpec } from '../../drivetrain/layouts/layshaft.ts';
import { TableDrive } from '../../drivetrain/table-drive.ts';
import { buildGearbox, type Gearbox } from '../../drivetrain/topology.ts';
import { buildEngine, type Engine } from '../../engine/kinematics.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { GearboxModel } from '../../scene/gearbox/gearbox-model.ts';
import { GEARBOX_PARTS } from '../../scene/gearbox/parts.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import { readableDegreesPerSecond } from '../../shell/time.ts';
import { parseTyreSize, rollingRadiusM } from '../../vehicle/tyre-size.ts';
import { Ignition } from '../widgets/ignition.ts';
import { Pedal } from '../widgets/pedal.ts';
import { Tacho } from '../widgets/tacho.ts';
import { gearboxArticleHtml } from './article.ts';
import { alwaysTurningSteps, type DemoStep } from './demo.ts';
import { GEARBOX_PAGES_SHOWN } from './load.ts';
import { dashHtml, panelHtml, resultsHtml, SLOW_RPM_DEFAULT, statusHtml, SVG_SOUND_OFF, SVG_SOUND_ON, titleHtml, toolsHtml } from './markup.ts';
import { SetupPanel } from './setup-panel.ts';
import '../engines/engines.css';
import './gearboxes.css';

const PHONE = 860;
/** Below this width a desktop has no room for both side panels and the stage: the settings open in place of the article. */
const BOTH_PANELS = 1200;
/** The model is rebuilt from the panel at most this often, s: the numbers follow every move, the gears a beat later. */
const REBUILD_S = 0.12;
/** The view from the model toward the camera: from the front left and above, so the gear stack shows along its length. */
const HOME: [number, number, number] = [-0.95, 0.5, 0.75];
const DEMO_ID = 'always-turning';
/** How far the camera stands back from the box's bounding sphere (Stage.fitScale): a long box leaves room at its sides. */
const FIT = 0.8;
const FIT_PHONE = 0.88;
/** The gear a demonstration step points at. */
const MARK = '#ffd27a';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Everything a page needs that does not change with the panel. */
interface PageData {
  page: GearboxPage;
  factory: LayshaftDesc;
  finalDrive: number;
  engine: Engine;
  radiusM: number;
  tyre: string;
}

export class GearboxSection implements Section {
  readonly id = 'gearboxes' as const;
  readonly solidLabel = t('Коробка');
  private ctx!: SectionContext;
  private root!: HTMLElement;
  private data!: PageData;
  private box!: Gearbox;
  /** The description the box was built from: a panel change that keeps it (the final drive) leaves the box alone. */
  private desc!: LayshaftDesc;
  private table!: TableDrive;
  private model: GearboxModel | null = null;
  /** The settings panel of the page shown. */
  setup!: SetupPanel;
  private tacho!: Tacho;
  private pedal!: Pedal;
  private ignition!: Ignition;
  private away = false;
  /** The box was changed on the panel and its model waits to be rebuilt. */
  private rebuildDue = false;
  private sinceRebuild = 0;
  /** Before the first start the box turns as at idle. */
  private demoMode = true;
  private starting = false;
  private slowRpm = SLOW_RPM_DEFAULT;
  private explode = 0;
  private glow = true;
  private volume = 0.8;
  private muted = false;
  private homedFor: FreezeOptions | null = null;
  /** The glowing shell over the gear a demonstration step is about, and that gear. */
  private marker: THREE.Mesh | null = null;
  private markerMaterial: THREE.MeshBasicMaterial | null = null;
  private markedGear: string | null = null;
  private demo: { steps: DemoStep[]; at: number } | null = null;
  /** Skeleton texts and states this section changes while it is shown, to give back on leave. */
  private readonly lent = new Map<HTMLElement, { text?: string; hidden?: boolean }>();
  private fitScaleBefore = 0.68;
  /** The --tools-h the page had before this section measured its own row, to give back on leave. */
  private toolsHBefore = '';
  /** Last texts of the readouts, so the DOM is touched only when they change. */
  private shown = { input: '', output: '', gear: '', note: '' };
  /** What the readouts were last built from: the texts are built only when it changes, not every frame. */
  private readoutsFor = { rpm: NaN, engaged: '', selected: '', box: null as Gearbox | null };
  private readonly unlit = { angles: [] as ArrayLike<number>, sleeves: {} as Readonly<Record<string, number>>, meshPower: [] as number[] };

  /** The one Drive of the site, as this section uses it. */
  get drive(): Drive {
    return this.ctx.audio.drive(this.data.engine);
  }

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    this.root = ctx.slots.root;
    registerParts(GEARBOX_PARTS);
    const { slots } = ctx;
    slots.title.add(titleHtml());
    slots.tools.add(toolsHtml());
    slots.status.add(statusHtml());
    slots.panel.add(panelHtml());
    slots.results.add(resultsHtml());
    slots.dash.add(dashHtml());
    this.data = this.pageData(this.pageId(ctx.router.current) ?? GEARBOX_PAGES_SHOWN[0]!);

    const drive = ctx.audio.drive(this.data.engine);
    drive.setEngine(this.data.engine);
    this.tacho = new Tacho();
    this.el('gbx-tacho').append(this.tacho.element);
    this.tacho.configure(this.data.engine.spec.redlineRpm);
    this.pedal = new Pedal(this.el('gbx-pedal-col'), { setThrottle: (value) => this.drive.setPedal(value), press: () => void this.pressThrottle() });
    this.ignition = new Ignition(this.el('gbx-control'), () => void this.toggleIgnition());
    this.listen();
    // The row of view tools wraps on a phone and in the longer language; the first-visit callout and the scale bar stand
    // above it through --tools-h, which on the engine pages their systems view measures.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.measureTools()).observe(slots.tools.parent);
    this.showPage();
    this.present();
  }

  enter(route: Route, from: Route | null): void {
    if (this.away) this.resume();
    const id = this.pageId(route);
    if (!id) {
      // An address of a page not built yet, or of none: the first page, with the address saying so.
      this.ctx.router.replace({ section: 'gearboxes', page: 'catalogue', path: [GEARBOX_PAGES_SHOWN[0]!] });
    } else if (id !== this.data.page.id) {
      this.data = this.pageData(id);
      this.showPage();
      this.present();
    }
    if (from === null || route.query.demo !== from.query.demo) {
      if (route.query.demo === DEMO_ID) this.startDemo();
      else if (this.demo) this.closeDemo();
    }
  }

  leave(): void {
    this.away = true;
    this.closeDemo();
    this.pedal.reset();
    const drive = this.drive;
    drive.lock(null);
    drive.stop();
    this.ctx.keys.use([]);
    this.ctx.slots.partCard.hidden = true;
    this.ctx.stage.fitScale = this.fitScaleBefore;
    // The next section puts its own model on the stage, which disposes this one.
    this.model = null;
    for (const [el, was] of this.lent) {
      if (was.text !== undefined) el.textContent = was.text;
      if (was.hidden !== undefined) el.hidden = was.hidden;
    }
    this.lent.clear();
    const root = document.documentElement.style;
    if (this.toolsHBefore) root.setProperty('--tools-h', this.toolsHBefore);
    else root.removeProperty('--tools-h');
  }

  private resume(): void {
    this.away = false;
    this.drive.setEngine(this.data.engine);
    this.present();
  }

  layout({ width }: Viewport): PanelSizes {
    const narrow = width < 1500;
    return {
      right: narrow ? 360 : 400,
      left: narrow ? 300 : 340,
      dash: this.ctx.slots.dash.parent.offsetHeight,
      rightLabel: t('Про коробку'),
    };
  }

  time(): TimeCapabilities {
    return { modes: ['slow', 'readable', 'real'] };
  }

  // ---- The page ----

  /** The page an address asks for, if it is one built so far. */
  private pageId(route: Route): string | null {
    // The gearbox designer's address (#/gearboxes/designer) comes with its own stage.
    if (route.page !== 'catalogue') return null;
    const id = route.path[0] ?? GEARBOX_PAGES_SHOWN[0]!;
    // The planetary automatic has a page of its own (pages.ts).
    return GEARBOX_PAGES_SHOWN.includes(id) && GEARBOX_PAGES.some((p) => p.id === id && p.base.layout.kind !== 'planetary') ? id : null;
  }

  private pageData(id: string): PageData {
    const page = GEARBOX_PAGES.find((p) => p.id === id)!;
    const record = page.base;
    if (record.layout.kind !== 'layshaft') throw new Error(`${id}: the table shows layshaft boxes so far`);
    const car = record.car ? CARS[record.car] : undefined;
    const spec = car ? engineById(car.engine) : undefined;
    if (!car || !spec) throw new Error(`${id}: the page needs its car and the car's engine`);
    const driveCar = driveCarById(car.id);
    if (!driveCar) throw new Error(`${id}: the page needs the drive record of ${car.id} for its final drive`);
    const size = parseTyreSize(car.tyre.size);
    return {
      page,
      factory: record.layout.desc,
      finalDrive: driveCar.finalDrive.ratio,
      engine: buildEngine(spec),
      radiusM: rollingRadiusM(size),
      tyre: car.tyre.size,
    };
  }

  /** What a page shows that the panel does not change: its title, article and settings, and the factory box. */
  private showPage(): void {
    const d = this.data;
    const record = d.page.base;
    const car = record.car ? CARS[record.car]! : null;
    const facts = car ? engineFacts(car.engine) : undefined;
    const engineName = facts?.engineCode ? facts.engineCode : d.engine.spec.example;
    this.el('gbx-title').textContent = t('Механічна коробка з проміжним валом');
    this.el('gbx-sub').innerHTML = car
      ? t('{gearbox} · на авто {car} · {engine}', {
          gearbox: record.name,
          car: car.name,
          engine: `<a href="#/engines/${car.engine}">${t('двигун {name}, {hp} к.с.', { name: engineName, hp: num(facts?.powerHp ?? 0) })}</a>`,
        })
      : record.name;
    // A new panel in a fresh element: the last page's panel leaves with its listeners.
    const host = this.el('gbx-setup');
    const fresh = host.cloneNode(false) as HTMLElement;
    host.replaceWith(fresh);
    this.setup = new SetupPanel(
      fresh,
      {
        factory: d.factory,
        factoryFinal: d.finalDrive,
        radiusM: d.radiusM,
        tyre: d.tyre,
        redlineRpm: d.engine.spec.redlineRpm,
        reverse: this.reverseRatio(d.factory),
      },
      (_setup, desc) => this.boxChanged(desc),
    );
    this.el('gbx-article').innerHTML = gearboxArticleHtml({
      page: d.page,
      car,
      ratios: speedRatios(d.factory),
      reverse: this.reverseRatio(d.factory),
      finalDrive: d.finalDrive,
      engine: car ? { href: `#/engines/${car.engine}`, name: engineName, powerHp: facts?.powerHp ?? null } : null,
      rollingRadiusMm: d.radiusM * 1000,
    });
    this.desc = d.factory;
    this.box = buildGearbox(layshaftSpec(d.factory));
    this.table = new TableDrive(this.box, 'N');
    this.renderGears();
  }

  /** The section on screen: the skeleton's labels for this page, the model on the stage, the panels, time and keys. */
  private present(): void {
    const { slots, view, time, panels, stage } = this.ctx;
    this.lend('#results-open', t('Налаштувати'));
    this.lend('.results-head h2', t('Налаштувати'));
    this.lend('#panel-toggle-closed', t('Про коробку'));
    this.lendHidden('#results-panel', false);
    this.lendHidden('#hint', true);
    slots.panelTitle.textContent = t('Про коробку');
    document.title = t('{title}. Анатомія авто', { title: t('Механічна коробка з проміжним валом') });
    this.fitScaleBefore = stage.fitScale;
    this.toolsHBefore = document.documentElement.style.getPropertyValue('--tools-h');
    this.measureTools();
    this.buildModel(false);
    this.model?.setView(view.mode);
    this.el('gbx-slow-tool').hidden = time.mode !== 'slow';
    this.drive.lock(time.mode === 'slow' ? this.slowRpm : null);
    const small = window.innerWidth <= PHONE;
    panels.setOpen('right', !small);
    panels.setOpen('left', !small && window.innerWidth >= BOTH_PANELS);
    panels.relayout();
    this.ctx.keys.use(['gearboxes']);
  }

  /** The height the row of view tools takes above the dash, for what stands over it (--tools-h). */
  private measureTools(): void {
    if (this.away) return;
    const row = this.ctx.slots.tools.parent;
    if (!row.offsetHeight) return;
    const style = getComputedStyle(row);
    const above = parseFloat(style.bottom) - parseFloat(style.getPropertyValue('--dash-h'));
    document.documentElement.style.setProperty('--tools-h', `${Math.round(row.offsetHeight + (Number.isFinite(above) ? above : 12))}px`);
  }

  /** Overall reverse of a description, the magnitude. */
  private reverseRatio(desc: LayshaftDesc): number | null {
    const r = desc.reverse;
    return r ? (desc.main.teeth[1] / desc.main.teeth[0]) * (r.teeth[2] / r.teeth[0]) : null;
  }

  /** A box from the panel: the numbers now, the model on the next rebuild. */
  private boxChanged(desc: LayshaftDesc): void {
    if (desc === this.desc) return;
    this.desc = desc;
    const box = buildGearbox(layshaftSpec(desc));
    // Another speed count has other members: the old model cannot draw the new pose, so it goes on the next frame.
    const sameMembers = box.members.length === this.box.members.length && box.meshes.length === this.box.meshes.length;
    this.box = box;
    const gear = this.table.selected;
    const table = new TableDrive(box, box.states.some((s) => s.name === gear) ? gear : 'N');
    table.continueFrom(this.table);
    this.table = table;
    this.renderGears();
    this.rebuildDue = true;
    if (!sameMembers) this.sinceRebuild = REBUILD_S;
    if (this.demo) this.demo.steps = alwaysTurningSteps(box, this.data.engine.spec.idleRpm);
    this.showDemoStep();
  }

  private buildModel(keepCamera: boolean): void {
    const model = new GearboxModel(this.box, { quality: window.innerWidth <= PHONE ? 'low' : 'high' });
    this.ctx.stage.setModel(model, { home: HOME, keepCamera, keepScale: keepCamera, fitScale: window.innerWidth <= PHONE ? FIT_PHONE : FIT });
    this.model = model;
    model.setView(this.ctx.view.mode);
    model.setExplode(this.explode);
    this.rebuildDue = false;
    this.sinceRebuild = 0;
    this.ctx.slots.partCard.hidden = true;
    if (this.markedGear) this.mark(this.markedGear);
  }


  /** The gear buttons: R, N and every forward speed of the box. */
  private renderGears(): void {
    const names = ['R', 'N', ...this.box.states.filter((s) => s.kind === 'gear' && s.name !== 'R').map((s) => s.name)];
    const selected = this.table.selected;
    this.el('gbx-gears').innerHTML = names
      .filter((name) => name === 'N' || this.box.states.some((s) => s.name === name))
      .map((name) => `<button type="button" data-gear="${name}" aria-pressed="${name === selected}">${name}</button>`)
      .join('');
  }

  private selectGear(name: string): void {
    this.table.select(name);
    for (const button of this.el('gbx-gears').querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.gear === name));
  }

  // ---- Controls ----

  private listen(): void {
    const { view, time } = this.ctx;
    view.onChange((mode) => {
      if (!this.away) this.model?.setView(mode);
    });
    time.onChange((mode) => {
      if (this.away) return;
      this.el('gbx-slow-tool').hidden = mode !== 'slow';
      this.drive.lock(mode === 'slow' ? this.slowRpm : null);
    });
    this.el('gbx-gears').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-gear]');
      if (button) this.selectGear(button.dataset.gear!);
    });
    this.el<HTMLInputElement>('gbx-slow-rpm').addEventListener('input', (event) => {
      this.slowRpm = Number((event.target as HTMLInputElement).value);
      this.el('gbx-slow-value').textContent = String(this.slowRpm);
      if (time.mode === 'slow') this.drive.lock(this.slowRpm);
    });
    this.el<HTMLInputElement>('gbx-explode').addEventListener('input', (event) => {
      this.explode = Number((event.target as HTMLInputElement).value);
      this.model?.setExplode(this.explode);
    });
    this.el<HTMLInputElement>('gbx-glow').addEventListener('change', (event) => {
      this.glow = (event.target as HTMLInputElement).checked;
    });
    this.el<HTMLInputElement>('gbx-volume').addEventListener('input', (event) => {
      this.volume = Number((event.target as HTMLInputElement).value);
      this.muted = this.volume === 0;
      this.syncSound();
    });
    this.el('gbx-mute').addEventListener('click', () => {
      this.muted = !this.muted;
      this.syncSound();
    });
    this.el('gbx-setup-toggle').addEventListener('click', () => this.toggleSetup());
    this.el('gbx-demo-open').addEventListener('click', () => this.routeDemo(true));
    this.el('gbx-article').addEventListener('click', (event) => {
      if (!(event.target as HTMLElement).closest('[data-demo]')) return;
      if (window.innerWidth <= PHONE) {
        this.ctx.panels.setOpen('right', false);
        this.ctx.panels.relayout();
      }
      this.routeDemo(true);
    });
    this.el('gbx-demo-close').addEventListener('click', () => this.routeDemo(false));
    this.el('gbx-demo-prev').addEventListener('click', () => this.stepDemo(-1));
    this.el('gbx-demo-next').addEventListener('click', () => this.stepDemo(1));
  }

  private toggleSetup(): void {
    const { panels } = this.ctx;
    const open = !panels.isOpen('left');
    panels.setOpen('left', open);
    // A narrow desktop has room for one side panel beside the stage.
    if (open && window.innerWidth < BOTH_PANELS) panels.setOpen('right', false);
    panels.relayout();
  }

  private syncSound(): void {
    this.drive.setVolume(this.volume, this.muted);
    const button = this.el('gbx-mute');
    button.innerHTML = this.muted ? SVG_SOUND_OFF : SVG_SOUND_ON;
    button.setAttribute('aria-pressed', String(this.muted));
    button.setAttribute('aria-label', this.muted ? t('Увімкнути звук') : t('Вимкнути звук'));
  }

  private async toggleIgnition(): Promise<void> {
    const drive = this.drive;
    const state = drive.snapshot().state;
    if (state === 'running' || state === 'cranking') {
      drive.stop();
      this.ignition.show(false);
      return;
    }
    this.demoMode = false;
    this.starting = true;
    this.ignition.show(true);
    await drive.ensureAudio();
    drive.start();
    this.starting = false;
  }

  private async pressThrottle(): Promise<void> {
    const state = this.drive.snapshot().state;
    if (state === 'off' || state === 'stopping') await this.toggleIgnition();
  }

  // ---- Demonstration 1 ----

  /** Opens or closes the demonstration through the address, which then calls enter(). */
  private routeDemo(on: boolean): void {
    this.ctx.router.replace({ query: { demo: on ? DEMO_ID : null } });
    if (on) this.startDemo();
    else this.closeDemo();
  }

  private startDemo(): void {
    this.demo = { steps: alwaysTurningSteps(this.box, this.data.engine.spec.idleRpm), at: 0 };
    this.el('gbx-demo').hidden = false;
    this.showDemoStep();
  }

  private closeDemo(): void {
    if (!this.demo) return;
    this.demo = null;
    this.el('gbx-demo').hidden = true;
    this.mark(null);
  }

  private stepDemo(delta: number): void {
    if (!this.demo) return;
    this.demo.at = Math.max(0, Math.min(this.demo.steps.length - 1, this.demo.at + delta));
    this.showDemoStep();
  }

  private showDemoStep(): void {
    const demo = this.demo;
    if (!demo) return;
    demo.at = Math.min(demo.at, demo.steps.length - 1);
    const step = demo.steps[demo.at]!;
    this.el('gbx-demo-count').textContent = t('Чому шестерні крутяться завжди · {n} з {count}', { n: demo.at + 1, count: demo.steps.length });
    this.el('gbx-demo-title').textContent = step.title;
    this.el('gbx-demo-text').textContent = step.text;
    this.el<HTMLButtonElement>('gbx-demo-prev').disabled = demo.at === 0;
    this.el<HTMLButtonElement>('gbx-demo-next').disabled = demo.at === demo.steps.length - 1;
    this.selectGear(step.gear);
    this.mark(step.focus ?? null);
  }

  /**
   * Lights up the gear a step is about: a glowing shell of the same teeth, a child of the gear, so it turns with it.
   * The camera stays where the visitor put it.
   */
  private mark(gear: string | null): void {
    this.marker?.removeFromParent();
    this.marker = null;
    this.markedGear = gear;
    const mesh = gear ? this.model?.gearMesh(gear) : undefined;
    if (!mesh) return;
    this.markerMaterial ??= new THREE.MeshBasicMaterial({ color: MARK, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const marker = new THREE.Mesh(mesh.geometry, this.markerMaterial);
    marker.scale.setScalar(1.035);
    marker.renderOrder = 50;
    marker.raycast = () => undefined;
    mesh.add(marker);
    this.marker = marker;
  }

  // ---- Frame ----

  frame(dt: number): void {
    this.pedal.frame(dt);
    const { stage, time } = this.ctx;
    const frozen = time.frozen;
    const snap = this.ctx.audio.snapshot;
    const spec = this.data.engine.spec;
    const running = snap !== null && (snap.state === 'running' || snap.state === 'cranking');
    const engineRpm = snap?.rpm ?? 0;
    // The revs the figures are for, and the revs the box is shown turning at.
    const rpm = this.demoMode ? spec.idleRpm : engineRpm;
    const shownRpm =
      time.mode === 'slow'
        ? this.demoMode || running
          ? this.slowRpm
          : 0
        : time.mode === 'readable'
          ? readableDegreesPerSecond(rpm, spec.idleRpm, spec.redlineRpm) / 6
          : rpm;
    this.table.step(frozen ? 0 : dt, shownRpm);
    if (this.model) {
      if (this.rebuildDue && (this.sinceRebuild += dt) >= REBUILD_S) this.buildModel(true);
      const pose = this.table.frame();
      if (this.glow) this.model.update(pose);
      else {
        this.unlit.angles = pose.angles;
        this.unlit.sleeves = pose.sleeves;
        if (this.unlit.meshPower.length !== pose.meshPower.length) this.unlit.meshPower = pose.meshPower.map(() => 0);
        this.model.update(this.unlit);
      }
    } else if (this.rebuildDue) {
      this.buildModel(true);
    }
    if (!frozen) {
      this.homedFor = null;
    } else if (frozen !== this.homedFor) {
      this.homedFor = frozen;
      stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
    }

    const figuresRpm = time.mode === 'slow' && (running || this.demoMode) ? this.slowRpm : rpm;
    this.tacho.update(this.demoMode ? spec.idleRpm : engineRpm, running && snap!.fuelCut && engineRpm > spec.redlineRpm - 200);
    this.readouts(figuresRpm);
    if (running !== this.ignition.on && !this.demoMode && !this.starting) this.ignition.show(running);
  }

  /** Shaft speeds and the gear's ratio under the dash's gear buttons. */
  private readouts(rpm: number): void {
    const engaged = this.table.engaged;
    const was = this.readoutsFor;
    const whole = Math.round(rpm);
    if (whole === was.rpm && engaged === was.engaged && this.table.selected === was.selected && this.box === was.box) return;
    was.rpm = whole;
    was.engaged = engaged;
    was.selected = this.table.selected;
    was.box = this.box;
    const state = this.box.states.find((s) => s.name === engaged);
    const ratio = state?.kind === 'gear' ? state.ratio! : null;
    const input = t('{rpm} об/хв', { rpm: num(rpm) });
    const output = ratio === null ? t('стоїть') : t('{rpm} об/хв', { rpm: num(Math.abs(rpm / ratio)) }) + (ratio < 0 ? ` ${t('назад')}` : '');
    const gear = ratio === null ? (this.table.selected === 'N' ? t('нейтраль') : '…') : t('число {ratio}', { ratio: num(Math.abs(ratio), 3) });
    const direct = state?.kind === 'gear' && state.meshLoads?.every((m) => m.power === 0);
    const note = ratio === null ? t('Шестерні крутяться, вторинний вал стоїть') : direct ? t('Пряма: момент іде крізь муфту, без зачеплень') : ratio < 0 ? t('Три зачеплення, вал крутиться назад') : t('Два зачеплення: головна пара й пара передачі');
    const s = this.shown;
    if (input !== s.input) this.el('gbx-input-rpm').textContent = s.input = input;
    if (output !== s.output) this.el('gbx-output-rpm').textContent = s.output = output;
    if (gear !== s.gear) this.el('gbx-gear-text').textContent = s.gear = gear;
    if (note !== s.note) this.el('gbx-gear-note').textContent = s.note = note;
  }

  // ---- Helpers ----

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  /** Gives a skeleton element another text while this section is shown. */
  private lend(selector: string, text: string): void {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) return;
    const was = this.lent.get(el) ?? {};
    if (was.text === undefined) was.text = el.textContent ?? '';
    this.lent.set(el, was);
    el.textContent = text;
  }

  private lendHidden(selector: string, hidden: boolean): void {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) return;
    const was = this.lent.get(el) ?? {};
    if (was.hidden === undefined) was.hidden = el.hidden === true;
    this.lent.set(el, was);
    el.hidden = hidden;
  }
}
