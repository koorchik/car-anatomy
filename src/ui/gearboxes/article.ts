// The article about the gearbox: first the gearbox of the page's car (its figures from the teeth, what it is checked against, what
// could not be verified, the sources), then the layout in general, as on the engine pages.

import type { GearboxPage } from '../../drivetrain/catalogue.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { CarRecord } from '../../vehicle/car.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const list = (items: readonly string[]): string => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

export interface ArticleFacts {
  page: GearboxPage;
  car: CarRecord | null;
  /** Forward ratios and reverse as the factory teeth give them. */
  ratios: number[];
  reverse: number | null;
  finalDrive: number | null;
  /** The engine's page, its short name and power, for the link. */
  engine: { href: string; name: string; powerHp: number | null } | null;
  rollingRadiusMm: number | null;
}

export function gearboxArticleHtml(f: ArticleFacts): string {
  const record = f.page.base;
  const a = f.page.article;
  const p = record.published;
  const rows: Array<[string, string]> = [
    [t('Коробка'), escapeHtml(record.name)],
    [t('Передачі'), f.ratios.map((r) => num(r, 3)).join(' · ')],
  ];
  if (f.reverse !== null) rows.push([t('Задній хід'), num(f.reverse, 3)]);
  if (f.finalDrive !== null) rows.push([t('Головна передача'), num(f.finalDrive, 2)]);
  if (p.centreMm !== null) rows.push([t('Міжосьова відстань'), t('{mm} мм', { mm: num(p.centreMm) })]);
  if (p.ratedTorqueNm !== null) rows.push([t('Розрахунковий момент'), t('{nm} Н·м', { nm: num(p.ratedTorqueNm) })]);
  if (f.car) rows.push([t('Авто'), `${escapeHtml(f.car.name)}, ${escapeHtml(f.car.years)}`]);
  if (f.engine) {
    const power = f.engine.powerHp === null ? '' : t(', {hp} к.с.', { hp: num(f.engine.powerHp) });
    rows.push([t('Двигун'), `<a class="sibling" href="${f.engine.href}">${escapeHtml(f.engine.name)}</a>${power}`]);
  }
  if (f.car && f.rollingRadiusMm !== null) rows.push([t('Шини'), t('{size}, радіус кочення {mm} мм', { size: escapeHtml(f.car.tyre.size), mm: num(f.rollingRadiusMm) })]);
  const published = p.ratios.length ? `<p class="note">${t('Опубліковані числа: {ratios}. Числа вище пораховано із зубців, які ми відновили під них.', { ratios: p.ratios.map((r) => num(r, 3)).join(' · ') })}</p>` : '';
  const verify = record.verifyNote ? `<p class="verify">${escapeHtml(record.verifyNote)}</p>` : '';
  const sources = record.sources.length
    ? `<p class="note small">${t('Джерела: {links}', { links: record.sources.map((url, i) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${i + 1}</a>`).join(', ') })}</p>`
    : '';
  const general = a
    ? `<h2 class="layout-general">${t('Про цю компоновку загалом')}</h2>
      <p class="lead">${escapeHtml(a.lead)}</p>
      <h3>${t('Як це влаштовано')}</h3>
      <p>${escapeHtml(a.how)}</p>
      <p><button class="btn" type="button" data-demo="always-turning">${t('Показати: чому шестерні крутяться завжди')}</button></p>
      <h3>${t('Як звучить')}</h3>
      <p>${escapeHtml(a.sound)}</p>
      <div class="pros-cons">
        <div><h3>${t('Сильні сторони')}</h3><ul>${list(a.pros)}</ul></div>
        <div><h3>${t('Слабкі сторони')}</h3><ul>${list(a.cons)}</ul></div>
      </div>
      <h3>${t('Де трапляється')}</h3>
      <ul class="cars">${list(a.cars)}</ul>`
    : '';
  return `<h3>${escapeHtml(record.name)}${f.car ? ` · ${escapeHtml(f.car.name)}` : ''}</h3>
    <dl class="figures">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${published}
    ${verify}
    ${sources}
    <p class="note">${t('На столі коробка крутиться без авто: двигун крутить первинний вал, вторинний крутиться вільно, а передачі вмикаються одразу, без зчеплення. Так видно саму кінематику: що крутиться і з якою швидкістю.')}</p>
    ${general}`;
}
