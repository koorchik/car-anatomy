// Strip chart of the engine cycle: one row per chamber, in firing order.
// Each row shows the four strokes, so uneven firing is visible at a glance.

import { cyclePhase, strokeAt, type Cylinder, type Engine, type Stroke } from '../engine/kinematics.ts';
import { t } from '../i18n/t.ts';

export const STROKE_NAMES: Record<Stroke, string> = {
  intake: t('Впуск'),
  compression: t('Стиснення'),
  power: t('Робочий хід'),
  exhaust: t('Випуск'),
};

const STROKE_COLORS: Record<Stroke, string> = {
  power: '#ea6a15',
  exhaust: '#a96ca2',
  intake: '#45a4d0',
  compression: '#1e9274',
};

const ORDER: Stroke[] = ['intake', 'compression', 'power', 'exhaust'];

const label = (engine: Engine, c: Cylinder): string => {
  if (!engine.isRotary) return String(c.n);
  // Three chambers per rotor: 1a 1b 1c, 2a ...
  const face = (c.n - 1) % 3;
  return `${c.bank + 1}${'abc'[face]}`;
};

/** Fuel and spark events of each chamber, in degrees of its own cycle from firing TDC, drawn over its row. */
export interface CycleMarkers {
  inject: [number, number] | null;
  /** A diesel's pilot, or a second direct-injection shot. */
  pilot: [number, number] | null;
  sparks: number[];
}

export class FiringDiagram {
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private engine: Engine | null = null;
  private rows: Cylinder[] = [];
  private background: HTMLCanvasElement | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private hover: { x: number; y: number } | null = null;
  private readonly tooltip: HTMLElement;
  private markers: CycleMarkers | null = null;

  constructor(tooltip: HTMLElement) {
    this.tooltip = tooltip;
    this.element = document.createElement('canvas');
    this.element.className = 'firing-canvas';
    this.element.setAttribute('role', 'img');
    this.ctx = this.element.getContext('2d')!;
    this.element.addEventListener('pointermove', (e) => {
      const rect = this.element.getBoundingClientRect();
      this.hover = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.showTooltip(e.clientX, e.clientY);
    });
    this.element.addEventListener('pointerleave', () => {
      this.hover = null;
      this.tooltip.hidden = true;
    });
  }

  private get pad(): { l: number; r: number; t: number; b: number } {
    return { l: 22, r: 6, t: 16, b: 3 };
  }

  setEngine(engine: Engine): void {
    this.engine = engine;
    this.rows = [...engine.cylinders].sort((a, b) => a.fire - b.fire);
    this.background = null;
    const description = engine.isRotary
      ? t('Діаграма циклу: кожна камера ротора в порядку спалахів.')
      : t('Діаграма циклу в порядку запалювання {order}.', { order: engine.spec.firingOrder.join('-') });
    this.element.setAttribute('aria-label', description);
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.element.width = Math.round(width * this.dpr);
    this.element.height = Math.round(height * this.dpr);
    this.background = null;
  }

  private paintBackground(): void {
    const engine = this.engine;
    if (!engine || this.width <= 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = this.element.width;
    canvas.height = this.element.height;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(this.dpr, this.dpr);
    const { l, r, t, b } = this.pad;
    const plotW = this.width - l - r;
    const plotH = this.height - t - b;
    const rowH = plotH / this.rows.length;
    const gap = rowH > 7 ? 2 : 1;
    ctx.font = `${rowH < 10 ? 9 : 11}px "Fira Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    this.rows.forEach((c, i) => {
      const y = t + i * rowH;
      for (let px = 0; px < plotW; px++) {
        const theta = (px / plotW) * engine.cycle;
        const phase = cyclePhase(engine, c, theta);
        const stroke = strokeAt(phase);
        ctx.fillStyle = STROKE_COLORS[stroke];
        // Brightest right after ignition, fading through the power stroke.
        ctx.globalAlpha = stroke === 'power' ? 1 - (phase / 0.25) * 0.55 : stroke === 'intake' ? 0.72 : 0.78;
        ctx.fillRect(l + px, y, 1.2, rowH - gap);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#c9d2cc';
      ctx.textAlign = 'right';
      ctx.fillText(label(engine, c), l - 5, y + (rowH - gap) / 2 + 0.5);
    });
    // One crank revolution marks along the top.
    ctx.strokeStyle = 'rgba(236,230,214,0.32)';
    ctx.fillStyle = '#a9b7b3';
    ctx.textAlign = 'center';
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.lineWidth = 1;
    const marks = engine.cycle / 360;
    for (let i = 0; i <= marks; i++) {
      const x = l + (i * 360 * plotW) / engine.cycle;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, t - 3);
      ctx.lineTo(x + 0.5, this.height - b);
      ctx.stroke();
      const text = `${i * 360}°`;
      ctx.textAlign = i === marks ? 'right' : i === 0 ? 'left' : 'center';
      ctx.fillText(text, x, 6);
    }
    this.background = canvas;
  }

  private showTooltip(clientX: number, clientY: number): void {
    const engine = this.engine;
    if (!engine || !this.hover) return;
    const { l, r, t: top, b } = this.pad;
    const plotW = this.width - l - r;
    const plotH = this.height - top - b;
    const px = this.hover.x - l;
    const py = this.hover.y - top;
    if (px < 0 || px > plotW || py < 0 || py > plotH) {
      this.tooltip.hidden = true;
      return;
    }
    const row = this.rows[Math.min(this.rows.length - 1, Math.floor((py / plotH) * this.rows.length))]!;
    const theta = (px / plotW) * engine.cycle;
    const phase = cyclePhase(engine, row, theta);
    const name = engine.isRotary ? t('Камера {label}', { label: label(engine, row) }) : t('Циліндр {n}', { n: row.n });
    this.tooltip.textContent = t('{name}, {deg}° вала: {stroke}', { name, deg: Math.round(theta), stroke: STROKE_NAMES[strokeAt(phase)].toLowerCase() });
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${clientX}px`;
    this.tooltip.style.top = `${clientY - 12}px`;
  }

  /** Shows the fuel layer's injection windows and sparks on every row; null takes them off. */
  setMarkers(markers: CycleMarkers | null): void {
    this.markers = markers;
  }

  /** Plot x of a crank angle. */
  private xAt(engine: Engine, deg: number): number {
    const { l, r } = this.pad;
    return l + ((((deg % engine.cycle) + engine.cycle) % engine.cycle) / engine.cycle) * (this.width - l - r);
  }

  /** A bar from one angle to another, split where it runs past the end of the cycle. */
  private bar(engine: Engine, y: number, h: number, from: number, to: number): void {
    const span = (((to - from) % engine.cycle) + engine.cycle) % engine.cycle;
    if (span <= 0) return;
    const { l, r } = this.pad;
    const plotW = this.width - l - r;
    const x0 = this.xAt(engine, from);
    const x1 = x0 + (span / engine.cycle) * plotW;
    const end = l + plotW;
    this.ctx.fillRect(x0, y, Math.max(1.5, Math.min(x1, end) - x0), h);
    if (x1 > end) this.ctx.fillRect(l, y, x1 - end, h);
  }

  private drawMarkers(engine: Engine): void {
    const m = this.markers;
    if (!m) return;
    const ctx = this.ctx;
    const { t, b } = this.pad;
    const rowH = (this.height - t - b) / this.rows.length;
    const h = Math.max(2, rowH * 0.34);
    for (let i = 0; i < this.rows.length; i++) {
      const c = this.rows[i]!;
      const y = t + i * rowH;
      ctx.fillStyle = '#ff5fae';
      if (m.inject) this.bar(engine, y + rowH * 0.62 - h / 2, h, c.fire + m.inject[0], c.fire + m.inject[1]);
      ctx.fillStyle = '#ffb3d6';
      if (m.pilot) this.bar(engine, y + rowH * 0.62 - h / 2, h, c.fire + m.pilot[0], c.fire + m.pilot[1]);
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < m.sparks.length; k++) ctx.fillRect(this.xAt(engine, c.fire + m.sparks[k]!) - 1, y, 2, rowH - 2);
    }
  }

  draw(theta: number): void {
    const engine = this.engine;
    if (!engine || this.width <= 0) return;
    if (!this.background) this.paintBackground();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.element.width, this.element.height);
    if (this.background) ctx.drawImage(this.background, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawMarkers(engine);
    const { l, r, t, b } = this.pad;
    const plotW = this.width - l - r;
    const x = l + ((((theta % engine.cycle) + engine.cycle) % engine.cycle) / engine.cycle) * plotW;
    ctx.fillStyle = '#ece6d6';
    ctx.fillRect(x - 1, t - 3, 2, this.height - t - b + 3);
    ctx.beginPath();
    ctx.moveTo(x - 4, t - 5);
    ctx.lineTo(x + 4, t - 5);
    ctx.lineTo(x, t);
    ctx.closePath();
    ctx.fill();
  }
}

export const legendHtml = (): string =>
  ORDER.map((s) => `<span class="legend-item"><i style="background:${STROKE_COLORS[s]}"></i>${STROKE_NAMES[s]}</span>`).join('');
