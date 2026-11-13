// Porsche 911 GT3 (991.2) with the six-speed manual. Mass (US curb weight 3116 lb), wheelbase (96.7 in), tyres and
// top speed (198 mph) from Porsche's US brochure for 2018; the weight split is the oil page's own figure and the
// tracks are recalled.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'porsche-911-gt3-991-2',
  name: 'Porsche 911 GT3 (991.2)',
  years: '2017-2019',
  engine: 'b6',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'rearward', position: 'rear' },
  massKg: 1413,
  massBasis: 'kerb',
  drive: 'rwd',
  body: { frontShare: 0.39, cgHeightM: null, wheelbaseM: 2.456, trackFrontM: 1.551, trackRearM: 1.555, inertia: null, seat: null },
  tyre: { size: '245/35 ZR20', sizeRear: '305/30 ZR20', id: 'street' },
  roadLoad: null,
  aero: null,
  published: { vmaxKmh: 319, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://www.stuttcars.com/wp-content/uploads/2021/05/Porsche_US-911GT3_2018.pdf', 'https://en.wikipedia.org/wiki/Porsche_911_(991)'],
  unverified: ['body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM'],
};
