// The table of all suspensions (suspensions plan, what each page has): every layout with a page, each with its glyph — the front view
// computed from the page's own corner, with the links, the wheel and the roll centre — and short numbers: the camber
// gained over 25 mm of bump, the roll centre's height and the unsprung mass of a corner; under them the page's cars.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { SUSPENSION_PAGES } from '../../data/suspensions.ts';
import type { SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { Axle, newCornerSample } from '../../suspension/kinematics.ts';
import { POSE_SIZE } from '../../suspension/solve.ts';
import { tyreVertical } from '../../vehicle/tyre-data.ts';
import { frontViewSvg } from './front-view.ts';
import { choiceHref, pageName, type PageChoice } from './pages.ts';

const DEG = 180 / Math.PI;
const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (v: number, digits: number): string => {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${fmt(r, digits)}` : r < 0 ? `−${fmt(-r, digits)}` : fmt(0, digits);
};
const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const allTableHeadHtml = (): string => `<div>
        <h2>${t('Усі підвіски')}</h2>
        <p>${t('Кожна компоновка зі своїми реальними авто. Значок — вид спереду, обчислений з точок кріплення: ланки, колесо, лінія від плями контакту через миттєвий центр і центр крену на середині авто.')}</p>
      </div>
      `;

/** A page's card: glyph, numbers, cars. Its corner is built here, so the table costs its pages only when opened. */
function cardHtml(page: SuspensionPage, current: PageChoice): string {
  const corner = page.base.corner();
  const axle = new Axle(corner.axle);
  const pose = new Float64Array(POSE_SIZE);
  const s = newCornerSample();
  axle.tablePose(0, pose);
  axle.measure(pose, 0, 0, s);
  const tyre = tyreVertical(corner.tyre);
  const radius = corner.tyreRadiusM ?? tyre.freeRadiusM;
  const glyph = frontViewSvg(
    { axle, pose, sample: s, rack: 0, radiusM: radius, tyreWidthM: tyre.widthM },
    { width: 150, className: 'susp-glyph', label: t('Вид спереду: {name}', { name: pageName(page.id) }) },
  );
  const row = (label: string, value: string): string => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const cars = page.cars
    .map((car) => `<li><a class="card-engine${current.car === car ? ' active' : ''}" href="${choiceHref(page.id, car.link.car)}">${escapeHtml(car.link.name)}</a></li>`)
    .join('');
  return `<section class="susp-layout-card${page.id === current.page.id ? ' current' : ''}">
      <a class="susp-layout-head" href="${choiceHref(page.id)}">
        ${glyph}
        <span class="susp-layout-name">${pageName(page.id)}</span>
      </a>
      <dl class="susp-layout-numbers">
        ${row(t('Розвал на 25 мм стиску'), `${signed(s.camberGain * 0.025 * DEG, 2)}°`)}
        ${row(t('Центр крену'), t('{value} мм', { value: fmt(s.rcHeight * 1000, 0) }))}
        ${row(t('Непідресорена маса кута'), t('{value} кг', { value: fmt(corner.unsprungKg, 0) }))}
      </dl>
      <ul class="susp-layout-cars">${cars}</ul>
    </section>`;
}

export function allTableHtml(current: PageChoice): string {
  return `<div class="susp-layout-grid">${SUSPENSION_PAGES.map((p) => cardHtml(p, current)).join('')}</div>
    <p class="susp-note">${t('Цифри — для власної геометрії сторінки (у Макферсона виміряної JTEKT, в інших типової) у проєктному положенні. Інші компоновки — поздовжні й косі важелі, хитний міст, скручувана балка, нерозрізні мости — отримають свої сторінки згодом.')}</p>`;
}
