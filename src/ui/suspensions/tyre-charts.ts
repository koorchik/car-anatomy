// Small line charts of the tyre scene: axes with a few ticks, curves, the point the sliders pick, and marks. One class
// draws them all; each chart takes its canvas's size on the page (resize) and redraws only when told. Numbers on the
// axes are in the visitor's locale.

import { numberLocale } from '../../i18n/locale.ts';

export interface Series {
  xs: readonly number[];
  ys: readonly number[];
  color: string;
  width?: number;
  dash?: readonly number[];
}

export interface Mark {
  x: number;
  y: number;
  color: string;
  /** A filled dot, or a vertical line through the chart with its label at the top. */
  kind: 'dot' | 'vline';
  label?: string;
  /** Row of a vertical line's label from the top, so two labels do not overlap. */
  row?: number;
}

export interface ChartSpec {
  x: [number, number];
  y: [number, number];
  /** Tick values on each axis. */
  xTicks: readonly number[];
  yTicks: readonly number[];
  /** Axis titles, drawn at the end of each axis. */
  xTitle: string;
  yTitle: string;
  series: readonly Series[];
  marks?: readonly Mark[];
  /** Draw the axes through zero instead of along the edges (the friction ellipse). */
  centred?: boolean;
  /** Same scale on both axes (the friction ellipse). */
  square?: boolean;
}

const AXIS = 'rgba(241, 239, 230, 0.45)';
const GRID = 'rgba(241, 239, 230, 0.08)';
const TEXT = 'rgba(241, 239, 230, 0.72)';
const PAD = { left: 34, right: 8, top: 14, bottom: 20 };

const tick = (v: number): string => (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v).toLocaleString(numberLocale, { maximumFractionDigits: 1 });

export class Chart {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private spec: ChartSpec | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** Takes the canvas's size on the page and draws again: call after a layout. */
  resize(): void {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(box.width));
    this.height = Math.max(1, Math.round(box.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.spec) this.draw(this.spec);
  }

  draw(spec: ChartSpec): void {
    this.spec = spec;
    const ctx = this.ctx;
    if (!ctx || this.width < 20 || this.height < 20) return;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);
    let [x0, x1] = spec.x;
    let [y0, y1] = spec.y;
    let pw = w - PAD.left - PAD.right;
    let ph = h - PAD.top - PAD.bottom;
    if (spec.square) {
      // One scale for both: the larger span sets it, the other axis widens about its middle.
      const k = Math.max((x1 - x0) / pw, (y1 - y0) / ph);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      x0 = cx - (k * pw) / 2;
      x1 = cx + (k * pw) / 2;
      y0 = cy - (k * ph) / 2;
      y1 = cy + (k * ph) / 2;
    }
    pw = Math.max(1, pw);
    ph = Math.max(1, ph);
    const X = (x: number): number => PAD.left + ((x - x0) / (x1 - x0)) * pw;
    const Y = (y: number): number => PAD.top + (1 - (y - y0) / (y1 - y0)) * ph;
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.lineWidth = 1;
    // Grid and ticks.
    ctx.fillStyle = TEXT;
    ctx.strokeStyle = GRID;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of spec.xTicks) {
      if (v < x0 || v > x1) continue;
      ctx.beginPath();
      ctx.moveTo(X(v), PAD.top);
      ctx.lineTo(X(v), PAD.top + ph);
      ctx.stroke();
      ctx.fillText(tick(v), X(v), PAD.top + ph + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of spec.yTicks) {
      if (v < y0 || v > y1) continue;
      ctx.beginPath();
      ctx.moveTo(PAD.left, Y(v));
      ctx.lineTo(PAD.left + pw, Y(v));
      ctx.stroke();
      ctx.fillText(tick(v), PAD.left - 4, Y(v));
    }
    // Axes.
    ctx.strokeStyle = AXIS;
    ctx.beginPath();
    const ax = spec.centred ? X(0) : PAD.left;
    const ay = spec.centred ? Y(0) : Y(Math.max(y0, Math.min(y1, 0)));
    ctx.moveTo(ax, PAD.top);
    ctx.lineTo(ax, PAD.top + ph);
    ctx.moveTo(PAD.left, ay);
    ctx.lineTo(PAD.left + pw, ay);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(spec.xTitle, PAD.left + pw, ay - 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(spec.yTitle, ax + 4, 1);
    // Curves, clipped to the plot.
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top - 2, pw, ph + 4);
    ctx.clip();
    for (const s of spec.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 1.5;
      ctx.setLineDash(s.dash ? [...s.dash] : []);
      ctx.beginPath();
      s.xs.forEach((x, i) => (i === 0 ? ctx.moveTo(X(x), Y(s.ys[i]!)) : ctx.lineTo(X(x), Y(s.ys[i]!))));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
    for (const m of spec.marks ?? []) {
      ctx.fillStyle = m.color;
      ctx.strokeStyle = m.color;
      if (m.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(X(m.x), Y(m.y), 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0b222a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(m.x), PAD.top);
        ctx.lineTo(X(m.x), PAD.top + ph);
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.label) {
          ctx.textAlign = X(m.x) > PAD.left + pw * 0.7 ? 'right' : 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(m.label, X(m.x) + (ctx.textAlign === 'left' ? 4 : -4), PAD.top + (m.row ?? 0) * 14);
        }
      }
    }
  }
}
