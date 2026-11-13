// Valve lift over two crank turns: where the cams sit at park, how far the phasers can carry them, the low
// cam if there is one, and where they are right now while the engine runs.

import { liftWindow } from '../../engine/kinematics.ts';
import type { LiveTiming } from '../../engine/valve-control.ts';
import type { Design } from '../../designer/design.ts';
import { camAt, shiftLimits } from '../../designer/valvetrain.ts';
import type { ValveEvents } from '../../designer/physics.ts';
import { t } from '../../i18n/t.ts';

const W = 340;
const H = 120;
const PAD = { l: 6, r: 6, t: 10, b: 18 };
const STEP = 4;

const x = (deg: number): number => PAD.l + (deg / 720) * (W - PAD.l - PAD.r);

/** One valve's lift over the cycle as SVG points. */
function curve(open: number, close: number, lift: number, top: number): string {
  const y = (v: number): number => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
  const out: string[] = [];
  for (let deg = 0; deg <= 720; deg += STEP) out.push(`${x(deg).toFixed(1)},${y(liftWindow(deg, open, close) * lift).toFixed(1)}`);
  return out.join(' ');
}

/** The reach of a phaser: the highest lift any of its positions gives at each angle. */
function envelope(list: Array<{ open: number; close: number; lift: number }>, top: number): string {
  const y = (v: number): number => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
  const out: string[] = [`${x(0).toFixed(1)},${y(0).toFixed(1)}`];
  for (let deg = 0; deg <= 720; deg += STEP) {
    const lift = Math.max(...list.map((c) => liftWindow(deg, c.open, c.close) * c.lift));
    out.push(`${x(deg).toFixed(1)},${y(lift).toFixed(1)}`);
  }
  out.push(`${x(720).toFixed(1)},${y(0).toFixed(1)}`);
  return out.join(' ');
}

export class CamDiagram {
  readonly root = document.createElement('div');
  private readonly svg: SVGSVGElement;
  private readonly liveIntake: SVGPolylineElement;
  private readonly liveExhaust: SVGPolylineElement;
  private top = 10;
  private lastLive = 0;
  private liveKey = '';

  constructor() {
    this.root.className = 'cams-widget';
    this.root.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="cam-diagram" role="img"><g class="cam-static"></g><polyline class="cam-live cam-live-ex" points="" /><polyline class="cam-live cam-live-in" points="" /></svg>
      <p class="note cam-legend"><span class="cam-key cam-key-in"></span>${t('впуск')} <span class="cam-key cam-key-ex"></span>${t('випуск')}. ${t('Лінія — вихідне положення, заливка — куди сягає фазообертач, пунктир — низький кулачок, яскрава лінія — зараз.')}</p>`;
    this.svg = this.root.querySelector('svg')!;
    this.liveIntake = this.root.querySelector('.cam-live-in')!;
    this.liveExhaust = this.root.querySelector('.cam-live-ex')!;
  }

  sync(d: Design): void {
    const park = camAt(d, { high: true });
    this.top = Math.max(d.lift, 1) * 1.08;
    const top = this.top;
    const lim = shiftLimits(d);
    const reach = (exhaust: boolean): Array<{ open: number; close: number; lift: number }> => {
      const out: Array<{ open: number; close: number; lift: number }> = [];
      for (let k = 0; k <= 8; k++) {
        const share = k / 8;
        const intakeShift = lim.intake[0] + (lim.intake[1] - lim.intake[0]) * share;
        const exhaustShift = lim.exhaust[0] + (lim.exhaust[1] - lim.exhaust[0]) * share;
        const e = camAt(d, { high: true, intakeShift, exhaustShift }).events;
        out.push(exhaust ? { open: e.exhaustOpen, close: e.exhaustClose, lift: d.lift } : { open: e.intakeOpen, close: e.intakeClose, lift: d.lift });
      }
      return out;
    };
    const parts: string[] = [];
    const yBase = H - PAD.b;
    for (const [deg, label] of [[0, t('ВМТ')], [180, t('НМТ')], [360, t('ВМТ')], [540, t('НМТ')], [720, t('ВМТ')]] as const) {
      parts.push(`<line x1="${x(deg).toFixed(1)}" x2="${x(deg).toFixed(1)}" y1="${PAD.t}" y2="${yBase}" class="cam-grid" />`);
      parts.push(`<text x="${x(deg).toFixed(1)}" y="${H - 4}" text-anchor="${deg === 0 ? 'start' : deg === 720 ? 'end' : 'middle'}" class="chart-label">${label}</text>`);
    }
    parts.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${yBase}" y2="${yBase}" class="axis" />`);
    if (d.camPhaser !== 'none') {
      parts.push(`<polygon points="${envelope(reach(false), top)}" class="cam-reach cam-reach-in" />`);
      if (d.camPhaser !== 'intake') parts.push(`<polygon points="${envelope(reach(true), top)}" class="cam-reach cam-reach-ex" />`);
    }
    if (d.camSwitch !== 'none') {
      const low = camAt(d, { high: false });
      if (d.camSwitch !== 'exhaust') parts.push(`<polyline points="${curve(low.events.intakeOpen, low.events.intakeClose, low.intakeLift, top)}" class="cam-low cam-in" />`);
      if (d.camSwitch !== 'intake') parts.push(`<polyline points="${curve(low.events.exhaustOpen, low.events.exhaustClose, low.exhaustLift, top)}" class="cam-low cam-ex" />`);
    }
    parts.push(`<polyline points="${curve(park.events.exhaustOpen, park.events.exhaustClose, park.exhaustLift, top)}" class="cam-line cam-ex" />`);
    parts.push(`<polyline points="${curve(park.events.intakeOpen, park.events.intakeClose, park.intakeLift, top)}" class="cam-line cam-in" />`);
    this.svg.querySelector('.cam-static')!.innerHTML = parts.join('');
    this.svg.setAttribute('aria-label', describe(park.events));
    this.liveKey = '';
  }

  /** The cams as they are this moment. Redrawn at most ten times a second. */
  live(now: LiveTiming | null, mainLift: number): void {
    const time = performance.now();
    if (time - this.lastLive < 100) return;
    this.lastLive = time;
    if (!now) {
      this.liveIntake.setAttribute('points', '');
      this.liveExhaust.setAttribute('points', '');
      this.liveKey = '';
      return;
    }
    const tm = now.timing;
    const key = [tm.intakeOpen, tm.intakeClose, tm.exhaustOpen, tm.exhaustClose, now.intakeLift, now.exhaustLift].map((v) => v.toFixed(1)).join('/');
    if (key === this.liveKey) return;
    this.liveKey = key;
    this.liveIntake.setAttribute('points', curve(tm.intakeOpen, tm.intakeClose, mainLift * now.intakeLift, this.top));
    this.liveExhaust.setAttribute('points', curve(tm.exhaustOpen, tm.exhaustClose, mainLift * now.exhaustLift, this.top));
  }
}

const describe = (e: ValveEvents): string =>
  t('Підйом клапанів за два оберти колінвала. Перекриття {overlap}°, впуск закривається через {ivc}° після нижньої мертвої точки.', { overlap: Math.round(e.overlap), ivc: Math.round(e.ivcAbdc) });
