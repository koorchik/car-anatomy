// The designer's clutch and damper (gearbox plan, the designer's model: clutch; stage K9b): the clutch's margin over
// the engine's peak torque, the work of a standard launch and how far it heats the pressure plate, and the damper's
// mode at idle against the firing frequency. Plain maths: no DOM, no text.
//
// - Margin: T_static/T_peak with T_static = μ_s·F·r_m·z (research §6), where 1.2–1.5 is usual.
// - Standard launch: the engine held at 2000 rpm on the level at full load, the clutch passing that torque (no more than
//   its kinetic capacity, nor than the driven tyres take) until the input reaches the engine's speed. The car's
//   acceleration is then constant, the slip falls linearly and the work is T_c·ω_e·t/2.
// - Plate heat: each friction face hands its share of the work to the metal it rubs; the pressure plate takes one
//   face's, 1/z. Its mass is a cast-iron ring under the facing [estimate: 15 mm thick]. A wet pack's heat goes into the
//   oil, so it has none.
// - Damper mode: the engine and what turns behind the spring at idle in neutral (the damper's own mass and the
//   gearbox's input side with the disc hub) on the spring: f = √(k·(1/J₁ + 1/J₂))/2π. A dual-mass flywheel puts it under the firing
//   frequency at idle, a disc damper above (research §6, LuK).

import { staticCapacity } from '../drivetrain/elements.ts';
import { mapValue, peakTorque } from '../engine/torque-map.ts';
import { G } from '../vehicle/constants.ts';
import { roadLoadN } from '../vehicle/road-load.ts';
import { longitudinalPeakN } from '../vehicle/tyre.ts';
import type { GearboxDesign } from './design.ts';
import { clutchKineticNm, type DesignVehicle } from './vehicle.ts';

const RPM = 30 / Math.PI;
/** Engine speed of the standard launch, rpm (gearbox plan). */
export const LAUNCH_RPM = 2000;
/** A clutch's usual margin over the engine's peak torque (research §6: 1.2–1.5); below it the plan's diagnosis warns. */
export const CLUTCH_MARGIN = 1.2;
/** Pressure plate under the facing: thickness, mm, density, kg/m³, and specific heat, J/(kg·K) [estimates: cast iron]. */
const PLATE = { thicknessMm: 15, density: 7200, heat: 460 };

export interface ClutchFigures {
  staticNm: number;
  /** Static capacity over the engine's peak torque. */
  margin: number;
  /** Friction work of the standard launch, J, and its slip time, s. */
  launchJ: number;
  launchS: number;
  /** Temperature rise of the pressure plate in that launch, K; null for a wet pack. */
  plateRiseK: number | null;
  /** The damper's mode at idle in neutral and the firing frequency at idle, Hz. */
  damperHz: number;
  idleFiringHz: number;
}

/**
 * The clutch's figures. `first` is first gear's input speed per wheel speed with its efficiency, `mDown` its equivalent
 * mass with the engine side standing (evaluate.ts), `inputInertia` the gearbox's input side with the disc hub, `firingPerRev` the firing
 * events per crank revolution.
 */
export function clutchFigures(
  d: GearboxDesign, v: DesignVehicle, first: { overall: number; efficiency: number; mDown: number }, inputInertia: number, firingPerRev: number,
): ClutchFigures {
  const map = v.map;
  const f = v.clutch;
  const peak = peakTorque(map).nm;
  const staticNm = staticCapacity(f);
  const omegaE = LAUNCH_RPM / RPM;
  const eff = first.efficiency * v.axleEfficiency;
  const grip = 2 * longitudinalPeakN(v.tyre.set, (v.massKg * G * (v.drive === 'rwd' ? 1 - v.frontShare : v.frontShare)) / 2);
  const torque = Math.min(mapValue(map, map.wotNm, Math.min(LAUNCH_RPM, map.limitRpm)), clutchKineticNm(f), (grip * v.radius) / (first.overall * eff));
  const vLock = (omegaE * v.radius) / first.overall;
  const accel = ((torque * first.overall * eff) / v.radius - roadLoadN(v.roadLoad, vLock / 2, 0)) / first.mDown;
  const launchS = accel > 0 ? vLock / accel : Infinity;
  const launchJ = (torque * omegaE * launchS) / 2;
  let plateRiseK: number | null = null;
  if (d.clutch !== 'wet') {
    const outer = d.clutchMm / 1000;
    const inner = (2 * outer) / 3;
    const mass = ((Math.PI / 4) * (outer * outer - inner * inner) * PLATE.thicknessMm * PLATE.density) / 1000;
    plateRiseK = launchJ / f.faces / (mass * PLATE.heat);
  }
  const j1 = map.inertia;
  const j2 = v.damper.inertia + inputInertia;
  const damperHz = Math.sqrt(v.damper.stiffness * (1 / j1 + 1 / j2)) / (2 * Math.PI);
  return { staticNm, margin: staticNm / peak, launchJ, launchS, plateRiseK, damperHz, idleFiringHz: (map.idleRpm / 60) * firingPerRev };
}
