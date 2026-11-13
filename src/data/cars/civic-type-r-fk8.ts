// Honda Civic Type R FK8, the European car. Wheelbase, tracks, tyres, top speed and 0-100 km/h from Honda's launch
// release. Mass, weight split and the way the engine faces are the oil page's own figures: Honda Europe gives
// 1380 kg kerb, and stage A1b checks the mass against the maker.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'civic-type-r-fk8',
  name: 'Honda Civic Type R (FK8)',
  years: '2017-2021',
  engine: 'i4/civic-type-r-k20c1',
  gearbox: null,
  suspension: null,
  mount: { axis: 'transverse', front: 'right', position: 'front' },
  massKg: 1415,
  massBasis: 'kerb',
  drive: 'fwd',
  body: { frontShare: 0.62, cgHeightM: null, wheelbaseM: 2.699, trackFrontM: 1.599, trackRearM: 1.593, inertia: null, seat: null },
  tyre: { size: '245/30 R20', id: 'street' },
  roadLoad: null,
  aero: null,
  published: { vmaxKmh: 272, vmaxLimited: false, vmaxGear: null, zeroTo100S: 5.7 },
  sources: ['https://hondanews.eu/eu/en/cars/media/pressreleases/108909/2017-honda-civic-type-r1', 'https://en.wikipedia.org/wiki/Honda_Civic_Type_R'],
  unverified: ['massKg', 'massBasis', 'mount', 'body.frontShare', 'body.cgHeightM'],
};
