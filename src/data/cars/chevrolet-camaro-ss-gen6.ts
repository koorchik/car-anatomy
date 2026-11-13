// Chevrolet Camaro SS of the sixth generation with the 6.2 LT1: the oil page's default car. Mass and weight split
// are the oil page's own figures; Chevrolet gives 3685 lb (1672 kg) for the SS (Wikipedia, citing Chevrolet), and
// stage A1b checks the mass against the maker. Tracks and top speed come from a spec aggregator seen only in a search
// excerpt, the tyres from memory.

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'chevrolet-camaro-ss-gen6',
  name: 'Chevrolet Camaro SS',
  years: '2016-2024',
  engine: 'v8-cross/camaro-ss-lt1',
  gearbox: null,
  suspension: null,
  mount: { axis: 'longitudinal', front: 'forward', position: 'front' },
  massKg: 1670,
  massBasis: 'kerb',
  drive: 'rwd',
  body: { frontShare: 0.52, cgHeightM: null, wheelbaseM: 2.812, trackFrontM: 1.6, trackRearM: 1.598, inertia: null, seat: null },
  tyre: { size: '245/40 ZR20', sizeRear: '275/35 ZR20', id: 'street' },
  roadLoad: null,
  aero: null,
  published: { vmaxKmh: 290, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://en.wikipedia.org/wiki/Chevrolet_Camaro_(sixth_generation)', 'https://www.encycarpedia.com/us/chevrolet/16-camaro-ss-coupe'],
  unverified: ['massKg', 'massBasis', 'body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM', 'tyre.size', 'tyre.sizeRear', 'published.vmaxKmh', 'published.vmaxLimited'],
};
