// A frequency response of the shaker scene (suspensions plan, the shaker, steps 1–4): frequency along the bottom on a
// logarithmic scale, the amplitude on the post at its measuring speed up the side, also logarithmic. The analytic curve
// of the corner is bold, the three reference dampers pale, and the stepped-sine points sit on the bold curve as they
// are measured. The body's chart marks the invariant point; both mark the body and wheel-hop modes and the frequency
// the 3D shakes at now. That last line moves every frame of the sweep, so everything else is drawn once into a layer
// (on new curves, points or size) and a frame only copies it: number formatting in the page's locale is too slow for
// every frame.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { SinePoint } from '../../suspension/shaker.ts';
import { SHAKER_BAND_HZ, SHAKER_ZETAS, type FrfCurve, type StandCurves } from '../../suspension/shaker-scene.ts';

export type FrfQuantity = 'bodyAcc' | 'tyreForce';

const COLORS = { bodyAcc: '#ece6d6', tyreForce: '#ffd23d' } as const;
const PAD = { left: 40, right: 8, top: 18, bottom: 18 };
const TICKS_HZ = [0.5, 1, 2, 5, 10, 20];
const LOG_BAND = [Math.log(SHAKER_BAND_HZ[0]), Math.log(SHAKER_BAND_HZ[1])] as const;

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits });

export const frfTitle = (q: FrfQuantity): string => (q === 'bodyAcc' ? t('Прискорення кузова, м/с²') : t('Сила в плямі контакту, Н'));

export class FrfChart {
  readonly canvas: HTMLCanvasElement;
  readonly quantity: FrfQuantity;
  private readonly ctx: CanvasRenderingContext2D | null;
  /** The chart without the moving frequency line, and whether it must be drawn again. */
  private readonly layer: HTMLCanvasElement;
  private readonly layerCtx: CanvasRenderingContext2D | null;
  private layerStale = true;
  private curves: StandCurves | null = null;
  private points: readonly SinePoint[] = [];
  private hz = Number.NaN;
  private width = 0;
  private height = 0;
  /** The value range of this corner's curves, kept so the moving frequency line does not rescale anything. */
  private range: [number, number] = [1e-3, 1];

  constructor(canvas: HTMLCanvasElement, quantity: FrfQuantity) {
    this.canvas = canvas;
    this.quantity = quantity;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.layerCtx = this.layer.getContext('2d');
  }

  setCurves(curves: StandCurves): void {
    this.curves = curves;
    let lo = Infinity;
    let hi = 0;
    for (const c of [curves.current, ...curves.references]) {
      for (const v of c[this.quantity]) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    this.range = [lo / 1.4, hi * 1.5];
    this.layerStale = true;
    this.draw();
  }

  setPoints(points: readonly SinePoint[]): void {
    this.points = points;
    this.layerStale = true;
    this.draw();
  }

  /** The frequency the stand shakes at now, Hz. */
  setHz(hz: number): void {
    if (Math.abs(hz - this.hz) < 1e-3 * hz) return;
    this.hz = hz;
    this.draw();
  }

  resize(): void {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(box.width));
    this.height = Math.max(1, Math.round(box.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.layer.width = this.canvas.width;
    this.layer.height = this.canvas.height;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layerCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layerStale = true;
    this.draw();
  }

  private xOf(hz: number): number {
    const x0 = PAD.left;
    const x1 = this.width - PAD.right;
    return x0 + ((Math.log(hz) - LOG_BAND[0]) / (LOG_BAND[1] - LOG_BAND[0])) * (x1 - x0);
  }

  /** The layer and, over it, where the stand shakes now: all a frame of the sweep draws. */
  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || !this.curves || this.width < 60 || this.height < 50) return;
    if (this.layerStale) {
      this.drawLayer();
      this.layerStale = false;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.layer, 0, 0);
    const dpr = this.canvas.width / this.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!Number.isFinite(this.hz)) return;
    const x = Math.round(this.xOf(this.hz)) + 0.5;
    ctx.strokeStyle = 'rgba(255, 179, 107, 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, this.height - PAD.bottom);
    ctx.stroke();
  }

  private drawLayer(): void {
    const ctx = this.layerCtx;
    const c = this.curves;
    if (!ctx || !c) return;
    const w = this.width;
    const h = this.height;
    const q = this.quantity;
    ctx.clearRect(0, 0, w, h);
    const x0 = PAD.left;
    const x1 = w - PAD.right;
    const y0 = h - PAD.bottom;
    const y1 = PAD.top;
    const lv = [Math.log(this.range[0]), Math.log(this.range[1])];
    const xOf = (hz: number): number => this.xOf(hz);
    const yOf = (v: number): number => y0 - ((Math.log(Math.max(v, this.range[0] * 1e-3)) - lv[0]) / (lv[1] - lv[0])) * (y0 - y1);

    ctx.save();
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.lineWidth = 1;
    // Title, grid, ticks.
    ctx.fillStyle = 'rgba(180, 192, 187, 0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(frfTitle(q), x0, 2);
    ctx.textAlign = 'right';
    ctx.fillText(t('пунктир: ζ {zetas}', { zetas: SHAKER_ZETAS.map((z) => fmt(z, 1)).join(' · ') }), x1, 2);
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.1)';
    ctx.textAlign = 'center';
    for (const f of TICKS_HZ) {
      const x = Math.round(xOf(f)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y0);
      ctx.stroke();
      ctx.fillText(fmt(f, 1), x, y0 + 3);
    }
    // The unit in the corner left of the first tick: at the right end it ran into «20» on a phone's narrow chart.
    ctx.textAlign = 'right';
    ctx.fillText(t('Гц'), x0 - ctx.measureText(fmt(TICKS_HZ[0], 1)).width / 2 - 4, y0 + 3);
    ctx.textBaseline = 'middle';
    // Gridlines at 1, 2 and 5 of each decade inside the range, labelled where there is room.
    let lastY = Infinity;
    for (let e = Math.floor(Math.log10(this.range[0])); e <= Math.ceil(Math.log10(this.range[1])); e++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** e;
        if (v < this.range[0] || v > this.range[1]) continue;
        const y = Math.round(yOf(v)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        if (lastY - y >= 12 && y < y0 - 5 && y > y1 + 5) {
          ctx.fillText(fmt(v, 3), x0 - 4, y);
          lastY = y;
        }
      }
    }

    // The modes.
    const vline = (hz: number, label: string, color: string, dash: number[]): void => {
      const x = Math.round(xOf(hz)) + 0.5;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y0);
      ctx.stroke();
      ctx.setLineDash([]);
      if (label) {
        ctx.fillStyle = color;
        ctx.textAlign = x > (x0 + x1) / 2 ? 'right' : 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + (x > (x0 + x1) / 2 ? -3 : 3), y1);
      }
    };
    vline(c.body.hz, t('кузов {hz} Гц', { hz: fmt(c.body.hz, 1) }), 'rgba(180, 192, 187, 0.75)', [2, 3]);
    vline(c.hop.hz, t('колесо {hz} Гц', { hz: fmt(c.hop.hz, 1) }), 'rgba(127, 211, 255, 0.75)', [2, 3]);

    const line = (curve: FrfCurve, color: string, width: number, alpha: number, dash: number[]): void => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      curve.hz.forEach((f, i) => (i === 0 ? ctx.moveTo(xOf(f), yOf(curve[q][i])) : ctx.lineTo(xOf(f), yOf(curve[q][i]))));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    c.references.forEach((r, i) => line(r, COLORS[q], 1.2, 0.3 + 0.12 * i, [4, 3]));
    line(c.current, COLORS[q], 2.2, 1, []);

    // The invariant point of the body.
    if (q === 'bodyAcc') {
      const inv = c.invariant;
      const x = xOf(inv.hz);
      const y = yOf(inv.bodyAcc);
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#ff9b9b';
      ctx.font = '11px "Fira Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(t('незмінна точка'), x - 9, y - 4);
    }

    // The measured points.
    ctx.lineWidth = 1.5;
    for (const p of this.points) {
      const v = (q === 'bodyAcc' ? p.bodyAcc : p.tyreForce) * p.amplitudeM;
      ctx.fillStyle = '#0b222a';
      ctx.strokeStyle = p.leftPost ? '#ff6b6b' : '#ffb36b';
      ctx.beginPath();
      ctx.arc(xOf(p.hz), yOf(v), 3.2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
