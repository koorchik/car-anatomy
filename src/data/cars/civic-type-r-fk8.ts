// Honda Civic Type R FK8, the European car. Mass (curb weight 1380 kg), wheelbase, tracks, tyres, top speed and
// 0-100 km/h from Honda's launch release; Honda does not say whether its curb weight holds a driver, and by the usual
// meaning of the word it does not. The weight split and the way the engine faces are the oil page's own figures. The
// road load is the EPA coast-down of the US car (2017-2019); the second row EPA prints for it is the cold CO test's,
// which carries 10 % more road load by rule.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'civic-type-r-fk8',
  name: 'Honda Civic Type R (FK8)',
  years: '2017-2021',
  engine: 'i4/civic-type-r-k20c1',
  gearbox: null,
  suspension: null,
  mount: { axis: 'transverse', front: 'right', position: 'front' },
  massKg: 1380,
  massBasis: 'kerb',
  drive: 'fwd',
  body: { frontShare: 0.62, cgHeightM: null, wheelbaseM: 2.699, trackFrontM: 1.599, trackRearM: 1.593, inertia: null, seat: null },
  tyre: { size: '245/30 R20', id: 'street' },
  roadLoad: { a: 154.5, b: 2.568, c: 0.4932, source: 'EPA test car list MY2017 (17tstcar-2018-05-30.xlsx): CIVIC 5DR Type-R, 2.0 L, 6MT, vehicle EHBF1M' },
  aero: null,
  published: { vmaxKmh: 272, vmaxLimited: false, vmaxGear: null, zeroTo100S: 5.7 },
  sources: ['https://hondanews.eu/eu/en/cars/media/pressreleases/108909/2017-honda-civic-type-r1', 'https://en.wikipedia.org/wiki/Honda_Civic_Type_R', 'https://www.epa.gov/sites/default/files/2018-06/17tstcar-2018-05-30.xlsx'],
  unverified: ['massBasis', 'mount', 'body.frontShare', 'body.cgHeightM'],
};
