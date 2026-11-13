// A dynamometer absorber on the crank: eddy-current or water brake, its speed controller, the cell's throttle
// actuator and the sweep sequence. Runs on the audio thread and in the main-thread copy alike.
//
// Envelopes after Martyr & Plint, Engine Testing (through the University of Sussex lecture notes "Engine Testing and
// Instrumentation"): an eddy-current brake is limited at low speed by its field current, then by shaft torque, then
// by the power its cooling water can carry away. A water brake full of water holds torque as the square of speed.
// Sizes and rotor inertias follow the Horiba WT and DT ranges. Shape factors and time constants are estimates.

import type { CrankInput, CrankLoad, EngineRequest, Engagement, LoadTorque } from './load.ts';
import { mapValue, peakPower, peakTorque, type EngineTorqueMap } from './torque-map.ts';

export type AbsorberKind = 'eddy' | 'water';

export interface DynoSpec {
  kind: 'dyno';
  absorber: AbsorberKind;
  ratedNm: number;
  ratedKw: number;
  maxRpm: number;
  /** Absorber rotor, kg·m². */
  inertia: number;
  /** Engine's own inertia, for the controller gains. */
  engineInertia: number;
  idleRpm: number;
  limitRpm: number;
}

export type DynoCommand =
  | { kind: 'dyno'; action: 'off' }
  | { kind: 'dyno'; action: 'hold'; rpm: number; throttle: number | null; keep: true }
  | { kind: 'dyno'; action: 'sweep'; fromRpm: number; toRpm: number; rate: number; throttle: number }
  | { kind: 'dyno'; action: 'free'; pedal: number }
  | { kind: 'dyno'; action: 'abort' };

export type DynoPhase = 'off' | 'free' | 'hold' | 'settle' | 'ramp' | 'rampdown';
export type Tracking = 'ok' | 'engine-weak' | 'absorber-weak';

export interface DynoReadings {
  kind: 'dyno';
  /** Steps averaged into this reading. */
  samples: number;
  /** Seconds covered. */
  seconds: number;
  rpm: number;
  /** rad/s². */
  alpha: number;
  /** Load cell plus the rotor's own inertia: what the dyno software shows. */
  measuredNm: number;
  absorberNm: number;
  /** absorberNm over the most the absorber can hold at this speed. */
  absorberShare: number;
  setpointRpm: number | null;
  phase: DynoPhase;
  tracking: Tracking;
  /** Throttle the cell's actuator holds, 0..1. */
  throttle: number;
  /** True when automation, not the pedal, sets the throttle. */
  automatic: boolean;
  /** The sweep stopped early because the engine could no longer pull. */
  gaveUp: boolean;
}

const RATED_NM = [25, 50, 100, 150, 250, 400, 600, 900, 1200, 1800, 2500, 3500, 5000, 7500];
const RATED_KW = [10, 20, 40, 75, 120, 190, 300, 470, 700, 1000, 1500, 2000, 3000];
/** The absorber is sized with this much margin over the engine, as test cells are. */
const MARGIN = 1.3;
/** Coil current on an eddy-current brake, s. Estimate. */
const EDDY_TAU = 0.08;
/** A water brake fills through a valve (Horiba DT: about 1 s to steady) and dumps faster. Estimates. */
const WATER_TAU_UP = 0.35;
const WATER_TAU_DOWN = 0.12;
/** Closed-loop bandwidth of the speed controller, rad/s, and its damping. */
const CONTROL_W = 6;
const CONTROL_ZETA = 0.9;
/** Filter on the derivative that leads the absorber's lag, s. */
const LEAD_FILTER = 0.02;
/**
 * The cell's throttle actuator, full travel per second. It opens slowly, so a wide-open engine does not run away from
 * the absorber, and shuts in about 0.15 s as a real one does (estimate), fast enough for a blow-off valve to open.
 */
const ACTUATOR_OPEN = 1;
const ACTUATOR_CLOSE = 7;
const SETTLE_S = 2;
/**
 * Below the speed it is to hold, the automation brings the engine up on part throttle first, as an operator would:
 * an absorber can only brake, and a wide-open engine climbing through it would overshoot.
 */
const REACH_THROTTLE = 0.35;
const REACH_BAND_RPM = 300;
const RAMPDOWN_RPM_S = 1000;
const TRACK_RPM = 150;

const RAD = Math.PI / 30;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const pick = (series: number[], wanted: number): number => series.find((v) => v >= wanted) ?? Math.ceil(wanted / 500) * 500;

/** The smallest absorber of a typical range that covers the engine with margin. */
export function sizeAbsorber(map: EngineTorqueMap, absorber: AbsorberKind): DynoSpec {
  const ratedNm = pick(RATED_NM, MARGIN * peakTorque(map).nm);
  const ratedKw = pick(RATED_KW, MARGIN * peakPower(map).kw);
  // Horiba WT 600, 1200 and 3000 N·m have 0.17, 0.49 and 1.96 kg·m²; DT700 and DT1200 (3000 and 7500 N·m) 0.30 and 1.2.
  const inertia = absorber === 'eddy' ? 0.17 * (ratedNm / 600) ** 1.5 : 0.3 * (ratedNm / 3000) ** 1.5;
  return {
    kind: 'dyno',
    absorber,
    ratedNm,
    ratedKw,
    maxRpm: Math.ceil(Math.max(1.15 * map.limitRpm, 6000) / 500) * 500,
    inertia,
    engineInertia: map.inertia,
    idleRpm: map.idleRpm,
    limitRpm: map.limitRpm,
  };
}

/** Speed where rated torque meets rated power, rpm. */
const baseRpm = (spec: DynoSpec): number => (spec.ratedKw * 1000) / spec.ratedNm / RAD;

/** Most torque the absorber can hold at a speed, N·m. */
export function absorberMax(spec: DynoSpec, rpm: number): number {
  if (rpm > spec.maxRpm || rpm <= 0) return 0;
  const power = (spec.ratedKw * 1000) / (rpm * RAD);
  const base = baseRpm(spec);
  if (spec.absorber === 'eddy') return Math.min(spec.ratedNm * Math.min(1, rpm / (0.3 * base)), power);
  return Math.min(spec.ratedNm * (rpm / (0.6 * base)) ** 2, spec.ratedNm, power);
}

/** Least torque it takes even when unloaded: residual magnetism and windage, or the least water flow. */
export function absorberMin(spec: DynoSpec, rpm: number): number {
  if (rpm <= 0) return 0;
  const most = absorberMax(spec, rpm);
  const value = spec.absorber === 'eddy'
    ? 0.005 * spec.ratedNm + 0.01 * spec.ratedNm * (rpm / spec.maxRpm) ** 2
    : Math.min(0.02 * spec.ratedNm * (rpm / (0.6 * baseRpm(spec))) ** 2, 0.05 * most);
  return Math.min(value, most);
}

/** Where a sweep starts: above idle, and where a water brake already holds full load with room to spare. */
export function sweepStartRpm(map: EngineTorqueMap, spec: DynoSpec): number {
  let start = Math.max(spec.idleRpm + 700, 0.25 * spec.limitRpm);
  if (spec.absorber === 'water') {
    for (let rpm = start; rpm < spec.limitRpm * 0.7; rpm += 50) {
      start = rpm;
      if (absorberMax(spec, rpm) >= 1.15 * mapValue(map, map.wotNm, rpm)) break;
    }
  }
  return Math.round(start / 100) * 100;
}

/** Highest speed a sweep runs to. */
export const sweepEndRpm = (spec: DynoSpec): number => Math.min(0.98 * spec.limitRpm, spec.maxRpm);

/** Lowest and highest speed the absorber is asked to hold. */
export const holdRange = (spec: DynoSpec): { min: number; max: number } => ({ min: spec.idleRpm + 200, max: spec.limitRpm - 150 });

export class DynoLoad implements CrankLoad {
  readonly spec: DynoSpec;
  private phase: DynoPhase = 'off';
  private setpoint = 0;
  /** Setpoint speed change, rad/s². */
  private rate = 0;
  private sweep = { from: 0, to: 0, rate: 0, throttle: 1 };
  private phaseTime = 0;
  /** Throttle the automation asks for, or null to follow the pedal. */
  private auto: number | null = null;
  private pedal = 0;
  private freePedal = 0;
  /** Where the cell's actuator holds the throttle. */
  private actuator = 0;
  private absorber = 0;
  private integral = 0;
  private rawPrev: number | null = null;
  private rawRate = 0;
  private tracking: Tracking = 'ok';
  private weakTime = 0;
  private gaveUp = false;
  private lastOmega: number | null = null;
  private lastAbsorber = 0;
  private reachTime = 0;
  private sum = { samples: 0, seconds: 0, rpm: 0, alpha: 0, measured: 0, absorber: 0, share: 0, setpoint: 0 };

  constructor(spec: DynoSpec) {
    this.spec = spec;
  }

  active(): boolean {
    return this.phase === 'hold' || this.phase === 'settle' || this.phase === 'ramp' || this.phase === 'rampdown';
  }

  inertia(): number {
    return this.spec.inertia;
  }

  engineRequest(): EngineRequest | null {
    if (this.phase === 'free') return { throttle: this.freePedal };
    if (!this.active()) return null;
    return { throttle: this.actuator };
  }

  engage(state: Engagement): void {
    const rpm = state.omega / RAD;
    this.absorber = absorberMin(this.spec, rpm);
    this.lastAbsorber = this.absorber;
    this.integral = 0;
    this.rawPrev = null;
    this.rawRate = 0;
    this.actuator = clamp(state.throttle, 0, 1);
    this.weakTime = 0;
    this.tracking = 'ok';
  }

  command(cmd: DynoCommand): void {
    switch (cmd.action) {
      case 'off':
        this.phase = 'off';
        this.auto = null;
        break;
      case 'free':
        this.phase = 'free';
        this.freePedal = clamp(cmd.pedal, 0, 1);
        break;
      case 'hold': {
        const { min, max } = holdRange(this.spec);
        this.phase = 'hold';
        this.setpoint = clamp(cmd.rpm, min, max) * RAD;
        this.rate = 0;
        this.auto = cmd.throttle;
        this.gaveUp = false;
        break;
      }
      case 'sweep':
        this.sweep = { from: cmd.fromRpm, to: Math.min(cmd.toRpm, sweepEndRpm(this.spec)), rate: cmd.rate, throttle: clamp(cmd.throttle, 0, 1) };
        this.phase = 'settle';
        this.phaseTime = 0;
        this.setpoint = cmd.fromRpm * RAD;
        this.rate = 0;
        this.auto = this.sweep.throttle;
        this.gaveUp = false;
        break;
      case 'abort':
        if (this.phase === 'settle' || this.phase === 'ramp') this.startRampdown();
        else if (this.phase !== 'rampdown') {
          this.phase = 'off';
          this.auto = null;
        }
        break;
    }
  }

  private startRampdown(): void {
    this.phase = 'rampdown';
    this.auto = 0;
    this.rate = -RAMPDOWN_RPM_S * RAD;
  }

  /** Moves the sweep along: settle, ramp, ramp down, release. The settling time counts once the engine is there. */
  private sequence(dt: number, approaching: boolean): void {
    this.phaseTime = approaching && this.phase === 'settle' ? 0 : this.phaseTime + dt;
    if (this.phase === 'settle' && this.phaseTime >= SETTLE_S) {
      this.phase = 'ramp';
      this.phaseTime = 0;
      this.rate = this.sweep.rate * RAD;
    }
    if (this.phase === 'ramp' || this.phase === 'rampdown' || this.phase === 'hold') this.setpoint += this.rate * dt;
    if (this.phase === 'ramp' && this.setpoint >= this.sweep.to * RAD) {
      this.setpoint = this.sweep.to * RAD;
      this.startRampdown();
    }
    if (this.phase === 'rampdown' && this.setpoint <= this.sweep.from * RAD) {
      this.phase = 'off';
      this.auto = null;
      this.rate = 0;
    }
  }

  step(input: CrankInput, dt: number): LoadTorque {
    const spec = this.spec;
    const omega = input.omega;
    const rpm = omega / RAD;
    this.pedal = clamp(input.pedal, 0, 1);
    // Measurement over the step just finished: the absorber's torque then, plus what its rotor took to accelerate.
    const alpha = this.lastOmega === null ? 0 : (omega - this.lastOmega) / dt;
    this.lastOmega = omega;
    const measured = this.lastAbsorber + spec.inertia * alpha;
    this.accumulate(dt, rpm, alpha, measured);

    if (!this.active()) {
      this.absorber = 0;
      this.lastAbsorber = 0;
      this.tracking = 'ok';
      return { torqueNm: 0, dTorque: 0 };
    }
    const approaching = rpm < this.setpoint / RAD - REACH_BAND_RPM;
    this.sequence(dt, approaching);

    // The cell's throttle actuator.
    let wanted = this.auto ?? this.pedal;
    this.reachTime = approaching ? this.reachTime + dt : 0;
    if (this.auto !== null && approaching && (this.phase === 'hold' || this.phase === 'settle')) {
      wanted = Math.min(wanted, REACH_THROTTLE + 0.1 * this.reachTime);
    }
    this.actuator += clamp(wanted - this.actuator, -ACTUATOR_CLOSE * dt, ACTUATOR_OPEN * dt);

    // Speed controller: feed-forward of the engine torque the dyno sees and of the inertia the ramp needs, a PI on
    // the speed error, and a lead that cancels the absorber's own lag.
    const inertia = spec.engineInertia + spec.inertia;
    const kp = 2 * CONTROL_ZETA * CONTROL_W * inertia;
    const ki = CONTROL_W * CONTROL_W * inertia;
    const error = omega - this.setpoint;
    const raw = input.engineNm - inertia * this.rate + kp * error + this.integral;
    if (this.rawPrev !== null) this.rawRate += ((raw - this.rawPrev) / dt - this.rawRate) * Math.min(1, dt / LEAD_FILTER);
    this.rawPrev = raw;
    const lo = absorberMin(spec, rpm);
    const hi = absorberMax(spec, rpm);
    const rising = this.rawRate >= 0;
    const tau = spec.absorber === 'eddy' ? EDDY_TAU : rising ? WATER_TAU_UP : WATER_TAU_DOWN;
    const command = clamp(raw + tau * this.rawRate, lo, hi);
    // Integrate unless that would push further into a limit the command already sits on.
    if ((raw < hi || error < 0) && (raw > lo || error > 0)) this.integral += ki * error * dt;
    const lag = spec.absorber === 'eddy' ? EDDY_TAU : command > this.absorber ? WATER_TAU_UP : WATER_TAU_DOWN;
    this.absorber += (command - this.absorber) * Math.min(1, dt / lag);
    this.absorber = clamp(this.absorber, 0, Math.max(hi, lo));

    const off = rpm - this.setpoint / RAD;
    const weak = off < -TRACK_RPM && command <= lo + 1e-9;
    this.tracking = off > TRACK_RPM && this.absorber >= 0.98 * hi ? 'absorber-weak' : weak ? 'engine-weak' : 'ok';
    this.weakTime = weak ? this.weakTime + dt : 0;
    // A sweep ends where the engine can no longer pull: the absorber is already at its least and still too much.
    if (this.phase === 'ramp' && this.weakTime > 0.5) {
      this.gaveUp = true;
      this.startRampdown();
    }

    this.lastAbsorber = this.absorber;
    return { torqueNm: this.absorber, dTorque: 0 };
  }

  private accumulate(dt: number, rpm: number, alpha: number, measured: number): void {
    const s = this.sum;
    s.samples += 1;
    s.seconds += dt;
    s.rpm += rpm;
    s.alpha += alpha;
    s.measured += measured;
    s.absorber += this.lastAbsorber;
    s.setpoint += this.setpoint / RAD;
    const hi = absorberMax(this.spec, rpm);
    s.share += hi > 0 ? this.lastAbsorber / hi : 0;
  }

  readings(): DynoReadings {
    const s = this.sum;
    const n = Math.max(1, s.samples);
    const reading: DynoReadings = {
      kind: 'dyno',
      samples: s.samples,
      seconds: s.seconds,
      rpm: s.rpm / n,
      alpha: s.alpha / n,
      measuredNm: s.measured / n,
      absorberNm: s.absorber / n,
      absorberShare: s.share / n,
      setpointRpm: this.active() ? s.setpoint / n : null,
      phase: this.phase,
      tracking: this.tracking,
      throttle: this.phase === 'free' ? this.freePedal : this.active() ? this.actuator : this.pedal,
      automatic: this.phase === 'free' || (this.active() && this.auto !== null),
      gaveUp: this.gaveUp,
    };
    this.sum = { samples: 0, seconds: 0, rpm: 0, alpha: 0, measured: 0, absorber: 0, share: 0, setpoint: 0 };
    return reading;
  }
}

/**
 * Pedal that holds a speed on the free path, where the pedal asks for a speed between idle and a little past the
 * rev limit. Used by "listen without load" to keep the same revs once the absorber lets go.
 */
export function freePedalFor(rpm: number, idleRpm: number, redlineRpm: number, topSpeed: number): number {
  const idle = idleRpm / redlineRpm;
  return clamp((rpm / redlineRpm - idle) / (topSpeed - idle), 0, 1);
}
