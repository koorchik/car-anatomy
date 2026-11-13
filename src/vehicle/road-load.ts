// The one road-load force of the site. It takes coefficients, not a car, so the lap, which only gets a VehicleSpec,
// and the chassis models call the same function. roadLoadCoeffs applies the C_dA rule of the gearbox plan once
// (decision 13): the EPA coast-down row if the car has one; else C_dA solved from the published top speed, if no
// limiter holds it and the figure is checked; else the maker's Cd·A times k_EPA. The numbers outside the records come
// from road-load-trim.ts, which `node scripts/calibrate-road-load.ts` writes (docs/vehicle-model.md).

import type { CarRecord } from './car.ts';
import { AIR_DENSITY, G } from './constants.ts';
import { drivingMassKg } from './mass.ts';
import { ROAD_LOAD_TRIM } from './road-load-trim.ts';

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

/** Which rule set a car's road load. */
export type RoadLoadRule = 'epa' | 'vmax' | 'brochure';

/** What scripts/calibrate-road-load.ts writes into road-load-trim.ts. */
export interface RoadLoadTrim {
  /** Mean C_EPA / (½ρ·Cd·A) over the calibration list: how much of the coast-down's v² term the brochure misses. */
  kEpa: number;
  /** The rolling part of a car without an EPA row, per kg of driving mass: the list's mean a/m (N/kg) and b/m. */
  rolling: { aPerKg: number; bPerKg: number };
  /** Frontal area over width × height where the maker gives all three; estimates an area nobody published. */
  areaShare: number;
  /** Cars without an EPA row: the rule that set them and the effective C_dA, m² (c = ½ρ·cdA). */
  cars: Readonly<Record<string, { rule: Exclude<RoadLoadRule, 'epa'>; cdA: number }>>;
}

/** Rolling resistance plus drag, with no speed-linear term: the generic car of a visitor's engine and the tests. */
export function coeffsFromDrag(massKg: number, cdA: number, crr: number): RoadLoadCoeffs {
  const c = 0.5 * AIR_DENSITY * cdA;
  return { a: crr * massKg * G, b: 0, c, aeroC: c, massKg };
}

/**
 * The rule a car without an EPA row falls under, from its record alone: the top speed solve needs a published v_max
 * that no limiter holds and that is checked (neither field in unverified); otherwise the maker's Cd and area.
 */
export function nonEpaRule(car: CarRecord): Exclude<RoadLoadRule, 'epa'> | null {
  const checked = !car.unverified.includes('published.vmaxKmh') && !car.unverified.includes('published.vmaxLimited');
  if (!car.published.vmaxLimited && checked) return 'vmax';
  return car.aero ? 'brochure' : null;
}

/** Null: no EPA row, no checked top speed and no maker's Cd, so nothing calibrates the car. */
export const roadLoadRule = (car: CarRecord): RoadLoadRule | null => (car.roadLoad ? 'epa' : nonEpaRule(car));

/**
 * The car's road load. The coast-down already holds the final drive and wheel bearings, so the drivetrain adds no idle
 * losses to an EPA car. A car without a row rolls like the mean of the calibration list per kg of its mass.
 */
export function roadLoadCoeffs(car: CarRecord, trim: RoadLoadTrim = ROAD_LOAD_TRIM): RoadLoadCoeffs {
  const massKg = drivingMassKg(car);
  if (car.roadLoad) {
    const { a, b, c } = car.roadLoad;
    return { a, b, c, aeroC: c / trim.kEpa, massKg };
  }
  const own = trim.cars[car.id];
  const rule = nonEpaRule(car);
  if (!own || own.rule !== rule) throw new Error(`Road load of ${car.id} is not calibrated: run node scripts/calibrate-road-load.ts`);
  const c = 0.5 * AIR_DENSITY * own.cdA;
  return { a: trim.rolling.aPerKg * massKg, b: trim.rolling.bPerKg * massKg, c, aeroC: c / trim.kEpa, massKg };
}

/**
 * Force against the motion, N. The grade is taken along the direction of travel (radians, uphill positive), so a car
 * rolling backwards down a slope gets a negative grade; the a, b and c terms depend on |v| only.
 */
export const roadLoadN = (rl: RoadLoadCoeffs, v: number, gradeRad: number): number =>
  rl.a + rl.b * Math.abs(v) + rl.c * v * v + rl.massKg * G * Math.sin(gradeRad);

/** The part of the road load that acts on the body at the aero height, N. */
export const aeroDragN = (rl: RoadLoadCoeffs, v: number): number => rl.aeroC * v * v;
