// The engine with a load on its crank, in newton-metres: (J_engine + J_load) dω/dt = M_engine − M_load.
// EngineSim hands it each step; while the load only adds inertia, the engine keeps its free path instead.
//
// Engine torque comes from the absolute map: full load from the performance model, part load on the Willans line,
// boost held back by the turbo's spool. Idle control, the rev limiter and the overrun fuel cut work as on the free
// path. A load can also cut fuel, cap the torque, stall the engine or drag it while it is stopping.

import type { CrankLoad, EngineRequest } from './load.ts';
import type { EngineSim } from './sim.ts';
import {
  brakeTorque,
  chargeLimit,
  holdCharge,
  leakCharge,
  manifoldBar,
  mapValue,
  motoringTorque,
  pressureForShaft,
  spoolTime,
  turboShaft,
  type EngineTorqueMap,
} from './torque-map.ts';
import type { LoadReadings } from './load.ts';

export interface CrankReadings {
  /** Steps averaged. */
  samples: number;
  /** True while the load set its own torque; false while the engine ran free with the load's inertia added. */
  coupled: boolean;
  /** Engine brake torque, N·m. Only meaningful while coupled. */
  engineNm: number;
  /** Manifold pressure over atmospheric, bar. */
  manifoldBar: number;
  /** Share of the steady boost the turbo gives. */
  spool: number;
  /** The turbo's time constant at the current speed, s. */
  spoolS: number;
  load: LoadReadings;
}

const RAD = Math.PI / 30;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Idle governor: closed-loop bandwidth, rad/s, and damping. */
const IDLE_W = 4;
const IDLE_ZETA = 0.9;
/** Manifold filling lag on the idle governor's charge, per second. */
const IDLE_FILL = 12;
const IDLE_MAX = 0.55;
/** Below this share of idle speed with fuel on, for this long, the engine stalls. */
const STALL_SHARE = 0.5;
const STALL_S = 0.3;
/**
 * A start runs on the free path, with its catch flare, until the engine is this close to idle: an engine that has only
 * just fired cannot yet hold a load, and the stall rule would stop it before the idle governor lifted the flywheel.
 */
const CAUGHT_SHARE = 0.9;

export class LoadedCrank {
  map: EngineTorqueMap;
  readonly load: CrankLoad;
  /** Manifold pressure ratio the turbo gives right now. */
  private pressure = 1;
  private idleCharge = 0;
  private idleIntegral = 0;
  private limiter = false;
  private stallTime = 0;
  private engaged = false;
  /** The engine has started and come up to idle since the last time the starter turned it. */
  private caught = false;
  private engineNm = 0;
  private request: EngineRequest | null = null;
  private charge = 0;
  private sum = { samples: 0, coupled: 0, engineNm: 0, manifold: 0, spool: 0, spoolS: 0 };

  constructor(map: EngineTorqueMap, load: CrankLoad) {
    this.map = map;
    this.load = load;
  }

  setMap(map: EngineTorqueMap): void {
    this.map = map;
  }

  /** Throttle for this step: what the load asks for, or the driver's pedal. */
  pedal(sim: EngineSim): number {
    this.request = this.load.engineRequest();
    return this.request?.throttle ?? sim.pedal;
  }

  /** Moves the crank when the load is active and says so. Otherwise sets the inertia share for the free path. */
  step(sim: EngineSim, dt: number): boolean {
    const map = this.map;
    const load = this.load;
    const omega = (sim.rpm * Math.PI) / 30;
    if (sim.state === 'cranking') this.caught = false;
    else if (sim.state === 'running' && sim.rpm >= CAUGHT_SHARE * Math.min(map.idleRpm, sim.params.idleRpm)) this.caught = true;
    // Once it has caught, the load stays on through a stall and while the engine runs down or stands.
    const active = load.active() && sim.state !== 'cranking' && (this.caught || sim.state !== 'running');
    if (!active) {
      sim.inertiaShare = map.inertia / (map.inertia + load.inertia());
      this.engaged = false;
      load.step({ omega, pedal: sim.pedal, engineNm: 0, engineInertia: map.inertia, state: sim.state }, dt);
      // The free path has no charge of its own: its load is close enough for a readout.
      const pressure = pressureForShaft(map, sim.boost);
      this.accumulate(false, 0, this.manifold(sim, Math.max(sim.load, leakCharge(map, sim.rpm)), pressure), pressure, sim.rpm);
      return false;
    }
    sim.inertiaShare = 1;
    const rpm = sim.rpm;
    const pressureRatio = map.boostKind === 'none' ? 1 : mapValue(map, map.pressureRatio, rpm);
    if (!this.engaged) this.engage(sim, pressureRatio);

    const request = this.request;
    const running = sim.state === 'running';
    // Pedal asks for torque, as an electronic throttle does: full travel is full boost.
    const demand = sim.throttle * pressureRatio;

    if (rpm >= map.limitRpm) this.limiter = true;
    else if (rpm < map.limitRpm - 180) this.limiter = false;
    const overrun = sim.throttle < 0.02 && rpm > map.idleRpm * 1.25;
    const fuelOn = running && !this.limiter && !overrun && !request?.cutFuel;

    // Idle governor, with gains set by this engine's inertia and how much torque a unit of charge makes at idle.
    const inertia = map.inertia + load.inertia();
    const idleOmega = map.idleRpm * RAD;
    const slope = Math.max(mapValue(map, map.baseNm, map.idleRpm) + mapValue(map, map.interceptNm, map.idleRpm), 1);
    const kp = (2 * IDLE_ZETA * IDLE_W * inertia) / slope;
    const ki = (IDLE_W * IDLE_W * inertia) / slope;
    let idleTarget = 0;
    if (running) {
      const error = idleOmega - omega;
      this.idleIntegral = clamp(this.idleIntegral + ki * error * dt, -0.2, 0.3);
      idleTarget = clamp(holdCharge(map, map.idleRpm) + kp * error + this.idleIntegral, 0, IDLE_MAX);
    } else {
      this.idleIntegral = 0;
    }
    this.idleCharge += (idleTarget - this.idleCharge) * Math.min(1, IDLE_FILL * dt);

    // Turbo: the manifold pressure it gives follows what the pedal asks of it at this speed, with the spool lag.
    // Its state is the pressure itself, so on a sweep it falls behind the rising steady boost as a real one does.
    if (map.boostKind === 'turbo') {
      const share = fuelOn ? clamp((demand - 1) / Math.max(pressureRatio - 1, 1e-6), 0, 1) : 0;
      const target = 1 + (pressureRatio - 1) * share;
      const tau = spoolTime(map, rpm, target > this.pressure);
      this.pressure += (target - this.pressure) * Math.min(1, dt / tau);
    } else {
      this.pressure = pressureRatio;
    }

    let charge = Math.max(demand, this.idleCharge, leakCharge(map, rpm));
    // Resting cylinders take no charge: those still firing hold at most their share of the full-load charge.
    // The valve controller wakes them as soon as the load passes its threshold, which sits below that share.
    charge = Math.min(charge, chargeLimit(map, rpm, this.pressure) * sim.valves.state.active);
    this.charge = charge;

    let engineNm = fuelOn ? brakeTorque(map, rpm, charge) : -motoringTorque(map, rpm, charge);
    if (fuelOn && request?.maxNm !== undefined) engineNm = Math.min(engineNm, request.maxNm);

    const torque = load.step({ omega, pedal: sim.pedal, engineNm: this.engineNm, engineInertia: map.inertia, state: sim.state }, dt);
    const next = omega + (dt * (engineNm - torque.torqueNm)) / (inertia + dt * Math.max(0, torque.dTorque));
    sim.rpm = Math.max(0, next) / RAD;
    this.engineNm = engineNm;

    // A load that drags the engine far below idle stalls it.
    this.stallTime = running && fuelOn && sim.rpm < STALL_SHARE * map.idleRpm ? this.stallTime + dt : 0;
    if (this.stallTime > STALL_S) {
      this.stallTime = 0;
      sim.stop();
    }
    if (sim.state === 'stopping' && sim.rpm < 40 && engineNm - torque.torqueNm <= 0) {
      sim.rpm = 0;
      sim.state = 'off';
    }

    sim.fuelCut = !fuelOn;
    const targetLoad = fuelOn ? clamp(charge, 0, 1) : 0;
    sim.load += (targetLoad - sim.load) * Math.min(1, 14 * dt);
    sim.boost = turboShaft(map, this.pressure);
    this.accumulate(true, engineNm, this.manifold(sim, charge, this.pressure), this.pressure, sim.rpm);
    return true;
  }

  /** Takes over from the free path without a jolt: the charge that held the engine, the boost it had. */
  private engage(sim: EngineSim, pressureRatio: number): void {
    const map = this.map;
    const throttle = clamp(holdCharge(map, sim.rpm) / pressureRatio, 0, 1);
    sim.throttle = throttle;
    this.pressure = map.boostKind === 'turbo' ? pressureForShaft(map, sim.boost) : pressureRatio;
    this.idleIntegral = 0;
    this.idleCharge = 0;
    this.stallTime = 0;
    this.limiter = false;
    this.engineNm = 0;
    this.load.engage({ omega: sim.rpm * RAD, engineNm: 0, throttle });
    this.engaged = true;
  }

  /** Manifold pressure over atmospheric, bar. An engine switched off soon fills its manifold to atmospheric. */
  private manifold(sim: EngineSim, charge: number, pressure: number): number {
    return sim.state === 'off' || sim.rpm < 1 ? 0 : manifoldBar(this.map, sim.rpm, charge, pressure);
  }

  private accumulate(coupled: boolean, engineNm: number, manifold: number, pressure: number, rpm: number): void {
    const s = this.sum;
    const steady = this.map.boostKind === 'none' ? 1 : mapValue(this.map, this.map.pressureRatio, rpm);
    s.samples += 1;
    s.coupled += coupled ? 1 : 0;
    s.engineNm += engineNm;
    s.manifold += manifold;
    s.spool += steady > 1.001 ? clamp((pressure - 1) / (steady - 1), 0, 1) : 1;
    s.spoolS += this.map.boostKind === 'turbo' ? spoolTime(this.map, rpm, true) : 0;
  }

  /** The charge applied on the last coupled step, relative to a full atmospheric one. */
  get lastCharge(): number {
    return this.charge;
  }

  readings(): CrankReadings {
    const s = this.sum;
    const n = Math.max(1, s.samples);
    const reading: CrankReadings = {
      samples: s.samples,
      coupled: s.coupled * 2 > s.samples,
      engineNm: s.engineNm / Math.max(1, s.coupled),
      manifoldBar: s.manifold / n,
      spool: s.spool / n,
      spoolS: s.spoolS / n,
      load: this.load.readings(),
    };
    this.sum = { samples: 0, coupled: 0, engineNm: 0, manifold: 0, spool: 0, spoolS: 0 };
    return reading;
  }
}
