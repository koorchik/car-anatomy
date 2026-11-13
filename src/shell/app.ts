// The shell: the page's skeleton and its layout, the stage, the frame loop, the address, the keys, the time and the
// parts' cards. Sections (section.ts) fill the skeleton and draw their pages; the shell hands them the context.

import { locale, switchLocale, type Locale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { Stage } from '../scene/stage.ts';
import { ShellAudio } from './audio-host.ts';
import type { FreezeOptions } from './freeze.ts';
import { ShellIdle } from './idle.ts';
import { SHELL_KEYS, ShellKeys } from './keys.ts';
import { partUi } from './part-ui.ts';
import { router } from './router.ts';
import type { Route } from './routes.ts';
import { ShellRuns } from './run-store.ts';
import { ScaleBar } from './scale-bar.ts';
import type { PanelControl, PanelSide, Section, SectionContext, TimeCapabilities } from './section.ts';
import { skeletonHtml, skeletonOf, type SkeletonElements } from './skeleton.ts';
import { ShellTime } from './time.ts';
import { ShellView } from './view.ts';

/** Below this width the side panels are sheets over the stage. */
const PHONE_WIDTH = 860;

/** What the time control offers before any section is shown. */
const NO_SECTION: TimeCapabilities = { modes: ['slow', 'readable', 'real'] };

export class Shell {
  readonly stage: Stage;
  private readonly context: SectionContext;
  private readonly root: HTMLElement;
  private readonly sections: readonly Section[];
  private readonly elements: SkeletonElements;
  private readonly audio = new ShellAudio();
  private readonly idle = new ShellIdle();
  private readonly time: ShellTime;
  private readonly scaleBar: ScaleBar;
  private readonly mounted = new Set<Section>();
  private shown: Section | null = null;
  private route: Route | null = null;
  private readonly open: Record<PanelSide, boolean>;
  private wasSmall: boolean;
  private lastFrame = performance.now();

  /** Builds the skeleton in `root`. The first section is the home of every address no other section claims. */
  constructor(root: HTMLElement, sections: readonly Section[]) {
    this.root = root;
    this.sections = sections;
    document.documentElement.lang = locale;
    document.title = t('Анатомія авто');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('Інтерактивна база знань про будову автомобіля: 3D-моделі двигунів, які можна крутити, запускати і слухати.'));
    root.innerHTML = skeletonHtml();
    const { slots, elements } = skeletonOf(root);
    this.elements = elements;
    try {
      this.stage = new Stage(elements.canvas);
    } catch (error) {
      console.error(error);
      root.innerHTML = `<div class="no-webgl"><p>${t('Ця сторінка показує двигуни у 3D, а браузер не зміг увімкнути WebGL. Спробуй увімкнути апаратне прискорення або відкрий сторінку в іншому браузері.')}</p></div>`;
      throw error;
    }
    const small = window.innerWidth <= PHONE_WIDTH;
    this.open = { right: !small, left: !small };
    this.wasSmall = small;

    const keys = new ShellKeys(window, () => slots.table.isOpen);
    this.time = new ShellTime(elements.speed, () => this.shown?.time() ?? NO_SECTION);
    const view = new ShellView(elements.view);
    const panels: PanelControl = {
      isOpen: (side) => this.open[side],
      setOpen: (side, open) => {
        this.open[side] = open;
      },
      relayout: () => this.relayout(),
    };
    this.context = { stage: this.stage, audio: this.audio, slots, router, idle: this.idle, runs: new ShellRuns(), keys, time: this.time, view, panels };

    keys.bind(SHELL_KEYS, [
      { codes: ['Escape'], label: t('Закрити'), reach: 'always', down: () => slots.table.open(false) },
      { codes: ['Digit1'], label: t('Двигун'), down: () => view.set('solid') },
      { codes: ['Digit2'], label: t('Рентген'), down: () => view.set('xray') },
      { codes: ['Digit3'], label: t('Механізм'), down: () => view.set('mechanism') },
    ]);
    const setPanel = (side: PanelSide, open: boolean): void => {
      this.open[side] = open;
      this.relayout();
    };
    elements.panelClose.addEventListener('click', () => setPanel('right', false));
    elements.panelToggleClosed.addEventListener('click', () => setPanel('right', true));
    elements.panelOpen.addEventListener('click', () => setPanel('right', true));
    elements.resultsOpen.addEventListener('click', () => setPanel('left', true));
    elements.resultsClose.addEventListener('click', () => setPanel('left', false));
    for (const button of root.querySelectorAll<HTMLButtonElement>('.lang-switch button')) {
      const language = button.dataset.lang as Locale;
      button.classList.toggle('active', language === locale);
      button.setAttribute('aria-pressed', String(language === locale));
      if (language !== locale) button.addEventListener('click', () => switchLocale(language));
    }
    // A link to where we already are changes no route, and the list must still close.
    slots.table.body.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('a')) slots.table.open(false);
    });
    elements.tableClose.addEventListener('click', () => slots.table.open(false));
    partUi(this.stage, { canvas: elements.canvas, tip: elements.partTip, card: slots.partCard, callout: elements.partsCallout });
    this.scaleBar = new ScaleBar(this.stage, elements.scaleLine, elements.scaleLabel);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.stage.setOrbit(false);
    window.addEventListener('hashchange', () => this.go(router.current));
  }

  /** Shows the section of the current address and starts the frame loop. */
  start(): void {
    const route = router.current;
    const section = this.sectionFor(route);
    this.show(section);
    new ResizeObserver(() => this.relayout()).observe(this.root);
    this.relayout();
    this.route = route;
    section.enter(route, null);
    requestAnimationFrame(this.frame);
  }

  /**
   * Holds the page still for a snapshot, the same way before and after a change (freeze.ts). Null lets go. The
   * section takes the camera home on its next frame, once the model stands at the frozen angle (TimeControl.frozen).
   */
  freeze(options: FreezeOptions | null): void {
    this.time.freeze(options);
    if (!options) this.stage.freeze(null);
  }

  private sectionFor(route: Route): Section {
    return this.sections.find((s) => s.id === route.section) ?? this.sections[0]!;
  }

  private show(section: Section): void {
    if (!this.mounted.has(section)) {
      this.mounted.add(section);
      section.mount(this.context);
    }
    this.shown = section;
    this.time.refresh();
  }

  private go(route: Route): void {
    const from = this.route;
    this.route = route;
    const section = this.sectionFor(route);
    if (section !== this.shown) {
      this.shown?.leave(route);
      this.show(section);
      this.relayout();
    }
    section.enter(route, from);
  }

  /** The panels from the section's sizes, the stage's insets, then the section's charts. */
  private relayout(): void {
    const section = this.shown;
    if (!section) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const small = width <= PHONE_WIDTH;
    // Crossing the phone width: a side panel would otherwise become a sheet covering the model.
    if (small !== this.wasSmall) {
      this.wasSmall = small;
      this.open.right = !small;
      this.open.left = !small;
    }
    const sizes = section.layout({ width, height, small });
    const panelW = this.open.right && !small ? sizes.right : 0;
    const leftW = this.open.left && !small ? sizes.left : 0;
    const el = this.elements;
    const css = document.documentElement.style;
    el.resultsPanel.classList.toggle('closed', !this.open.left);
    el.resultsOpen.hidden = !(small && sizes.left > 0);
    el.panelOpen.textContent = sizes.rightLabel;
    css.setProperty('--left-w', `${leftW}px`);
    el.panel.classList.toggle('closed', !this.open.right);
    document.body.classList.toggle('panel-closed', !this.open.right);
    el.panelToggleClosed.hidden = this.open.right || small;
    el.panelOpen.hidden = !small;
    el.panelClose.textContent = small ? t('Закрити') : t('Сховати');
    css.setProperty('--stage-right', `${panelW}px`);
    css.setProperty('--stage-left', `${leftW}px`);
    css.setProperty('--panel-w', `${panelW}px`);
    css.setProperty('--stage-x', `${((leftW + (width - leftW - panelW) / 2) / width) * 100}%`);
    // The view options wrap into more rows on a narrower stage; the model is framed above them as before.
    const toolsH = el.tools.offsetHeight + 8;
    const topH = small ? 90 : 60;
    this.stage.resize(width, height, { left: leftW, right: panelW, top: topH, bottom: sizes.dash + (small ? Math.max(30, toolsH - 48) : Math.max(28, toolsH * 0.4)) });
    section.laidOut?.();
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const frozen = this.time.frozen !== null;
    // A frozen page stands still: nothing drawn gets any time to move.
    const dt = frozen ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.audio.tick(dt, frozen);
    this.idle.run();
    this.shown?.frame(dt, now);
    this.stage.render(dt);
    this.scaleBar.update();
  };
}
