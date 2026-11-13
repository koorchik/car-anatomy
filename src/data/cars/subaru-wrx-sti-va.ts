// Subaru WRX STI of the VA generation with the EJ257. Wheelbase and tyres from Subaru's launch release; mass (the
// base car's curb weight, 3386 lb) and tracks (60.2 and 60.6 in) from Subaru of America's 2015 specifications, the
// market whose EPA coast-down gives the road load. The weight split is the oil page's own figure; the top speed is
// recalled and waits for Subaru's data.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'subaru-wrx-sti-va',
  name: 'Subaru WRX STI',
  years: '2014-2021',
  engine: 'b4',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'forward', position: 'front' },
  massKg: 1536,
  massBasis: 'kerb',
  drive: 'awd',
  body: { frontShare: 0.6, cgHeightM: null, wheelbaseM: 2.65, trackFrontM: 1.529, trackRearM: 1.539, inertia: null, seat: null },
  tyre: { size: '245/40 R18', id: 'street' },
  roadLoad: { a: 182.4, b: 5.646, c: 0.4171, source: 'EPA test car list MY2015 (15tstcar.csv): WRX STI, 2.5 L, 6MT, axle 3.90, vehicle FBE-UG74' },
  aero: null,
  published: { vmaxKmh: 255, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: [
    'https://web.archive.org/web/20211115224859/https://www.media.subaru-global.com/en/news/1831',
    'https://media.subaru.com/pressrelease/575/1/2015-subaru-wrx-sti',
    'https://www.epa.gov/sites/default/files/2016-07/15tstcar.csv',
    'https://en.wikipedia.org/wiki/Subaru_WRX',
  ],
  unverified: ['body.frontShare', 'body.cgHeightM', 'published.vmaxKmh', 'published.vmaxLimited'],
};
