// The knowledge panel: figures, explanation, and charts computed from the engine's own geometry.

import { ENGINES } from '../data/engines.ts';
import { balance, groupIntervals, torqueCurve, type Engine } from '../engine/kinematics.ts';
import { ASPIRATION_NAMES, VALVETRAIN_NAMES, type EngineSpec } from '../engine/spec.ts';

const num = (v: number, digits = 0): string => v.toLocaleString('uk-UA', { maximumFractionDigits: digits, minimumFractionDigits: digits });

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Collapses a list of gaps to its repeating pattern, e.g. 150, 90. */
export const intervalPattern = (values: number[]): string => {
  const rounded = values.map((v) => Math.round(v * 10) / 10);
  for (let size = 1; size <= rounded.length; size++) {
    if (rounded.length % size !== 0) continue;
    const head = rounded.slice(0, size);
    if (rounded.every((v, i) => v === head[i % size])) return head.map((v) => `${num(v, v % 1 ? 1 : 0)}°`).join(', ');
  }
  return rounded.map((v) => `${v}°`).join(', ');
};

const figures = (engine: Engine): Array<[string, string]> => {
  const s = engine.spec;
  const rows: Array<[string, string]> = [];
  rows.push(['Об’єм', `${num(engine.displacementCc / 1000, 1)} л`]);
  if (engine.isRotary) {
    rows.push(['Секцій', `${s.cylinders}, по 654 см³`]);
    rows.push(['Спалахів за оберт вала', String(s.cylinders)]);
  } else {
    rows.push(['Діаметр і хід', `${num(s.bore, s.bore % 1 ? 1 : 0)} × ${num(s.stroke, s.stroke % 1 ? 1 : 0)} мм`]);
    rows.push(['Порядок запалювання', s.firingOrder.join('-')]);
    rows.push(['Спалах кожні', intervalPattern(engine.intervals)]);
    if (s.exhaust.groups.length > 1 && s.exhaust.groups[0]!.length > 1) {
      rows.push(['Спалахи в одному випуску', intervalPattern(groupIntervals(engine, s.exhaust.groups[0]!))]);
    }
    rows.push(['Шатунних шийок', String(engine.throws.length)]);
    rows.push(['Клапани', `${s.valvesPerCyl * s.cylinders}, ${VALVETRAIN_NAMES[s.valvetrain]}`]);
  }
  rows.push(['Ступінь стиснення', `${num(s.compression, s.compression % 1 ? 1 : 0)} : 1`]);
  rows.push(['Живлення', s.fuel === 'diesel' ? `дизель, ${ASPIRATION_NAMES[s.aspiration]}` : `бензин, ${ASPIRATION_NAMES[s.aspiration]}`]);
  rows.push(['Межа обертів', `${num(s.redlineRpm)} об/хв`]);
  return rows;
};

const BAL_LABELS: Array<[keyof ReturnType<typeof balance>, string, string]> = [
  ['force1', 'Сила, 1-й порядок', 'Трусить двигун з частотою обертів'],
  ['force2', 'Сила, 2-й порядок', 'Трусить удвічі частіше за оберти'],
  ['couple1', 'Момент, 1-й порядок', 'Гойдає двигун навколо його центра'],
  ['couple2', 'Момент, 2-й порядок', 'Гойдає двигун удвічі частіше'],
];

const balanceChart = (engine: Engine): string => {
  if (engine.isRotary) {
    return `<p class="note">Ротор обертається, а не рухається туди-сюди, і зрівноважується противагами на ексцентриковому валу. Вільних сил майже немає, тому тут графіка немає.</p>`;
  }
  const b = balance(engine);
  const max = 3;
  const rows = BAL_LABELS.map(([key, name, hint]) => {
    const value = b[key];
    const zero = value < 0.01;
    const width = Math.min(100, (value / max) * 100);
    return `<div class="bar-row" title="${hint}">
      <span class="bar-name">${name}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${width.toFixed(1)}%"></span></span>
      <span class="bar-value">${zero ? '0' : num(value, 2)}</span>
    </div>`;
  }).join('');
  return `<div class="bars">${rows}</div>
    <p class="note">Пораховано з геометрії цього двигуна. Одиниця: сила інерції одного поршня. Моменти поділено ще й на відстань між циліндрами. Частину першого порядку, яку можуть прибрати противаги колінвала, вже вилучено.</p>`;
};

const torqueSvg = (engine: Engine): string => {
  const curve = torqueCurve(engine, 360);
  const w = 340;
  const h = 96;
  const pad = { l: 2, r: 2, t: 8, b: 16 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  let min = -1;
  let max = 2;
  for (let i = 0; i < curve.length; i++) {
    min = Math.min(min, curve[i]!);
    max = Math.max(max, curve[i]!);
  }
  const y = (v: number): number => pad.t + plotH - ((v - min) / (max - min)) * plotH;
  const x = (i: number): number => pad.l + (i / (curve.length - 1)) * plotW;
  const points: string[] = [];
  for (let i = 0; i < curve.length; i++) points.push(`${x(i).toFixed(1)},${y(curve[i]!).toFixed(1)}`);
  const zero = y(0);
  const mean = y(1);
  const cycleLabel = engine.isRotary ? '1080° вала' : '720° вала';
  return `<svg viewBox="0 0 ${w} ${h}" class="torque-chart" role="img" aria-label="Крутний момент за цикл. Найбільше значення ${num(Math.max(...curve), 1)} середнього, найменше ${num(Math.min(...curve), 1)}.">
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${zero}" y2="${zero}" class="axis" />
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${mean}" y2="${mean}" class="grid-dash" />
    <polyline points="${points.join(' ')}" class="torque-line" />
    <text x="${w - pad.r}" y="${mean - 4}" text-anchor="end" class="chart-label">середнє</text>
    <text x="${pad.l}" y="${zero - 4}" class="chart-label">0</text>
    <text x="${pad.l}" y="${h - 3}" class="chart-label">0°</text>
    <text x="${w - pad.r}" y="${h - 3}" text-anchor="end" class="chart-label">${cycleLabel}</text>
  </svg>
  <p class="note">Момент на валу за цикл, відносно середнього: пік ${num(Math.max(...curve), 1)}, мінімум ${num(Math.min(...curve), 1)}. Спрощена модель тиску в камері. Що рівніша лінія, то легший маховик потрібен двигуну.</p>`;
};

const list = (items: string[]): string => items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');

export const siblingsOf = (spec: EngineSpec): EngineSpec[] => ENGINES.filter((e) => e.cylinders === spec.cylinders && e.id !== spec.id);

export function articleHtml(engine: Engine): string {
  const s = engine.spec;
  const a = s.article;
  const siblings = siblingsOf(s);
  const compare = siblings.length
    ? `<h3>Порівняй звук</h3>
       <p class="note">Двигун продовжить працювати на тих самих обертах.</p>
       <div class="sibling-list">${siblings.map((o) => `<a class="sibling" href="#/engines/${o.id}">${escapeHtml(o.title)}</a>`).join('')}</div>`
    : '';
  const verify = s.verifyNote ? `<p class="verify">${escapeHtml(s.verifyNote)}</p>` : '';
  return `
    <p class="lead">${escapeHtml(a.lead)}</p>
    <dl class="figures">${figures(engine)
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join('')}</dl>
    ${verify}
    <h3>Як це влаштовано</h3>
    <p>${escapeHtml(a.how)}</p>
    <h3>Чому він так звучить</h3>
    <p>${escapeHtml(a.sound)}</p>
    ${compare}
    <h3>Вібрації</h3>
    ${balanceChart(engine)}
    <h3>Рівномірність моменту</h3>
    ${torqueSvg(engine)}
    <div class="pros-cons">
      <div><h3>Сильні сторони</h3><ul>${list(a.pros)}</ul></div>
      <div><h3>Слабкі сторони</h3><ul>${list(a.cons)}</ul></div>
    </div>
    <h3>Де трапляється</h3>
    <ul class="cars">${list(a.cars)}</ul>
    <p class="note small">Цифри наведено для двигуна ${escapeHtml(s.example)}. Звук синтезовано з кута колінвала, без записів справжнього двигуна, тому це модель, а не запис.</p>
  `;
}
