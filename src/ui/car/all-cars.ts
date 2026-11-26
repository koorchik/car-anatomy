// The table "All cars" (the whole-car plan, navigation: the catalogues' tables open from the section's title row):
// every car record of the site, its layout and mass, and where it can be seen. A car of the overview opens whole;
// the others lead to the sections that already show them.

import { CAR_LIST } from '../../data/cars.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { PageIndex } from '../../vehicle/links.ts';
import { escapeHtml, sectionLinks } from './article.ts';
import { summaryLine } from './markup.ts';
import { OVERVIEW_CARS } from './overview-cars.ts';

export const allCarsHeadHtml = (): string => `<div>
        <h2>${t('Усі авто')}</h2>
        <p>${t('Справжні авто сайту. Цілком, з усіма системами разом, поки можна відкрити лише ті, кожна система яких уже має свою модель; решту видно в розділах.')}</p>
      </div>
      `;

export function allCarsHtml(current: string, pages: PageIndex): string {
  const rows = CAR_LIST.map((car) => {
    const whole = OVERVIEW_CARS.includes(car.id);
    const name = whole
      ? `<a class="card-engine${car.id === current ? ' active' : ''}" href="#/car/${escapeHtml(car.id)}">${escapeHtml(car.name)}</a>`
      : `<span>${escapeHtml(car.name)}</span>`;
    const links = sectionLinks(car, pages);
    return `<tr${car.id === current ? ' class="current"' : ''}>
        <td>${name}<br /><small>${escapeHtml(car.years)}</small></td>
        <td>${summaryLine(car)}</td>
        <td>${whole ? t('огляд цілком') : ''}${whole && links.length ? '<br />' : ''}${links.join('<br />')}</td>
      </tr>`;
  }).join('');
  return `<table class="car-table">
      <thead><tr><th>${t('Авто')}</th><th>${t('Компоновка й маса')}</th><th>${t('Де на сайті')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">${t('Маса за даними виробника; що саме вона включає, кожен пише по-своєму.')}</p>`;
}

/** For the title row: how many cars the site has. */
export const allCarsLabel = (): string => t('Усі авто: {n}', { n: CAR_LIST.length.toLocaleString(numberLocale) });
