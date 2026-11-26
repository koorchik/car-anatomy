// The suspension designer's results (suspensions plan, the designer's results): the character of the ride in three
// bars and a word, the headline figures, the diagnoses with their advice, and the graphs: camber and toe over the
// travel, the roll centre in roll, the frequency response of the body and the tyre, the steering-wheel angle and the
// wheel loads over the lateral acceleration, and the parts of the understeer. The design the visitor started from is a
// pale ghost on every graph. Figures follow every change at once; the graphs come with them, from curves.ts.

import { t } from '../../i18n/t.ts';
import { G } from '../../suspension/forces.ts';
import type { ChassisPerformance } from '../../suspension/evaluate-chassis.ts';
import type { InvariantPoints } from '../../suspension/evaluate.ts';
import type { SteeringPerformance } from '../../suspension/evaluate-steering.ts';
import type { ChassisCharacter, ChassisDiagnostic } from '../../suspension-designer/diagnostics.ts';
import { type RollCentreCurve, type TravelCurves, type TurnCurves } from '../../suspension-designer/curves.ts';
import { BarChart, fmt, LineChart, SERIES_COLORS, type LineSeries } from './charts.ts';

const DEG = 180 / Math.PI;

/** What the graphs show of one design. */
export interface DesignCurves {
  travel: [TravelCurves, TravelCurves];
  roll: [RollCentreCurve, RollCentreCurve];
  response: Array<{ hz: number[]; bodyAcc: number[]; tyreForce: number[] }>;
  invariant: [InvariantPoints, InvariantPoints];
  turn: TurnCurves;
  understeer: Array<{ id: 'tyres' | 'transfer' | 'camber' | 'rollSteer'; value: number }>;
}

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

const front = (): string => t('спереду');
const rear = (): string => t('ззаду');

/** The headline figures: [id, name, value]. */
export function headlineRows(perf: ChassisPerformance, steering: SteeringPerformance | null): Array<[string, string, string]> {
  const [f, r] = perf.axles;
  const hz = (v: number): string => t('{value} Гц', { value: fmt(v, 2) });
  const pair = (a: string, b: string): string => `${a} / ${b}`;
  const critical = Number.isFinite(perf.criticalSpeedMs) ? t(', критична {value} км/год', { value: fmt(perf.criticalSpeedMs * 3.6, 0) }) : '';
  const rows: Array<[string, string, string]> = [
    ['ride', t('Частота кузова F / R'), pair(hz(f.rideHz), hz(r.rideHz))],
    ['zeta', t('Демпфування кузова F / R'), pair(fmt(f.body.zeta, 2), fmt(r.body.zeta, 2))],
    ['comfort', t('Прискорення кузова на дорозі'), t('{value} м/с²', { value: fmt(perf.comfortAw, 2) })],
    ['grip', t('Зчеплення на поганій дорозі'), `${fmt(perf.roughGrip * 100, 1)}%`],
    ['roll', t('Крен'), t('{value}°/g', { value: fmt(perf.rollPerG * DEG, 1) })],
    ['transfer', t('Частка перенесення спереду'), `${fmt(perf.frontTransferShare * 100, 0)}%`],
    ['understeer', t('Недостатня поворотність'), `${t('{value}°/g', { value: fmt(perf.understeerPerG * DEG, 2) })}${critical}`],
    ['skidpad', t('Межа на скідпеді'), t('{value} g', { value: fmt(perf.skidpadAcc / G, 2) })],
    ['braking', t('Гальмівний шлях 100–0'), t('{value} м', { value: fmt(perf.brakingM, 1) })],
    ['pitch', t('Тангаж на гальмах'), t('{value}°/g', { value: fmt(perf.pitchPerG * DEG, 2) })],
  ];
  if (steering) {
    rows.push(['steer', t('Передатне число керма'), `${fmt(steering.ratioCentre, 1)} · ${t('{value} об. від упору до упору', { value: fmt(steering.turnsLockToLock, 1) })}`]);
  }
  return rows;
}

const SEVERITY: Record<ChassisDiagnostic['severity'], () => string> = {
  fatal: () => t('Небезпечно'),
  warning: () => t('Увага'),
  note: () => t('Примітка'),
};

interface Card {
  root: HTMLElement;
}

export class DesignerResults {
  readonly root = document.createElement('div');
  private readonly verdict = document.createElement('div');
  private readonly numbers = document.createElement('dl');
  private readonly diagnoses = document.createElement('div');
  private readonly charts = document.createElement('div');
  private readonly camber = new LineChart(t('Розвал від ходу колеса, спереду й ззаду'));
  private readonly toe = new LineChart(t('Сходження від ходу колеса, спереду й ззаду'));
  private readonly rc = new LineChart(t('Висота центра крену від крену кузова'));
  private readonly frf = new LineChart(t('Амплітудно-частотна характеристика кузова й шини'));
  private readonly steer = new LineChart(t('Кут керма від бокового прискорення на колі 40 м'));
  private readonly loads = new LineChart(t('Навантаження коліс від бокового прискорення'));
  private readonly understeer = new BarChart(t('Розклад недостатньої поворотності'));
  private frfMode: 'body' | 'tyre' = 'body';
  private last: { curves: DesignCurves; ghost: DesignCurves | null } | null = null;

  constructor() {
    this.root.className = 'panel-scroll sd-results';
    this.root.id = 'sd-results';
    this.root.tabIndex = 0;
    this.verdict.className = 'sd-verdict';
    this.numbers.className = 'sd-numbers';
    this.diagnoses.className = 'sd-diagnoses';
    this.diagnoses.id = 'sd-diagnoses';
    this.charts.className = 'sd-charts';
    const head = (text: string): HTMLElement => {
      const h = document.createElement('h3');
      h.textContent = text;
      return h;
    };
    const frfSwitch = document.createElement('div');
    frfSwitch.className = 'segmented sd-frf-switch';
    frfSwitch.setAttribute('role', 'group');
    frfSwitch.setAttribute('aria-label', t('Що показує характеристика'));
    for (const [v, label] of [['body', t('Кузов')], ['tyre', t('Шина')]] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = v;
      b.textContent = label;
      b.setAttribute('aria-pressed', String(v === this.frfMode));
      b.addEventListener('click', () => {
        this.frfMode = v;
        for (const x of frfSwitch.querySelectorAll<HTMLElement>('button')) x.setAttribute('aria-pressed', String(x.dataset.v === v));
        if (this.last) this.drawFrf(this.last.curves, this.last.ghost);
      });
      frfSwitch.append(b);
    }
    this.charts.append(
      this.card(t('Розвал від ходу'), t('Хід обох коліс разом від повного відбою до відбійника. Плюс — колесо вгору.'), this.camber).root,
      this.card(t('Сходження від ходу'), t('Сходження змінюється на ході — це підрулювання на нерівностях.'), this.toe).root,
      this.card(t('Міграція центра крену'), t('Висота центра крену над дорогою, коли кузов крениться в повороті. Розрив лінії: лінії сил коліс стали майже паралельні, і центр крену пішов далі ніж на метр.'), this.rc).root,
      this.card(t('Амплітудно-частотна характеристика'), t('Як кузов і шина відповідають на хвилясту дорогу, на метр її висоти. Вертикальні пунктири у кузова — незмінні точки осей: на цій частоті амортизатор нічого не змінює.'), this.frf, frfSwitch).root,
      this.card(t('Кут керма від бокового прискорення'), t('Коло радіусом 40 м: що крутіше лінія йде вгору від нейтральної, то більша недостатня поворотність.'), this.steer).root,
      this.card(t('Навантаження коліс'), t('Ліве колесо внутрішнє: лівий поворот. Колесо, що дійшло до нуля, відірвалося від дороги.'), this.loads).root,
      this.card(t('Розклад недостатньої поворотності'), t('З чого складається градієнт недостатньої поворотності: плюс — до недостатньої, мінус — до надмірної.'), this.understeer).root,
    );
    this.root.append(head(t('Характер')), this.verdict, this.numbers, head(t('Діагнози')), this.diagnoses, head(t('Графіки')), this.charts);
  }

  private card(title: string, note: string, chart: LineChart | BarChart, extra?: HTMLElement): Card {
    const root = document.createElement('section');
    root.className = 'sd-card';
    const h = document.createElement('h4');
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'sd-card-note';
    p.textContent = note;
    root.append(h);
    if (extra) root.append(extra);
    root.append(chart.element);
    if (chart instanceof LineChart) root.append(chart.legend);
    root.append(p);
    return { root };
  }

  /** The figures, the character and the diagnoses of a design: every change, at once. */
  update(perf: ChassisPerformance, steering: SteeringPerformance | null, character: ChassisCharacter, diagnoses: ChassisDiagnostic[]): void {
    const bar = (label: string, value: number): string =>
      `<div class="sd-bar"><span>${escapeHtml(label)}</span><span class="sd-bar-track"><span class="sd-bar-fill" style="width:${Math.round(value * 100)}%"></span></span></div>`;
    this.verdict.innerHTML = `<p class="sd-verdict-word">${escapeHtml(t('Підвіска {word}', { word: character.label }))}</p>${bar(t('Комфорт'), character.comfort)}${bar(t('Зчеплення з дорогою'), character.grip)}${bar(t('Контроль кузова'), character.control)}`;
    this.numbers.innerHTML = headlineRows(perf, steering)
      .map(([id, name, value]) => `<div class="sd-number" data-row="${id}"><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join('');
    this.diagnoses.innerHTML = diagnoses.length
      ? diagnoses
          .map(
            (d) =>
              `<article class="sd-diag sd-${d.severity}" data-id="${d.id}"><h4><span class="sd-sev">${escapeHtml(SEVERITY[d.severity]())}</span> ${escapeHtml(d.title)}</h4><p>${escapeHtml(d.text)}</p>${d.fix ? `<p class="sd-fix">${escapeHtml(d.fix)}</p>` : ''}</article>`,
          )
          .join('')
      : `<p class="sd-ok">${escapeHtml(t('Модель не бачить проблем у цьому дизайні.'))}</p>`;
  }

  /** The graphs of the design, with the starting design as a ghost. */
  setCurves(curves: DesignCurves, ghost: DesignCurves | null): void {
    this.last = { curves, ghost };
    const axis = (pick: (k: 0 | 1) => { x: readonly number[]; y: readonly number[] }): LineSeries[] =>
      ([0, 1] as const).map((k) => ({ name: k === 0 ? front() : rear(), color: k === 0 ? SERIES_COLORS.front : SERIES_COLORS.rear, ...pick(k) }));
    const mm = (xs: readonly number[]): number[] => xs.map((x) => x * 1000);
    const deg = (ys: readonly number[]): number[] => ys.map((y) => y * DEG);
    const travel = (c: DesignCurves, f: 'camber' | 'toe') => axis((k) => ({ x: mm(c.travel[k].travelM), y: deg(c.travel[k][f]) }));
    const restMark = [{ x: 0, label: t('спокій') }];
    this.camber.set({ series: travel(curves, 'camber'), ghost: ghost ? travel(ghost, 'camber') : [], marks: restMark, xUnit: t('мм'), yUnit: '°', xDigits: 0, yDigits: 2, minSpan: 2 });
    this.toe.set({ series: travel(curves, 'toe'), ghost: ghost ? travel(ghost, 'toe') : [], marks: restMark, xUnit: t('мм'), yUnit: '°', xDigits: 0, yDigits: 2, minSpan: 0.6 });
    const roll = (c: DesignCurves) => axis((k) => ({ x: deg(c.roll[k].rollRad), y: mm(c.roll[k].heightM) }));
    this.rc.set({ series: roll(curves), ghost: ghost ? roll(ghost) : [], xUnit: t('° крену'), yUnit: t('мм'), xDigits: 1, yDigits: 0, minSpan: 60, zero: true });
    this.drawFrf(curves, ghost);
    const L = (c: DesignCurves) => [{ name: t('кермо'), color: SERIES_COLORS.third, x: c.turn.ay.map((a) => a / G), y: deg(c.turn.steeringWheel) }];
    const roadWheel = curves.turn.ratio === 1;
    this.steer.set({
      series: L(curves),
      ghost: ghost ? L(ghost) : [],
      level: { y: curves.turn.neutral * DEG, label: t('нейтральна') },
      xUnit: 'g',
      yUnit: roadWheel ? t('° колеса') : t('° керма'),
      xDigits: 2,
      yDigits: 0,
      zero: true,
    });
    const names = [t('ліве переднє'), t('праве переднє'), t('ліве заднє'), t('праве заднє')];
    const colors = [SERIES_COLORS.front, SERIES_COLORS.front, SERIES_COLORS.rear, SERIES_COLORS.rear];
    const wheels = (c: DesignCurves): LineSeries[] =>
      names.map((name, i) => ({ name, color: colors[i]!, dashed: i % 2 === 0, x: c.turn.ay.map((a) => a / G), y: c.turn.loads.map((l) => l[i]! / 1000) }));
    this.loads.set({ series: wheels(curves), ghost: ghost ? wheels(ghost) : [], xUnit: 'g', yUnit: t('кН'), xDigits: 2, yDigits: 2, zero: true });
    const label: Record<DesignCurves['understeer'][number]['id'], string> = {
      tyres: t('Шини й розподіл ваги'),
      transfer: t('Перенесення ваги'),
      camber: t('Розвал на крені'),
      rollSteer: t('Підрулювання на крені'),
    };
    const total = (c: DesignCurves): number => c.understeer.reduce((s, p) => s + p.value, 0);
    this.understeer.set(
      [
        ...curves.understeer.map((p, i) => ({ label: label[p.id], value: p.value * DEG, ghost: ghost ? ghost.understeer[i]!.value * DEG : undefined })),
        { label: t('Разом'), value: total(curves) * DEG, ghost: ghost ? total(ghost) * DEG : undefined, total: true },
      ],
      t('°/g'),
      2,
    );
  }

  private drawFrf(curves: DesignCurves, ghost: DesignCurves | null): void {
    const body = this.frfMode === 'body';
    const pick = (c: DesignCurves): LineSeries[] =>
      c.response.map((r, k) => ({ name: k === 0 ? front() : rear(), color: k === 0 ? SERIES_COLORS.front : SERIES_COLORS.rear, x: r.hz, y: body ? r.bodyAcc : r.tyreForce.map((v) => v / 1000) }));
    const label = (hz: number): string => t('{value} Гц', { value: fmt(hz, 1) });
    const [fi, ri] = curves.invariant.map((inv) => inv.bodyHz);
    // One line when both axles' points read the same, one per axle in its colour otherwise.
    const marks = !body
      ? []
      : label(fi!) === label(ri!)
        ? [{ x: fi!, label: label(fi!) }]
        : [
            { x: fi!, label: label(fi!), color: SERIES_COLORS.front },
            { x: ri!, label: label(ri!), color: SERIES_COLORS.rear },
          ];
    this.frf.set({
      series: pick(curves),
      ghost: ghost ? pick(ghost) : [],
      // The body's acceleration has an invariant point at √(k_t/m_u) of each axle: no damper moves it (evaluate.ts).
      marks,
      xUnit: t('Гц'),
      yUnit: body ? t('(м/с²)/м') : t('кН/м'),
      xDigits: 1,
      yDigits: body ? 0 : 1,
      logX: true,
      zero: true,
    });
  }
}
