// The menu on the page: the sections in the top bar, the tabs of the section shown over its page's name, 'Back to the car'
// when the visitor came from a car, and on a phone the sheet 'Sections' with all of them. What it shows comes from
// menu-model.ts; this module only draws it and keeps the sheet's focus.

import { t } from '../i18n/t.ts';
import { backToCar, menuItems, onCar, type MenuItem } from './menu-model.ts';
import type { SectionEntry } from './registry.ts';
import type { Router } from './router.ts';
import type { Route } from './routes.ts';
import type { MenuElements } from './skeleton.ts';

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

/** A section's item: a link, or its name with 'coming soon' while it has no page. */
export function itemHtml(item: MenuItem): string {
  if (item.href === null) return `<span class="soon">${esc(item.label)} <small>${t('готуємо')}</small></span>`;
  const current = item.current ? ' class="current" aria-current="page"' : '';
  return `<a href="${esc(item.href)}"${current}>${esc(item.label)}</a>`;
}

export function tabsHtml(item: MenuItem): string {
  return item.tabs.map((tab) => `<a href="${esc(tab.href)}"${tab.current ? ' class="current" aria-current="page"' : ''}>${esc(tab.label)}</a>`).join('');
}

export class ShellMenu {
  private readonly el: MenuElements;
  private readonly sections: readonly SectionEntry[];
  private readonly router: Router;
  /** What the menu was last drawn from, so that a route that changes nothing in it draws nothing. */
  private drawn = '';
  items: MenuItem[] = [];

  constructor(el: MenuElements, sections: readonly SectionEntry[], router: Router) {
    this.el = el;
    this.sections = sections;
    this.router = router;
    el.back.textContent = t('← До авто');
    el.sheetOpen.addEventListener('click', () => this.openSheet(true));
    el.sheetClose.addEventListener('click', () => this.openSheet(false));
    // A link to the page already shown changes no route, and the sheet must still close.
    el.sheetBody.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('a')) this.openSheet(false);
    });
    el.sheet.addEventListener('keydown', (event) => this.keepFocus(event));
  }

  get sheetOpen(): boolean {
    return !this.el.sheet.hidden;
  }

  /** Draws the menu for the route shown: which item and tab are current, the visitor's context on every link. */
  update(route: Route): void {
    const items = menuItems(this.sections, route, (hash) => this.router.link(hash));
    const back = backToCar(route);
    const on = back === null ? onCar(route) : null;
    const key = JSON.stringify([items, back, on]);
    if (key === this.drawn) return;
    this.drawn = key;
    this.items = items;
    const el = this.el;
    el.nav.innerHTML = items.map(itemHtml).join('');
    const here = items.find((item) => item.current);
    el.tabs.innerHTML = here && here.tabs.length > 1 ? tabsHtml(here) : '';
    el.tabs.hidden = el.tabs.innerHTML === '';
    // The same place says 'Back to the car' to a visitor who came from one, and 'On the car' on a page of a car's part.
    el.back.hidden = back === null && on === null;
    el.back.textContent = on ? t('На авто: {car} · ціле авто', { car: on.name }) : t('← До авто');
    if (back !== null) el.back.href = back;
    else if (on) el.back.href = on.href;
    el.sheetBody.innerHTML = [
      back === null ? '' : `<a class="sheet-back" href="${esc(back)}">${t('← До авто')}</a>`,
      ...items.map((item) => `<div class="sheet-section${item.current ? ' current' : ''}">${itemHtml(item)}${item.tabs.length > 1 ? `<div class="sheet-tabs">${tabsHtml(item)}</div>` : ''}</div>`),
    ].join('');
  }

  /** Opens or closes the sheet of sections. Focus goes into it, and back to its button when it closes. */
  openSheet(open: boolean): void {
    const el = this.el;
    if (open === this.sheetOpen) return;
    el.sheet.hidden = !open;
    el.sheetOpen.setAttribute('aria-expanded', String(open));
    // Focus goes to the page shown: its tab, else its section, else the first link. One selector list would take
    // whichever comes first in the sheet, and that is the section above its tabs.
    const body = el.sheetBody;
    if (open) (body.querySelector<HTMLElement>('.sheet-tabs a.current') ?? body.querySelector<HTMLElement>('a.current') ?? body.querySelector<HTMLElement>('a') ?? el.sheetClose).focus();
    else el.sheetOpen.focus();
  }

  /** Tab and Shift+Tab go round inside the open sheet. */
  private keepFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = [...this.el.sheet.querySelectorAll<HTMLElement>('a[href], button')].filter((e) => !e.hidden && e.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
