// The shaker scene of the suspension page (suspensions plan, the shaker, steps 1–4, stage P3). The corner stands on a
// post that shakes the tyre. The dash shows two frequency responses, the body's acceleration and the force in the
// contact patch: the analytic curve of the corner, three reference dampers and the stepped-sine points, measured ahead
// in portions over a few frames. The 3D runs its own quarter car on the post at the frequency the slider holds or the
// sweep passes, so the body swings up near 1.2 Hz and calms again, and the wheel trembles near 13 Hz.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { QuarterSim } from '../../suspension/quarter.ts';
import { SteppedSine } from '../../suspension/shaker.ts';
import {
  GlidingPost, pointsGap, SHAKER_BAND_HZ, SHAKER_FREQS, SHAKER_VELOCITY_MS, standCurves, type StandCurves,
} from '../../suspension/shaker-scene.ts';
import { resolveCorner, type CornerSetup, type ResolvedCorner } from '../../suspension/setup.ts';
import type { CornerSpec } from '../../suspension/spec.ts';
import { frameFromQuarter, type CornerFrame } from '../../scene/suspension/corner-model.ts';
import { FrfChart } from './frf-chart.ts';
import { invariantCaption, percent } from './ride-text.ts';
import { sameSetup } from './road-scene.ts';

/** Velocity amplitude of the post in the 3D, m/s: 2.5 times the measuring speed, so the body's swing shows. */
export const SHOW_VELOCITY_MS = 0.05;
/** Physics step of the 3D's quarter car, s, and the most simulated time one frame may advance. */
const SHOW_STEP_S = 0.0005;
const MAX_FRAME_S = 0.1;
/** Simulated seconds the sweep takes from one end of the band to the other. */
const SWEEP_S = 40;
/** Time constant the shown frequency follows the slider with, s: no jump of the post when the slider jumps. */
const GLIDE_S = 0.4;
/** Real milliseconds a frame may spend measuring points, and steps between looks at the clock. */
const BUDGET_MS = 4;
const CHUNK = 2000;
/** The frequency slider's resolution over the logarithmic band. */
const SLIDER_STEPS = 1000;
/** Real milliseconds between two writes of the frequency's number while the sweep runs. */
const HZ_TEXT_EVERY_MS = 100;

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const LOG_BAND = [Math.log(SHAKER_BAND_HZ[0]), Math.log(SHAKER_BAND_HZ[1])] as const;
const hzOfSlider = (v: number): number => Math.exp(LOG_BAND[0] + (v / SLIDER_STEPS) * (LOG_BAND[1] - LOG_BAND[0]));
const sliderOfHz = (hz: number): number => Math.round(((Math.log(hz) - LOG_BAND[0]) / (LOG_BAND[1] - LOG_BAND[0])) * SLIDER_STEPS);

const row = (id: string, label: string): string => `<dt>${label}</dt><dd id="${id}"></dd>`;

export const shakerPanelHtml = (): string => `<section class="susp-bump-controls susp-only-shaker">
      <h3>${t('Стенд')}</h3>
      <p class="susp-caption">${t('Циліндр під колесом трусить шину синусом, від 0,5 до 25 Гц. Криві — розрахунок, точки — заміри симуляції: на кожній частоті вона чекає, доки коливання встановляться, і міряє за цілу кількість періодів.')}</p>
      <label class="susp-ctl">
        <span class="susp-ctl-head"><span>${t('Частота циліндра')}</span><output id="susp-shaker-hz-value" for="susp-shaker-hz"></output></span>
        <input type="range" id="susp-shaker-hz" min="0" max="${SLIDER_STEPS}" step="1" />
      </label>
      <button type="button" class="btn" id="susp-shaker-sweep" aria-pressed="true"></button>
      <label class="check"><input type="checkbox" id="susp-shaker-tyre" checked /> ${t('Демпфування шини')} <span class="susp-note" id="susp-shaker-tyre-value"></span></label>
      <dl class="susp-readout" id="susp-shaker-numbers">
        ${row('susp-shaker-body', t('Частота кузова'))}
        ${row('susp-shaker-hop', t('Підскок колеса'))}
        ${row('susp-shaker-inv', t('Незмінна точка √(k_t/m_u)'))}
        ${row('susp-shaker-gap', t('Точки від кривої'))}
      </dl>
      <p class="susp-caption" id="susp-shaker-caption"></p>
      <p class="susp-note">${t('На стенді амортизатор однаковий на стиск і відбій, тому його точно описує одна крива. Справжній м’якший на стиск, ніж на відбій, а такий нелінійний амортизатор відходить від кривої до 3 %. Точки міряно на швидкості циліндра 0,02 м/с, а в 3D циліндр рухається в 2,5 раза сильніше, щоб гойдання було видно.')}</p>
    </section>`;

export const shakerDashHtml = (): string => `<footer class="susp-dash susp-shaker-dash" id="susp-shaker-dash" hidden>
      <section class="susp-dash-chart">
        <canvas id="susp-shaker-body-chart" aria-label="${t('Графік: прискорення кузова залежно від частоти циліндра')}" role="img"></canvas>
      </section>
      <section class="susp-dash-chart">
        <canvas id="susp-shaker-tyre-chart" aria-label="${t('Графік: сила в плямі контакту залежно від частоти циліндра')}" role="img"></canvas>
      </section>
    </footer>`;

export class ShakerScene {
  private readonly root: HTMLElement;
  private readonly corner: CornerSpec;
  private readonly bodyChart: FrfChart;
  private readonly tyreChart: FrfChart;
  private readonly onChange: () => void;
  private readonly post = new GlidingPost(SHOW_VELOCITY_MS, 1);
  unsprungKg: number;
  tyreDamping = true;
  private setup: CornerSetup | null = null;
  private curves: StandCurves | null = null;
  private sine: SteppedSine | null = null;
  private sim: QuarterSim | null = null;
  private dirty = true;
  private sweeping = true;
  private sweepDir = 1;
  /** The frequency the slider asks for and the one the post shakes at, gliding after it, Hz. */
  private targetHz = SHAKER_BAND_HZ[0];
  private hz = SHAKER_BAND_HZ[0];
  private shownPoints = -1;
  /** The slider's number as written last (its rounded value and digits) and when, ms. */
  private hzKey = Number.NaN;
  private hzWrittenAt = -Infinity;
  private readonly slider: HTMLInputElement;
  /** The slider position the sweep set last. */
  private sliderAt = -1;

  constructor(root: HTMLElement, corner: CornerSpec, unsprungKg: number, onChange: () => void) {
    this.root = root;
    this.corner = corner;
    this.unsprungKg = unsprungKg;
    this.onChange = onChange;
    this.bodyChart = new FrfChart(this.$<HTMLCanvasElement>('susp-shaker-body-chart'), 'bodyAcc');
    this.tyreChart = new FrfChart(this.$<HTMLCanvasElement>('susp-shaker-tyre-chart'), 'tyreForce');
    this.slider = this.$<HTMLInputElement>('susp-shaker-hz');
    this.slider.addEventListener('input', (e) => {
      this.setSweeping(false);
      this.targetHz = hzOfSlider(Number((e.target as HTMLInputElement).value));
      this.writeHz();
    });
    this.$('susp-shaker-sweep').addEventListener('click', () => this.setSweeping(!this.sweeping));
    this.$<HTMLInputElement>('susp-shaker-tyre').addEventListener('change', (e) => this.setTyreDamping((e.target as HTMLInputElement).checked));
    this.setSweeping(true);
    this.writeHz();
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  /** The tyre's damping on or off (step 3), as the switch does. */
  setTyreDamping(on: boolean): void {
    this.tyreDamping = on;
    this.$<HTMLInputElement>('susp-shaker-tyre').checked = on;
    this.dirty = true;
    this.onChange();
  }

  /** Holds the post at a frequency (Hz) and stops the sweep, as the slider does. */
  holdHz(hz: number): void {
    this.setSweeping(false);
    this.targetHz = Math.min(SHAKER_BAND_HZ[1], Math.max(SHAKER_BAND_HZ[0], hz));
    this.writeHz();
  }

  setUnsprung(kg: number): void {
    if (kg === this.unsprungKg) return;
    this.unsprungKg = kg;
    this.dirty = true;
  }

  /** The curves, the points so far and the post, for checks in the browser. */
  get state(): { curves: StandCurves | null; points: SteppedSine['points']; done: boolean; hz: number; tyreDamping: boolean } {
    return { curves: this.curves, points: this.sine?.points ?? [], done: this.sine?.done ?? false, hz: this.hz, tyreDamping: this.tyreDamping };
  }

  /** Resolves the corner, draws its curves and starts measuring; null when the linkage cannot. */
  apply(setup: CornerSetup): ResolvedCorner | null {
    if (!this.dirty && sameSetup(setup, this.setup) && this.curves) return this.curves.corner;
    let rc: ResolvedCorner;
    try {
      rc = resolveCorner({ ...this.corner, unsprungKg: this.unsprungKg }, setup);
    } catch {
      return null;
    }
    this.setup = setup;
    this.dirty = false;
    const curves = standCurves(rc, this.tyreDamping);
    this.curves = curves;
    this.sine = new SteppedSine(curves.corner, { freqsHz: SHAKER_FREQS, velocityMs: SHAKER_VELOCITY_MS });
    this.shownPoints = -1;
    // The 3D's corner goes on where the post is: the post's phase runs on, the corner starts from rest on it.
    const x = this.sim?.x ?? 0;
    this.sim = new QuarterSim(curves.corner, this.post, 1);
    this.sim.reset(x);
    this.bodyChart.setCurves(curves);
    this.tyreChart.setCurves(curves);
    this.writeNumbers();
    return curves.corner;
  }

  /** Measures points for at most a few milliseconds. */
  compute(): void {
    const sine = this.sine;
    if (!sine || !this.curves) return;
    if (!sine.done) {
      const started = performance.now();
      while (!sine.advance(CHUNK) && performance.now() - started < BUDGET_MS);
    }
    if (sine.points.length !== this.shownPoints) {
      this.shownPoints = sine.points.length;
      this.bodyChart.setPoints(sine.points);
      this.tyreChart.setPoints(sine.points);
      this.writeGap();
    }
  }

  /** Shakes the 3D's corner for `dt` simulated seconds (null: hold still for a snapshot). False before a corner. */
  frame(dt: number | null, f: CornerFrame): boolean {
    const sim = this.sim;
    if (!sim) return false;
    if (dt !== null) {
      let left = Math.min(MAX_FRAME_S, dt);
      if (this.sweeping) {
        const rate = (LOG_BAND[1] - LOG_BAND[0]) / SWEEP_S;
        let l = Math.log(this.targetHz) + this.sweepDir * rate * left;
        if (l >= LOG_BAND[1]) [l, this.sweepDir] = [LOG_BAND[1], -1];
        if (l <= LOG_BAND[0]) [l, this.sweepDir] = [LOG_BAND[0], 1];
        this.targetHz = Math.exp(l);
        const slider = this.slider;
        const at = sliderOfHz(this.targetHz);
        if (at !== this.sliderAt && document.activeElement !== slider) {
          this.sliderAt = at;
          slider.value = String(at);
        }
      }
      while (left > 1e-9) {
        const h = Math.min(SHOW_STEP_S, left);
        // The shown frequency follows the target in log space, a little each step.
        this.hz = Math.exp(Math.log(this.hz) + (Math.log(this.targetHz) - Math.log(this.hz)) * Math.min(1, h / GLIDE_S));
        this.post.setHz(this.hz, sim.x);
        sim.step(h);
        left -= h;
      }
      this.writeHz();
    }
    frameFromQuarter(sim.out, f);
    // On the post the wheel does not roll: the post's height lifts the whole road strip under it.
    f.roadX = 0;
    f.roadLift = sim.out.roadZ;
    f.rack = 0;
    f.spin = 0;
    return true;
  }

  /** Simulated seconds on the post, for the clock. */
  get clockS(): number {
    return this.sim?.t ?? 0;
  }

  resize(): void {
    this.bodyChart.resize();
    this.tyreChart.resize();
  }

  private setSweeping(on: boolean): void {
    this.sweeping = on;
    const button = this.$('susp-shaker-sweep');
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? t('Тримати частоту') : t('Прохід частот');
  }

  /**
   * The slider's number and the charts' line. A frame of the sweep moves the frequency a little; formatting the number
   * in the page's locale every frame is too slow (CLAUDE.md), so it is written only when its digits change, and while
   * sweeping no more often than HZ_TEXT_EVERY_MS.
   */
  private writeHz(): void {
    const digits = this.targetHz < 10 ? 2 : 1;
    const key = Math.round(this.targetHz * 10 ** digits) * 10 + digits;
    const now = performance.now();
    if (key !== this.hzKey && (!this.sweeping || now - this.hzWrittenAt >= HZ_TEXT_EVERY_MS)) {
      this.hzKey = key;
      this.hzWrittenAt = now;
      this.$('susp-shaker-hz-value').textContent = t('{value} Гц', { value: fmt(this.targetHz, digits) });
    }
    this.bodyChart.setHz(this.hz);
    this.tyreChart.setHz(this.hz);
  }

  private writeNumbers(): void {
    const c = this.curves!;
    this.$('susp-shaker-body').textContent = t('{value} Гц, ζ {zeta}', { value: fmt(c.body.hz, 2), zeta: fmt(c.body.zeta, 2) });
    this.$('susp-shaker-hop').textContent = t('{value} Гц, ζ {zeta}', { value: fmt(c.hop.hz, 1), zeta: fmt(c.hop.zeta, 2) });
    this.$('susp-shaker-inv').textContent = t('{value} Гц', { value: fmt(c.invariant.hz, 1) });
    this.$('susp-shaker-tyre-value').textContent = this.tyreDamping
      ? t('({value} Н·с/м)', { value: fmt(c.corner.tyre.ct, 0) })
      : '';
    this.$('susp-shaker-caption').textContent = invariantCaption(c.invariant, this.tyreDamping);
    this.writeGap();
  }

  private writeGap(): void {
    const sine = this.sine;
    if (!sine || !this.curves) return;
    const n = sine.points.length;
    const total = SHAKER_FREQS.length;
    const { gap } = pointsGap(this.curves.lin, sine.points);
    this.$('susp-shaker-gap').textContent = n === 0
      ? t('міряю…')
      : n < total
        ? t('{n} з {total}, до {gap}', { n, total, gap: percent(gap) })
        : t('усі {total}, до {gap}', { total, gap: percent(gap) });
  }
}
