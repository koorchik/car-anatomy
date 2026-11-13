// Keeps the design, the model's numbers, the 3D engine and the sound in step as controls move.
// Each runs at its own pace: numbers on every input, geometry a few times a second, sound after a pause.

import { synthConfig } from '../../audio/synth.ts';
import { decodeDesign, encodeDesign } from '../../designer/codec.ts';
import { adjustedKeys, resolveDesign } from '../../designer/constraints.ts';
import { DEFAULT_DESIGN, displacementL, isRotary, type Design } from '../../designer/design.ts';
import type { FuelId } from '../../designer/fuels.ts';
import { measureTrim } from '../../designer/loudness.ts';
import { evaluate, type Performance } from '../../designer/physics.ts';
import { CATALOGUE_CHOICES, designFromSpec, editDesign, ODD_PRESETS, randomDesign } from '../../designer/presets.ts';
import { designToSpec } from '../../designer/to-spec.ts';
import { engineById } from '../../data/engines.ts';
import { buildEngine, type Engine } from '../../engine/kinematics.ts';
import { liveTiming, type ValveState } from '../../engine/valve-control.ts';
import { assessReliability, restartOutlook, wearNow, type LimitItem, type Reliability } from '../../designer/reliability.ts';
import { compareMetrics, snapshot, type Metric } from '../../designer/sensitivity.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { probesFor } from './probes.ts';
import { DesignerControls, type DesignPatch } from './controls.ts';
import { DesignerResults } from './results.ts';

const STORAGE_KEY = 'car-anatomy.design';
const REBUILD_INTERVAL_MS = 130;
const SOUND_DELAY_MS = 240;
const TRIM_DELAY_MS = 700;

export interface DesignerHost {
  /** Rebuild the 3D model and everything drawn from the engine's geometry. */
  showEngine(engine: Engine): void;
  /** Hand the engine to the sound thread. */
  soundEngine(engine: Engine, perf: Performance): void;
  setTrim(trim: number): void;
  /** Stop the engine, it just broke. */
  wreck(): void;
  /** Name and summary shown above the model. */
  heading(): void;
  /** Rev limit and zones for the tachometer. */
  zones(safe: number, failure: number, cut: number): void;
  /** Condition of the engine: share left, what's suffering now, how badly (0 to 1). */
  health(share: number, suffering: string | null, distress: number): void;
  /** The model should show this part as broken, or nothing when null. */
  showFailure(part: string | null): void;
}

const CHARGER_WORDS: Record<Design['charger'], string> = {
  none: t('атмосферний'),
  turbo: t('турбо'),
  twinturbo: t('дві турбіни'),
  quadturbo: t('чотири турбіни'),
  roots: t('нагнітач Roots'),
  centrifugal: t('відцентровий нагнітач'),
};

// Written out rather than lower-cased from the fuel's name, which would spoil "E85" and "RON" in English.
const FUEL_WORDS: Record<FuelId, string> = {
  ai92: t('бензин а-92'),
  ai95: t('бензин а-95'),
  ai98: t('бензин а-98'),
  race: t('гоночний бензин'),
  e85: t('етанол e85'),
  methanol: t('метанол'),
  diesel: t('дизель'),
};

const summaryOf = (d: Design): string => {
  const litres = displacementL(d).toLocaleString(numberLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const parts = [isRotary(d) ? t('{litres} л, {count} секц.', { litres, count: d.cylinders }) : t('{litres} л', { litres }), FUEL_WORDS[d.fuel], CHARGER_WORDS[d.charger]];
  return parts.join(', ');
};

/** The parts of the valve gear that are drawn: not the schedule, which only moves them. */
const drawnValves = (v: Engine['spec']['vvt']): unknown =>
  v && [v.phaser, v.switching && [v.switching.cams, v.switching.kind, v.switching.low, v.switching.lowShare], v.lift?.kind, v.deactivation && [v.deactivation.kind, v.deactivation.sets]];

/** Everything about the spec that changes what the 3D model looks like. */
const geometryKey = (engine: Engine): string => {
  const s = engine.spec;
  return JSON.stringify([s.layout, s.bore, s.stroke, s.rodRatio, s.compression, s.firingOrder, s.firingIntervals, s.valvetrain, s.valvesPerCyl, s.aspiration, s.valves, s.timing, s.blockMaterial, s.exhaust.groups, s.coverColor, s.tuning?.flywheelKg, s.tuning?.vibrationGain, s.tuning?.counterweightMm, drawnValves(s.vvt)]);
};

export class DesignerPage {
  readonly results = new DesignerResults();
  readonly controlsHost = document.createElement('div');
  private readonly controls: DesignerControls;
  private readonly host: DesignerHost;
  private readonly nameInput = document.createElement('input');
  private readonly presetSelect = document.createElement('select');
  private readonly copyButton = document.createElement('button');
  private readonly factoryNote = document.createElement('p');
  private design: Design = resolveDesign({ ...DEFAULT_DESIGN, throws: [] });
  private perf: Performance = evaluate(this.design);
  private reliability: Reliability = assessReliability(this.design, this.perf);
  private condition = 1;
  /** State before the control being moved was touched, to show what moving it did. */
  private before: { key: string; metrics: Metric[] } | null = null;
  private engine: Engine = buildEngine(designToSpec(this.design, this.perf));
  private lastGeometry = '';
  private lastSound = '';
  private lastRebuild = 0;
  private rebuildTimer = 0;
  private soundTimer = 0;
  private trimTimer = 0;
  private urlTimer = 0;
  private drawRequested = false;
  private active = false;
  private broken = false;

  constructor(host: DesignerHost) {
    this.host = host;
    this.controls = new DesignerControls(
      (patch) => this.apply(patch),
      () => this.commit(),
    );
    this.results.connect(probesFor, (key) => this.controls.focusParam(key));
    this.buildHeader();
    this.controlsHost.append(this.controls.root);
  }

  get current(): Design {
    return this.design;
  }

  get performance(): Performance {
    return this.perf;
  }

  get title(): string {
    return this.design.name;
  }

  get summary(): string {
    return summaryOf(this.design);
  }

  private buildHeader(): void {
    const header = document.createElement('div');
    header.className = 'designer-header';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'param-label';
    nameLabel.htmlFor = 'design-name';
    nameLabel.textContent = t('Назва');
    this.nameInput.id = 'design-name';
    this.nameInput.className = 'param-text';
    this.nameInput.maxLength = 60;
    this.nameInput.addEventListener('input', () => this.apply({ name: this.nameInput.value || t('Мій двигун') }));

    const presetLabel = document.createElement('label');
    presetLabel.className = 'param-label';
    presetLabel.htmlFor = 'design-preset';
    presetLabel.textContent = t('Почати з');
    this.presetSelect.id = 'design-preset';
    this.presetSelect.className = 'param-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('Обери заготовку');
    const odd = document.createElement('optgroup');
    odd.label = t('Дивні двигуни');
    for (const preset of ODD_PRESETS) {
      const option = document.createElement('option');
      option.value = `odd:${preset.id}`;
      option.textContent = preset.name;
      odd.append(option);
    }
    const real = document.createElement('optgroup');
    real.label = t('Справжні двигуни');
    for (const item of CATALOGUE_CHOICES) {
      const option = document.createElement('option');
      option.value = `real:${item.id}`;
      option.textContent = item.name;
      real.append(option);
    }
    this.presetSelect.append(placeholder, odd, real);
    this.presetSelect.addEventListener('change', () => {
      this.loadPreset(this.presetSelect.value);
      this.presetSelect.value = '';
    });

    const actions = document.createElement('div');
    actions.className = 'designer-actions';
    const random = document.createElement('button');
    random.type = 'button';
    random.className = 'btn';
    random.textContent = t('Випадковий');
    random.addEventListener('click', () => this.setDesign(randomDesign()));
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn';
    reset.textContent = t('Скинути');
    reset.addEventListener('click', () => this.setDesign(resolveDesign({ ...DEFAULT_DESIGN, throws: [] })));
    this.copyButton.type = 'button';
    this.copyButton.className = 'btn';
    this.copyButton.textContent = t('Копіювати посилання');
    this.copyButton.addEventListener('click', () => void this.copyLink());
    actions.append(random, reset, this.copyButton);

    this.factoryNote.className = 'factory-note';
    this.factoryNote.textContent = t('Точна копія двигуна з каталогу: той самий механізм, звук і поведінка. Перша зміна вмикає розрахунок за моделлю.');

    header.append(nameLabel, this.nameInput, presetLabel, this.presetSelect, actions, this.factoryNote);
    this.controlsHost.append(header);
  }

  private loadPreset(value: string): void {
    const [kind, id] = value.split(':');
    if (kind === 'odd') {
      const preset = ODD_PRESETS.find((p) => p.id === id);
      if (preset) this.setDesign(preset.design());
    } else if (kind === 'real' && id) {
      const spec = engineById(id);
      if (spec) this.setDesign(designFromSpec(spec));
    }
  }

  private async copyLink(): Promise<void> {
    const base = `${location.origin}${location.pathname}${location.search}`;
    const link = `${base}#/designer/${encodeDesign(this.design)}`;
    try {
      await navigator.clipboard.writeText(link);
      this.copyButton.textContent = t('Посилання скопійовано');
    } catch {
      // Without clipboard access the link is still in the address bar.
      history.replaceState(null, '', link);
      this.copyButton.textContent = t('Скопіюй з адресного рядка');
    }
    window.setTimeout(() => {
      this.copyButton.textContent = t('Копіювати посилання');
    }, 2200);
  }

  /** Reads what the address bar or local storage holds. */
  static designFromRoute(hash: string): Design | null {
    const rest = hash.replace(/^#\/designer\/?/, '');
    if (rest.startsWith('from/')) {
      const spec = engineById(rest.slice(5));
      return spec ? designFromSpec(spec) : null;
    }
    if (rest) return decodeDesign(rest);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? decodeDesign(saved) : null;
    } catch {
      return null;
    }
  }

  enter(design: Design | null): void {
    this.active = true;
    this.lastGeometry = '';
    this.lastSound = '';
    this.setDesign(design ?? this.design);
  }

  leave(): void {
    this.active = false;
    window.clearTimeout(this.rebuildTimer);
    window.clearTimeout(this.soundTimer);
    window.clearTimeout(this.trimTimer);
    window.clearTimeout(this.urlTimer);
  }

  setDesign(design: Design): void {
    this.repair();
    this.before = null;
    this.controls.clearEffects();
    this.design = resolveDesign(design);
    this.recompute();
    this.nameInput.value = this.design.name;
    this.requestDraw();
    this.rebuildNow();
    this.pushSound();
    this.scheduleTrim();
    this.scheduleUrl();
  }

  private apply(patch: DesignPatch): void {
    const wanted: Design = { ...this.design, ...patch };
    const key = Object.keys(patch)[0] ?? '';
    // A run of changes to one control counts from where that control started.
    if (this.before?.key !== key) this.before = { key, metrics: snapshot(this.design) };
    const resolved = editDesign(this.design, patch);
    const moved = adjustedKeys(wanted, resolved).filter((k) => !(k in patch));
    this.design = resolved;
    this.repair();
    this.recompute();
    if (key !== 'name') this.controls.showEffects(key, compareMetrics(this.before.metrics, snapshot(this.design)).slice(0, 6));
    if (moved.length) this.controls.flash(moved);
    this.requestDraw();
    this.scheduleRebuild();
    this.scheduleSound();
    this.scheduleTrim();
    this.scheduleUrl();
  }

  /** Called when a slider is let go: the sound can catch up right away. */
  private commit(): void {
    window.clearTimeout(this.soundTimer);
    this.pushSound();
  }

  private recompute(): void {
    this.perf = evaluate(this.design);
    this.reliability = assessReliability(this.design, this.perf);
    this.engine = buildEngine(designToSpec(this.design, this.perf));
  }

  private requestDraw(): void {
    if (this.drawRequested) return;
    this.drawRequested = true;
    requestAnimationFrame(() => {
      this.drawRequested = false;
      this.factoryNote.hidden = !this.design.factory;
      this.controls.sync(this.design, this.perf, this.reliability);
      this.results.update(this.design, this.perf, this.reliability);
      if (this.active) {
        this.host.heading();
        this.host.zones(this.reliability.safeRpm, this.reliability.failureRpm, this.design.rpmLimit);
      }
    });
  }

  private scheduleRebuild(): void {
    window.clearTimeout(this.rebuildTimer);
    const wait = Math.max(0, REBUILD_INTERVAL_MS - (performance.now() - this.lastRebuild));
    this.rebuildTimer = window.setTimeout(() => this.rebuildNow(), wait);
  }

  private rebuildNow(): void {
    if (!this.active) return;
    this.lastRebuild = performance.now();
    const key = geometryKey(this.engine);
    if (key === this.lastGeometry) return;
    this.lastGeometry = key;
    this.host.showEngine(this.engine);
  }

  private scheduleSound(): void {
    window.clearTimeout(this.soundTimer);
    this.soundTimer = window.setTimeout(() => this.pushSound(), SOUND_DELAY_MS);
  }

  private pushSound(): void {
    if (!this.active) return;
    const config = { ...synthConfig(this.engine, 1) };
    const key = JSON.stringify(config);
    if (key === this.lastSound) return;
    this.lastSound = key;
    this.host.soundEngine(this.engine, this.perf);
  }

  private scheduleTrim(): void {
    window.clearTimeout(this.trimTimer);
    // Factory figures already carry the catalogue's measured level.
    if (this.design.factory) return;
    this.trimTimer = window.setTimeout(() => {
      if (!this.active) return;
      this.host.setTrim(measureTrim(this.engine.spec));
    }, TRIM_DELAY_MS);
  }

  private scheduleUrl(): void {
    window.clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      if (!this.active) return;
      const code = encodeDesign(this.design);
      history.replaceState(null, '', `#/designer/${code}`);
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {
        // A private window can refuse storage. The link still holds the design.
      }
    }, 300);
  }

  /** A rebuilt or repaired engine is as good as new. */
  repair(): void {
    this.broken = false;
    this.condition = 1;
    this.failedItem = null;
    this.host.showFailure(null);
    this.host.health(1, null, 0);
  }

  private failedItem: LimitItem | null = null;

  /** Called every frame while the page is shown. */
  frame(rpm: number, running: boolean, throttle: number, dt: number, valves?: ValveState): void {
    this.results.setMarker(rpm);
    const spec = this.engine.spec;
    this.controls.liveValves(running && valves && spec.timing ? liveTiming(spec.timing, spec.vvt, valves) : null, spec.valves?.lift ?? 10);
    if (!running || this.broken) {
      if (!this.broken) this.host.health(this.condition, null, 0);
      return;
    }
    const wear = wearNow(this.reliability, rpm, throttle);
    this.condition = Math.max(0, this.condition - wear.rate * dt);
    const overSpeed = rpm > this.reliability.failureRpm;
    if (overSpeed || this.condition <= 0) {
      this.broken = true;
      this.condition = 0;
      const speedItem = this.reliability.items.find((i) => i.id === 'rod-tension' || i.id === 'rotor');
      this.failedItem = overSpeed && speedItem ? speedItem : (wear.worst ?? this.reliability.worst);
      this.host.health(0, null, 0);
      this.host.showFailure(this.failedItem.part);
      this.host.wreck();
      return;
    }
    this.host.health(this.condition, wear.worst?.name ?? null, Math.min(1, wear.rate * 12));
  }

  get isBroken(): boolean {
    return this.broken;
  }

  /** Short sentence for the banner shown when the engine has just destroyed itself. */
  get wreckMessage(): string {
    const item = this.failedItem ?? this.reliability.worst;
    const values = { failure: item.failure, fix: item.fix };
    const perf = evaluate({ ...this.design, factory: null });
    switch (restartOutlook(this.reliability, perf.idleRpm, this.design.rpmLimit)) {
      case 'idle':
        return t('{failure} {fix} З такою конфігурацією двигун не витримує навіть холостого ходу, тож запуск зламає його знову.', values);
      case 'throttle':
        return t('{failure} {fix} Запуск полагодить двигун, але з такою конфігурацією він зламається знову, щойно дати повний газ.', values);
      case 'revs':
        return t('{failure} {fix} Запуск полагодить двигун, але відсічка стоїть вище, ніж він витримує, тож на повному газу він зламається знову.', values);
      case 'fine':
        return t('{failure} {fix} Запуск полагодить двигун.', values);
    }
  }
}
