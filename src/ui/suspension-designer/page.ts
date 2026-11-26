// The suspension designer's page (#/suspensions/designer[/<code>], stage P8c): the design's chassis in 3D, the panel of
// controls on the right, the results on the left, a headline under the title. It keeps the design, the model's figures,
// the graphs, the 3D and the address in step, each at its own pace, like the engine designer:
//   - figures, character and diagnoses on every input, at once (evaluateChassis is a few milliseconds);
//   - the graphs on the next frame, their exact solves remembered by each axle's geometry;
//   - the 3D at most every REBUILD_INTERVAL_MS, and only when what it draws changed (modelKey);
//   - the address and the visitor's saved design after a pause.
//
// The page is shown by the suspensions section (src/ui/suspensions/host.ts) as one of its pages: it gets the section's
// context and borrows the shared page (title, panels' names, stage) for as long as it is shown, giving each back.

import { t } from '../../i18n/t.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import { SUSPENSION_REGISTERED } from '../../scene/suspension/parts.ts';
import { SpecChassisModel } from '../../scene/suspension/spec-chassis-model.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import type { PanelSizes, Route, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import type { RouteTarget } from '../../shell/router.ts';
import { evaluateChassis, type ChassisPerformance } from '../../suspension/evaluate-chassis.ts';
import { evaluateSteering, type SteeringPerformance } from '../../suspension/evaluate-steering.ts';
import type { ChassisSpec } from '../../suspension/spec.ts';
import { compareMetrics, type Metric } from '../../shared/sensitivity-core.ts';
import { decodeChassis, encodeChassis } from '../../suspension-designer/codec.ts';
import { cornerSprungKg, resolveChassis, sameDesign } from '../../suspension-designer/constraints.ts';
import { responseCurves, rollCentreCurve, travelCurves, turnCurves, understeerParts, type RollCentreCurve, type TravelCurves } from '../../suspension-designer/curves.ts';
import { DEFAULT_CHASSIS } from '../../suspension-designer/defaults.ts';
import { axleOf, type AxleEnd, type ChassisDesign, type DesignKey } from '../../suspension-designer/design.ts';
import { chassisCharacter, diagnoseChassis, type ChassisCharacter, type ChassisDiagnostic } from '../../suspension-designer/diagnostics.ts';
import { editChassis } from '../../suspension-designer/edit.ts';
import { takeNote } from '../../suspension-designer/from-setup.ts';
import { geometryKey, rimRadiusM } from '../../suspension-designer/geometry.ts';
import { chassisPreset, randomChassis } from '../../suspension-designer/presets.ts';
import { chassisMetrics } from '../../suspension-designer/sensitivity.ts';
import { chassisToSpec, springRateNm } from '../../suspension-designer/to-spec.ts';
import { fmt } from './charts.ts';
import { ControlsPanel } from './controls.ts';
import { optionLabel } from './params.ts';
import { DesignerResults, type DesignCurves } from './results.ts';
import './designer.css';

/** Where the visitor's design is kept between visits (suspensions plan, presets and links). */
export const STORAGE_KEY = 'car-anatomy.chassis-design';
/** The 3D is rebuilt at most this often while a slider moves (plan: 130 ms). */
export const REBUILD_INTERVAL_MS = 130;
const URL_DELAY_MS = 300;
/** The whole car seen from the front left and above. */
const HOME: readonly [number, number, number] = [-0.9, 0.55, 1];
const BODY_CLASS = 'section-suspensions susp-designer';
const PANEL_CLOSED = 'panel-closed';
const DEG = 180 / Math.PI;

/** The designer's address for a design. */
export const chassisDesignerRoute = (design: ChassisDesign): RouteTarget => ({ section: 'suspensions', page: 'designer', path: [encodeChassis(design)], query: {} });

/** The design an address names: #/suspensions/designer/from/<preset> or #/suspensions/designer/<code>; null for none. */
export function designFromPath(path: readonly string[]): ChassisDesign | null {
  const [first, second] = path;
  if (first === 'from') return second ? (chassisPreset(second)?.design() ?? null) : null;
  return first ? decodeChassis(first) : null;
}

function savedDesign(): ChassisDesign | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? decodeChassis(saved) : null;
  } catch {
    return null;
  }
}

/** The keys of `after` the design changed by itself, beyond those the visitor set. */
function movedKeys(wanted: ChassisDesign, after: ChassisDesign, set: readonly string[]): string[] {
  const a = wanted as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  return Object.keys(b).filter((k) => !set.includes(k) && a[k] !== b[k]);
}

/** Steps of the spring rate the 3D tells apart: the coil's wire is drawn from the rate (d ∝ k^¼, drawing.ts), so a
 *  rate 2^¼ (19%) stiffer draws a wire 4% thicker, about half a millimetre: a step the eye can see. */
const WIRE_STEPS_PER_DOUBLING = 4;

/** What the 3D draws of a design: both axles' points, where they stand, the wheels, the bars, the springs' wire (a
 *  typical spring follows the mass, so a mass change can redraw it). */
export function modelKey(d: ChassisDesign): string {
  const f = axleOf(d, 'F');
  const r = axleOf(d, 'R');
  const wire = (end: AxleEnd): number => {
    try {
      return Math.round(WIRE_STEPS_PER_DOUBLING * Math.log2(springRateNm(d, end)));
    } catch {
      return NaN;
    }
  };
  return JSON.stringify([geometryKey(f, 'F', d.drive, d.wheelbaseMm), geometryKey(r, 'R', d.drive, d.wheelbaseMm), d.wheelbaseMm, d.frontShare, f.barMm > 0, r.barMm > 0, wire('F'), wire('R')]);
}

interface Evaluation {
  design: ChassisDesign;
  spec: ChassisSpec;
  perf: ChassisPerformance;
  steering: SteeringPerformance | null;
  diagnoses: ChassisDiagnostic[];
  character: ChassisCharacter;
}

function evaluate(design: ChassisDesign): Evaluation {
  const spec = chassisToSpec(design);
  const perf = evaluateChassis(spec);
  let steering: SteeringPerformance | null = null;
  try {
    steering = evaluateSteering(spec);
  } catch {
    // A linkage that cannot steer loses the steering's figures, not the chassis'.
    steering = null;
  }
  return { design, spec, perf, steering, diagnoses: diagnoseChassis(design, perf, steering), character: chassisCharacter(perf) };
}

/** A small cache of the exact curves, by each axle's geometry. */
const travelCache = new Map<string, { travel: TravelCurves; roll: RollCentreCurve }>();

function axleCurves(ev: Evaluation, end: AxleEnd): { travel: TravelCurves; roll: RollCentreCurve } {
  const d = ev.design;
  const key = geometryKey(axleOf(d, end), end, d.drive, d.wheelbaseMm);
  let hit = travelCache.get(key);
  if (!hit) {
    const axle = end === 'F' ? ev.spec.front.axle : ev.spec.rear.axle;
    hit = { travel: travelCurves(axle), roll: rollCentreCurve(axle) };
    travelCache.set(key, hit);
    if (travelCache.size > 24) travelCache.delete(travelCache.keys().next().value!);
  }
  return hit;
}

export function designCurves(ev: Evaluation): DesignCurves {
  const f = axleCurves(ev, 'F');
  const r = axleCurves(ev, 'R');
  return {
    travel: [f.travel, r.travel],
    roll: [f.roll, r.roll],
    response: responseCurves(ev.perf),
    invariant: [ev.perf.axles[0].invariant, ev.perf.axles[1].invariant],
    turn: turnCurves(ev.perf, ev.steering),
    understeer: understeerParts(ev.perf),
  };
}

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export class SuspensionDesignerPage {
  private ctx!: SectionContext;
  private panel!: ControlsPanel;
  private readonly results = new DesignerResults();
  private ev: Evaluation = evaluate(DEFAULT_CHASSIS);
  /** The design the visitor started from (a preset, a link, the reset): the ghost of the graphs. */
  private base: Evaluation = this.ev;
  private baseCurves: DesignCurves | null = null;
  /** The figures before the control being moved was first touched, to say what moving it did. */
  private before: { key: string; metrics: Metric[] } | null = null;
  private model: SpecChassisModel | null = null;
  private builtKey = '';
  private lastRebuild = -Infinity;
  private rebuildTimer = 0;
  private urlTimer = 0;
  private drawRequested = false;
  private shown = false;
  private axleView: 'both' | 'front' | 'rear' = 'both';
  private borrowed: Array<() => void> = [];
  private homedFor: FreezeOptions | null = null;
  /** Counts the 3D rebuilds, for checks in the browser. */
  rebuilds = 0;

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    registerParts(SUSPENSION_REGISTERED);
    this.panel = new ControlsPanel({
      edit: (patch) => this.edit(patch),
      preset: (id) => {
        const p = chassisPreset(id);
        if (p) this.setDesign(p.design(), p.note);
      },
      random: () => this.setDesign(randomChassis(), t('Випадкова підвіска: усе в межах конструктора, але про розумність ніхто не дбав.')),
      reset: () => this.setDesign(DEFAULT_CHASSIS, t('Типове компактне передньопривідне авто: стійки спереду, багаторичажна ззаду.')),
      copy: (button) => void this.copyLink(button),
    });
    const { slots } = ctx;
    slots.title.add(`<div class="sd-title">
      <h1 id="sd-title">${t('Своя підвіска')}</h1>
      <p id="sd-sub"></p>
      <div class="sd-headline" id="sd-headline" aria-live="polite"></div>
      <p class="sd-3d-note" id="sd-3d-note" hidden></p>
      <div class="sd-nav"><a class="btn" id="sd-catalogue" href="#/suspensions">${t('Усі підвіски')}</a></div>
    </div>`);
    slots.tools.add(`<div class="tool sd-axle-tool">
      <span class="tool-label">${t('Показати')}</span>
      <div class="segmented" role="group" aria-label="${t('Показати')}" id="sd-axle">
        <button type="button" data-v="both" aria-pressed="true">${t('Усе авто')}</button>
        <button type="button" data-v="front" aria-pressed="false">${t('Передня вісь')}</button>
        <button type="button" data-v="rear" aria-pressed="false">${t('Задня вісь')}</button>
      </div>
    </div>
    <label class="tool sd-explode-tool">
      <span class="tool-label">${t('Розібрати')}</span>
      <input type="range" id="sd-explode" min="0" max="1" step="0.01" value="0" />
    </label>`);
    slots.panel.add(this.panel.root);
    slots.results.add(this.results.root);
    const $ = (id: string): HTMLElement => slots.root.querySelector<HTMLElement>(`#${id}`)!;
    for (const b of $('sd-axle').querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () => this.showAxle(b.dataset.v as 'both' | 'front' | 'rear'));
    }
    $('sd-explode').addEventListener('input', (e) => this.model?.setExplode(Number((e.target as HTMLInputElement).value)));
    $('sd-catalogue').addEventListener('click', (e) => {
      e.preventDefault();
      ctx.router.push({ section: 'suspensions', page: 'catalogue', path: [], query: {} });
    });
    ctx.view.onChange((mode) => {
      if (this.shown) this.model?.setView(mode);
    });
    window.__suspensionDesigner = this;
  }

  /** The design shown now. */
  get design(): ChassisDesign {
    return this.ev.design;
  }

  get evaluation(): Evaluation {
    return this.ev;
  }

  enter(route: Route): void {
    const wanted = designFromPath(route.path);
    const first = !this.shown;
    if (first) this.present();
    if (wanted) {
      // The page's own address coming back (Back, or a reload) keeps the visitor's ghost.
      // A design carried from a page's Setup panel comes with its note.
      const note = takeNote();
      if (!sameDesign(wanted, this.ev.design)) this.setDesign(wanted, note);
      else {
        if (note) this.panel.setNote(note);
        if (first) this.refresh();
      }
      return;
    }
    // No design in the address: the one kept from the last visit, or the one shown before.
    const saved = first && this.base === this.ev && sameDesign(this.ev.design, DEFAULT_CHASSIS) ? savedDesign() : null;
    if (saved) this.setDesign(saved, '');
    else this.refresh();
  }

  /** Borrows the shared page for as long as the designer is shown. */
  private present(): void {
    this.shown = true;
    const { stage, slots, audio, keys, panels } = this.ctx;
    audio.suspend();
    const canvas = stage.renderer.domElement;
    const results = slots.results.parent;
    const root = slots.root;
    const text = (selector: string, value: string): void => {
      const el = root.querySelector<HTMLElement>(selector);
      if (el) this.borrowed.push(this.borrow(() => el.textContent ?? '', (v) => (el.textContent = v), value));
    };
    const attribute = (el: Element | null, name: string, value: string): void => {
      if (el) this.borrowed.push(this.borrow(() => el.getAttribute(name), (v) => (v === null ? el.removeAttribute(name) : el.setAttribute(name, v)), value));
    };
    this.borrowed.push(
      this.borrow(() => document.title, (v) => (document.title = v), t('Своя підвіска. Анатомія авто')),
      this.borrow(() => slots.panelTitle.textContent ?? '', (v) => (slots.panelTitle.textContent = v), t('Параметри')),
      this.borrow(() => results.hidden, (v) => (results.hidden = v), false),
      this.borrow(() => stage.fitScale, (v) => (stage.fitScale = v), 0.9),
      this.borrow(() => stage.orbit, (v) => stage.setOrbit(v), false),
    );
    attribute(canvas, 'aria-label', t('Тривимірна модель обох осей твоєї підвіски. Перетягуй, щоб обертати, коліщатком наближай.'));
    attribute(root.querySelector('#panel'), 'aria-label', t('Параметри'));
    attribute(results, 'aria-label', t('Результати'));
    attribute(root.querySelector('.scale-bar'), 'title', t('Довжина цього відрізка в натурі'));
    text('#panel-toggle-closed', t('Параметри'));
    text('#results-open', t('Результати'));
    text('.results-head h2', t('Результати'));
    const body = document.body;
    const own = [BODY_CLASS, ...(body.classList.contains(PANEL_CLOSED) ? [PANEL_CLOSED] : [])].join(' ');
    this.borrowed.push(this.borrow(() => body.className, (v) => (body.className = v), own));
    slots.partCard.hidden = true;
    keys.use(['suspensions/designer']);
    this.ctx.time.refresh();
    this.builtKey = '';
    panels.relayout();
  }

  private borrow<T>(get: () => T, set: (value: T) => void, value: T): () => void {
    const before = get();
    set(value);
    return () => set(before);
  }

  leave(): void {
    if (!this.shown) return;
    this.shown = false;
    window.clearTimeout(this.rebuildTimer);
    window.clearTimeout(this.urlTimer);
    const { stage, slots } = this.ctx;
    if (this.model) stage.release(this.model);
    this.model?.dispose();
    this.model = null;
    this.builtKey = '';
    slots.partCard.hidden = true;
    for (const giveBack of this.borrowed.reverse()) giveBack();
    this.borrowed = [];
  }

  /** A new design to start from: a preset, a link, the reset. It becomes the ghost of the graphs. */
  setDesign(design: ChassisDesign, note: string): void {
    const resolved = resolveChassis(design);
    let ev: Evaluation;
    try {
      ev = evaluate(resolved);
    } catch {
      return;
    }
    this.ev = ev;
    this.base = ev;
    this.baseCurves = null;
    this.before = null;
    this.panel.clearEffects();
    this.panel.setNote(note);
    this.refresh();
  }

  /** One change from the panel, with what it implies (editChassis), and what it moved. */
  private edit(patch: Partial<ChassisDesign>): void {
    const key = Object.keys(patch)[0] ?? '';
    const was = this.ev;
    if (this.before?.key !== key) this.before = { key, metrics: chassisMetrics(was.perf, was.steering) };
    const wanted = { ...was.design, ...patch } as ChassisDesign;
    const next = editChassis(was.design, patch);
    let ev: Evaluation;
    try {
      ev = evaluate(next);
    } catch {
      // A design the chassis cannot stand on (resolveChassis keeps them out): the controls go back where they were.
      this.panel.sync(was.design);
      return;
    }
    this.ev = ev;
    this.writeNumbers();
    this.panel.sync(ev.design);
    this.panel.showEffects(key as DesignKey, compareMetrics(this.before.metrics, chassisMetrics(ev.perf, ev.steering)).slice(0, 6));
    const moved = movedKeys(wanted, ev.design, Object.keys(patch));
    if (moved.length) this.panel.flash(moved);
    this.requestDraw();
    this.scheduleRebuild();
    this.scheduleUrl();
  }

  /** Everything again for the design shown: figures, panel, graphs, 3D now and the address soon. */
  private refresh(): void {
    this.writeNumbers();
    this.panel.sync(this.ev.design);
    this.requestDraw();
    this.rebuildNow();
    this.scheduleUrl();
  }

  /** The figures, the headline and the title: on every change, at once. */
  private writeNumbers(): void {
    const { perf, steering, character, diagnoses, design } = this.ev;
    this.results.update(perf, steering, character, diagnoses);
    const root = this.ctx.slots.root;
    const sub = root.querySelector<HTMLElement>('#sd-sub');
    if (sub) sub.textContent = summaryOf(design);
    const fatal = diagnoses.filter((d) => d.severity === 'fatal').length;
    const warnings = diagnoses.filter((d) => d.severity === 'warning').length;
    const head = root.querySelector<HTMLElement>('#sd-headline');
    if (head) {
      const item = (label: string, value: string, cls = ''): string => `<span class="sd-hl${cls}"><small>${escapeHtml(label)}</small> ${escapeHtml(value)}</span>`;
      head.innerHTML = [
        item(t('Характер'), character.label),
        item(t('Скідпед'), t('{value} g', { value: fmt(perf.skidpadAcc / 9.80665, 2) })),
        item(t('Недостатня'), t('{value}°/g', { value: fmt(perf.understeerPerG * DEG, 2) })),
        item(t('Частота F / R'), `${fmt(perf.axles[0].rideHz, 2)} / ${fmt(perf.axles[1].rideHz, 2)} ${t('Гц')}`),
        fatal ? item(t('Небезпечно'), String(fatal), ' sd-hl-fatal') : warnings ? item(t('Увага'), String(warnings), ' sd-hl-warn') : item(t('Діагнози'), t('чисто'), ' sd-hl-ok'),
      ].join('');
    }
  }

  private requestDraw(): void {
    if (this.drawRequested) return;
    this.drawRequested = true;
    requestAnimationFrame(() => {
      this.drawRequested = false;
      if (!this.shown) return;
      let curves: DesignCurves;
      try {
        curves = designCurves(this.ev);
        if (!this.baseCurves) this.baseCurves = this.base === this.ev ? curves : designCurves(this.base);
      } catch {
        return;
      }
      this.results.setCurves(curves, this.base === this.ev || sameDesign(this.base.design, this.ev.design) ? null : this.baseCurves);
    });
  }

  private scheduleRebuild(): void {
    window.clearTimeout(this.rebuildTimer);
    const wait = Math.max(0, REBUILD_INTERVAL_MS - (performance.now() - this.lastRebuild));
    this.rebuildTimer = window.setTimeout(() => this.rebuildNow(), wait);
  }

  /** A new model when what it draws changed; nothing otherwise. */
  private rebuildNow(): void {
    if (!this.shown) return;
    const key = modelKey(this.ev.design);
    if (key === this.builtKey && this.model) return;
    this.lastRebuild = performance.now();
    const { stage, view } = this.ctx;
    const d = this.ev.design;
    const wheel = (end: AxleEnd) => {
      const a = axleOf(d, end);
      return { rimRadiusM: rimRadiusM(a), rimWidthM: (a.tyreWidthMm / 1000) * 0.9, tyreWidthM: a.tyreWidthMm / 1000 };
    };
    let model: SpecChassisModel;
    try {
      model = new SpecChassisModel({
        spec: this.ev.spec,
        wheels: { front: wheel('F'), rear: wheel('R') },
        sprungKg: { front: cornerSprungKg(d, 'F'), rear: cornerSprungKg(d, 'R') },
      });
    } catch (error) {
      console.error(error);
      return;
    }
    const first = !this.model;
    this.model = model;
    this.builtKey = key;
    this.rebuilds++;
    model.show(this.axleView);
    stage.setModel(model, { home: HOME, keepCamera: !first, keepScale: !first });
    model.setView(view.mode);
    model.setExplode(Number(this.ctx.slots.root.querySelector<HTMLInputElement>('#sd-explode')?.value ?? 0));
    this.writeAxleNote();
  }

  /** Says which axles the 3D shows only as wheels. */
  private writeAxleNote(): void {
    const d = this.ev.design;
    const missing = (['F', 'R'] as const).filter((_, k) => !this.model?.axles[k]);
    const note = this.ctx.slots.root.querySelector<HTMLElement>('#sd-3d-note');
    if (!note) return;
    const names = missing.map((end) => `${end === 'F' ? t('спереду') : t('ззаду')} ${optionLabel('layout', axleOf(d, end).layout).toLowerCase()}`).join(', ');
    note.textContent = missing.length ? t('У 3D поки лише колеса: {axles}', { axles: names }) : '';
    note.hidden = !missing.length;
  }

  private showAxle(which: 'both' | 'front' | 'rear'): void {
    this.axleView = which;
    for (const b of this.ctx.slots.root.querySelectorAll<HTMLElement>('#sd-axle button')) b.setAttribute('aria-pressed', String(b.dataset.v === which));
    if (!this.model) return;
    this.model.show(which);
    // Framed afresh on what is shown.
    this.ctx.stage.setModel(this.model, { home: HOME });
  }

  private scheduleUrl(): void {
    window.clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      if (!this.shown) return;
      const target = chassisDesignerRoute(this.ev.design);
      this.ctx.router.replace(target);
      try {
        localStorage.setItem(STORAGE_KEY, target.path[0]!);
      } catch {
        // A private window can refuse storage. The link still holds the design.
      }
    }, URL_DELAY_MS);
  }

  private async copyLink(button: HTMLButtonElement): Promise<void> {
    const target = chassisDesignerRoute(this.ev.design);
    const label = t('Копіювати посилання');
    try {
      await navigator.clipboard.writeText(this.ctx.router.shareUrl(target));
      button.textContent = t('Посилання скопійовано');
    } catch {
      // Without clipboard access the address bar holds the link, as it would be shared: without the visitor's context.
      this.ctx.router.replace({ ...target, query: { car: null, ret: null } });
      button.textContent = t('Скопіюй з адресного рядка');
    }
    window.setTimeout(() => (button.textContent = label), 2200);
  }

  frame(): void {
    const frozen = this.ctx.time.frozen;
    if (!frozen) this.homedFor = null;
    else if (frozen !== this.homedFor) {
      this.homedFor = frozen;
      this.ctx.stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
    }
  }

  layout(viewport: Viewport): PanelSizes {
    const narrow = viewport.width < 1280;
    return { right: narrow ? 340 : 380, left: narrow ? 320 : 360, dash: 0, rightLabel: t('Параметри') };
  }

  laidOut(): void {
    // The charts follow their boxes by themselves (ResizeObserver).
  }

  time(): TimeCapabilities {
    // The chassis stands still: true time is all there is.
    return { modes: ['real'] };
  }
}

/** The line under the title: the two layouts, the drive, the mass. */
function summaryOf(d: ChassisDesign): string {
  const drive = { fwd: t('передній привід'), rwd: t('задній привід'), awd: t('повний привід') }[d.drive];
  return `${optionLabel('layout', d.layoutF)} / ${optionLabel('layout', d.layoutR)} · ${drive} · ${t('{value} кг', { value: fmt(d.massKg, 0) })}`;
}

declare global {
  interface Window {
    /** For checks in the browser console, like window.__suspension. */
    __suspensionDesigner?: SuspensionDesignerPage;
  }
}
