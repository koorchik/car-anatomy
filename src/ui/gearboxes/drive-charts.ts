// The two charts of the car mode's drive panel (stage K3b): traction, the force at the driven tyres in each gear against
// road speed with the road's resistance and the point the car is at now, and the strip of the last ten seconds
// (engine speed, road speed, acceleration, jerk and the drive torque on the hubs), one row each on its own scale.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { POWER } from '../../scene/palette.ts';
import { STRIP_KEYS, type DriveStrip, type StripKey } from './drive-meter.ts';
import type { Traction } from './traction.ts';

const INK = '#ece6d6';
const DIM = '#a9b7b3';
const GRID = 'rgba(236,230,214,0.1)';
const ROAD = '#7fd3ff';
/** The gear in: warm, the power path's colour; the others dimmer. */
const GEAR_IN = POWER;
const GEAR_OUT = 'rgba(236,230,214,0.42)';

const fmt = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** A round step for an axis over `span`, about `wanted` steps. */
const niceStep = (span: number, wanted: number): number => {
  const raw = span / Math.max(wanted, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
};

/** A canvas that takes its size from the page. */
class Canvas {
  readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D | null;
  protected width = 0;
  protected height = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** Takes the canvas's size on the page: after a layout, or when it was hidden. False while it has none. */
  measure(): boolean {
    const box = this.canvas.getBoundingClientRect();
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    if (!w || !h) return false;
    if (w === this.width && h === this.height) return true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
}

export class TractionChart extends Canvas {
  private traction: Traction | null = null;
  private axes = { kmh: 1, force: 1, xLabels: [] as Array<[number, string]>, yLabels: [] as Array<[number, string]> };

  setTraction(traction: Traction): void {
    this.traction = traction;
    const kmh = Math.max(20, traction.maxKmh * 1.04);
    const force = Math.max(1000, traction.maxForce * 1.08);
    const xs = niceStep(kmh, 5);
    const ys = niceStep(force / 1000, 4);
    this.axes = {
      kmh,
      force,
      xLabels: Array.from({ length: Math.floor(kmh / xs) + 1 }, (_, i) => [i * xs, fmt(i * xs)] as [number, string]),
      yLabels: Array.from({ length: Math.floor(force / 1000 / ys) + 1 }, (_, i) => [i * ys * 1000, fmt(i * ys, ys < 1 ? 1 : 0)] as [number, string]),
    };
  }

  /** Draws the curves with the car's point: road speed, km/h, force now, N, and the gear in. */
  draw(kmh: number, force: number, gear: string): void {
    const ctx = this.ctx;
    const tr = this.traction;
    if (!ctx || !tr || !this.measure()) return;
    const { width: w, height: h } = this;
    const left = 30;
    const right = 8;
    const top = 8;
    const bottom = 18;
    const X = (v: number) => left + (v / this.axes.kmh) * (w - left - right);
    const Y = (f: number) => h - bottom - (Math.max(0, f) / this.axes.force) * (h - top - bottom);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px "Fira Sans", sans-serif';
    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID;
    ctx.fillStyle = DIM;
    ctx.textAlign = 'center';
    for (const [v, label] of this.axes.xLabels) {
      ctx.beginPath();
      ctx.moveTo(X(v), top);
      ctx.lineTo(X(v), h - bottom);
      ctx.stroke();
      ctx.fillText(label, X(v), h - 5);
    }
    ctx.textAlign = 'right';
    for (const [f, label] of this.axes.yLabels) {
      ctx.beginPath();
      ctx.moveTo(left, Y(f));
      ctx.lineTo(w - right, Y(f));
      ctx.stroke();
      ctx.fillText(label, left - 4, Y(f) + 3);
    }
    // The road's resistance, then each gear, the one in on top.
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = ROAD;
    this.line(tr.road.kmh, tr.road.force, X, Y);
    ctx.setLineDash([]);
    const order = [...tr.gears].sort((a, b) => Number(a.gear === gear) - Number(b.gear === gear));
    ctx.textAlign = 'left';
    for (const curve of order) {
      const on = curve.gear === gear;
      ctx.strokeStyle = on ? GEAR_IN : GEAR_OUT;
      ctx.lineWidth = on ? 2 : 1.2;
      this.line(curve.kmh, curve.force, X, Y);
      const i = Math.max(0, Math.floor(curve.kmh.length * 0.12));
      if (curve.kmh.length) {
        ctx.fillStyle = on ? GEAR_IN : DIM;
        ctx.fillText(curve.gear, X(curve.kmh[i]!) + 3, Y(curve.force[i]!) - 4);
      }
    }
    // The car now.
    ctx.fillStyle = INK;
    ctx.strokeStyle = '#0d2a33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(Math.min(kmh, this.axes.kmh)), Y(Math.min(force, this.axes.force)), 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }

  private line(xs: number[], ys: number[], X: (v: number) => number, Y: (f: number) => number): void {
    const ctx = this.ctx!;
    ctx.beginPath();
    xs.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(ys[i]!)) : ctx.moveTo(X(x), Y(ys[i]!))));
    ctx.stroke();
  }
}

const STRIP_ROWS: Record<StripKey, { label: () => string; color: string; digits: number; symmetric: boolean }> = {
  rpm: { label: () => t('об/хв'), color: INK, digits: 0, symmetric: false },
  kmh: { label: () => t('км/год'), color: ROAD, digits: 0, symmetric: false },
  accel: { label: () => t('м/с²'), color: '#9fd98b', digits: 1, symmetric: true },
  jerk: { label: () => t('м/с³'), color: '#f0b35c', digits: 0, symmetric: true },
  driveNm: { label: () => t('Н·м на колесах'), color: POWER, digits: 0, symmetric: true },
};

export class StripChart extends Canvas {
  /** Draws the strip as it is now. */
  draw(strip: DriveStrip): void {
    const ctx = this.ctx;
    if (!ctx || !this.measure()) return;
    const { width: w, height: h } = this;
    const rows = STRIP_KEYS.length;
    const rowH = h / rows;
    const left = 4;
    const right = 4;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px "Fira Sans", sans-serif';
    const n = strip.count;
    const X = (i: number) => left + ((i + strip.size - n) / (strip.size - 1)) * (w - left - right);
    STRIP_KEYS.forEach((key, r) => {
      const row = STRIP_ROWS[key];
      const y0 = r * rowH;
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < n; i++) {
        const v = strip.at(key, i);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      if (!Number.isFinite(lo)) lo = hi = 0;
      if (row.symmetric) {
        const m = Math.max(Math.abs(lo), Math.abs(hi), 1e-3);
        lo = -m;
        hi = m;
      } else {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, lo + 1);
      }
      const Y = (v: number) => y0 + rowH - 3 - ((v - lo) / (hi - lo)) * (rowH - 8);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y0 + rowH - 0.5);
      ctx.lineTo(w - right, y0 + rowH - 0.5);
      if (row.symmetric) {
        ctx.moveTo(left, Y(0));
        ctx.lineTo(w - right, Y(0));
      }
      ctx.stroke();
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = X(i);
        const y = Y(strip.at(key, i));
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      const last = n ? strip.at(key, n - 1) : 0;
      ctx.fillStyle = row.color;
      ctx.textAlign = 'left';
      ctx.fillText(`${fmt(last, row.digits)} ${row.label()}`, left + 2, y0 + 11);
    });
  }
}
