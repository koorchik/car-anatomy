// What the menu shows for a route, without the DOM: the sections in the plan's order, which of them are links and which
// still say 'coming soon', the tabs of each and the way back to the car the visitor came from. Built from the sections'
// registry (registry.ts), so a section that registers a page gets its item without touching the menu.

import { t } from '../i18n/t.ts';
import type { SectionEntry } from './registry.ts';
import { formatRoute, type Route, type SectionId } from './routes.ts';

/** The sections in the order of the top menu. */
export const MENU_ORDER: readonly SectionId[] = ['car', 'engines', 'gearboxes', 'suspensions'];

/** Sections the menu leaves out until they have a page, instead of showing 'coming soon': the car comes with its own stage. */
const HIDDEN_UNTIL_READY: readonly SectionId[] = ['car'];

const SECTION_LABELS: Record<SectionId, () => string> = {
  car: () => t('Авто'),
  engines: () => t('Двигуни'),
  gearboxes: () => t('Коробки передач'),
  suspensions: () => t('Підвіски'),
};

/** The tabs' names, `<section>/<key>` as the registry's pages name them. */
const TAB_LABELS: Record<string, () => string> = {
  'engines/catalogue': () => t('Каталог'),
  'engines/designer': () => t('Свій двигун'),
  'engines/sump': () => t('Олива на треку'),
  'gearboxes/catalogue': () => t('Каталог'),
  'gearboxes/designer': () => t('Своя коробка'),
  'suspensions/catalogue': () => t('Каталог'),
  'suspensions/designer': () => t('Своя підвіска'),
  'car/overview': () => t('Огляд'),
  'car/lift': () => t('На підйомнику'),
  'car/lap': () => t('Коло'),
  'car/drive': () => t('Їзда'),
  'car/designer': () => t('Зібрати авто'),
};

/** The system of the car a section's pages are about, for the way back: `#/car/<car>?focus=<system>`. */
const FOCUS: Partial<Record<SectionId, string>> = { engines: 'engine', gearboxes: 'gearbox', suspensions: 'suspension' };

export interface MenuTab {
  key: string;
  label: string;
  href: string;
  current: boolean;
}

export interface MenuItem {
  id: SectionId;
  label: string;
  /** Where the item leads; null while the section has no page yet ('coming soon'). */
  href: string | null;
  current: boolean;
  tabs: MenuTab[];
}

export function sectionLabel(id: SectionId): string {
  return SECTION_LABELS[id]();
}

/** A tab's name, or a key context's in the help of the keys ('engines/sump'). Undefined when there is none. */
export function tabLabel(key: string): string | undefined {
  return TAB_LABELS[key]?.();
}

/**
 * The menu for `route`. `link` turns a page's `#/…` into the href the menu gives it, so that the router can keep the
 * visitor's context (car=, ret=) on the way.
 */
export function menuItems(sections: readonly SectionEntry[], route: Route, link: (hash: string) => string = (hash) => hash): MenuItem[] {
  const items: MenuItem[] = [];
  for (const id of MENU_ORDER) {
    const entry = sections.find((s) => s.id === id);
    const pages = entry?.pages ?? [];
    if (!pages.length && HIDDEN_UNTIL_READY.includes(id)) continue;
    const here = route.section === id;
    const shown = here && entry ? (entry.tab?.(route) ?? route.page) : null;
    items.push({
      id,
      label: sectionLabel(id),
      href: pages.length ? link(pages[0]!.href) : null,
      current: here && pages.length > 0,
      tabs: pages.map((page) => ({ key: page.key, label: tabLabel(`${id}/${page.key}`) ?? page.key, href: link(page.href), current: page.key === shown })),
    });
  }
  return items;
}

/**
 * The section that shows a route, or null when none does: an unknown address, or a section not built yet. Here and
 * not in the registry, so that the shell's chunk does not pull the loader's list of sections into a chunk of its own.
 */
export function routeEntry(route: Route, sections: readonly SectionEntry[]): SectionEntry | null {
  return sections.find((s) => s.id === route.section) ?? null;
}

/** 'Back to the car': the overview of the car the visitor came from, with this section's system in focus. Null without car=. */
export function backToCar(route: Route): string | null {
  const car = route.query.car;
  if (!car || route.section === 'car' || route.section === 'not-found') return null;
  const focus = route.section === 'engines' && route.page === 'sump' ? 'oil' : FOCUS[route.section];
  return formatRoute({ section: 'car', page: 'overview', path: [car], query: focus ? { focus } : {} });
}
