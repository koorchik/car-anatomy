// Air through the engine and the fuel it carries. The supercharger law and the compressor temperature come from the
// designer's model (physics.ts), so the layer and the results panel show the same boost and the same heat.

import { T_ATM, compressorOutletK, superchargerRatio } from '../designer/physics.ts';
import type { Engine } from '../engine/kinematics.ts';
import type { SuperchargerKind, SystemsSpec } from '../engine/systems-spec.ts';
import { litresPerRev, strokeM, turboCountOf } from './size.ts';

const P_ATM = 101325;
const R_AIR = 287;
/** Volumetric efficiency of the layers (estimate). The designer's model has its own only after the first change. */
export const VE = 0.85;
/** The outside air, C: the designer's 298 K. */
export const AMBIENT_C = T_ATM - 273;

export interface AirParams {
  litresPerRev: number;
  diesel: boolean;
  turbo: boolean;
  supercharger: SuperchargerKind | null;
  boostBar: number;
  intercooler: number;
  strokeM: number;
  afr: number;
  lhvMJ: number;
  /** Full-load mixture from the design. */
  lambda: number;
}

export function airParams(engine: Engine, s: SystemsSpec): AirParams {
  const spec = engine.spec;
  return {
    litresPerRev: litresPerRev(engine),
    diesel: spec.fuel === 'diesel',
    turbo: turboCountOf(spec) > 0,
    supercharger: s.supercharger,
    boostBar: s.boostBar,
    intercooler: s.intercooler,
    strokeM: strokeM(spec),
    afr: s.afr,
    lhvMJ: s.lhvMJ,
    lambda: s.lambda,
  };
}

export interface AirInput {
  rpm: number;
  load: number;
  /** Turbo shaft speed from EngineSim, 0..1. */
  boost: number;
  /** No fuel is injected on the limiter or on a closed-throttle overrun. */
  fuelCut: boolean;
}

export interface AirState {
  /** g/s */
  airGs: number;
  fuelGs: number;
  /** Fuel energy, kW (lower heating value). */
  fuelKw: number;
  pressureRatio: number;
  /** Share of the outside pressure the throttle lets through; 1 on a diesel. */
  fill: number;
  /** Manifold pressure, bar absolute. */
  manifoldBar: number;
  /** After the compressor and after the intercooler, C. Ambient without a charger. */
  compressorC: number;
  chargeC: number;
  lambda: number;
}

export const newAirState = (): AirState => ({ airGs: 0, fuelGs: 0, fuelKw: 0, pressureRatio: 1, fill: 1, manifoldBar: 1, compressorC: AMBIENT_C, chargeC: AMBIENT_C, lambda: 1 });

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Writes the state into `out`. Allocates nothing. */
export function airStep(p: AirParams, input: AirInput, out: AirState): void {
  const load = clamp(input.load, 0, 1);
  const fill = p.diesel ? 1 : 0.15 + 0.85 * load;
  let pr = 1;
  if (p.turbo) pr = 1 + p.boostBar * clamp(input.boost, 0, 1);
  else if (p.supercharger) {
    // Full throttle follows the designer's law; at part throttle the blower's bypass valve stands open (estimate).
    const wot = superchargerRatio(p.supercharger, p.boostBar, input.rpm, p.strokeM);
    pr = 1 + (wot - 1) * clamp((load - 0.3) / 0.55, 0, 1);
  }
  const t2 = pr > 1 ? compressorOutletK(pr) : T_ATM;
  const t3 = pr > 1 ? t2 - p.intercooler * (t2 - T_ATM) : T_ATM;
  const density = (fill * pr * P_ATM) / (R_AIR * t3);
  const airGs = density * VE * (p.litresPerRev / 1000) * (Math.max(0, input.rpm) / 60) * 1000;
  // Petrol runs at lambda 1 until the enrichment the designer's model uses takes over near full load.
  // A diesel's fuel follows the load, with the design's lambda as the smoke limit at full load.
  let lambda: number;
  let fuelGs: number;
  if (p.diesel) {
    fuelGs = (load * airGs) / (p.afr * p.lambda);
    lambda = load > 0.01 ? p.lambda / load : 99;
  } else {
    lambda = load <= 0.8 ? 1 : 1 + (p.lambda - 1) * ((load - 0.8) / 0.2);
    fuelGs = airGs / (p.afr * lambda);
  }
  if (input.fuelCut) fuelGs = 0;
  out.airGs = airGs;
  out.fuelGs = fuelGs;
  out.fuelKw = fuelGs * p.lhvMJ;
  out.pressureRatio = pr;
  out.fill = fill;
  out.manifoldBar = fill * pr * (P_ATM / 1e5);
  out.compressorC = t2 - 273;
  out.chargeC = t3 - 273;
  out.lambda = lambda;
}
