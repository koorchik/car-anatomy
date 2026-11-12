// The systems layers of one model: built lazily, the first time each is switched on in the X-ray, and fed every frame
// from SystemsSim. They live inside the model's groups, so they shake with it and go when it is disposed.

import * as THREE from 'three';
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
import { coolantPlan, rotaryCoolantPlan } from './routes-coolant.ts';
import { fuelPlan, fuelSlots, rotaryFuelPlan } from './routes-fuel.ts';
import { airPlan, rotaryAirPlan, runnerChannel } from './routes-air.ts';
import { intakeLift, mod } from '../../engine/kinematics.ts';
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
    case 'coolant':
      return anchors.kind === 'piston' ? coolantPlan(engine, systems, anchors, sump) : rotaryCoolantPlan(engine, systems, anchors);
    case 'fuel':
      return anchors.kind === 'piston' ? fuelPlan(engine, systems, anchors) : rotaryFuelPlan(engine, systems, anchors);
    case 'air':
      return anchors.kind === 'piston' ? airPlan(engine, systems, anchors) : rotaryAirPlan(engine, systems, anchors);
    default:
      return null;
  }
}

export class SystemsLayers {
  private readonly engine: Engine;
  private readonly model: EngineModel;
  private readonly anchors: EngineAnchors | null;
  private readonly built = new Map<LayerId, Built>();
  /** The same entries as a plain array, walked every frame without an iterator. */
  private readonly builtList: Array<Built & { id: LayerId }> = [];
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
    const feed = id === 'oil' ? oilFeed(this.engine, this.anchors, layer) : id === 'coolant' ? coolantFeed(this.engine, this.anchors, layer) : id === 'fuel' ? fuelFeed(this.engine, layer) : airFeed(this.engine, this.anchors, layer);
    this.built.set(id, { layer, feed });
    this.builtList.push({ id, layer, feed });
  }

  /** Every frame, after the model has moved. */
  update(state: SystemsState, theta: number, dt: number): void {
    if (!this.showing) return;
    for (let i = 0; i < this.builtList.length; i++) {
      const { id, layer, feed } = this.builtList[i]!;
      if (!this.wanted.has(id)) continue;
      feed(state);
      layer.update(dt, state.timeScale, this.reducedMotion, theta);
      layer.updatePistonSprays(theta);
    }
  }

  dispose(): void {
    for (const { layer } of this.built.values()) layer.dispose();
    this.built.clear();
    this.builtList.length = 0;
    this.model.setSystemsLook?.({ intakeGlass: false, ownSparks: true });
  }
}

/** Fuel: injections, pilots, sparks and glow into the event slots; the lines run with the fuel flow. */
function fuelFeed(engine: Engine, layer: SystemLayer): (state: SystemsState) => void {
  const slots = fuelSlots(engine);
  const sparks = engine.isRotary ? engine.banks.length * 2 : engine.cylinders.length;
  const ch = (id: string): number => layer.channel(id);
  const flowing = [ch('feed'), ch('rail'), ch('hp-rail'), ch('spray')];
  const hp = ch('hp-rail');
  const v = layer.values;
  const ev = layer.events;
  return (state) => {
    const f = state.fuel;
    for (let i = 0; i < sparks; i++) ev[slots.spark(i)] = f.sparks[i]!;
    for (let i = 0; i < engine.cylinders.length; i++) {
      ev[slots.inject(i)] = f.injecting[i]! || f.continuous;
      ev[slots.pilot(i)] = f.piloting[i]!;
    }
    ev[slots.glow] = f.glow ? 1 : 0;
    ev[slots.continuous] = f.continuous;
    // Petrol is 0.74 g per millilitre; the lines are about 8 mm across.
    const litresPerMin = (state.air.fuelGs / 0.74) * 0.06;
    for (const i of flowing) {
      if (i < 0) continue;
      const u = speedOf(litresPerMin, 0.008);
      v.speed[i] = u;
      v.level[i] = state.running && litresPerMin > 0 ? 0.35 + 0.65 * Math.min(1, u / 0.5) : 0.12;
    }
    if (hp >= 0) v.spray[hp] = f.plunger;
  };
}

/**
 * Air: steady through the airbox, duct and plenum, and in each runner only while its valve is open, so the runners
 * pulse in firing order. Compressed air runs hot until the intercooler.
 */
function airFeed(engine: Engine, anchors: EngineAnchors, layer: SystemLayer): (state: SystemsState) => void {
  const ch = (id: string): number => layer.channel(id);
  const steady = [ch('snorkel'), ch('duct'), ch('plenum')];
  const hot = ch('charge-hot');
  const cool = ch('charge-cool');
  const throttle = ch('throttle');
  const runners = anchors.kind === 'piston' ? anchors.runners.map((r) => ({ n: r.n, channel: ch(runnerChannel(r.n)), r: r.r })) : anchors.runners.map((r) => ({ n: r.rotor + 1, channel: ch(runnerChannel(r.rotor + 1)), r: r.r }));
  const byNumber = new Map(engine.cylinders.map((c) => [c.n, c]));
  const faces = engine.isRotary ? runners.map((r) => engine.cylinders.filter((c) => c.bank === r.n - 1)) : [];
  const v = layer.values;
  const heatOf = (c: number): number => Math.min(1, Math.max(0, (c - 25) / 120));
  return (state) => {
    const air = state.air;
    // Volume flow at the manifold's density, m3/s; the ducts are about 70 mm across.
    const density = Math.max(0.2, (air.manifoldBar * 1e5) / (287 * (air.chargeC + 273)));
    const q = air.airGs / 1000 / 1.18;
    const flowing = state.running && air.airGs > 0;
    for (const i of steady) {
      if (i < 0) continue;
      v.speed[i] = q / ((Math.PI / 4) * 0.07 * 0.07);
      v.level[i] = flowing ? 0.4 + 0.6 * Math.min(1, air.airGs / 60) : 0.12;
      v.heat[i] = i === steady[2] ? heatOf(air.chargeC) : 0;
    }
    if (hot >= 0) {
      v.speed[hot] = air.airGs / 1000 / density / ((Math.PI / 4) * 0.06 * 0.06);
      v.level[hot] = flowing ? 0.4 + 0.6 * Math.min(1, air.airGs / 60) : 0.12;
      v.heat[hot] = heatOf(air.compressorC);
    }
    if (cool >= 0) {
      v.speed[cool] = air.airGs / 1000 / density / ((Math.PI / 4) * 0.06 * 0.06);
      v.level[cool] = flowing ? 0.4 + 0.6 * Math.min(1, air.airGs / 60) : 0.12;
      v.heat[cool] = heatOf(air.chargeC);
    }
    if (throttle >= 0) v.spray[throttle] = state.running ? state.throttle : 0;
    const timing = state.timing ?? engine.timing;
    for (let k = 0; k < runners.length; k++) {
      const r = runners[k]!;
      if (r.channel < 0) continue;
      let lift = 0;
      if (engine.isRotary) {
        // A rotor's runner feeds whichever of its faces is on the intake phase.
        for (const c of faces[k]!) {
          const x = (mod(state.theta - c.fire, engine.cycle) / engine.cycle - 0.5) / 0.25;
          if (x > 0 && x < 1) lift = Math.max(lift, Math.sin(Math.PI * x) ** 2);
        }
      } else {
        const c = byNumber.get(r.n)!;
        lift = intakeLift(mod(state.theta - c.fire, 720), timing);
      }
      const pulse = flowing ? lift * (0.3 + 0.7 * air.fill) : 0;
      const area = Math.PI * (r.r * 0.1) ** 2;
      v.speed[r.channel] = pulse > 0.02 ? (q / Math.max(1, runners.length)) * 3 / area * pulse : 0;
      v.level[r.channel] = 0.12 + 0.88 * pulse;
      v.heat[r.channel] = heatOf(air.chargeC);
    }
  };
}

const COOL = new THREE.Color('#3fa9f5');
const NORMAL = new THREE.Color('#2fd3a0');
const HOT = new THREE.Color('#ff5a3c');
const AIR = new THREE.Color('#bfe6ff');

/** Coolant channels from the pump's flow and the thermostat; the colour follows the coolant's temperature. */
function coolantFeed(engine: Engine, anchors: EngineAnchors, layer: SystemLayer): (state: SystemsState) => void {
  const banks = anchors.kind === 'piston' ? anchors.banks.length : 1;
  const ch = (id: string): number => layer.channel(id);
  const idx = {
    pump: ch('pump'),
    jacket: ch('jacket'),
    transfer: ch('transfer'),
    head: ch('head'),
    outlet: ch('outlet'),
    radiator: ch('radiator'),
    bypass: ch('bypass'),
    heater: ch('heater'),
    turbo: ch('turbo-coolant'),
    oilCooler: ch('oil-cooler'),
    air: ch('cooling-air'),
  };
  const v = layer.values;
  const colour = new THREE.Color();
  const air = systemsOf(engine.spec).cooling !== 'liquid' && !engine.isRotary;
  const set = (i: number, litresPerMin: number, bore: number): void => {
    if (i < 0) return;
    const u = speedOf(Math.max(0, litresPerMin), bore);
    v.speed[i] = u;
    v.level[i] = litresPerMin > 1e-4 ? 0.35 + 0.65 * Math.min(1, u / 2) : 0.1;
  };
  return (state) => {
    const t = state.thermal;
    const q = t.coolantFlow;
    set(idx.pump, q / (2 * banks), 0.02);
    set(idx.jacket, q / (2 * banks), 0.015);
    set(idx.transfer, q / (8 * banks), 0.008);
    set(idx.head, q / (2 * banks), 0.015);
    set(idx.outlet, q / (2 * banks), 0.025);
    set(idx.radiator, t.radiatorFlow, 0.032);
    set(idx.bypass, t.bypassFlow, 0.018);
    set(idx.heater, t.heaterFlow, 0.016);
    set(idx.turbo, t.turboFlow, 0.008);
    set(idx.oilCooler, 0.03 * q, 0.01);
    if (idx.radiator >= 0) v.spray[idx.radiator] = t.thermostat;
    if (idx.air >= 0) {
      // Air through the fins: a fan's flow follows the crank, ram air stands for riding along.
      const n = state.rpm / engine.spec.redlineRpm;
      const kind = systemsOf(engine.spec).cooling;
      const speed = !state.running ? 0 : kind === 'fan' ? 2 + 18 * n : 8;
      v.speed[idx.air] = speed;
      v.level[idx.air] = speed > 0 ? 0.55 : 0.1;
    }
    if (air) {
      layer.setFlowColor(AIR);
      return;
    }
    // Blue when cold, green at the working temperature, red as it boils over.
    const c = t.engineC;
    if (c <= 90) colour.copy(COOL).lerp(NORMAL, Math.max(0, (c - 25) / 65));
    else colour.copy(NORMAL).lerp(HOT, Math.min(1, (c - 90) / 18));
    layer.setFlowColor(colour);
  };
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
