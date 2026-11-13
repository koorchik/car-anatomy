// Single-metric chart over engine speed. Two of these stacked replace a dual-axis power and torque plot.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';

export interface ChartSeries {
  /** x = rpm */
  x: number[];
  y: number[];
}

/** Extras for the dyno: a thin reference curve, points held one by one, and points to compare with. */
export interface ChartOverlay {
  reference?: ChartSeries;
  /** Held points. A hollow one did not settle in time. */
  dots?: Array<{ x: number; y: number; hollow?: boolean }>;
  /** Published figures, drawn as open rings. */
  markers?: Array<{ x: number; y: number }>;
}

const INK = '#ece6d6';
const DIM = '#a9b7b3';
const GHOST = '#5fb6dc';
const GRID = 'rgba(236,230,214,0.1)';

/** A round step for the axis, for a given span. */
const niceStep = (span: number, wanted: number): number => {
  const raw = span / Math.max(wanted, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
};

export class RpmChart {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly tip: HTMLDivElement;
  private readonly ctx: CanvasRenderingContext2D;
  private series: ChartSeries = { x: [], y: [] };
  private baseline: ChartSeries | null = null;
  private unit = '';
  private digits = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private marker = 0;
  private hoverRpm: number | null = null;
  private yMin = 0;
  private yMax = 1;
  private xMax = 1;
  private peakIndex = -1;
  private showPeak = true;
  private safe = 0;
  private failure = 0;
  private frame: { xMax: number; yMax: number } | null = null;
  private overlay: ChartOverlay | null = null;

  constructor(label: string) {
    this.element = document.createElement('div');
    this.element.className = 'rpm-chart';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    this.tip = document.createElement('div');
    this.tip.className = 'chart-tip';
    this.tip.hidden = true;
    this.element.append(this.canvas, this.tip);
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hoverRpm = this.rpmAt(e.clientX - rect.left);
      this.draw();
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverRpm = null;
      this.draw();
    });
    new ResizeObserver(() => this.resize()).observe(this.element);
  }

  private readonly pad = { l: 40, r: 10, t: 10, b: 18 };

  private rpmAt(px: number): number {
    const plot = this.width - this.pad.l - this.pad.r;
    return Math.max(0, Math.min(1, (px - this.pad.l) / plot)) * this.xMax;
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.element.clientWidth;
    this.height = this.element.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.draw();
  }

  setData(series: ChartSeries, baseline: ChartSeries | null, unit: string, digits: number, showPeak: boolean): void {
    this.series = series;
    this.baseline = baseline;
    this.unit = unit;
    this.digits = digits;
    this.showPeak = showPeak;
    const all = [...series.y, ...(baseline?.y ?? [])].filter(Number.isFinite);
    const top = Math.max(...all, 1e-3);
    const bottom = Math.min(...all, 0);
    this.yMin = bottom < -top * 0.03 ? bottom : 0;
    this.yMax = top * 1.1;
    this.xMax = Math.max(...series.x, ...(baseline?.x ?? [1]));
    if (this.frame) {
      this.xMax = this.frame.xMax;
      this.yMax = Math.max(this.frame.yMax, this.yMax);
    }
    this.peakIndex = series.y.length ? series.y.reduce((best, v, i, arr) => (v > (arr[best] ?? -Infinity) ? i : best), 0) : -1;
    this.draw();
  }

  /**
   * Fixes the axes, so a curve that grows point by point does not keep rescaling them. Null lets the data decide.
   * Takes effect with the next setData, which draws once for everything set before it.
   */
  setFrame(frame: { xMax: number; yMax: number } | null): void {
    this.frame = frame;
  }

  /** Drawn with the next setData. */
  setOverlay(overlay: ChartOverlay | null): void {
    this.overlay = overlay;
  }

  /** Shades the speeds where the engine wears and where it breaks. */
  setZones(safe: number, failure: number): void {
    this.safe = safe;
    this.failure = failure;
    this.draw();
  }

  /** Moves the speed marker. With redraw false it waits for the next setData. */
  setMarker(rpm: number, redraw = true): void {
    if (Math.abs(rpm - this.marker) < 1) return;
    this.marker = rpm;
    if (redraw) this.draw();
  }

  private yAt(value: number, plotH: number): number {
    return this.pad.t + plotH - ((value - this.yMin) / (this.yMax - this.yMin || 1)) * plotH;
  }

  private line(ctx: CanvasRenderingContext2D, s: ChartSeries, plotW: number, plotH: number): void {
    ctx.beginPath();
    let started = false;
    s.x.forEach((x, i) => {
      const v = s.y[i]!;
      if (!Number.isFinite(v)) return;
      const px = this.pad.l + (x / this.xMax) * plotW;
      const py = this.yAt(v, plotH);
      if (started) ctx.lineTo(px, py);
      else {
        ctx.moveTo(px, py);
        started = true;
      }
    });
    ctx.stroke();
  }

  private format(v: number): string {
    return v.toLocaleString(numberLocale, { maximumFractionDigits: this.digits, minimumFractionDigits: this.digits });
  }

  private valueAt(s: ChartSeries, rpm: number): number {
    let best = 0;
    s.x.forEach((x, i) => {
      if (Math.abs(x - rpm) < Math.abs(s.x[best]! - rpm)) best = i;
    });
    return s.y[best] ?? Number.NaN;
  }

  draw(): void {
    const { width, height, pad } = this;
    if (width <= 0 || height <= 0 || (!this.series.x.length && !this.frame)) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;

    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const yStep = niceStep(this.yMax - this.yMin, 3);
    for (let v = Math.ceil(this.yMin / yStep) * yStep; v <= this.yMax; v += yStep) {
      const y = Math.round(this.yAt(v, plotH)) + 0.5;
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(width - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = DIM;
      ctx.fillText(v.toLocaleString(numberLocale, { maximumFractionDigits: yStep < 1 ? 1 : 0 }), pad.l - 5, y);
    }
    const xStep = niceStep(this.xMax, Math.max(3, Math.floor(plotW / 42)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let v = xStep; v < this.xMax; v += xStep) {
      const x = pad.l + (v / this.xMax) * plotW;
      ctx.fillStyle = DIM;
      ctx.fillText(`${v / 1000}`, x, height - 4);
    }

    if (this.safe > 0 && this.safe < this.xMax) {
      const x0 = pad.l + (this.safe / this.xMax) * plotW;
      const x1 = pad.l + (Math.min(this.failure, this.xMax) / this.xMax) * plotW;
      ctx.fillStyle = 'rgba(234,106,21,0.13)';
      ctx.fillRect(x0, pad.t, Math.max(0, x1 - x0), plotH);
    }
    if (this.failure > 0 && this.failure < this.xMax) {
      const x0 = pad.l + (this.failure / this.xMax) * plotW;
      ctx.fillStyle = 'rgba(234,106,21,0.34)';
      ctx.fillRect(x0, pad.t, pad.l + plotW - x0, plotH);
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (this.baseline) {
      ctx.strokeStyle = GHOST;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      this.line(ctx, this.baseline, plotW, plotH);
      ctx.setLineDash([]);
    }
    if (this.overlay?.reference) {
      ctx.strokeStyle = DIM;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      this.line(ctx, this.overlay.reference, plotW, plotH);
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    this.line(ctx, this.series, plotW, plotH);
    for (const m of this.overlay?.markers ?? []) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pad.l + (m.x / this.xMax) * plotW, this.yAt(m.y, plotH), 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const d of this.overlay?.dots ?? []) {
      ctx.beginPath();
      ctx.arc(pad.l + (d.x / this.xMax) * plotW, this.yAt(d.y, plotH), 3.5, 0, Math.PI * 2);
      if (d.hollow) {
        ctx.strokeStyle = '#ea6a15';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ea6a15';
        ctx.fill();
      }
    }

    // The engine's speed right now, the same as the needle on the tachometer.
    if (this.marker > 1 && this.marker <= this.xMax) {
      const x = pad.l + (this.marker / this.xMax) * plotW;
      ctx.strokeStyle = '#ea6a15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
      ctx.stroke();
    }

    if (this.showPeak && this.peakIndex >= 0 && this.series.y.length) {
      const v = this.series.y[this.peakIndex]!;
      const px = pad.l + (this.series.x[this.peakIndex]! / this.xMax) * plotW;
      const py = this.yAt(v, plotH);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.hoverRpm !== null && this.series.x.length) {
      const rpm = this.hoverRpm;
      const x = pad.l + (rpm / this.xMax) * plotW;
      ctx.strokeStyle = 'rgba(236,230,214,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, pad.t);
      ctx.lineTo(x + 0.5, pad.t + plotH);
      ctx.stroke();
      const value = this.valueAt(this.series, rpm);
      const ghost = this.baseline ? this.valueAt(this.baseline, rpm) : null;
      const shown = (Math.round(rpm / 50) * 50).toLocaleString(numberLocale);
      this.tip.textContent = ghost !== null
        ? t('{rpm} об/хв: {value} {unit}, було {before}', { rpm: shown, value: this.format(value), unit: this.unit, before: this.format(ghost) })
        : t('{rpm} об/хв: {value} {unit}', { rpm: shown, value: this.format(value), unit: this.unit });
      this.tip.hidden = false;
      const tipW = this.tip.offsetWidth;
      this.tip.style.left = `${Math.max(0, Math.min(width - tipW, x - tipW / 2))}px`;
    } else {
      this.tip.hidden = true;
    }
  }
}
