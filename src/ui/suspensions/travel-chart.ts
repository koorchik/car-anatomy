// The curves of the travel scene (suspensions plan, the travel scene, step 4): camber, toe, half-track change and the
// roll centre's height against the wheel's travel, side by side on one canvas (two by two on a narrow one). The
// corner's own curves are bright, the other types the visitor lays over them pale and dashed, and the toe before the
// tie-rod pad moved it is pale too. A dot marks where the car stands at rest (lowered: 40 mm up the curve) and a line
// follows the travel the slider holds.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { CURVE_IDS, curveAt, curveOf, type CurveId, type TravelCurves } from '../../suspension/travel-curves.ts';

export interface ChartSeries {
  curves: TravelCurves;
  color: string;
  /** Pale and dashed: a curve to compare with, not the corner's. */
  faint: boolean;
  /** Only these curves of the series (the toe before the pad moved it); all when left out. */
  only?: readonly CurveId[];
}

/** Travel the chart spans, mm: every corner of the pages fits. */
const X_RANGE: readonly [number, number] = [-100, 140];
/** The least span of each plot's scale, so a nearly flat curve reads as flat. */
const MIN_SPAN: Record<CurveId, number> = { camber: 3, toe: 1.5, halfTrack: 16, rcHeight: 200 };

export const curveTitle = (id: CurveId): string =>
  ({ camber: t('Розвал, °'), toe: t('Сходження, °'), halfTrack: t('Зсув плями вбік, мм'), rcHeight: t('Центр крену, мм') })[id];

// A typographic minus, as the rest of the page writes it.
const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');

/** A round scale that holds [lo, hi] and spans at least `span`. */
function niceRange(lo: number, hi: number, span: number): [number, number] {
  const mid = (lo + hi) / 2;
  const half = Math.max((hi - lo) / 2 * 1.12, span / 2);
  const step = 10 ** Math.floor(Math.log10(half)) / 2;
  return [Math.floor((mid - half) / step) * step, Math.ceil((mid + half) / step) * step];
}

export class TravelChart {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private series: ChartSeries[] = [];
  private ranges = new Map<CurveId, [number, number]>();
  private staticTravel = 0;
  private travel = 0;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** The curves to draw, the first being the corner's own, and where the car stands at rest, m of travel. */
  set(series: ChartSeries[], staticTravel: number): void {
    this.series = series;
    this.staticTravel = staticTravel;
    for (const id of CURVE_IDS) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of series) {
        if (s.only && !s.only.includes(id)) continue;
        for (const v of curveOf(s.curves, id)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      this.ranges.set(id, niceRange(lo, hi, MIN_SPAN[id]));
    }
    this.draw(this.travel);
  }

  /** Fits the canvas to its box. */
  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(box.width));
    this.height = Math.max(1, Math.round(box.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(this.travel);
  }

  /** Draws the chart with the line at `travel`, m. */
  draw(travel: number): void {
    this.travel = travel;
    const ctx = this.ctx;
    if (!ctx || !this.width || !this.series.length) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const cols = this.width / this.height > 2.6 ? 4 : 2;
    const rows = 4 / cols;
    const cw = this.width / cols;
    const ch = this.height / rows;
    CURVE_IDS.forEach((id, i) => this.plot(ctx, id, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch));
  }

  private plot(ctx: CanvasRenderingContext2D, id: CurveId, x0: number, y0: number, w: number, h: number): void {
    const pad = { l: 34, r: 8, t: 15, b: 13 };
    const left = x0 + pad.l;
    const top = y0 + pad.t;
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    if (pw < 20 || ph < 16) return;
    const [lo, hi] = this.ranges.get(id) ?? [-1, 1];
    const X = (q: number): number => left + ((q * 1000 - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0])) * pw;
    const Y = (v: number): number => top + ((hi - v) / (hi - lo)) * ph;
    const digits = id === 'camber' || id === 'toe' ? 1 : 0;
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.fillStyle = 'rgba(236, 230, 214, 0.85)';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    // From the plot's left edge, past the scale's column, and squeezed into its own cell: two by two on a phone, the
    // longer titles would run into the next plot's.
    ctx.fillText(curveTitle(id), x0 + 4, y0 + 1, w - 8);
    // Frame, the zero lines, and the scale at both ends.
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, pw, ph);
    ctx.beginPath();
    if (lo < 0 && hi > 0) {
      ctx.moveTo(left, Y(0));
      ctx.lineTo(left + pw, Y(0));
    }
    ctx.moveTo(X(0), top);
    ctx.lineTo(X(0), top + ph);
    ctx.stroke();
    ctx.fillStyle = 'rgba(236, 230, 214, 0.6)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(hi, digits), left - 4, top - 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(lo, digits), left - 4, top + ph + 1);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(t('хід, мм'), left + pw / 2, top + ph + 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, pw, ph);
    ctx.clip();
    // The pale ones first, the corner's own on top.
    const order = [...this.series].sort((a, b) => Number(b.faint) - Number(a.faint));
    for (const s of order) {
      if (s.only && !s.only.includes(id)) continue;
      const xs = s.curves.travel;
      const ys = curveOf(s.curves, id);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.faint ? 0.55 : 1;
      ctx.lineWidth = s.faint ? 1.2 : 2;
      ctx.setLineDash(s.faint ? [4, 3] : []);
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const px = X(xs[i]!);
        const py = Y(ys[i]!);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    const own = this.series[0]!;
    // Where the car stands at rest, on the corner's curve.
    ctx.fillStyle = own.color;
    ctx.strokeStyle = '#0b222a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(this.staticTravel), Y(curveAt(own.curves, id, this.staticTravel)), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // The travel the slider holds.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(this.travel), top);
    ctx.lineTo(X(this.travel), top + ph);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(X(this.travel), Y(curveAt(own.curves, id, this.travel)), 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
