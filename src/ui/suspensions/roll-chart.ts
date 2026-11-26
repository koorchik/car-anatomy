// The roll scene's chart (suspensions plan, the roll scene, steps 5 and 6). In a steady turn: the outer wheel's camber
// to the road against the lateral acceleration, the car's own axle bright and the two layouts it is set beside pale
// and dashed, with a line at the acceleration shown. In a sudden turn: the axle's load transfer against time, split into
// what the links carry at once and what the springs and the bar take as the body rolls, with the line at the moment
// shown. Canvas only; the scene gives it numbers.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { LOAD_SHARE } from '../../scene/palette.ts';

const G = 9.81;
const DEG = 180 / Math.PI;

export interface CamberSeries {
  label: string;
  color: string;
  faint: boolean;
  /** Lateral accelerations, m/s², and the outer wheel's camber to the road at each, rad. */
  ay: number[];
  camber: number[];
}

/** A sudden turn as the chart draws it: per sample, seconds and the axle's transfer parts, N. */
export interface TransferSeries {
  t: Float32Array | number[];
  links: Float32Array | number[];
  elastic: Float32Array | number[];
  n: number;
}

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');

function niceRange(lo: number, hi: number, span: number): [number, number] {
  const mid = (lo + hi) / 2;
  const half = Math.max(((hi - lo) / 2) * 1.12, span / 2);
  const step = 10 ** Math.floor(Math.log10(half)) / 2;
  return [Math.floor((mid - half) / step) * step, Math.ceil((mid + half) / step) * step];
}

export class RollChart {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private mode: 'camber' | 'transfer' = 'camber';
  private camber: CamberSeries[] = [];
  private transfer: TransferSeries | null = null;
  private cursor = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  setCamber(series: CamberSeries[]): void {
    this.mode = 'camber';
    this.camber = series;
    this.draw(this.cursor);
  }

  setTransfer(series: TransferSeries): void {
    this.mode = 'transfer';
    this.transfer = series;
    this.draw(0);
  }

  get showing(): 'camber' | 'transfer' {
    return this.mode;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(box.width));
    this.height = Math.max(1, Math.round(box.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(this.cursor);
  }

  /** Draws with the line at `x`: the lateral acceleration (m/s²) or the time (s). */
  draw(x: number): void {
    this.cursor = x;
    const ctx = this.ctx;
    if (!ctx || this.width < 40 || this.height < 40) return;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.mode === 'camber') this.drawCamber(ctx, x);
    else this.drawTransfer(ctx, x);
  }

  private frame(ctx: CanvasRenderingContext2D, title: string, lo: number, hi: number, xTitle: string, digits: number): { left: number; top: number; pw: number; ph: number } {
    const pad = { l: 36, r: 10, t: 16, b: 14 };
    const left = pad.l;
    const top = pad.t;
    const pw = this.width - pad.l - pad.r;
    const ph = this.height - pad.t - pad.b;
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.fillStyle = 'rgba(236, 230, 214, 0.85)';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(title, 4, 1, this.width - 8);
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, pw, ph);
    if (lo < 0 && hi > 0) {
      const y0 = top + (hi / (hi - lo)) * ph;
      ctx.beginPath();
      ctx.moveTo(left, y0);
      ctx.lineTo(left + pw, y0);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(236, 230, 214, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(hi, digits), left - 4, top - 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(lo, digits), left - 4, top + ph + 1);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(xTitle, left + pw / 2, top + ph + 1);
    return { left, top, pw, ph };
  }

  private drawCamber(ctx: CanvasRenderingContext2D, ay: number): void {
    const series = this.camber.filter((s) => s.ay.length > 1);
    if (!series.length) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) for (const c of s.camber) (lo = Math.min(lo, c * DEG)), (hi = Math.max(hi, c * DEG));
    [lo, hi] = niceRange(lo, hi, 2);
    const xMax = 1;
    const { left, top, pw, ph } = this.frame(ctx, t('Розвал зовнішнього колеса до дороги, °'), lo, hi, t('бокове прискорення, g'), 1);
    const X = (a: number): number => left + (Math.min(a / G, xMax) / xMax) * pw;
    const Y = (v: number): number => top + ((hi - v * DEG) / (hi - lo)) * ph;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, pw, ph);
    ctx.clip();
    for (const s of [...series].sort((a, b) => Number(b.faint) - Number(a.faint))) {
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.faint ? 0.6 : 1;
      ctx.lineWidth = s.faint ? 1.3 : 2.2;
      ctx.setLineDash(s.faint ? [4, 3] : []);
      ctx.beginPath();
      s.ay.forEach((a, i) => (i ? ctx.lineTo(X(a), Y(s.camber[i]!)) : ctx.moveTo(X(a), Y(s.camber[i]!))));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(ay), top);
    ctx.lineTo(X(ay), top + ph);
    ctx.stroke();
    ctx.restore();
  }

  private drawTransfer(ctx: CanvasRenderingContext2D, time: number): void {
    const s = this.transfer;
    if (!s || s.n < 2) return;
    const tEnd = s.t[s.n - 1]!;
    let hi = 0;
    let lo = 0;
    for (let i = 0; i < s.n; i++) {
      const total = s.links[i]! + s.elastic[i]!;
      hi = Math.max(hi, total / 1000, s.links[i]! / 1000, s.elastic[i]! / 1000);
      lo = Math.min(lo, s.links[i]! / 1000, s.elastic[i]! / 1000);
    }
    [lo, hi] = niceRange(lo, hi, 1);
    const { left, top, pw, ph } = this.frame(ctx, t('Перенесення на цій осі, кН'), lo, hi, t('час, с'), 1);
    const X = (v: number): number => left + (v / tEnd) * pw;
    const Y = (v: number): number => top + ((hi - v / 1000) / (hi - lo)) * ph;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, pw, ph);
    ctx.clip();
    const line = (color: string, value: (i: number) => number, width: number, dash: number[] = []): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) (i ? ctx.lineTo(X(s.t[i]!), Y(value(i))) : ctx.moveTo(X(s.t[i]!), Y(value(i))));
      ctx.stroke();
    };
    line('rgba(236, 230, 214, 0.85)', (i) => s.links[i]! + s.elastic[i]!, 1.4, [4, 3]);
    line(LOAD_SHARE.geometric, (i) => s.links[i]!, 2.2);
    line(LOAD_SHARE.elastic, (i) => s.elastic[i]!, 2.2);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(Math.min(time, tEnd)), top);
    ctx.lineTo(X(Math.min(time, tEnd)), top + ph);
    ctx.stroke();
    ctx.restore();
  }
}
