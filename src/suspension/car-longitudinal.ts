// A real car's brakes, drive and road load for ChassisSpec.longitudinal (stage P9-core). The road load is the one every
// section takes from the car's record, roadLoadCoeffs(car), so the drag that pitches the body at the aero height is
// aeroDragN(roadLoadCoeffs(car), v), the lap's and the gearbox's drag. The final drive is the published ratio of the
// car's DriveCar when it has one. No car publishes its brake balance or the height its drag acts at: those stay the
// typical car's (typicalLongitudinal), and so does the drive split of four-wheel drive.

import type { DriveCar } from '../drivetrain/drive-car.ts';
import type { CarRecord } from '../vehicle/car.ts';
import { drivingMassKg } from '../vehicle/mass.ts';
import { roadLoadCoeffs } from '../vehicle/road-load.ts';
import type { ChassisLongitudinal } from './spec.ts';
import { typicalLongitudinal } from './templates/typical-chassis.ts';

/** The car's road load and final drive on the typical car's brakes and drag height. */
export function carLongitudinal(car: CarRecord, drive?: DriveCar): ChassisLongitudinal {
  if (drive && drive.car !== car.id) throw new Error(`The drivetrain of ${drive.car} is not ${car.id}'s`);
  const typical = typicalLongitudinal(drivingMassKg(car));
  return {
    ...typical,
    roadLoad: roadLoadCoeffs(car),
    finalDrive: drive ? drive.finalDrive.ratio : typical.finalDrive,
  };
}
