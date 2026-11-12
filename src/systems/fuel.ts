// When each chamber gets its fuel and its spark, in crank degrees of its own cycle (phi = 0 at firing TDC), and which
// of those events the crank passed since the last frame. Formulas and their status: docs/engine-systems-model.md.

import { mod, type Engine } from '../engine/kinematics.ts';
import type { ValveTiming } from '../engine/spec.ts';
import { hasDirectInjectors, hasPortInjectors, isDieselSystem, type SystemsSpec } from '../engine/systems-spec.ts';
import { airParams, airStep, newAirState } from './air.ts';

/** Injector dead time, s: it opens late by about this much (port injection). */
const DEAD_TIME = 0.0006;
/** Port injectors are sized for 80 % of the cycle at the limiter, direct ones for 160 crank degrees. */
const PORT_DUTY = 0.8;
const DIRECT_SPAN = 160;
/** Port injection ends this far before the intake valve opens. */
const PORT_END_BEFORE_IVO = 20;
/** Direct injection starts 60 degrees after the gas-exchange TDC, on the intake stroke. */
const DIRECT_START = 420;
/** The trailing plug of a rotary fires this much after the leading one (13B-REW: 10-15). */
export const TRAILING_LAG = 12;

export interface FuelState {
  /** Spark advance, crank degrees before TDC. On a rotary, the leading plug's. */
  advance: number;
  trailingAdvance: number;
  /** Main injection window, cycle degrees from firing TDC. Zero length when the system is continuous or cut. */
  injectStart: number;
  injectEnd: number;
  /** A second short window: a diesel's pilot, or the cold catalyst-heating shot of direct injection. */
  pilotStart: number;
  pilotEnd: number;
  /** Share of fuel through the port injectors on a dual system. */
  portShare: number;
  pulseMs: number;
  /** Rail or line pressure, bar; null where no source gives one. */
  railBar: number | null;
  /** A carburettor's or a continuous injection's delivery, 0..1 of the most it gives. */
  continuous: number;
  glow: boolean;
  /** High-pressure pump plunger lift, 0..1. */
  plunger: number;
  /** Per chamber (engine.cylinders order): its main injection overlaps this frame, 0 or 1. */
  injecting: Float32Array;
  piloting: Float32Array;
  /** Per plug slot: fired this frame. Piston: one slot per cylinder. Rotary: leading and trailing per rotor. */
  sparks: Float32Array;
}

export interface FuelInput {
  /** Wrapped crank angle on screen, and the unwrapped advance since the last frame. */
  theta: number;
  advance: number;
  rpm: number;
  load: number;
  pressureRatio: number;
  fuelGs: number;
  fuelCut: boolean;
  running: boolean;
  cranking: boolean;
  engineC: number;
  /** Model seconds since the engine caught. */
  sinceStart: number;
  timing?: ValveTiming;
  active?: ArrayLike<boolean>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Spark advance at a speed, load and boost: about 12 at idle, 36 cruising at 4000, 31 at full throttle, less with boost. */
export function sparkAdvance(rpm: number, idleRpm: number, load: number, pressureRatio: number, offset: number): number {
  const r = clamp((rpm - idleRpm) / Math.max(4000 - idleRpm, 1), 0, 1);
  return clamp(12 + 24 * r - 10 * load * (1 - 0.5 * r) - 12 * (pressureRatio - 1) + offset, -5, 45);
}

/** Main diesel injection, degrees before TDC: from about TDC with no load to 6-15 before it at full load (Autospeed). */
export const dieselStart = (load: number, rpm: number, redline: number): number => -1 + 12 * load * (0.7 + 0.3 * rpm / redline);

export class FuelModel {
  readonly engine: Engine;
  readonly systems: SystemsSpec;
  readonly state: FuelState;
  private readonly plugSlots: number;
  /** Fuel per chamber per cycle at the limiter on full throttle, g. */
  private readonly maxPerCycle: number;
  private readonly lobes: number;

  constructor(engine: Engine, systems: SystemsSpec) {
    this.engine = engine;
    this.systems = systems;
    const chambers = engine.cylinders.length;
    this.plugSlots = engine.isRotary ? engine.banks.length * 2 : chambers;
    this.state = {
      advance: 12,
      trailingAdvance: 0,
      injectStart: 0,
      injectEnd: 0,
      pilotStart: 0,
      pilotEnd: 0,
      portShare: 1,
      pulseMs: 0,
      railBar: null,
      continuous: 0,
      glow: false,
      plunger: 0,
      injecting: new Float32Array(chambers),
      piloting: new Float32Array(chambers),
      sparks: new Float32Array(this.plugSlots),
    };
    const peak = newAirState();
    airStep(airParams(engine, systems), { rpm: engine.spec.redlineRpm, load: 1, boost: 1, fuelCut: false }, peak);
    this.maxPerCycle = this.perCycle(peak.fuelGs, engine.spec.redlineRpm);
    // A direct-injection pump has a lobe per cylinder it feeds, two or four on the cam (VW), so one stroke per injection.
    const perPump = engine.banks.length === 2 && engine.spec.valvetrain !== 'ohv' ? chambers / 2 : chambers;
    this.lobes = perPump <= 4 ? perPump : perPump / 2;
  }

  /** Grams per chamber per cycle at this fuel flow. */
  private perCycle(fuelGs: number, rpm: number): number {
    const cycles = (Math.max(rpm, 1) / 60) * (360 / this.engine.cycle) * this.engine.cylinders.length;
    return fuelGs / cycles;
  }

  /** Works out the windows for this moment, then which events the crank passed. Allocates nothing. */
  step(input: FuelInput): FuelState {
    const e = this.engine;
    const s = this.systems;
    const st = this.state;
    const spec = e.spec;
    const cycle = e.cycle;
    const rpm = Math.max(input.rpm, 1);
    const fuelling = input.running && !input.fuelCut;
    const system = s.fuelSystem;
    const diesel = isDieselSystem(system);
    const timing = input.timing ?? e.timing;

    st.advance = diesel ? 0 : sparkAdvance(rpm, spec.idleRpm, input.load, input.pressureRatio, s.ignitionOffset);
    if (e.isRotary) {
      // A rotary lights late: the leading plug fires near TDC at idle, the trailing one after it.
      st.advance -= 15;
      st.trailingAdvance = st.advance - TRAILING_LAG;
    } else {
      st.trailingAdvance = st.advance;
    }

    const mass = fuelling ? this.perCycle(input.fuelGs, rpm) : 0;
    const share = mass / Math.max(this.maxPerCycle, 1e-9);
    const degPerSecond = rpm * 6;
    st.injectStart = st.injectEnd = st.pilotStart = st.pilotEnd = 0;
    st.pulseMs = 0;
    st.continuous = 0;
    st.railBar = null;
    st.portShare = system === 'dual' ? clamp((0.7 - input.load) / 0.4, 0, 1) : hasPortInjectors(system) ? 1 : 0;
    // Intake opens at this cycle angle; a rotary's port opens with the intake phase.
    const intakeOpen = e.isRotary ? cycle * 0.5 : timing.intakeOpen;
    const intakeClose = e.isRotary ? cycle * 0.75 : timing.intakeClose;
    if (system === 'carburettor' || system === 'mechanical') {
      st.continuous = fuelling ? clamp(share, 0.05, 1) : 0;
      st.railBar = system === 'mechanical' ? 5 : null;
    } else if (system === 'port' || system === 'dual' || system === 'direct') {
      if (fuelling) {
        const tCycleRed = (60 / spec.redlineRpm) * (cycle / 360);
        const portRate = this.maxPerCycle / (PORT_DUTY * tCycleRed);
        const directRate = this.maxPerCycle / (DIRECT_SPAN / (spec.redlineRpm * 6));
        if (st.portShare > 0) {
          const pw = (mass * st.portShare) / portRate + DEAD_TIME;
          st.pulseMs = pw * 1000;
          st.injectEnd = mod(intakeOpen - PORT_END_BEFORE_IVO, cycle);
          st.injectStart = mod(st.injectEnd - pw * degPerSecond, cycle);
        }
        if (st.portShare < 1) {
          const pw = (mass * (1 - st.portShare)) / directRate + DEAD_TIME / 2;
          // On dual injection the direct shot goes in the pilot slot when the port injectors carry part of the fuel.
          const start = DIRECT_START;
          const end = Math.min(start + pw * degPerSecond, intakeClose);
          if (st.portShare > 0) {
            st.pilotStart = start;
            st.pilotEnd = end;
          } else {
            st.injectStart = start;
            st.injectEnd = end;
            st.pulseMs = pw * 1000;
            // A cold engine splits off a second shot before compression TDC to heat the catalyst (VW).
            if (input.engineC < 40) {
              const second = 0.15 * pw * degPerSecond;
              st.pilotEnd = cycle - 20;
              st.pilotStart = st.pilotEnd - Math.max(second, 2);
            }
          }
        }
      }
      st.railBar = hasDirectInjectors(system) ? Math.min(200, 50 + 150 * Math.max(input.load, rpm / spec.redlineRpm)) : 3.5;
    } else if (fuelling) {
      const soi = dieselStart(input.load, rpm, spec.redlineRpm);
      const span = 4 + 28 * input.load;
      st.injectStart = mod(cycle - soi, cycle);
      st.injectEnd = mod(st.injectStart + span, cycle);
      st.pulseMs = (span / degPerSecond) * 1000;
      if (system === 'common-rail' || system === 'unit-injector') {
        st.pilotEnd = mod(st.injectStart - 12, cycle);
        st.pilotStart = mod(st.pilotEnd - 1.5, cycle);
      }
      st.railBar = system === 'common-rail' ? 300 + 1300 * Math.max(input.load, rpm / spec.redlineRpm) : null;
    }
    st.glow = diesel && s.glowPlugs && (input.cranking || (input.running && input.engineC < 60 && input.sinceStart < 180));
    st.plunger = 0.5 - 0.5 * Math.cos((input.theta / 2) * this.lobes * (Math.PI / 180));

    this.events(input, fuelling, diesel);
    return st;
  }

  private theta = 0;
  private turned = 0;

  /** The crank passed this angle since the last frame. */
  private crossed(angle: number): boolean {
    const cycle = this.engine.cycle;
    return this.turned >= cycle || (this.turned > 0 && mod(this.theta - angle, cycle) < this.turned);
  }

  /** A window [start, end] overlaps the stretch the crank turned through, or holds the crank now. */
  private overlaps(start: number, end: number): boolean {
    const cycle = this.engine.cycle;
    const length = mod(end - start, cycle);
    if (length <= 0) return false;
    const since = mod(this.theta - start, cycle);
    return this.turned >= cycle || since <= length || (this.turned > 0 && since < this.turned);
  }

  private events(input: FuelInput, fuelling: boolean, diesel: boolean): void {
    const e = this.engine;
    const st = this.state;
    this.theta = mod(input.theta, e.cycle);
    this.turned = input.advance;
    st.sparks.fill(0);
    const sparking = input.running && !input.fuelCut && !diesel && this.systems.sparkPlugs > 0;
    const wasted = this.systems.ignition === 'wasted-spark';
    for (let i = 0; i < e.cylinders.length; i++) {
      const c = e.cylinders[i]!;
      const on = !input.active || input.active[i] !== false;
      const fire = c.fire;
      st.injecting[i] = fuelling && on && this.overlaps(fire + st.injectStart, fire + st.injectEnd) ? 1 : 0;
      st.piloting[i] = fuelling && on && this.overlaps(fire + st.pilotStart, fire + st.pilotEnd) ? 1 : 0;
      if (!sparking || !on) continue;
      if (e.isRotary) {
        if (this.crossed(fire - st.advance)) st.sparks[c.bank * 2] = 1;
        if (this.crossed(fire - st.trailingAdvance)) st.sparks[c.bank * 2 + 1] = 1;
      } else {
        if (this.crossed(fire - st.advance)) st.sparks[i] = 1;
        // A wasted spark fires the same plug again at the end of the exhaust stroke.
        if (wasted && this.crossed(fire + 360 - st.advance)) st.sparks[i] = 1;
      }
    }
    // A rotary's paired leading plugs share a coil: each also fires when its partner, half a turn away, does.
    if (e.isRotary && wasted && sparking) {
      const rotors = e.banks.length;
      if (rotors % 2 === 0) {
        for (let r = 0; r < rotors / 2; r++) {
          const partner = r + rotors / 2;
          const either = st.sparks[r * 2]! || st.sparks[partner * 2]!;
          st.sparks[r * 2] = either;
          st.sparks[partner * 2] = either;
        }
      }
    }
  }
}
