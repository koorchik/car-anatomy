// The systems of the engine on screen, worked out once per frame on the main thread from what Drive reports.
// No DOM, no Web Audio: tests and scripts run it in Node. One instance per page; nothing is allocated per frame.

import { mod, type Engine } from '../engine/kinematics.ts';
import type { ValveTiming } from '../engine/spec.ts';
import { systemsOf, type SystemsSpec } from '../engine/systems-spec.ts';
import { airParams, airStep, newAirState, type AirInput, type AirParams, type AirState } from './air.ts';
import { FuelModel, type FuelInput, type FuelState } from './fuel.ts';
import { newOilState, oilParams, oilStep, type OilInput, type OilParams, type OilState } from './oil.ts';
import { ThermalModel, thermalParams, type ThermalInput, type ThermalState } from './thermal.ts';

export interface SystemsFrame {
  /** Shown crank angle, the one the pistons are drawn at. */
  theta: number;
  /** Unwrapped crank degrees shown since the last frame, never negative. */
  advance: number;
  /** Speed the systems are worked out for: true rpm, or idle in demo mode and in slow motion. */
  rpm: number;
  load: number;
  throttle: number;
  boost: number;
  running: boolean;
  cranking: boolean;
  fuelCut: boolean;
  /** The visitor's engine at its true speed: not the demo and not slow motion. Warm-up and the oil warning run only then. */
  live: boolean;
  /** Not started yet: the page's gentle turning before the first start. Only the readout's wording uses it. */
  demo?: boolean;
  /** Seconds on screen. */
  dt: number;
  /** A still page for a snapshot: the dashes stand where this many seconds of flow carry them, events don't linger. */
  hold?: number;
  /** Shown crank speed over true crank speed: 1 in real mode, below 1 in the slowed modes. */
  timeScale: number;
  /** Valve events now, when feature/vvt moves them. Defaults to engine.timing. */
  timing?: ValveTiming;
  /** Cylinders that fire, by index into engine.cylinders, when feature/vvt switches some off. Defaults to all. */
  active?: ArrayLike<boolean>;
}

/**
 * Unwrapped crank degrees the shown angle moved since the last frame: the step between the two wrapped angles, plus the
 * whole cycles the nominal speed says went by. A step backwards, when Drive pulls the shown angle back, counts as none.
 */
export function shownAdvance(previous: number, theta: number, nominal: number, cycle: number): number {
  const step = mod(theta - previous + cycle / 2, cycle) - cycle / 2;
  const turns = Math.round((Math.max(0, nominal) - step) / cycle);
  return Math.max(0, step + turns * cycle);
}

export interface SystemsState {
  oil: OilState;
  thermal: ThermalState;
  air: AirState;
  fuel: FuelState;
  /** The frame this state was worked out for. */
  rpm: number;
  load: number;
  throttle: number;
  cranking: boolean;
  theta: number;
  /** Valve events now: feature/vvt's when it moves them, else null for the engine's own. */
  timing: ValveTiming | null;
  live: boolean;
  running: boolean;
  timeScale: number;
}

export class SystemsSim {
  engine: Engine | null = null;
  systems: SystemsSpec | null = null;
  /** Share of oil in what the pump draws. feature/oil-sump sets it from the slosh in the pan. */
  oilSupply = 1;
  /** Share of oil in what the scavenge stages draw. feature/oil-sump sets it too. */
  scavengeSupply = 1;
  readonly state: SystemsState = { oil: newOilState(), thermal: null as unknown as ThermalState, air: newAirState(), fuel: null as unknown as FuelState, rpm: 0, load: 0, throttle: 0, cranking: false, theta: 0, timing: null, live: false, running: false, timeScale: 1 };
  private fuel: FuelModel | null = null;
  // Inputs reused every frame, so stepping allocates nothing.
  private readonly airIn: AirInput = { rpm: 0, load: 0, boost: 0, fuelCut: true, cranking: false };
  private readonly thermalIn: ThermalInput = { dt: 0, rpm: 0, load: 0, running: false, fuelKw: 0, pressureRatio: 1 };
  private readonly oilIn: OilInput = { rpm: 0, tempC: 90, supply: 1, scavengeSupply: 1, running: false, live: false };
  private readonly fuelIn: FuelInput = { theta: 0, advance: 0, rpm: 0, load: 0, pressureRatio: 1, fuelGs: 0, fuelCut: true, running: false, cranking: false, engineC: 90, sinceStart: 0 };
  private oilParams: OilParams | null = null;
  private airParams: AirParams | null = null;
  private thermal: ThermalModel | null = null;
  private readonly peakAir = newAirState();

  /** A new engine. Temperatures carry over, as when a designer slider moves. */
  configure(engine: Engine): void {
    this.engine = engine;
    const s = systemsOf(engine.spec);
    this.systems = s;
    this.oilParams = oilParams(engine, s);
    this.airParams = airParams(engine, s);
    // The radiator is sized for the heat at the limiter, full throttle and full boost.
    airStep(this.airParams, { rpm: engine.spec.redlineRpm, load: 1, boost: 1, fuelCut: false }, this.peakAir);
    const params = thermalParams(engine, s, this.peakAir.fuelKw, this.peakAir.pressureRatio);
    if (this.thermal) {
      this.thermal.params = params;
      if (params.cooling !== 'liquid') this.thermal.state.thermostat = 0;
    } else {
      this.thermal = new ThermalModel(params);
      this.thermal.reset('warm');
    }
    this.state.thermal = this.thermal.state;
    this.fuel = new FuelModel(engine, s);
    this.state.fuel = this.fuel.state;
  }

  reset(kind: 'warm' | 'cold'): void {
    this.thermal?.reset(kind);
  }

  step(frame: SystemsFrame): SystemsState {
    const st = this.state;
    if (!this.engine || !this.oilParams || !this.airParams || !this.thermal || !this.fuel) return st;
    const rpm = Math.max(0, frame.rpm);
    st.rpm = rpm;
    st.load = frame.load;
    st.throttle = frame.throttle;
    st.cranking = frame.cranking;
    st.theta = frame.theta;
    st.timing = frame.timing ?? null;
    st.live = frame.live;
    st.running = frame.running;
    st.timeScale = frame.timeScale;
    const air = this.airIn;
    air.rpm = rpm;
    // Cranking injects and sparks as well, so the engine has something to catch on.
    air.load = frame.running || frame.cranking ? frame.load : 0;
    air.boost = frame.boost;
    air.cranking = frame.cranking;
    air.fuelCut = frame.cranking ? false : frame.fuelCut || !frame.running;
    airStep(this.airParams, air, st.air);
    const heat = this.thermalIn;
    heat.dt = frame.dt;
    heat.rpm = rpm;
    heat.load = frame.load;
    heat.running = frame.running;
    heat.fuelKw = st.air.fuelKw;
    heat.pressureRatio = st.air.pressureRatio;
    this.thermal.step(heat, frame.live);
    const oil = this.oilIn;
    oil.rpm = rpm;
    oil.tempC = st.thermal.oilC;
    oil.supply = this.oilSupply;
    oil.scavengeSupply = this.scavengeSupply;
    oil.running = frame.running;
    oil.live = frame.live;
    oilStep(this.oilParams, oil, st.oil);
    const fuel = this.fuelIn;
    fuel.theta = frame.theta;
    fuel.advance = frame.advance;
    fuel.rpm = rpm;
    fuel.load = frame.load;
    fuel.pressureRatio = st.air.pressureRatio;
    fuel.fuelGs = st.air.fuelGs;
    fuel.fuelCut = frame.fuelCut;
    fuel.running = frame.running;
    fuel.cranking = frame.cranking;
    fuel.engineC = st.thermal.engineC;
    fuel.sinceStart = st.thermal.sinceStart;
    fuel.timing = frame.timing;
    fuel.active = frame.active;
    this.fuel.step(fuel);
    return st;
  }
}
