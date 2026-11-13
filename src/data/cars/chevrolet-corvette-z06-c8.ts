// Chevrolet Corvette Z06 (C8) with the LT6 and the eight-speed dual-clutch gearbox. Mass and weight split are the
// oil page's own figures: Car and Driver weighed 3666 lb (1663 kg), and stage A1b checks the mass against the maker.
// Wheelbase, tyres and top speed (195 mph) from Wikipedia, tracks (66.3 and 66.1 in) from GM Authority's copy of the
// spec sheet, seen only in a search excerpt.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'chevrolet-corvette-z06-c8',
  name: 'Chevrolet Corvette Z06 (C8)',
  years: '2023-',
  engine: 'v8-flat/corvette-z06-c8-lt6',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'forward', position: 'mid' },
  massKg: 1560,
  massBasis: 'kerb',
  drive: 'rwd',
  body: { frontShare: 0.4, cgHeightM: null, wheelbaseM: 2.723, trackFrontM: 1.684, trackRearM: 1.679, inertia: null, seat: null },
  tyre: { size: '275/30 ZR20', sizeRear: '345/25 ZR21', id: 'street' },
  roadLoad: null,
  aero: null,
  published: { vmaxKmh: 314, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://en.wikipedia.org/wiki/Chevrolet_Corvette_(C8)', 'https://gmauthority.com/blog/2021/10/here-are-the-official-2023-corvette-z06-specs/'],
  unverified: ['massKg', 'massBasis', 'body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM', 'published.vmaxLimited'],
};
