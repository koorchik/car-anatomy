// The pages of the suspension section (stage P4): which page and car a route opens (#/suspensions/<page>/<car>), their
// names, the line under the name, the list of the page's cars, and the block about the car that opens the article.

import { t } from '../../i18n/t.ts';
import { pageCar, SUSPENSION_PAGES, suspensionPage } from '../../data/suspensions.ts';
import type { PageCar, SuspensionPage } from '../../suspension-designer/page-cars.ts';
import type { SuspensionPageId } from '../../data/suspension-links.ts';

export interface PageChoice {
  page: SuspensionPage;
  car: PageCar | null;
}

/** The page and car a route's path names; the macpherson page for anything else, its own corner for an unknown car. */
export function choiceOf(path: readonly string[]): PageChoice {
  const page = suspensionPage(path[0] ?? '') ?? SUSPENSION_PAGES[0]!;
  return { page, car: path[1] ? (pageCar(page, path[1]) ?? null) : null };
}

/** The address of a page or one of its cars. */
export const choiceHref = (page: string, car: string | null = null): string => `#/suspensions/${page}${car ? `/${car}` : ''}`;

/** The path of a choice, as the router writes it. */
export const choicePath = (c: PageChoice): string[] => (c.car ? [c.page.id, c.car.link.car] : [c.page.id]);

/** The page `direction` steps away from `id`, round the catalogue. */
export function stepPage(id: string, direction: -1 | 1): SuspensionPage {
  const i = SUSPENSION_PAGES.findIndex((p) => p.id === id);
  return SUSPENSION_PAGES[(i + direction + SUSPENSION_PAGES.length) % SUSPENSION_PAGES.length]!;
}

export const pageName = (id: SuspensionPageId): string =>
  ({
    macpherson: t('Стійка Макферсон'),
    'double-wishbone': t('Подвійні поперечні важелі'),
    multilink: t('Багаторичажна підвіска'),
    'trailing-arm': t('Поздовжні важелі'),
    'semi-trailing': t('Косі важелі'),
    'swing-axle': t('Хитний міст'),
    pushrod: t('Штовхач і коромисло'),
  })[id];

/** The line under a page's own name: where its corner sits and what kind of geometry it is. */
const baseSubtitle = (id: SuspensionPageId): string =>
  ({
    macpherson: t('Передня підвіска компактного передньопривідного авто'),
    'double-wishbone': t('Передня підвіска задньопривідного авто · типова геометрія'),
    multilink: t('Задня підвіска задньопривідного авто · п’ять тяг · типова геометрія'),
    'trailing-arm': t('Задня підвіска передньопривідного авто · вісь хитання поперек авто · типова геометрія'),
    'semi-trailing': t('Задня підвіска задньопривідного авто · вісь хитання під кутом · типова геометрія'),
    'swing-axle': t('Задня підвіска авто з двигуном ззаду · вісь хитання вздовж авто · типова геометрія'),
    pushrod: t('Передня підвіска гоночного авто · пружина в кузові, третя пружина · типова геометрія'),
  })[id];

export const endLabel = (end: 'F' | 'R'): string => (end === 'F' ? t('Передня підвіска') : t('Задня підвіска'));

export function titleOf(c: PageChoice): { title: string; sub: string } {
  if (!c.car) return { title: pageName(c.page.id), sub: baseSubtitle(c.page.id) };
  const { name, years, end } = c.car.link;
  return { title: name, sub: `${pageName(c.page.id)} · ${endLabel(end)} · ${years}` };
}

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** The list under the title: the page's own corner and its cars, the one shown marked. */
export function carsHtml(c: PageChoice): string {
  const item = (href: string, text: string, current: boolean): string =>
    `<a class="susp-car${current ? ' current' : ''}" href="${href}"${current ? ' aria-current="page"' : ''}>${escapeHtml(text)}</a>`;
  return [
    item(choiceHref(c.page.id), c.page.base.geometry === 'measured' ? t('Виміряна JTEKT') : t('Типова'), !c.car),
    ...c.page.cars.map((car) => item(choiceHref(c.page.id, car.link.car), car.link.name, c.car === car)),
  ].join('');
}

/** What an unverified key of a car names, for the article. */
const unverifiedName = (key: string): string =>
  ({
    massKg: t('маса'),
    frontShare: t('розподіл ваги між осями'),
    cgHeightMm: t('висота центра мас'),
    trackMmF: t('колія спереду'),
    trackMmR: t('колія ззаду'),
    'tyre size': t('розмір шин'),
    'suspension layout': t('опис підвіски'),
    kingpinOffsetMmF: t('плече осі повороту кулака'),
    kpiDegF: t('нахил осі повороту кулака'),
    layoutF: t('тип передньої підвіски'),
    barMmF: t('передній стабілізатор'),
    barMmR: t('задній стабілізатор'),
    wheelbaseMm: t('колісна база'),
    springNmmF: t('пружини'),
    thirdSpringNmmF: t('треті пружини'),
  })[key] ?? key;

const source = (href: string): string => {
  const host = href.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]!;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(host)}</a>`;
};

/** The block about the car, before the article about the layout. */
export function carBlockHtml(car: PageCar): string {
  const engine = car.link.engine;
  return `<section class="susp-car-block">
      <h3>${escapeHtml(car.link.name)}</h3>
      <ul class="susp-facts">${car.facts.map((f) => `<li>${f}</li>`).join('')}</ul>
      ${engine ? `<p><a class="sibling" href="#/engines/${engine}">${t('Двигун цього авто')}</a></p>` : ''}
      <p class="susp-note">${t('Точки кріплення важелів — типова геометрія цієї компоновки, поставлена на колію й шини авто: виробники їх не публікують. Пружини, амортизатори й стабілізатори теж типові.')}</p>
      ${car.unverified.length ? `<p class="susp-note">${t('Не звірено: {list}.', { list: car.unverified.map(unverifiedName).join(', ') })}</p>` : ''}
      <p class="susp-note">${t('Джерела: {list}.', { list: car.sources.map(source).join(', ') })}</p>
    </section>
    <h2 class="susp-general">${t('Про цю компоновку загалом')}</h2>`;
}
