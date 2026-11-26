// The car section (`#/car/<car>`): the whole car in 3D, standing on the floor and turning slowly, in the three views
// (stage C1a), with the overview around it (stage C1b; the whole-car plan, what the visitor sees): the cars of the
// overview and the table "All cars", the article "About this car", the chips of the systems, a system tinted under the
// pointer, the focus with its card (`?focus=<system>`), and the way into the system's section with this car (`car=`).
// The menu item comes with stage C1c. There is no sound here yet ("On the lift" brings it), so the engine is quiet.
//
// Focus. A click on a system (or its chip) brings the camera to it in 0.8 s, the models it has no part in fade to a
// ghost (setGhost), and its card shows its figures. The address takes `?focus=` in place, without a history entry,
// so Back from the section it leads to comes back to the system in focus. In focus a click on a part of that system
// opens the part's own card from its section; a click on another system moves the focus there.
//
// What the section borrows from the shared page (the tab's title, the canvas's label, the stage's fit) it gives back
// exactly on leaving; what it put into the shared places the shell hides itself (section-dom.ts).

import { carById } from '../../data/cars.ts';
import { t } from '../../i18n/t.ts';
import { CarAssembly, carFrame, carInputs } from '../../scene/car/assembly.ts';
import { BODY_PARTS, CAR_PARTS } from '../../scene/car/parts.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import type { PartInfo } from '../../scene/parts-info.ts';
import type { Stage } from '../../scene/stage.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import { pageShown } from '../../shell/registry.ts';
import { formatRoute } from '../../shell/routes.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import type { CarRecord } from '../../vehicle/car.ts';
import { CAR_SYSTEMS, drillTarget, isCarSystem, returnFocus, type CarSystem, type PageShown, type SystemTarget } from '../../vehicle/car-systems.ts';
import { pageIndex, type PageIndex } from '../../vehicle/links.ts';
import { allCarsHeadHtml, allCarsHtml, allCarsLabel } from './all-cars.ts';
import { carArticleHtml, escapeHtml } from './article.ts';
import { systemCards, type SystemCard } from './cards.ts';
import { focusCardHtml, panelHtml, summaryLine, titleHtml } from './markup.ts';
import { OVERVIEW_CARS, overviewCarId } from './overview-cars.ts';
import './car.css';

/** From the front left and a little above: the nose, the side and the engine under the bonnet. */
const HOME: readonly [number, number, number] = [0.82, 0.42, 0.92];
/** How far back the camera stands for the car (Stage.fitScale, 1 frames its whole sphere), wide and on a phone. */
const FIT = { wide: 0.74, phone: 0.95 } as const;
/** How far back the camera stands for a system in focus: a little room round it. */
const FOCUS_FIT = { wide: 1.15, phone: 1.25 } as const;
/** The class on <body> that the section's styles live under. */
const BODY_CLASS = 'section-car';
/** The shell's class for a closed right panel, which its layout keeps on <body> whatever the section. */
const PANEL_CLOSED = 'panel-closed';
/** Width of the panel with the article and, in focus, the system's card. */
const PANEL_W = 380;
/** Where the overview remembers the system the visitor went into a section from (car-systems.ts, returnFocus). */
const CAME_KEY = 'car-anatomy.car-came';

/** Pages the overview may lead to. */
const shown: PageShown = (section, page) => pageShown(section, page);
const PAGES: PageIndex = pageIndex({
  engines: () => true,
  sump: () => true,
  gearboxes: (target) => pageShown('gearboxes', target.split('/')[0]!),
  suspensions: (target) => pageShown('suspensions', target),
});

declare global {
  interface Window {
    /** For checks in the browser console, like window.__engine. */
    __car?: { stage: Stage; section: CarSection };
  }
}

/** The address of a system's page, as a link on the overview writes it. */
export const drillHref = (target: SystemTarget): string => formatRoute({ section: target.section, page: target.page, path: target.path, query: target.query });

export class CarSection implements Section {
  readonly id = 'car' as const;
  readonly solidLabel = t('Ціле авто');
  private ctx!: SectionContext;
  /** Built once per car and kept while the visitor is elsewhere, so coming back is instant. */
  private readonly built = new Map<string, { model: CarAssembly; cards: Record<CarSystem, SystemCard>; hover: Partial<Record<CarSystem, PartInfo>> }>();
  private model: CarAssembly | null = null;
  private car: CarRecord | null = null;
  private cards: Record<CarSystem, SystemCard> | null = null;
  private hoverCards: Partial<Record<CarSystem, PartInfo>> = {};
  private readonly frameState = carFrame();
  private shown = false;
  private borrowed: Array<() => void> = [];
  private homedFor: FreezeOptions | null = null;
  /** The model last posed by frame(). */
  private posed: CarAssembly | null = null;
  private focused: CarSystem | null = null;
  /** The system a first touch tinted: a second touch on it puts it in focus. */
  private touched: CarSystem | null = null;
  private small = false;
  private focusCard!: HTMLElement;
  /** True while setFocus lays the page out, so laidOut leaves the camera to it. */
  private relaying = false;

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    // The car's own cards, for when a system in focus answers part by part.
    registerParts(BODY_PARTS);
    registerParts(CAR_PARTS);
    ctx.slots.title.add(titleHtml());
    ctx.slots.panel.add(panelHtml());
    ctx.slots.status.add(focusCardHtml());
    ctx.slots.table.head.add(allCarsHeadHtml());
    this.focusCard = this.$('car-focus');
    this.listen();
    ctx.view.onChange((mode) => {
      if (!this.shown) return;
      this.model?.setView(mode);
      // A view may hide or show what the models pose: pose them again on the next frame.
      this.posed = null;
    });
    ctx.keys.bind(this.id, [
      {
        codes: ['Escape'],
        label: t('Назад до авто'),
        down: () => {
          if (!this.focused) return false;
          this.setFocus(null);
          return true;
        },
      },
    ]);
    window.__car = { stage: ctx.stage, section: this };
  }

  /** The assembly on the stage now. */
  get assembly(): CarAssembly | null {
    return this.model;
  }

  /** The system in focus now. */
  get focus(): CarSystem | null {
    return this.focused;
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.ctx.slots.root.querySelector<T>(`#${id}`)!;
  }

  private listen(): void {
    const { stage, slots } = this.ctx;
    const canvas = stage.renderer.domElement;
    // The system under a point: a part's own (the wheel of a corner is the wheels'), else its model's.
    const systemAt = (x: number, y: number): CarSystem | null => {
      const picked = stage.pick(x, y);
      if (!picked) return null;
      const system = this.model?.partSystems.get(picked.key) ?? picked.system;
      return isCarSystem(system) ? system : null;
    };
    // The pointer tints the whole system under it, in the overview; in focus the system in focus stays tinted.
    let lastHover = 0;
    let dragging = false;
    canvas.addEventListener('pointermove', (event) => {
      if (!this.shown || this.focused || event.pointerType !== 'mouse' || dragging) return;
      const now = performance.now();
      if (now - lastHover < 90) return;
      lastHover = now;
      this.tint(systemAt(event.clientX, event.clientY));
    });
    canvas.addEventListener('pointerleave', () => {
      if (this.shown && !this.focused) this.tint(null);
    });
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (event) => {
      down = { x: event.clientX, y: event.clientY };
      dragging = true;
    });
    window.addEventListener('pointerup', () => {
      dragging = false;
    });
    // The shell's own listener has already opened the part's card: the overview keeps it only for a part of the
    // system in focus.
    canvas.addEventListener('pointerup', (event) => {
      if (!this.shown || !down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const system = systemAt(event.clientX, event.clientY);
      if (system && system === this.focused) return;
      slots.partCard.hidden = true;
      if (!system) {
        if (!this.focused) this.tint(null);
        this.touched = null;
        return;
      }
      // On a touch screen the first touch tints and names the system, the second puts it in focus.
      if (event.pointerType !== 'mouse' && !this.focused && this.touched !== system) {
        this.touched = system;
        this.tint(system);
        return;
      }
      this.touched = null;
      this.setFocus(system);
    });
    this.$('car-chips').addEventListener('click', (event) => {
      const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-system]');
      if (!chip) return;
      const system = chip.dataset.system as CarSystem;
      this.setFocus(system === this.focused ? null : system);
    });
    this.$('car-focus-back').addEventListener('click', () => this.setFocus(null));
    // Going into a section: the overview remembers which system it went from, for the way back.
    this.$('car-focus-open').addEventListener('click', () => {
      if (!this.car || !this.focused) return;
      try {
        sessionStorage.setItem(CAME_KEY, JSON.stringify({ car: this.car.id, system: this.focused }));
      } catch {
        // Storage can be blocked: the way back then names the page's own system.
      }
    });
    this.$('car-all').addEventListener('click', () => {
      const table = this.ctx.slots.table;
      table.body.innerHTML = allCarsHtml(this.car?.id ?? '', PAGES);
      table.open(true);
    });
  }

  /** The system the visitor last went into a section from, for this car. */
  private came(carId: string): CarSystem | null {
    try {
      const raw = JSON.parse(sessionStorage.getItem(CAME_KEY) ?? 'null') as { car?: string; system?: string } | null;
      return raw?.car === carId && isCarSystem(raw.system) ? raw.system : null;
    } catch {
      return null;
    }
  }

  /** Tints a system under the pointer or a first touch; null clears. */
  private tint(system: CarSystem | null): void {
    if (this.model && this.model.highlight !== system) this.model.highlightSystem(system);
  }

  /** Tints a system of the car, as the pointer does; null clears. */
  select(system: CarSystem | null): void {
    this.tint(system);
  }

  enter(route: Route, from: Route | null): void {
    const carId = overviewCarId(route.path);
    if (route.path[0] !== carId || route.page !== 'overview') {
      // An address without a car, or with one the overview does not show yet, shows the first car under its own address.
      this.ctx.router.replace({ section: 'car', page: 'overview', path: [carId] });
    }
    const first = !this.shown;
    if (first) this.show();
    const placed = this.showCar(carId);
    const asked = route.query.focus;
    const model = this.model!;
    if (isCarSystem(asked) && model.has(asked)) {
      const system = returnFocus(this.car!, asked, this.came(carId), shown, from);
      // A focus asked by the address the page opens with is there at once; a change while the car is shown is a move.
      this.setFocus(system, first || placed ? 0 : undefined);
    } else if (this.focused || route.query.focus !== undefined) {
      this.setFocus(null, first || placed ? 0 : undefined);
    }
  }

  private show(): void {
    this.shown = true;
    const { stage, slots, audio, keys } = this.ctx;
    audio.suspend();
    const canvas = stage.renderer.domElement;
    const navCurrent = slots.root.querySelector<HTMLElement>('.sections a.current');
    const results = slots.results.parent;
    const panelToggle = slots.root.querySelector<HTMLElement>('#panel-toggle-closed');
    const panel = slots.root.querySelector<HTMLElement>('#panel');
    this.borrowed = [
      this.borrow(() => document.title, (v) => (document.title = v), t('Авто цілком. Анатомія авто')),
      this.borrow(() => slots.panelTitle.textContent ?? '', (v) => (slots.panelTitle.textContent = v), t('Про це авто')),
      this.borrow(() => canvas.getAttribute('aria-label'), (v) => (v === null ? canvas.removeAttribute('aria-label') : canvas.setAttribute('aria-label', v)), t('Тривимірна модель авто. Перетягуй, щоб обертати, коліщатком наближай, клацни частину, щоб побачити її систему.')),
      this.borrow(() => results.hidden, (v) => (results.hidden = v), true),
      this.borrow(() => stage.fitScale, (v) => (stage.fitScale = v), FIT.wide),
      // The car turns slowly on show, as an engine does.
      this.borrow(() => stage.orbit, (v) => stage.setOrbit(v), true),
    ];
    if (panelToggle) this.borrowed.push(this.borrow(() => panelToggle.textContent ?? '', (v) => (panelToggle.textContent = v), t('Про це авто')));
    if (panel) {
      const before = panel.getAttribute('aria-label');
      panel.setAttribute('aria-label', t('Про це авто'));
      this.borrowed.push(() => (before === null ? panel.removeAttribute('aria-label') : panel.setAttribute('aria-label', before)));
    }
    const scaleBar = slots.root.querySelector('.scale-bar');
    if (scaleBar) {
      const before = scaleBar.getAttribute('title');
      scaleBar.setAttribute('title', t('Довжина цього відрізка в натурі'));
      this.borrowed.push(() => (before === null ? scaleBar.removeAttribute('title') : scaleBar.setAttribute('title', before)));
    }
    if (navCurrent) {
      navCurrent.classList.remove('current');
      this.borrowed.push(() => navCurrent.classList.add('current'));
    }
    // The body's classes are another section's modes (the engine designer's, the dyno's) but for the shell's own.
    const body = document.body;
    const own = [BODY_CLASS, ...(body.classList.contains(PANEL_CLOSED) ? [PANEL_CLOSED] : [])].join(' ');
    this.borrowed.push(this.borrow(() => body.className, (v) => (body.className = v), own));
    this.ctx.panels.relayout();
    slots.partCard.hidden = true;
    keys.use([this.id]);
  }

  /** Puts a car on the stage, built the first time it is shown. True when it arrived now. */
  private showCar(carId: string): boolean {
    const car = carById(carId)!;
    let built = this.built.get(carId);
    if (!built) {
      const model = new CarAssembly(carInputs(carId));
      const cards = systemCards(car, model);
      const hover = Object.fromEntries(
        CAR_SYSTEMS.map((s) => [s, { name: cards[s].kind ? `${cards[s].name}: ${escapeHtml(cards[s].kind!)}` : cards[s].name, text: cards[s].text }]),
      ) as Partial<Record<CarSystem, PartInfo>>;
      built = { model, cards, hover };
      this.built.set(carId, built);
    }
    if (built.model === this.model) return false;
    const { model, cards, hover } = built;
    if (this.model) this.ctx.stage.release(this.model);
    this.model = model;
    this.car = car;
    this.cards = cards;
    this.hoverCards = hover;
    this.focused = null;
    this.touched = null;
    model.focusSystem(null);
    model.highlightSystem(null);
    model.setCards(hover, null);
    this.drawPage(car, model);
    // Every car of the overview is framed for the longest of them, so cars opened one after another show true size.
    const longest = Math.max(...OVERVIEW_CARS.map((id) => carById(id)!.dimensions!.lengthM));
    this.ctx.stage.fitScale = this.small ? FIT.phone : FIT.wide;
    this.ctx.stage.setModel(model, { home: HOME, frameScale: longest / car.dimensions!.lengthM });
    model.setView(this.ctx.view.mode);
    this.posed = null;
    this.ctx.slots.partCard.hidden = true;
    this.drawFocus();
    return true;
  }

  /** The car's name, the line under it, the list, the chips and the article. */
  private drawPage(car: CarRecord, model: CarAssembly): void {
    this.$('car-title').textContent = car.name;
    this.$('car-sub').textContent = summaryLine(car);
    const list = this.$('car-list');
    list.innerHTML =
      OVERVIEW_CARS.length > 1
        ? OVERVIEW_CARS.map((id) => {
            const other = carById(id)!;
            const current = id === car.id;
            return `<a class="car-item${current ? ' current' : ''}" href="#/car/${escapeHtml(id)}"${current ? ' aria-current="page"' : ''}>${escapeHtml(other.name)}</a>`;
          }).join('')
        : '';
    list.hidden = OVERVIEW_CARS.length < 2;
    this.$('car-all').textContent = allCarsLabel();
    this.$('car-chips').innerHTML = CAR_SYSTEMS.filter((s) => model.has(s))
      .map((s) => `<button class="car-chip" type="button" data-system="${s}" aria-pressed="false">${escapeHtml(this.cards![s].name)}</button>`)
      .join('');
    this.$('car-article').innerHTML = carArticleHtml(car, PAGES);
  }

  /**
   * Puts a system in focus, or none: the camera, the ghosts, the cards of the parts, the card on the right, the chips
   * and the address. `durationS` 0 jumps (an address opened with a focus); left out, the camera moves as the stage does.
   */
  setFocus(system: CarSystem | null, durationS?: number): void {
    const model = this.model;
    if (!model) return;
    const changed = system !== this.focused;
    this.focused = system;
    this.touched = null;
    model.focusSystem(system);
    model.highlightSystem(system);
    model.setCards(this.hoverCards, system);
    this.ctx.slots.partCard.hidden = true;
    this.drawFocus();
    const now = this.ctx.router.current.query.focus;
    if ((system ?? undefined) !== now) this.ctx.router.replace({ query: { focus: system } });
    // On a wide screen the card lives in the right panel, which a focus opens if the visitor had closed it. The page is
    // laid out before the camera moves: a relayout frames the stage again (Stage.resize), which would stop the move.
    if (system && !this.small && !this.ctx.panels.isOpen('right')) this.ctx.panels.setOpen('right', true);
    this.relaying = true;
    this.ctx.panels.relayout();
    this.relaying = false;
    // A new card starts at its top: on a phone the sheet scrolls on its own, and on a wide screen the panel may have
    // been scrolled down the article, past the card above it.
    if (system && changed) {
      this.focusCard.scrollTop = 0;
      if (!this.small) revealTop(this.focusCard);
    }
    const stage = this.ctx.stage;
    const options = durationS === undefined ? {} : { durationS };
    if (changed || durationS === 0) {
      if (system) {
        stage.fitScale = this.small ? FOCUS_FIT.phone : FOCUS_FIT.wide;
        stage.focus(model.systemBox(system), options);
      } else {
        stage.fitScale = this.small ? FIT.phone : FIT.wide;
        stage.focusWhole(options);
      }
    }
  }

  /** A relayout (a resized window, a panel opened) framed the whole car again: a system in focus is framed back. */
  laidOut(): void {
    if (!this.shown || this.relaying || !this.focused || !this.model) return;
    this.ctx.stage.focus(this.model.systemBox(this.focused), { durationS: 0 });
  }

  /** The card of the system in focus and the chips' state. */
  private drawFocus(): void {
    const system = this.focused;
    for (const chip of this.$('car-chips').querySelectorAll<HTMLButtonElement>('button[data-system]')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.system === system));
    }
    const card = this.focusCard;
    card.hidden = !system;
    document.body.classList.toggle('car-focused', !!system);
    if (!system || !this.cards || !this.car) return;
    const c = this.cards[system];
    this.$('car-focus-name').textContent = c.name;
    const kind = this.$('car-focus-kind');
    kind.textContent = c.kind ?? '';
    kind.hidden = !c.kind;
    this.$('car-focus-text').textContent = c.text;
    this.$('car-focus-rows').innerHTML = c.rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    const note = this.$('car-focus-note');
    note.textContent = c.note ?? '';
    note.hidden = !c.note;
    const target = drillTarget(this.car, system, shown);
    const open = this.$<HTMLAnchorElement>('car-focus-open');
    open.hidden = !target;
    if (target) open.href = drillHref(target);
    const where = this.$('car-focus-where');
    where.textContent = target ? whereText(target) : '';
    where.hidden = !target;
  }

  /** Sets a shared value for as long as the section is shown, and gives back what restores it. */
  private borrow<T>(get: () => T, set: (value: T) => void, value: T): () => void {
    const before = get();
    set(value);
    return () => set(before);
  }

  leave(_to: Route): void {
    if (!this.shown) return;
    this.shown = false;
    const { stage, slots } = this.ctx;
    if (this.model) {
      // Coming back shows the car whole, or in the focus its address asks for.
      this.model.focusSystem(null);
      this.model.highlightSystem(null);
      stage.release(this.model);
    }
    this.model = null;
    this.focused = null;
    this.posed = null;
    slots.partCard.hidden = true;
    document.body.classList.remove('car-focused');
    for (const giveBack of this.borrowed.reverse()) giveBack();
    this.borrowed = [];
  }

  frame(_dt: number): void {
    const model = this.model;
    if (!model) return;
    const frozen = this.ctx.time.frozen;
    const theta = frozen ? frozen.theta : 0;
    // The car stands still: its models are posed again only when the pose changes, since the chassis alone costs about
    // a millisecond a pose.
    if (model !== this.posed || theta !== this.frameState.engine.theta) {
      this.frameState.engine.theta = theta;
      model.update(this.frameState);
      this.posed = model;
    }
    if (!frozen) {
      this.homedFor = null;
    } else if (frozen !== this.homedFor) {
      this.homedFor = frozen;
      this.ctx.stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
    }
  }

  layout(viewport: Viewport): PanelSizes {
    this.small = viewport.small;
    // A long car seen from three quarters reaches past a phone's narrow sides at the engines' fit.
    if (this.shown) this.ctx.stage.fitScale = this.focused ? (viewport.small ? FOCUS_FIT.phone : FOCUS_FIT.wide) : viewport.small ? FIT.phone : FIT.wide;
    // The card of the system in focus: at the top of the right panel on a wide screen, at the bottom of the stage on a
    // phone, where the model is framed above it.
    const home = viewport.small ? this.ctx.slots.root : this.$('car-panel');
    if (this.focusCard.parentElement !== home) {
      if (viewport.small) home.append(this.focusCard);
      else home.prepend(this.focusCard);
    }
    const sheet = viewport.small && this.focused ? Math.min(viewport.height * 0.42, 320) : 0;
    return { right: PANEL_W, left: 0, dash: sheet, rightLabel: t('Про це авто') };
  }

  time(): TimeCapabilities {
    // The car stands still: nothing here runs on time until the lift (stage C2).
    return { modes: ['real'] };
  }
}

/**
 * Scrolls the nearest scrolling ancestor back so the element's top shows. Not scrollIntoView: that would also scroll
 * the page's clipped containers while the panel slides in.
 */
function revealTop(el: HTMLElement): void {
  for (let box = el.parentElement; box; box = box.parentElement) {
    const overflow = getComputedStyle(box).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    const above = box.getBoundingClientRect().top - el.getBoundingClientRect().top;
    if (above > 0) box.scrollTop -= above;
    return;
  }
}

/** Where the button of the card leads, in words. */
function whereText(target: SystemTarget): string {
  if (target.section === 'engines') {
    if (target.page === 'sump') return t('Сторінка «Олива на треку» з двигуном цього авто.');
    return target.query.l ? t('Сторінка двигуна цього авто з увімкненим шаром системи.') : t('Сторінка двигуна цього авто.');
  }
  if (target.section === 'gearboxes') return t('Сторінка коробки цього авто.');
  return t('Сторінка підвіски цього авто.');
}
