// Honda Civic Type R FK8: its drivetrain beyond the shared car record.
//
// Final drive 4.111 and the helical limited-slip differential: Honda Europe's 2017 release (primary). Honda gives
// no torque bias ratio or preload, and the final drive's teeth are not published (the gearbox record reconstructs
// 18/74). The final drive sits in the transaxle's case, so the gearbox's spec already holds it (spec.finalDrive).
//
// diffOutputs is the left inner joint the transaxle's layout gives in this car (transaxleDiffOutput in
// src/vehicle/gearbox-place.ts): the gearbox bolted to the engine at the record's crankFront, the differential's case
// beside the clutch, the stub 70 mm out of it (tests/vehicle-cars.test.ts recomputes it). The right joint mirrors it, so an intermediate shaft
// along the back of the engine reaches it, which makes the halfshafts equal (that the FK8 has one: estimate).

import type { DriveCar } from '../../drivetrain/drive-car.ts';

export const CIVIC_TYPE_R_FK8: DriveCar = {
  car: 'civic-type-r-fk8',
  gearbox: 'manual-transaxle',
  finalDrive: { ratio: 4.111, teeth: null, kind: 'helical' },
  differential: { kind: 'helical' },
  driveline: {
    diffOutputs: { front: [0.025, 0.371, 0.315] },
    propshaft: null,
  },
  sources: ['https://hondanews.eu/eu/en/cars/media/pressreleases/108909/2017-honda-civic-type-r1'],
  unverified: ['differential.tbr', 'differential.preloadNm', 'driveline.diffOutputs'],
};
