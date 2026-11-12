// The systems of the engine on screen, worked out once per frame on the main thread from what Drive reports.
// No DOM, no Web Audio: tests and scripts run it in Node. One instance per page; nothing is allocated per frame.

import type { Engine } from '../engine/kinematics.ts';
import type { ValveTiming } from '../engine/spec.ts';
import { systemsOf, type SystemsSpec } from '../engine/systems-spec.ts';
import { airParams, airStep, newAirState, type AirParams, type AirState } from './air.ts';
import { newOilState, oilParams, oilStep, type OilParams, type OilState } from './oil.ts';
import { ThermalModel, thermalParams, type ThermalState } from './thermal.ts';

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
  /** Shown crank speed over true crank speed: 1 in real mode, below 1 in the slowed modes. */
  timeScale: number;
  /** Valve events now, when feature/vvt moves them. Defaults to engine.timing. */
  timing?: ValveTiming;
  /** Cylinders that fire, by index into engine.cylinders, when feature/vvt switches some off. Defaults to all. */
  active?: ArrayLike<boolean>;
}

export interface SystemsState {
  oil: OilState;
  thermal: ThermalState;
  air: AirState;
  /** The frame this state was worked out for. */
  rpm: number;
  live: boolean;
  running: boolean;
  timeScale: number;
}

export class SystemsSim {
  engine: Engine | null = null;
  systems: SystemsSpec | null = null;
  /** Share of oil in what the pump draws. feature/oil-sump sets it from the slosh in the pan. */
  oilSupply = 1;
  readonly state: SystemsState = { oil: newOilState(), thermal: null as unknown as ThermalState, air: newAirState(), rpm: 0, live: false, running: false, timeScale: 1 };
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
    const params = thermalParams(engine, s, this.peakAir.fuelKw);
    if (this.thermal) {
      this.thermal.params = params;
      if (params.cooling !== 'liquid') this.thermal.state.thermostat = 0;
    } else {
      this.thermal = new ThermalModel(params);
      this.thermal.reset('warm');
    }
    this.state.thermal = this.thermal.state;
  }

  reset(kind: 'warm' | 'cold'): void {
    this.thermal?.reset(kind);
  }

  step(frame: SystemsFrame): SystemsState {
    const st = this.state;
    if (!this.engine || !this.oilParams || !this.airParams || !this.thermal) return st;
    const rpm = Math.max(0, frame.rpm);
    st.rpm = rpm;
    st.live = frame.live;
    st.running = frame.running;
    st.timeScale = frame.timeScale;
    airStep(this.airParams, { rpm, load: frame.running ? frame.load : 0, boost: frame.boost, fuelCut: frame.fuelCut || !frame.running }, st.air);
    this.thermal.step({ dt: frame.dt, rpm, load: frame.load, running: frame.running, fuelKw: st.air.fuelKw }, frame.live);
    oilStep(this.oilParams, { rpm, tempC: st.thermal.oilC, supply: this.oilSupply, running: frame.running, live: frame.live }, st.oil);
    return st;
  }
}
