// The gearbox section as the shell sees it: one Section that hands each address to the page that shows it. The
// manual pages (layshaft) are GearboxSection; a page with a section of its own (the planetary automatic, stage K11)
// is listed in OWN_PAGES and loads as a chunk of its own the first time its address is opened. Each page is mounted
// then, into the same slots, and what it put there is hidden while another page of the section shows, the way the
// shell hides other sections (section-dom.ts): a page gets its elements back exactly as it left them.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import { t } from '../../i18n/t.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import { GearboxSection } from './section.ts';

/** The attribute that hides an element of a gearbox page not shown (gearboxes.css). */
export const PAGE_AWAY = 'data-gbx-page-away';

/** Pages with a section of their own, by the id in `#/gearboxes/<page>`. */
const OWN_PAGES: Record<string, () => Promise<GearboxPage>> = {
  automatic: async () => {
    const { AutomaticSection } = await withDictionaries(['engines', 'gearboxes', 'gearbox-parts', 'gearbox-automatic'], () => import('./automatic/section.ts'));
    return new AutomaticSection();
  },
};

type GearboxPage = Section & { readonly drive?: unknown };

export class GearboxPages implements Section {
  readonly id = 'gearboxes' as const;
  readonly solidLabel = t('Коробка');
  private ctx!: SectionContext;
  private places: HTMLElement[] = [];
  /** Elements in the places before any page mounted: the skeleton's and other sections'. */
  private readonly foreign = new Set<Element>();
  private readonly owners = new Map<Element, string>();
  private readonly pages = new Map<string, GearboxPage>();
  /** Pages whose chunk is on its way, and the address that asked last. */
  private readonly loading = new Set<string>();
  private wanted: { route: Route; from: Route | null } | null = null;
  private current: { key: string; page: GearboxPage } | null = null;
  /** The section is not shown: its page has left already. */
  private away = false;
  /** The manual pages' section, which the window's hooks (window.__engine.gearbox) reach. */
  manual: GearboxSection | null = null;

  /** The one Drive, as the page shown uses it. */
  get drive(): unknown {
    return this.current?.page.drive ?? null;
  }

  /** The page shown. */
  get page(): Section | null {
    return this.current?.page ?? null;
  }

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    const s = ctx.slots;
    this.places = [s.backdrop, s.actions, s.title, s.tools, s.status, s.panel, s.results, s.dash, s.afterDash].map((slot) => slot.parent);
    this.places.push(s.root);
    for (const place of this.places) for (const el of Array.from(place.children)) this.foreign.add(el);
  }

  enter(route: Route, from: Route | null): void {
    const key = this.keyOf(route);
    this.wanted = { route, from };
    let fromForPage = from;
    if (this.current?.key !== key) {
      if (this.current && !this.away) this.current.page.leave(route);
      this.current = null;
      let page = this.pages.get(key);
      if (!page && key !== 'manual') {
        // The page's chunk first; the page shown meanwhile has left and its elements are hidden.
        this.show(key);
        this.away = false;
        if (!this.loading.has(key)) {
          this.loading.add(key);
          void OWN_PAGES[key]!().then((loaded) => {
            this.loading.delete(key);
            this.pages.set(key, loaded);
            loaded.mount(this.ctx);
            this.claim(key);
            const wanted = this.wanted;
            if (wanted && !this.away && this.keyOf(wanted.route) === key) this.enter(wanted.route, wanted.from);
            else this.show(this.current?.key ?? '');
          });
        }
        return;
      }
      if (!page) {
        page = this.manual = new GearboxSection();
        this.pages.set(key, page);
        page.mount(this.ctx);
        this.claim(key);
      }
      this.current = { key, page };
      // The page enters as if it were shown for the first time since it left.
      fromForPage = null;
    }
    const switched = fromForPage === null && from !== null;
    this.away = false;
    this.show(key);
    this.current!.page.enter(route, fromForPage);
    // Another page of the section offers its own time modes.
    if (switched) this.ctx.time.refresh();
  }

  leave(to: Route): void {
    if (!this.away) this.current?.page.leave(to);
    this.away = true;
  }

  frame(dt: number, now: number): void {
    this.current?.page.frame(dt, now);
  }

  layout(viewport: Viewport): PanelSizes {
    return this.current ? this.current.page.layout(viewport) : { right: 400, left: 340, dash: 0, rightLabel: t('Про коробку') };
  }

  laidOut(): void {
    this.current?.page.laidOut?.();
  }

  time(): TimeCapabilities {
    return this.current ? this.current.page.time() : { modes: ['slow', 'readable', 'real'] };
  }

  private keyOf(route: Route): string {
    const id = route.page === 'catalogue' ? route.path[0] : undefined;
    return id && OWN_PAGES[id] ? id : 'manual';
  }

  /** Whatever is new in the places belongs to the page just mounted. */
  private claim(key: string): void {
    for (const place of this.places) {
      for (const el of Array.from(place.children)) if (!this.foreign.has(el) && !this.owners.has(el)) this.owners.set(el, key);
    }
  }

  private show(key: string): void {
    for (const [el, owner] of this.owners) {
      if (!el.isConnected) {
        this.owners.delete(el);
        continue;
      }
      if (owner === key) el.removeAttribute(PAGE_AWAY);
      else el.setAttribute(PAGE_AWAY, '');
    }
  }
}
