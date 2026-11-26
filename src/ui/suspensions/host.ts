// The suspensions section as the shell sees it: two pages under one section id, the catalogue (#/suspensions/<page>,
// SuspensionSection) and the designer (#/suspensions/designer, stage P8c). Each page is written as if it were a section
// of its own: it fills the slots, borrows the shared page while shown and gives it back on leaving. This host mounts a
// page the first time its address is opened (the designer's code comes as a chunk of its own), leaves one page before
// entering the other, and hides what the page not shown put into the shared places, the way the shell does between
// sections (section-dom.ts): each page's elements are claimed right after it mounts.

import { withDictionaries } from '../../i18n/dictionaries.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import type { SuspensionSection } from './section.ts';

/** The designer's page, fetched with its dictionary the first time it is opened. */
export const loadDesignerPage = (): Promise<typeof import('../suspension-designer/page.ts')> =>
  withDictionaries(['suspension', 'suspension-designer'], () => import('../suspension-designer/page.ts'));

type DesignerModule = Awaited<ReturnType<typeof loadDesignerPage>>;
type DesignerPage = InstanceType<DesignerModule['SuspensionDesignerPage']>;

/** The attribute that hides a page's elements while the other page is shown (suspensions.css). */
export const PAGE_AWAY = 'data-susp-away';

type PageId = 'catalogue' | 'designer';

interface Page {
  mount(ctx: SectionContext): void;
  enter(route: Route, from: Route | null): void;
  leave(to: Route): void;
  frame(dt: number, now: number): void;
  layout(viewport: Viewport): PanelSizes;
  laidOut?(): void;
  time(): TimeCapabilities;
}

export class SuspensionsHost implements Section {
  readonly id = 'suspensions' as const;
  readonly solidLabel: string;
  private ctx!: SectionContext;
  private readonly catalogue: SuspensionSection;
  private designer: DesignerPage | null;
  private readonly loadDesigner: () => Promise<DesignerModule>;
  private shown: PageId | null = null;
  /** The page the last route asked for, so a chunk that comes late does not open over a later address. */
  private wanted: PageId = 'catalogue';
  private readonly mounted = new Set<PageId>();
  private readonly owned = new Map<Element, PageId>();
  /** Whether the section itself is on screen (between the shell's enter and leave). */
  private onScreen = false;

  constructor(catalogue: SuspensionSection, designer: DesignerModule | null, loadDesigner: () => Promise<DesignerModule> = loadDesignerPage) {
    this.catalogue = catalogue;
    this.solidLabel = catalogue.solidLabel;
    this.designer = designer ? new designer.SuspensionDesignerPage() : null;
    this.loadDesigner = loadDesigner;
  }

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
  }

  private page(id: PageId): Page | null {
    return id === 'catalogue' ? this.catalogue : this.designer;
  }

  /** The places pages fill, as the shell lists them. */
  private places(): HTMLElement[] {
    const s = this.ctx.slots;
    return [s.root, s.backdrop.parent, s.actions.parent, s.title.parent, s.tools.parent, s.panel.parent, s.results.parent, s.dash.parent, s.table.head.parent];
  }

  /** Mounts a page once and claims what it put into the places. */
  private mountPage(id: PageId, page: Page): void {
    if (this.mounted.has(id)) return;
    const before = new Set<Element>();
    for (const place of this.places()) for (const el of Array.from(place.children)) before.add(el);
    page.mount(this.ctx);
    this.mounted.add(id);
    for (const place of this.places()) for (const el of Array.from(place.children)) if (!before.has(el) && !this.owned.has(el)) this.owned.set(el, id);
  }

  /** Shows the elements of page `id` and hides the other page's. */
  private reveal(id: PageId): void {
    for (const [el, owner] of this.owned) {
      if (!el.isConnected) {
        this.owned.delete(el);
        continue;
      }
      if (owner === id) el.removeAttribute(PAGE_AWAY);
      else el.setAttribute(PAGE_AWAY, '');
    }
  }

  enter(route: Route, from: Route | null): void {
    this.onScreen = true;
    const id: PageId = route.page === 'designer' ? 'designer' : 'catalogue';
    this.wanted = id;
    if (id === 'designer' && !this.designer) {
      // The page shown stays until the designer's code is here.
      void this.loadDesigner().then(
        (module) => {
          this.designer ??= new module.SuspensionDesignerPage();
          const current = this.ctx.router.current;
          if (this.onScreen && this.wanted === 'designer' && current.section === 'suspensions' && current.page === 'designer') this.enter(current, from);
        },
        (error: unknown) => console.error(error),
      );
      return;
    }
    const page = this.page(id)!;
    if (this.shown !== id) {
      if (this.shown) this.page(this.shown)!.leave(route);
      this.mountPage(id, page);
      this.shown = id;
      this.reveal(id);
      page.enter(route, from);
      this.ctx.panels.relayout();
      return;
    }
    page.enter(route, from);
  }

  leave(to: Route): void {
    this.onScreen = false;
    if (this.shown) this.page(this.shown)!.leave(to);
    this.shown = null;
  }

  frame(dt: number, now: number): void {
    if (this.shown) this.page(this.shown)!.frame(dt, now);
  }

  layout(viewport: Viewport): PanelSizes {
    return (this.page(this.shown ?? this.wanted) ?? this.catalogue).layout(viewport);
  }

  laidOut(): void {
    if (this.shown) this.page(this.shown)!.laidOut?.();
  }

  time(): TimeCapabilities {
    return (this.page(this.shown ?? 'catalogue') ?? this.catalogue).time();
  }
}
