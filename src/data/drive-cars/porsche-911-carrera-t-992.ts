// Porsche 911 Carrera T (992) with the seven-speed manual: its drivetrain beyond the shared car record.
//
// Final drive 3.56: Porsche's US technical specifications (primary). The manual car has Porsche Torque Vectoring with a
// mechanical rear differential lock as standard (Porsche's 2022 launch release, primary); Porsche gives no locking
// values, and that the lock is a plate (clutch-pack) differential is our reading of "mechanical differential lock".
// A longitudinal transaxle turns the wheels through a crown wheel and pinion; whether Porsche's is a hypoid is not
// published. The final drive sits in the transaxle's case, so the gearbox's spec already holds it.
//
// diffOutputs is the left inner joint the transaxle's layout gives in this car (transaxleDiffOutput in
// src/vehicle/gearbox-place.ts); the crown wheel's axis lies on the rear axle's line, 32 mm below the wheel centres.

import type { DriveCar } from '../../drivetrain/drive-car.ts';

export const PORSCHE_911_CARRERA_T_992: DriveCar = {
  car: 'porsche-911-carrera-t-992',
  gearbox: 'manual-transaxle/porsche-911-carrera-t-992',
  finalDrive: { ratio: 3.56, teeth: null, kind: 'spiral-bevel' },
  differential: { kind: 'plate' },
  driveline: {
    diffOutputs: { rear: [-2.449, 0.145, 0.315] },
    propshaft: null,
  },
  sources: [
    'https://newsroom.porsche.com/dam/jcr:f50e6bb0-6e82-4062-b167-532afdf23ac9/992%20911%20Carrera%20T%20Technical%20Specifications.pdf',
    'https://newsroom.porsche.com/en/2022/products/porsche-new-911-carrera-t-touring-world-premiere-30087.html',
  ],
  unverified: ['finalDrive.kind', 'differential.kind', 'differential.lockDrive', 'differential.lockCoast', 'differential.preloadNm', 'driveline.diffOutputs'],
};
