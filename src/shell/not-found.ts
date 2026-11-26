// The card for an address no section shows: 'no such page', or, for a section still in the making, that it is
// coming. It never quietly shows the engines' home page instead, and it leads to every section of the menu.

import { t } from '../i18n/t.ts';
import { itemHtml, tabsHtml } from './menu.ts';
import { MENU_ORDER, type MenuItem } from './menu-model.ts';
import type { Route, SectionId } from './routes.ts';

export class NotFound {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** Shows the card for `route` with the menu's items as its links; null hides it. */
  show(route: Route | null, items: readonly MenuItem[] = []): void {
    this.root.hidden = route === null;
    if (!route) return;
    const coming = (MENU_ORDER as readonly string[]).includes(route.section);
    const $ = (id: string): HTMLElement => this.root.querySelector<HTMLElement>(`#${id}`)!;
    $('not-found-title').textContent = coming ? t('Цей розділ ще готуємо') : t('Такої сторінки немає');
    $('not-found-text').textContent = coming
      ? t('Сторінки цього розділу ще не готові. Поки що можна подивитися інші:')
      : t('За цією адресою нічого немає: можливо, посилання застаріло або в ньому помилка. Ось що є на сайті:');
    $('not-found-links').innerHTML = items
      .filter((item) => item.id !== (route.section as SectionId) || item.href !== null)
      .map((item) => `<div class="not-found-item">${itemHtml(item)}${item.tabs.length > 1 ? `<div class="not-found-tabs">${tabsHtml(item)}</div>` : ''}</div>`)
      .join('');
    this.root.querySelector<HTMLElement>('.not-found-links a')?.focus({ preventScroll: true });
  }
}
