// Porsche 911 Carrera T (992) with the seven-speed manual, the US car of model years 2023-2024: the second car of the
// overview, rear engine and staggered tyres. Porsche's US technical specifications (November 2022) give the mass
// (curb weight 3254 lb in the manual's column, although the row is labelled "PDK / manual"; the PDK's is the heavier
// 3338 lb), wheelbase, tracks, length, width without mirrors, height, tyres and the 181 mph top speed. The road load
// is the EPA coast-down of the same car, "911 T" with 379 hp, the 7MT and the 3.56 axle. The gearbox link comes with
// the gearbox data (stage K6a-3d), which also places its output flanges at packaging.ts's wheel centres.
// Porsche publishes no weight split, overhangs, ground clearance or positions of parts, so those are estimates; that
// the charge-air coolers sit over the engine under the rear lid is Porsche's (the 2019 powertrain article).

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'porsche-911-carrera-t-992',
  name: 'Porsche 911 Carrera T (992)',
  years: '2022-2024',
  engine: 'b6/porsche-992-carrera-3-0',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'rearward', position: 'rear' },
  massKg: 1476,
  massBasis: 'kerb',
  drive: 'rwd',
  body: { frontShare: 0.38, cgHeightM: null, wheelbaseM: 2.45, trackFrontM: 1.589, trackRearM: 1.557, inertia: null, seat: null },
  tyre: { size: '245/35 ZR20', sizeRear: '305/30 ZR21', id: 'street' },
  roadLoad: { a: 186.5, b: 5.868, c: 0.3375, source: 'EPA test car list MY2023 (23-testcar-2024-05-17_0.xlsx): 911 T, 3.0 L, 7MT, vehicle FE-992-MT-23' },
  aero: null,
  dimensions: {
    lengthM: 4.53,
    widthM: 1.852,
    heightM: 1.291,
    frontOverhangM: 0.98,
    rearOverhangM: 1.1,
    groundClearanceM: 0.1,
    shape: 'coupe',
    profile: { bonnetFront: [0.85, 0.64], cowl: [-0.75, 0.86], roofX: [-1.3, -1.8] },
  },
  packaging: {
    // Timing end to the tail: the flywheel faces the transaxle just behind the rear axle.
    crankFront: [-3.04, 0, 0.4],
    bay: { min: [-3.32, -0.65, 0.14], max: [-2.45, 0.65, 0.92] },
    exhaustExit: { at: [-3.5, 0.1, 0.3], side: 'both' },
    fuelTank: [0.05, 0, 0.4],
    radiator: { at: [0.8, 0.6, 0.35], side: 'both' },
    intercooler: { at: [-2.85, 0.2, 0.72], side: 'both' },
  },
  published: { vmaxKmh: 291, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: [
    'https://newsroom.porsche.com/dam/jcr:f50e6bb0-6e82-4062-b167-532afdf23ac9/992%20911%20Carrera%20T%20Technical%20Specifications.pdf',
    'https://www.epa.gov/system/files/documents/2024-05/23-testcar-2024-05-17_0.xlsx',
    'https://newsroom.porsche.com/en/2019/technology/porsche-911-carrera-type-992-powertrain-boxer-engine-16978.html',
  ],
  unverified: [
    'years',
    'body.frontShare',
    'body.cgHeightM',
    'dimensions.frontOverhangM',
    'dimensions.rearOverhangM',
    'dimensions.groundClearanceM',
    'dimensions.profile',
    'packaging.crankFront',
    'packaging.bay',
    'packaging.exhaustExit',
    'packaging.fuelTank',
    'packaging.radiator',
    'packaging.intercooler.at',
  ],
};
