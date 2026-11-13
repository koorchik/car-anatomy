// What the engine pages lay over and around the model: the force arrows and their card, the systems layers, the dyno
// and the valve gear's labels. They share the right of the stage, so they are made and placed together.

import { BalancePanel } from '../balance-panel.ts';
import { DynoPanel } from '../dyno/dyno-panel.ts';
import { SystemsView } from '../systems-view.ts';
import { ValveReadout } from '../valve-readout.ts';
import { $ } from './dom.ts';
import type { EnginesSection } from './section.ts';

/** Room the switches and a card of a few lines need under the force card, when the systems sit at the top right. */
const SYSTEMS_ASIDE_ROOM = 200;

export class EngineFeatures {
  readonly balance: BalancePanel;
  readonly systems: SystemsView;
  readonly dyno: DynoPanel;
  readonly valves: ValveReadout;

  constructor(section: EnginesSection) {
    const { slots, stage, panels, time, view } = section.ctx;
    const app = slots.root;
    const tools = slots.tools.parent;
    this.balance = new BalancePanel(tools, app);
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
    this.dyno = new DynoPanel({
      drive: section.drive,
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
    });
    slots.dash.add(this.dyno.element);
    $('to-designer').before(this.dyno.toggleButton);
    this.valves = new ValveReadout();
    app.append(this.valves.element);
    // The labels wrap into more rows beside the compact force card: the systems card above them stops higher.
    new ResizeObserver(() => document.documentElement.style.setProperty('--valve-state-h', `${this.valves.element.offsetHeight}px`)).observe(this.valves.element);
    // The full force card, the systems switches and card and the valve gear's labels all live on the right of the stage.
    // The force card keeps its full form only while the others still fit under it.
    const valves = this.valves.element;
    this.balance.shareStage(() => {
      const shown = (e: HTMLElement): boolean => !e.hidden && e.offsetParent !== null;
      const tool = $('systems-tool');
      const readout = $('systems-readout');
      let limit = shown(valves) ? valves.getBoundingClientRect().top : Infinity;
      if (shown(tool) && tool.classList.contains('aside')) {
        limit = Math.min(limit, app.getBoundingClientRect().bottom - parseFloat(getComputedStyle(app).getPropertyValue('--dash-h')) - 116);
        return limit - SYSTEMS_ASIDE_ROOM;
      }
      if (shown(readout)) limit = Math.min(limit, readout.getBoundingClientRect().top);
      return limit;
      // The dash grows on the dyno and the row of view options with the speed mode: both move the bottom right.
    }, [$('systems-tool'), $('systems-readout'), valves, slots.dash.parent, tools]);
  }
}
