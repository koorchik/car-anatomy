// Porsche 911 Carrera T (992) with the seven-speed manual, the US car of model years 2023-2024: the second car of the
// overview, rear engine and staggered tyres. Porsche's US technical specifications (November 2022) give the mass
// (curb weight 3254 lb in the manual's column, although the row is labelled "PDK / manual"; the PDK's is the heavier
// 3338 lb), wheelbase, tracks, length, width without mirrors, height, tyres and the 181 mph top speed. The road load
// is the EPA coast-down of the same car, "911 T" with 379 hp, the 7MT and the 3.56 axle. The gearbox link comes with
// the gearbox data (stage K6a-3d). Porsche publishes no weight split, so that is an estimate.

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
  published: { vmaxKmh: 291, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: [
    'https://newsroom.porsche.com/dam/jcr:f50e6bb0-6e82-4062-b167-532afdf23ac9/992%20911%20Carrera%20T%20Technical%20Specifications.pdf',
    'https://www.epa.gov/system/files/documents/2024-05/23-testcar-2024-05-17_0.xlsx',
  ],
  unverified: [
    'years',
    'body.frontShare',
    'body.cgHeightM',
  ],
};
