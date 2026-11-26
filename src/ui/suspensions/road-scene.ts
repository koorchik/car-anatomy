// The rough-road scene of the suspension page (suspensions plan, the rough road, steps 1–5, stage P3). The corner
// drives along an ISO 8608 road of a fixed seed; the run is computed ahead in portions over a few frames and then
// played back at the visitor's time, like the bump scene's. The dash shows the ride triangle of the run as three bars
// (longer is worse) and, beside them, the damping sweep of the frequency-domain model with the current damper on it.
// 'Remember as A' keeps the bars and the curves pale beside the new ones: the road is the same, so it is fair.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { onSegment, setSegment } from '../../shell/segmented.ts';
import { newBumpSample, sampleTrace, traceSeconds } from '../../suspension/bump.ts';
import type { RoadClass } from '../../suspension/road.ts';
import {
  clampRough, resolveRoughCorner, ROAD_CLASSES, ROUGH_UNSPRUNG_KG, ROUGH_BROKEN, ROUGH_DEFAULT, ROUGH_SETTLE_S, ROUGH_SPEED_KMH, roughSweep, RoughRun,
  type RoughResult, type RoughScene, type RoughSweep,
} from '../../suspension/rough-run.ts';
import type { CornerSetup, ResolvedCorner } from '../../suspension/setup.ts';
import type { CornerSpec } from '../../suspension/spec.ts';
import type { CornerFrame } from '../../scene/suspension/corner-model.ts';
import { RIDE_COLORS, RideChart, rideLegendHtml } from './ride-chart.ts';
import { airAlarm, rideBars, rideScale, sweepCaption, type RideBar, type RideScale } from './ride-text.ts';

/** Real milliseconds a frame may spend on the run being computed, and the steps between two looks at the clock. */
const BUDGET_MS = 6;
const CHUNK = 1500;

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const roadLabel = (c: RoadClass): string =>
  ({ A: t('A: дуже рівна'), B: t('B: звичайна'), C: t('C: розбита'), D: t('D: дуже погана') })[c];

/** The scene's controls in the panel. */
export const roadPanelHtml = (): string => `<section class="susp-bump-controls susp-only-road">
      <h3>${t('Погана дорога')}</h3>
      <div class="susp-ctl">
        <span class="susp-ctl-head"><span>${t('Дорога за ISO 8608')}</span></span>
        <div class="segmented" role="group" aria-label="${t('Дорога за ISO 8608')}" id="susp-road-class">
          ${ROAD_CLASSES.map((c) => `<button type="button" data-v="${c}" aria-pressed="false">${roadLabel(c)}</button>`).join('')}
        </div>
      </div>
      <label class="susp-ctl">
        <span class="susp-ctl-head"><span>${t('Швидкість')}</span><output id="susp-road-speed-value" for="susp-road-speed"></output></span>
        <input type="range" id="susp-road-speed" min="${ROUGH_SPEED_KMH[0]}" max="${ROUGH_SPEED_KMH[1]}" step="5" />
      </label>
      <button type="button" class="btn" id="susp-road-broken">${t('Розбита дорога на 140 км/год')}</button>
      <button type="button" class="btn" id="susp-road-remember" aria-pressed="false">${t('Запам’ятати як A')}</button>
      <p class="susp-caption" id="susp-road-caption"></p>
      <p class="susp-note">${t('Амортизатор міняй у розділі «Пружина, амортизатор, шина» нижче: стовпчики покажуть, що стало з комфортом, шиною й ходом, а точка на графіку — де це налаштування серед усіх можливих.')}</p>
    </section>`;

/** The wheel's mass (rough road, step 4; stand, step 4), shared by both scenes. */
export const rideWheelHtml = (): string => `<section class="susp-bump-controls susp-only-ride">
      <div class="susp-ctl">
        <span class="susp-ctl-head"><span>${t('Маса колеса з усім, що рухається з ним')}</span></span>
        <div class="segmented" role="group" aria-label="${t('Маса колеса')}" id="susp-ride-mass">
          ${ROUGH_UNSPRUNG_KG.map((kg) => `<button type="button" data-v="${kg}" aria-pressed="false">${t('{value} кг', { value: kg })}</button>`).join('')}
        </div>
      </div>
    </section>`;

const barHtml = (id: string, color: string): string => `<div class="susp-bar" data-bar="${id}" style="--c: ${color}">
      <div class="susp-bar-head"><span class="susp-bar-label"></span><span class="susp-bar-value"></span></div>
      <div class="susp-bar-track"><i class="susp-bar-a"></i><i class="susp-bar-fill"></i></div>
      <p class="susp-bar-note"></p>
    </div>`;

/** The scene's dash: the three bars of the triangle and the damping chart. */
export const roadDashHtml = (): string => `<footer class="susp-dash susp-ride-dash" id="susp-road-dash" hidden>
      <section class="susp-bars-box">
        <div class="susp-bars" id="susp-road-bars">
          ${barHtml('comfort', RIDE_COLORS.comfort)}${barHtml('grip', RIDE_COLORS.grip)}${barHtml('travel', RIDE_COLORS.travel)}
        </div>
        <p class="susp-bars-foot"><span><span class="susp-alarm" id="susp-road-alarm"></span> <span id="susp-road-what"></span></span><span id="susp-road-status"></span></p>
      </section>
      <section class="susp-dash-chart">
        ${rideLegendHtml()}
        <canvas id="susp-road-chart" aria-label="${t('Графік: комфорт і коливання навантаження шини залежно від ступеня демпфування ζ')}" role="img"></canvas>
      </section>
      <p class="visually-hidden" id="susp-road-live" aria-live="polite"></p>
    </footer>`;

/** Whether two setups are the same values: the panel hands back a fresh object after every resolve. */
export const sameSetup = (a: CornerSetup, b: CornerSetup | null): boolean =>
  b !== null && (Object.keys(a) as Array<keyof CornerSetup>).every((k) => a[k] === b[k]);

interface Remembered {
  result: RoughResult;
  sweep: RoughSweep;
}

export class RoadScene {
  private readonly root: HTMLElement;
  private corner: CornerSpec;
  private readonly chart: RideChart;
  private readonly sample = newBumpSample();
  scene: RoughScene = { ...ROUGH_DEFAULT };
  private setup: CornerSetup | null = null;
  private resolved: ResolvedCorner | null = null;
  private sweep: RoughSweep | null = null;
  /** The run being computed, and the last finished one, which plays until the next is ready. */
  private pending: RoughRun | null = null;
  private shownRun: RoughRun | null = null;
  private remembered: Remembered | null = null;
  /** Playback time from the start of the run, s. */
  private tau = ROUGH_SETTLE_S;
  private dirty = true;

  /** `root` holds roadPanelHtml() and roadDashHtml(); `onChange` hears a change of the scene's own controls. */
  private readonly onChange: () => void;

  constructor(root: HTMLElement, corner: CornerSpec, onChange: () => void) {
    this.root = root;
    this.onChange = onChange;
    this.corner = corner;
    this.chart = new RideChart(this.$<HTMLCanvasElement>('susp-road-chart'));
    onSegment(this.$('susp-road-class'), (v) => this.edit({ roadClass: v as RoadClass }));
    this.$<HTMLInputElement>('susp-road-speed').addEventListener('input', (e) => this.edit({ speedKmh: Number((e.target as HTMLInputElement).value) }));
    this.$('susp-road-broken').addEventListener('click', () => this.edit(ROUGH_BROKEN));
    this.$('susp-road-remember').addEventListener('click', () => this.remember());
    this.writeControls();
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  /** Changes the scene as its controls do (and as checks in the browser may). */
  edit(patch: Partial<RoughScene>): void {
    this.scene = clampRough({ ...this.scene, ...patch });
    this.dirty = true;
    this.writeControls();
    this.onChange();
  }

  /** Another page's corner (stage P4): resolved and run again on the next apply, on the same road. */
  setCorner(corner: CornerSpec): void {
    if (corner === this.corner) return;
    this.corner = corner;
    this.dirty = true;
  }

  /** The run shown and the remembered one, for checks in the browser. */
  get state(): { scene: RoughScene; result: RoughResult | null; computing: boolean; sweep: RoughSweep | null; remembered: RoughResult | null } {
    return { scene: this.scene, result: this.shownRun?.result ?? null, computing: this.pending !== null, sweep: this.sweep, remembered: this.remembered?.result ?? null };
  }

  /** Resolves the corner for the setup on the scene's wheel and starts a new run; null when the linkage cannot. */
  apply(setup: CornerSetup): ResolvedCorner | null {
    if (!this.dirty && sameSetup(setup, this.setup) && this.resolved) return this.resolved;
    let rc: ResolvedCorner;
    try {
      rc = resolveRoughCorner(this.corner, setup, this.scene);
    } catch {
      return null;
    }
    this.setup = setup;
    this.dirty = false;
    this.resolved = rc;
    this.sweep = roughSweep(rc, this.scene);
    this.pending = new RoughRun(rc, this.scene);
    this.$('susp-road-caption').textContent = sweepCaption(this.sweep);
    this.writeStatus();
    this.chart.set(this.sweep, this.remembered?.sweep ?? null);
    return rc;
  }

  /** Computes the pending run for at most a few milliseconds; swaps it in when done. */
  compute(): void {
    const run = this.pending;
    if (!run) return;
    const started = performance.now();
    while (!run.advance(CHUNK) && performance.now() - started < BUDGET_MS);
    if (!run.done) return;
    this.pending = null;
    this.shownRun = run;
    if (this.tau > traceSeconds(run.trace)) this.tau = ROUGH_SETTLE_S;
    this.writeBars();
    this.writeStatus();
  }

  /** The road the 3D should show (null until the first run is ready). */
  get road(): RoughRun['road'] | null {
    return this.shownRun?.road ?? null;
  }

  /** Plays the run: `dt` simulated seconds (null: rest at the start, for a snapshot). False before the first run. */
  frame(dt: number | null, f: CornerFrame): boolean {
    const run = this.shownRun;
    if (!run) return false;
    const end = traceSeconds(run.trace);
    if (dt === null) this.tau = ROUGH_SETTLE_S;
    else {
      this.tau += dt;
      if (this.tau > end) this.tau = ROUGH_SETTLE_S;
    }
    const s = sampleTrace(run.trace, this.tau, this.sample);
    f.travel = s.travel;
    f.bodyZ = s.bodyZ;
    f.roadX = s.x;
    f.roadLift = 0;
    f.rack = 0;
    f.spin = s.x / run.corner.wheelCentreZM;
    f.springN = s.springN;
    f.damperN = s.damperN;
    f.stopN = s.stopN;
    f.tyreN = s.tyreN;
    return true;
  }

  /** Seconds of the measured part played so far, for the clock. */
  get clockS(): number {
    return Math.max(0, this.tau - ROUGH_SETTLE_S);
  }

  /** Restart from the start of the measured part. */
  restart(): void {
    this.tau = ROUGH_SETTLE_S;
  }

  resize(): void {
    this.chart.resize();
  }

  private remember(): void {
    if (this.remembered) this.remembered = null;
    else if (this.shownRun?.result && this.sweep && !this.pending) this.remembered = { result: this.shownRun.result, sweep: this.sweep };
    else return;
    const button = this.$('susp-road-remember');
    button.setAttribute('aria-pressed', String(this.remembered !== null));
    button.textContent = this.remembered ? t('Забути A') : t('Запам’ятати як A');
    if (this.sweep) this.chart.set(this.sweep, this.remembered?.sweep ?? null);
    this.writeBars();
  }

  private writeControls(): void {
    setSegment(this.$('susp-road-class'), this.scene.roadClass);
    const speed = this.$<HTMLInputElement>('susp-road-speed');
    if (document.activeElement !== speed) speed.value = String(this.scene.speedKmh);
    this.$('susp-road-speed-value').textContent = t('{value} км/год', { value: fmt(this.scene.speedKmh, 0) });
  }

  private writeStatus(): void {
    this.$('susp-road-status').textContent = this.pending ? t('рахую новий проїзд…') : '';
    this.$('susp-road-bars').classList.toggle('stale', this.pending !== null && this.shownRun !== null);
    (this.$('susp-road-remember') as HTMLButtonElement).disabled = !this.remembered && (this.pending !== null || !this.shownRun);
  }

  private writeBars(): void {
    const r = this.shownRun?.result;
    if (!r || !this.sweep) return;
    const a = this.remembered?.result ?? null;
    const scale = rideScale(this.sweep, r, a);
    const ghost = a ? rideBars(a) : null;
    rideBars(r).forEach((bar, i) => this.writeBar(bar, scale, ghost?.[i] ?? null));
    this.$('susp-road-alarm').textContent = airAlarm(r);
    const run = this.shownRun!;
    this.$('susp-road-what').textContent = t('Заміряно {seconds} с дороги класу {road} на {speed} км/год, ζ {zeta}, колесо {kg} кг. Довший стовпчик — гірше.', {
      seconds: fmt(r.seconds, 0),
      road: run.scene.roadClass,
      speed: fmt(run.scene.speedKmh, 0),
      zeta: fmt(run.corner.zeta, 2),
      kg: fmt(run.scene.unsprungKg, 0),
    });
    const live = this.$('susp-road-live');
    const line = airAlarm(r);
    if (live.textContent !== line) live.textContent = line;
  }

  private writeBar(bar: RideBar, scale: RideScale, ghost: RideBar | null): void {
    const el = this.root.querySelector<HTMLElement>(`.susp-bar[data-bar="${bar.id}"]`)!;
    const share = (b: RideBar): number => Math.min(1, b.amount / scale[b.id]);
    el.querySelector('.susp-bar-label')!.textContent = bar.label;
    el.querySelector('.susp-bar-value')!.textContent = bar.value;
    el.querySelector('.susp-bar-note')!.textContent = ghost ? `${bar.note} · ${`A: ${ghost.value}`}` : bar.note;
    el.querySelector<HTMLElement>('.susp-bar-fill')!.style.width = `${(share(bar) * 100).toFixed(1)}%`;
    const ghostEl = el.querySelector<HTMLElement>('.susp-bar-a')!;
    ghostEl.hidden = !ghost;
    if (ghost) ghostEl.style.width = `${(share(ghost) * 100).toFixed(1)}%`;
    el.classList.toggle('alarm', bar.alarm);
  }
}
