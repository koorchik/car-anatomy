// The oil-on-track page (#/sump): a real engine in its car laps the test circuit while the oil sloshes in its pan.
// The lap and the oil are worked out ahead (src/vehicle, src/lubrication) and played back here, so the 3D, the gauges,
// the comparison table and the tests all see the same numbers. The engine on stage, the sound and the systems layers
// belong to main.ts and are reached through SumpHost.

import { engineById, engineFacts } from '../../data/engines.ts';
import { DEFAULT_SUMP_CAR, genericCar, SUMP_CARS, sumpCarFor, type SumpCar } from '../../data/sump-cars.ts';
import { decodeDesign, encodeDesign } from '../../designer/codec.ts';
import { isRotary, type Design } from '../../designer/design.ts';
import { SUMP_NAMES } from '../../designer/lubrication.ts';
import { evaluate } from '../../designer/physics.ts';
import { designFromSpec } from '../../designer/presets.ts';
import { designToSpec } from '../../designer/to-spec.ts';
import { buildEngine, type Engine } from '../../engine/kinematics.ts';
import { SUMP_KINDS, systemsOf, type SumpKind, type SystemsSpec } from '../../engine/systems-spec.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { ACCUMULATOR_DEAD_L, ACCUMULATOR_L } from '../../lubrication/constants.ts';
import { buildersRule } from '../../lubrication/bearings.ts';
import { worstMoments, type OilMoment, type Phase } from '../../lubrication/events.ts';
import type { LubeRun, LubeRunner, RiskBand } from '../../lubrication/run.ts';
import { lapFor, oilRunner, setupFor, systemsWith, type OilChoice } from '../../lubrication/scenario.ts';
import type { EngineModel } from '../../scene/model-types.ts';
import { SumpScene, type SumpSceneFrame } from '../../scene/lubrication/sump-scene.ts';
import { RELIEF_BAR, RELIEF_BAR_HEAVY } from '../../systems/oil.ts';
import { WELL_PLACES, type WellPlace } from '../../systems/sump.ts';
import { newLapSample, sampleLap, type LapSample, type LapTrace } from '../../vehicle/lap.ts';
import { TYRE_IDS, TYRES, type TyreId, type VehicleSpec } from '../../vehicle/vehicle.ts';
import { Tacho } from '../tacho.ts';
import { nextTask } from '../next-task.ts';
import { sumpArticleHtml } from './article.ts';
import { GgMeter, PressureGauge, StripChart, TrackMap } from './gauges.ts';

export interface SumpHost {
  /** Puts this engine on stage and gives back its model. */
  showEngine(engine: Engine, keepCamera: boolean): EngineModel;
  /** Title and line under it. */
  heading(title: string, sub: string): void;
  /** Starts the engine's sound on the first call; then follows the lap's speed and throttle. Null stops it. */
  sound(rpm: number | null, throttle: number): void;
  /** The share of oil the pump gets, for the oil layer's flow. */
  oilSupply(share: number): void;
  showFailure(part: string | null): void;
}

export interface SumpFrame {
  rpm: number;
  throttle: number;
  running: boolean;
}

type Source = { kind: 'car'; car: SumpCar } | { kind: 'design'; design: Design; code: string };

const STEPS_PER_SLICE = 1500;


const fmt = (v: number, digits = 1): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const BAND_TEXT: Record<RiskBand, string> = {
  none: t('знос незначний'),
  hundreds: t('сотні кіл'),
  tens: t('десятки кіл'),
  few: t('кілька кіл'),
  lap: t('не доїде коло'),
};

const PHASE_TEXT: Record<Phase, string> = {
  braking: t('гальмування'),
  cornering: t('поворот'),
  accelerating: t('розгін'),
  crest: t('горб'),
};

const KIND_SHORT: Record<SumpKind, string> = {
  wet: t('Мокрий'),
  baffled: t('З перегородками'),
  'integrated-dry': t('Інтегрований сухий'),
  dry: t('Сухий'),
};

const PLACE_TEXT: Record<WellPlace, string> = {
  front: t('Спереду'),
  middle: t('Посередині'),
  rear: t('Ззаду'),
};

/** The car and its engine in one name, without saying the car twice when the engine's name already does. */
const carEngineName = (car: string, engine: string): string => (engine.includes(car) ? engine : `${car} · ${engine}`);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const segmented = (label: string, options: Array<[string, string]>, onPick: (value: string) => void): { root: HTMLElement; set: (value: string, factory?: string) => void; disable: (value: string, off: boolean) => void } => {
  const root = el('div', 'sump-field');
  root.append(el('span', 'sump-label', label));
  const group = el('div', 'segmented sump-segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const buttons = options.map(([value, text]) => {
    const b = el('button', '', text);
    b.type = 'button';
    b.dataset.v = value;
    b.addEventListener('click', () => onPick(value));
    group.append(b);
    return b;
  });
  root.append(group);
  return {
    root,
    set(value, factory) {
      for (const b of buttons) {
        b.setAttribute('aria-pressed', String(b.dataset.v === value));
        b.classList.toggle('factory', b.dataset.v === factory);
        b.title = b.dataset.v === factory ? t('заводський') : '';
      }
    },
    disable(value, off) {
      const b = buttons.find((x) => x.dataset.v === value);
      if (b) b.disabled = off;
    },
  };
};

export class SumpPage {
  private readonly host: SumpHost;
  readonly panel: HTMLElement;
  readonly dash: HTMLElement;
  readonly summary: HTMLElement;
  private readonly live: HTMLElement;
  // Choices.
  private source: Source = { kind: 'car', car: DEFAULT_SUMP_CAR };
  private sumpKind: SumpKind = 'wet';
  private tyre: TyreId = 'street';
  private oilDeltaL = 0;
  private accumulator = false;
  private place: WellPlace = 'middle';
  // What is on stage and being played.
  private engine: Engine | null = null;
  private baseSystems: SystemsSpec | null = null;
  private car: VehicleSpec = DEFAULT_SUMP_CAR.vehicle;
  private trace: LapTrace | null = null;
  private run: LubeRun | null = null;
  private runner: LubeRunner | null = null;
  private scene: SumpScene | null = null;
  private model: EngineModel | null = null;
  private time = 0;
  private playing = false;
  private speed = 1;
  private soundOn = false;
  private health = 1;
  private broken = false;
  private active = false;
  private generation = 0;
  private readonly compare = new Map<string, LubeRun>();
  private compareQueue: Array<{ key: string; choice: OilChoice }> = [];
  private compareRunner: { key: string; runner: LubeRunner } | null = null;
  private moments: OilMoment[] = [];
  /** What each head holds at most, and the suction tube's bore, of the setup on stage. */
  private headCapacity = 1;
  private tubeArea = 3e-4;
  private lastText = 0;
  private lastSound = 0;
  private lastAnnounce = '';
  private readonly sample: LapSample = newLapSample();
  private readonly sceneFrame: SumpSceneFrame = { levelOut: 0, levelBox: 0, slopeX: 0, slopeZ: 0, pickupOil: 1, pumpSupply: 1, boxFlow: 0, heads: new Float32Array(4), tankShare: 0, accumulatorShare: 0, dt: 0, tubeSpeed: 0 };
  // Widgets.
  private readonly tacho = new Tacho();
  private readonly gauge = new PressureGauge();
  private readonly gg = new GgMeter();
  private readonly map = new TrackMap();
  private readonly strip = new StripChart();
  private readonly carSelect: HTMLSelectElement;
  private readonly kindField;
  private readonly tyreField;
  private readonly oilField;
  private readonly placeField;
  private readonly accToggle: HTMLInputElement;
  private readonly accRow: HTMLElement;
  private readonly table: HTMLElement;
  private readonly momentsList: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly speedButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly bearingBar: HTMLElement;
  private readonly bearingText: HTMLElement;
  private readonly status: HTMLElement;
  private readonly failure: HTMLElement;
  private readonly lines: HTMLElement[];
  private readonly flags: HTMLElement;
  private readonly rpmText: HTMLElement;

  constructor(host: SumpHost) {
    this.host = host;
    this.panel = el('div', 'sump-panel');
    this.dash = el('div', 'sump-dash-inner');
    this.summary = el('div', 'sump-summary-inner');
    this.live = el('div', 'visually-hidden');
    this.live.setAttribute('aria-live', 'polite');

    // Panel: the car, the sump, the tyres, the oil, the well, the accumulator, the comparison, the worst moments, the article.
    const carField = el('label', 'sump-field');
    carField.append(el('span', 'sump-label', t('Двигун і автомобіль')));
    this.carSelect = el('select', 'sump-select');
    this.carSelect.addEventListener('change', () => this.pickCar(this.carSelect.value));
    carField.append(this.carSelect);
    this.kindField = segmented(t('Картер'), SUMP_KINDS.map((k) => [k, KIND_SHORT[k]]), (v) => this.choose({ kind: v as SumpKind }));
    this.tyreField = segmented(t('Шини'), TYRE_IDS.map((id) => [id, TYRES[id].name]), (v) => this.choose({ tyre: v as TyreId }));
    this.oilField = segmented(t('Олива'), [['0', t('Повно')], ['-1', t('Мінімум (−1 л)')]], (v) => this.choose({ oil: Number(v) }));
    this.placeField = segmented(t('Колодязь піддона'), WELL_PLACES.map((p) => [p, PLACE_TEXT[p]]), (v) => this.choose({ place: v as WellPlace }));
    this.accRow = el('label', 'check sump-check');
    this.accToggle = el('input');
    this.accToggle.type = 'checkbox';
    this.accToggle.addEventListener('change', () => this.choose({ accumulator: this.accToggle.checked }));
    this.accRow.append(this.accToggle, document.createTextNode(` ${t('Акумулятор оливи')}`));
    this.table = el('div', 'sump-compare');
    this.momentsList = el('div', 'sump-moments');
    const article = el('div', 'sump-article');
    article.innerHTML = sumpArticleHtml();
    this.panel.append(carField, this.kindField.root, this.tyreField.root, this.oilField.root, this.placeField.root, this.accRow, el('h3', '', t('Те саме коло з іншим картером')), this.table, el('h3', '', t('Найгірші моменти кола')), this.momentsList, article);

    // Dash: playback, tachometer, pressure, g-g, map, strip chart and the bearings.
    const controls = el('section', 'sump-play');
    this.playButton = el('button', 'ignition', t('Поїхали'));
    this.playButton.type = 'button';
    this.playButton.addEventListener('click', () => this.togglePlay());
    const row = el('div', 'sump-play-row');
    this.speedButton = el('button', 'btn', '×1');
    this.speedButton.type = 'button';
    this.speedButton.title = t('Швидкість програвання');
    this.speedButton.addEventListener('click', () => this.setSpeed(this.speed === 1 ? 0.25 : 1));
    this.soundButton = el('button', 'btn', t('Звук'));
    this.soundButton.type = 'button';
    this.soundButton.setAttribute('aria-pressed', 'false');
    this.soundButton.addEventListener('click', () => this.toggleSound());
    const restart = el('button', 'btn', t('З початку'));
    restart.type = 'button';
    restart.addEventListener('click', () => this.seek(0));
    restart.classList.add('sump-restart');
    this.rpmText = el('span', 'sump-rpm');
    row.append(this.speedButton, this.soundButton, restart, this.rpmText);
    const bearings = el('div', 'health sump-bearings');
    bearings.setAttribute('role', 'meter');
    bearings.setAttribute('aria-label', t('Ресурс вкладишів'));
    bearings.setAttribute('aria-valuemin', '0');
    bearings.setAttribute('aria-valuemax', '100');
    const track = el('i');
    this.bearingBar = el('u');
    track.append(this.bearingBar);
    this.bearingText = el('b', '', '100%');
    bearings.append(el('span', '', t('Вкладиші')), track, this.bearingText);
    controls.append(this.playButton, row, bearings);
    const tachoBox = el('section', 'sump-tacho');
    tachoBox.append(this.tacho.element);
    const gaugeBox = el('section', 'sump-instrument');
    gaugeBox.append(el('h4', '', t('Тиск оливи')), this.gauge.element);
    const ggBox = el('section', 'sump-instrument');
    ggBox.append(el('h4', '', t('Перевантаження')), this.gg.element);
    const mapBox = el('section', 'sump-instrument sump-map');
    mapBox.append(el('h4', '', t('Коло')), this.map.element);
    this.map.element.addEventListener('click', (event) => {
      const rect = this.map.element.getBoundingClientRect();
      const at = this.map.timeAt(event.clientX - rect.left, event.clientY - rect.top);
      if (at !== null) this.seek(at);
    });
    const stripBox = el('section', 'sump-instrument sump-strip');
    stripBox.append(el('h4', '', t('Останні 20 секунд')), this.strip.element);
    this.dash.append(controls, tachoBox, gaugeBox, ggBox, mapBox, stripBox);

    // Summary over the model.
    this.status = el('p', 'sump-status');
    // On a phone only the pressure and the pickup lines stay.
    this.lines = [el('div', 'sump-line'), el('div', 'sump-line extra'), el('div', 'sump-line'), el('div', 'sump-line extra')];
    this.flags = el('div', 'sump-flags');
    this.failure = el('div', 'sump-failure');
    this.failure.hidden = true;
    this.summary.append(this.status, ...this.lines, this.flags, this.failure);
    this.summary.setAttribute('role', 'status');
    this.summary.setAttribute('aria-live', 'off');
  }

  /** The route's choices: #/sump/<engine id>?k=&t=&o=&a=&w= or #/sump/design/<code>?... */
  static parse(hash: string): { source: Source | null; params: URLSearchParams } {
    const [path, query] = hash.replace(/^#\/sump\/?/, '').split('?');
    const params = new URLSearchParams(query ?? '');
    if (!path) return { source: null, params };
    if (path.startsWith('design/')) {
      const code = path.slice(7);
      const design = decodeDesign(code);
      return { source: design && !isRotary(design) ? { kind: 'design', design, code } : null, params };
    }
    const car = sumpCarFor(path);
    if (car) return { source: { kind: 'car', car }, params };
    // A catalogue engine outside the selection rides in the generic car.
    const spec = engineById(path);
    if (spec && spec.layout.kind !== 'wankel') {
      const facts = engineFacts(path);
      return { source: { kind: 'car', car: { engineId: path, vehicle: genericCar(spec.example, facts?.powerHp ?? 300), well: 'middle', note: '', sources: [], unverified: ['massKg'] } }, params };
    }
    return { source: null, params };
  }

  get isActive(): boolean {
    return this.active;
  }

  enter(hash: string): void {
    const wasActive = this.active;
    this.active = true;
    const { source, params } = SumpPage.parse(hash);
    const nextSource = source ?? (wasActive ? this.source : { kind: 'car', car: DEFAULT_SUMP_CAR });
    const changedEngine = !wasActive || this.sourceKey(nextSource) !== this.sourceKey(this.source);
    this.source = nextSource;
    const spec = this.specOf(nextSource);
    const factoryKind = systemsOf(spec).sump;
    const k = params.get('k');
    this.sumpKind = (SUMP_KINDS as readonly string[]).includes(k ?? '') ? (k as SumpKind) : changedEngine ? factoryKind : this.sumpKind;
    const ty = params.get('t');
    this.tyre = (TYRE_IDS as readonly string[]).includes(ty ?? '') ? (ty as TyreId) : changedEngine ? 'street' : this.tyre;
    this.oilDeltaL = params.get('o') === '-1' ? -1 : params.get('o') === '0' ? 0 : changedEngine ? 0 : this.oilDeltaL;
    this.accumulator = params.get('a') === '1' ? true : params.get('a') === '0' ? false : changedEngine ? false : this.accumulator;
    const w = params.get('w');
    const factoryPlace = nextSource.kind === 'car' ? nextSource.car.well : 'middle';
    this.place = (WELL_PLACES as readonly string[]).includes(w ?? '') ? (w as WellPlace) : changedEngine ? factoryPlace : this.place;
    this.fillCarSelect();
    this.rebuild(changedEngine);
  }

  leave(): void {
    this.active = false;
    this.playing = false;
    this.generation++;
    this.scene?.dispose();
    this.scene = null;
    this.model = null;
    if (this.soundOn) {
      this.soundOn = false;
      this.host.sound(null, 0);
    }
    this.host.showFailure(null);
    this.host.oilSupply(1);
  }

  private sourceKey(s: Source): string {
    return s.kind === 'car' ? s.car.engineId : `design:${s.code}`;
  }

  private specOf(s: Source) {
    if (s.kind === 'car') return engineById(s.car.engineId)!;
    const d = s.design;
    return designToSpec(d, evaluate(d));
  }

  private designOf(s: Source): Design {
    return s.kind === 'car' ? designFromSpec(engineById(s.car.engineId)!) : s.design;
  }

  private publishedHp(s: Source): number | null {
    return s.kind === 'car' ? (engineFacts(s.car.engineId)?.powerHp ?? null) : null;
  }

  private fillCarSelect(): void {
    const options: Array<[string, string]> = SUMP_CARS.map((c) => [c.engineId, carEngineName(c.vehicle.name, engineFacts(c.engineId)?.name ?? c.engineId)]);
    const s = this.source;
    if (s.kind === 'car' && !sumpCarFor(s.car.engineId)) options.push([s.car.engineId, `${s.car.vehicle.name}`]);
    if (s.kind === 'design') options.push([`design/${s.code}`, t('Свій з конструктора: {name}', { name: s.design.name })]);
    this.carSelect.replaceChildren(...options.map(([value, text]) => Object.assign(document.createElement('option'), { value, textContent: text })));
    this.carSelect.value = s.kind === 'car' ? s.car.engineId : `design/${s.code}`;
  }

  private pickCar(value: string): void {
    location.hash = `#/sump/${value}`;
  }

  /** The address for the current choices, without adding history for each click. */
  private writeRoute(): void {
    const s = this.source;
    const path = s.kind === 'car' ? s.car.engineId : `design/${s.code}`;
    const q = new URLSearchParams({ k: this.sumpKind, t: this.tyre, o: String(this.oilDeltaL), a: this.accumulator ? '1' : '0', w: this.place });
    const next = `#/sump/${path}?${q.toString()}`;
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  private choose(c: { kind?: SumpKind; tyre?: TyreId; oil?: number; place?: WellPlace; accumulator?: boolean }): void {
    if (c.kind) this.sumpKind = c.kind;
    if (c.tyre) this.tyre = c.tyre;
    if (c.oil !== undefined) this.oilDeltaL = c.oil;
    if (c.place) this.place = c.place;
    if (c.accumulator !== undefined) this.accumulator = c.accumulator;
    this.writeRoute();
    this.rebuild(false);
  }

  private choice(kind = this.sumpKind): OilChoice {
    return { kind, oilDeltaL: this.oilDeltaL, accumulator: this.accumulator && kind !== 'dry', place: this.place };
  }

  /** New engine, sump or tyres: the model, the lap and the oil are worked out again. The lap keeps its place. */
  private rebuild(newEngine: boolean): void {
    const s = this.source;
    const spec = this.specOf(s);
    this.car = s.kind === 'car' ? s.car.vehicle : genericCar(s.design.name, evaluate(s.design).peakPower.powerHp);
    this.baseSystems = systemsOf(spec);
    const systems = systemsWith(this.baseSystems, this.choice(), this.car);
    const engine = buildEngine({ ...spec, systems });
    this.engine = engine;
    this.scene?.dispose();
    this.model = this.host.showEngine(engine, !newEngine);
    const setup = setupFor(engine, this.baseSystems, this.car, this.choice());
    this.headCapacity = setup.heads[0]?.capacityL ?? 1;
    this.tubeArea = (Math.PI / 4) * setup.tube.d * setup.tube.d;
    this.scene = new SumpScene(engine, systems, this.car.mount, { accumulator: this.choice().accumulator, heads: setup.heads.map((h) => h.alpha), inlet: { y: setup.tube.inletY, z: engine.zMax * 0.01 + 0.12 * engine.spec.bore * 0.01 } });
    this.scene.addTo(this.model.mounted);
    this.tacho.configure(engine.spec.redlineRpm);
    const factory = systemsOf(spec).sump;
    this.kindField.set(this.sumpKind, factory);
    this.tyreField.set(this.tyre);
    this.oilField.set(String(this.oilDeltaL));
    this.placeField.set(this.place, s.kind === 'car' ? s.car.well : 'middle');
    for (const p of WELL_PLACES) this.placeField.disable(p, this.sumpKind === 'dry');
    this.accToggle.checked = this.accumulator && this.sumpKind !== 'dry';
    this.accToggle.disabled = this.sumpKind === 'dry';
    this.accRow.classList.toggle('dimmed', this.sumpKind === 'dry');
    const title = t('Олива на треку');
    const name = s.kind === 'car' ? (engineFacts(s.car.engineId)?.name ?? spec.example) : s.design.name;
    this.host.heading(title, t('{car} · {sump} · {mass} кг', { car: name, sump: SUMP_NAMES[this.sumpKind], mass: Math.round(this.car.massKg) }));
    this.trace = lapFor(this.designOf(s), this.publishedHp(s), this.car, this.tyre);
    this.time = Math.min(this.time, this.trace.lapTime);
    this.gg.clear();
    this.startRun();
  }

  private runKey(kind: SumpKind): string {
    const c = this.choice(kind);
    return `${this.sourceKey(this.source)} ${this.tyre} ${c.kind} ${c.oilDeltaL} ${c.accumulator} ${c.place}`;
  }

  /** Works the oil out in slices between frames, then the comparison table, the same way. */
  private startRun(): void {
    const generation = ++this.generation;
    const engine = this.engine!;
    const trace = this.trace!;
    const key = this.runKey(this.sumpKind);
    const cached = this.compare.get(key);
    this.compareQueue = [];
    this.compareRunner = null;
    if (cached) {
      this.useRun(cached);
    } else {
      this.run = null;
      this.runner = oilRunner(engine, this.baseSystems!, this.car, trace, this.choice());
    }
    this.renderTable();
    for (const kind of SUMP_KINDS) {
      const k = this.runKey(kind);
      if (!this.compare.has(k) && k !== key) this.compareQueue.push({ key: k, choice: this.choice(kind) });
    }
    const slice = (): void => {
      if (generation !== this.generation || !this.active) return;
      if (this.runner) {
        if (this.runner.advance(STEPS_PER_SLICE)) {
          const run = this.runner.run;
          this.compare.set(key, run);
          this.runner = null;
          this.useRun(run);
          this.renderTable();
        }
      } else if (this.compareRunner) {
        if (this.compareRunner.runner.advance(STEPS_PER_SLICE)) {
          this.compare.set(this.compareRunner.key, this.compareRunner.runner.run);
          this.compareRunner = null;
          this.renderTable();
        }
      } else if (this.compareQueue.length) {
        const next = this.compareQueue.shift()!;
        this.compareRunner = { key: next.key, runner: oilRunner(engine, this.baseSystems!, this.car, trace, next.choice) };
      } else {
        return;
      }
      nextTask(slice);
    };
    nextTask(slice);
    if (this.compare.size > 64) this.compare.clear();
  }

  private useRun(run: LubeRun): void {
    this.run = run;
    this.moments = worstMoments(run, this.trace!);
    this.map.setLap(this.trace!, run);
    this.renderMoments();
    this.lastText = 0;
  }

  private renderTable(): void {
    const rows = SUMP_KINDS.map((kind) => {
      const run = this.compare.get(this.runKey(kind));
      const factory = this.baseSystems?.sump === kind;
      const name = `${KIND_SHORT[kind]}${factory ? ` <small>${t('заводський')}</small>` : ''}`;
      if (!run) return `<tr${kind === this.sumpKind ? ' class="current"' : ''}><th>${name}</th><td colspan="3">${t('Рахую коло…')}</td></tr>`;
      const s = run.summary;
      const band = s.band === 'none' ? '' : s.band === 'hundreds' ? ' warn' : ' bad';
      return `<tr${kind === this.sumpKind ? ' class="current"' : ''}><th>${name}</th><td>${fmt(s.minPressure)}</td><td>${fmt(s.belowNeedS)}</td><td class="band${band}">${BAND_TEXT[s.band]}</td></tr>`;
    }).join('');
    this.table.innerHTML = `<table><thead><tr><th>${t('Картер')}</th><th>${t('Мін. тиск, бар')}</th><th>${t('Нижче потрібного, с')}</th><th>${t('Вкладиші витримають')}</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note small">${t('Шини: {tyre}, олива: {oil}. Кіл до поломки модель дає лише за порядком величини.', { tyre: TYRES[this.tyre].name.toLowerCase(), oil: this.oilDeltaL < 0 ? t('мінімум за щупом') : t('повно') })}</p>`;
  }

  private renderMoments(): void {
    if (!this.moments.length) {
      this.momentsList.innerHTML = `<p class="note">${t('Тиск ніде не падає нижче потрібного.')}</p>`;
      return;
    }
    this.momentsList.replaceChildren(
      ...this.moments.map((m) => {
        const row = el('div', 'sump-moment');
        const text = el('span', '', t('{sector}, {phase}: {s} с нижче потрібного, до {p} бар', { sector: m.sector || t('між поворотами'), phase: PHASE_TEXT[m.phase], s: fmt(m.end - m.start + 0.01), p: fmt(m.lowest) }));
        const show = el('button', 'btn', t('Показати'));
        show.type = 'button';
        show.addEventListener('click', () => {
          this.seek(Math.max(0, m.start - 1));
          this.setSpeed(0.25);
          this.playing = true;
          this.syncPlay();
        });
        row.append(text, show);
        return row;
      }),
    );
  }

  private togglePlay(): void {
    if (this.broken) {
      this.repair();
      return;
    }
    this.playing = !this.playing;
    this.syncPlay();
  }

  private syncPlay(): void {
    this.playButton.textContent = this.broken ? t('Відремонтувати') : this.playing ? t('Пауза') : t('Поїхали');
    this.playButton.classList.toggle('on', this.playing);
  }

  private setSpeed(speed: number): void {
    this.speed = speed;
    this.speedButton.textContent = speed === 1 ? '×1' : '×¼';
    if (speed !== 1 && this.soundOn) this.host.sound(null, 0);
  }

  private toggleSound(): void {
    this.soundOn = !this.soundOn;
    this.soundButton.setAttribute('aria-pressed', String(this.soundOn));
    if (!this.soundOn) this.host.sound(null, 0);
    this.lastSound = 0;
  }

  seek(time: number): void {
    if (!this.trace) return;
    this.time = Math.max(0, Math.min(this.trace.lapTime - 1e-6, time));
    this.gg.clear();
  }

  private repair(): void {
    this.broken = false;
    this.health = 1;
    this.failure.hidden = true;
    this.host.showFailure(null);
    this.syncPlay();
  }

  /** Space plays and pauses, arrows move by five seconds. True if the key was handled. */
  key(event: KeyboardEvent): boolean {
    if (event.code === 'Space') {
      this.togglePlay();
      return true;
    }
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
      this.seek(this.time + (event.code === 'ArrowRight' ? 5 : -5));
      return true;
    }
    // The layer keys and the ignition belong to the catalogue; the page drives the engine itself.
    return event.code.startsWith('Digit') || event.code === 'KeyS';
  }

  resize(): void {
    const box = (c: HTMLCanvasElement): void => {
      const parent = c.parentElement!;
      const head = parent.querySelector('h4');
      this.gaugeSize(c, parent.clientWidth - 16, parent.clientHeight - (head?.offsetHeight ?? 0) - 18);
    };
    for (const w of [this.gauge, this.gg, this.map, this.strip]) box(w.element);
  }

  private gaugeSize(c: HTMLCanvasElement, w: number, h: number): void {
    const widget = [this.gauge, this.gg, this.map, this.strip].find((x) => x.element === c)!;
    widget.resize(Math.max(40, w), Math.max(40, h));
  }

  frame(dt: number): SumpFrame {
    const trace = this.trace;
    const run = this.run;
    if (!this.active || !trace) return { rpm: 0, throttle: 0, running: false };
    if (this.playing && run && !this.broken) this.time = (this.time + dt * this.speed) % trace.lapTime;
    sampleLap(trace, this.time, this.sample);
    const smp = this.sample;
    const i = run ? Math.min(run.count - 1, Math.floor(this.time / run.dt)) : 0;
    if (run && this.scene) {
      const f = this.sceneFrame;
      f.levelOut = run.levelOut[i]!;
      f.levelBox = run.levelBox[i]!;
      f.slopeX = run.slopeX[i]!;
      f.slopeZ = run.slopeZ[i]!;
      f.pickupOil = run.pickupOil[i]!;
      f.pumpSupply = run.pumpSupply[i]!;
      f.boxFlow = run.boxFlow[i]!;
      const heads = f.heads as Float32Array;
      for (let h = 0; h < run.headL.length && h < heads.length; h++) heads[h] = run.headL[h]![i]! / this.headCapacity;
      f.tankShare = this.scene.layout.tank ? Math.min(1, run.tankL[i]! / Math.max(0.5, (Math.PI * this.scene.layout.tank.radius ** 2 * this.scene.layout.tank.height))) : 0;
      f.accumulatorShare = run.accOilL[i]! / (ACCUMULATOR_L - ACCUMULATOR_DEAD_L);
      f.dt = this.playing ? dt * this.speed : 0;
      f.tubeSpeed = run.delivered[i]! / 1000 / this.tubeArea;
      this.scene.update(f);
      this.host.oilSupply(run.pumpSupply[i]!);
      if (this.playing && !this.broken) {
        this.health -= run.wearRate[i]! * dt * this.speed;
        if (this.health <= 0) this.breakDown();
      }
    }
    this.tacho.update(smp.rpm, false);
    const relief = this.engine && (this.engine.spec.aspiration !== 'na' || this.engine.spec.fuel === 'diesel') ? RELIEF_BAR_HEAVY : RELIEF_BAR;
    if (run) this.gauge.draw(run.pressure[i]!, run.need[i]!, relief, buildersRule(smp.rpm));
    this.gg.draw(smp.axF, smp.ayF, this.tyre, this.playing);
    this.map.draw(smp.index);
    if (run) this.strip.draw(run, trace, this.time);
    if (this.soundOn && this.speed === 1 && this.playing) {
      const now = performance.now();
      if (now - this.lastSound > 50) {
        this.lastSound = now;
        this.host.sound(smp.rpm, smp.throttle);
      }
    }
    const now = performance.now();
    if (now - this.lastText > 200) {
      this.lastText = now;
      this.renderSummary(i);
    }
    return { rpm: smp.rpm, throttle: smp.throttle, running: true };
  }

  private breakDown(): void {
    this.health = 0;
    this.broken = true;
    this.playing = false;
    this.failure.hidden = false;
    this.failure.textContent = t('Провернуло шатунний вкладиш: олива не дійшла до підшипника.');
    this.host.showFailure('bearing');
    if (this.soundOn) this.host.sound(null, 0);
    this.live.textContent = this.failure.textContent;
    this.syncPlay();
  }

  private renderSummary(i: number): void {
    const run = this.run;
    const percent = Math.max(0, Math.round(this.health * 100));
    this.bearingBar.style.width = `${percent}%`;
    this.bearingBar.classList.toggle('low', this.health < 0.35);
    this.bearingText.textContent = `${percent}%`;
    this.bearingText.parentElement?.setAttribute('aria-valuenow', String(percent));
    const smp = this.sample;
    const sector = smp.sector >= 0 ? this.trace!.track.sectors[smp.sector]!.name : '';
    this.rpmText.textContent = t('{rpm} об/хв, {gear}-а', { rpm: Math.round(smp.rpm).toLocaleString(numberLocale), gear: smp.gear });
    this.status.textContent = run ? `${sector ? `${sector} · ` : ''}${t('{v} км/год', { v: Math.round(smp.v * 3.6) })}` : t('Рахую коло…');
    if (!run) {
      for (const line of this.lines) line.textContent = '';
      this.flags.textContent = '';
      return;
    }
    const p = run.pressure[i]!;
    const need = run.need[i]!;
    const low = p < need;
    this.lines[0]!.textContent = t('Тиск {p} бар · потрібно не менше {need}', { p: fmt(p), need: fmt(need) });
    this.lines[0]!.classList.toggle('bad', low);
    const heads = run.headL.reduce((sum, h) => sum + h[i]!, 0);
    this.lines[1]!.textContent = this.sumpKind === 'dry'
      ? t('У баку {tank} л · у головках {heads} · на стінках {walls}', { tank: fmt(run.tankL[i]!), heads: fmt(heads), walls: fmt(run.wallsL[i]!) })
      : t('У піддоні {pan} л · у головках {heads} · на стінках {walls}', { pan: fmt(run.panL[i]!), heads: fmt(heads), walls: fmt(run.wallsL[i]!) });
    const imm = run.immersion[i]!;
    if (this.sumpKind === 'dry') this.lines[2]!.textContent = t('Насос тиску бере оливу з дна бака');
    else this.lines[2]!.textContent = run.pickupOil[i]! < 0.98 ? t('Забірник хапає повітря') : t('Забірник під оливою на {mm} мм', { mm: Math.round(imm) });
    this.lines[2]!.classList.toggle('bad', run.pickupOil[i]! < 0.98);
    const height = this.scene?.shape.crankHeightMm ?? 0;
    this.lines[3]!.textContent = t('Вісь колінвала над дном піддона: {mm} мм', { mm: Math.round(height) });
    const flags: string[] = [];
    if (low) flags.push(t('Тиск нижче потрібного'));
    if (run.reserve[i]! <= 0) flags.push(t('Вкладиші без плівки оливи'));
    if (run.lifters[i]) flags.push(t('Гідрокомпенсатори просідають: клапани відкриваються менше, чути цокіт'));
    if (this.accumulator && run.accOilL[i]! < run.accOilL[Math.max(0, i - 10)]! - 0.005) flags.push(t('Акумулятор віддає оливу'));
    this.flags.textContent = flags.join(' · ');
    this.flags.hidden = !flags.length;
    const announce = this.broken ? '' : low ? t('Тиск оливи нижче потрібного') : '';
    if (announce !== this.lastAnnounce) {
      this.lastAnnounce = announce;
      if (announce) this.live.textContent = announce;
    }
  }

  /** For checks in the console and the browser tests. */
  get state(): { time: number; playing: boolean; kind: SumpKind; tyre: TyreId; ready: boolean; health: number } {
    return { time: this.time, playing: this.playing, kind: this.sumpKind, tyre: this.tyre, ready: !!this.run, health: this.health };
  }

  play(on = true): void {
    if (this.broken) return;
    this.playing = on;
    this.syncPlay();
  }

  get liveRegion(): HTMLElement {
    return this.live;
  }
}

/** A designer's engine as a link to this page. */
export const sumpLinkFor = (d: Design): string => `#/sump/design/${encodeDesign(d)}`;

