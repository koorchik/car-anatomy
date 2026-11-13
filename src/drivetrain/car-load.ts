// A catalogue car as a load on the crank (stage K2c): the plain data VehicleLoad needs, built once on the main thread
// from the car's records, so the audio thread derives nothing. The same CarDrive as the tables and the runs, with the
// crank taken out of the drivetrain: LoadedCrank owns it.

import { cgHeightM, drivingMassKg } from '../vehicle/car.ts';
import { G } from '../vehicle/constants.ts';
import { longitudinalSpec } from '../vehicle/longitudinal.ts';
import { CRANK_SLOT, type VehicleLoadSpec } from '../vehicle/vehicle-load.ts';
import { FL, FR, RL, RR } from '../vehicle/wheel-bus.ts';
import { buildCarDrive, CLUTCH, PROPSHAFT, type CarDrive } from './car-model.ts';
import type { ManualSpec } from './control/manual.ts';
import { anchorCrank, buildCore, elementIndex, memberIndex, type DrivetrainCore } from './core.ts';
import { stableStep } from './modes.ts';
import { RUN } from './runs.ts';

/**
 * Deceleration the brakes give with the pedal floored, in g [estimate: more than the classic and street tyres hold
 * (TYRE_MU 0.8 and 1.0), so a floored pedal locks their wheels; the model has no ABS]. The semi-slick and the slick
 * hold more, so on them a floored pedal stops short of the limit. The car's own brakes are not in the data.
 */
export const BRAKE_FLOORED_G = 1.2;
/** Deceleration at which the brake balance matches the axle loads, in g [estimate: a typical design point]. */
const BALANCE_G = 0.8;

/**
 * Brake torque each wheel holds with the pedal floored, N·m: BRAKE_FLOORED_G of the car's weight at the tyres, split
 * front to rear as the axle loads are at BALANCE_G (static share plus the transfer h/L·a/g).
 */
export function brakeTorques(cd: CarDrive): number[] {
  const { car } = cd;
  const front = Math.min(0.9, car.body.frontShare + (cgHeightM(car) / car.body.wheelbaseM) * BALANCE_G);
  const force = BRAKE_FLOORED_G * drivingMassKg(car) * G;
  const at = (i: number) => (force * (i === FL || i === FR ? front : 1 - front) * cd.radius[i]!) / 2;
  return [at(FL), at(FR), at(RL), at(RR)];
}

/** The auto clutch's and the lever's data from the derived gearbox, with element indices of `core`. */
export function manualSpec(cd: CarDrive, core: DrivetrainCore): ManualSpec {
  return {
    kind: 'manual',
    clutch: elementIndex(core, CLUTCH),
    input: memberIndex(core, cd.box.spec.input),
    gears: cd.box.states
      .filter((s) => s.kind === 'gear' && s.ratio !== null)
      .map((s) => ({ name: s.name, element: elementIndex(core, s.closed[0]!), ratio: s.ratio! })),
    sleeveN: RUN.sleeveN,
    idleRpm: cd.map.idleRpm,
    brakeNm: brakeTorques(cd),
  };
}

/** The car standing in neutral with the clutch up, as plain data for createLoad on either thread. */
export function vehicleLoadSpec(cd: CarDrive): VehicleLoadSpec {
  const core = buildCore(anchorCrank(cd.draft, CRANK_SLOT));
  return {
    kind: 'vehicle',
    drivetrain: core,
    chassis: { kind: 'longitudinal', core: longitudinalSpec(cd.car) },
    tyres: [cd.tyre, cd.tyre, cd.tyre, cd.tyre],
    wheelInertia: Array.from(cd.wheelInertia),
    propshaft: core.springs.ids.indexOf(PROPSHAFT),
    control: manualSpec(cd, core),
    maxStepS: Math.min(0.001, stableStep(core)),
  };
}

/** A catalogue car's load by its id. */
export const carLoadSpec = (carId: string): VehicleLoadSpec => vehicleLoadSpec(buildCarDrive(carId));
