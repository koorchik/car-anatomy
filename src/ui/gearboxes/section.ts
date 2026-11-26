// The gearbox section (stage K1b): `#/gearboxes/<page>[/<variant>]`, so far the manual layshaft box of the BMW M3 E30
// and the two-shaft transaxles of the Civic Type R FK8 and the 911 Carrera T (stage K6a-geom) on the table. What
// differs between the layouts (the box, its 3D model, the panel's model and words) is in table-layouts.ts.
// The car's engine runs on its free path (the shared Drive, no load) and turns the input shaft; the output turns free;
// the buttons pick N, the forward speeds and R, and the sleeves travel in 0.2 s (TableDrive). Beside it the article,
// the settings panel (owner decision A3) and demonstration 1.
//
// Time: the real mode turns the input at the engine's revs, the readable mode slows the whole box by one factor
// (readableDegreesPerSecond, so every member stays in mesh), slow motion holds the crank at walking pace through
// Drive.lock, as on the engine pages. Before the engine is first started the box turns as at idle, so the page is not
// dead on arrival.
//
// The car mode (stage K3a, car-mode.ts, its own chunk) puts the page's car on the crank: the same box, now
// driven through the clutch to the wheels; the dash shows speed and gear, and the digits are the gears. Only the real
// time there: a slowed wheel under a car at full speed would look like wheelspin. In the car, muting the sound stops
// the audio thread and the main-thread copy drives on from where it was (Drive hands the car over both ways).

import * as THREE from 'three';
import type { Drive } from '../../audio/drive.ts';
import { CARS } from '../../data/cars.ts';
import { driveCarById } from '../../data/drive-cars.ts';
import { engineById, engineFacts } from '../../data/engines.ts';
import { GEARBOX_PAGES } from '../../data/gearboxes.ts';
import type { GearboxPage, GearboxRecord } from '../../drivetrain/catalogue.ts';
import type { LayshaftDesc } from '../../drivetrain/layouts/layshaft.ts';
import { TableDrive } from '../../drivetrain/table-drive.ts';
import type { Gearbox } from '../../drivetrain/topology.ts';
import { buildEngine, type Engine } from '../../engine/kinematics.ts';
import { withDictionaries } from '../../i18n/dictionaries.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { GEARBOX_PARTS } from '../../scene/gearbox/parts.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, TimeMode, Viewport } from '../../shell/section.ts';
import { readableDegreesPerSecond } from '../../shell/time.ts';
import { drivenTyreRadiusM } from '../../vehicle/car.ts';
import { Ignition } from '../widgets/ignition.ts';
import { Pedal } from '../widgets/pedal.ts';
import { Tacho } from '../widgets/tacho.ts';
import { gearboxArticleHtml } from './article.ts';
import type { CarMode } from './car-mode.ts';
import { alwaysTurningSteps, type DemoStep } from './demo.ts';
import { GEARBOX_KEY_CONTEXTS, gearboxKeys } from './keys.ts';
import { GEARBOX_PAGES_SHOWN } from './load.ts';
import { dashHtml, panelHtml, resultsHtml, SLOW_RPM_DEFAULT, statusHtml, SVG_SOUND_OFF, SVG_SOUND_ON, titleHtml, toolsHtml } from './markup.ts';
import { pageStepsHtml, variantListHtml } from './page-nav.ts';
import { SetupPanel } from './setup-panel.ts';
import { tableLayout, type TableDesc, type TableLayout, type TableModel } from './table-layouts.ts';
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

/** The car mode, fetched with the catalogue's torque maps the first time a visitor gets in. */
const loadCarMode = (): Promise<typeof import('./car-mode.ts')> => withDictionaries(['engines', 'gearboxes', 'presets'], () => import('./car-mode.ts'));

export type GearboxMode = 'table' | 'drive';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Everything a page needs that does not change with the panel. */
interface PageData {
  page: GearboxPage;
  /** The page's base gearbox or the variant the address names. */
  record: GearboxRecord;
  layout: TableLayout;
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
  private desc!: TableDesc;
  private table!: TableDrive;
  private model: TableModel | null = null;
  /** The settings panel of the page shown. */
  setup!: SetupPanel<TableDesc>;
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
  /** On the table or in the car, as the address has it (m=drive). */
  mode: GearboxMode = 'table';
  /** The car mode once loaded; `car.on` while the car is on the crank. */
  car: CarMode | null = null;
  /** Counts mode changes, so a car mode that loads late does not override a later choice. */
  private modeTicket = 0;
  /** The time mode before the car took it to the real one, to give back on the table. */
  private timeBefore: TimeMode | null = null;
  /** The audio thread was stopped for the mute in the car (Drive.pause). */
  private pausedForMute = false;
  /** The gear the buttons show pressed, so the DOM is touched only on a change. */
  private pressedGear = '';
  /** Skeleton texts and states this section changes while it is shown, to give back on leave. */
  private readonly lent = new Map<HTMLElement, { text?: string; hidden?: boolean }>();
  private fitScaleBefore = 0.68;
  /** The --tools-h the page had before this section measured its own row, to give back on leave. */
  private toolsHBefore = '';
  /** fitScaleBefore and toolsHBefore hold what the section found on coming: present() on another page keeps them. */
  private holding = false;
  /** Last texts of the readouts, so the DOM is touched only when they change. */
  private shown = { input: '', output: '', diff: '', gear: '', note: '' };
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
    const keys = gearboxKeys({
      gas: (on) => this.pedal.holdKey(on),
      ignition: () => void this.toggleIgnition(),
      mute: () => {
        this.muted = !this.muted;
        this.syncSound();
      },
      gear: (name) => this.selectGear(name),
      brake: (on) => this.car?.holdBrakeKey(on),
    });
    ctx.keys.bind('gearboxes', keys.gearboxes);
    ctx.keys.bind('gearboxes/drive', keys.drive);
    // The row of view tools wraps on a phone and in the longer language; the first-visit callout and the scale bar stand
    // above it through --tools-h, which on the engine pages their systems view measures.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.measureTools()).observe(slots.tools.parent);
    // The list of variants is laid out only once the section shows and the panels take their room.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.showVariant()).observe(this.el('gbx-nav'));
    this.showPage();
    this.present();
  }

  enter(route: Route, from: Route | null): void {
    if (this.away) this.resume();
    let id = this.pageId(route);
    if (!id) {
      // An address of a page not built yet, or of none: the first page, with the address saying so; an unknown
      // variant of a page shown: that page. The address is only rewritten, so the page shown follows here.
      const page = route.page === 'catalogue' && route.path[0] ? this.pageId({ ...route, path: [route.path[0]] }) : null;
      id = page ?? GEARBOX_PAGES_SHOWN[0]!;
      this.ctx.router.replace({ section: 'gearboxes', page: 'catalogue', path: [id] });
    }
    if (id !== this.data.record.id) {
      this.data = this.pageData(id);
      // Another car of the page or another page: its own engine turns the box, running on if it ran.
      this.drive.setEngine(this.data.engine);
      this.tacho.configure(this.data.engine.spec.redlineRpm);
      this.showPage();
      this.present();
    }
    const mode: GearboxMode = route.query.m === 'drive' ? 'drive' : 'table';
    if (mode !== this.mode || (mode === 'drive' && !this.car?.on)) void this.setMode(mode);
    if (from === null || route.query.demo !== from.query.demo) {
      if (route.query.demo === DEMO_ID && this.mode === 'table') this.startDemo();
      else if (this.demo) this.closeDemo();
    }
  }

  leave(): void {
    this.away = true;
    this.closeDemo();
    this.modeTicket++;
    this.car?.leave();
    this.mode = 'table';
    if (this.pausedForMute) this.drive.pause(false);
    this.pausedForMute = false;
    this.pedal.reset();
    const drive = this.drive;
    drive.lock(null);
    drive.stop();
    this.ctx.keys.use([]);
    this.ctx.slots.partCard.hidden = true;
    this.ctx.stage.fitScale = this.fitScaleBefore;
    this.holding = false;
    // Off the stage before the next section's model comes; the box is rebuilt on return (present).
    if (this.model) {
      this.ctx.stage.release(this.model);
      this.model.dispose();
    }
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

  layout({ width, small }: Viewport): PanelSizes {
    const narrow = width < 1500;
    return {
      right: narrow ? 360 : 400,
      // The box is set up on the table: in the car a phone has no settings sheet, as a desktop has its button disabled.
      left: small && this.mode === 'drive' ? 0 : narrow ? 300 : 340,
      dash: this.ctx.slots.dash.parent.offsetHeight,
      rightLabel: t('Про коробку'),
    };
  }

  time(): TimeCapabilities {
    if (this.mode === 'drive') {
      const reason = t('В авто час іде справжній');
      return { modes: ['slow', 'readable', 'real'], unavailable: { slow: reason, readable: reason } };
    }
    return { modes: ['slow', 'readable', 'real'] };
  }

  // ---- The page ----

  /** The gearbox record an address asks for (page or page/variant), if its page is one built so far. */
  private pageId(route: Route): string | null {
    // The gearbox designer's address (#/gearboxes/designer) comes with its own stage.
    if (route.page !== 'catalogue') return null;
    const id = route.path[0] ?? GEARBOX_PAGES_SHOWN[0]!;
    const page = GEARBOX_PAGES_SHOWN.includes(id) ? GEARBOX_PAGES.find((p) => p.id === id) : undefined;
    if (!page) return null;
    const variant = route.path[1];
    if (variant === undefined) return page.id;
    return page.variants.some((v) => v.id === `${page.id}/${variant}`) ? `${page.id}/${variant}` : null;
  }

  private pageData(id: string): PageData {
    const page = GEARBOX_PAGES.find((p) => p.id === id.split('/')[0])!;
    const record = [page.base, ...page.variants].find((r) => r.id === id)!;
    const car = record.car ? CARS[record.car] : undefined;
    const spec = car ? engineById(car.engine) : undefined;
    if (!car || !spec) throw new Error(`${id}: the page needs its car and the car's engine`);
    const driveCar = driveCarById(car.id);
    if (!driveCar) throw new Error(`${id}: the page needs the drive record of ${car.id} for its final drive`);
    // The driven wheels' tyre: the 911's rear ones are bigger than its front ones.
    const tyre = car.drive === 'fwd' ? car.tyre.size : (car.tyre.sizeRear ?? car.tyre.size);
    return {
      page,
      record,
      layout: tableLayout(record, driveCar.finalDrive.ratio),
      engine: buildEngine(spec),
      radiusM: drivenTyreRadiusM(car),
      tyre,
    };
  }

  /** What a page shows that the panel does not change: its title, article and settings, and the factory box. */
  private showPage(): void {
    const d = this.data;
    const { record, layout } = d;
    const car = record.car ? CARS[record.car]! : null;
    const facts = car ? engineFacts(car.engine) : undefined;
    const engineName = facts?.engineCode ? facts.engineCode : d.engine.spec.example;
    this.el('gbx-title').textContent = layout.title;
    this.el('gbx-steps').innerHTML = pageStepsHtml(GEARBOX_PAGES.filter((p) => GEARBOX_PAGES_SHOWN.includes(p.id)), record.id);
    this.el('gbx-nav').innerHTML = variantListHtml(d.page, record.id);
    this.showVariant();
    this.el('gbx-demo-open').hidden = !layout.demo;
    this.el('gbx-sub').innerHTML = car
      ? t('{gearbox} · на авто {car} · {engine}', {
          gearbox: record.name,
          car: car.name,
          engine: `<a href="#/engines/${car.engine}">${t('двигун {name}, {hp} к.с.', { name: engineName, hp: num(facts?.powerHp ?? 0) })}</a>`,
        })
      : record.name;
    // The car mode drives the page's car: a box without one stays on the table, and so does a transaxle, whose final
    // drive is in its own case and not yet on the car's drivetrain.
    this.el('gbx-modes').querySelector<HTMLElement>('[data-mode="drive"]')!.hidden = !car || layout.kind !== 'layshaft';
    // A new panel in a fresh element: the last page's panel leaves with its listeners.
    const host = this.el('gbx-setup');
    const fresh = host.cloneNode(false) as HTMLElement;
    host.replaceWith(fresh);
    this.setup = new SetupPanel(
      fresh,
      {
        model: layout.setup,
        labels: layout.labels,
        radiusM: d.radiusM,
        tyre: d.tyre,
        redlineRpm: d.engine.spec.redlineRpm,
        reverse: layout.reverse(layout.factory),
      },
      (desc) => this.boxChanged(desc),
    );
    this.el('gbx-article').innerHTML = gearboxArticleHtml({
      page: d.page,
      record,
      car,
      ratios: layout.ratios(layout.factory),
      reverse: layout.reverse(layout.factory),
      finalDrive: layout.finalDrive,
      engine: car ? { href: `#/engines/${car.engine}`, name: engineName, powerHp: facts?.powerHp ?? null } : null,
      tyre: d.tyre,
      rollingRadiusMm: d.radiusM * 1000,
      demo: layout.demo,
    });
    this.desc = layout.factory;
    this.box = layout.build(layout.factory);
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
    document.title = t('{title}. Анатомія авто', { title: this.data.layout.title });
    // Another page of the section shown in place keeps what the section found when it came.
    if (!this.holding) {
      this.holding = true;
      this.fitScaleBefore = stage.fitScale;
      this.toolsHBefore = document.documentElement.style.getPropertyValue('--tools-h');
    }
    this.measureTools();
    this.buildModel(false);
    this.model?.setView(view.mode);
    this.el('gbx-slow-tool').hidden = time.mode !== 'slow';
    this.drive.lock(time.mode === 'slow' ? this.slowRpm : null);
    const small = window.innerWidth <= PHONE;
    panels.setOpen('right', !small);
    panels.setOpen('left', !small && window.innerWidth >= BOTH_PANELS && this.mode === 'table');
    panels.relayout();
    this.ctx.keys.use(this.mode === 'drive' ? GEARBOX_KEY_CONTEXTS.drive : GEARBOX_KEY_CONTEXTS.table);
  }

  /** On a phone the list of variants is a row: the chosen one may be out of sight. */
  private showVariant(): void {
    const list = this.root.querySelector<HTMLElement>('#gbx-nav .variant-list');
    const active = list?.querySelector<HTMLElement>('.active');
    if (list && active) list.scrollLeft = active.offsetLeft - list.offsetLeft - 8;
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

  /** A box from the panel: the numbers now, the model on the next rebuild. */
  private boxChanged(desc: TableDesc): void {
    if (desc === this.desc) return;
    this.desc = desc;
    const box = this.data.layout.build(desc);
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
    // The panel is closed in the car, but should the box change there all the same, the car takes it, standing in neutral.
    if (this.car?.on) void this.setMode('drive');
  }

  private buildModel(keepCamera: boolean): void {
    const model = this.data.layout.model(this.box, window.innerWidth <= PHONE ? 'low' : 'high');
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
    this.pressedGear = selected;
  }

  private selectGear(name: string): void {
    if (!this.box.states.some((s) => s.name === name)) return;
    if (this.mode === 'drive') {
      // The car takes the gear through its auto clutch; the buttons follow what it asks for (frame).
      this.car?.gear(name);
      return;
    }
    this.table.select(name);
    this.pressGear(name);
  }

  private pressGear(name: string): void {
    if (name === this.pressedGear) return;
    this.pressedGear = name;
    for (const button of this.el('gbx-gears').querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.gear === name));
  }

  // ---- The car ----

  /** On the table or in the car. The address says which (m=drive); a click writes it, and enter() comes here. */
  private async setMode(mode: GearboxMode): Promise<void> {
    const ticket = ++this.modeTicket;
    const { time, panels, keys } = this.ctx;
    if (mode === 'drive') {
      this.closeDemo();
      const module = await loadCarMode();
      const record = this.data.page.base;
      if (ticket !== this.modeTicket || this.away || !record.car || this.data.layout.kind !== 'layshaft') return;
      this.car ??= new module.CarMode(this.root, () => this.drive);
      if (this.mode !== 'drive') this.timeBefore = time.mode;
      this.mode = 'drive';
      this.car.enter(module.pageCarRecords(record.car, record, this.desc as LayshaftDesc, this.setup.finalDrive));
      this.demoMode = false;
      panels.setOpen('left', false);
      panels.relayout();
    } else {
      this.mode = 'table';
      this.car?.leave();
      if (this.pausedForMute) this.drive.pause(false);
      this.pausedForMute = false;
      // The buttons show the table's own gear again.
      this.pressedGear = '';
      this.pressGear(this.table.selected);
      panels.relayout();
    }
    time.refresh();
    if (mode === 'table' && this.timeBefore) {
      time.set(this.timeBefore);
      this.timeBefore = null;
    }
    keys.use(mode === 'drive' ? GEARBOX_KEY_CONTEXTS.drive : GEARBOX_KEY_CONTEXTS.table);
    for (const button of this.el('gbx-modes').querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    this.el('gbx-mode-text').textContent = mode === 'drive' ? t('двигун через зчеплення й коробку везе авто, зчеплення працює саме') : t('двигун крутить первинний вал, вихід вільний');
    this.el<HTMLButtonElement>('gbx-setup-toggle').disabled = mode === 'drive';
    this.el<HTMLButtonElement>('gbx-setup-toggle').title = mode === 'drive' ? t('Коробку налаштовують на столі, а авто їде з нею') : '';
    this.el<HTMLButtonElement>('gbx-demo-open').hidden = mode === 'drive';
    this.syncSound();
  }

  /** A click on the mode buttons: the address changes, and enter() switches. */
  private routeMode(mode: GearboxMode): void {
    this.ctx.router.replace({ query: { m: mode === 'drive' ? 'drive' : null, demo: null } });
    if (mode !== this.mode) void this.setMode(mode);
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
    this.el('gbx-modes').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
      if (button) this.routeMode(button.dataset.mode as GearboxMode);
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
    // In the car a mute stops the audio thread: the main-thread copy drives on, and the car comes back to it unmuted.
    const pause = this.muted && this.mode === 'drive';
    if (pause !== this.pausedForMute) {
      this.pausedForMute = pause;
      this.drive.pause(pause);
    }
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
    if (!this.data.layout.demo) {
      this.closeDemo();
      return;
    }
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
    const carPose = this.car?.on ? this.car.frame(frozen ? 0 : dt, snap) : null;
    if (!this.car?.on) this.table.step(frozen ? 0 : dt, shownRpm);
    else if (snap?.vehicle) this.pressGear(snap.vehicle.selected);
    if (this.model) {
      if (this.rebuildDue && (this.sinceRebuild += dt) >= REBUILD_S) this.buildModel(true);
      const pose = carPose ?? this.table.frame();
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
    if (!this.car?.on) this.readouts(figuresRpm);
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
    const layout = this.data.layout;
    const { output: own, diff: overall } = layout.shafts(this.box, state);
    const speed = (ratio: number | null): string =>
      ratio === null ? t('стоїть') : t('{rpm} об/хв', { rpm: num(Math.abs(rpm / ratio)) }) + (ratio < 0 ? ` ${t('назад')}` : '');
    const input = t('{rpm} об/хв', { rpm: num(rpm) });
    const output = speed(own);
    const gear = own === null ? (this.table.selected === 'N' ? t('нейтраль') : '…') : t('число {ratio}', { ratio: num(Math.abs(own), 3) });
    const note = layout.note(this.box, state);
    const s = this.shown;
    if (input !== s.input) this.el('gbx-input-rpm').textContent = s.input = input;
    if (output !== s.output) this.el('gbx-output-rpm').textContent = s.output = output;
    const diffRow = this.el('gbx-diff-row');
    diffRow.hidden = !layout.finalInside;
    const diff = layout.finalInside ? speed(overall) : '';
    if (diff !== s.diff) this.el('gbx-diff-rpm').textContent = s.diff = diff;
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
