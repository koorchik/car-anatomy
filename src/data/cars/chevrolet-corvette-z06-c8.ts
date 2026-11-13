// Chevrolet Corvette Z06 (C8) with the LT6 and the eight-speed dual-clutch gearbox. Mass and weight split are the
// oil page's own figures (Car and Driver weighed 3666 lb, 1663 kg); Chevrolet's pages could not be reached to check
// the mass, so it stays unverified. Wheelbase, tyres and top speed (195 mph) from Wikipedia, tracks (66.3 and
// 66.1 in) from GM Authority's copy of the spec sheet, seen only in a search excerpt. The road load is the EPA
// coast-down of the 2023 Z06: EPA lists two test cars, and this is the one with the lower drag (C 0.0176 against
// 0.0227 lbf/mph²); which of them carries the Z07 package is our guess.

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
  roadLoad: { a: 163.7, b: 7.244, c: 0.392, source: 'EPA test car list MY2023 (23-testcar-2024-05-17_0.xlsx): CORVETTE Z06, 5.5 L, 8DCT, vehicle 551PYE2173' },
  aero: null,
  published: { vmaxKmh: 314, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://en.wikipedia.org/wiki/Chevrolet_Corvette_(C8)', 'https://gmauthority.com/blog/2021/10/here-are-the-official-2023-corvette-z06-specs/', 'https://www.epa.gov/system/files/documents/2024-05/23-testcar-2024-05-17_0.xlsx'],
  unverified: ['massKg', 'massBasis', 'body.frontShare', 'body.cgHeightM', 'body.trackFrontM', 'body.trackRearM', 'roadLoad', 'published.vmaxLimited'],
};
