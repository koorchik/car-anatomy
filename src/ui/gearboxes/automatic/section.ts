// The planetary automatic's page (stage K11): `#/gearboxes/automatic`, the ZF 8HP51 of the Toyota GR Supra on the
// table. The car's engine runs on its free path (the shared Drive, no load) and turns the input shaft directly, as
// there is no torque converter yet (stage K12a); the output turns free. The gear buttons close the matrix's three
// elements, the A–E buttons close any combination (demonstration 8). Beside the stage the article; in the left panel
// the lever diagram and the shift matrix.
//
// What the closed elements leave decides the motion (PlanetaryTable): a gear, a neutral with the output standing,
// the input held (A+C+E) with the output rolling, or a jam. With the input held the engine cannot turn: a running
// engine stalls, and the page says why. Time works as on the manual page: real revs, one slowing factor for the whole
// box, or the crank held at walking pace.
//
// The torque converter's lab (stage K12a, demonstration 9, `?demo=converter`) replays a run computed ahead in first
// gear with the shell's slow-down (converter-lab-ui.ts); while it is open the live engine is off and the page offers
// only the slow-down and the real time.

import type { Drive } from '../../../audio/drive.ts';
import { AUTOMATIC_CAR } from '../../../data/gearboxes/automatic.ts';
import { GEARBOX_PAGES } from '../../../data/gearboxes.ts';
import { engineById, engineFacts } from '../../../data/engines.ts';
import type { GearboxPage } from '../../../drivetrain/catalogue.ts';
import { gearboxSpec } from '../../../drivetrain/catalogue.ts';
import type { PlanetaryDesc } from '../../../drivetrain/layouts/planetary.ts';
import { PlanetaryTable } from '../../../drivetrain/planetary-table.ts';
import { buildGearbox, type Gearbox, type StateInfo } from '../../../drivetrain/topology.ts';
import type { ConverterLabRun } from '../../../drivetrain/converter-lab.ts';
import { withDictionaries } from '../../../i18n/dictionaries.ts';
import { buildEngine, type Engine } from '../../../engine/kinematics.ts';
import { numberLocale } from '../../../i18n/locale.ts';
import { t } from '../../../i18n/t.ts';
import { elementColor } from '../../../scene/gearbox/element-colors.ts';
import { PLANETARY_PARTS } from '../../../scene/gearbox/planetary-parts.ts';
import { PlanetaryModel, type PlanetaryFrame } from '../../../scene/gearbox/planetary-model.ts';
import { registerParts } from '../../../scene/parts-registry.ts';
import type { FreezeOptions } from '../../../shell/freeze.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../../shell/section.ts';
import { readableDegreesPerSecond } from '../../../shell/time.ts';
import { Ignition } from '../../widgets/ignition.ts';
import { Pedal } from '../../widgets/pedal.ts';
import { Tacho } from '../../widgets/tacho.ts';
import { gearboxKeys } from '../keys.ts';
import { SLOW_RPM_DEFAULT, SVG_SOUND_OFF, SVG_SOUND_ON } from '../markup.ts';
import { automaticArticleHtml } from './article.ts';
import { ConverterLabUi } from './converter-lab-ui.ts';
import { matrixSteps, shiftChange, type MatrixStep } from './demo.ts';
import { dashHtml, labHtml, panelHtml, resultsHtml, statusHtml, titleHtml, toolsHtml } from './markup.ts';
import { nomogramSvg } from './nomogram-svg.ts';
import '../../engines/engines.css';
import '../gearboxes.css';
import './automatic.css';

const PAGE_ID = 'automatic';
/** The key context of this page (the shell's KeyMap): its own, so that the manual page's bindings never reach it. */
const KEY_CONTEXT = 'gearboxes/automatic';
const PHONE = 860;
const BOTH_PANELS = 1200;
/** The view from the model toward the camera: from the front left and above, so the sets show one behind another. */
const HOME: [number, number, number] = [-0.9, 0.45, 0.85];
const DEMO_ID = 'matrix';
const LAB_ID = 'converter';
/** The lab's slow-down factors, and the one it opens with. */
const LAB_SLOWDOWN = [0.5, 0.25, 0.1] as const;
const LAB_START = 0.25;
const loadLabRun = (): Promise<typeof import('./converter-lab-run.ts')> => withDictionaries(['engines', 'gearboxes', 'presets'], () => import('./converter-lab-run.ts'));
const FIT = 0.82;
const FIT_PHONE = 0.9;
/** The output's speed while the input is held (A+C+E), as a share of the shown input speed: a car rolling. */
const ROLL_SHARE = 0.25;

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export class AutomaticSection implements Section {
  readonly id = 'gearboxes' as const;
  readonly solidLabel = t('Коробка');
  private ctx!: SectionContext;
  private root!: HTMLElement;
  private page!: GearboxPage;
  private desc!: PlanetaryDesc;
  private box!: Gearbox;
  private engine!: Engine;
  private table!: PlanetaryTable;
  private model: PlanetaryModel | null = null;
  private tacho!: Tacho;
  private pedal!: Pedal;
  private ignition!: Ignition;
  private away = false;
  private demoMode = true;
  private starting = false;
  private slowRpm = SLOW_RPM_DEFAULT;
  private explode = 0;
  private glow = true;
  private volume = 0.8;
  private muted = false;
  private homedFor: FreezeOptions | null = null;
  private demo: { steps: MatrixStep[]; at: number } | null = null;
  private lab: ConverterLabUi | null = null;
  private labRun: ConverterLabRun | null = null;
  /** The elements closed before the lab put the box in first. */
  private beforeLab: string[] | null = null;
  /** The lab was asked for and its run is on its way. */
  private labWanted = false;
  /** The turbine's whole rpm the dash shows in the lab, NaN to redraw. */
  private labRpmShown = Number.NaN;
  /** The last shift between two gears of the matrix, for the note under the buttons. */
  private lastShift: { from: string; to: string } | null = null;
  /** The engine was stalled by elements that hold the input. */
  private stalled = false;
  private readonly lent = new Map<HTMLElement, { text?: string; hidden?: boolean }>();
  private fitScaleBefore = 0.68;
  private toolsHBefore = '';
  private shown = { input: '', output: '', gear: '', note: '' };
  private readoutsFor = { rpm: NaN, key: '' };
  private drawnFor = '';
  private readonly unlit = { angles: [] as ArrayLike<number>, meshPower: [] as number[], closed: new Set<string>() as ReadonlySet<string> };
  private readonly labPose: PlanetaryFrame = { angles: [], meshPower: [], closed: new Set<string>() };

  get drive(): Drive {
    return this.ctx.audio.drive(this.engine);
  }

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    this.root = ctx.slots.root;
    registerParts(PLANETARY_PARTS);
    this.page = GEARBOX_PAGES.find((p) => p.id === PAGE_ID)!;
    if (this.page.base.layout.kind !== 'planetary') throw new Error(`${PAGE_ID}: not a planetary box`);
    this.desc = this.page.base.layout.desc;
    this.box = buildGearbox(gearboxSpec(this.page.base));
    this.table = new PlanetaryTable(this.box);
    this.table.select('1');
    this.unlit.meshPower = this.box.meshes.map(() => 0);
    this.engine = buildEngine(engineById(AUTOMATIC_CAR.engine)!);
    const { slots } = ctx;
    slots.title.add(titleHtml());
    slots.tools.add(toolsHtml());
    slots.status.add(statusHtml());
    slots.status.add(labHtml());
    slots.panel.add(panelHtml());
    slots.results.add(resultsHtml());
    slots.dash.add(dashHtml(this.box.spec.elements.map((e) => e.id)));
    const drive = ctx.audio.drive(this.engine);
    drive.setEngine(this.engine);
    this.tacho = new Tacho();
    this.el('gba-tacho').append(this.tacho.element);
    this.tacho.configure(this.engine.spec.redlineRpm);
    this.pedal = new Pedal(this.el('gba-pedal-col'), { setThrottle: (value) => this.drive.setPedal(value), press: () => void this.pressThrottle() });
    this.ignition = new Ignition(this.el('gba-control'), () => void this.toggleIgnition());
    this.listen();
    // The table's keys of the manual pages (gas, start, mute) under a context of its own: the manual page's bindings
    // reach its own pedal and ignition. The digits stay the views, as on the manual table.
    const keys = gearboxKeys({
      gas: (on) => this.pedal.holdKey(on),
      ignition: () => void this.toggleIgnition(),
      mute: () => {
        this.muted = !this.muted;
        this.syncSound();
      },
      gear: (name) => this.select(name),
      brake: () => {},
      // An automatic has no clutch pedal; its keys come only with the car mode.
      clutch: () => {},
    });
    ctx.keys.bind(KEY_CONTEXT, keys.gearboxes);
    // The row of view tools wraps on a phone and in the longer language; the first-visit callout and the scale bar stand
    // above it through --tools-h, as on the manual page.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.measureTools()).observe(slots.tools.parent);
    this.showPage();
    this.present();
  }

  enter(route: Route, from: Route | null): void {
    if (this.away) this.resume();
    if (from === null || route.query.demo !== from.query.demo) {
      if (route.query.demo === LAB_ID) this.openLab();
      else if (this.lab) this.closeLab();
      if (route.query.demo === DEMO_ID) this.startDemo();
      else if (this.demo) this.closeDemo();
    }
  }

  leave(): void {
    this.away = true;
    this.closeDemo();
    this.closeLab();
    this.pedal.reset();
    const drive = this.drive;
    drive.lock(null);
    drive.stop();
    this.ctx.keys.use([]);
    this.ctx.slots.partCard.hidden = true;
    this.ctx.stage.fitScale = this.fitScaleBefore;
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

  /** The height the row of view tools takes above the dash, for what stands over it (--tools-h). */
  private measureTools(): void {
    if (this.away) return;
    const row = this.ctx.slots.tools.parent;
    if (!row.offsetHeight) return;
    const style = getComputedStyle(row);
    const above = parseFloat(style.bottom) - parseFloat(style.getPropertyValue('--dash-h'));
    document.documentElement.style.setProperty('--tools-h', `${Math.round(row.offsetHeight + (Number.isFinite(above) ? above : 12))}px`);
  }

  private resume(): void {
    this.away = false;
    this.drive.setEngine(this.engine);
    this.present();
  }

  layout({ width }: Viewport): PanelSizes {
    const narrow = width < 1500;
    return { right: narrow ? 360 : 400, left: narrow ? 330 : 370, dash: this.ctx.slots.dash.parent.offsetHeight, rightLabel: t('Про коробку') };
  }

  time(): TimeCapabilities {
    if (this.lab) return { modes: ['slowdown', 'real'], slowdown: LAB_SLOWDOWN };
    return { modes: ['slow', 'readable', 'real'] };
  }

  // ---- The page ----

  private showPage(): void {
    const record = this.page.base;
    const facts = engineFacts(AUTOMATIC_CAR.engine);
    const engineName = facts?.engineCode ? facts.engineCode : this.engine.spec.example;
    const href = `#/engines/${AUTOMATIC_CAR.engine}`;
    this.el('gba-title').textContent = t('Гідромеханічний автомат');
    this.el('gba-sub').innerHTML = t('{gearbox} · на авто {car} · {engine}', {
      gearbox: record.name,
      car: AUTOMATIC_CAR.name,
      engine: `<a href="${href}">${t('двигун {name}, {hp} к.с.', { name: engineName, hp: num(facts?.powerHp ?? 0) })}</a>`,
    });
    const gears = this.box.states.filter((s) => s.kind === 'gear');
    this.el('gba-article').innerHTML = automaticArticleHtml({
      page: this.page,
      desc: this.desc,
      ratios: gears.filter((s) => s.name !== 'R').map((s) => s.ratio!),
      reverse: Math.abs(gears.find((s) => s.name === 'R')!.ratio!),
      car: AUTOMATIC_CAR,
      engine: { href, name: engineName, powerHp: facts?.powerHp ?? null },
    });
    this.renderGears();
    this.renderMatrix();
    this.stateChanged();
  }

  private present(): void {
    const { view, time, panels, stage } = this.ctx;
    this.lend('#results-open', t('Номограма'));
    this.lend('.results-head h2', t('Номограма'));
    this.lend('#panel-toggle-closed', t('Про коробку'));
    this.lendHidden('#results-panel', false);
    this.lendHidden('#hint', true);
    this.ctx.slots.panelTitle.textContent = t('Про коробку');
    document.title = t('{title}. Анатомія авто', { title: t('Гідромеханічний автомат') });
    this.fitScaleBefore = stage.fitScale;
    this.toolsHBefore = document.documentElement.style.getPropertyValue('--tools-h');
    this.measureTools();
    this.buildModel();
    this.model?.setView(view.mode);
    this.el('gba-slow-tool').hidden = time.mode !== 'slow';
    this.drive.lock(time.mode === 'slow' ? this.slowRpm : null);
    const small = window.innerWidth <= PHONE;
    panels.setOpen('right', !small && window.innerWidth >= BOTH_PANELS);
    panels.setOpen('left', !small);
    panels.relayout();
    this.ctx.keys.use([KEY_CONTEXT]);
  }

  private buildModel(): void {
    const model = new PlanetaryModel(this.box, { quality: window.innerWidth <= PHONE ? 'low' : 'high', converter: true });
    this.ctx.stage.setModel(model, { home: HOME, fitScale: window.innerWidth <= PHONE ? FIT_PHONE : FIT });
    this.model = model;
    model.setView(this.ctx.view.mode);
    model.setExplode(this.explode);
    this.ctx.slots.partCard.hidden = true;
  }

  private renderGears(): void {
    const names = this.box.spec.states.map((s) => s.name);
    this.el('gba-gears').innerHTML = names.map((name) => `<button type="button" data-gear="${name}" aria-pressed="false">${name}</button>`).join('');
  }

  private renderMatrix(): void {
    const ids = this.box.spec.elements.map((e) => e.id);
    const head = `<thead><tr><th>${t('Передача')}</th>${ids.map((id, i) => `<th style="color:${elementColor(id, i)}">${id}</th>`).join('')}<th>${t('Число')}</th></tr></thead>`;
    const rows = this.box.states
      .filter((s) => s.kind === 'gear')
      .map((s) => {
        const cells = ids.map((id, i) => `<td>${s.closed.includes(id) ? `<span class="gba-dot" style="background:${elementColor(id, i)}"></span>` : ''}</td>`).join('');
        return `<tr data-gear="${s.name}"><th>${s.name}</th>${cells}<td>${num(s.ratio!, 3)}</td></tr>`;
      })
      .join('');
    this.el('gba-matrix').innerHTML = `${head}<tbody>${rows}</tbody>`;
  }

  /** Everything that follows the closed elements: buttons, matrix row, the lever diagram, the stall. */
  private stateChanged(): void {
    const closed = this.table.closed;
    const gear = this.table.gear;
    for (const b of this.el('gba-gears').querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.gear === (gear ?? (closed.length ? '' : 'N'))));
    }
    for (const b of this.el('gba-elements').querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(closed.includes(b.dataset.element!)));
    for (const row of this.el('gba-matrix').querySelectorAll<HTMLElement>('tr[data-gear]')) row.classList.toggle('on', row.dataset.gear === gear);
    const key = closed.join('+');
    if (key !== this.drawnFor) {
      this.drawnFor = key;
      this.el('gba-nomogram').innerHTML = nomogramSvg(this.box, this.table.state, closed);
      this.el('gba-state').innerHTML = this.stateLine(this.table.state);
    }
    const s = this.table.state.kind;
    if (s === 'input-locked' || s === 'locked') {
      const state = this.drive.snapshot().state;
      if (state === 'running' || state === 'cranking') {
        this.drive.stop();
        this.ignition.show(false);
        this.stalled = true;
      }
    } else {
      this.stalled = false;
    }
    this.readoutsFor.key = '';
  }

  private stateLine(state: StateInfo): string {
    const closed = this.table.closed;
    const list = closed.length ? closed.join(' + ') : t('нічого');
    const what =
      state.kind === 'gear'
        ? this.table.gear
          ? t('передача {gear}, число {ratio}', { gear: this.table.gear, ratio: num(state.ratio!, 3) })
          : t('передача, число {ratio}', { ratio: num(state.ratio!, 3) })
        : state.kind === 'neutral'
          ? t('нейтраль: {dof} ступені свободи, вихід вільний', { dof: state.dof })
          : state.kind === 'input-locked'
            ? t('вхід тримається на картері, вихід вільно крутиться')
            : t('заклинило: стоять і вхід, і вихід');
    return t('Замкнено: {list} — {what}', { list: `<b>${list}</b>`, what });
  }

  private select(gear: string): void {
    // The lab plays its run in first; a gear or an element chosen by hand belongs to the table, so the lab closes.
    if (this.lab) this.routeLab(false);
    const before = this.table.gear;
    this.table.select(gear);
    this.lastShift = before && before !== gear && gear !== 'N' ? { from: before, to: gear } : null;
    this.stateChanged();
  }

  private toggleElement(id: string): void {
    if (this.lab) this.routeLab(false);
    this.table.toggle(id);
    this.lastShift = null;
    this.stateChanged();
  }

  // ---- Controls ----

  private listen(): void {
    const { view, time } = this.ctx;
    view.onChange((mode) => {
      if (!this.away) this.model?.setView(mode);
    });
    time.onChange((mode) => {
      if (this.away) return;
      this.el('gba-slow-tool').hidden = mode !== 'slow';
      this.drive.lock(mode === 'slow' ? this.slowRpm : null);
    });
    this.el('gba-gears').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-gear]');
      if (button) this.select(button.dataset.gear!);
    });
    this.el('gba-elements').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-element]');
      if (button) this.toggleElement(button.dataset.element!);
    });
    this.el('gba-matrix').addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('tr[data-gear]');
      if (row) this.select(row.dataset.gear!);
    });
    this.el<HTMLInputElement>('gba-slow-rpm').addEventListener('input', (event) => {
      this.slowRpm = Number((event.target as HTMLInputElement).value);
      this.el('gba-slow-value').textContent = String(this.slowRpm);
      if (time.mode === 'slow') this.drive.lock(this.slowRpm);
    });
    this.el<HTMLInputElement>('gba-explode').addEventListener('input', (event) => {
      this.explode = Number((event.target as HTMLInputElement).value);
      this.model?.setExplode(this.explode);
    });
    this.el<HTMLInputElement>('gba-glow').addEventListener('change', (event) => {
      this.glow = (event.target as HTMLInputElement).checked;
    });
    this.el<HTMLInputElement>('gba-volume').addEventListener('input', (event) => {
      this.volume = Number((event.target as HTMLInputElement).value);
      this.muted = this.volume === 0;
      this.syncSound();
    });
    this.el('gba-mute').addEventListener('click', () => {
      this.muted = !this.muted;
      this.syncSound();
    });
    this.el('gba-levers-toggle').addEventListener('click', () => this.toggleLevers());
    this.el('gba-demo-open').addEventListener('click', () => this.routeDemo(true));
    this.el('gba-lab-open').addEventListener('click', () => this.routeLab(true));
    this.el('gba-lab-close').addEventListener('click', () => this.routeLab(false));
    this.el('gba-article').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-demo]');
      if (!button) return;
      if (window.innerWidth <= PHONE) {
        this.ctx.panels.setOpen('right', false);
        this.ctx.panels.relayout();
      }
      if (button.dataset.demo === LAB_ID) this.routeLab(true);
      else this.routeDemo(true);
    });
    this.el('gba-demo-close').addEventListener('click', () => this.routeDemo(false));
    this.el('gba-demo-prev').addEventListener('click', () => this.stepDemo(-1));
    this.el('gba-demo-next').addEventListener('click', () => this.stepDemo(1));
  }

  private toggleLevers(): void {
    const { panels } = this.ctx;
    const open = !panels.isOpen('left');
    panels.setOpen('left', open);
    if (open && window.innerWidth < BOTH_PANELS) panels.setOpen('right', false);
    panels.relayout();
  }

  private syncSound(): void {
    this.drive.setVolume(this.volume, this.muted);
    const button = this.el('gba-mute');
    button.innerHTML = this.muted ? SVG_SOUND_OFF : SVG_SOUND_ON;
    button.setAttribute('aria-pressed', String(this.muted));
    button.setAttribute('aria-label', this.muted ? t('Увімкнути звук') : t('Вимкнути звук'));
  }

  private async toggleIgnition(): Promise<void> {
    // The lab replays its own engine; the live one starts only once it is closed.
    if (this.lab) this.routeLab(false);
    const drive = this.drive;
    const state = drive.snapshot().state;
    if (state === 'running' || state === 'cranking') {
      drive.stop();
      this.ignition.show(false);
      return;
    }
    this.demoMode = false;
    this.stalled = false;
    this.readoutsFor.key = '';
    this.starting = true;
    this.ignition.show(true);
    await drive.ensureAudio();
    // The input cannot turn while the elements hold it: the engine would not even crank.
    const kind = this.table.state.kind;
    if (kind === 'input-locked' || kind === 'locked') {
      this.starting = false;
      this.ignition.show(false);
      this.stalled = true;
      this.readoutsFor.key = '';
      return;
    }
    drive.start();
    this.starting = false;
  }

  private async pressThrottle(): Promise<void> {
    const state = this.drive.snapshot().state;
    if (state === 'off' || state === 'stopping') await this.toggleIgnition();
  }

  // ---- Demonstration 8 ----

  private routeDemo(on: boolean): void {
    this.ctx.router.replace({ query: { demo: on ? DEMO_ID : null } });
    if (on) {
      this.closeLab();
      this.startDemo();
    } else this.closeDemo();
  }

  // ---- Demonstration 9: the torque converter's lab ----

  private routeLab(on: boolean): void {
    this.ctx.router.replace({ query: { demo: on ? LAB_ID : null } });
    if (on) this.openLab();
    else this.closeLab();
  }

  private openLab(): void {
    if (this.lab || this.labWanted) return;
    this.labWanted = true;
    if (this.labRun) {
      this.showLab(this.labRun);
      return;
    }
    void loadLabRun().then(({ automaticLabRun }) => {
      this.labRun ??= automaticLabRun();
      if (this.labWanted && !this.away) this.showLab(this.labRun);
      else this.labWanted = false;
    });
  }

  private showLab(run: ConverterLabRun): void {
    this.closeDemo();
    // The lab replays its own run: the live engine stops, the box goes into first.
    this.pedal.reset();
    const drive = this.drive;
    drive.lock(null);
    drive.stop();
    this.ignition.show(false);
    this.beforeLab = [...this.table.closed];
    this.table.select('1');
    this.lastShift = null;
    this.el('gba-lab').hidden = false;
    this.labRpmShown = Number.NaN;
    this.lab = new ConverterLabUi(this.el('gba-lab'), run);
    const { time } = this.ctx;
    time.refresh();
    time.set('slowdown', LAB_START);
    this.stateChanged();
  }

  private closeLab(): void {
    this.labWanted = false;
    if (!this.lab) return;
    this.readoutsFor.key = '';
    this.lab = null;
    this.el('gba-lab').hidden = true;
    if (this.beforeLab) this.table.set(this.beforeLab);
    this.beforeLab = null;
    const { time } = this.ctx;
    time.clock(null);
    time.refresh();
    this.stateChanged();
  }

  private startDemo(): void {
    this.demo = { steps: matrixSteps(this.box), at: 0 };
    this.el('gba-demo').hidden = false;
    // The lever diagram is half of the demonstration: open it where there is room.
    if (window.innerWidth > PHONE && !this.ctx.panels.isOpen('left')) {
      this.ctx.panels.setOpen('left', true);
      if (window.innerWidth < BOTH_PANELS) this.ctx.panels.setOpen('right', false);
      this.ctx.panels.relayout();
    }
    this.showDemoStep();
  }

  private closeDemo(): void {
    if (!this.demo) return;
    this.demo = null;
    this.el('gba-demo').hidden = true;
  }

  private stepDemo(delta: number): void {
    if (!this.demo) return;
    this.demo.at = Math.max(0, Math.min(this.demo.steps.length - 1, this.demo.at + delta));
    this.showDemoStep();
  }

  private showDemoStep(): void {
    const demo = this.demo;
    if (!demo) return;
    const step = demo.steps[demo.at]!;
    this.el('gba-demo-count').textContent = t('Матриця 8HP · {n} з {count}', { n: demo.at + 1, count: demo.steps.length });
    this.el('gba-demo-title').textContent = step.title;
    this.el('gba-demo-text').textContent = step.text;
    this.el<HTMLButtonElement>('gba-demo-prev').disabled = demo.at === 0;
    this.el<HTMLButtonElement>('gba-demo-next').disabled = demo.at === demo.steps.length - 1;
    const before = this.table.gear;
    this.table.set(step.closed);
    const after = this.table.gear;
    this.lastShift = before && after && before !== after ? { from: before, to: after } : null;
    this.stateChanged();
  }

  // ---- Frame ----

  frame(dt: number): void {
    this.pedal.frame(dt);
    const { stage, time } = this.ctx;
    const frozen = time.frozen;
    if (this.lab) {
      this.labFrame(frozen ? 0 : dt * (time.mode === 'slowdown' ? time.factor : 1));
      if (frozen && frozen !== this.homedFor) {
        this.homedFor = frozen;
        stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
      } else if (!frozen) this.homedFor = null;
      return;
    }
    const snap = this.ctx.audio.snapshot;
    const spec = this.engine.spec;
    const running = snap !== null && (snap.state === 'running' || snap.state === 'cranking');
    const engineRpm = snap?.rpm ?? 0;
    const held = this.table.state.kind === 'input-locked' || this.table.state.kind === 'locked';
    // Before the first start the box turns as at idle; with the input held nothing turns it, but the output rolls.
    const rpm = this.demoMode ? spec.idleRpm : engineRpm;
    const shown = time.mode === 'slow' ? (this.demoMode || running ? this.slowRpm : 0) : time.mode === 'readable' ? readableDegreesPerSecond(rpm, spec.idleRpm, spec.redlineRpm) / 6 : rpm;
    const rollBase = time.mode === 'slow' ? this.slowRpm : time.mode === 'readable' ? readableDegreesPerSecond(spec.idleRpm, spec.idleRpm, spec.redlineRpm) / 6 : spec.idleRpm;
    this.table.step(frozen ? 0 : dt, held ? 0 : shown, ROLL_SHARE * rollBase);
    if (this.model) {
      const pose = this.table.frame();
      if (this.glow) this.model.update(pose);
      else {
        this.unlit.angles = pose.angles;
        this.unlit.closed = pose.closed;
        this.model.update(this.unlit);
      }
    }
    if (!frozen) this.homedFor = null;
    else if (frozen !== this.homedFor) {
      this.homedFor = frozen;
      stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
    }
    const figuresRpm = held ? 0 : time.mode === 'slow' && (running || this.demoMode) ? this.slowRpm : rpm;
    this.tacho.update(this.demoMode ? (held ? 0 : spec.idleRpm) : engineRpm, running && snap!.fuelCut && engineRpm > spec.redlineRpm - 200);
    this.readouts(figuresRpm, held ? ROLL_SHARE * (time.mode === 'slow' ? this.slowRpm : spec.idleRpm) : 0);
    if (running !== this.ignition.on && !this.demoMode && !this.starting) this.ignition.show(running);
  }

  /** A frame of the lab: its run moves on by `dt` seconds of run time, the gearbox turns in first at its turbine's speed. */
  private labFrame(dt: number): void {
    const lab = this.lab!;
    const shown = lab.frame(dt);
    this.table.step(shown.moved, shown.turbineRpm);
    if (this.model) {
      const pose = this.table.frame();
      this.labPose.angles = pose.angles;
      this.labPose.closed = pose.closed;
      this.labPose.meshPower = this.glow ? pose.meshPower : this.unlit.meshPower;
      this.labPose.converter = shown.converter;
      this.model.update(this.labPose);
    }
    this.tacho.update(shown.engineRpm, false);
    this.ctx.time.clock(lab.seconds);
    // The dash's shafts follow the lab: the turbine is the input, first gear the rest. Words only when the rpm changes.
    const whole = Math.round(Math.max(0, shown.turbineRpm));
    if (whole === this.labRpmShown) return;
    this.labRpmShown = whole;
    const s = this.shown;
    const input = t('{rpm} об/хв', { rpm: num(Math.max(0, shown.turbineRpm)) });
    const output = t('{rpm} об/хв', { rpm: num(Math.max(0, shown.turbineRpm) / (this.table.state.ratio ?? 1)) });
    const note = t('Лабораторія гідротрансформатора: перша передача, вхідний вал крутить турбіна');
    if (input !== s.input) this.el('gba-input-rpm').textContent = s.input = input;
    if (output !== s.output) this.el('gba-output-rpm').textContent = s.output = output;
    if (note !== s.note) this.el('gba-note').textContent = s.note = note;
  }

  private readouts(rpm: number, rollRpm: number): void {
    const state = this.table.state;
    const whole = Math.round(rpm);
    // stateChanged() clears the key, so a frame with the same revs and elements builds no strings.
    if (whole === this.readoutsFor.rpm && this.readoutsFor.key) return;
    const key = `${this.table.key}|${this.stalled}|${this.lastShift?.from ?? ''}`;
    this.readoutsFor.rpm = whole;
    this.readoutsFor.key = key;
    const ratio = state.kind === 'gear' ? state.ratio! : null;
    const input = state.kind === 'input-locked' || state.kind === 'locked' ? t('стоїть') : t('{rpm} об/хв', { rpm: num(rpm) });
    const output =
      ratio !== null
        ? t('{rpm} об/хв', { rpm: num(Math.abs(rpm / ratio)) }) + (ratio < 0 ? ` ${t('назад')}` : '')
        : state.kind === 'input-locked'
          ? t('котиться, {rpm} об/хв', { rpm: num(rollRpm) })
          : t('стоїть');
    const gear = ratio !== null ? t('число {ratio}', { ratio: num(Math.abs(ratio), 3) }) : state.kind === 'neutral' ? t('нейтраль') : '';
    let note: string;
    if (state.kind === 'gear' && this.lastShift && this.table.gear) {
      const change = shiftChange(this.box, this.lastShift.from, this.lastShift.to);
      note = t('{from} → {to}: {off} відпускає, {on} замикає', { from: this.lastShift.from, to: this.lastShift.to, off: change.off.join(' + '), on: change.on.join(' + ') });
    } else if (state.kind === 'gear') {
      note = this.table.gear ? t('Три замкнені елементи лишають один рух') : t('Цієї трійки немає в матриці, але вона теж дає передачу');
    } else if (state.kind === 'neutral') {
      note = t('Замкніть три елементи, щоб увімкнути передачу');
    } else if (state.kind === 'input-locked') {
      note = this.stalled ? t('Двигун заглух: вхід тримається на картері, а вихід вільно крутиться') : t('Вхід тримається на картері, а вихід вільно крутиться: двигун заблоковано, авто котиться');
    } else {
      note = this.stalled ? t('Двигун заглух: чотири елементи заклинили коробку') : t('Чотири елементи заклинили коробку: стоять і вхід, і вихід');
    }
    const s = this.shown;
    if (input !== s.input) this.el('gba-input-rpm').textContent = s.input = input;
    if (output !== s.output) this.el('gba-output-rpm').textContent = s.output = output;
    if (gear !== s.gear) this.el('gba-gear-text').textContent = s.gear = gear;
    if (note !== s.note) this.el('gba-note').textContent = s.note = note;
  }

  // ---- Helpers ----

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }

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
