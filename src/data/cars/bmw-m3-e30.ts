// BMW M3 (E30), the European car without a catalytic converter (200 PS): the car of the first gearbox pages and the
// third car of the overview, in place of the VAZ-2101. Wikipedia gives the wheelbase, a mass range of 1165-1360 kg,
// 225/45 R16 tyres (the build order's table names 205/55 R15 as the other size, by year) and 235 km/h, the last for
// the 195 PS car with a catalytic converter.
// The mass and tracks are recalled; all of these wait for BMW's brochure or a workshop manual (build order, A1). The
// weight split is NHTSA's measurement of a 1986 325i (docs/suspension-research/), a different engine in the same
// body. The gearbox link comes with the gearbox data (stage K2b).

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'bmw-m3-e30',
  name: 'BMW M3 (E30)',
  years: '1986-1989',
  engine: 'i4/bmw-m3-e30-s14',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'forward', position: 'front' },
  massKg: 1200,
  massBasis: 'kerb',
  drive: 'rwd',
  body: { frontShare: 0.533, cgHeightM: null, wheelbaseM: 2.562, trackFrontM: 1.412, trackRearM: 1.424, inertia: null, seat: null },
  tyre: { size: '225/45 R16', id: 'classic' },
  roadLoad: null,
  aero: null,
  published: { vmaxKmh: 235, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://en.wikipedia.org/wiki/BMW_M3', 'https://www.lfs.net/attachment/44487'],
  unverified: ['massKg', 'massBasis', 'body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM', 'tyre.size', 'published.vmaxKmh', 'published.vmaxLimited'],
};
