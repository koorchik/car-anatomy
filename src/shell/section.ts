// The contract between the shell and a section of the site (the plan of the whole car, section contract). The shell
// owns what every page shares: the skeleton and its layout, the stage, the sound, the frame loop, the address, the
// keys and the time. A section owns what it shows: its model, panels, dash, article and table.
//
// These are the final interfaces: stages after this one fill in the shell's side (the menu, the help of the keys,
// the slow-down ×k on screen) without changing them, so a section written now keeps working.

import type { Drive, DriveSnapshot } from '../audio/drive.ts';
import type { Engine } from '../engine/kinematics.ts';
import type { ViewMode } from '../scene/model-types.ts';
import type { Stage } from '../scene/stage.ts';
import type { FreezeOptions } from './freeze.ts';
import type { Router } from './router.ts';
import type { Route, SectionId } from './routes.ts';

export type { Route, SectionId };

// ---------------------------------------------------------------------------------------------------------------
// Places in the skeleton

/** A place in the page's skeleton that a section fills. */
export interface Slot {
  /** The element the content goes into. */
  readonly parent: HTMLElement;
  /** Puts markup (parsed in place) or nodes here, after whatever was put here before. */
  add(...content: Array<string | Node>): void;
}

/** The overlay that holds a section's catalogue table. */
export interface TableOverlay {
  /** The heading over the table, before its close button. */
  readonly head: Slot;
  /** The table itself: the section writes it. */
  readonly body: HTMLElement;
  readonly isOpen: boolean;
  /** Shows or hides the table; Esc hides it on every page. */
  open(on: boolean): void;
}

/** Where a section's content goes. The ids inside are those the page has always had (#ignition, #pedal and so on). */
export interface ShellSlots {
  /** The page root. A section's overlays without a place of their own go at its end. */
  readonly root: HTMLElement;
  /** Behind the 3D picture: a section's emblem, such as the engine's badge. */
  readonly backdrop: Slot;
  /** The section's buttons in the top bar, before the buttons that open the side panels on a phone. */
  readonly actions: Slot;
  /** The row above the stage: the page's name, the line under it, its buttons and lists. */
  readonly title: Slot;
  /** The row of tools under the stage, after the shell's view and time controls. */
  readonly tools: Slot;
  /** Lines and cards over the stage, after the scale bar: warnings, status, readouts. */
  readonly status: Slot;
  /** The heading of the right panel. */
  readonly panelTitle: HTMLElement;
  /** The right panel under its heading: the section's scrolling bodies (`.panel-scroll`). */
  readonly panel: Slot;
  /** The left panel under its heading. */
  readonly results: Slot;
  /** The bottom dash. */
  readonly dash: Slot;
  /** After the dash: a page's own dash and the lines over it, shown in place of the shared one. */
  readonly afterDash: Slot;
  /** The card a click on a part opens. A section hides it when the model it describes goes away. */
  readonly partCard: HTMLElement;
  /** The tooltip the charts share. */
  readonly tooltip: HTMLElement;
  readonly table: TableOverlay;
}

// ---------------------------------------------------------------------------------------------------------------
// Layout

export interface Viewport {
  width: number;
  height: number;
  /** A phone: the side panels become sheets over the stage. */
  small: boolean;
}

/** What a page needs around the stage. The shell turns it into the stage's insets and the CSS variables. */
export interface PanelSizes {
  /** Width of the right panel while it is open, px. */
  right: number;
  /** Width of the left panel while it is open, px; 0 when the page has none. */
  left: number;
  /** Height of the dash at the bottom, px. */
  dash: number;
  /** Name of the button that opens the right panel on a phone. */
  rightLabel: string;
}

export type PanelSide = 'right' | 'left';

export interface PanelControl {
  isOpen(side: PanelSide): boolean;
  /** Opens or closes a side panel. The page follows on the next relayout(). */
  setOpen(side: PanelSide, open: boolean): void;
  /** Lays the page out again: the panels from Section.layout, the stage's insets, then Section.laidOut. */
  relayout(): void;
}

// ---------------------------------------------------------------------------------------------------------------
// View

export interface ViewControl {
  /** The view chosen now: the model whole (named by Section.solidLabel), in X-ray, or only its mechanism. */
  readonly mode: ViewMode;
  /** Chooses a view, as the control or a key would. Listeners hear it even when it was already chosen. */
  set(mode: ViewMode): void;
  /** Called after every set(). Gives back the function that removes the listener. */
  onChange(listener: (mode: ViewMode) => void): () => void;
}

// ---------------------------------------------------------------------------------------------------------------
// Time (the plan's section on time)

/**
 * 'real': true angles and true time. 'readable': rotation slowed by one factor for the whole assembly. 'slow': the
 * crank held at walking pace, another physical state. 'slowdown' (×k): true physics with fewer steps a frame, a clock
 * on screen and no sound.
 */
export type TimeMode = 'real' | 'readable' | 'slow' | 'slowdown';

/** Which time controls a page offers (Section.time()). */
export interface TimeCapabilities {
  /** The modes this page offers, in the order the control shows them. */
  modes: readonly TimeMode[];
  /** Offered modes that cannot be chosen right now, each with the reason the hint beside it gives. */
  unavailable?: Partial<Record<TimeMode, string>>;
  /** The factors k the slow-down offers, such as 0.1 for a tenth of real time. */
  slowdown?: readonly number[];
}

export interface TimeControl {
  readonly mode: TimeMode;
  /** The factor of the slow-down; 1 in the other modes. */
  readonly factor: number;
  /**
   * Set while the page is held still for a snapshot (window.__engine.freeze), null otherwise. While it is set the
   * frame's dt is 0. A section shows its model at `theta` and, on the first frame of each new freeze (a new object),
   * calls stage.freeze({ quality, orbit }) once the model stands at that angle, then moves to its page's home view.
   */
  readonly frozen: FreezeOptions | null;
  /** Chooses a mode, as the control would. A mode the page does not offer, or not now, is refused: false. */
  set(mode: TimeMode, factor?: number): boolean;
  /** Called after every accepted set(). Gives back the function that removes the listener. */
  onChange(listener: (mode: TimeMode) => void): () => void;
  /**
   * Asks the page for its capabilities again, after something they depend on changed (the dyno went on). The shell
   * asks too when it shows another section. A mode no longer offered gives way to 'readable', 'real' or the page's
   * first mode, through set(), so `mode` is always one the page has.
   */
  refresh(): void;
  /** The simulated time shown beside the slow-down, seconds; null hides it. */
  clock(seconds: number | null): void;
}

// ---------------------------------------------------------------------------------------------------------------
// Keys (the plan's section on keys)

/**
 * Where focus may be for a key to still work. 'page' (the default): anywhere but a text field, a slider or a
 * checkbox. 'controls': on a slider or a checkbox too (the gas on Space). 'always': in a text field too, and while an
 * overlay such as the table is open (Esc).
 */
export type KeyReach = 'page' | 'controls' | 'always';

export interface KeyBinding {
  /** KeyboardEvent.code values: 'KeyS', 'Digit1', 'Space', 'ArrowLeft'. */
  codes: readonly string[];
  /**
   * What the key does, through t(), for the help «?». Null leaves the binding out of the help: a key a page only holds
   * back, so that a context under it does not get it (the layer keys on the oil page), or one that adds to what a later
   * context's binding of the code already says (Esc closing the dyno's help before the shell closes the table).
   */
  label: string | null;
  /** Pressed. Return false when the key did nothing after all, and the next context gets it. */
  down(event: KeyboardEvent): boolean | void;
  /** Released, for keys held down such as the gas. Every active binding of the code hears it, wherever focus is. */
  up?(event: KeyboardEvent): void;
  reach?: KeyReach;
}

export interface KeyMap {
  /**
   * Adds bindings under a context: 'shell', a section's id, or a page of it ('engines/sump'). A code bound twice in
   * one context throws. Gives back the function that removes them.
   */
  bind(context: string, bindings: readonly KeyBinding[]): () => void;
  /**
   * The section's contexts that listen now, the most specific first; the shell's own come last. A key goes to the
   * first binding that has its code and reaches where focus is.
   */
  use(contexts: readonly string[]): void;
  /** Every binding with its context, for the help «?». */
  bindings(): ReadonlyArray<{ context: string; binding: KeyBinding }>;
}

// ---------------------------------------------------------------------------------------------------------------
// Services

/** The one Drive of the site: the engine heard and turned. */
export interface AudioHost {
  /** Made by the first call, with this engine. Later calls give the same Drive; changing its engine is the caller's. */
  drive(engine: Engine): Drive;
  /** The Drive, once a section has asked for it. */
  readonly current: Drive | null;
  /** This frame's state of the engine: the shell ticks the Drive once a frame, before the section's frame. */
  readonly snapshot: DriveSnapshot | null;
}

/** Work done in pieces inside the frame's budget: laps, oil runs, road segments, sensitivity passes. */
export interface IdleQueue {
  /** `step` does a small piece and returns true when all is done. Gives back the function that drops the work. */
  add(step: () => boolean): () => void;
}

/** Results that outlive a page, such as the last dyno run. */
export interface RunStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

// ---------------------------------------------------------------------------------------------------------------
// The contract

export interface SectionContext {
  stage: Stage;
  audio: AudioHost;
  slots: ShellSlots;
  router: Router;
  idle: IdleQueue;
  runs: RunStore;
  keys: KeyMap;
  time: TimeControl;
  view: ViewControl;
  panels: PanelControl;
}

export interface Section {
  readonly id: SectionId;
  /** What the first view, the model whole, is called on this section's pages, through t(): engine, gearbox, car. */
  readonly solidLabel: string;
  /** Once, before the section is first shown: builds its DOM into the slots, registers its parts and keys. */
  mount(ctx: SectionContext): void;
  /** Every route of this section, the first one included (from is null then). The same route twice changes nothing. */
  enter(route: Route, from: Route | null): void;
  /** Stops timers and sound requests, hides its slots, gives the stage back. Keeps state for coming back. */
  leave(to: Route): void;
  /** Each animation frame while the section is shown, before the stage is drawn. */
  frame(dt: number, now: number): void;
  /** Sizes of its panels; the shell turns them into the stage's insets. */
  layout(viewport: Viewport): PanelSizes;
  /** After the shell has applied the sizes: what fills a panel or the dash takes its new size. */
  laidOut?(): void;
  /** Which time controls the current page offers. */
  time(): TimeCapabilities;
}
