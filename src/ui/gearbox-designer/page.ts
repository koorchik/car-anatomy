// The gearbox designer's page (`#/gearboxes/designer`, gearbox plan stage 10): keeps the design, the model's figures,
// the 3D box, the sound and the address in step as the controls move, each at its own pace, as the engine designer
// does (src/ui/designer/designer-page.ts): the figures on every input, the box a few times a second and only when its
// geometry changed (geometryKey), the engine after a pause, the address after a longer one. "Drive" runs the whole
// core (drive-run.ts) and plays the run back through the sound; a pinned variant stays beside the figures and under
// the traction chart.
//
// This module is the page's own chunk: the gearbox section loads it the first time the designer is opened, and the
// panel "Set up" of a gearbox page loads it to carry its box over (designFromTable, from-table.ts).

import { CARS } from '../../data/cars.ts';
import { decodeGearboxDesign, encodeGearboxDesign } from '../../gearbox-designer/codec.ts';
import { resolveGearboxDesign } from '../../gearbox-designer/constraints.ts';
import { DEFAULT_GEARBOX_DESIGN, type GearboxDesign } from '../../gearbox-designer/design.ts';
import { diagnoseGearbox, type GearboxDiagnostic } from '../../gearbox-designer/diagnostics.ts';
import { designRun, type DesignRun } from '../../gearbox-designer/drive-run.ts';
import { editGearboxDesign } from '../../gearbox-designer/edit.ts';
import { evaluateGearbox, type GearboxPerformance } from '../../gearbox-designer/evaluate.ts';
import { DESIGN_ENGINE, engineSource } from '../../gearbox-designer/engine-source.ts';
import { designFromTable, designTableRecord, recordById } from '../../gearbox-designer/from-table.ts';
import { catalogueGearboxPresets, designFromRecord, oddGearboxPresets, type GearboxPreset } from '../../gearbox-designer/presets.ts';
import { assessGearbox, type GearboxReliability } from '../../gearbox-designer/reliability.ts';
import { compareGearboxMetrics, gearboxMetrics, gearboxSnapshot, type GearboxMetric } from '../../gearbox-designer/sensitivity.ts';
import { geometryKey } from '../../gearbox-designer/to-spec.ts';
import { t } from '../../i18n/t.ts';
import { router, type RouteTarget } from '../../shell/router.ts';
import type { Route } from '../../shell/routes.ts';
import { GearboxControlsPanel, type GearboxPatch } from './controls-panel.ts';
import { GearboxResultsPanel, type Pinned } from './results-panel.ts';
import './gearbox-designer.css';

const STORAGE_KEY = 'car-anatomy.gearbox-design';
const REBUILD_INTERVAL_MS = 130;
const SOUND_DELAY_MS = 240;
const URL_DELAY_MS = 300;

export { designFromTable, designTableRecord, engineSource };

/** The designer's address for a design: #/gearboxes/designer/<code>; the router keeps the visitor's context. */
export const gearboxDesignerRoute = (d: GearboxDesign): RouteTarget => ({ section: 'gearboxes', page: 'designer', path: [encodeGearboxDesign(d)], query: {} });

export interface GearboxDesignerHost {
  /** The box's geometry changed: rebuild the 3D from this design. */
  showBox(d: GearboxDesign): void;
  /** The engine or the car may have changed: hand them to the sound. */
  soundEngine(d: GearboxDesign): void;
  /** Name and the line under it, above the model. */
  heading(title: string, sub: string): void;
  /** "Drive" was pressed: start the engine now, while the click still lets the sound start. */
  startEngine(): void;
  /** Plays the run back through the 3D box and the sound; `at` hears the time of every frame, and null at the end. */
  play(run: DesignRun, at: (time: number | null) => void): void;
}

const typeWord = (d: GearboxDesign): string => (d.type === 'layshaft' ? t('з проміжним валом') : t('двовальна'));

export class GearboxDesignerPage {
  readonly controlsHost = document.createElement('div');
  readonly results: GearboxResultsPanel;
  private readonly controls: GearboxControlsPanel;
  private readonly host: GearboxDesignerHost;
  private readonly nameInput = document.createElement('input');
  private readonly presetSelect = document.createElement('select');
  private readonly copyButton = document.createElement('button');
  private readonly factoryNote = document.createElement('p');
  private presets: { real: GearboxPreset[]; odd: GearboxPreset[] } | null = null;
  private design: GearboxDesign = resolveGearboxDesign(DEFAULT_GEARBOX_DESIGN);
  private perf: GearboxPerformance = evaluateGearbox(this.design);
  private rel: GearboxReliability = assessGearbox(this.perf);
  private diags: GearboxDiagnostic[] = diagnoseGearbox(this.design, this.perf, this.rel);
  /** The figures before the control being moved was touched, to show what moving it did. */
  private before: { id: string; metrics: GearboxMetric[] } | null = null;
  private pinned: (Pinned & { design: GearboxDesign }) | null = null;
  private lastGeometry = '';
  private lastSound = '';
  private lastRebuild = 0;
  private rebuildTimer = 0;
  private soundTimer = 0;
  private urlTimer = 0;
  private drawRequested = false;
  private active = false;
  private running = false;

  constructor(host: GearboxDesignerHost) {
    this.host = host;
    this.controls = new GearboxControlsPanel(
      (patch, id) => this.apply(patch, id),
      () => this.commit(),
    );
    this.results = new GearboxResultsPanel({
      drive: () => void this.drive(),
      pin: () => this.pin(true),
      unpin: () => this.pin(false),
      focus: (id) => this.controls.focus(id),
    });
    this.buildHeader();
    this.controlsHost.className = 'gbd-params';
    this.controlsHost.append(this.controls.root);
  }

  get current(): GearboxDesign {
    return this.design;
  }

  get performance(): GearboxPerformance {
    return this.perf;
  }

  get title(): string {
    return this.design.name || t('Своя коробка');
  }

  get summary(): string {
    const d = this.design;
    const car = CARS[d.car]?.name ?? d.car;
    const engine = engineSource(d.engine)?.name ?? d.engine;
    return t('{gears} передач, {type} · {car} · двигун {engine}', { gears: d.gears, type: typeWord(d), car, engine });
  }

  private buildHeader(): void {
    const header = document.createElement('div');
    header.className = 'designer-header';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'param-label';
    nameLabel.htmlFor = 'gbd-name';
    nameLabel.textContent = t('Назва');
    this.nameInput.id = 'gbd-name';
    this.nameInput.className = 'param-text';
    this.nameInput.maxLength = 60;
    this.nameInput.placeholder = t('Своя коробка');
    this.nameInput.addEventListener('input', () => this.apply({ name: this.nameInput.value }, 'name'));

    const presetLabel = document.createElement('label');
    presetLabel.className = 'param-label';
    presetLabel.htmlFor = 'gbd-preset';
    presetLabel.textContent = t('Почати з');
    this.presetSelect.id = 'gbd-preset';
    this.presetSelect.className = 'param-select';
    // The presets build their designs (teeth and all): only when the list is first opened.
    const fill = (): void => {
      if (this.presets) return;
      this.presets = { real: catalogueGearboxPresets(), odd: oddGearboxPresets() };
      const group = (label: string, kind: string, list: GearboxPreset[]): HTMLOptGroupElement => {
        const node = document.createElement('optgroup');
        node.label = label;
        for (const p of list) {
          const option = document.createElement('option');
          option.value = `${kind}:${p.id}`;
          option.textContent = p.name;
          node.append(option);
        }
        return node;
      };
      this.presetSelect.append(group(t('Справжні коробки'), 'real', this.presets.real), group(t('Дивні коробки'), 'odd', this.presets.odd));
    };
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('Обери заготовку');
    this.presetSelect.append(placeholder);
    this.presetSelect.addEventListener('pointerdown', fill);
    this.presetSelect.addEventListener('focus', fill);
    this.presetSelect.addEventListener('keydown', fill);
    this.presetSelect.addEventListener('change', () => {
      const [kind, id] = this.presetSelect.value.split(':');
      const list = kind === 'real' ? this.presets?.real : this.presets?.odd;
      const preset = list?.find((p) => p.id === id);
      if (preset) this.setDesign(preset.design);
      this.presetSelect.value = '';
    });

    const actions = document.createElement('div');
    actions.className = 'designer-actions';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn';
    reset.textContent = t('Скинути');
    reset.addEventListener('click', () => this.setDesign(resolveGearboxDesign(DEFAULT_GEARBOX_DESIGN)));
    this.copyButton.type = 'button';
    this.copyButton.className = 'btn';
    this.copyButton.textContent = t('Копіювати посилання');
    this.copyButton.addEventListener('click', () => void this.copyLink());
    actions.append(reset, this.copyButton);

    this.factoryNote.className = 'factory-note';
    this.factoryNote.textContent = t('Копія коробки з каталогу з її справжніми зубцями. Перша інженерна зміна вмикає розрахунок за моделлю.');
    header.append(nameLabel, this.nameInput, presetLabel, this.presetSelect, actions, this.factoryNote);
    this.controlsHost.append(header);
  }

  private async copyLink(): Promise<void> {
    const target = gearboxDesignerRoute(this.design);
    try {
      await navigator.clipboard.writeText(router.shareUrl(target));
      this.copyButton.textContent = t('Посилання скопійовано');
    } catch {
      router.replace({ ...target, query: { car: null, ret: null } });
      this.copyButton.textContent = t('Скопіюй з адресного рядка');
    }
    window.setTimeout(() => {
      this.copyButton.textContent = t('Копіювати посилання');
    }, 2200);
  }

  /**
   * What the address or local storage holds: #/gearboxes/designer/from/<page>[/<variant>] (a catalogue copy),
   * #/gearboxes/designer/engine/<engine designer's code> (the last design with that engine in its car) or
   * #/gearboxes/designer/<code>.
   */
  static designFromRoute(route: Route): GearboxDesign | null {
    const [first, ...rest] = route.path;
    if (first === 'from') {
      const record = recordById(rest.join('/'));
      return record?.car ? designFromRecord(record) : null;
    }
    if (first === 'engine') {
      const engine = `${DESIGN_ENGINE}${rest[0] ?? ''}`;
      if (!engineSource(engine)) return null;
      return editGearboxDesign(GearboxDesignerPage.stored() ?? resolveGearboxDesign(DEFAULT_GEARBOX_DESIGN), { engine });
    }
    if (first) return decodeGearboxDesign(first);
    return GearboxDesignerPage.stored();
  }

  private static stored(): GearboxDesign | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? decodeGearboxDesign(saved) : null;
    } catch {
      return null;
    }
  }

  enter(design: GearboxDesign | null): void {
    this.active = true;
    this.lastGeometry = '';
    this.lastSound = '';
    this.setDesign(design ?? this.design);
  }

  leave(): void {
    this.active = false;
    window.clearTimeout(this.rebuildTimer);
    window.clearTimeout(this.soundTimer);
    window.clearTimeout(this.urlTimer);
  }

  setDesign(design: GearboxDesign): void {
    this.before = null;
    this.controls.clearEffects();
    this.design = resolveGearboxDesign(design);
    this.recompute();
    this.nameInput.value = this.design.name;
    this.requestDraw();
    this.rebuildNow();
    this.pushSound();
    this.scheduleUrl();
  }

  private apply(patch: GearboxPatch, id: string): void {
    if (this.before?.id !== id) this.before = { id, metrics: this.metrics() };
    this.design = editGearboxDesign(this.design, patch);
    this.recompute();
    if (id !== 'name') this.controls.showEffects(id, compareGearboxMetrics(this.before.metrics, this.metrics()).slice(0, 6));
    this.requestDraw();
    this.scheduleRebuild();
    this.scheduleSound();
    this.scheduleUrl();
  }

  /** The model's own figures: a factory copy's with its record set aside. */
  private metrics(): GearboxMetric[] {
    return this.design.factory ? gearboxSnapshot(this.design) : gearboxMetrics(this.perf, this.rel);
  }

  /** A slider let go: the sound catches up at once. */
  private commit(): void {
    window.clearTimeout(this.soundTimer);
    this.pushSound();
  }

  private recompute(): void {
    this.perf = evaluateGearbox(this.design);
    this.rel = assessGearbox(this.perf);
    this.diags = diagnoseGearbox(this.design, this.perf, this.rel);
  }

  private requestDraw(): void {
    if (this.drawRequested) return;
    this.drawRequested = true;
    requestAnimationFrame(() => {
      this.drawRequested = false;
      this.factoryNote.hidden = !this.design.factory;
      if (document.activeElement !== this.nameInput) this.nameInput.value = this.design.name;
      this.controls.sync(this.design, this.perf);
      this.results.update(this.design, this.perf, this.rel, this.diags);
      if (this.active) this.host.heading(this.title, this.summary);
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
    const key = geometryKey(this.design);
    if (key === this.lastGeometry) return;
    this.lastGeometry = key;
    this.host.showBox(this.design);
  }

  private scheduleSound(): void {
    window.clearTimeout(this.soundTimer);
    this.soundTimer = window.setTimeout(() => this.pushSound(), SOUND_DELAY_MS);
  }

  private pushSound(): void {
    if (!this.active) return;
    const key = this.design.engine;
    if (key === this.lastSound) return;
    this.lastSound = key;
    this.host.soundEngine(this.design);
  }

  private scheduleUrl(): void {
    window.clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      if (!this.active) return;
      const target = gearboxDesignerRoute(this.design);
      router.replace(target);
      try {
        localStorage.setItem(STORAGE_KEY, target.path[0]!);
      } catch {
        // A private window can refuse storage; the address still holds the design.
      }
    }, URL_DELAY_MS);
  }

  private pin(on: boolean): void {
    this.pinned = on ? { name: this.title, perf: this.perf, design: this.design } : null;
    this.results.setPinned(this.pinned);
    this.requestDraw();
  }

  /** "Drive": the whole core's run, computed after the button has shown it is busy, then played back. */
  private async drive(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.host.startEngine();
    this.results.setRun(null, true);
    // Two frames, so the busy button is on screen before the run takes the main thread for a moment.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const design = this.design;
    let run: DesignRun;
    try {
      run = designRun(design);
    } finally {
      this.running = false;
    }
    this.results.setRun({ run, panel100: evaluateGearbox(design).zeroTo100S }, false);
    if (this.active) this.host.play(run, (time) => this.results.playhead(time));
  }
}
