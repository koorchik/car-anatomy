// What the engine pages lay over and around the model: the force arrows and their card, the systems layers, the dyno
// and the valve gear's labels. They share the right of the stage, so they are made and placed together.
//
// The systems' switches and card come with the section: they set the height of the row of tools that the rest of the
// page is laid out by, and bring back the layers a visitor left on. The force arrows, the dyno and the valve gear's
// labels load the first time they are used (chunks.ts). Their switches are on the page from the start, built the way
// the features build them, and each feature is brought up to date with the page when its code arrives.

import type { Engine } from '../../engine/kinematics.ts';
import type { BalancePanel } from '../balance-panel.ts';
import type { DynoPanel, EngineSource } from '../dyno/dyno-panel.ts';
import { dynoColumn, dynoToggle } from '../dyno/toggle.ts';
import { forcesToggle } from '../forces-toggle.ts';
import { SystemsView } from '../systems-view.ts';
import type { ValveReadout } from '../valve-readout.ts';
import { DYNO, FORCES, VALVES } from './chunks.ts';
import { $ } from './dom.ts';
import type { EnginesSection } from './section.ts';

/** Room the switches and a card of a few lines need under the force card, when the systems sit at the top right. */
const SYSTEMS_ASIDE_ROOM = 200;

export class EngineFeatures {
  readonly systems: SystemsView;
  /** Each of these is null until its code has loaded. */
  balance: BalancePanel | null = null;
  dyno: DynoPanel | null = null;
  valves: ValveReadout | null = null;
  private readonly section: EnginesSection;
  private readonly forcesSwitch: HTMLInputElement;
  private readonly dynoButton: HTMLButtonElement;
  private readonly dynoPlace: HTMLElement;
  /** The engine on the page and where it came from, for a dyno that loads later. */
  private dynoFor: { engine: Engine; source: EngineSource } | null = null;

  constructor(section: EnginesSection) {
    this.section = section;
    const { slots, view } = section.ctx;
    this.forcesSwitch = forcesToggle(slots.tools.parent);
    // Once the arrows' code is here it listens to the switch itself.
    this.forcesSwitch.addEventListener('change', () => {
      if (!this.balance) void this.loadForces().then((balance) => balance.show(this.forcesSwitch.checked));
    });
    this.systems = new SystemsView($('systems-tool'), $('systems-readout'), {
      wantXray: () => view.set('xray'),
      wantAssembled: () => {
        section.explode = 0;
        $<HTMLInputElement>('explode').value = '0';
        section.model?.setExplode(0);
        this.systems.setExplode(0);
      },
      markers: (markers) => section.dash.firing.setMarkers(markers),
    });
    this.dynoButton = dynoToggle();
    this.dynoButton.addEventListener('click', () => {
      if (!this.dyno) void this.loadDyno().then((dyno) => dyno.setActive(true));
    });
    $('to-designer').before(this.dynoButton);
    this.dynoPlace = dynoColumn();
    slots.dash.add(this.dynoPlace);
  }

  /** The engine the dyno measures changed. Kept for a dyno that is not here yet. */
  setDynoEngine(engine: Engine, source: EngineSource): void {
    this.dynoFor = { engine, source };
    this.dyno?.setEngine(engine, source);
  }

  /** The force arrows, loaded if need be. */
  async loadForces(): Promise<BalancePanel> {
    const { BalancePanel } = await FORCES.load();
    if (this.balance) return this.balance;
    const s = this.section;
    const { slots } = s.ctx;
    const app = slots.root;
    const balance = new BalancePanel(slots.tools.parent, app, this.forcesSwitch);
    this.balance = balance;
    // The valve gear's labels stay after the card, as they were when both were made at the start.
    if (this.valves) app.append(this.valves.element);
    if (s.model) balance.setEngine(s.engine, s.model, s.onDesigner);
    // The force card turns compact, grows or hides on its own schedule, and the list of engines makes room for it.
    const card = app.querySelector<HTMLElement>('.forces-card');
    if (card) new ResizeObserver(() => s.catalogue.fitVariants()).observe(card);
    this.shareStage();
    return balance;
  }

  /** The dyno, loaded if need be. */
  async loadDyno(): Promise<DynoPanel> {
    const { DynoPanel } = await DYNO.load();
    if (this.dyno) return this.dyno;
    const s = this.section;
    const { stage, panels, time, view } = s.ctx;
    const dyno = new DynoPanel({
      drive: s.drive,
      extras: stage.extras,
      setFloor(y) {
        stage.setFloor(y);
      },
      layout() {
        panels.relayout();
        stage.fit(false, true);
      },
      leaveSlowMotion() {
        if (time.mode === 'slow') time.set('readable');
      },
      // Slow motion locks the crank at walking pace, where no absorber can work (EnginesSection.time).
      changed() {
        time.refresh();
      },
      toggle: this.dynoButton,
      column: this.dynoPlace,
    });
    this.dyno = dyno;
    if (s.model) dyno.attachModel(s.model);
    dyno.setView(view.mode);
    dyno.setExplode(s.explode);
    if (this.dynoFor) dyno.setEngine(this.dynoFor.engine, this.dynoFor.source);
    return dyno;
  }

  /** The valve gear's labels, loaded if need be. Only an engine with variable valve gear asks for them. */
  async loadValves(): Promise<ValveReadout> {
    const { ValveReadout } = await VALVES.load();
    if (this.valves) return this.valves;
    const valves = new ValveReadout();
    this.valves = valves;
    this.section.ctx.slots.root.append(valves.element);
    // The labels wrap into more rows beside the compact force card: the systems card above them stops higher.
    new ResizeObserver(() => document.documentElement.style.setProperty('--valve-state-h', `${valves.element.offsetHeight}px`)).observe(valves.element);
    valves.setEngine(this.section.engine.spec);
    if (this.balance) this.shareStage();
    return valves;
  }

  /** Every feature's code at once, as the snapshots of the pages need it, in the order the pages once made them. */
  async loadAll(): Promise<void> {
    await Promise.all([FORCES.load(), DYNO.load(), VALVES.load()]);
    await this.loadForces();
    await this.loadDyno();
    await this.loadValves();
  }

  /**
   * The full force card, the systems switches and card and the valve gear's labels all live on the right of the stage.
   * The force card keeps its full form only while the others still fit under it.
   */
  private shareStage(): void {
    const balance = this.balance;
    if (!balance) return;
    const { slots } = this.section.ctx;
    const app = slots.root;
    const valves = this.valves?.element ?? null;
    balance.shareStage(
      () => {
        const shown = (e: HTMLElement): boolean => !e.hidden && e.offsetParent !== null;
        const tool = $('systems-tool');
        const readout = $('systems-readout');
        let limit = valves && shown(valves) ? valves.getBoundingClientRect().top : Infinity;
        if (shown(tool) && tool.classList.contains('aside')) {
          limit = Math.min(limit, app.getBoundingClientRect().bottom - parseFloat(getComputedStyle(app).getPropertyValue('--dash-h')) - 116);
          return limit - SYSTEMS_ASIDE_ROOM;
        }
        if (shown(readout)) limit = Math.min(limit, readout.getBoundingClientRect().top);
        return limit;
      },
      // The dash grows on the dyno and the row of view options with the speed mode: both move the bottom right.
      [$('systems-tool'), $('systems-readout'), ...(valves ? [valves] : []), slots.dash.parent, slots.tools.parent],
    );
  }
}
