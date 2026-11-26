// The chart beside the bars of the rough-road scene (suspensions plan, the rough road, step 2): the damping ratio ζ
// along the bottom, the weighted comfort (left scale, m/s²) and the swing of the tyre load (right scale, per cent of
// the static load) from the frequency-domain model, the minimum of each, and the current damper as a line with a dot on
// both curves. A remembered setup («A») stays as two pale dashed curves and its own line.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { RoughSweep } from '../../suspension/rough-run.ts';

/** Colours of the two curves, shared with the bars and the legend. */
export const RIDE_COLORS = { comfort: '#ffb36b', grip: '#7fd3ff', travel: '#a8f0c6' } as const;

const ZETA: readonly [number, number] = [0.05, 1];
const TICKS = [0.2, 0.4, 0.6, 0.8, 1];
const PAD = { left: 34, right: 34, top: 8, bottom: 18 };

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const rideLegendHtml = (): string => `<div class="susp-strip-legend">
    <span style="--c: ${RIDE_COLORS.comfort}">${t('Комфорт, м/с²')}</span>
    <span style="--c: ${RIDE_COLORS.grip}">${t('Коливання навантаження шини, %')}</span>
  </div>`;

export class RideChart {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private sweep: RoughSweep | null = null;
  private remembered: RoughSweep | null = null;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  set(sweep: RoughSweep, remembered: RoughSweep | null): void {
    this.sweep = sweep;
    this.remembered = remembered;
    this.draw();
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
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const s = this.sweep;
    if (!ctx || !s || this.width < 40 || this.height < 40) return;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);
    const x0 = PAD.left;
    const x1 = w - PAD.right;
    const y0 = h - PAD.bottom;
    const y1 = PAD.top;
    const xOf = (zeta: number): number => x0 + ((zeta - ZETA[0]) / (ZETA[1] - ZETA[0])) * (x1 - x0);
    const a = this.remembered;
    const top = (arr: ArrayLike<number>, other?: ArrayLike<number>): number =>
      1.1 * Math.max(...Array.from(arr), ...(other ? Array.from(other) : []));
    const comfortTop = top(s.comfortAw, a?.comfortAw);
    const gripTop = top(s.dlc, a?.dlc);
    const yComfort = (v: number): number => y0 - (v / comfortTop) * (y0 - y1);
    const yGrip = (v: number): number => y0 - (v / gripTop) * (y0 - y1);

    // The frame, the ζ ticks and the two scales' tops.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.16)';
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x0, y0 + 0.5);
    ctx.lineTo(x1, y0 + 0.5);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.fillStyle = 'rgba(180, 192, 187, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const z of TICKS) {
      const x = Math.round(xOf(z)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + 3);
      ctx.stroke();
      ctx.fillText(fmt(z, 1), x, y0 + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText('ζ', x0 - 14, y0 + 4);
    ctx.textBaseline = 'top';
    ctx.fillStyle = RIDE_COLORS.comfort;
    ctx.textAlign = 'right';
    ctx.fillText(fmt(comfortTop / 1.1, 1), x0 - 3, y1 + 6);
    ctx.fillText('0', x0 - 3, y0 - 12);
    ctx.fillStyle = RIDE_COLORS.grip;
    ctx.textAlign = 'left';
    ctx.fillText(t('{value} %', { value: fmt((gripTop / 1.1) * 100, 0) }), x1 + 3, y1 + 6);
    ctx.fillText('0', x1 + 3, y0 - 12);

    const curve = (zetas: readonly number[], values: ArrayLike<number>, y: (v: number) => number, color: string, width: number, dash: number[]): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      zetas.forEach((z, i) => (i === 0 ? ctx.moveTo(xOf(z), y(values[i])) : ctx.lineTo(xOf(z), y(values[i]))));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (a) {
      ctx.globalAlpha = 0.45;
      curve(a.zetas, a.comfortAw, yComfort, RIDE_COLORS.comfort, 1.4, [4, 4]);
      curve(a.zetas, a.dlc, yGrip, RIDE_COLORS.grip, 1.4, [4, 4]);
      this.marker(xOf(a.zeta), y0, y1, 'A', 0.45);
      ctx.globalAlpha = 1;
    }
    curve(s.zetas, s.comfortAw, yComfort, RIDE_COLORS.comfort, 2, []);
    curve(s.zetas, s.dlc, yGrip, RIDE_COLORS.grip, 2, []);

    // The minima: a small tick under each curve with its ζ.
    const best = (zeta: number, value: number, y: (v: number) => number, color: string, below: boolean): void => {
      const x = xOf(zeta);
      const yy = y(value);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, yy + (below ? 4 : -4));
      ctx.lineTo(x - 4, yy + (below ? 11 : -11));
      ctx.lineTo(x + 4, yy + (below ? 11 : -11));
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = below ? 'top' : 'bottom';
      ctx.fillText(`ζ ${fmt(zeta, 2)}`, Math.min(x1 - 20, Math.max(x0 + 20, x)), yy + (below ? 12 : -12));
    };
    best(s.bestComfortZeta, minOf(s.comfortAw), yComfort, RIDE_COLORS.comfort, true);
    best(s.bestGripZeta, minOf(s.dlc), yGrip, RIDE_COLORS.grip, false);

    // The current damper.
    const x = xOf(Math.min(ZETA[1], Math.max(ZETA[0], s.zeta)));
    this.marker(x, y0, y1, '', 1);
    for (const [y, color] of [[yComfort(s.current.comfortAw), RIDE_COLORS.comfort], [yGrip(s.current.dlc), RIDE_COLORS.grip]] as const) {
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0b222a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  }

  private marker(x: number, y0: number, y1: number, label: string, alpha: number): void {
    const ctx = this.ctx!;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, y0);
    ctx.lineTo(Math.round(x) + 0.5, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.fillStyle = 'rgba(236, 230, 214, 0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x, y1);
    }
    ctx.globalAlpha = 1;
  }
}

const minOf = (a: ArrayLike<number>): number => Math.min(...Array.from(a));
