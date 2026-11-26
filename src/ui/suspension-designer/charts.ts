// The suspension designer's graphs (suspensions plan, the designer's results): a line chart over any axis, linear or
// logarithmic, with several series, the design the visitor started from as a pale dashed ghost, a vertical mark (rest,
// the invariant point) and a readout under the pointer; and a bar chart for the parts of the understeer. Canvas, sized to
// its box by a ResizeObserver; text in the visitor's locale.

import { numberLocale } from '../../i18n/locale.ts';

export interface LineSeries {
  name: string;
  color: string;
  x: readonly number[];
  y: readonly number[];
  dashed?: boolean;
}

export interface LineData {
  series: LineSeries[];
  /** The same series of the design the visitor started from, drawn pale and dashed. */
  ghost?: LineSeries[];
  /** Vertical lines at these x (rest, the invariant frequencies) with their labels, in a series' colour if given. */
  marks?: Array<{ x: number; label: string; color?: string }>;
  /** A horizontal reference line (the neutral steer) with its label. */
  level?: { y: number; label: string } | null;
  xUnit: string;
  yUnit: string;
  xDigits: number;
  yDigits: number;
  logX?: boolean;
  /** The least span of the y scale, so a nearly flat curve reads as flat. */
  minSpan?: number;
  /** Keep 0 on the y scale. */
  zero?: boolean;
}

const INK = '#ece6d6';
const DIM = '#a9b7b3';
const GRID = 'rgba(236,230,214,0.1)';
const GHOST_ALPHA = 0.38;

export const SERIES_COLORS = { front: '#ffb35c', rear: '#5fb6dc', third: '#9fd47a', fourth: '#e58bb5' } as const;

// A typographic minus, as the rest of the page writes it.
export const fmt = (v: number, digits: number): string =>
  v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');

const niceStep = (span: number, wanted: number): number => {
  const raw = span / Math.max(wanted, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
};

abstract class CanvasChart {
  readonly element: HTMLDivElement;
  protected readonly canvas: HTMLCanvasElement;
  protected readonly tip: HTMLDivElement;
  protected readonly ctx: CanvasRenderingContext2D | null;
  protected width = 0;
  protected height = 0;
  protected dpr = 1;

  constructor(label: string, className: string) {
    this.element = document.createElement('div');
    this.element.className = `sd-chart ${className}`;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    this.tip = document.createElement('div');
    this.tip.className = 'sd-chart-tip';
    this.tip.hidden = true;
    this.element.append(this.canvas, this.tip);
    this.ctx = this.canvas.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(this.element);
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.element.clientWidth;
    this.height = this.element.clientHeight;
    if (!this.width || !this.height) return;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.draw();
  }

  abstract draw(): void;

  /** Starts a frame; null when there is nothing to draw on. */
  protected begin(): CanvasRenderingContext2D | null {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) return null;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    return ctx;
  }
}

export class LineChart extends CanvasChart {
  private data: LineData | null = null;
  private hover: number | null = null;
  private readonly pad = { l: 42, r: 10, t: 8, b: 20 };
  private x0 = 0;
  private x1 = 1;
  private y0 = 0;
  private y1 = 1;
  /** The step of the y scale's ticks: y0 and y1 are its multiples. */
  private yStep = 1;
  /** The names of the series under the chart (the card puts it there). */
  readonly legend = document.createElement('div');

  constructor(label: string) {
    super(label, 'sd-line-chart');
    this.legend.className = 'sd-legend';
    this.legend.hidden = true;
    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hover = e.clientX - rect.left;
      this.draw();
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
  }

  set(data: LineData): void {
    this.data = data;
    const all = [...data.series, ...(data.ghost ?? [])];
    const xs = all.flatMap((s) => s.x.filter((_, i) => Number.isFinite(s.y[i]!)));
    const ys = all.flatMap((s) => s.y.filter(Number.isFinite));
    if (data.level && Number.isFinite(data.level.y)) ys.push(data.level.y);
    if (data.zero) ys.push(0);
    this.x0 = xs.length ? Math.min(...xs) : 0;
    this.x1 = xs.length ? Math.max(...xs) : 1;
    if (this.x1 <= this.x0) this.x1 = this.x0 + 1;
    const dataLo = ys.length ? Math.min(...ys) : 0;
    const dataHi = ys.length ? Math.max(...ys) : 1;
    const span = Math.max((dataHi - dataLo) * 1.1, data.minSpan ?? 0, 1e-9);
    const mid = (dataLo + dataHi) / 2;
    let lo = mid - span / 2;
    let hi = mid + span / 2;
    // A quantity that never changes sign (a load, a gain) keeps its scale on its own side of zero.
    if (data.zero && dataLo >= 0) lo = Math.max(lo, 0);
    if (data.zero && dataHi <= 0) hi = Math.min(hi, 0);
    const step = niceStep(hi - lo, 3);
    this.yStep = step;
    this.y0 = Math.floor(lo / step) * step;
    this.y1 = Math.ceil(hi / step) * step;
    this.writeLegend(data.series);
    this.draw();
  }

  private writeLegend(series: readonly LineSeries[]): void {
    const keys = series.length > 1 ? series : [];
    const text = keys.map((s) => `${s.name}|${s.color}|${s.dashed ? 1 : 0}`).join(',');
    if (this.legend.dataset.keys === text) return;
    this.legend.dataset.keys = text;
    this.legend.replaceChildren(
      ...keys.map((s) => {
        const item = document.createElement('span');
        const swatch = document.createElement('i');
        swatch.style.borderTop = `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}`;
        item.append(swatch, s.name);
        return item;
      }),
    );
    this.legend.hidden = !keys.length;
  }

  private px(x: number): number {
    const w = this.width - this.pad.l - this.pad.r;
    const log = this.data?.logX;
    const share = log ? Math.log(x / this.x0) / Math.log(this.x1 / this.x0) : (x - this.x0) / (this.x1 - this.x0);
    return this.pad.l + share * w;
  }

  private xAt(px: number): number {
    const w = this.width - this.pad.l - this.pad.r;
    const share = Math.max(0, Math.min(1, (px - this.pad.l) / w));
    return this.data?.logX ? this.x0 * (this.x1 / this.x0) ** share : this.x0 + share * (this.x1 - this.x0);
  }

  private py(y: number): number {
    const h = this.height - this.pad.t - this.pad.b;
    return this.pad.t + h - ((y - this.y0) / (this.y1 - this.y0 || 1)) * h;
  }

  private line(ctx: CanvasRenderingContext2D, s: LineSeries): void {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < s.x.length; i++) {
      const v = s.y[i]!;
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      const x = this.px(s.x[i]!);
      const y = this.py(v);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  }

  draw(): void {
    const data = this.data;
    const ctx = this.begin();
    if (!ctx || !data) return;
    const { pad, width, height } = this;
    const plotW = width - pad.l - pad.r;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = this.yStep;
    const yDigits = Math.max(0, -Math.floor(Math.log10(yStep) + 1e-9));
    for (let v = this.y0; v <= this.y1 + yStep * 1e-6; v += yStep) {
      const y = Math.round(this.py(v)) + 0.5;
      ctx.strokeStyle = Math.abs(v) < yStep * 1e-6 ? 'rgba(236,230,214,0.32)' : GRID;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(width - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = DIM;
      ctx.fillText(fmt(v, yDigits), pad.l - 5, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = DIM;
    if (data.logX) {
      for (const v of [0.5, 1, 2, 5, 10, 20, 50]) if (v >= this.x0 && v <= this.x1) ctx.fillText(fmt(v, v < 1 ? 1 : 0), this.px(v), height - 5);
    } else {
      const xStep = niceStep(this.x1 - this.x0, Math.max(3, Math.floor(plotW / 48)));
      const xDigits = Math.max(0, -Math.floor(Math.log10(xStep) + 1e-9));
      for (let v = Math.ceil(this.x0 / xStep) * xStep; v <= this.x1 + xStep * 1e-6; v += xStep) ctx.fillText(fmt(v, xDigits), this.px(v), height - 5);
    }
    ctx.textAlign = 'right';
    ctx.fillText(data.xUnit, width - pad.r, pad.t + 9);
    ctx.textAlign = 'left';
    ctx.fillText(data.yUnit, pad.l + 4, pad.t + 9);

    if (data.level && Number.isFinite(data.level.y)) {
      const y = this.py(data.level.y);
      ctx.strokeStyle = DIM;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(width - pad.r, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(data.level.label, width - pad.r, y - 4);
    }
    let labelRow = 0;
    for (const mark of data.marks ?? []) {
      if (!(mark.x >= this.x0 && mark.x <= this.x1)) continue;
      const x = Math.round(this.px(mark.x)) + 0.5;
      ctx.strokeStyle = mark.color ?? 'rgba(236,230,214,0.35)';
      ctx.globalAlpha = mark.color ? 0.6 : 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, height - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.textAlign = x > width / 2 ? 'right' : 'left';
      ctx.fillStyle = mark.color ?? DIM;
      // Labels stack upward, so two marks close together stay readable.
      ctx.fillText(mark.label, x + (x > width / 2 ? -4 : 4), height - pad.b - 4 - 13 * labelRow++);
    }
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = GHOST_ALPHA;
    for (const s of data.ghost ?? []) {
      ctx.strokeStyle = s.color;
      ctx.setLineDash([5, 4]);
      this.line(ctx, s);
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    for (const s of data.series) {
      ctx.strokeStyle = s.color;
      ctx.setLineDash(s.dashed ? [6, 4] : []);
      this.line(ctx, s);
    }
    ctx.setLineDash([]);

    if (this.hover === null || !data.series.length) {
      this.tip.hidden = true;
      return;
    }
    const xv = this.xAt(this.hover);
    const x = this.px(xv);
    ctx.strokeStyle = 'rgba(236,230,214,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, pad.t);
    ctx.lineTo(x + 0.5, height - pad.b);
    ctx.stroke();
    const at = (s: LineSeries): number => {
      let best = 0;
      for (let i = 1; i < s.x.length; i++) if (Math.abs(s.x[i]! - xv) < Math.abs(s.x[best]! - xv)) best = i;
      return s.y[best]!;
    };
    const parts = data.series.map((s) => `${s.name} ${Number.isFinite(at(s)) ? fmt(at(s), data.yDigits) : '—'}`);
    this.tip.textContent = `${fmt(xv, data.xDigits)} ${data.xUnit}: ${parts.join(' · ')}`;
    this.tip.hidden = false;
    const tipW = this.tip.offsetWidth;
    this.tip.style.left = `${Math.max(0, Math.min(width - tipW, x - tipW / 2))}px`;
  }
}

export interface Bar {
  label: string;
  value: number;
  /** The design the visitor started from. */
  ghost?: number;
  /** The sum, drawn bolder. */
  total?: boolean;
}

/** Signed horizontal bars about a zero line: positive to the right. */
export class BarChart extends CanvasChart {
  private bars: Bar[] = [];
  private unit = '';
  private digits = 1;

  constructor(label: string) {
    super(label, 'sd-bar-chart');
  }

  set(bars: Bar[], unit: string, digits: number): void {
    this.bars = bars;
    this.unit = unit;
    this.digits = digits;
    this.draw();
  }

  draw(): void {
    const ctx = this.begin();
    if (!ctx || !this.bars.length) return;
    const { width, height } = this;
    const labelW = Math.min(150, width * 0.42);
    const valueW = 52;
    const left = labelW + 6;
    const right = width - valueW;
    const row = height / this.bars.length;
    const values = this.bars.flatMap((b) => [b.value, b.ghost ?? 0]).filter(Number.isFinite);
    const top = Math.max(0.5, ...values.map(Math.abs));
    const zero = (left + right) / 2;
    const scale = (right - left) / 2 / top;
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(236,230,214,0.32)';
    ctx.beginPath();
    ctx.moveTo(Math.round(zero) + 0.5, 2);
    ctx.lineTo(Math.round(zero) + 0.5, height - 2);
    ctx.stroke();
    this.bars.forEach((b, i) => {
      const y = row * i + row / 2;
      const h = Math.min(14, row * 0.55);
      ctx.fillStyle = b.total ? INK : DIM;
      ctx.textAlign = 'left';
      ctx.font = `${b.total ? '600 ' : ''}12px "Fira Sans", sans-serif`;
      ctx.fillText(b.label, 0, y);
      if (b.ghost !== undefined && Number.isFinite(b.ghost)) {
        ctx.strokeStyle = 'rgba(236,230,214,0.5)';
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(Math.min(zero, zero + b.ghost * scale), y - h / 2, Math.abs(b.ghost * scale), h);
        ctx.setLineDash([]);
      }
      if (Number.isFinite(b.value)) {
        ctx.fillStyle = b.value >= 0 ? SERIES_COLORS.front : SERIES_COLORS.rear;
        ctx.globalAlpha = b.total ? 1 : 0.85;
        ctx.fillRect(Math.min(zero, zero + b.value * scale), y - h / 2 + 2, Math.max(1, Math.abs(b.value * scale)), h - 4);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(`${Number.isFinite(b.value) ? (b.value > 0 ? '+' : '') + fmt(b.value, this.digits) : '—'}${this.unit}`, width, y);
    });
  }
}
