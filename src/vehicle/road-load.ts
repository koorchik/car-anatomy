// The one road-load force of the site. It takes coefficients, not a car, so the lap, which only gets a VehicleSpec,
// and the chassis models call the same function. Stage A1b replaces the stand-ins in roadLoadCoeffs with the C_dA
// rule of the gearbox plan (EPA row, else the v_max solve, else brochure Cd·A times k_EPA).

import { modelMassKg, type CarRecord } from './car.ts';
import { AIR_DENSITY, G, LAP_STAND_IN } from './constants.ts';

/** EPA coast-down in SI: N, N/(m/s), N/(m/s)². */
export interface RoadLoad {
  a: number;
  b: number;
  c: number;
  /** Where the row comes from: the EPA test car list file and its line. */
  source: string;
}

/** Road load as F = a + b·|v| + c·v² + m·g·sin(grade), SI. aeroC is the part of c that acts on the body (½ρ·C_dA). */
export interface RoadLoadCoeffs {
  a: number;
  b: number;
  c: number;
  aeroC: number;
  massKg: number;
}

/** Rolling resistance plus drag, with no speed-linear term: the form of the lap's stand-ins. */
export function coeffsFromDrag(massKg: number, cdA: number, crr: number): RoadLoadCoeffs {
  const c = 0.5 * AIR_DENSITY * cdA;
  return { a: crr * massKg * G, b: 0, c, aeroC: c, massKg };
}

/** Until stage A1b: the lap's stand-ins (C_dA 0.70 m², C_rr 0.015) on the mass the lap carries. */
export const roadLoadCoeffs = (car: CarRecord): RoadLoadCoeffs => coeffsFromDrag(modelMassKg(car), LAP_STAND_IN.cdA, LAP_STAND_IN.crr);

/**
 * Force against the motion, N. The grade is taken along the direction of travel (radians, uphill positive), so a car
 * rolling backwards down a slope gets a negative grade; the a, b and c terms depend on |v| only.
 */
export const roadLoadN = (rl: RoadLoadCoeffs, v: number, gradeRad: number): number =>
  rl.a + rl.b * Math.abs(v) + rl.c * v * v + rl.massKg * G * Math.sin(gradeRad);

/** The part of the road load that acts on the body at the aero height, N. */
export const aeroDragN = (rl: RoadLoadCoeffs, v: number): number => rl.aeroC * v * v;
