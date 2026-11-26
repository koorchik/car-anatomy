// The roll scene (suspensions plan, the roll scene, steps 1–6; stage P7): the page's car in a turn. A slider sets the
// lateral acceleration and the car settles there (statics.ts); the skidpad button raises it slowly to where the tyres give up;
// the sharp-turn button runs the simulation through a sudden turn in time (roll.ts). The 3D (roll-model.ts) shows one axle
// from the front or the rear with its body slice, or the whole chassis, with the load bars and the roll centres. The
// panel chooses the anti-roll bars and the 40 mm lowering; the model's captions say what that did to the understeer and
// to the inner wheels, and the article sets Chrysler's measurement of the roll centre beside the rigid model.
//
// The section owns the stage and the time; this module owns the roll model while its scene is shown and tells the
// section when the model on the stage changes.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { CARS } from '../../data/cars.ts';
import { CHASSIS_CARS } from '../../data/chassis.ts';
import { DRIVE_CARS } from '../../data/drive-cars.ts';
import { SUSPENSION_PAGES } from '../../data/suspensions.ts';
import type { ViewMode } from '../../scene/model-types.ts';
import { RollModel, type RollView } from '../../scene/suspension/roll-model.ts';
import { onSegment, setSegment } from '../../shell/segmented.ts';
import { carChassis, type CarChassis } from '../../suspension/car-chassis.ts';
import type { Chassis } from '../../suspension/chassis.ts';
import { G } from '../../suspension/forces.ts';
import {
  copyRollState, frontTransferShare, lowerChassis, newRollState, rigidRollGradient, ROLL_LOWER_M, RollSweep, runSwerve,
  steadyRoll, swerveAt, swerveSeconds, SWERVE_EVERY_S, type RollState, type SwerveTrace,
} from '../../suspension/roll.ts';
import { factorySetup, resolveCorner } from '../../suspension/setup.ts';
import { rollModel, understeerGradient } from '../../suspension/statics.ts';
import { axleOf, isDriven, type ChassisDesign } from '../../suspension-designer/design.ts';
import { designCorner, TYPICAL_RWD, type SuspensionPage } from '../../suspension-designer/page-cars.ts';
import {
  BAR_RANGE_MM, barMmOf, inertiaSource, ROLL_HOT_HATCH, rollChassis, rollDesignOf, rollSpec, withBars, type BarChoice,
  type InertiaSource,
} from '../../suspension-designer/roll-cars.ts';
import { pageName, type PageChoice } from './pages.ts';
import { RollChart, type CamberSeries } from './roll-chart.ts';
import {
  chryslerHtml, inertiaNote, loadLegendHtml, rollRows, understeerCaption, wheelsCaption, type RollFacts,
} from './roll-text.ts';
import { PAGE_COLORS } from './travel-scene.ts';

/** Where the scene opens: the lateral acceleration, g. */
const OPENING_G = 0.6;
/** A sudden turn to nothing would show nothing: below this the turn goes to the opening's acceleration instead, g. */
const SWERVE_MIN_G = 0.2;
/** How fast the skidpad raises the lateral acceleration, g per second. */
const SKIDPAD_G_PER_S = 0.2;
/** Real seconds between two writes of the numbers while the scene plays. */
const WRITE_EVERY_S = 0.1;
/** Wall time a frame may spend on the sweeps of the chart, ms. */
const SWEEP_BUDGET_MS = 6;
/** The two layouts the camber chart sets beside the car (step 5): the strut and the double wishbones, both in front. */
const REFERENCES: ReadonlyArray<{ id: 'macpherson' | 'double-wishbone'; design: ChassisDesign }> = [
  { id: 'macpherson', design: ROLL_HOT_HATCH },
  { id: 'double-wishbone', design: TYPICAL_RWD },
];

/**
 * Whether the axle's 3D has a place for the bar's link (axle-model.ts, barLayout): a strut, a link the spring sits on
 * or that does not steer, or a wishbone. An axle with none of them turns with its bar in the numbers only.
 */
function barSeat(corner: ReturnType<typeof resolveCorner>): boolean {
  const spec = corner.axle.spec;
  const link = spec.linkage;
  if (link.strut || link.wishbones.length > 0) return true;
  const onId = spec.spring.on ?? link.rods.find((r) => !r.steer)?.id;
  return link.rods.some((r) => r.id === onId);
}

// A typographic minus, as the rest of the page writes it.
const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');

const barLabel = (c: Exclude<BarChoice, number>): string => ({ none: t('Немає'), factory: t('Заводський'), thick: t('Товстий') })[c];
const viewLabel = (v: RollView): string => ({ front: t('Передня вісь'), rear: t('Задня вісь'), car: t('Усе шасі') })[v];
const BAR_CHOICES = ['none', 'factory', 'thick'] as const;
const VIEWS: readonly RollView[] = ['front', 'rear', 'car'];

const barControlHtml = (end: 'F' | 'R'): string => `<div class="susp-ctl">
      <span class="susp-ctl-head"><span>${end === 'F' ? t('Стабілізатор спереду') : t('Стабілізатор ззаду')}</span><output id="susp-bar-${end}-value"></output></span>
      <div class="susp-bar-row">
        <div class="segmented" role="group" aria-label="${end === 'F' ? t('Стабілізатор спереду') : t('Стабілізатор ззаду')}" id="susp-bar-${end}">
          ${BAR_CHOICES.map((c) => `<button type="button" data-v="${c}" aria-pressed="false">${barLabel(c)}</button>`).join('')}
        </div>
        <label class="susp-bar-mm"><input type="number" id="susp-bar-${end}-mm" min="0" max="${BAR_RANGE_MM[1]}" step="1" inputmode="numeric" aria-label="${t('Діаметр, мм')}" /> ${t('мм')}</label>
      </div>
    </div>`;

/** The scene's tools under the stage: the lateral acceleration, the view, the construction. */
export const rollToolsHtml = (): string => `<label class="tool susp-ay-tool susp-only-roll">
      <span class="tool-label">${t('Бокове прискорення')}: <output id="susp-ay-value" for="susp-ay"></output></span>
      <input type="range" id="susp-ay" min="0" max="100" step="1" value="${Math.round(OPENING_G * 100)}" />
    </label>
    <div class="tool susp-only-roll">
      <span class="tool-label">${t('Вигляд')}</span>
      <div class="segmented" role="group" aria-label="${t('Вигляд')}" id="susp-roll-view">
        ${VIEWS.map((v) => `<button type="button" data-v="${v}" aria-pressed="false">${viewLabel(v)}</button>`).join('')}
      </div>
    </div>
    <label class="check susp-only-roll"><input type="checkbox" id="susp-roll-centres" checked /> ${t('Центри крену')}</label>`;

/** The scene's dash: the events, the chart, the numbers. */
export const rollDashHtml = (): string => `<footer class="susp-dash susp-roll-dash" id="susp-roll-dash" hidden>
      <section class="susp-dash-event">
        <button type="button" class="btn primary" id="susp-swerve">${t('Різко повернути')}</button>
        <button type="button" class="btn" id="susp-skidpad">${t('Скідпед')}</button>
        <p class="susp-dash-what" id="susp-roll-what"></p>
      </section>
      <section class="susp-dash-chart">
        <div class="susp-strip-legend" id="susp-roll-legend"></div>
        <canvas id="susp-roll-chart" role="img" aria-label="${t('Розвал зовнішнього колеса до дороги залежно від бокового прискорення, або перенесення ваги в часі під час різкого повороту')}"></canvas>
      </section>
      <section class="susp-dash-numbers">
        <dl class="susp-numbers" id="susp-roll-numbers"></dl>
      </section>
      <p class="visually-hidden" id="susp-roll-live" aria-live="polite"></p>
    </footer>`;

/** The scene's part of the panel. */
export const rollPanelHtml = (): string => `<section class="susp-roll-controls susp-only-roll">
      <h3>${t('Крен')}</h3>
      <p class="susp-caption" id="susp-roll-car"></p>
      ${barControlHtml('F')}
      ${barControlHtml('R')}
      <button type="button" class="btn" id="susp-roll-lower" aria-pressed="false">${t('Занизити на 40 мм')}</button>
      <p class="susp-caption" id="susp-roll-understeer"></p>
      <p class="susp-caption alarm" id="susp-roll-wheels"></p>
      <dl class="susp-numbers susp-roll-numbers-phone" id="susp-roll-numbers-phone"></dl>
      ${loadLegendHtml()}
      <div id="susp-roll-article"></div>
    </section>`;

/** What the section lends the scene. */
export interface RollHost {
  viewMode(): ViewMode;
  /** The roll model changed: the section puts it on the stage, keeping the camera when `keepCamera`. */
  showModel(model: RollModel, keepCamera: boolean): void;
  /** The current time mode's factor (1 in true time) and whether the page is held still. */
  timeFactor(): number;
  frozen(): boolean;
  clock(seconds: number | null): void;
}

/** One car of the scene with its bars: everything built from it. */
interface Built {
  key: string;
  design: ChassisDesign;
  chassis: Chassis;
  source: InertiaSource;
  gradient: number;
  understeer: number;
  share: number;
  rest: RollState;
  sweep: RollSweep;
  chrysler: Array<{ heightMm: number; gradient: number }>;
}

type Playing = { kind: 'steady' } | { kind: 'skidpad'; tau: number } | { kind: 'swerve'; tau: number; trace: SwerveTrace };

export class RollScene {
  private readonly $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  private readonly host: RollHost;
  private readonly chart: RollChart;
  private choice: PageChoice | null = null;
  private bars: [BarChoice, BarChoice] = ['factory', 'factory'];
  private lowered = false;
  private view: RollView = 'front';
  private ay = OPENING_G * G;
  private playing: Playing = { kind: 'steady' };
  private built: Built | null = null;
  private model: RollModel | null = null;
  private modelKey = '';
  /** Built cars by key: the factory car of each page (for the understeer it changes from) and the chart's references. */
  private readonly cache = new Map<string, Built>();
  /** The chart's two references as built for the lowering they were built at (advanceSweeps reads them every frame). */
  private refs: { lowered: boolean; built: Built[] } | null = null;
  private readonly state = newRollState();
  private dirty = true;
  private stateDirty = true;
  private active = false;
  private writeAge = Infinity;
  private shownWheels = '';

  constructor($: <T extends HTMLElement = HTMLElement>(id: string) => T, host: RollHost) {
    this.$ = $;
    this.host = host;
    this.chart = new RollChart($<HTMLCanvasElement>('susp-roll-chart'));
    $<HTMLInputElement>('susp-ay').addEventListener('input', (e) => {
      this.ay = (Number((e.target as HTMLInputElement).value) / 100) * G;
      this.playing = { kind: 'steady' };
      this.stateDirty = true;
    });
    onSegment($('susp-roll-view'), (v) => this.setView(v as RollView));
    $<HTMLInputElement>('susp-roll-centres').addEventListener('change', (e) => this.model?.setConstruction((e.target as HTMLInputElement).checked));
    for (const end of ['F', 'R'] as const) {
      onSegment($(`susp-bar-${end}`), (v) => this.setBar(end, v as BarChoice));
      $<HTMLInputElement>(`susp-bar-${end}-mm`).addEventListener('change', (e) => this.setBar(end, Number((e.target as HTMLInputElement).value)));
    }
    $('susp-roll-lower').addEventListener('click', () => {
      this.lowered = !this.lowered;
      this.dirty = true;
    });
    $('susp-swerve').addEventListener('click', () => this.swerve());
    $('susp-skidpad').addEventListener('click', () => this.skidpad());
  }

  /** The page and car shown; the scene builds it when it is next shown. */
  setChoice(choice: PageChoice): void {
    if (this.choice && this.choice.page === choice.page && this.choice.car === choice.car) return;
    this.choice = choice;
    this.bars = ['factory', 'factory'];
    this.lowered = false;
    // A car's page axle first; the strut's hot hatch and the typical cars by the page's own axle.
    this.view = (choice.car ? choice.car.link.end : choice.page.base.end) === 'F' ? 'front' : 'rear';
    this.playing = { kind: 'steady' };
    this.dirty = true;
  }

  /** The scene is shown: builds what changed and puts the model on the stage. */
  enter(): void {
    this.active = true;
    this.dirty = true;
    this.modelKey = '';
    this.apply();
  }

  /** The scene is no longer shown: the section has freed its model. */
  leave(): void {
    this.active = false;
    this.model = null;
    this.modelKey = '';
    this.host.clock(null);
  }

  /** The model to give back to the stage's keeping, if any. */
  get current(): RollModel | null {
    return this.model;
  }

  /** For checks in the browser console. */
  get debug(): { state: RollState; built: Built | null; playing: Playing['kind']; bars: [BarChoice, BarChoice]; view: RollView; lowered: boolean } {
    return { state: this.state, built: this.built, playing: this.playing.kind, bars: this.bars, view: this.view, lowered: this.lowered };
  }

  /** Sets the lateral acceleration as the slider does, m/s². */
  setAy(ay: number): void {
    this.ay = Math.min(G, Math.max(0, ay));
    this.$<HTMLInputElement>('susp-ay').value = String(Math.round((this.ay / G) * 100));
    this.playing = { kind: 'steady' };
    this.stateDirty = true;
  }

  setBar(end: 'F' | 'R', choice: BarChoice): void {
    const i = end === 'F' ? 0 : 1;
    this.bars[i] = typeof choice === 'number' && !Number.isFinite(choice) ? 'factory' : choice;
    this.dirty = true;
  }

  setView(view: RollView): void {
    if (view === this.view) return;
    this.view = view;
    this.dirty = true;
  }

  /** A sudden turn to the slider's acceleration (or the opening's, from a near-straight line). */
  swerve(): void {
    const b = this.built;
    if (!b) return;
    if (this.ay < SWERVE_MIN_G * G) this.setAy(OPENING_G * G);
    const trace = runSwerve(b.chassis, this.ay);
    this.playing = { kind: 'swerve', tau: 0, trace };
    const k = this.chartAxle();
    const n = trace.n;
    const time = new Float32Array(n);
    const links = new Float32Array(n);
    const elastic = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      time[i] = i * SWERVE_EVERY_S;
      const o = 4 * i + 2 * k;
      links[i] = (trace.geometric[o + 1]! - trace.geometric[o]! + trace.unsprung[o + 1]! - trace.unsprung[o]!) / 2;
      elastic[i] = (trace.elastic[o + 1]! - trace.elastic[o]!) / 2;
    }
    this.chart.setTransfer({ t: time, links, elastic, n });
    this.writeLegend();
    this.writeAge = Infinity;
  }

  /** The skidpad: the lateral acceleration rises slowly to the tyres' limit and stays there. */
  skidpad(): void {
    const b = this.built;
    if (!b) return;
    while (!b.sweep.advance(50));
    this.playing = { kind: 'skidpad', tau: 0 };
    this.showCamberChart();
    this.writeAge = Infinity;
  }

  /** The car's key: what it is, its bars and the lowering. */
  private keyOf(design: ChassisDesign, carId: string | null, lowered: boolean): string {
    return JSON.stringify([carId, design, lowered]);
  }

  /** Builds (or finds) the chassis of a design and everything the scene reads from it at once. */
  private build(design: ChassisDesign, carId: string | null, lowered: boolean): Built {
    const key = this.keyOf(design, carId, lowered);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const spec = rollSpec(design, carId);
    let chassis = rollChassis(spec);
    if (lowered) chassis = lowerChassis(chassis, ROLL_LOWER_M);
    const at = 0.4 * G;
    const probe = steadyRoll(chassis, at);
    const half = steadyRoll(chassis, 0.5 * G);
    const lin = rollModel(chassis);
    const built: Built = {
      key,
      design,
      chassis,
      source: inertiaSource(spec),
      gradient: probe ? Math.abs(probe.roll) / at : lin.gradient,
      understeer: (() => {
        try {
          return understeerGradient(chassis, 0.5 * G);
        } catch {
          return Number.NaN;
        }
      })(),
      share: half ? frontTransferShare(half) : lin.frontStiffnessShare,
      rest: steadyRoll(chassis, 0) ?? newRollState(),
      sweep: new RollSweep(chassis),
      chrysler: [0, 65, 132].map((mm) => ({ heightMm: mm, gradient: rigidRollGradient(chassis, lin, mm / 1000) })),
    };
    if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, built);
    return built;
  }

  /** The axle the chart and the camber read: the shown one, the front in the chassis view. */
  private chartAxle(): 0 | 1 {
    return this.view === 'rear' ? 1 : 0;
  }

  /** Rebuilds what the choice, the bars, the lowering or the view changed. */
  private apply(): void {
    this.dirty = false;
    const choice = this.choice ?? { page: SUSPENSION_PAGES[0]!, car: null };
    const carId = choice.car ? choice.car.link.car : null;
    const base = rollDesignOf(choice.page, choice.car);
    const design = withBars(base, this.bars[0], this.bars[1]);
    let built: Built;
    try {
      built = this.build(design, carId, this.lowered);
    } catch {
      // A design the chassis cannot carry (it cannot here, but a link may say otherwise): the car as it was.
      this.bars = ['factory', 'factory'];
      this.lowered = false;
      built = this.build(base, carId, false);
    }
    this.built = built;
    const factory = this.build(base, carId, false);
    const fBar = barMmOf(base, 'F', this.bars[0]);
    const rBar = barMmOf(base, 'R', this.bars[1]);
    // The model: rebuilt only when what it draws changed.
    const modelKey = JSON.stringify([carId, choice.page.id, this.view, fBar > 0, rBar > 0]);
    if (modelKey !== this.modelKey || !this.model) {
      const keep = !!this.model && this.modelKey !== '' && JSON.parse(this.modelKey)[2] === this.view;
      this.modelKey = modelKey;
      this.model = this.newModel(design, carId, built.chassis);
      this.model.setView(this.host.viewMode());
      this.model.setConstruction(this.$<HTMLInputElement>('susp-roll-centres').checked);
      if (this.active) this.host.showModel(this.model, keep);
    }
    this.model.setRest(built.rest);
    // Controls.
    setSegment(this.$('susp-roll-view'), this.view);
    for (const [i, end] of [[0, 'F'], [1, 'R']] as const) {
      const choiceI = this.bars[i];
      setSegment(this.$(`susp-bar-${end}`), typeof choiceI === 'number' ? '' : choiceI);
      const mm = barMmOf(base, end, choiceI);
      const field = this.$<HTMLInputElement>(`susp-bar-${end}-mm`);
      if (document.activeElement !== field) field.value = String(mm);
      this.$(`susp-bar-${end}-value`).textContent = mm > 0 ? t('{value} мм', { value: fmt(mm, 0) }) : t('немає');
    }
    this.$('susp-roll-lower').setAttribute('aria-pressed', String(this.lowered));
    this.$('susp-roll-car').textContent = this.carLine(choice, built);
    const changed = fBar !== axleOf(base, 'F').barMm || rBar !== axleOf(base, 'R').barMm || this.lowered;
    this.$('susp-roll-understeer').textContent = Number.isFinite(built.understeer)
      ? understeerCaption({ now: built.understeer, factory: factory.understeer, share: built.share, factoryShare: factory.share, changed })
      : '';
    this.$('susp-roll-article').innerHTML = chryslerHtml(built.chrysler);
    this.stateDirty = true;
    if (this.playing.kind === 'swerve') this.playing = { kind: 'steady' };
    this.showCamberChart();
  }

  private newModel(design: ChassisDesign, carId: string | null, chassis: Chassis): RollModel {
    const corner = (end: 'F' | 'R') => {
      const c = designCorner(design, end);
      return resolveCorner(c, factorySetup(c));
    };
    let shell: CarChassis | null = null;
    if (this.view === 'car' && carId && Object.hasOwn(CHASSIS_CARS, carId) && Object.hasOwn(CARS, carId)) {
      shell = carChassis(CARS[carId]!, CHASSIS_CARS[carId]!, DRIVE_CARS[carId]?.driveline.diffOutputs ?? {});
    }
    return new RollModel({
      view: this.view,
      chassis,
      axles: [
        { which: 'front', corner: corner('F'), antiRollBar: axleOf(design, 'F').barMm > 0 && barSeat(corner('F')) },
        { which: 'rear', corner: corner('R'), antiRollBar: axleOf(design, 'R').barMm > 0 && barSeat(corner('R')) },
      ],
      shell,
    });
  }

  /** What car this is, in one line: a page's own corner stands on a typical car. */
  private carLine(choice: PageChoice, b: Built): string {
    const who = choice.car
      ? t('{car}: маса, розподіл ваги й колії з даних авто, пружини й стабілізатори типові.', { car: choice.car.link.name })
      : choice.page.id === 'macpherson'
        ? t('Типовий хот-хетч (оцінка): 1250 кг, 62 % ваги спереду, центр мас на 0,55 м, спереду ця стійка JTEKT. Ззаду поки типова багаторичажна без стабілізатора; скручувана балка прийде в цю сцену зі своєю сторінкою.')
        : t('Типове задньопривідне авто (оцінка): 1400 кг, 52 % ваги спереду, подвійні важелі спереду й багаторичажна ззаду.');
    return `${who} ${inertiaNote(b.source)}`;
  }

  /** The camber chart: the car's shown axle and the two layouts beside it. */
  private showCamberChart(): void {
    this.chart.setCamber(this.camberSeries());
    this.writeLegend();
  }

  private camberSeries(): CamberSeries[] {
    const b = this.built;
    if (!b) return [];
    const k = this.chartAxle();
    const of = (sweep: RollSweep, axle: 0 | 1): { ay: number[]; camber: number[] } => ({
      ay: sweep.states.map((s) => s.ay),
      camber: sweep.states.map((s) => s.camberRoad[2 * axle + 1]!),
    });
    const own: CamberSeries = { label: this.ownLabel(k), color: PAGE_COLORS[this.ownLayout(k)], faint: false, ...of(b.sweep, k) };
    const built = this.references();
    const refs = REFERENCES.filter((r) => !(k === 0 && r.design === b.design)).map((r): CamberSeries => {
      const ref = built[REFERENCES.indexOf(r)]!;
      return { label: r.id === 'macpherson' ? t('Стійка JTEKT, типовий хот-хетч') : t('Подвійні важелі, типове авто'), color: PAGE_COLORS[r.id], faint: true, ...of(ref.sweep, 0) };
    });
    return [own, ...refs];
  }

  /** The page layout of the shown axle: a car's other axle is not the page's (the hot hatch's rear is a multilink). */
  private ownLayout(k: 0 | 1): SuspensionPage['id'] {
    const page = this.choice?.page ?? SUSPENSION_PAGES[0]!;
    const layout = this.built ? axleOf(this.built.design, k === 0 ? 'F' : 'R').layout : page.id;
    return SUSPENSION_PAGES.find((p) => p.id === layout)?.id ?? page.id;
  }

  private ownLabel(k: 0 | 1): string {
    const name = this.choice?.car ? this.choice.car.link.name : pageName(this.ownLayout(k));
    return `${name}, ${k === 0 ? t('передня вісь') : t('задня вісь')}`;
  }

  /** The references' built cars at the current lowering, the same array until the lowering changes. */
  private references(): Built[] {
    if (!this.refs || this.refs.lowered !== this.lowered) {
      this.refs = { lowered: this.lowered, built: REFERENCES.map((r) => this.build(r.design, null, this.lowered)) };
    }
    return this.refs.built;
  }

  private writeLegend(): void {
    const legend = this.$('susp-roll-legend');
    if (this.chart.showing === 'transfer') {
      legend.innerHTML = `<span style="--c: #ff9b3d">${t('через важелі й непідресорені маси, миттєво')}</span><span style="--c: #3ccf6e">${t('пружини й стабілізатор, з креном')}</span><span class="faint" style="--c: rgba(236, 230, 214, 0.85)">${t('разом')}</span>`;
      return;
    }
    legend.innerHTML = this.camberSeries()
      .map((s) => `<span${s.faint ? ' class="faint"' : ''} style="--c: ${s.color}">${s.label}</span>`)
      .join('');
  }

  /** Builds more of the chart's sweeps within the frame's budget, redrawing when one grew. */
  private advanceSweeps(): void {
    if (this.chart.showing !== 'camber' || !this.built) return;
    const refs = this.references();
    if (this.built.sweep.done && refs.every((r) => r.sweep.done)) return;
    const until = performance.now() + SWEEP_BUDGET_MS;
    let grew = false;
    for (let i = -1; i < refs.length; i++) {
      const s = i < 0 ? this.built.sweep : refs[i]!.sweep;
      if (s.done) continue;
      const before = s.states.length;
      s.advance(Math.max(0.5, until - performance.now()));
      grew ||= s.states.length !== before;
      if (performance.now() >= until) break;
    }
    if (grew) this.chart.setCamber(this.camberSeries());
  }

  frame(dt: number): void {
    if (this.dirty) this.apply();
    const b = this.built;
    if (!b || !this.model) return;
    const frozen = this.host.frozen();
    const step = frozen ? 0 : dt * this.host.timeFactor();
    const p = this.playing;
    if (p.kind === 'steady') {
      if (this.stateDirty) {
        this.stateDirty = false;
        const s = steadyRoll(b.chassis, this.ay);
        if (s) copyRollState(s, this.state);
        else {
          // No steady state this far: the car goes over. The slider stops where the sweep ends.
          while (!b.sweep.advance(50));
          b.sweep.at(b.sweep.endAy, this.state);
        }
        this.write();
      }
      this.host.clock(null);
    } else if (p.kind === 'skidpad') {
      p.tau += step;
      const limit = b.sweep.limitAy;
      const ay = Math.min(limit, p.tau * SKIDPAD_G_PER_S * G);
      b.sweep.at(ay, this.state);
      this.$<HTMLInputElement>('susp-ay').value = String(Math.round((ay / G) * 100));
      this.ay = ay;
      this.host.clock(null);
      this.maybeWrite(dt);
    } else {
      p.tau = Math.min(p.tau + step, swerveSeconds(p.trace) + 0.001);
      swerveAt(p.trace, p.tau, this.state);
      this.host.clock(Math.round(p.tau * 1000) / 1000);
      this.chart.draw(p.tau);
      this.maybeWrite(dt);
    }
    if (p.kind !== 'swerve') this.chart.draw(this.state.ay);
    this.model.update(this.state);
    this.advanceSweeps();
  }

  private maybeWrite(dt: number): void {
    this.writeAge += dt;
    if (this.writeAge < WRITE_EVERY_S) return;
    this.writeAge = 0;
    this.write();
  }

  /** The numbers, the line in the dash and the caption about the wheels, for the state shown. */
  private write(): void {
    const b = this.built;
    const model = this.model;
    if (!b || !model) return;
    // The model's roll centres follow the state it last drew: draw this one first.
    model.update(this.state);
    const axles: Array<0 | 1> = this.view === 'front' ? [0] : this.view === 'rear' ? [1] : [0, 1];
    const xs = b.chassis.sprung.cgX;
    const rise = (s: RollState): number => axles.reduce<number>((sum, k) => sum + s.z - (b.chassis.axleX[k] - xs) * s.pitch, 0) / axles.length;
    const facts: RollFacts = {
      gradient: b.gradient,
      axles,
      rollCentres: model.rollCentres.map((r) => r.z),
      jackM: rise(this.state) - rise(b.rest),
      staticN: b.chassis.corners.map((c) => c.staticN),
    };
    const rows = rollRows(this.state, facts);
    const html = rows.map((r) => `<div class="susp-number${r.alarm ? ' alarm' : ''}" data-row="${r.id}"><dt>${r.label}</dt><dd>${r.value}</dd></div>`).join('');
    this.$('susp-roll-numbers').innerHTML = html;
    this.$('susp-roll-numbers-phone').innerHTML = html;
    this.$('susp-ay-value').textContent = t('{value} g', { value: fmt(this.state.ay / G, 2) });
    const p = this.playing;
    this.$('susp-roll-what').textContent =
      p.kind === 'swerve'
        ? t('Різкий поворот: {value} g за 0,3 с.', { value: fmt(p.trace.targetAy / G, 2) }) + (p.trace.rolledOver ? ' ' + t('Авто перекинулося.') : '')
        : p.kind === 'skidpad'
          ? t('Скідпед: прискорення росте до межі шин, {value} g.', { value: fmt(b.sweep.limitAy / G, 2) })
          : t('Сталий поворот ліворуч: праві колеса зовнішні.');
    const wheels = wheelsCaption(this.state, facts.staticN, isDriven(b.design.drive, 'F'));
    const el = this.$('susp-roll-wheels');
    if (el.textContent !== wheels) el.textContent = wheels;
    if (wheels !== this.shownWheels) {
      this.shownWheels = wheels;
      this.$('susp-roll-live').textContent = wheels;
    }
  }

  resize(): void {
    this.chart.resize();
  }
}
