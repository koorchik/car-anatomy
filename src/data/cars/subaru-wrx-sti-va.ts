// Subaru WRX STI of the VA generation with the EJ257, the international version. Wheelbase and tyres from Subaru's
// launch release; mass and weight split are the oil page's own figures (Wikipedia gives 1480-1595 kg across the
// range); tracks and top speed are recalled and wait for Subaru's data.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'subaru-wrx-sti-va',
  name: 'Subaru WRX STI',
  years: '2014-2021',
  engine: 'b4',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'forward', position: 'front' },
  massKg: 1540,
  massBasis: 'kerb',
  drive: 'awd',
  body: { frontShare: 0.6, cgHeightM: null, wheelbaseM: 2.65, trackFrontM: 1.53, trackRearM: 1.54, inertia: null, seat: null },
  tyre: { size: '245/40 R18', id: 'street' },
  roadLoad: null,
  aero: null,
  published: { vmaxKmh: 255, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://web.archive.org/web/20211115224859/https://www.media.subaru-global.com/en/news/1831', 'https://en.wikipedia.org/wiki/Subaru_WRX'],
  unverified: ['massKg', 'massBasis', 'body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM', 'published.vmaxKmh', 'published.vmaxLimited'],
};
