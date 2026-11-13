// Porsche Cayman S (981) with the six-speed manual. Mass (DIN, without a driver), wheelbase, tyres, top speed and
// 0-100 km/h from Porsche's 2012 brochure; the weight split is the oil page's own figure and the tracks are recalled.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'porsche-cayman-s-981',
  name: 'Porsche Cayman S (981)',
  years: '2013-2016',
  engine: 'b6/porsche-cayman-981-3-4',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'forward', position: 'mid' },
  massKg: 1320,
  massBasis: 'kerb',
  drive: 'rwd',
  body: { frontShare: 0.45, cgHeightM: null, wheelbaseM: 2.475, trackFrontM: 1.526, trackRearM: 1.54, inertia: null, seat: null },
  tyre: { size: '235/40 ZR19', sizeRear: '265/40 ZR19', id: 'street' },
  roadLoad: null,
  aero: null,
  published: { vmaxKmh: 283, vmaxLimited: false, vmaxGear: null, zeroTo100S: 5 },
  sources: ['https://www.stuttcars.com/wp-content/uploads/2021/05/Cayman-981-2012-10-EN-2.pdf', 'https://en.wikipedia.org/wiki/Porsche_Boxster_and_Cayman_(981)'],
  unverified: ['body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM'],
};
