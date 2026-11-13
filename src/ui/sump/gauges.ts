// The oil-on-track page's instruments, drawn on canvases: the oil pressure gauge, the g-g meter, the map of the lap
// and a strip chart of the last seconds. Each sizes itself to its box and allocates nothing per frame.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { LubeRun } from '../../lubrication/run.ts';
import type { LapTrace } from '../../vehicle/lap.ts';
import { G, TYRES, type TyreId } from '../../vehicle/vehicle.ts';

const BONE = '#ece6d6';
const DIM = 'rgba(236, 230, 214, 0.55)';
const RULE = 'rgba(236, 230, 214, 0.16)';
const RED = '#ff5a3c';
const OIL = '#e8a93a';
const BLUE = '#62c6ec';

/** One formatter per number of digits, made once: toLocaleString with options builds a new one on every call. */
const FORMATS = [0, 1, 2].map((d) => new Intl.NumberFormat(numberLocale, { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmt = (v: number, digits = 1): string => FORMATS[digits]!.format(v);

abstract class CanvasWidget {
  readonly element = document.createElement('canvas');
  protected readonly ctx = this.element.getContext('2d')!;
  protected w = 1;
  protected h = 1;

  constructor(label: string) {
    this.element.setAttribute('role', 'img');
    this.element.setAttribute('aria-label', label);
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.element.width = Math.round(this.w * dpr);
    this.element.height = Math.round(this.h * dpr);
    this.element.style.width = `${this.w}px`;
    this.element.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/** 0-7 bar, a red sector below what the bearings need, a tick at the relief valve and a dashed builders' rule. */
export class PressureGauge extends CanvasWidget {
  private readonly top = 7;

  constructor() {
    super(t('Манометр тиску оливи'));
  }

  draw(pressure: number, need: number, relief: number, rule: number): void {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    // The dial's arc, its readout and unit fit in the box: about 1.75 radii tall.
    const r = Math.max(10, Math.min(w / 2 - 8, (h - 8) / 1.78));
    const cx = w / 2;
    const cy = r + 6;
    const from = Math.PI * 0.8;
    const span = Math.PI * 1.4;
    const at = (bar: number): number => from + (Math.min(this.top, Math.max(0, bar)) / this.top) * span;
    c.lineCap = 'butt';
    c.lineWidth = Math.max(5, r * 0.14);
    c.strokeStyle = RULE;
    c.beginPath();
    c.arc(cx, cy, r, from, from + span);
    c.stroke();
    c.strokeStyle = 'rgba(255, 90, 60, 0.75)';
    c.beginPath();
    c.arc(cx, cy, r, from, at(need));
    c.stroke();
    c.lineWidth = 1.5;
    c.strokeStyle = DIM;
    c.font = `${Math.max(9, r * 0.17)}px Fira Sans, sans-serif`;
    c.fillStyle = DIM;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let bar = 0; bar <= this.top; bar++) {
      const a = at(bar);
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7));
      c.lineTo(cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3));
      c.stroke();
      if (bar % 2 === 1 || bar === 0) c.fillText(String(bar), cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16));
    }
    // Relief valve and the builders' rule of thumb.
    c.strokeStyle = BLUE;
    c.lineWidth = 2;
    const ra = at(relief);
    c.beginPath();
    c.moveTo(cx + Math.cos(ra) * (r - 9), cy + Math.sin(ra) * (r - 9));
    c.lineTo(cx + Math.cos(ra) * (r + 6), cy + Math.sin(ra) * (r + 6));
    c.stroke();
    c.setLineDash([3, 3]);
    c.strokeStyle = BONE;
    const rr = at(rule);
    c.beginPath();
    c.moveTo(cx + Math.cos(rr) * (r - 10), cy + Math.sin(rr) * (r - 10));
    c.lineTo(cx + Math.cos(rr) * (r + 7), cy + Math.sin(rr) * (r + 7));
    c.stroke();
    c.setLineDash([]);
    const a = at(pressure);
    const low = pressure < need;
    c.strokeStyle = low ? RED : BONE;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
    c.stroke();
    c.fillStyle = low ? RED : BONE;
    c.font = `600 ${Math.max(12, r * 0.3)}px Fira Sans, sans-serif`;
    c.fillText(fmt(pressure), cx, cy + r * 0.45);
    c.font = `${Math.max(9, r * 0.16)}px Fira Sans, sans-serif`;
    c.fillStyle = DIM;
    c.fillText(t('бар'), cx, cy + r * 0.72);
  }
}

/** Accelerations as the oil feels them: the tyres' friction circle, the other tyres dashed, a three-second trail. */
export class GgMeter extends CanvasWidget {
  private readonly trailX = new Float32Array(90);
  private readonly trailY = new Float32Array(90);
  private trailHead = 0;
  private trailCount = 0;

  constructor() {
    super(t('Діаграма перевантажень: гальмування й розгін угору-вниз, повороти вліво-вправо'));
  }

  clear(): void {
    this.trailCount = 0;
  }

  /** ax forward and ay left, m/s². */
  draw(ax: number, ay: number, tyre: TyreId, push: boolean): void {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    const r = Math.min(w, h) / 2 - 6;
    const cx = w / 2;
    const cy = h / 2;
    const scale = r / 1.8;
    c.lineWidth = 1;
    c.strokeStyle = RULE;
    c.beginPath();
    c.moveTo(cx - r, cy);
    c.lineTo(cx + r, cy);
    c.moveTo(cx, cy - r);
    c.lineTo(cx, cy + r);
    c.stroke();
    for (const id of ['street', 'semi', 'slick'] as const) {
      c.setLineDash(id === tyre ? [] : [3, 4]);
      c.strokeStyle = id === tyre ? BONE : DIM;
      c.lineWidth = id === tyre ? 1.5 : 1;
      c.beginPath();
      c.arc(cx, cy, TYRES[id].mu * scale, 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash([]);
    if (push) {
      this.trailX[this.trailHead] = ay / G;
      this.trailY[this.trailHead] = ax / G;
      this.trailHead = (this.trailHead + 1) % this.trailX.length;
      this.trailCount = Math.min(this.trailX.length, this.trailCount + 1);
    }
    for (let k = 0; k < this.trailCount; k++) {
      const i = (this.trailHead - 1 - k + this.trailX.length) % this.trailX.length;
      c.fillStyle = `rgba(232, 169, 58, ${(1 - k / this.trailX.length) * 0.7})`;
      // Left turn to the left of the dial, braking at the bottom.
      c.fillRect(cx - this.trailX[i]! * scale - 1, cy - this.trailY[i]! * scale - 1, 2, 2);
    }
    c.fillStyle = OIL;
    c.beginPath();
    c.arc(cx - (ay / G) * scale, cy - (ax / G) * scale, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = DIM;
    c.font = '10px Fira Sans, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'top';
    c.fillText(`${fmt(Math.hypot(ax, ay) / G, 2)} g`, w - 3, 2);
  }
}

/** The lap from above: coloured by speed, the car as a dot, the dips in red. Click to jump there. */
export class TrackMap extends CanvasWidget {
  private trace: LapTrace | null = null;
  private dips: Uint8Array | null = null;
  private readonly transform = { s: 1, ox: 0, oy: 0 };

  constructor() {
    super(t('Мапа кола з автомобілем'));
  }

  setLap(trace: LapTrace, run: LubeRun | null): void {
    this.trace = trace;
    const n = trace.track.n;
    this.dips = new Uint8Array(n);
    if (run) {
      for (let i = 0; i < n; i++) {
        const k = Math.min(run.count - 1, Math.floor(trace.t[i]! / run.dt));
        this.dips[i] = run.pressure[k]! < run.need[k]! ? 1 : 0;
      }
    }
  }

  /** Lap time of the track point nearest a click, or null. */
  timeAt(x: number, y: number): number | null {
    const tr = this.trace;
    if (!tr) return null;
    const { s, ox, oy } = this.transform;
    let best = Infinity;
    let at = 0;
    for (let i = 0; i < tr.track.n; i += 2) {
      const d = Math.hypot(ox + tr.track.x[i]! * s - x, oy - tr.track.y[i]! * s - y);
      if (d < best) [best, at] = [d, i];
    }
    return best < 24 ? tr.t[at]! : null;
  }

  draw(index: number): void {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    const tr = this.trace;
    if (!tr) return;
    const track = tr.track;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < track.n; i += 8) {
      x0 = Math.min(x0, track.x[i]!);
      x1 = Math.max(x1, track.x[i]!);
      y0 = Math.min(y0, track.y[i]!);
      y1 = Math.max(y1, track.y[i]!);
    }
    const s = Math.min((w - 12) / (x1 - x0), (h - 12) / (y1 - y0));
    const ox = (w - (x1 - x0) * s) / 2 - x0 * s;
    const oy = (h + (y1 - y0) * s) / 2 + y0 * s;
    this.transform.s = s;
    this.transform.ox = ox;
    this.transform.oy = oy;
    let vMax = 0;
    for (let i = 0; i < track.n; i += 4) vMax = Math.max(vMax, tr.v[i]!);
    c.lineWidth = 3;
    c.lineCap = 'round';
    for (let i = 0; i < track.n; i += 3) {
      const j = Math.min(track.n - 1, i + 3);
      const share = tr.v[i]! / vMax;
      c.strokeStyle = this.dips?.[i] ? RED : `rgba(${Math.round(98 + 140 * share)}, ${Math.round(198 - 30 * share)}, ${Math.round(236 - 180 * share)}, 0.9)`;
      c.beginPath();
      c.moveTo(ox + track.x[i]! * s, oy - track.y[i]! * s);
      c.lineTo(ox + track.x[j]! * s, oy - track.y[j]! * s);
      c.stroke();
    }
    const i = Math.max(0, Math.min(track.n - 1, index));
    c.fillStyle = BONE;
    c.strokeStyle = '#0e2a33';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(ox + track.x[i]! * s, oy - track.y[i]! * s, 5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
}

/** The last seconds: pressure, the need dashed, the felt g-load and the share of oil at the screen as a band. */
export class StripChart extends CanvasWidget {
  private readonly seconds = 20;

  constructor() {
    super(t('Тиск оливи і перевантаження за останні 20 секунд'));
  }

  draw(run: LubeRun, trace: LapTrace, time: number): void {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    const band = 8;
    const plotH = h - band - 14;
    const pMax = 7;
    const n = run.count;
    const steps = Math.round(this.seconds / run.dt);
    const end = Math.floor(time / run.dt);
    const xOf = (k: number): number => ((k - (end - steps)) / steps) * w;
    const yOf = (bar: number): number => 4 + plotH - (Math.min(pMax, bar) / pMax) * plotH;
    c.strokeStyle = RULE;
    c.lineWidth = 1;
    for (const bar of [2, 4, 6]) {
      c.beginPath();
      c.moveTo(0, yOf(bar));
      c.lineTo(w, yOf(bar));
      c.stroke();
    }
    const every = Math.max(1, Math.round(steps / w));
    const at = (k: number): number => ((k % n) + n) % n;
    // Felt g-load, faint, scaled to 2 g over the plot.
    c.strokeStyle = 'rgba(98, 198, 236, 0.5)';
    c.beginPath();
    for (let k = end - steps; k <= end; k += every) {
      const lapTime = at(k) * run.dt;
      const idx = Math.min(trace.track.n - 1, lowerIndex(trace.t, lapTime));
      const g = Math.hypot(trace.axF[idx]!, trace.ayF[idx]!) / G;
      const y = 4 + plotH - (Math.min(2, g) / 2) * plotH;
      if (k === end - steps) c.moveTo(xOf(k), y);
      else c.lineTo(xOf(k), y);
    }
    c.stroke();
    c.setLineDash([4, 3]);
    c.strokeStyle = 'rgba(255, 90, 60, 0.85)';
    c.beginPath();
    for (let k = end - steps; k <= end; k += every) {
      const y = yOf(run.need[at(k)]!);
      if (k === end - steps) c.moveTo(xOf(k), y);
      else c.lineTo(xOf(k), y);
    }
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = OIL;
    c.lineWidth = 1.8;
    c.beginPath();
    for (let k = end - steps; k <= end; k += every) {
      const y = yOf(run.pressure[at(k)]!);
      if (k === end - steps) c.moveTo(xOf(k), y);
      else c.lineTo(xOf(k), y);
    }
    c.stroke();
    for (let k = end - steps; k <= end; k += every) {
      const share = run.pickupOil[at(k)]!;
      c.fillStyle = share > 0.98 ? 'rgba(232, 169, 58, 0.55)' : `rgba(255, 90, 60, ${0.4 + 0.6 * (1 - share)})`;
      c.fillRect(xOf(k), h - band - 2, Math.max(1, (every / steps) * w + 0.5), band);
    }
    c.fillStyle = DIM;
    c.font = '10px Fira Sans, sans-serif';
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillText(t('тиск, бар'), 4, 2);
    c.textAlign = 'right';
    c.fillText(t('олива на сітці'), w - 4, h - band - 14);
  }
}

/** Index of the last sample at or before a time. */
function lowerIndex(times: Float64Array, time: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid]! <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
