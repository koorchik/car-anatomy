// The suspensions section (`#/suspensions…`), stage P1b: the full MacPherson corner of the macpherson page on a rig,
// with a slider that moves the wheel through its travel, the three views, a card for every part and the numbers of
// the corner at that travel. The address has no menu item yet: the menu links here once the section shows its first
// scene (P1d), and the keys come with it. There is no engine here, so the sound is suspended while the section is
// shown (the plan of the whole car, its amendments to the suspensions plan, item 9).
//
// Things the section borrows from the shared page (the tab's title, the panel's heading, the stage's orbit and fit)
// it gives back exactly on leaving; what it put into the shared places the shell hides itself (section-dom.ts).

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import { CornerModel, cornerFrame } from '../../scene/suspension/corner-model.ts';
import { SUSPENSION_REGISTERED } from '../../scene/suspension/parts.ts';
import { rigFrame, rigTravelRange } from '../../scene/suspension/rig-frame.ts';
import type { Stage } from '../../scene/stage.ts';
import type { FreezeOptions } from '../../shell/freeze.ts';
import type { PanelSizes, Route, Section, SectionContext, TimeCapabilities, Viewport } from '../../shell/section.ts';
import { factorySetup, resolveCorner, type ResolvedCorner } from '../../suspension/setup.ts';
import { jtektCorner } from '../../suspension/templates/macpherson.ts';
import { panelHtml, titleHtml, toolsHtml } from './markup.ts';
import './suspensions.css';

/** The corner seen from the inboard side and a little from the front: the strut, the arm, the rack and the shaft. */
const HOME: readonly [number, number, number] = [-0.72, 0.42, 0.8];
/** The class on <body> that the section's styles live under (suspensions plan, what the section needs of the shell). */
const BODY_CLASS = 'section-suspensions';
/** The shell's class for a closed right panel, which its layout keeps on <body> whatever the section. */
const PANEL_CLOSED = 'panel-closed';
const DEG = 180 / Math.PI;

declare global {
  interface Window {
    /** For checks in the browser console, like window.__engine. */
    __suspension?: { stage: Stage; section: SuspensionSection };
  }
}

/** A number with its sign, in the visitor's locale. */
const signed = (value: number, digits: number): string => {
  const rounded = Number(value.toFixed(digits));
  const text = Math.abs(rounded).toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return rounded > 0 ? `+${text}` : rounded < 0 ? `−${text}` : text;
};

const plain = (value: number, digits: number): string => value.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export class SuspensionSection implements Section {
  readonly id = 'suspensions' as const;
  readonly solidLabel = t('Підвіска');
  private ctx!: SectionContext;
  private resolved!: ResolvedCorner;
  private model!: CornerModel;
  private readonly rig = cornerFrame();
  /** Wheel travel the rig holds, m. */
  private travel = 0;
  private shown = false;
  /** What the section changed on the shared page while shown, each giving it back. */
  private borrowed: Array<() => void> = [];
  /** The freeze the camera has gone home for (TimeControl.frozen). */
  private homedFor: FreezeOptions | null = null;

  mount(ctx: SectionContext): void {
    this.ctx = ctx;
    // The corner's and the axle's cards in one dictionary: both name the rack.
    registerParts(SUSPENSION_REGISTERED);
    const corner = jtektCorner();
    this.resolved = resolveCorner(corner, factorySetup(corner));
    this.model = new CornerModel(this.resolved);
    const range = rigTravelRange(this.resolved);
    const { slots } = ctx;
    slots.title.add(titleHtml());
    slots.tools.add(toolsHtml(Math.round(range.min * 1000), Math.round(range.max * 1000)));
    slots.panel.add(panelHtml());
    this.listen();
    this.readout();
    window.__suspension = { stage: ctx.stage, section: this };
  }

  /** Moves the wheel to `mm` of travel, as the slider does. */
  setTravel(mm: number): void {
    const range = rigTravelRange(this.resolved);
    this.travel = Math.min(range.max, Math.max(range.min, mm / 1000));
    const slider = this.$<HTMLInputElement>('susp-travel');
    if (Number(slider.value) !== mm) slider.value = String(mm);
    this.readout();
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.ctx.slots.root.querySelector<T>(`#${id}`)!;
  }

  private listen(): void {
    const { view } = this.ctx;
    this.$<HTMLInputElement>('susp-travel').addEventListener('input', (event) => this.setTravel(Number((event.target as HTMLInputElement).value)));
    this.$<HTMLInputElement>('susp-explode').addEventListener('input', (event) => this.model.setExplode(Number((event.target as HTMLInputElement).value)));
    const overlays = (): void => this.model.setOverlays({ forces: this.$<HTMLInputElement>('susp-forces').checked, laser: this.$<HTMLInputElement>('susp-laser').checked });
    this.$('susp-forces').addEventListener('change', overlays);
    this.$('susp-laser').addEventListener('change', overlays);
    // The view is the shell's and outlives this section: another section's choice is not drawn here until it is back.
    view.onChange((mode) => {
      if (this.shown) this.model.setView(mode);
    });
  }

  enter(_route: Route, _from: Route | null): void {
    // Every address of the section shows the same corner for now: a second route changes nothing.
    if (this.shown) return;
    this.shown = true;
    const { stage, slots, audio, keys, view } = this.ctx;
    audio.suspend();
    const canvas = stage.renderer.domElement;
    const navCurrent = slots.root.querySelector<HTMLElement>('.sections a.current');
    const results = slots.results.parent;
    this.borrowed = [
      this.borrow(() => document.title, (v) => (document.title = v), t('Підвіски. Анатомія авто')),
      this.borrow(() => slots.panelTitle.textContent ?? '', (v) => (slots.panelTitle.textContent = v), t('Про цей кут')),
      this.borrow(() => canvas.getAttribute('aria-label'), (v) => (v === null ? canvas.removeAttribute('aria-label') : canvas.setAttribute('aria-label', v)), t('Тривимірна модель підвіски. Перетягуй, щоб обертати, коліщатком наближай.')),
      this.borrow(() => results.hidden, (v) => (results.hidden = v), true),
      this.borrow(() => stage.fitScale, (v) => (stage.fitScale = v), 0.68),
      // A corner held on a rig is studied, not shown off: it stands still unless the visitor turns it.
      this.borrow(() => stage.orbit, (v) => stage.setOrbit(v), false),
    ];
    if (navCurrent) {
      navCurrent.classList.remove('current');
      this.borrowed.push(() => navCurrent.classList.add('current'));
    }
    // The body's classes are another section's modes (the engine designer's, the dyno's) but for the shell's own.
    const body = document.body;
    const own = [BODY_CLASS, ...(body.classList.contains(PANEL_CLOSED) ? [PANEL_CLOSED] : [])].join(' ');
    this.borrowed.push(this.borrow(() => body.className, (v) => (body.className = v), own));
    slots.partCard.hidden = true;
    stage.setModel(this.model, { home: HOME });
    this.model.setView(view.mode);
    keys.use([this.id]);
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
    stage.release(this.model);
    slots.partCard.hidden = true;
    for (const giveBack of this.borrowed.reverse()) giveBack();
    this.borrowed = [];
  }

  frame(_dt: number): void {
    const model = this.model;
    rigFrame(this.resolved, this.travel, this.rig);
    model.update(this.rig);
    const frozen = this.ctx.time.frozen;
    if (!frozen) {
      this.homedFor = null;
    } else if (frozen !== this.homedFor) {
      this.homedFor = frozen;
      this.ctx.stage.freeze({ quality: frozen.quality, orbit: frozen.orbit });
    }
  }

  layout(_viewport: Viewport): PanelSizes {
    return { right: 380, left: 0, dash: 0, rightLabel: t('Про цей кут') };
  }

  time(): TimeCapabilities {
    // The rig holds the wheel still: true time is all there is until a scene moves it (P1d brings the slow-down ×k).
    return { modes: ['real'] };
  }

  /** The numbers under the panel's heading and beside the slider, for the travel the rig holds. */
  private readout(): void {
    const q = this.travel;
    const axle = this.resolved.axle;
    rigFrame(this.resolved, q, this.rig);
    const mm = t('{value} мм', { value: signed(q * 1000, 0) });
    this.$('susp-travel-value').textContent = mm;
    this.$('susp-r-travel').textContent = mm;
    this.$('susp-r-camber').textContent = `${signed(axle.value('camber', q) * DEG, 2)}°`;
    this.$('susp-r-toe').textContent = `${signed(axle.value('toe', q) * DEG, 2)}°`;
    this.$('susp-r-spring-len').textContent = t('{value} мм', { value: plain(axle.value('springLen', q) * 1000, 0) });
    this.$('susp-r-spring').textContent = t('{value} кН', { value: plain(this.rig.springN / 1000, 2) });
  }
}
