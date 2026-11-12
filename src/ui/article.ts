// The knowledge panel: figures, explanation, and charts computed from the engine's own geometry.

import { ENGINES, engineFacts } from '../data/engines.ts';
import type { EngineFacts } from '../designer/catalogue.ts';
import { COOLING_NAMES, FUEL_SYSTEM_NAMES } from '../designer/systems.ts';
import { balance, groupIntervals, torqueCurve, type Engine } from '../engine/kinematics.ts';
import { ASPIRATION_NAMES, VALVETRAIN_NAMES, type EngineSpec } from '../engine/spec.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

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
  rows.push([t('Об’єм'), t('{value} л', { value: num(engine.displacementCc / 1000, 1) })]);
  if (engine.isRotary) {
    rows.push([t('Секцій'), t('{count}, по 654 см³', { count: s.cylinders })]);
    rows.push([t('Спалахів за оберт вала'), String(s.cylinders)]);
  } else {
    rows.push([t('Діаметр і хід'), t('{bore} × {stroke} мм', { bore: num(s.bore, s.bore % 1 ? 1 : 0), stroke: num(s.stroke, s.stroke % 1 ? 1 : 0) })]);
    rows.push([t('Порядок запалювання'), s.firingOrder.join('-')]);
    rows.push([t('Спалах кожні'), intervalPattern(engine.intervals)]);
    if (s.exhaust.groups.length > 1 && s.exhaust.groups[0]!.length > 1) {
      rows.push([t('Спалахи в одному випуску'), intervalPattern(groupIntervals(engine, s.exhaust.groups[0]!))]);
    }
    rows.push([t('Шатунних шийок'), String(engine.throws.length)]);
    rows.push([t('Клапани'), `${s.valvesPerCyl * s.cylinders}, ${VALVETRAIN_NAMES[s.valvetrain]}`]);
  }
  rows.push([t('Ступінь стиснення'), `${num(s.compression, s.compression % 1 ? 1 : 0)} : 1`]);
  rows.push([t('Живлення'), s.fuel === 'diesel' ? t('дизель, {aspiration}', { aspiration: ASPIRATION_NAMES[s.aspiration] }) : t('бензин, {aspiration}', { aspiration: ASPIRATION_NAMES[s.aspiration] })]);
  if (s.systems) rows.push([t('Подача палива'), FUEL_SYSTEM_NAMES[s.systems.fuelSystem]], [t('Охолодження'), COOLING_NAMES[s.systems.cooling]]);
  rows.push([t('Межа обертів'), t('{rpm} об/хв', { rpm: num(s.redlineRpm) })]);
  return rows;
};

const BAL_LABELS: Array<[keyof ReturnType<typeof balance>, string, string]> = [
  ['force1', t('Сила, 1-й порядок'), t('Трусить двигун з частотою обертів')],
  ['force2', t('Сила, 2-й порядок'), t('Трусить удвічі частіше за оберти')],
  ['couple1', t('Момент, 1-й порядок'), t('Гойдає двигун навколо його центра')],
  ['couple2', t('Момент, 2-й порядок'), t('Гойдає двигун удвічі частіше')],
];

const balanceChart = (engine: Engine): string => {
  if (engine.isRotary) {
    return `<p class="note">${t('Ротор обертається, а не рухається туди-сюди, і зрівноважується противагами на ексцентриковому валу. Вільних сил майже немає, тому тут графіка немає.')}</p>`;
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
    <p class="note">${t('Пораховано з геометрії цього двигуна. Одиниця: сила інерції одного поршня. Моменти поділено ще й на відстань між циліндрами. Частину першого порядку, яку можуть прибрати противаги колінвала, вже вилучено.')}</p>`;
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
  const cycleLabel = engine.isRotary ? t('1080° вала') : t('720° вала');
  return `<svg viewBox="0 0 ${w} ${h}" class="torque-chart" role="img" aria-label="${t('Обертальний момент за цикл. Найбільше значення {max} середнього, найменше {min}.', { max: num(Math.max(...curve), 1), min: num(Math.min(...curve), 1) })}">
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${zero}" y2="${zero}" class="axis" />
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${mean}" y2="${mean}" class="grid-dash" />
    <polyline points="${points.join(' ')}" class="torque-line" />
    <text x="${w - pad.r}" y="${mean - 4}" text-anchor="end" class="chart-label">${t('середнє')}</text>
    <text x="${pad.l}" y="${zero - 4}" class="chart-label">0</text>
    <text x="${pad.l}" y="${h - 3}" class="chart-label">0°</text>
    <text x="${w - pad.r}" y="${h - 3}" text-anchor="end" class="chart-label">${cycleLabel}</text>
  </svg>
  <p class="note">${t('Момент на валу за цикл, відносно середнього: пік {peak}, мінімум {min}. Спрощена модель тиску в камері. Що рівніша лінія, то легший маховик потрібен двигуну.', { peak: num(Math.max(...curve), 1), min: num(Math.min(...curve), 1) })}</p>`;
};

const list = (items: string[]): string => items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');

export const siblingsOf = (spec: EngineSpec): EngineSpec[] => ENGINES.filter((e) => e.cylinders === spec.cylinders && e.id !== spec.id.split('/')[0]);

const FIELD_NAMES: Record<string, string> = {
  bore: t('діаметр'), stroke: t('хід'), compression: t('ступінь стиснення'), rodLength: t('довжину шатуна'), valvesPerCyl: t('кількість клапанів'),
  valvetrain: t('привод клапанів'), charger: t('тип наддуву'), boostBar: t('тиск наддуву'), directInjection: t('тип упорскування'), blockMaterial: t('матеріал блока'),
  fuel: t('паливо'), years: t('роки випуску'), redline: t('межу обертів'), idle: t('холостий хід'), powerHp: t('потужність'), powerRpm: t('оберти потужності'), torqueNm: t('момент'), torqueRpm: t('оберти моменту'),
  firingOrder: t('порядок запалювання'), numbering: t('нумерацію циліндрів'), veeAngle: t('кут розвалу'), firingIntervals: t('інтервали спалахів'), exhaust: t('характер вихлопу'),
  rotorR: t('радіус ротора'), rotorE: t('ексцентриситет'), rotorWidth: t('ширину ротора'),
  fuelSystem: t('систему живлення'), cooling: t('тип охолодження'), oilCooler: t('оливний радіатор'), pistonJets: t('охолодження поршнів оливою'), sparkPlugs: t('кількість свічок'), ignition: t('систему запалювання'), glowPlugs: t('свічки розжарювання'), oilPump: t('привід оливного насоса'), oilFilter: t('оливний фільтр'),
};

/** What this engine's exhaust is set to, in words, so the difference between engines of a page can be read as well as heard. */
function voiceText(s: EngineSpec): string {
  const open = s.exhaust.open;
  const silencer = open < 0.25 ? t('тихий дорожній випуск') : open < 0.45 ? t('звичайний дорожній випуск') : open < 0.7 ? t('спортивний випуск') : t('майже прямий гоночний випуск');
  const parts = [silencer];
  const turbo = s.aspiration === 'turbo' || s.aspiration === 'twin-turbo' || s.aspiration === 'quad-turbo';
  if (turbo) parts.push(s.turboWhine >= 0.8 ? t('гучний свист турбіни') : s.turboWhine >= 0.3 ? t('чутний свист турбіни') : t('свист турбіни ледь чутний'));
  if (turbo && s.fuel !== 'diesel') parts.push(s.blowoff >= 0.8 ? t('скид тиску в атмосферу') : s.blowoff > 0 ? t('тихий скид тиску') : t('скид тиску назад у впуск, без пшику'));
  if (s.exhaust.groups.length > 1) parts.push(t('випускні групи розділені'));
  if (s.fuel !== 'diesel') parts.push(s.pops >= 0.7 ? t('часті прострели') : s.pops >= 0.3 ? t('заводські прострели у спортивному режимі') : s.pops > 0 ? t('зрідка хлопки на скиданні газу') : t('без прострелів'));
  return t('Голос: {parts}.', { parts: parts.join(', ') });
}

/** The block about this exact engine, with the real figures it's compared against. */
const VOICE_EVIDENCE: Record<EngineFacts['voiceEvidence'], string> = {
  sourced: t('Свист, скид тиску й прострели взято з оглядів цього авто.'),
  owner: t('Свист, скид тиску й прострели взято зі слів власника цього авто.'),
  estimate: t('Свист, скид тиску й прострели оцінено за типом двигуна: окремих оглядів про це не знайшлося.'),
  default: t('Окремих свідчень про свист, скид тиску й прострели не знайшлося, тому взято тихе значення, типове для заводського авто.'),
};

function factsHtml(facts: EngineFacts, voice: string): string {
  const line = [facts.cars.join(', '), facts.years, facts.engineCode].filter(Boolean).join('; ');
  const figure = (value: number | null, unit: string, rpm: number | null): string =>
    value === null ? '' : rpm === null ? `${num(value)} ${unit}` : t('{value} {unit} при {rpm} об/хв', { value: num(value), unit, rpm: num(rpm) });
  const figures = [figure(facts.powerHp, t('к.с.'), facts.powerRpm), figure(facts.torqueNm, t('Н·м'), facts.torqueRpm)].filter(Boolean).join(', ');
  const about = [line, t('Заводські дані: {figures}', { figures })].filter(Boolean).join('. ');
  const unknown = facts.unverified.map((f) => FIELD_NAMES[f]).filter(Boolean);
  const verify = unknown.length ? `<p class="verify">${t('Не вдалося звірити з першоджерелом: {fields}.', { fields: unknown.join(', ') })}</p>` : '';
  const sources = facts.sources.length
    ? `<p class="note small">${t('Джерела: {links}', { links: facts.sources.slice(0, 5).map((url, i) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${i + 1}</a>`).join(', ') })}</p>`
    : '';
  return `<h3>${escapeHtml(facts.name)}</h3>
    ${facts.note ? `<p>${escapeHtml(facts.note)}</p>` : ''}
    <p>${escapeHtml(voice)} <span class="note small">${VOICE_EVIDENCE[facts.voiceEvidence]}</span></p>
    <p class="note">${escapeHtml(about)}.</p>${verify}${sources}`;
}

export function articleHtml(engine: Engine): string {
  const s = engine.spec;
  const a = s.article;
  const siblings = siblingsOf(s);
  const compare = siblings.length
    ? `<h3>${t('Порівняй звук')}</h3>
       <p class="note">${t('Двигун продовжить працювати на тих самих обертах.')}</p>
       <div class="sibling-list">${siblings.map((o) => `<a class="sibling" href="#/engines/${o.id}">${escapeHtml(o.title)}</a>`).join('')}</div>`
    : '';
  const verify = s.verifyNote ? `<p class="verify">${escapeHtml(s.verifyNote)}</p>` : '';
  const facts = engineFacts(s.id);
  const isVariant = s.id.includes('/');
  return `
    ${isVariant ? '' : `<p class="lead">${escapeHtml(a.lead)}</p>`}
    <dl class="figures">${figures(engine)
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join('')}</dl>
    ${verify}
    ${facts ? factsHtml(facts, voiceText(s)) : ''}
    <p>${t('{link} і подивитись, що зміниться.', { link: `<a class="sibling" href="#/designer/from/${s.id}">${t('Відкрити цей двигун у конструкторі')}</a>` })}</p>
    ${isVariant ? `<h2 class="layout-general">${t('Про цю компоновку загалом')}</h2><p class="lead">${escapeHtml(a.lead)}</p>` : ''}
    <h3>${t('Як це влаштовано')}</h3>
    <p>${escapeHtml(a.how)}</p>
    <h3>${isVariant ? t('Чому так звучить ця компоновка') : t('Чому він так звучить')}</h3>
    <p>${escapeHtml(a.sound)}</p>
    ${compare}
    <h3>${t('Вібрації')}</h3>
    ${balanceChart(engine)}
    <h3>${t('Рівномірність моменту')}</h3>
    ${torqueSvg(engine)}
    <div class="pros-cons">
      <div><h3>${t('Сильні сторони')}</h3><ul>${list(a.pros)}</ul></div>
      <div><h3>${t('Слабкі сторони')}</h3><ul>${list(a.cons)}</ul></div>
    </div>
    <h3>${t('Де трапляється')}</h3>
    <ul class="cars">${list(a.cars)}</ul>
    <p class="note small">${t('Цифри наведено для двигуна {example}. Звук синтезовано з кута колінвала, без записів справжнього двигуна, тому це модель, а не запис.', { example: escapeHtml(s.example) })}</p>
  `;
}
