// The article of the automatic's page: first the gearbox of the page's car (figures from its teeth, what they are
// checked against, what could not be verified, the sources), then the layout in general, as on the other pages.

import type { GearboxPage } from '../../../drivetrain/catalogue.ts';
import type { PlanetaryDesc } from '../../../drivetrain/layouts/planetary.ts';
import { numberLocale } from '../../../i18n/locale.ts';
import { t } from '../../../i18n/t.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const list = (items: readonly string[]): string => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

export interface AutomaticFacts {
  page: GearboxPage;
  desc: PlanetaryDesc;
  /** Forward ratios and reverse from the teeth. */
  ratios: number[];
  reverse: number;
  car: { name: string; years: string; finalDrive: number };
  engine: { href: string; name: string; powerHp: number | null };
}

export function automaticArticleHtml(f: AutomaticFacts): string {
  const record = f.page.base;
  const a = f.page.article;
  const p = record.published;
  const power = f.engine.powerHp === null ? '' : t(', {hp} к.с.', { hp: num(f.engine.powerHp) });
  const rows: Array<[string, string]> = [
    [t('Коробка'), escapeHtml(record.name)],
    [t('Передаточні числа'), f.ratios.map((r) => num(r, 3)).join(' · ')],
    [t('Задній хід'), num(f.reverse, 3)],
    [t('Головна передача'), num(f.car.finalDrive, 2)],
    [t('Ряди: зубці сонячної / коронної'), f.desc.sets.map((s) => `${s.sun}/${s.ring}`).join(' · ')],
    [t('Сателітів у рядах'), f.desc.sets.map((s) => String(s.planets)).join(' · ')],
  ];
  if (p.ratedTorqueNm !== null) rows.push([t('Розрахунковий момент'), t('{nm} Н·м', { nm: num(p.ratedTorqueNm) })]);
  rows.push([t('Автомобіль'), `${escapeHtml(f.car.name)}, ${escapeHtml(f.car.years)}`]);
  rows.push([t('Двигун'), `<a class="sibling" href="${f.engine.href}">${escapeHtml(f.engine.name)}</a>${power}`]);
  const published = `<p class="note">${t('Опубліковані числа: {ratios}, задній {reverse}. Зубці рядів дають їх до останнього знака.', { ratios: p.ratios.map((r) => num(r, 3)).join(' · '), reverse: num(p.reverse ?? 0, 3) })}</p>`;
  const verify = record.verifyNote ? `<p class="verify">${escapeHtml(record.verifyNote)}</p>` : '';
  const sources = `<p class="note small">${t('Джерела: {links}', { links: record.sources.map((url, i) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${i + 1}</a>`).join(', ') })}</p>`;
  const general = a
    ? `<h2 class="layout-general">${t('Про цю компоновку загалом')}</h2>
      <p class="lead">${escapeHtml(a.lead)}</p>
      <h3>${t('Як це влаштовано')}</h3>
      <p>${escapeHtml(a.how)}</p>
      <p><button class="btn" type="button" data-demo="matrix">${t('Показати: матриця 8HP')}</button></p>
      <h3>${t('Гідротрансформатор')}</h3>
      <p>${t('Між двигуном і коробкою стоїть гідротрансформатор: насосне колесо на двигуні жене оливу в лопатки турбінного колеса на вході коробки, а реактор між ними повертає оливу назад так, що вона допомагає насосу. Поки авто стоїть, турбіна стоїть, а двигун крутиться: тому автомат не глухне на передачі. На рушанні турбіна отримує більше моменту, ніж дає двигун, на зупинці в 1,81 раза. Коли турбіна наздоганяє насос, реактор відпускає муфта вільного ходу, а пізніше муфта блокування з’єднує двигун із коробкою майже без ковзання.')}</p>
      <p><button class="btn" type="button" data-demo="converter">${t('Показати: гідротрансформатор')}</button></p>
      <h3>${t('Як звучить')}</h3>
      <p>${escapeHtml(a.sound)}</p>
      <div class="pros-cons">
        <div><h3>${t('Сильні сторони')}</h3><ul>${list(a.pros)}</ul></div>
        <div><h3>${t('Слабкі сторони')}</h3><ul>${list(a.cons)}</ul></div>
      </div>
      <h3>${t('Де трапляється')}</h3>
      <ul class="cars">${list(a.cars)}</ul>`
    : '';
  return `<h3>${escapeHtml(record.name)} · ${escapeHtml(f.car.name)}</h3>
    <dl class="figures">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${published}
    ${verify}
    ${sources}
    <p class="note">${t('На столі коробка крутиться без авто: двигун крутить вхідний вал так, ніби муфта блокування гідротрансформатора замкнена, вихід крутиться вільно, а муфти й гальма замикаються одразу. Замикайте елементи кнопками A–E, і модель та номограма покажуть, що вони лишають.')}</p>
    ${general}`;
}
