// Toyota Prius of the third generation (XW30), the power-split page's car (owner decision A2). Curb weight 3042 lb
// (1380 kg), the tyres P195/65 R15 and the 0-60 mph time come from Toyota's 2010 Prius product information; the
// wheelbase, tracks with 15-inch wheels, 0-100 km/h in 10.4 s and the top speed of 112 mph (180 km/h) from Toyota GB's
// 2009 launch pack. Neither says what holds the car at 180 km/h; at that speed MG2 turns close to its 13 500 rpm
// rating (ORNL), so the car is taken as limited, and that is listed as unverified. The weight split is an estimate for
// a front-engined hatchback. The road load is the EPA coast-down of the US car: the test car list prints the same row
// for every model year from 2010 to 2015.
// The car drives on its power-split box through src/data/hybrid-cars/ (stage K15a); `gearbox` links it once the page
// and the car's place in the gearbox section's records come (stage K15b).

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'toyota-prius-xw30',
  name: 'Toyota Prius',
  years: '2009-2015',
  engine: 'i4/prius-2zr-fxe',
  gearbox: null,
  suspension: null,
  mount: { axis: 'transverse', front: 'right', position: 'front' },
  massKg: 1380,
  massBasis: 'kerb',
  drive: 'fwd',
  body: { frontShare: 0.6, cgHeightM: null, wheelbaseM: 2.7, trackFrontM: 1.525, trackRearM: 1.52, inertia: null, seat: null },
  tyre: { size: '195/65 R15', id: 'street' },
  roadLoad: { a: 90.005, b: 0.1983, c: 0.4171, source: 'EPA test car list MY2010 (10tstcar.csv): PRIUS, 1.8 L, CVT, axle 3.27, vehicle 10-ZW1H; the same row in the lists of 2011-2015' },
  aero: null,
  published: { vmaxKmh: 180, vmaxLimited: true, vmaxGear: null, zeroTo100S: 10.4 },
  sources: [
    'https://web.archive.org/web/20101226001731/http://pressroom.toyota.com/pr/tms/toyota/document/10_Prius_Product_Info_final.pdf',
    'https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/Prius-gen3-UK-launch-pack-2009.pdf',
    'https://www.epa.gov/sites/default/files/2016-07/10tstcar.csv',
    'https://info.ornl.gov/sites/publications/Files/Pub26762.pdf',
  ],
  unverified: ['mount.front', 'body.frontShare', 'body.cgHeightM', 'published.vmaxLimited'],
};
