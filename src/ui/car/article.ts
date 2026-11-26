// The article "About this car" beside the overview (the whole-car plan, what the visitor sees, item 6): the layout and why
// it is so, the facts of the record with its sources, what could not be verified, where else on the site this car is,
// and "Other layouts": the other cars of the overview with another layout. Every figure is the record's own.

import { carById } from '../../data/cars.ts';
import { engineFacts } from '../../data/engines.ts';
import { GEARBOX_PAGE_NAMES } from '../../data/gearbox-names.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { CarRecord } from '../../vehicle/car.ts';
import { carLinks, type PageIndex } from '../../vehicle/links.ts';
import { summaryLine } from './markup.ts';
import { OVERVIEW_CARS } from './overview-cars.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A suspension page's name, as the suspension pages name themselves. */
export const suspensionPageName = (page: string): string =>
  ({ macpherson: t('Стійка Макферсон'), 'double-wishbone': t('Подвійні поперечні важелі'), multilink: t('Багаторичажна підвіска') })[page] ?? page;

/** Why the car is laid out as it is: a paragraph per layout. */
function layoutText(car: CarRecord): string {
  const { position, axis } = car.mount;
  if (position === 'front' && axis === 'transverse' && car.drive === 'fwd')
    return t('Двигун стоїть поперек над передніми колесами, коробка поруч із ним, а головна передача в тому самому картері, тож від коробки одразу йдуть піввісі. Увесь силовий агрегат уміщується між передніми колесами, тому салон виходить довгим при короткому кузові, а карданного вала й заднього моста немає зовсім. Плата за це — тіснота спереду: двигун із коробкою займають ширину, куди мали б повертатися колеса, тож кут повороту коліс обмежений. Передні колеса водночас тягнуть і кермують, тож потужне авто відчуває тягу на кермі.');
  if (position === 'front' && axis === 'longitudinal')
    return t('Двигун стоїть уздовж спереду, коробка позаду нього, а кардан несе обертання до заднього моста. Так маса розподіляється між осями рівніше, а передні колеса лише кермують, але кардан забирає місце в салоні.');
  if (position === 'rear')
    return t('Двигун стоїть ззаду, за задньою віссю, а коробка перед ним. Вага над ведучими колесами дає добре зчеплення на розгоні, але перед легкий, і авто вимагає уважності на межі.');
  if (position === 'mid')
    return t('Двигун стоїть між салоном і задньою віссю. Найважча частина авто ближче до центра мас, тож авто легко повертає, але місця для людей і багажу менше.');
  return t('Компоновка авто: де стоїть двигун і які колеса він крутить.');
}

/** What an unverified path of the record names, for the article. */
const unverifiedName = (path: string): string =>
  ({
    massBasis: t('що саме включає маса'),
    mount: t('куди дивиться двигун'),
    'body.frontShare': t('розподіл ваги між осями'),
    'body.cgHeightM': t('висота центра мас'),
    'body.trackFrontM': t('колія спереду'),
    'body.trackRearM': t('колія ззаду'),
    'dimensions.frontOverhangM': t('звис спереду'),
    'dimensions.rearOverhangM': t('звис ззаду'),
    'dimensions.profile': t('профіль кузова'),
    'packaging.crankFront': t('де стоїть двигун'),
    'packaging.bay': t('межі моторного відсіку'),
    'packaging.exhaustExit.at': t('де зріз вихлопу'),
    'packaging.fuelTank': t('де бак'),
    'packaging.radiator': t('де радіатор'),
    'packaging.intercooler': t('де інтеркулер'),
  })[path] ?? path;

const source = (href: string): string => {
  const host = href.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]!;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(host)}</a>`;
};

/** The pages of this car in the sections, as links. */
export function sectionLinks(car: CarRecord, pages: PageIndex): string[] {
  return carLinks(car, pages)
    .filter((link) => link.section !== 'car')
    .map((link) => {
      const text = {
        engines: () => t('Двигун: {name}', { name: escapeHtml(engineFacts(car.engine)?.engineCode ?? car.engine) }),
        sump: () => t('Олива на треку'),
        gearboxes: () => t('Коробка: {name}', { name: escapeHtml(GEARBOX_PAGE_NAMES[link.target] ?? link.target) }),
        suspensions: () => `${link.target === car.suspension?.front ? t('Підвіска спереду') : t('Підвіска ззаду')}: ${escapeHtml(suspensionPageName(link.target))}`,
        car: () => '',
      }[link.section]();
      return `<a class="sibling" href="${escapeHtml(link.href)}">${text}</a>`;
    });
}

export function carArticleHtml(car: CarRecord, pages: PageIndex): string {
  const rows: Array<[string, string]> = [[t('Компоновка'), summaryLine(car)]];
  rows.push([t('Роки'), escapeHtml(car.years)]);
  rows.push([t('Маса'), car.massBasis === 'kerb' ? t('{kg} кг, споряджена', { kg: num(car.massKg) }) : t('{kg} кг', { kg: num(car.massKg) })]);
  const d = car.dimensions;
  if (d) rows.push([t('Довжина, ширина, висота'), t('{l} × {w} × {h} мм', { l: num(d.lengthM * 1000), w: num(d.widthM * 1000), h: num(d.heightM * 1000) })]);
  rows.push([t('Колісна база'), t('{mm} мм', { mm: num(car.body.wheelbaseM * 1000) })]);
  rows.push([t('Шини'), escapeHtml(car.tyre.sizeRear ? `${car.tyre.size} / ${car.tyre.sizeRear}` : car.tyre.size)]);
  const facts = engineFacts(car.engine);
  if (facts?.powerHp) rows.push([t('Потужність'), t('{hp} к.с.', { hp: num(facts.powerHp) })]);
  const p = car.published;
  rows.push([t('Максимальна швидкість'), t('{kmh} км/год', { kmh: num(p.vmaxKmh) })]);
  if (p.zeroTo100S !== null) rows.push([t('Розгін 0–100 км/год'), t('{s} с', { s: num(p.zeroTo100S, 1) })]);
  const links = sectionLinks(car, pages);
  const others = OVERVIEW_CARS.map((id) => carById(id)!).filter((other) => other.id !== car.id && summaryLine(other) !== summaryLine(car));
  return `<h3>${escapeHtml(car.name)}</h3>
    <p class="lead">${layoutText(car)}</p>
    <dl class="figures">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <p class="note">${t('Клацни систему на моделі або кнопку під назвою: камера наблизиться до неї, решта авто поблідне, а картка покаже її числа й поведе в її розділ саме з цим авто.')}</p>
    ${links.length ? `<h3>${t('Це авто в розділах')}</h3><ul class="car-links">${links.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
    ${others.length ? `<h3>${t('Як ще буває')}</h3><ul class="car-links">${others.map((o) => `<li><a class="sibling" href="#/car/${escapeHtml(o.id)}">${escapeHtml(o.name)}</a>: ${summaryLine(o)}</li>`).join('')}</ul>` : ''}
    <p class="note">${t('Точки компоновки (де стоять двигун, бак, радіатор, зріз вихлопу), звиси й профіль кузова виробники здебільшого не публікують: їх оцінено за кресленнями й фотографіями.')}</p>
    ${car.unverified.length ? `<p class="verify">${t('Не звірено: {list}.', { list: car.unverified.map(unverifiedName).join(', ') })}</p>` : ''}
    ${car.sources.length ? `<p class="note small">${t('Джерела: {list}.', { list: car.sources.map(source).join(', ') })}</p>` : ''}`;
}
