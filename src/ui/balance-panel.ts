// Inertia force arrows on the model, one view of them at a time: the switch under the stage, and a card with the
// choice of view, its switches, a line of figures and what is left of the whole engine. The arrows themselves are in
// src/scene/balance-arrows.ts, the views in src/engine/balance-phasors.ts and the physics in src/engine/balance-forces.ts.

import { engineById, pageChoices } from '../data/engines.ts';
import { DEFAULT_DESIGN } from '../designer/design.ts';
import { reciprocatingMass } from '../designer/physics.ts';
import { BalanceForces, arrowScale, atRpm, massesOf, roughly, type BalanceMasses, type OrderResidual } from '../engine/balance-forces.ts';
import { BalancePhasors, type BalanceView, type ElementKind, type PhasorView } from '../engine/balance-phasors.ts';
import { buildEngine, type Engine } from '../engine/kinematics.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { BalanceOverlay, FORCE_COLORS, colorOf } from '../scene/balance-arrows.ts';
import type { EngineModel } from '../scene/model-types.ts';
import type { ViewControl } from '../shell/section.ts';
import { forcesToggle } from './forces-toggle.ts';
import './balance-panel.css';

const num = (v: number): string => roughly(v).toLocaleString(numberLocale, { maximumFractionDigits: v < 10 ? 1 : 0 });

const LEFT_WORDS: Record<keyof OrderResidual, string> = {
  force1: t('сила 1-го порядку'),
  force2: t('сила 2-го порядку'),
  couple1: t('момент 1-го порядку'),
  couple2: t('момент 2-го порядку'),
};

/** Words of the legend for each kind of element a view draws. A piston's swatch takes the colour of the view's order. */
const KIND_WORDS: Record<ElementKind, string> = {
  piston: t('поршні'),
  rotating: t('шатуни й шийки'),
  rotor: t('ротори'),
  counterweight: t('противаги'),
  shaft: t('балансирні вали'),
};

/** The visitor's choice, kept from engine to engine. Counterweights and shafts are on, as the engine is built. */
const chosen: { view: BalanceView; counterweights: boolean; shafts: boolean } = { view: 'order1', counterweights: true, shafts: true };

const pageScales = new Map<string, number>();

/** One arrow scale for every engine of a page, so they compare like their sizes do. */
function pageArrowScale(id: string): number {
  const page = id.split('/')[0]!;
  let scale = pageScales.get(page);
  if (scale === undefined) {
    scale = arrowScale(pageChoices(page).map((c) => buildEngine(engineById(c.id)!)));
    pageScales.set(page, scale);
  }
  return scale;
}

/** The designer keeps the scale of its starting engine: a heavier piston gets a longer arrow. */
const designerArrowScale = (): number => DEFAULT_DESIGN.bore / ((reciprocatingMass(DEFAULT_DESIGN) * DEFAULT_DESIGN.stroke) / 2000);

const swatch = (color: string, shape = ''): string => `<i class="forces-swatch${shape}" style="--swatch:${color}"></i>`;

const viewName = (view: BalanceView, rotary: boolean): string =>
  view === 'order1' ? t('1-й порядок') : view === 'order2' ? t('2-й порядок') : rotary ? t('Ротори') : t('Обертові маси');

/** What the view shows and what its counterweights do, in a sentence or two. */
function aboutView(view: PhasorView, rotary: boolean): string {
  const weights = view.options.counterweights;
  switch (view.view) {
    case 'order1':
      return weights
        ? t('Сила кожного поршня вздовж осі циліндра, раз на оберт. Противаги гасять ту її половину, що крутиться з валом.')
        : t('Сила кожного поршня вздовж осі циліндра, раз на оберт.');
    case 'order2':
      return t('Сила кожного поршня вздовж осі циліндра, двічі на оберт. Противаги її не гасять, лише балансирні вали на подвійних обертах.');
    case 'rotating':
      if (rotary) return weights ? t('Ротори крутяться разом із валом. Противаги на шківі й у маховику гасять і їхню силу, і момент.') : t('Ротори крутяться разом із валом, і їхні сили теж.');
      return weights ? t('Нижні головки шатунів і шийки крутяться разом із валом. Противаги гасять їх повністю.') : t('Нижні головки шатунів і шийки крутяться разом із валом, і їхні сили теж.');
  }
}

/** The designer's choice counts the orders the shafts take out, the picture counts shafts. Says why they differ. */
function shaftNote(bf: BalanceForces): string {
  const chosen = bf.masses.shafts;
  const drawn = bf.shafts;
  if (chosen === 0) return '';
  if (drawn.length === 0) return chosen === 1 ? t('Валу 1-го порядку тут нічого гасити, тому його не намальовано.') : t('Балансирним валам тут нічого гасити, тому їх не намальовано.');
  if (chosen === 2 && drawn.length === 1) return t('Валам 2-го порядку тут нічого гасити, тому вал лише один.');
  if (drawn.length > chosen) return t('«Два» в конструкторі означає, що вали гасять обидва порядки. Тут на це потрібні три вали: один проти 1-го порядку й пара проти 2-го.');
  return '';
}

const sameMasses = (a: BalanceMasses, b: BalanceMasses): boolean =>
  a.reciprocatingKg === b.reciprocatingKg && a.rotatingKg === b.rotatingKg && a.rotorKg === b.rotorKg && a.shafts === b.shafts;

/** Width of the full card and its gap from the edge of the stage, as in balance-panel.css. */
const CARD_W = 350;
const CARD_GAP = 18;

export class BalancePanel {
  private readonly checkbox: HTMLInputElement;
  /** Spans the part of the stage between the side panels, so the card never slides under them. */
  private readonly stageBox = document.createElement('div');
  private readonly card = document.createElement('section');
  private engine: Engine | null = null;
  private model: EngineModel | null = null;
  private scale = 1;
  private forces: BalanceForces | null = null;
  private phasors: BalancePhasors | null = null;
  private overlay: BalanceOverlay | null = null;
  private readonly view: ViewControl | null;
  /** The forces put the model in X-ray, and no view has been chosen since: switching them off goes back. */
  private xrayed = false;
  private settingView = false;
  /** Height of the full card when it last showed, to tell whether it fits before showing it full again. */
  private fullHeight = 270;
  /** Viewport y the full card has to end above: other overlays on the right of the stage live under it. */
  private room: () => number = () => Infinity;
  private refit: () => void = () => {};
  /** What shareStage watches, let go when it is called again with another list. */
  private sharing: { disconnect(): void }[] = [];
  private on = false;
  /** The card is redrawn with each engine and set of layers, and must not fold the note back up. */
  private noteOpen = false;
  /** Speed of the last frame, and the one the figures were last written for. */
  private rpm = 0;
  private shownRpm = -1;
  private lastText = 0;

  /**
   * @param tools Row of view options under the stage, where the switch goes.
   * @param checkbox The switch, when the page put it there before this code loaded (forces-toggle.ts).
   * @param view The page's view of the model: arrows are seen best in X-ray, so they choose it while they show.
   */
  constructor(tools: HTMLElement, host: HTMLElement, checkbox: HTMLInputElement = forcesToggle(tools), view: ViewControl | null = null) {
    this.checkbox = checkbox;
    this.checkbox.addEventListener('change', () => this.show(this.checkbox.checked));
    this.view = view;
    view?.onChange(() => {
      if (!this.settingView) this.xrayed = false;
    });

    this.card.className = 'forces-card';
    this.card.hidden = true;
    this.card.setAttribute('aria-label', t('Сили інерції'));
    this.card.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-view]');
      if (!button) return;
      const choice = button.dataset.view as BalanceView | 'off';
      if (choice === 'off') {
        this.show(false);
        this.checkbox.focus();
        return;
      }
      chosen.view = choice;
      this.applyView();
      this.card.querySelector<HTMLButtonElement>(`button[data-view="${choice}"]`)?.focus();
    });
    this.card.addEventListener('change', (event) => {
      const input = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-option]');
      if (!input) return;
      const key = input.dataset.option as 'counterweights' | 'shafts';
      chosen[key] = input.checked;
      this.applyView();
      this.card.querySelector<HTMLInputElement>(`input[data-option="${key}"]`)?.focus();
    });
    this.stageBox.className = 'forces-stage';
    this.stageBox.append(this.card);
    host.append(this.stageBox);
    // Shrunk, the card sits just above the view options, whose height changes with the speed mode.
    new ResizeObserver(() => this.stageBox.style.setProperty('--tools-h', `${tools.offsetHeight}px`)).observe(tools);
    // The full card goes to the top right of the stage, unless it would cover the engine's name and the buttons
    // under it. Then it shrinks to the buttons and one line. The stage box resizes with the window and the side panels,
    // the name with each engine.
    const name = host.querySelector<HTMLElement>('.engine-name');
    // It shrinks too when what shares the right of the stage (shareStage) would end up under the full card.
    const fit = (): void => {
      const stage = this.stageBox.getBoundingClientRect();
      const nameRight = name?.getBoundingClientRect().right ?? stage.left;
      const topH = parseFloat(getComputedStyle(this.stageBox).getPropertyValue('--top-h')) || 0;
      const fullBottom = stage.top + topH + 8 + this.fullHeight;
      const compact = window.innerWidth <= 860 || stage.right - CARD_GAP - CARD_W < nameRight + 12 || fullBottom + 8 > this.room();
      this.card.classList.toggle('compact', compact);
      this.publish();
    };
    this.refit = fit;
    const fitter = new ResizeObserver(fit);
    fitter.observe(this.stageBox);
    if (name) fitter.observe(name);
    new ResizeObserver(() => this.publish()).observe(this.card);
  }

  /**
   * Other overlays on the right of the stage. `room` gives the viewport y the full card has to end above; while it
   * does not, the card takes its compact form at the bottom left. A change to the size, classes or visibility of any
   * of `watched` asks again. A later call replaces the earlier one: the valve gear's labels may load after the card.
   */
  shareStage(room: () => number, watched: HTMLElement[]): void {
    this.room = room;
    for (const old of this.sharing) old.disconnect();
    const again = (): void => this.refit();
    const observer = new MutationObserver(again);
    const sizes = new ResizeObserver(again);
    this.sharing = [observer, sizes];
    for (const element of watched) {
      observer.observe(element, { attributes: true, attributeFilter: ['class', 'hidden'] });
      sizes.observe(element);
    }
    again();
  }

  /**
   * The full card's height, for what moves under it (--forces-card-h), and the compact card's width, for what shares
   * its row at the bottom of the stage (--forces-compact-w). Each is 0 while the card has the other form or is hidden.
   */
  private publish(): void {
    const compact = this.card.classList.contains('compact');
    const full = !this.card.hidden && !compact;
    const height = full ? this.card.offsetHeight : 0;
    if (height > 0) this.fullHeight = height;
    document.documentElement.style.setProperty('--forces-card-h', `${height}px`);
    document.documentElement.style.setProperty('--forces-compact-w', `${!this.card.hidden && compact ? this.card.offsetWidth : 0}px`);
  }

  /**
   * The designer changed something the 3D model does not show, so the model stays. New masses rebuild the arrows,
   * a new rev limit only the figures.
   */
  updateEngine(engine: Engine): void {
    const before = this.engine;
    if (!before || engine === before) return;
    this.engine = engine;
    if (!sameMasses(massesOf(engine.spec), massesOf(before.spec))) {
      this.overlay?.dispose();
      this.overlay = null;
      this.forces = null;
      this.phasors = null;
      if (this.on) this.build();
    } else if (engine.spec.redlineRpm !== before.spec.redlineRpm) {
      this.render();
    }
  }

  /** A new model on the stage. Arrows are built only while they are shown. */
  setEngine(engine: Engine, model: EngineModel, inDesigner: boolean): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.forces = null;
    this.phasors = null;
    this.engine = engine;
    this.model = model;
    this.scale = inDesigner ? designerArrowScale() : pageArrowScale(engine.spec.id);
    if (this.on) this.build();
  }

  get isOn(): boolean {
    return this.on;
  }

  show(on: boolean): void {
    const was = this.on;
    this.on = on;
    this.checkbox.checked = on;
    this.card.hidden = !on;
    document.body.classList.toggle('forces-on', on);
    if (on && !was) this.toXray();
    if (!on && was) this.fromXray();
    this.refit();
    if (on && !this.overlay) this.build();
    if (this.overlay) this.overlay.group.visible = on;
  }

  /** The whole model would hide the arrows inside it: they show in X-ray unless the visitor chooses otherwise. */
  private toXray(): void {
    const view = this.view;
    if (!view || view.mode !== 'solid') return;
    this.setMode('xray');
    this.xrayed = true;
  }

  private fromXray(): void {
    const view = this.view;
    if (!view || !this.xrayed) return;
    this.xrayed = false;
    if (view.mode === 'xray') this.setMode('solid');
  }

  private setMode(mode: 'solid' | 'xray'): void {
    this.settingView = true;
    try {
      this.view!.set(mode);
    } finally {
      this.settingView = false;
    }
  }

  /** The view the visitor chose, or the first this engine has: a rotary has only its turning masses. */
  private currentView(): PhasorView | null {
    const ph = this.phasors;
    if (!ph) return null;
    const view = ph.views.includes(chosen.view) ? chosen.view : ph.views[0]!;
    return ph.view(view, { counterweights: chosen.counterweights, shafts: chosen.shafts });
  }

  /** A new view or switch: the arrows and the card follow. */
  private applyView(): void {
    this.overlay?.setView(this.on ? this.currentView() : null);
    if (this.overlay) this.overlay.group.visible = this.on;
    this.render();
  }

  /** Every frame: the crank angle on screen and the speed the figures are for. */
  frame(theta: number, rpm: number): void {
    this.rpm = rpm;
    if (!this.on || !this.overlay) return;
    this.overlay.update(theta);
    const now = performance.now();
    if (Math.abs(rpm - this.shownRpm) > Math.max(1, rpm * 0.01) && now - this.lastText > 250) {
      this.lastText = now;
      this.updateNow();
    }
  }

  /** Only the figures for the current speed change with it. The buttons stay, and keep their focus. */
  private updateNow(): void {
    const view = this.currentView();
    const line = this.card.querySelector('.forces-line-text');
    if (!view || !this.engine || !line) return;
    // The card may be drawn before the first frame with it on: the speed of the last frame is already known.
    const rpm = Math.max(0, this.rpm);
    this.shownRpm = rpm;
    const limit = this.engine.spec.redlineRpm;
    const force = view.force.locus.major;
    const couple = view.couple.locus.major;
    line.textContent = t('Сума: зараз {force} Н, {couple} Н·м · на межі {forceMax} Н, {coupleMax} Н·м', {
      force: num(atRpm(force, rpm)),
      couple: num(atRpm(couple, rpm)),
      forceMax: num(atRpm(force, limit)),
      coupleMax: num(atRpm(couple, limit)),
    });
    line.parentElement!.title = t('Найбільша сума за оберт: зараз на {rpm} об/хв, на межі на {limit} об/хв', { rpm: num(rpm), limit: num(limit) });
  }

  private build(): void {
    if (!this.engine || !this.model) return;
    this.forces = new BalanceForces(this.engine, massesOf(this.engine.spec));
    this.phasors = new BalancePhasors(this.forces);
    this.overlay = new BalanceOverlay(this.phasors, this.scale);
    this.model.mounted.add(this.overlay.group);
    this.applyView();
  }

  private render(): void {
    const bf = this.forces;
    const ph = this.phasors;
    const view = this.currentView();
    if (!bf || !ph || !view || !this.engine) return;
    const rotary = bf.engine.isRotary;
    const shafts = bf.shafts.length > 0;
    const views = [...ph.views, 'off' as const].map((v) => {
      const name = v === 'off' ? t('Вимкнено') : viewName(v, rotary);
      return `<button type="button" data-view="${v}" aria-pressed="${v === view.view}">${name}</button>`;
    });
    const option = (key: 'counterweights' | 'shafts', color: string, name: string): string =>
      `<label class="forces-option"><input type="checkbox" data-option="${key}"${chosen[key] ? ' checked' : ''} />${swatch(color)}${name}</label>`;
    const options = [
      ph.hasCounterweights(view.view) ? option('counterweights', FORCE_COLORS.counterweight, t('Противаги')) : '',
      ph.hasShafts(view.view) ? option('shafts', FORCE_COLORS.shaft, t('Вали')) : '',
    ].join('');
    // The legend names what this view draws, in the order it lists its elements.
    const kinds: string[] = [];
    const legend: string[] = [];
    for (const el of view.elements) {
      if (kinds.includes(el.kind)) continue;
      kinds.push(el.kind);
      legend.push(`<span>${swatch(colorOf({ kind: el.kind, order: view.order }))}${KIND_WORDS[el.kind]}</span>`);
    }
    legend.push(`<span>${swatch(FORCE_COLORS.net)}${t('сума')}</span>`, `<span>${swatch(FORCE_COLORS.couple, ' arc')}${t('момент гойдання')}</span>`);
    const left = bf.left();
    const after = shafts ? t('Після противаг і балансирних валів') : t('Після противаг');
    // A rotary's one view already says all there is: its counterweights cancel everything.
    const verdict = rotary
      ? ''
      : left.length
        ? t('{after} лишається: {list}.', { after, list: left.map((k) => LEFT_WORDS[k]).join(', ') })
        : bf.higherLeft()
          ? t('{after} сили й моменти 1-го і 2-го порядків гасять одне одного. Лишаються лише слабкі вищі порядки.', { after })
          : t('{after} сили й моменти гасять одне одного: двигун урівноважений.', { after });
    const note = shaftNote(bf);
    this.card.innerHTML = `
      <h2 class="forces-title">${t('Сили інерції')}</h2>
      <div class="segmented forces-views" role="group" aria-label="${t('Які сили показати')}">${views.join('')}</div>
      ${options ? `<div class="forces-options">${options}</div>` : ''}
      <p class="forces-line">${swatch(FORCE_COLORS.net)}<span class="forces-line-text"></span></p>
      <p class="forces-about">${aboutView(view, rotary)}</p>
      <p class="forces-legend">${legend.join('')}</p>
      ${verdict || note ? `<p class="forces-verdict">${[verdict, note].filter(Boolean).join(' ')}</p>` : ''}
      <details class="forces-note"${this.noteOpen ? ' open' : ''}><summary>${t('Як читати стрілки')}</summary>${t('Тонкі стрілки — сили вибраного виду там, де вони діють, а велика біла стрілка в центрі колінвала — їхня сума. Дуга моменту така, як сила, що дала б цей момент на плечі між сусідніми циліндрами. Довжина стрілок від обертів не залежить: усі сили ростуть із квадратом обертів однаково. Три види разом — уся сила інерції двигуна, крім слабких вищих порядків, яких не показує жоден. Маси деталей оцінено за їхніми розмірами.')}</details>`;
    this.card.querySelector('details')!.addEventListener('toggle', (event) => (this.noteOpen = (event.target as HTMLDetailsElement).open));
    this.updateNow();
  }
}
