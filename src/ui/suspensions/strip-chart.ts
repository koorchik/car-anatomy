// The strip chart under the bump scene (suspensions plan, the bump scene, step 2): the last two seconds of the run
// played so far, with the road, the wheel centre and the body in millimetres from rest on the left scale and the tyre's
// load, in shares of the static load, on the right. The scales stay put for a run, so a change of setup that makes the
// wheel jump higher shows as a taller curve, not a rescaled one.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { SUSPENSION_FORCE } from '../../scene/palette.ts';
import type { BumpRun } from '../../suspension/bump.ts';

/** Seconds the chart spans. */
export const STRIP_SECONDS = 2;

/** Colours of the curves, shared with the legend. */
export const STRIP_COLORS = { road: '#8a9aa0', wheel: '#7fd3ff', body: '#ece6d6', tyre: SUSPENSION_FORCE.tyre } as const;

/** Pixels between two points of a curve. */
const STEP_PX = 2;

export const stripLegendHtml = (): string => `<div class="susp-strip-legend">
    <span style="--c: ${STRIP_COLORS.road}">${t('Дорога')}</span>
    <span style="--c: ${STRIP_COLORS.wheel}">${t('Центр колеса')}</span>
    <span style="--c: ${STRIP_COLORS.body}">${t('Кузов')}</span>
    <span style="--c: ${STRIP_COLORS.tyre}">${t('Сила в плямі')}</span>
  </div>`;

export class StripChart {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private run: BumpRun | null = null;
  /** Left scale, mm from rest, and right scale, shares of the static load. */
  private mm: [number, number] = [-10, 10];
  private load: [number, number] = [0, 2];
  private width = 0;
  private height = 0;
  private labels: [string, string, string] = ['', '', ''];
  /** The time drawn last, so a still page is not redrawn. */
  private drawnAt = Number.NaN;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** A new run: its scales, from everything it does. */
  setRun(run: BumpRun): void {
    this.run = run;
    const { trace, corner } = run;
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < trace.n; i++) {
      const road = trace.roadZ[i]!;
      const wheel = trace.wheelZ[i]! - corner.wheelCentreZM;
      const body = trace.bodyZ[i]! - corner.bodyStaticM;
      lo = Math.min(lo, road, wheel, body);
      hi = Math.max(hi, road, wheel, body);
    }
    const pad = Math.max(0.004, (hi - lo) * 0.08);
    this.mm = [(lo - pad) * 1000, (hi + pad) * 1000];
    this.load = [0, Math.max(2, run.stats.tyreMax * 1.08)];
    // The scales' ends are written once a run: number formatting is too slow for every frame.
    this.labels = [mmLabel(this.mm[1]), mmLabel(this.mm[0]), `×${fmt(this.load[1], 1)}`];
    this.drawnAt = Number.NaN;
  }

  /** Takes the canvas's size on the page: call after a layout. */
  resize(): void {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(box.width));
    this.height = Math.max(1, Math.round(box.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawnAt = Number.NaN;
  }

  /** Draws the two seconds of the run up to `t`, s; nothing when the window has not moved by a pixel. */
  draw(t: number): void {
    const ctx = this.ctx;
    const run = this.run;
    if (!ctx || !run || this.width < 2) return;
    const w = this.width;
    const h = this.height;
    if (Math.abs(t - this.drawnAt) < STRIP_SECONDS / w / 2) return;
    this.drawnAt = t;
    ctx.clearRect(0, 0, w, h);
    const [mmLo, mmHi] = this.mm;
    const [lLo, lHi] = this.load;
    // y = a + b·value for each scale.
    const bMm = -(h - 8) / (mmHi - mmLo);
    const aMm = h - 4 - mmLo * bMm;
    const bLoad = -(h - 8) / (lHi - lLo);
    const aLoad = h - 4 - lLo * bLoad;

    // Rest and the static load as faint guides, with their scales' ends.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, Math.round(aMm) + 0.5);
    ctx.lineTo(w, Math.round(aMm) + 0.5);
    ctx.stroke();
    ctx.setLineDash(DASH);
    ctx.strokeStyle = 'rgba(255, 210, 61, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, Math.round(aLoad + bLoad) + 0.5);
    ctx.lineTo(w, Math.round(aLoad + bLoad) + 0.5);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.fillStyle = 'rgba(180, 192, 187, 0.9)';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(this.labels[0], 3, 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText(this.labels[1], 3, h - 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 210, 61, 0.8)';
    ctx.textBaseline = 'top';
    ctx.fillText(this.labels[2], w - 3, 2);

    const { corner, trace } = run;
    const from = t - STRIP_SECONDS;
    ctx.lineWidth = 1.6;
    // Each curve is one array of the trace, scaled: value = (array − offset)·scale, then y = a + b·value.
    this.curve(trace.roadZ, 0, 1000, aMm, bMm, from, STRIP_COLORS.road);
    this.curve(trace.tyreN, 0, 1 / run.stats.staticN, aLoad, bLoad, from, STRIP_COLORS.tyre);
    this.curve(trace.wheelZ, corner.wheelCentreZM, 1000, aMm, bMm, from, STRIP_COLORS.wheel);
    this.curve(trace.bodyZ, corner.bodyStaticM, 1000, aMm, bMm, from, STRIP_COLORS.body);
  }

  private curve(data: Float32Array, offset: number, scale: number, a: number, b: number, from: number, color: string): void {
    const ctx = this.ctx!;
    const trace = this.run!.trace;
    const w = this.width;
    const last = trace.n - 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let px = 0; px <= w; px += STEP_PX) {
      // The trace's own sampling, linear between samples and held at its ends.
      let u = (from + (px / w) * STRIP_SECONDS) / trace.dt;
      if (u < 0) u = 0;
      else if (u > last) u = last;
      const i = Math.min(last - 1, Math.floor(u));
      const v = data[i]! + (data[i + 1]! - data[i]!) * (u - i);
      const y = a + b * (v - offset) * scale;
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();
  }
}

const DASH = [3, 4];
const NO_DASH: number[] = [];
const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits });
const mmLabel = (mm: number): string => t('{value} мм', { value: (mm > 0 ? '+' : mm < 0 ? '−' : '') + fmt(Math.abs(mm), 0) });
