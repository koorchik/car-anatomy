// Beside the gearbox page's title, as on the engine pages (gearboxes plan, the entry and pages section): the previous and the
// next layout, and the real gearboxes of this layout when it has more than one, each named by its car.

import { CARS } from '../../data/cars.ts';
import type { GearboxPage } from '../../drivetrain/catalogue.ts';
import { t } from '../../i18n/t.ts';

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The record's address: `#/gearboxes/<page>` or `#/gearboxes/<page>/<variant>` (the record id is page/variant). */
const href = (id: string): string => `#/gearboxes/${id}`;

/** Links to the previous and the next page among those a visitor can open, in their order, around the record `id`'s. */
export function pageStepsHtml(pages: readonly GearboxPage[], id: string): string {
  const at = pages.findIndex((p) => id === p.id || id.startsWith(`${p.id}/`));
  if (at < 0 || pages.length < 2) return '';
  return `<a class="btn" href="${href(pages[(at - 1 + pages.length) % pages.length]!.id)}" aria-label="${t('Попередня компоновка коробки')}">${t('Попередня')}</a>
    <a class="btn" href="${href(pages[(at + 1) % pages.length]!.id)}" aria-label="${t('Наступна компоновка коробки')}">${t('Наступна')}</a>`;
}

/** The real gearboxes of the record `id`'s page, base first, when it has more than one; the record's own marked. */
export function variantListHtml(page: GearboxPage, id: string): string {
  const records = [page.base, ...page.variants];
  if (records.length < 2) return '';
  return `<nav class="variant-list gbx-variants" aria-label="${t('Коробки цієї компоновки')}">${records
    .map((r) => {
      const car = r.car ? CARS[r.car] : undefined;
      const name = car ? `${car.name} · ${r.name}` : r.name;
      const current = r.id === id;
      return `<a class="variant${current ? ' active' : ''}" href="${href(r.id)}"${current ? ' aria-current="true"' : ''}>${escapeHtml(name)}</a>`;
    })
    .join('')}</nav>`;
}
