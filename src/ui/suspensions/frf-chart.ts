// A frequency response of the shaker scene (suspensions plan, the shaker, steps 1–4): frequency along the bottom on a
// logarithmic scale, the amplitude on the post at its measuring speed up the side, also logarithmic. The analytic curve
// of the corner is bold, the three reference dampers pale, and the stepped-sine points sit on the bold curve as they
// are measured. The body's chart marks the invariant point; both mark the body and wheel-hop modes and the frequency
// the 3D shakes at now.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { SinePoint } from '../../suspension/shaker.ts';
import { SHAKER_BAND_HZ, SHAKER_ZETAS, type FrfCurve, type StandCurves } from '../../suspension/shaker-scene.ts';

export type FrfQuantity = 'bodyAcc' | 'tyreForce';

const COLORS = { bodyAcc: '#ece6d6', tyreForce: '#ffd23d' } as const;
const PAD = { left: 40, right: 8, top: 18, bottom: 18 };
const TICKS_HZ = [0.5, 1, 2, 5, 10, 20];

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits });

export const frfTitle = (q: FrfQuantity): string => (q === 'bodyAcc' ? t('Прискорення кузова, м/с²') : t('Сила в плямі контакту, Н'));

export class FrfChart {
  readonly canvas: HTMLCanvasElement;
  readonly quantity: FrfQuantity;
  private readonly ctx: CanvasRenderingContext2D | null;
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
    this.draw();
  }

  setPoints(points: readonly SinePoint[]): void {
    this.points = points;
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
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const c = this.curves;
    if (!ctx || !c || this.width < 60 || this.height < 50) return;
    const w = this.width;
    const h = this.height;
    const q = this.quantity;
    ctx.clearRect(0, 0, w, h);
    const x0 = PAD.left;
    const x1 = w - PAD.right;
    const y0 = h - PAD.bottom;
    const y1 = PAD.top;
    const lf = [Math.log(SHAKER_BAND_HZ[0]), Math.log(SHAKER_BAND_HZ[1])];
    const lv = [Math.log(this.range[0]), Math.log(this.range[1])];
    const xOf = (hz: number): number => x0 + ((Math.log(hz) - lf[0]) / (lf[1] - lf[0])) * (x1 - x0);
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
    ctx.textAlign = 'right';
    ctx.fillText(t('Гц'), x1, y0 + 3);
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

    // The modes, and where the stand shakes now.
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
    if (Number.isFinite(this.hz)) vline(this.hz, '', 'rgba(255, 179, 107, 0.9)', []);

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
