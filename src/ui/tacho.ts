// Round tachometer. Scale and red zone come from the engine.

const SVG = 'http://www.w3.org/2000/svg';
const SWEEP_START = -135;
const SWEEP = 270;

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

const arc = (cx: number, cy: number, r: number, from: number, to: number): string => {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export class Tacho {
  readonly element: SVGSVGElement;
  private needle!: SVGGElement;
  private readout!: SVGTextElement;
  private lamp!: SVGCircleElement;
  private maxRpm = 8000;
  private wearArc: SVGPathElement | null = null;
  private breakArc: SVGPathElement | null = null;
  private shown = -100;
  private shownText = '';

  constructor() {
    this.element = document.createElementNS(SVG, 'svg');
    this.element.setAttribute('viewBox', '0 0 200 200');
    this.element.setAttribute('class', 'tacho');
    this.element.setAttribute('role', 'img');
    this.element.setAttribute('aria-label', 'Тахометр');
  }

  private add<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    parent.appendChild(el);
    return el;
  }

  configure(redline: number): void {
    const svg = this.element;
    svg.replaceChildren();
    // Scales above 10 000 would crowd the numerals; every engine here stays under that.
    this.maxRpm = Math.ceil((redline * 1.08) / 1000) * 1000;
    const cx = 100;
    const cy = 100;
    this.add(svg, 'circle', { cx, cy, r: 98, class: 'tacho-rim' });
    this.add(svg, 'circle', { cx, cy, r: 91, class: 'tacho-face' });
    const angleOf = (rpm: number): number => SWEEP_START + (rpm / this.maxRpm) * SWEEP;

    this.add(svg, 'path', { d: arc(cx, cy, 80, angleOf(redline), SWEEP_START + SWEEP), class: 'tacho-red' });
    this.wearArc = this.add(svg, 'path', { d: '', class: 'tacho-wear' });
    this.breakArc = this.add(svg, 'path', { d: '', class: 'tacho-break' });
    // Numbered marks stay readable however high the scale goes: every 1000, 2000 or 5000 rpm.
    const majorStep = this.maxRpm > 22000 ? 5000 : this.maxRpm > 11000 ? 2000 : 1000;
    const minorStep = majorStep / 2;
    for (let i = 0; i <= this.maxRpm / minorStep; i++) {
      const rpm = i * minorStep;
      const major = i % 2 === 0;
      const deg = angleOf(rpm);
      const [x0, y0] = polar(cx, cy, 87, deg);
      const [x1, y1] = polar(cx, cy, major ? 74 : 80, deg);
      this.add(svg, 'line', {
        x1: x0,
        y1: y0,
        x2: x1,
        y2: y1,
        class: `${major ? 'tick-major' : 'tick-minor'}${rpm >= redline ? ' tick-red' : ''}`,
      });
      if (major) {
        const [tx, ty] = polar(cx, cy, 62, deg);
        const text = this.add(svg, 'text', { x: tx, y: ty + 6, class: `tacho-num${rpm >= redline ? ' tick-red-text' : ''}`, 'text-anchor': 'middle' });
        text.textContent = String(rpm / 1000);
      }
    }
    this.readout = this.add(svg, 'text', { x: cx, y: cy + 50, class: 'tacho-rpm', 'text-anchor': 'middle' });
    const unit = this.add(svg, 'text', { x: cx, y: cy + 64, class: 'tacho-unit', 'text-anchor': 'middle' });
    unit.textContent = 'об/хв';
    const scale = this.add(svg, 'text', { x: cx, y: cy - 28, class: 'tacho-unit', 'text-anchor': 'middle' });
    scale.textContent = '× 1000';
    this.lamp = this.add(svg, 'circle', { cx: cx, cy: cy + 74, r: 3.5, class: 'tacho-lamp' });

    this.needle = this.add(svg, 'g', { class: 'tacho-needle' });
    this.add(this.needle, 'path', { d: `M ${cx - 2.6} ${cy + 16} L ${cx - 0.8} ${cy - 84} L ${cx + 0.8} ${cy - 84} L ${cx + 2.6} ${cy + 16} Z`, class: 'needle-blade' });
    this.add(svg, 'circle', { cx, cy, r: 8.5, class: 'needle-hub' });
    this.shown = -100;
    this.update(0, false);
  }

  /**
   * Adds what the parts can take to the usual dial, whose red zone starts at the rev limit.
   * Wear shows only below that limit, and breakage only where it fits on the scale.
   */
  setZones(safe: number, failure: number, cut: number): void {
    if (!this.wearArc || !this.breakArc) return;
    const angle = (rpm: number): number => SWEEP_START + (Math.min(rpm, this.maxRpm) / this.maxRpm) * SWEEP;
    const wearTo = Math.min(cut, failure);
    this.wearArc.setAttribute('d', safe < wearTo ? arc(100, 100, 80, angle(safe), angle(wearTo)) : '');
    this.breakArc.setAttribute('d', failure < this.maxRpm ? arc(100, 100, 80, angle(failure), angle(this.maxRpm)) : '');
  }

  update(rpm: number, limiter: boolean): void {
    if (Math.abs(rpm - this.shown) > 1) {
      const deg = SWEEP_START + (Math.min(rpm, this.maxRpm) / this.maxRpm) * SWEEP;
      this.needle.setAttribute('transform', `rotate(${deg.toFixed(2)} 100 100)`);
      this.shown = rpm;
    }
    const text = String(Math.round(rpm / 10) * 10);
    if (text !== this.shownText) {
      this.readout.textContent = text;
      this.shownText = text;
    }
    this.lamp.classList.toggle('on', limiter);
  }
}
