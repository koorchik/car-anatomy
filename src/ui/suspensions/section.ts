// The suspensions section (`#/suspensions…`): the full MacPherson corner of the macpherson page in two scenes. The bump scene
// (stage P1d) rolls the corner over an obstacle and plays the run back with its strip chart and numbers; the travel scene
// (stage P1b) holds the wheel on a rig at the travel a slider picks. The Setup panel (build order, A3) edits
// the corner's setup in both, and every change shows at once on the arrows, the lasers, the tyre and the numbers. There
// is no engine here, so the sound is suspended while the section is shown (the plan of the whole car, its amendments to
// the suspensions plan, item 9).
//
// Things the section borrows from the shared page (the tab's title, the panel's heading, the stage's orbit and fit)
// it gives back exactly on leaving; what it put into the shared places the shell hides itself (section-dom.ts).

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import { CornerModel, cornerFrame } from '../../scene/suspension/corner-model.ts';
import { SUSPENSION_REGISTERED } from '../../scene/suspension/parts.ts';
import { rigFrame, rigTravelRange } from '../../scene/suspension/rig-frame.ts';
import type { Stage } from '../../scene/stage.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import { onSegment, setSegment } from '../../shell/segmented.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, TimeMode, Viewport } from '../../shell/section.ts';
import {
  BUMP_DEFAULT, BUMP_PUNCH, clampScene, newBumpSample, resolveBumpCorner, runBump, sampleTrace, traceSeconds, type BumpRun,
  type BumpScene, type ObstacleId, type WheelId,
} from '../../suspension/bump.ts';
import { EventRoad } from '../../suspension/road.ts';
import { factorySetup, type CornerSetup, type ResolvedCorner } from '../../suspension/setup.ts';
import type { CornerSpec } from '../../suspension/spec.ts';
import { jtektCorner } from '../../suspension/templates/macpherson.ts';
import { bumpCaption, bumpRows } from './bump-text.ts';
import { SUSPENSION_KEY_CONTEXTS, suspensionKeys } from './keys.ts';
import { dashHtml, obstacleSize, panelHtml, titleHtml, toolsHtml } from './markup.ts';
import { DEFAULT_SCENE, sceneOf, stepScene, type SceneId } from './scenes.ts';
import { SetupPanel } from './setup-panel.ts';
import { StripChart } from './strip-chart.ts';
import './suspensions.css';

/** The corner seen from the inboard side and a little from the front: the strut, the arm, the rack and the shaft. */
const HOME: readonly [number, number, number] = [-0.72, 0.42, 0.8];
/** The class on <body> that the section's styles live under (suspensions plan, what the section needs of the shell). */
const BODY_CLASS = 'section-suspensions';
/** The shell's class for a closed right panel, which its layout keeps on <body> whatever the section. */
const PANEL_CLOSED = 'panel-closed';
const DEG = 180 / Math.PI;
/** The factors of the slow-down ×k (suspensions plan, the speed control: ×0.02…×0.5); the page opens at ×0.1 (step 1). */
const SLOWDOWN: readonly number[] = [0.02, 0.05, 0.1, 0.25, 0.5];
const OPENING_FACTOR = 0.1;
/** Simulated seconds the wheel rolls on after a run before the next one starts over. */
const HOLD_S = 0.6;
/** Height of the bump scene's dash, px; suspensions.css gives --dash-h the same. */
const DASH_PX = { wide: 156, small: 188 };
/** Real seconds between two writes of the clock. */
const CLOCK_EVERY_S = 0.1;
/** Frames the frame-time figure averages over (window.__suspension.section.frameStats). */
const FRAME_WINDOW = 240;

declare global {
  interface Window {
    /** For checks in the browser console, like window.__engine. */
    __suspension?: { stage: Stage; section: SuspensionSection };
  }
}

/** A number with its sign, in the visitor's locale. */
const signed = (value: number, digits: number): string => {
  const rounded = Number(value.toFixed(digits));
  const text = Math.abs(rounded).toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return rounded > 0 ? `+${text}` : rounded < 0 ? `−${text}` : text;
};

const plain = (value: number, digits: number): string => value.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export class SuspensionSection implements Section {
  readonly id = 'suspensions' as const;
  readonly solidLabel = t('Підвіска');
  private ctx!: SectionContext;
  private corner!: CornerSpec;
  private resolved!: ResolvedCorner;
  private model!: CornerModel;
  private setupPanel!: SetupPanel;
  private strip!: StripChart;
  private readonly frameData = cornerFrame();
  private readonly sample = newBumpSample();
  private scene: SceneId = DEFAULT_SCENE;
  private bump: BumpScene = { ...BUMP_DEFAULT };
  private run!: BumpRun;
  /** Playback time of the run, simulated seconds; past its end the wheel rolls on for HOLD_S, then it starts over. */
  private tau = 0;
  private paused = false;
  /** The setup or the bump scene changed: resolved and run again on the next frame, so a dragged slider costs one run a frame. */
  private dirty = false;
  /** Wheel travel the rig holds, m. */
  private travel = 0;
  private shown = false;
  /** The page has opened its first bump scene in the slow-down ×0.1 (step 1); later the visitor's choice stands. */
  private openedSlow = false;
  /** The time the bump scene ran in when the visitor went to a scene that offers only true time, to come back to. */
  private bumpTime: { mode: TimeMode; factor: number } | null = null;
  /** What the section changed on the shared page while shown, each giving it back. */
  private borrowed: Array<() => void> = [];
  /** The freeze the camera has gone home for (TimeControl.frozen). */
  private homedFor: FreezeOptions | null = null;
  private clockShown = Number.NaN;
  /** Real seconds since the clock was last written. */
  private clockAge = Infinity;
  private readonly frameMs = new Float64Array(FRAME_WINDOW);
  private frames = 0;

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    // The corner's and the axle's cards in one dictionary: both name the rack.
    registerParts(SUSPENSION_REGISTERED);
    this.corner = jtektCorner();
    const factory = factorySetup(this.corner);
    this.resolved = resolveBumpCorner(this.corner, factory, this.bump.wheel);
    this.model = new CornerModel(this.resolved);
    const range = rigTravelRange(this.resolved);
    const { slots } = ctx;
    slots.title.add(titleHtml());
    slots.tools.add(toolsHtml(Math.round(range.min * 1000), Math.round(range.max * 1000)));
    slots.panel.add(panelHtml());
    slots.afterDash.add(dashHtml());
    this.strip = new StripChart(this.$<HTMLCanvasElement>('susp-strip'));
    this.setupPanel = new SetupPanel(this.$('susp-panel'), factory, () => (this.dirty = true));
    this.listen();
    ctx.keys.bind(
      SUSPENSION_KEY_CONTEXTS[0],
      suspensionKeys({
        event: () => {
          if (this.scene !== 'bump') return false;
          this.restart();
          return true;
        },
        scene: (direction) => this.setScene(stepScene(this.scene, direction)),
      }),
    );
    this.apply();
    this.readout();
    window.__suspension = { stage: ctx.stage, section: this };
  }

  /** Moves the wheel to `mm` of travel, as the slider does. */
  setTravel(mm: number): void {
    const range = rigTravelRange(this.resolved);
    this.travel = Math.min(range.max, Math.max(range.min, mm / 1000));
    const slider = this.$<HTMLInputElement>('susp-travel');
    if (Number(slider.value) !== mm) slider.value = String(mm);
    this.readout();
  }

  /** The run shown now and where its playback is: for checks in the browser. */
  get state(): { scene: SceneId; tau: number; paused: boolean; run: BumpRun; resolved: ResolvedCorner; setup: CornerSetup } {
    return { scene: this.scene, tau: this.tau, paused: this.paused, run: this.run, resolved: this.resolved, setup: this.setupPanel.current };
  }

  /** The section's own frame time over the last frames, ms (not the drawing: the stage's render is the shell's). */
  frameStats(): { mean: number; max: number; frames: number } {
    const n = Math.min(this.frames, FRAME_WINDOW);
    let sum = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
      sum += this.frameMs[i]!;
      max = Math.max(max, this.frameMs[i]!);
    }
    return { mean: n ? sum / n : 0, max, frames: n };
  }

  /** Sets the setup as the panel would, for checks in the browser. */
  setSetup(patch: Partial<CornerSetup>): void {
    this.setupPanel.edit(patch);
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.ctx.slots.root.querySelector<T>(`#${id}`)!;
  }

  private listen(): void {
    const { view } = this.ctx;
    this.$<HTMLInputElement>('susp-travel').addEventListener('input', (event) => this.setTravel(Number((event.target as HTMLInputElement).value)));
    this.$<HTMLInputElement>('susp-explode').addEventListener('input', (event) => this.model.setExplode(Number((event.target as HTMLInputElement).value)));
    const overlays = (): void => this.model.setOverlays({ forces: this.$<HTMLInputElement>('susp-forces').checked, laser: this.$<HTMLInputElement>('susp-laser').checked });
    this.$('susp-forces').addEventListener('change', overlays);
    this.$('susp-laser').addEventListener('change', overlays);
    onSegment(this.$('susp-scene'), (v) => this.setScene(v as SceneId));
    onSegment(this.$('susp-obstacle'), (v) => this.editBump({ obstacle: v as ObstacleId }));
    onSegment(this.$('susp-wheel'), (v) => this.editBump({ wheel: v as WheelId }));
    this.$<HTMLInputElement>('susp-speed').addEventListener('input', (event) => this.editBump({ speedKmh: Number((event.target as HTMLInputElement).value) }));
    this.$('susp-punch').addEventListener('click', () => {
      this.editBump({ obstacle: BUMP_PUNCH.obstacle, speedKmh: BUMP_PUNCH.speedKmh });
      this.restart();
    });
    this.$('susp-go').addEventListener('click', () => this.restart());
    this.$('susp-pause').addEventListener('click', () => this.setPaused(!this.paused));
    // The view is the shell's and outlives this section: another section's choice is not drawn here until it is back.
    view.onChange((mode) => {
      if (this.shown) this.model.setView(mode);
    });
  }

  private editBump(patch: Partial<BumpScene>): void {
    this.bump = clampScene({ ...this.bump, ...patch });
    this.dirty = true;
  }

  /** Drives over the obstacle again from rest. */
  private restart(): void {
    this.tau = 0;
    this.clockAge = Infinity;
    this.setPaused(false);
  }

  private setPaused(on: boolean): void {
    this.paused = on;
    this.clockAge = Infinity;
    const button = this.$('susp-pause');
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? t('Продовжити') : t('Пауза');
  }

  /**
   * Resolves the corner for the setup and the wheels, runs it over the obstacle, and puts both everywhere they show:
   * the model, the road, the strip chart, the numbers and the panel. Playback keeps its time, so a change shows on the
   * same moment of the run.
   */
  private apply(): void {
    this.dirty = false;
    let resolved: ResolvedCorner;
    try {
      resolved = resolveBumpCorner(this.corner, this.setupPanel.current, this.bump.wheel);
    } catch {
      // A setup the linkage cannot reach (the core says so) leaves the corner as it was.
      this.setupPanel.show(this.resolved);
      return;
    }
    this.resolved = resolved;
    this.model.setCorner(resolved);
    const run = runBump(resolved, this.bump);
    this.run = run;
    if (this.scene === 'bump') this.model.setRoad(new EventRoad(run.trace.events));
    this.strip.setRun(run);
    this.setupPanel.show(resolved);
    this.writeBump();
    if (this.scene === 'travel') this.setTravel(Math.round(this.travel * 1000));
  }

  /** The scene's controls, the line in the dash, the numbers and the caption for the current run. */
  private writeBump(): void {
    const { scene, stats } = this.run;
    setSegment(this.$('susp-obstacle'), scene.obstacle === 'kerb-hard' ? '' : scene.obstacle);
    setSegment(this.$('susp-wheel'), scene.wheel);
    const speed = this.$<HTMLInputElement>('susp-speed');
    if (document.activeElement !== speed) speed.value = String(scene.speedKmh);
    const kmh = t('{value} км/год', { value: plain(scene.speedKmh, 0) });
    this.$('susp-speed-value').textContent = kmh;
    this.$('susp-what').textContent = `${obstacleSize(scene.obstacle)}, ${kmh}`;
    this.$('susp-numbers').innerHTML = bumpRows(stats)
      .map((r) => `<div class="susp-number${r.alarm ? ' alarm' : ''}" data-row="${r.id}"><dt>${r.label}</dt><dd>${r.value}</dd></div>`)
      .join('');
    this.$('susp-caption').textContent = bumpCaption(stats);
    // Events, not numbers, for a screen reader (suspensions plan, the interface).
    const events = [stats.airS > 0 ? t('Колесо відривається від дороги.') : '', stats.stopHit ? t('Удар у відбійник.') : ''].join(' ').trim();
    const live = this.$('susp-live');
    if (live.textContent !== events) live.textContent = events;
  }

  enter(route: Route, _from: Route | null): void {
    const scene = sceneOf(route.query);
    if (this.shown) {
      this.setScene(scene, false);
      return;
    }
    this.shown = true;
    const { stage, slots, audio, keys, view } = this.ctx;
    audio.suspend();
    const canvas = stage.renderer.domElement;
    const results = slots.results.parent;
    const attribute = (el: Element | null, name: string, value: string): (() => void) | null =>
      el && this.borrow(() => el.getAttribute(name), (v) => (v === null ? el.removeAttribute(name) : el.setAttribute(name, v)), value);
    const panelToggle = slots.root.querySelector<HTMLElement>('#panel-toggle-closed');
    this.borrowed = [
      this.borrow(() => document.title, (v) => (document.title = v), t('Підвіски. Анатомія авто')),
      this.borrow(() => slots.panelTitle.textContent ?? '', (v) => (slots.panelTitle.textContent = v), t('Налаштувати')),
      this.borrow(() => canvas.getAttribute('aria-label'), (v) => (v === null ? canvas.removeAttribute('aria-label') : canvas.setAttribute('aria-label', v)), t('Тривимірна модель підвіски. Перетягуй, щоб обертати, коліщатком наближай.')),
      this.borrow(() => results.hidden, (v) => (results.hidden = v), true),
      this.borrow(() => stage.fitScale, (v) => (stage.fitScale = v), 0.68),
      // A corner is studied, not shown off: it stands still unless the visitor turns it.
      this.borrow(() => stage.orbit, (v) => stage.setOrbit(v), false),
    ];
    // The skeleton names the right panel and its button after the engine, and the scale bar speaks of engines.
    if (panelToggle) this.borrowed.push(this.borrow(() => panelToggle.textContent ?? '', (v) => (panelToggle.textContent = v), t('Налаштувати')));
    for (const giveBack of [
      attribute(slots.root.querySelector('#panel'), 'aria-label', t('Налаштувати')),
      attribute(slots.root.querySelector('.scale-bar'), 'title', t('Довжина цього відрізка в натурі')),
    ]) {
      if (giveBack) this.borrowed.push(giveBack);
    }
    // The body's classes are another section's modes (the engine designer's, the dyno's) but for the shell's own.
    const body = document.body;
    const own = [BODY_CLASS, ...(body.classList.contains(PANEL_CLOSED) ? [PANEL_CLOSED] : [])].join(' ');
    this.borrowed.push(this.borrow(() => body.className, (v) => (body.className = v), own));
    // The shared first-visit hint stands above the tools row by --tools-h, which the engine pages measure for theirs.
    const rootStyle = document.documentElement.style;
    this.borrowed.push(this.borrow(() => rootStyle.getPropertyValue('--tools-h'), (v) => (v ? rootStyle.setProperty('--tools-h', v) : rootStyle.removeProperty('--tools-h')), ''));
    slots.partCard.hidden = true;
    stage.setModel(this.model, { home: HOME });
    this.model.setView(view.mode);
    keys.use(SUSPENSION_KEY_CONTEXTS);
    this.setScene(scene, false);
  }

  /** Shows a scene: its controls, its dash and its choice of time; `record` writes it into the address. */
  private setScene(scene: SceneId, record = true): void {
    const changed = scene !== this.scene || !document.body.classList.contains(`susp-scene-${scene}`);
    const time = this.ctx.time;
    if (changed && this.scene === 'bump' && scene !== 'bump') this.bumpTime = { mode: time.mode, factor: time.factor };
    this.scene = scene;
    const body = document.body;
    body.classList.toggle('susp-scene-bump', scene === 'bump');
    body.classList.toggle('susp-scene-travel', scene === 'travel');
    setSegment(this.$('susp-scene'), scene);
    this.$('susp-dash').hidden = scene !== 'bump';
    if (record) this.ctx.router.replace({ query: { s: scene === DEFAULT_SCENE ? null : scene } });
    if (!changed) return;
    if (scene === 'bump') {
      this.model.setExplode(0);
      this.$<HTMLInputElement>('susp-explode').value = '0';
      this.model.setRoad(new EventRoad(this.run.trace.events));
      this.restart();
    } else {
      this.model.setRoad(null);
      this.readout();
    }
    time.refresh();
    // The first bump scene opens slowed down ten times (step 1); after that the visitor's choice of time stands, and
    // the rig's true time, which the rig alone forced, does not replace it.
    if (scene === 'bump' && !this.openedSlow) {
      this.openedSlow = true;
      time.set('slowdown', OPENING_FACTOR);
    } else if (scene === 'bump' && this.bumpTime) {
      time.set(this.bumpTime.mode, this.bumpTime.factor);
    }
    // The dash comes or goes and the tools row changes: the corner is framed again above them.
    this.ctx.panels.relayout();
  }

  /** Sets a shared value for as long as the section is shown, and gives back what restores it. */
  private borrow<T>(get: () => T, set: (value: T) => void, value: T): () => void {
    const before = get();
    set(value);
    return () => set(before);
  }

  leave(_to: Route): void {
    if (!this.shown) return;
    this.shown = false;
    const { stage, slots, time } = this.ctx;
    stage.release(this.model);
    slots.partCard.hidden = true;
    time.clock(null);
    this.clockShown = Number.NaN;
    for (const giveBack of this.borrowed.reverse()) giveBack();
    this.borrowed = [];
  }

  frame(dt: number): void {
    const started = performance.now();
    if (this.dirty) this.apply();
    const time = this.ctx.time;
    const frozen = time.frozen;
    if (this.scene === 'bump') this.bumpFrame(frozen ? null : dt);
    else {
      rigFrame(this.resolved, this.travel, this.frameData);
      this.model.update(this.frameData);
    }
    if (!frozen) {
      this.homedFor = null;
    } else if (frozen !== this.homedFor) {
      this.homedFor = frozen;
      this.ctx.stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
    }
    this.frameMs[this.frames++ % FRAME_WINDOW] = performance.now() - started;
  }

  /** Plays the run: `dt` real seconds, slowed by the factor; null holds the page at rest for a snapshot. */
  private bumpFrame(dt: number | null): void {
    const time = this.ctx.time;
    const run = this.run;
    const end = traceSeconds(run.trace);
    if (dt === null) this.tau = 0;
    else if (!this.paused) {
      this.tau += dt * (time.mode === 'slowdown' ? time.factor : 1);
      if (this.tau > end + HOLD_S) this.tau = 0;
    }
    const s = sampleTrace(run.trace, this.tau, this.sample);
    const f = this.frameData;
    // Past the end the corner has settled (or the run is cut) and the wheel rolls on along a level road.
    const x = s.x + Math.max(0, this.tau - end) * (run.scene.speedKmh / 3.6);
    f.travel = s.travel;
    f.bodyZ = s.bodyZ;
    f.roadX = x;
    f.roadLift = 0;
    f.rack = 0;
    f.spin = x / this.resolved.wheelCentreZM;
    f.springN = s.springN;
    f.damperN = s.damperN;
    f.stopN = s.stopN;
    f.tyreN = s.tyreN;
    this.model.update(f);
    this.strip.draw(this.tau);
    // The clock to the millisecond, ten times a second: formatting a number in the locale is too slow for every frame.
    this.clockAge += dt ?? CLOCK_EVERY_S;
    const shownAt = Math.round(this.tau * 1000);
    if (this.clockAge >= CLOCK_EVERY_S && shownAt !== this.clockShown) {
      this.clockAge = 0;
      this.clockShown = shownAt;
      time.clock(shownAt / 1000);
    }
  }

  layout(viewport: Viewport): PanelSizes {
    const dash = this.scene === 'bump' ? (viewport.small ? DASH_PX.small : DASH_PX.wide) : 0;
    return { right: 380, left: 0, dash, rightLabel: t('Налаштувати') };
  }

  laidOut(): void {
    this.strip.resize();
    this.measureTools();
  }

  /**
   * How high the tools row reaches above the dash, as --tools-h: this page's row has two or three lines where an
   * engine page's has one, and the shell's hint would cover them.
   */
  private measureTools(): void {
    if (!this.shown) return;
    const { root, tools } = this.ctx.slots;
    const row = tools.parent;
    const hint = root.querySelector<HTMLElement>('#parts-callout');
    if (!hint || row.offsetParent === null) return;
    const dash = parseFloat(getComputedStyle(hint).getPropertyValue('--dash-h')) || 0;
    const above = root.getBoundingClientRect().bottom - row.getBoundingClientRect().top - dash;
    if (above > 0) document.documentElement.style.setProperty('--tools-h', `${Math.round(above)}px`);
  }

  time(): TimeCapabilities {
    // The rig holds the wheel still: true time is all there is. The bump scene adds the slow-down ×k with its clock.
    return this.scene === 'bump' ? { modes: ['real', 'slowdown'], slowdown: SLOWDOWN } : { modes: ['real'] };
  }

  /** The numbers under the panel's heading and beside the slider, for the travel the rig holds. */
  private readout(): void {
    const q = this.travel;
    const axle = this.resolved.axle;
    rigFrame(this.resolved, q, this.frameData);
    const mm = t('{value} мм', { value: signed(q * 1000, 0) });
    this.$('susp-travel-value').textContent = mm;
    this.$('susp-r-travel').textContent = mm;
    this.$('susp-r-camber').textContent = `${signed(axle.value('camber', q) * DEG, 2)}°`;
    this.$('susp-r-toe').textContent = `${signed(axle.value('toe', q) * DEG, 2)}°`;
    this.$('susp-r-spring-len').textContent = t('{value} мм', { value: plain(axle.value('springLen', q) * 1000, 0) });
    this.$('susp-r-spring').textContent = t('{value} кН', { value: plain(this.frameData.springN / 1000, 2) });
  }
}
