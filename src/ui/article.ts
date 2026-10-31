// The knowledge panel: figures, explanation, and charts computed from the engine's own geometry.

import { ENGINES, engineFacts } from '../data/engines.ts';
import type { EngineFacts } from '../designer/catalogue.ts';
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

export const siblingsOf = (spec: EngineSpec): EngineSpec[] => ENGINES.filter((e) => e.cylinders === spec.cylinders && e.id !== spec.id.split('/')[0]);

const FIELD_NAMES: Record<string, string> = {
  bore: 'діаметр', stroke: 'хід', compression: 'ступінь стиснення', rodLength: 'довжину шатуна', valvesPerCyl: 'кількість клапанів',
  valvetrain: 'привод клапанів', charger: 'тип наддуву', boostBar: 'тиск наддуву', directInjection: 'тип упорскування', blockMaterial: 'матеріал блока',
  fuel: 'паливо', years: 'роки випуску', redline: 'межу обертів', idle: 'холостий хід', powerHp: 'потужність', powerRpm: 'оберти потужності', torqueNm: 'момент', torqueRpm: 'оберти моменту',
  firingOrder: 'порядок запалювання', numbering: 'нумерацію циліндрів', veeAngle: 'кут розвалу', firingIntervals: 'інтервали спалахів', exhaust: 'характер вихлопу',
  rotorR: 'радіус ротора', rotorE: 'ексцентриситет', rotorWidth: 'ширину ротора',
};

/** What this engine's exhaust is set to, in words, so the difference between engines of a page can be read as well as heard. */
function voiceText(s: EngineSpec): string {
  const open = s.exhaust.open;
  const silencer = open < 0.25 ? 'тихий дорожній випуск' : open < 0.45 ? 'звичайний дорожній випуск' : open < 0.7 ? 'спортивний випуск' : 'майже прямий гоночний випуск';
  const parts = [silencer];
  const turbo = s.aspiration === 'turbo' || s.aspiration === 'twin-turbo' || s.aspiration === 'quad-turbo';
  if (turbo) parts.push(s.turboWhine >= 0.8 ? 'гучний свист турбіни' : s.turboWhine >= 0.3 ? 'чутний свист турбіни' : 'свист турбіни ледь чутний');
  if (turbo && s.fuel !== 'diesel') parts.push(s.blowoff >= 0.8 ? 'скид тиску в атмосферу' : s.blowoff > 0 ? 'тихий скид тиску' : 'скид тиску назад у впуск, без пшику');
  if (s.exhaust.groups.length > 1) parts.push('випускні групи розділені');
  if (s.fuel !== 'diesel') parts.push(s.pops >= 0.7 ? 'часті прострели' : s.pops >= 0.3 ? 'заводські прострели у спортивному режимі' : s.pops > 0 ? 'зрідка хлопки на скиданні газу' : 'без прострелів');
  return `Голос: ${parts.join(', ')}.`;
}

/** The block about this exact engine, with the real figures it's compared against. */
const VOICE_EVIDENCE: Record<EngineFacts['voiceEvidence'], string> = {
  sourced: 'Свист, скид тиску й прострели взято з оглядів цього авто.',
  owner: 'Свист, скид тиску й прострели взято зі слів власника цього авто.',
  estimate: 'Свист, скид тиску й прострели оцінено за типом двигуна: окремих оглядів про це не знайшлося.',
  default: 'Окремих свідчень про свист, скид тиску й прострели не знайшлося, тому взято тихе значення, типове для заводського авто.',
};

function factsHtml(facts: EngineFacts, voice: string): string {
  const line = [facts.cars.join(', '), facts.years, facts.engineCode].filter(Boolean).join('; ');
  const figure = (value: number | null, unit: string, rpm: number | null): string =>
    value === null ? '' : `${num(value)} ${unit}${rpm === null ? '' : ` при ${num(rpm)} об/хв`}`;
  const figures = [figure(facts.powerHp, 'к.с.', facts.powerRpm), figure(facts.torqueNm, 'Н·м', facts.torqueRpm)].filter(Boolean).join(', ');
  const about = [line, `Заводські дані: ${figures}`].filter(Boolean).join('. ');
  const unknown = facts.unverified.map((f) => FIELD_NAMES[f]).filter(Boolean);
  const verify = unknown.length ? `<p class="verify">Не вдалося звірити з першоджерелом: ${unknown.join(', ')}.</p>` : '';
  const sources = facts.sources.length
    ? `<p class="note small">Джерела: ${facts.sources.slice(0, 5).map((url, i) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${i + 1}</a>`).join(', ')}</p>`
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
    ? `<h3>Порівняй звук</h3>
       <p class="note">Двигун продовжить працювати на тих самих обертах.</p>
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
    <p><a class="sibling" href="#/designer/from/${s.id}">Відкрити цей двигун у конструкторі</a> і подивитись, що зміниться.</p>
    ${isVariant ? `<h2 class="layout-general">Про цю компоновку загалом</h2><p class="lead">${escapeHtml(a.lead)}</p>` : ''}
    <h3>Як це влаштовано</h3>
    <p>${escapeHtml(a.how)}</p>
    <h3>${isVariant ? 'Чому так звучить ця компоновка' : 'Чому він так звучить'}</h3>
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
