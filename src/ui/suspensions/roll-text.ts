// What the roll scene says (suspensions plan, the roll scene): its numbers, the captions the model gives (how the
// understeer changed with the bars, which inner wheel left the road and why), the legend of the load bars, and the
// article's block that sets Chrysler's measurement of the roll centre beside the rigid model (step 6). Text only; the
// numbers come from the scene.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { LOAD_SHARE } from '../../scene/palette.ts';
import type { InertiaSource } from '../../suspension-designer/roll-cars.ts';
import { axleTransfer, type RollState } from '../../suspension/roll.ts';

const G = 9.81;
const DEG = 180 / Math.PI;

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');
const signed = (v: number, digits: number): string => {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${fmt(r, digits)}` : r < 0 ? `−${fmt(-r, digits)}` : fmt(0, digits);
};
const pct = (share: number): string => fmt(Math.round(share * 100), 0);

export interface RollRow {
  id: string;
  label: string;
  value: string;
  alarm?: boolean;
}

/** What the numbers need besides the state. */
export interface RollFacts {
  /** Steady roll per g of this car, rad per m/s². */
  gradient: number;
  /** Axles the view shows (0 front, 1 rear) and the roll centre of each above the road, m (NaN: none). */
  axles: ReadonlyArray<0 | 1>;
  rollCentres: readonly number[];
  /** The body's rise at the shown axles from where it stands at rest, m. */
  jackM: number;
  staticN: readonly number[];
}

export const axleName = (k: 0 | 1): string => (k === 0 ? t('передня') : t('задня'));

/** The scene's numbers for one moment. */
export function rollRows(s: RollState, f: RollFacts): RollRow[] {
  const f0 = axleTransfer(s, 0);
  const f1 = axleTransfer(s, 1);
  const share = f0 + f1 > 1 ? f0 / (f0 + f1) : Number.NaN;
  const rows: RollRow[] = [
    { id: 'ay', label: t('Бокове прискорення'), value: t('{value} g', { value: fmt(s.ay / G, 2) }) },
    { id: 'roll', label: t('Крен кузова'), value: t('{deg}° ({grad}°/g)', { deg: fmt(Math.abs(s.roll) * DEG, 1), grad: fmt(f.gradient * G * DEG, 1) }) },
    { id: 'share', label: t('Перенесення спереду'), value: Number.isFinite(share) ? `${pct(share)} %` : '—' },
  ];
  f.axles.forEach((k, n) => {
    const rc = f.rollCentres[n]!;
    const label = f.axles.length > 1 ? t('Центр крену, {axle} вісь', { axle: axleName(k) }) : t('Центр крену');
    rows.push({ id: `rc-${k}`, label, value: Number.isFinite(rc) ? t('{value} мм', { value: fmt(rc * 1000, 0) }) : '—' });
  });
  rows.push({ id: 'jack', label: t('Підйом кузова'), value: t('{value} мм', { value: signed(f.jackM * 1000, 1) }) });
  const k = f.axles[0]!;
  rows.push({ id: 'camber', label: t('Розвал зовнішнього до дороги'), value: `${signed(s.camberRoad[2 * k + 1]! * DEG, 2)}°` });
  for (const a of f.axles) {
    const inner = s.fz[2 * a]!;
    const outer = s.fz[2 * a + 1]!;
    rows.push({
      id: `load-${a}`,
      label: f.axles.length > 1 ? t('Колеса, {axle} вісь', { axle: axleName(a) }) : t('Внутрішнє / зовнішнє колесо'),
      value: t('{inner} / {outer} кН', { inner: fmt(inner / 1000, 2), outer: fmt(outer / 1000, 2) }),
      alarm: inner <= 1,
    });
  }
  return rows;
}

/** Understeer as the model gives it, rad per g, and the front's share of the transfer it comes from. */
export interface UndersteerFacts {
  now: number;
  factory: number;
  share: number;
  factoryShare: number;
  /** The bars differ from the car's own. */
  changed: boolean;
}

/** The model's line on the understeer and where it comes from (step 3). */
export function understeerCaption(u: UndersteerFacts): string {
  const now = fmt(u.now * DEG, 1);
  const head = !u.changed || Math.abs(u.now - u.factory) * DEG < 0.05
    ? t('Недостатня поворотність {us}°/g: передня вісь бере {share} % перенесення ваги.', { us: now, share: pct(u.share) })
    : t('Недостатня поворотність {us}°/g замість {us0}°/g із заводськими стабілізаторами: передня вісь бере {share} % перенесення замість {share0} %.', {
        us: now,
        us0: fmt(u.factory * DEG, 1),
        share: pct(u.share),
        share0: pct(u.factoryShare),
      });
  const why = t('Шина з більшим навантаженням тримає менше на кожен кілоньютон, тож вісь, яка бере більшу частку, потребує більшого кута відведення.');
  const turn = u.changed && Math.abs(u.now - u.factory) * DEG >= 0.05
    ? u.now > u.factory
      ? ' ' + t('Авто охочіше йде прямо, ніж повертає.')
      : ' ' + t('Авто повертає охочіше, а задня вісь ближча до заносу.')
    : '';
  const over = u.now < 0 ? ' ' + t('Від’ємне число — надмірна поворотність: задні шини потребують більшого кута, ніж передні.') : '';
  // The model's tyres are one set on both axles and it has no compliance, which gives a road car most of its understeer
  // (docs/research/suspensions.md, GM do Brasil): only the change is the model's to tell.
  const model = ' ' + t('Модель ставить однакові шини на обидві осі й не має податливості підвіски та керма, яка в серійного авто дає більшу частину недостатньої поворотності. Тож важить, як змінюється число, а не саме число.');
  return `${head} ${why}${turn}${over}${model}`;
}

/** What happens to the inner wheels, if anything worth a line: off the road, or past what the tyres hold. */
export function wheelsCaption(s: RollState, staticN: readonly number[], frontDriven: boolean): string {
  const f0 = axleTransfer(s, 0);
  const f1 = axleTransfer(s, 1);
  const total = f0 + f1;
  const front = s.fz[0]! <= 1;
  const rear = s.fz[2]! <= 1;
  const lines: string[] = [];
  if (front && rear) lines.push(t('Обидва внутрішні колеса в повітрі: авто стає на два колеса.'));
  else if (rear) {
    lines.push(t('Внутрішнє заднє колесо в повітрі: задня вісь бере {share} % перенесення, а в статиці воно мало лише {kn} кН.', { share: pct(f1 / total), kn: fmt(staticN[2]! / 1000, 1) }));
  } else if (front) {
    lines.push(t('Внутрішнє переднє колесо в повітрі: передня вісь бере {share} % перенесення, а в статиці воно мало {kn} кН.', { share: pct(f0 / total), kn: fmt(staticN[0]! / 1000, 1) }));
    if (frontDriven) lines.push(t('На передньопривідному авто воно першим почало б буксувати під газом.'));
  }
  if (s.impossible) lines.push(t('Шини такої бічної сили вже не дають: справжнє авто ковзало б раніше. Сцена задає прискорення сама, щоб показати, куди йде вага.'));
  return lines.join(' ');
}

/** The legend of the load bars. */
export const loadLegendHtml = (): string => `<ul class="susp-load-legend">
    <li><i style="--c: ${LOAD_SHARE.static}"></i>${t('навантаження в статиці')}</li>
    <li><i style="--c: ${LOAD_SHARE.geometric}"></i>${t('через важелі, миттєво')}</li>
    <li><i style="--c: ${LOAD_SHARE.elastic}"></i>${t('пружини й стабілізатор, потребує крену')}</li>
    <li><i style="--c: ${LOAD_SHARE.unsprung}"></i>${t('непідресорені маси')}</li>
  </ul>
  <p class="susp-note">${t('Стовпчик над колесом — навантаження шини: 1 кН = 40 мм. Що додалося, стоїть кольором зверху, а що забрано, лишається блідим контуром до рівня статики (риска).')}</p>`;

/** Where the car's inertias come from, for the note under the scene. */
export const inertiaNote = (source: InertiaSource): string =>
  source === 'nhtsa'
    ? t('Маса, центр мас і моменти інерції цього авто виміряла NHTSA.')
    : source === 'maker'
      ? t('Моменти інерції від виробника.')
      : t('Моменти інерції оцінено з маси, бази й колії за середніми відношеннями шістнадцяти авто, які виміряла NHTSA.');

/** The article's block on what the roll centre's height means: Chrysler's measurement and the rigid model (step 6). */
export function chryslerHtml(model: { heightMm: number; gradient: number }[]): string {
  const base = model[0]!.gradient;
  const rows = model
    .map((m, i) => {
      // Chrysler gives one range for all three heights.
      const measured = i === 0 ? `<td rowspan="${model.length}">${fmt(4.43, 2)}–${fmt(4.46, 2)}</td>` : '';
      const change = i === 0 ? '' : ` (${signed(((m.gradient - base) / base) * 100, 0)} %)`;
      return `<tr><td>${fmt(m.heightMm, 0)}</td>${measured}<td>${fmt(m.gradient * G * DEG, 2)}${change}</td></tr>`;
    })
    .join('');
  return `<section class="susp-roll-article">
      <h3>${t('Що насправді означає висота центра крену')}</h3>
      <p>${t('Центр крену — це побудова: лінії від плям контакту через миттєві центри. Жорстка модель зі сталими пружинами каже, що чим вище центр крену, тим менше плече бічної сили до осі крену і тим менший крен.')}</p>
      <p>${t('Chrysler перевірив це на справжньому авто: передній центр крену ставили на 0, 65 і 132 мм, не змінюючи пружин і стабілізаторів. Усталений крен не змінився, недостатня поворотність майже теж (2,7–2,9°/g). Змінилася швидкість крену в різкому маневрі, 8,2–9,6°/с, і водії це помітили.')}</p>
      <table class="susp-roll-table">
        <thead><tr><th>${t('Передній центр крену, мм')}</th><th>${t('Chrysler, вимір, °/g')}</th><th>${t('Жорстка модель цього авто, °/g')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>${t('Модель на цьому екрані рахує те саме авто з іншим переднім центром крену й дає менший усталений крен. Розбіжність не означає, що вимір хибний: у моделі немає податливості сайлентблоків і шин, а силовий центр крену відрізняється від кінематичного. Тож підпис сцени не каже, що крен не залежить від центра крену, але й не обіцяє, що високий центр крену його прибере.')}</p>
      <p class="susp-note">${t('Джерело виміру: Lukianov, Singh, «Vehicle Roll Centers and Roll Axis Examined Again» (Chrysler, 2008).')} <a href="http://ftp.demec.ufpr.br/disciplinas/TMEC078/Bibliografia/suspensao/Vehicle%20Roll%20Centers%20and%20Roll%20Axis%20Examined%20Again.pdf" target="_blank" rel="noopener">PDF</a></p>
    </section>`;
}
