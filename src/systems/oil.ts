// Oil pressure and flow: a positive-displacement pump against the laminar leak of the bearings, a relief valve at
// the pump outlet and piston cooling jets that open progressively. Formulas and sources: docs/engine-systems-model.md.

import type { Engine } from '../engine/kinematics.ts';
import type { SystemsSpec } from '../engine/systems-spec.ts';
import { fourStrokeLitres, turboCountOf } from './size.ts';
import { viscosityRatio } from './viscosity.ts';

/** Pump delivery per crank turn and litre: 2.65 cm3 for the EJ253, 4.7 cm3 for the turbocharged EJ205 (Saab 9-2X). */
export const PUMP_CM3_PER_LITRE = 2.6;
export const PUMP_CM3_PER_LITRE_HEAVY = 4.7;
/** Pressure of a hot engine at the calibration speed, bar: Mazda RX-8, 350 kPa at 3000 rpm and 100 C. */
export const CALIBRATION_BAR = 3.5;
/** Relief valve opening, bar: EJ253 490 kPa, EJ205 588 kPa. */
export const RELIEF_BAR = 5.0;
export const RELIEF_BAR_HEAVY = 5.9;
/** Piston jets start to open here and are fully open this much higher (estimate between VW 1.8T and Chrysler 3.6). */
export const JET_OPEN_BAR = 2.0;
export const JET_SPAN_BAR = 0.75;
/** Conductance of fully open jets as a share of the bearings' (estimate). */
export const JET_SHARE = 0.35;
/** How the bearings' conductance splits (estimate: the source order is mains first). */
export const MAIN_SHARE = 0.6;
export const HEAD_SHARE = 0.35;
export const CHAIN_SHARE = 0.05;
/** Low-pressure lamp of a running engine, bar. Subaru's switch works at 14.7 kPa. */
export const WARNING_BAR = 0.15;
/**
 * Scavenge stages of a dry sump displace this many times the pressure stage: they return foamy oil and must keep the
 * pan empty (estimate, to be checked by feature/oil-sump).
 */
export const SCAVENGE_RATIO = 2.5;

export interface OilParams {
  /** Litres per crank turn. */
  pumpLitresPerRev: number;
  /** Bearings' conductance at 100 C, L/min per bar. */
  g100: number;
  /** Turbo bearings' conductance as a share of the bearings'. */
  turboShare: number;
  jets: boolean;
  reliefBar: number;
  /**
   * Relief valve conductance once open, L/min per bar. An orifice, so it hardly depends on viscosity. Sized to pass
   * the pump's whole flow at the limiter for a 10 % rise over its opening pressure, as a real valve is sized.
   */
  reliefG: number;
  /** All scavenge stages together, litres per crank turn. Zero on a wet sump. */
  scavengeLitresPerRev: number;
}

export function oilParams(engine: Engine, s: SystemsSpec): OilParams {
  const spec = engine.spec;
  const vd = fourStrokeLitres(engine);
  const turbos = turboCountOf(spec);
  const heavy = s.pistonJets || turbos > 0 || engine.isRotary;
  const pumpLitresPerRev = ((heavy ? PUMP_CM3_PER_LITRE_HEAVY : PUMP_CM3_PER_LITRE) * vd) / 1000;
  const turboShare = Math.min(0.06 * turbos, 0.2);
  // Calibrated at 3000 rpm, or lower for a truck diesel whose limiter is near 2000.
  const nCal = Math.min(3000, 0.6 * spec.redlineRpm);
  const jetsAtCal = s.pistonJets ? JET_SHARE : 0;
  const g100 = (pumpLitresPerRev * nCal) / (CALIBRATION_BAR * (1 + turboShare + jetsAtCal));
  const boosted = spec.aspiration !== 'na' || spec.fuel === 'diesel';
  const reliefBar = boosted ? RELIEF_BAR_HEAVY : RELIEF_BAR;
  const scavengeLitresPerRev = s.sump === 'wet' ? 0 : SCAVENGE_RATIO * pumpLitresPerRev;
  return { pumpLitresPerRev, g100, turboShare, jets: s.pistonJets, reliefBar, reliefG: (pumpLitresPerRev * spec.redlineRpm) / (0.1 * reliefBar), scavengeLitresPerRev };
}

export interface OilInput {
  rpm: number;
  tempC: number;
  /** Share of oil in what the pump draws, 0..1. Always 1 on a wet sump at rest; feature/oil-sump drives it. */
  supply: number;
  /** Share of oil in what the scavenge stages draw, 0..1; the rest is air. Feature/oil-sump drives it. */
  scavengeSupply?: number;
  running: boolean;
  /** The visitor's engine at its true speed. The warning only shows then. */
  live: boolean;
}

export interface OilState {
  /** Gallery pressure, bar gauge. */
  pressure: number;
  /** All flows in L/min. */
  pumpFlow: number;
  /** Oil the scavenge stages return to the tank. Zero on a wet sump. */
  scavenge: number;
  reliefFlow: number;
  mains: number;
  head: number;
  chain: number;
  turbo: number;
  jets: number;
  reliefOpen: boolean;
  /** How far the piston jets are open, 0..1. */
  jetsOpen: number;
  warning: boolean;
  viscosityRatio: number;
}

export const newOilState = (): OilState => ({
  pressure: 0,
  pumpFlow: 0,
  scavenge: 0,
  reliefFlow: 0,
  mains: 0,
  head: 0,
  chain: 0,
  turbo: 0,
  jets: 0,
  reliefOpen: false,
  jetsOpen: 0,
  warning: false,
  viscosityRatio: 1,
});

const jetOpening = (pressure: number): number => Math.min(1, Math.max(0, (pressure - JET_OPEN_BAR) / JET_SPAN_BAR));

/** Writes the oil state for this moment into `out`. Allocates nothing. */
export function oilStep(p: OilParams, input: OilInput, out: OilState): void {
  const ratio = viscosityRatio(input.tempC);
  const g = p.g100 / ratio;
  const gt = p.turboShare * g;
  const gj = p.jets ? JET_SHARE * g : 0;
  const q = Math.max(0, p.pumpLitresPerRev * input.rpm * Math.min(1, Math.max(0, input.supply)));
  // The flow the circuit takes rises monotonically with pressure, so bisection finds the one balance with the pump.
  let lo = 0;
  let hi = q / g;
  for (let i = 0; i < 60 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2;
    const taken = mid * (g + gt + gj * jetOpening(mid)) + p.reliefG * Math.max(0, mid - p.reliefBar);
    if (taken > q) hi = mid;
    else lo = mid;
  }
  const pressure = (lo + hi) / 2;
  out.pressure = pressure;
  out.pumpFlow = q;
  out.scavenge = Math.max(0, p.scavengeLitresPerRev * input.rpm * Math.min(1, Math.max(0, input.scavengeSupply ?? 1)));
  out.mains = pressure * g * MAIN_SHARE;
  out.head = pressure * g * HEAD_SHARE;
  out.chain = pressure * g * CHAIN_SHARE;
  out.turbo = pressure * gt;
  out.jetsOpen = p.jets ? jetOpening(pressure) : 0;
  out.jets = pressure * gj * out.jetsOpen;
  // What the branches don't take goes back through the relief valve, so the pump's flow is accounted for exactly.
  out.reliefFlow = Math.max(0, q - out.mains - out.head - out.chain - out.turbo - out.jets);
  out.reliefOpen = pressure > p.reliefBar;
  out.viscosityRatio = ratio;
  out.warning = input.running && input.live && pressure < WARNING_BAR;
}
