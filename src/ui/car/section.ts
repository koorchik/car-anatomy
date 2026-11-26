// The car section (`#/car/<car>`), stage C1a: the whole car in 3D at an address without a menu item. The car stands on
// the floor and turns slowly, in the three views; a click on any part names its system and tints it. The chips, the
// focus, the cards with the sections' numbers and the article come with stage C1b, the menu item with C1c. There is no
// sound here yet ("On the lift" brings it), so the engine is quiet while the section is shown.
//
// What the section borrows from the shared page (the tab's title, the canvas's label, the stage's fit) it gives back
// exactly on leaving; what it put into the shared places the shell hides itself (section-dom.ts).

import { carById } from '../../data/cars.ts';
import { t } from '../../i18n/t.ts';
import { CarAssembly, carFrame, carInputs, type CarSystem } from '../../scene/car/assembly.ts';
import { BODY_PARTS, CAR_PARTS } from '../../scene/car/parts.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import type { Stage } from '../../scene/stage.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import { summaryLine, titleHtml } from './markup.ts';
import { OVERVIEW_CARS, overviewCarId } from './overview-cars.ts';
import './car.css';

/** From the front left and a little above: the nose, the side and the engine under the bonnet. */
const HOME: readonly [number, number, number] = [0.82, 0.42, 0.92];
/** How far back the camera stands for the car (Stage.fitScale, 1 frames its whole sphere), wide and on a phone. */
const FIT = { wide: 0.74, phone: 0.95 } as const;
/** The class on <body> that the section's styles live under. */
const BODY_CLASS = 'section-car';
/** The shell's class for a closed right panel, which its layout keeps on <body> whatever the section. */
const PANEL_CLOSED = 'panel-closed';

declare global {
  interface Window {
    /** For checks in the browser console, like window.__engine. */
    __car?: { stage: Stage; section: CarSection };
  }
}

export class CarSection implements Section {
  readonly id = 'car' as const;
  readonly solidLabel = t('Ціле авто');
  private ctx!: SectionContext;
  /** Built once per car and kept while the visitor is elsewhere, so coming back is instant. */
  private readonly built = new Map<string, CarAssembly>();
  private model: CarAssembly | null = null;
  private readonly frameState = carFrame();
  private shown = false;
  private borrowed: Array<() => void> = [];
  private homedFor: FreezeOptions | null = null;

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    // The car's own cards, for when a system in focus answers part by part (stage C1b).
    registerParts(BODY_PARTS);
    registerParts(CAR_PARTS);
    ctx.slots.title.add(titleHtml());
    this.listen();
    ctx.view.onChange((mode) => {
      if (this.shown) this.model?.setView(mode);
    });
    window.__car = { stage: ctx.stage, section: this };
  }

  /** The assembly on the stage now. */
  get assembly(): CarAssembly | null {
    return this.model;
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.ctx.slots.root.querySelector<T>(`#${id}`)!;
  }

  /** A click without a drag tints the system under it (and the shell's card names it); a click on nothing clears it. */
  private listen(): void {
    const canvas = this.ctx.stage.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (event) => {
      down = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!this.shown || !down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 5) return;
      this.select((this.ctx.stage.pick(event.clientX, event.clientY)?.system ?? null) as CarSystem | null);
    });
  }

  /** Tints a system of the car, as a click on it does; null clears. */
  select(system: CarSystem | null): void {
    this.model?.highlightSystem(system);
  }

  enter(route: Route, _from: Route | null): void {
    const carId = overviewCarId(route.path);
    if (route.path[0] !== carId || route.page !== 'overview') {
      // An address without a car, or with one the overview does not show yet, shows the first car under its own address.
      this.ctx.router.replace({ section: 'car', page: 'overview', path: [carId] });
    }
    if (!this.shown) this.show();
    this.showCar(carId);
  }

  private show(): void {
    this.shown = true;
    const { stage, slots, audio, keys } = this.ctx;
    audio.suspend();
    const canvas = stage.renderer.domElement;
    const navCurrent = slots.root.querySelector<HTMLElement>('.sections a.current');
    const results = slots.results.parent;
    this.borrowed = [
      this.borrow(() => document.title, (v) => (document.title = v), t('Авто цілком. Анатомія авто')),
      this.borrow(() => canvas.getAttribute('aria-label'), (v) => (v === null ? canvas.removeAttribute('aria-label') : canvas.setAttribute('aria-label', v)), t('Тривимірна модель авто. Перетягуй, щоб обертати, коліщатком наближай, клацни частину, щоб побачити її систему.')),
      this.borrow(() => results.hidden, (v) => (results.hidden = v), true),
      this.borrow(() => stage.fitScale, (v) => (stage.fitScale = v), FIT.wide),
      // The car turns slowly on show, as an engine does.
      this.borrow(() => stage.orbit, (v) => stage.setOrbit(v), true),
    ];
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

  /** Puts a car on the stage, built the first time it is shown. */
  private showCar(carId: string): void {
    const car = carById(carId)!;
    this.$('car-title').textContent = car.name;
    this.$('car-sub').textContent = summaryLine(car);
    let model = this.built.get(carId);
    if (!model) {
      model = new CarAssembly(carInputs(carId));
      this.built.set(carId, model);
    }
    if (model === this.model) return;
    if (this.model) this.ctx.stage.release(this.model);
    this.model = model;
    // Every car of the overview is framed for the longest of them, so cars opened one after another show true size.
    const longest = Math.max(...OVERVIEW_CARS.map((id) => carById(id)!.dimensions!.lengthM));
    this.ctx.stage.setModel(model, { home: HOME, frameScale: longest / car.dimensions!.lengthM });
    model.setView(this.ctx.view.mode);
    this.ctx.slots.partCard.hidden = true;
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
    if (this.model) stage.release(this.model);
    this.model = null;
    slots.partCard.hidden = true;
    for (const giveBack of this.borrowed.reverse()) giveBack();
    this.borrowed = [];
  }

  frame(_dt: number): void {
    const model = this.model;
    if (!model) return;
    const frozen = this.ctx.time.frozen;
    this.frameState.engine.theta = frozen ? frozen.theta : 0;
    model.update(this.frameState);
    if (!frozen) {
      this.homedFor = null;
    } else if (frozen !== this.homedFor) {
      this.homedFor = frozen;
      this.ctx.stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
    }
  }

  layout(viewport: Viewport): PanelSizes {
    // A long car seen from three quarters reaches past a phone's narrow sides at the engines' fit.
    if (this.shown) this.ctx.stage.fitScale = viewport.small ? FIT.phone : FIT.wide;
    // Only the 3D at this stage: the article on the right comes with stage C1b.
    return { right: 0, left: 0, dash: 0, rightLabel: t('Про це авто') };
  }

  time(): TimeCapabilities {
    // The car stands still: nothing here runs on time until the lift (stage C2).
    return { modes: ['real'] };
  }
}
