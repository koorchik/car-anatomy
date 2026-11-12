// The systems layers of one model: built lazily, the first time each is switched on in the X-ray, and fed every frame
// from SystemsSim. They live inside the model's groups, so they shake with it and go when it is disposed.

import type { Engine } from '../../engine/kinematics.ts';
import { systemsOf } from '../../engine/systems-spec.ts';
import type { SystemsState } from '../../systems/sim.ts';
import { turboCountOf } from '../../systems/size.ts';
import { sumpLayout } from '../../systems/sump.ts';
import type { EngineModel, ViewMode } from '../model-types.ts';
import type { EngineAnchors, SystemsLook } from './anchors.ts';
import { SystemLayer, type LayerStyle } from './layer.ts';
import { mainBearingZ, oilPlan } from './routes-oil.ts';
import { rotaryOilPlan } from './routes-rotary.ts';
import type { LayerPlan } from './route.ts';

export type LayerId = 'oil' | 'coolant' | 'fuel' | 'air';
export const LAYER_IDS: LayerId[] = ['oil', 'coolant', 'fuel', 'air'];

export const LAYER_STYLES: Record<LayerId, LayerStyle> = {
  oil: { color: '#e8a93a', hotColor: '#ffd27a', period: 0.3 },
  coolant: { color: '#3fa9f5', hotColor: '#ff5a3c', period: 0.42 },
  fuel: { color: '#e0559b', hotColor: '#ffd0e8', period: 0.3 },
  air: { color: '#62c6ec', hotColor: '#f0a060', period: 0.6 },
};

/** Velocity in a passage, m/s, from a flow in L/min and a nominal bore in metres. */
const speedOf = (litresPerMin: number, bore: number): number => litresPerMin / 60000 / ((Math.PI / 4) * bore * bore);

/** A built layer and how its channels read the simulation. */
interface Built {
  layer: SystemLayer;
  feed: (state: SystemsState) => void;
}

/** Builds the plan of a layer for this engine. Exported for tests: the same plan the scene draws. */
export function layerPlan(id: LayerId, engine: Engine, anchors: EngineAnchors): LayerPlan | null {
  const systems = systemsOf(engine.spec);
  const sump = sumpLayout(engine, systems);
  switch (id) {
    case 'oil':
      return anchors.kind === 'piston' ? oilPlan(engine, systems, anchors, sump) : rotaryOilPlan(engine, systems, anchors, sump);
    default:
      return null;
  }
}

export class SystemsLayers {
  private readonly engine: Engine;
  private readonly model: EngineModel;
  private readonly anchors: EngineAnchors | null;
  private readonly built = new Map<LayerId, Built>();
  private readonly wanted = new Set<LayerId>();
  private view: ViewMode = 'xray';
  private exploded = false;
  private reducedMotion = false;

  constructor(engine: Engine, model: EngineModel, reducedMotion = false) {
    this.engine = engine;
    this.model = model;
    this.anchors = model.systemsAnchors?.() ?? null;
    this.reducedMotion = reducedMotion;
  }

  /** Layers are only shown in the X-ray of an assembled engine. */
  get showing(): boolean {
    return this.view === 'xray' && !this.exploded;
  }

  set(id: LayerId, on: boolean): void {
    if (on) this.wanted.add(id);
    else this.wanted.delete(id);
    this.sync();
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.sync();
  }

  setExplode(amount: number): void {
    this.exploded = amount > 0.01;
    this.sync();
  }

  /** The built layer, for tests and for the oil-sump hooks. */
  layer(id: LayerId): SystemLayer | null {
    return this.built.get(id)?.layer ?? null;
  }

  private sync(): void {
    const showing = this.showing;
    for (const id of LAYER_IDS) {
      const on = showing && this.wanted.has(id);
      if (on && !this.built.has(id)) this.build(id);
      this.built.get(id)?.layer.setVisible(on);
    }
    const look: SystemsLook = {
      intakeGlass: showing && (this.wanted.has('air') || this.wanted.has('fuel')),
      ownSparks: !(showing && this.wanted.has('fuel')),
    };
    this.model.setSystemsLook?.(look);
  }

  private build(id: LayerId): void {
    if (!this.anchors) return;
    const plan = layerPlan(id, this.engine, this.anchors);
    if (!plan) return;
    const layer = new SystemLayer(this.engine, this.anchors, plan, LAYER_STYLES[id]);
    layer.addTo(this.model.mounted);
    const feed = id === 'oil' ? oilFeed(this.engine, this.anchors, layer) : (): void => {};
    this.built.set(id, { layer, feed });
  }

  /** Every frame, after the model has moved. */
  update(state: SystemsState, theta: number, dt: number): void {
    if (!this.showing) return;
    for (const [id, { layer, feed }] of this.built) {
      if (!this.wanted.has(id)) continue;
      feed(state);
      layer.update(dt, state.timeScale, this.reducedMotion);
      layer.updatePistonSprays(theta);
    }
  }

  dispose(): void {
    for (const { layer } of this.built.values()) layer.dispose();
    this.built.clear();
    this.model.setSystemsLook?.({ intakeGlass: false, ownSparks: true });
  }
}

/** Oil channels: velocity in each passage from the branch flows, at nominal passage sizes. */
function oilFeed(engine: Engine, anchors: EngineAnchors, layer: SystemLayer): (state: SystemsState) => void {
  const banks = anchors.kind === 'piston' ? anchors.banks.length : 1;
  const mains = anchors.kind === 'piston' ? mainBearingZ(engine, anchors).length : 2 + anchors.rotorZ.length;
  const turbos = Math.max(1, turboCountOf(engine.spec));
  const ch = (id: string): number => layer.channel(id);
  const idx = {
    suction: ch('suction'),
    pressure: ch('pressure'),
    relief: ch('relief'),
    gallery: ch('gallery'),
    mains: ch('mains'),
    crank: ch('crank'),
    riser: ch('riser'),
    head: ch('head'),
    chain: ch('chain'),
    turbo: ch('turbo'),
    turboDrain: ch('turbo-drain'),
    jets: ch('jets'),
    drain: ch('drain'),
    drive: ch('pump-drive'),
    metering: ch('metering'),
    rotorJets: ch('rotor-jets'),
    scavenge: ch('scavenge'),
    tank: ch('tank'),
  };
  const v = layer.values;
  const set = (i: number, litresPerMin: number, bore: number, gravity = 1): void => {
    if (i < 0) return;
    const u = speedOf(Math.max(0, litresPerMin), bore) * gravity;
    v.speed[i] = u;
    v.level[i] = litresPerMin > 1e-4 ? 0.35 + 0.65 * Math.min(1, u / 3) : 0.12;
    v.heat[i] = 0;
  };
  return (state) => {
    const o = state.oil;
    const delivered = o.pumpFlow - o.reliefFlow;
    set(idx.suction, o.pumpFlow, 0.012);
    set(idx.pressure, delivered, 0.01);
    set(idx.relief, o.reliefFlow, 0.008);
    set(idx.gallery, delivered / 2, 0.01);
    set(idx.mains, o.mains / mains, 0.006);
    set(idx.crank, o.mains / mains, 0.005);
    set(idx.riser, o.head / banks, 0.008);
    set(idx.head, o.head / banks, 0.008);
    set(idx.chain, o.chain, 0.004);
    set(idx.turbo, o.turbo / turbos, 0.006);
    set(idx.turboDrain, o.turbo / turbos, 0.016, 1 / 3);
    set(idx.jets, o.jets / banks, 0.008);
    // Oil falls back by gravity, three times slower than it was pumped.
    set(idx.drain, (o.head + o.chain) / banks, 0.016, 1 / 3);
    set(idx.metering, state.running ? 0.05 + 0.2 * (state.rpm / engine.spec.redlineRpm) : 0, 0.002);
    set(idx.rotorJets, o.mains / mains, 0.004);
    set(idx.scavenge, 0, 0.012);
    set(idx.tank, 0, 0.012);
    if (idx.drive >= 0) {
      // The pump's chain runs with the crank: sprocket of about 26 mm radius.
      v.speed[idx.drive] = (state.rpm / 60) * 2 * Math.PI * 0.026;
      v.level[idx.drive] = 0.45;
    }
    if (idx.jets >= 0) v.spray[idx.jets] = o.jetsOpen;
    if (idx.rotorJets >= 0) v.spray[idx.rotorJets] = o.pressure > 0.3 ? Math.min(1, o.pressure / 3) : 0;
  };
}
