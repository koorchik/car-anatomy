// A catalogue car's drive by its id: finds the car's record, its DriveCar, gearbox and engine, and hands them to
// carDriveOf (src/drivetrain/car-model.ts). The lookup lives here and not in the drivetrain core, which imports no
// text data (tests/worklet-imports.test.ts). Main thread, scripts and tests only.

import { catalogueTorqueMap } from '../designer/torque-map.ts';
import { carDriveOf, type CarDrive, type CarDriveOptions } from '../drivetrain/car-model.ts';
import { carById } from './cars.ts';
import { driveCarById } from './drive-cars.ts';
import { engineById } from './engines.ts';
import { gearboxById } from './gearboxes.ts';
import { hybridCarById } from './hybrid-cars.ts';
import { powerSplitDriveOf, type PowerSplitDrive } from '../drivetrain/power-split-car.ts';

/** A car of DRIVE_CARS ready to drive: throws when its record has no dynamics yet. */
export function buildCarDrive(carId: string, o: CarDriveOptions = {}): CarDrive {
  const drive = driveCarById(carId);
  const car = carById(carId);
  if (!drive || !car) throw new Error(`no drive car ${carId}`);
  if (!drive.dynamics) throw new Error(`${carId}: its DriveCar has no dynamics yet (stage K2b)`);
  const gearbox = gearboxById(drive.gearbox);
  const engine = engineById(car.engine);
  if (!gearbox || !engine) throw new Error(`${carId}: gearbox ${drive.gearbox} or engine ${car.engine} not in the catalogue`);
  return carDriveOf({ car, drive, gearbox, map: catalogueTorqueMap(engine) }, o);
}

/** A power-split car of HYBRID_CARS ready to drive (stage K15a). */
export function buildPowerSplitDrive(carId: string): PowerSplitDrive {
  const hybrid = hybridCarById(carId);
  const car = carById(carId);
  if (!hybrid || !car) throw new Error(`no hybrid car ${carId}`);
  const gearbox = gearboxById(hybrid.gearbox);
  const engine = engineById(car.engine);
  if (!gearbox || !engine) throw new Error(`${carId}: gearbox ${hybrid.gearbox} or engine ${car.engine} not in the catalogue`);
  return powerSplitDriveOf({ car, hybrid, gearbox, map: catalogueTorqueMap(engine), engine });
}
