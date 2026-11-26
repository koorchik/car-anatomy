// The torque converter's lab on the automatic page (stage K12a, demonstration 9): a card with four steps over one run
// computed ahead (src/drivetrain/converter-lab.ts), played back at the shell's slow-down. Each step plays its stretch
// of the run in a loop, with a chart of its own: the stall test as the engine's full-load curve against the pump's
// parabola (n/K)², the pull-away and the coupling point on the measured TR(SR) curve, the lock-up as the slip over
// time. The 3D gets the converter's wheels and the gearbox in first, turned at the run's speeds.
//
// The stator's speed while it freewheels is not in the run (the model has no stator member): for the picture it turns
// between standing at the coupling point and the turbine's speed at SR 1 [illustration]. The circulation arrows run
// at a speed that grows with the slip between the pump and the turbine [illustration].

import type { ConverterLabRun, LabPhase } from '../../../drivetrain/converter-lab.ts';
import { CONVERTER_SR, CONVERTER_TR, stallTorque } from '../../../drivetrain/converter.ts';
import { numberLocale } from '../../../i18n/locale.ts';
import { t } from '../../../i18n/t.ts';
import type { ConverterFrame } from '../../../scene/gearbox/converter-mesh.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const TAU = Math.PI * 2;
const RPM = 30 / Math.PI;
/** A step's stretch ends, holds this long, s of the run, and starts again. */
const HOLD_S = 0.6;
/** Chart box, SVG units. */
const W = 320;
const H = 150;
const PAD = { l: 38, r: 18, t: 16, b: 26 };

type ChartKind = 'stall' | 'curve' | 'slip';

interface LabStep {
  title: string;
  text: string;
  from: number;
  to: number;
  chart: ChartKind;
}

/** What the page shows of the run in a frame. */
export interface LabShown {
  /** Run time the last frame moved on, s: what the gearbox's angles advance by. */
  moved: number;
  engineRpm: number;
  turbineRpm: number;
  converter: ConverterFrame;
}

export class ConverterLabUi {
  readonly run: ConverterLabRun;
  private readonly root: HTMLElement;
  private readonly steps: LabStep[];
  private at = 0;
  /** Time in the run, s. */
  private time = 0;
  private held = 0;
  private readonly shown: LabShown = { moved: 0, engineRpm: 0, turbineRpm: 0, converter: { pump: 0, turbine: 0, stator: 0, flow: 0, strength: 0 } };
  private readonly texts = new Map<string, string>();
  private scaleX: (v: number) => number = (v) => v;
  private scaleY: (v: number) => number = (v) => v;

  constructor(root: HTMLElement, run: ConverterLabRun) {
    this.root = root;
    this.run = run;
    this.steps = this.buildSteps();
    this.el('gba-lab-prev').addEventListener('click', () => this.go(this.at - 1));
    this.el('gba-lab-next').addEventListener('click', () => this.go(this.at + 1));
    this.el('gba-lab-again').addEventListener('click', () => this.go(this.at));
    this.go(0);
  }

  /** The run's time now, s. */
  get seconds(): number {
    return this.time;
  }

  get step(): number {
    return this.at;
  }

  get count(): number {
    return this.steps.length;
  }

  go(index: number): void {
    this.at = Math.max(0, Math.min(this.steps.length - 1, index));
    const step = this.steps[this.at]!;
    this.time = step.from;
    this.held = 0;
    this.set('gba-lab-count', t('Гідротрансформатор · {n} з {count}', { n: this.at + 1, count: this.steps.length }));
    this.set('gba-lab-title', step.title);
    this.set('gba-lab-text', step.text);
    (this.el('gba-lab-prev') as HTMLButtonElement).disabled = this.at === 0;
    (this.el('gba-lab-next') as HTMLButtonElement).disabled = this.at === this.steps.length - 1;
    this.el('gba-lab-chart').innerHTML = this.chartSvg(step.chart);
    this.update();
  }

  /** Advances the run by `dt` seconds of run time (the frame's time times the slow-down) and returns what to draw. */
  frame(dt: number): LabShown {
    const step = this.steps[this.at]!;
    const before = this.time;
    if (this.time < step.to) this.time = Math.min(step.to, this.time + dt);
    else {
      this.held += dt;
      if (this.held > HOLD_S) {
        this.time = step.from;
        this.held = 0;
      }
    }
    const moved = Math.max(0, this.time - before);
    const i = this.index();
    const r = this.run;
    const c = this.shown.converter;
    const pumpW = r.engineRpm[i]! / RPM;
    const turbineW = r.turbineRpm[i]! / RPM;
    c.pump = wrap(c.pump + pumpW * moved);
    c.turbine = wrap(c.turbine + turbineW * moved);
    const free = r.statorFree[i] === 1;
    const sr = r.sr[i]!;
    const statorW = free ? (turbineW * Math.max(0, sr - r.coupling)) / (1 - r.coupling) : 0;
    c.stator = wrap(c.stator + statorW * moved);
    const slip = Math.max(0, r.engineRpm[i]! - r.turbineRpm[i]!);
    c.strength = Math.min(1, slip / 1200);
    c.flow = wrap(c.flow + TAU * (0.25 + 1.2 * c.strength) * moved * (c.strength > 0.02 ? 1 : 0));
    this.shown.moved = moved;
    this.shown.engineRpm = r.engineRpm[i]!;
    this.shown.turbineRpm = r.turbineRpm[i]!;
    this.update();
    return this.shown;
  }

  private index(): number {
    return Math.max(0, Math.min(this.run.frames - 1, Math.round(this.time / this.run.frameS)));
  }

  private frameAt(time: number): number {
    return Math.max(0, Math.min(this.run.frames - 1, Math.round(time / this.run.frameS)));
  }

  private buildSteps(): LabStep[] {
    const r = this.run;
    const p: Record<LabPhase, number> = r.phases;
    let coupled = p.lockup;
    for (let i = this.frameAt(p.pull); i < this.frameAt(p.lockup); i++) {
      if (r.sr[i]! >= r.coupling) {
        coupled = i * r.frameS;
        break;
      }
    }
    const settled = r.engineRpm[this.frameAt(p.settle - r.frameS)]!;
    const slipFrom = r.slipRpm[this.frameAt(p.lockup)]!;
    const slipTo = r.slipRpm[r.frames - 1]!;
    const pedal = r.pedal[this.frameAt(p.lockup - r.frameS)]!;
    return [
      {
        title: t('Тест на зупинці'),
        text: t(
          'Гальмо втиснуте, газ до упору. Турбіна стоїть, а насос крутиться з двигуном. Оберти ростуть, доки момент двигуна не зрівняється з тим, що забирає насос: T = (n/K)². Для K = {k} крива двигуна перетинає параболу на {rpm} об/хв, і модель стає на {settled}. Реактор тримається на муфті вільного ходу й повертає оливу, тому на турбіні в 1,81 раза більше моменту, ніж дає двигун.',
          { k: num(r.kStall), rpm: num(r.stallRpm), settled: num(settled) },
        ),
        from: p.stall - 0.2,
        to: p.settle,
        chart: 'stall',
      },
      {
        title: t('Рушання'),
        text: t(
          'Газ відпущено, двигун повернувся до холостого ходу. Тепер гальмо відпускається, а педаль іде на {pedal} %. Турбіна розкручується, швидкісне відношення SR = n_т/n_н росте, а коефіцієнт трансформації TR падає з 1,81 майже лінійно. Точка на графіку йде виміряною кривою GM 6T40.',
          { pedal: num(pedal * 100) },
        ),
        from: p.pull - 0.2,
        to: coupled,
        chart: 'curve',
      },
      {
        title: t('Точка зчеплення'),
        text: t(
          'На SR = {sc} TR доходить до 1: далі реактор мав би штовхати оливу вперед, і муфта вільного ходу його відпускає. Він крутиться разом з оливою, а гідротрансформатор працює як звичайна гідромуфта: момент на турбіні дорівнює моменту насоса, а турбіна крутиться трохи повільніше.',
          { sc: num(r.coupling, 2) },
        ),
        from: Math.max(p.pull, coupled - 0.3),
        to: p.lockup,
        chart: 'curve',
      },
      {
        title: t('Блокування'),
        text: t(
          'Тепер замикається муфта блокування. Ковзання між двигуном і турбіною падає з {from} до {to} об/хв: керування навмисно лишає кілька десятків обертів, щоб вібрація двигуна не йшла в кузов. Втрати в оливі майже зникають.',
          { from: num(slipFrom), to: num(slipTo) },
        ),
        from: p.lockup - 0.3,
        to: r.durationS,
        chart: 'slip',
      },
    ];
  }

  /** The readouts and the chart's marker for the present frame. */
  private update(): void {
    const r = this.run;
    const i = this.index();
    const free = r.statorFree[i] === 1;
    this.set('gba-lab-engine', t('{rpm} об/хв · {nm} Н·м', { rpm: num(r.engineRpm[i]!), nm: num(r.engineNm[i]!) }));
    this.set('gba-lab-turbine', t('{rpm} об/хв · {nm} Н·м', { rpm: num(Math.max(0, r.turbineRpm[i]!)), nm: num(r.turbineNm[i]! + r.lockupNm[i]!) }));
    this.set('gba-lab-ratio', `SR ${num(r.sr[i]!, 2)} · TR ${num(r.tr[i]!, 2)}`);
    this.set('gba-lab-stator', free ? t('крутиться вільно') : t('тримається на муфті вільного ходу'));
    this.set('gba-lab-slip', t('{rpm} об/хв', { rpm: num(Math.max(0, r.slipRpm[i]!)) }));
    this.set('gba-lab-speed', t('{kmh} км/год', { kmh: num(r.speedKmh[i]!) }));
    const pedal = num(r.pedal[i]! * 100);
    this.set('gba-lab-controls', r.brake[i]! > 0.5 ? t('газ {pedal} %, гальмо', { pedal }) : t('газ {pedal} %', { pedal }));
    this.el('gba-lab-stator').classList.toggle('free', free);
    const dot = this.root.querySelector<SVGCircleElement>('#gba-lab-dot');
    if (!dot) return;
    const kind = this.steps[this.at]!.chart;
    let x: number;
    let y: number;
    if (kind === 'stall') {
      x = r.engineRpm[i]!;
      y = r.engineNm[i]!;
    } else if (kind === 'curve') {
      x = r.sr[i]!;
      y = r.tr[i]!;
    } else {
      x = this.time;
      y = Math.max(0, r.slipRpm[i]!);
      const trace = this.root.querySelector<SVGPathElement>('#gba-lab-trace');
      if (trace) trace.setAttribute('d', this.tracePath(this.steps[this.at]!.from, this.time));
    }
    dot.setAttribute('cx', this.scaleX(x).toFixed(1));
    dot.setAttribute('cy', this.scaleY(y).toFixed(1));
  }

  private tracePath(from: number, to: number): string {
    const r = this.run;
    const parts: string[] = [];
    for (let i = this.frameAt(from); i <= this.frameAt(to); i += 2) parts.push(`${parts.length ? 'L' : 'M'}${this.scaleX(i * r.frameS).toFixed(1)} ${this.scaleY(Math.max(0, r.slipRpm[i]!)).toFixed(1)}`);
    return parts.join('');
  }

  private chartSvg(kind: ChartKind): string {
    const r = this.run;
    const step = this.steps[this.at]!;
    let x0: number, x1: number, y0: number, y1: number, xLabel: string, yLabel: string;
    const lines: string[] = [];
    const ticksX: number[] = [];
    const ticksY: number[] = [];
    if (kind === 'stall') {
      x0 = 500;
      x1 = 3500;
      y0 = 0;
      y1 = 1000;
      xLabel = t('об/хв');
      yLabel = t('Н·м');
      for (let v = 1000; v <= 3500; v += 500) ticksX.push(v);
      for (let v = 0; v <= 1000; v += 250) ticksY.push(v);
    } else if (kind === 'curve') {
      x0 = 0;
      x1 = 1;
      y0 = 0.8;
      y1 = 1.9;
      xLabel = 'SR';
      yLabel = 'TR';
      for (let v = 0; v <= 1; v += 0.2) ticksX.push(v);
      for (let v = 1; v <= 1.81; v += 0.2) ticksY.push(v);
    } else {
      x0 = step.from;
      x1 = step.to;
      y0 = 0;
      y1 = Math.max(150, Math.ceil(Math.max(...r.slipRpm.subarray(this.frameAt(step.from), this.frameAt(step.to))) / 50) * 50);
      xLabel = t('с');
      yLabel = t('ковзання, об/хв');
      for (let v = Math.ceil(x0); v <= x1; v += 1) ticksX.push(v);
      for (let v = 0; v <= y1; v += y1 > 300 ? 100 : 50) ticksY.push(v);
    }
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
    const sy = (v: number) => H - PAD.b - ((v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
    this.scaleX = sx;
    this.scaleY = sy;
    const path = (xs: ArrayLike<number>, ys: ArrayLike<number>) => Array.from(xs, (x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(ys[i]!).toFixed(1)}`).join('');
    if (kind === 'stall') {
      lines.push(`<path class="gba-lab-engine" d="${path(r.curve.rpm.filter((v) => v <= x1), r.curve.nm)}"/>`);
      const ps: number[] = [];
      const qs: number[] = [];
      for (let n = x0; n <= x1; n += 50) {
        const q = stallTorque(n, r.kStall);
        if (q > y1) break;
        ps.push(n);
        qs.push(q);
      }
      lines.push(`<path class="gba-lab-pump" d="${path(ps, qs)}"/>`);
      lines.push(`<line class="gba-lab-mark" x1="${sx(r.stallRpm).toFixed(1)}" x2="${sx(r.stallRpm).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}"/>`);
      lines.push(`<text class="gba-lab-key" x="${PAD.l + 4}" y="${PAD.t + 10}"><tspan class="gba-lab-engine-t">${t('двигун, повний газ')}</tspan></text>`);
      lines.push(`<text class="gba-lab-key" x="${PAD.l + 4}" y="${PAD.t + 23}"><tspan class="gba-lab-pump-t">${t('насос: (n/K)²')}</tspan></text>`);
    } else if (kind === 'curve') {
      lines.push(`<path class="gba-lab-pump" d="${path([...CONVERTER_SR, 1], [...CONVERTER_TR, 1])}"/>`);
      lines.push(`<line class="gba-lab-mark" x1="${sx(r.coupling).toFixed(1)}" x2="${sx(r.coupling).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}"/>`);
      lines.push(`<line class="gba-lab-one" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(1).toFixed(1)}" y2="${sy(1).toFixed(1)}"/>`);
      lines.push(`<text class="gba-lab-key" x="${(sx(r.coupling) - 4).toFixed(1)}" y="${PAD.t + 10}" text-anchor="end">${t('точка зчеплення')}</text>`);
    } else {
      lines.push(`<path class="gba-lab-pump" id="gba-lab-trace" d=""/>`);
      lines.push(`<line class="gba-lab-mark" x1="${sx(r.phases.lockup).toFixed(1)}" x2="${sx(r.phases.lockup).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}"/>`);
      lines.push(`<text class="gba-lab-key" x="${(sx(r.phases.lockup) + 4).toFixed(1)}" y="${PAD.t + 10}">${t('муфта замикається')}</text>`);
    }
    const tx = ticksX.map((v) => `<text class="gba-lab-tick" x="${sx(v).toFixed(1)}" y="${H - PAD.b + 13}" text-anchor="middle">${num(v, kind === 'curve' ? 1 : 0)}</text>`).join('');
    const ty = ticksY.map((v) => `<text class="gba-lab-tick" x="${PAD.l - 4}" y="${(sy(v) + 3).toFixed(1)}" text-anchor="end">${num(v, kind === 'curve' ? 1 : 0)}</text><line class="gba-lab-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${step.title}">
      ${ty}${tx}
      <text class="gba-lab-tick" x="${W - PAD.r}" y="${H - 2}" text-anchor="end">${xLabel}</text>
      <text class="gba-lab-tick" x="2" y="9">${yLabel}</text>
      ${lines.join('')}
      <circle id="gba-lab-dot" r="4.5" cx="0" cy="0"/>
    </svg>`;
  }

  private set(id: string, text: string): void {
    if (this.texts.get(id) === text) return;
    this.texts.set(id, text);
    this.el(id).textContent = text;
  }

  private el(id: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
}

const wrap = (a: number): number => a - Math.floor(a / TAU) * TAU;
