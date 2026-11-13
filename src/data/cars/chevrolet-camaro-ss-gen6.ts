// Chevrolet Camaro SS of the sixth generation with the 6.2 LT1: the oil page's default car. The mass is Chevrolet's
// 3685 lb (1672 kg) for the SS as Wikipedia cites it; Chevrolet's own pages answer 404 and their archive refused the
// request, so it stays unverified. The weight split is the oil page's own figure. Tracks and top speed come from a
// spec aggregator seen only in a search excerpt, the tyres from memory. The road load is the EPA coast-down of the
// 2016 SS with the six-speed manual.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'chevrolet-camaro-ss-gen6',
  name: 'Chevrolet Camaro SS',
  years: '2016-2024',
  engine: 'v8-cross/camaro-ss-lt1',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'forward', position: 'front' },
  massKg: 1672,
  massBasis: 'kerb',
  drive: 'rwd',
  body: { frontShare: 0.52, cgHeightM: null, wheelbaseM: 2.812, trackFrontM: 1.6, trackRearM: 1.598, inertia: null, seat: null },
  tyre: { size: '245/40 ZR20', sizeRear: '275/35 ZR20', id: 'street' },
  roadLoad: { a: 164.1, b: 5.523, c: 0.4064, source: 'EPA test car list MY2016 (16tstcar.csv): CAMARO, 6.2 L, 6MT, axle 3.73, vehicle 621GFE2116' },
  aero: null,
  published: { vmaxKmh: 290, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://en.wikipedia.org/wiki/Chevrolet_Camaro_(sixth_generation)', 'https://www.encycarpedia.com/us/chevrolet/16-camaro-ss-coupe', 'https://www.epa.gov/sites/default/files/2016-07/16tstcar.csv'],
  unverified: ['massKg', 'massBasis', 'body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM', 'tyre.size', 'tyre.sizeRear', 'published.vmaxKmh', 'published.vmaxLimited'],
};
