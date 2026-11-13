// Two-node warm-up model: E is the metal around the chambers with the coolant (or the finned heads of an air-cooled
// engine), O is the oil with the pan and crank. Time runs 20 times faster than on screen, like wear in reliability.ts.
// Constants, sources and the analytic checks behind them: docs/engine-systems-model.md.

import type { Engine } from '../engine/kinematics.ts';
import type { Cooling, SystemsSpec } from '../engine/systems-spec.ts';
import { AMBIENT_C } from './air.ts';
import { fourStrokeLitres, strokeM } from './size.ts';

/** Model seconds per second on screen. */
export const WARMUP_SPEED = 20;
export const THERMOSTAT_OPEN_C = 88;
export const THERMOSTAT_FULL_C = 100;
/** Wax element lag, model seconds. */
const THERMOSTAT_TAU = 20;
/** Oil cooler thermostat opens from here over 15 K (estimate). */
const OIL_COOLER_OPEN_C = 95;
/** Coolant pump: 100 L/min per 2 L at 3000 rpm (EJ205 in the Saab 9-2X manual: 20, 100, 200 L/min at 760, 3000, 6000). */
const PUMP_LPM_PER_LITRE_RPM = 50 / 3000;
/** Share of the pump's flow through a mostly closed heater valve (estimate). */
export const HEATER_SHARE = 0.01;
export const TURBO_COOLANT_SHARE = 0.02;
/** Full-power coolant and air-cooled metal temperatures the radiator and the fins are sized for. */
const RADIATOR_SIZED_C = 105;
const FINS_SIZED_C = 180;
/** Share of the friction the rings and skirts make, whose heat goes into the liners (about half after Heywood; to check). */
const RING_FRICTION_SHARE = 0.5;
/** Bare fins in still air, natural convection and radiation, as a share of their cooling at full speed (estimate). */
const RAM_STILL = 0.1;
/** An air-cooled engine's finned crankcase in the cooling air, kW/K per litre at full airflow (estimate). */
const CASE_UA_PER_LITRE = 0.12;

export interface ThermalParams {
  cooling: Cooling;
  diesel: boolean;
  rotary: boolean;
  /** Bore, mm, and stroke as the designer counts it, m: the friction law reads them. */
  boreMm: number;
  strokeM: number;
  /** Valvetrain part of the friction, bar. */
  trainBar: number;
  oilCooler: SystemsSpec['oilCooler'];
  jets: boolean;
  litres: number;
  redlineRpm: number;
  idleRpm: number;
  /** kJ/K */
  cE: number;
  cO: number;
  /** kW/K */
  uaRad: number;
  uaHeater: number;
  uaNat: number;
  uaOE: number;
  uaOilCoolant: number;
  uaOilAir: number;
  uaPan: number;
  uaFin: number;
  /** An air-cooled engine's crankcase in the cooling air. */
  uaCase: number;
}

/**
 * Air over the fins or an oil cooler, as a share of what it is at full speed. A fan follows the crank. Ram air follows
 * the road speed, and the model has none, so the speed of the engine stands in for it: sustained full power at the
 * limiter is top speed, idling is standing still. A car's radiator fan keeps some air moving at idle.
 */
export function airFlowShare(cooling: Cooling, rpm: number, redlineRpm: number, idleRpm: number, running: boolean): number {
  const n = Math.min(Math.max(rpm, 0) / redlineRpm, 1);
  if (cooling === 'fan') return running ? 0.15 + 0.85 * n : 0.05;
  if (cooling === 'ram') return RAM_STILL + (1 - RAM_STILL) * (running ? clamp((rpm - idleRpm) / Math.max(redlineRpm - idleRpm, 1), 0, 1) : 0);
  return 0.25 + 0.75 * n;
}

type FrictionParams = Pick<ThermalParams, 'diesel' | 'rotary' | 'boreMm' | 'strokeM' | 'trainBar'>;

/**
 * Friction mean effective pressure with the accessories, bar: the designer's law (physics.ts) without the side load
 * and the balance shafts only a design knows, and with an estimated peak cylinder pressure.
 */
export function frictionBar(p: FrictionParams, rpm: number, load: number, pressureRatio: number): number {
  const sp = (2 * p.strokeM * Math.max(0, rpm)) / 60;
  const l = clamp(load, 0, 1) * Math.max(1, pressureRatio);
  const peakBar = p.diesel ? 50 + 90 * l : 12 + 58 * l;
  const accessories = 0.08;
  if (p.rotary) return 0.35 + 0.004 * peakBar + 0.0016 * sp * sp + 0.012 * sp + accessories;
  return 0.34 * Math.sqrt(86 / p.boreMm) + p.trainBar + 0.0055 * peakBar + 0.012 * sp + 0.00105 * sp * sp + accessories;
}

/** Heat the friction makes, kW: FMEP times the volume swept per second. */
export const frictionKw = (p: FrictionParams & { litres: number }, rpm: number, load: number, pressureRatio: number): number =>
  (frictionBar(p, rpm, load, pressureRatio) * p.litres * Math.max(0, rpm)) / 1200;

/**
 * @param fuelMaxKw fuel energy at the limiter, full throttle and full boost. The radiator (or the fins) must carry
 *   what goes into the coolant and what the oil hands on to the block, so both are counted in its size.
 * @param pressureRatioMax the charger's pressure ratio there.
 */
export function thermalParams(engine: Engine, s: SystemsSpec, fuelMaxKw: number, pressureRatioMax = 1): ThermalParams {
  const vd = fourStrokeLitres(engine);
  const spec = engine.spec;
  const friction: FrictionParams & { litres: number } = {
    diesel: spec.fuel === 'diesel',
    rotary: engine.isRotary,
    boreMm: spec.bore,
    strokeM: strokeM(spec),
    trainBar: (({ dohc: 0.06, sohc: 0.04, ohv: 0.02 } as Record<string, number>)[spec.valvetrain] ?? 0.04) + 0.012 * spec.valvesPerCyl,
    litres: vd,
  };
  const heatMaxKw = (0.23 + (s.pistonJets ? 0.03 : 0)) * fuelMaxKw + frictionKw(friction, spec.redlineRpm, 1, pressureRatioMax);
  const finAir = airFlowShare(s.cooling, spec.redlineRpm, spec.redlineRpm, spec.idleRpm, true);
  return {
    ...friction,
    cooling: s.cooling,
    oilCooler: s.oilCooler,
    jets: s.pistonJets,
    litres: vd,
    redlineRpm: spec.redlineRpm,
    idleRpm: spec.idleRpm,
    cE: 13 * vd + 4,
    cO: 8 * vd + 2,
    uaRad: heatMaxKw / (RADIATOR_SIZED_C - AMBIENT_C),
    uaHeater: (0.005 * heatMaxKw) / (RADIATOR_SIZED_C - AMBIENT_C),
    uaNat: 0.01 * vd,
    uaOE: 0.4 * vd,
    uaOilCoolant: 0.4 * vd,
    uaOilAir: 0.1 * vd,
    uaPan: 0.003 * vd,
    uaFin: heatMaxKw / ((FINS_SIZED_C - AMBIENT_C) * finAir),
    uaCase: s.cooling === 'liquid' ? 0 : CASE_UA_PER_LITRE * vd,
  };
}

export interface ThermalInput {
  /** Seconds on screen. */
  dt: number;
  rpm: number;
  load: number;
  running: boolean;
  /** Fuel energy burnt, kW. Zero on fuel cut. */
  fuelKw: number;
  /** Charger pressure ratio, 1 without boost. */
  pressureRatio: number;
}

export interface ThermalState {
  /** Coolant, or the finned metal of an air-cooled engine, C. */
  engineC: number;
  oilC: number;
  /** Thermostat opening, 0..1. */
  thermostat: number;
  /** L/min */
  coolantFlow: number;
  radiatorFlow: number;
  bypassFlow: number;
  heaterFlow: number;
  turboFlow: number;
  /** kW */
  toCoolant: number;
  toOil: number;
  rejected: number;
  /** Model seconds since the engine caught, for glow plugs and the cold-start injection. */
  sinceStart: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Where the wax element settles at a coolant temperature, 0 shut to 1 fully open. */
export const thermostatTarget = (tC: number): number => clamp((tC - THERMOSTAT_OPEN_C) / (THERMOSTAT_FULL_C - THERMOSTAT_OPEN_C), 0, 1);

export const newThermalState = (): ThermalState => ({
  engineC: 90,
  oilC: 92,
  thermostat: thermostatTarget(90),
  coolantFlow: 0,
  radiatorFlow: 0,
  bypassFlow: 0,
  heaterFlow: 0,
  turboFlow: 0,
  toCoolant: 0,
  toOil: 0,
  rejected: 0,
  sinceStart: 1e6,
});

export class ThermalModel {
  params: ThermalParams;
  readonly state = newThermalState();
  private wasRunning = false;

  constructor(params: ThermalParams) {
    this.params = params;
  }

  /** Warm: as a car that has just been driven. Cold: as one that stood overnight. */
  reset(kind: 'warm' | 'cold'): void {
    const s = this.state;
    const liquid = this.params.cooling === 'liquid';
    if (kind === 'cold') {
      s.engineC = AMBIENT_C;
      s.oilC = AMBIENT_C;
    } else {
      s.engineC = liquid ? 89 : 75;
      s.oilC = liquid ? 90 : 88;
    }
    // Idling warm, the thermostat stands barely open.
    s.thermostat = liquid ? Math.min(0.04, thermostatTarget(s.engineC)) : 0;
    s.sinceStart = kind === 'cold' ? 0 : 1e6;
  }

  /** Coolant pump flow at this speed, L/min. */
  pumpFlow(rpm: number): number {
    return this.params.cooling === 'liquid' ? PUMP_LPM_PER_LITRE_RPM * this.params.litres * Math.max(0, rpm) : 0;
  }

  /** Advances by dt on screen when `live`; otherwise only the flows follow the speed. Allocates nothing. */
  step(input: ThermalInput, live: boolean): void {
    const p = this.params;
    const s = this.state;
    const liquid = p.cooling === 'liquid';
    const n = Math.max(0, input.rpm) / p.redlineRpm;
    const qPump = this.pumpFlow(input.rpm);
    s.coolantFlow = qPump;
    s.radiatorFlow = s.thermostat * (1 - HEATER_SHARE - TURBO_COOLANT_SHARE) * qPump;
    s.bypassFlow = (1 - s.thermostat) * (1 - HEATER_SHARE - TURBO_COOLANT_SHARE) * qPump;
    s.heaterFlow = HEATER_SHARE * qPump;
    s.turboFlow = TURBO_COOLANT_SHARE * qPump;
    if (input.running && !this.wasRunning) s.sinceStart = 0;
    this.wasRunning = input.running;
    if (!live) return;

    const firing = input.running && input.fuelKw > 0;
    const load = clamp(input.load, 0, 1);
    // Friction turns into heat whenever the crank turns; with no load on the shaft all the indicated work ends up there.
    // The rings and skirts make about half of it and hand it to the liners, the bearings and the valvetrain the rest.
    const friction = input.running ? frictionKw(p, input.rpm, load, input.pressureRatio) : 0;
    const qc = (firing ? (0.23 + 0.13 * (1 - load)) * input.fuelKw : 0) + RING_FRICTION_SHARE * friction;
    const qo = (firing ? (p.jets ? 0.03 : 0) * input.fuelKw : 0) + (1 - RING_FRICTION_SHARE) * friction;
    // Oil circulation, and with it the oil's grip on the block, grows with speed. A stopped engine keeps only conduction.
    const flowShare = input.running ? 0.15 + 0.85 * Math.min(n, 1) : 0.05;
    const idleFlow = this.pumpFlow(p.idleRpm);
    const fAir = airFlowShare(p.cooling, input.rpm, p.redlineRpm, p.idleRpm, input.running);

    let remaining = input.dt * WARMUP_SPEED;
    let toCoolant = 0;
    let toOil = 0;
    let rejected = 0;
    while (remaining > 1e-9) {
      const h = Math.min(remaining, 1);
      remaining -= h;
      const dE = s.engineC - AMBIENT_C;
      const dO = s.oilC - AMBIENT_C;
      const pumping = qPump > 0;
      const rad = liquid && pumping ? s.thermostat * p.uaRad * dE : 0;
      const heater = liquid ? p.uaHeater * Math.min(1, idleFlow > 0 ? qPump / idleFlow : 0) * dE : 0;
      const fins = liquid ? 0 : p.uaFin * fAir * dE;
      const nat = p.uaNat * dE;
      const oe = p.uaOE * flowShare * (s.engineC - s.oilC);
      const oc = p.oilCooler === 'coolant' && liquid ? p.uaOilCoolant * flowShare * (s.engineC - s.oilC) : 0;
      const oilValve = clamp((s.oilC - OIL_COOLER_OPEN_C) / 15, 0, 1);
      const oa = p.oilCooler === 'air' ? p.uaOilAir * fAir * oilValve * dO : 0;
      const pan = p.uaPan * dO + p.uaCase * fAir * dO;
      s.engineC += ((qc - rad - heater - fins - nat - oe - oc) * h) / p.cE;
      s.oilC += ((qo + oe + oc - oa - pan) * h) / p.cO;
      if (liquid) s.thermostat += (thermostatTarget(s.engineC) - s.thermostat) * (1 - Math.exp(-h / THERMOSTAT_TAU));
      toCoolant = qc;
      toOil = qo;
      rejected = rad + heater + fins + nat + oa + pan;
      if (input.running) s.sinceStart += h;
    }
    s.toCoolant = toCoolant;
    s.toOil = toOil;
    s.rejected = rejected;
  }
}
