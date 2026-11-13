// Honda Civic Type R FK8, the European car. Mass (curb weight 1380 kg), wheelbase, tracks, tyres, top speed and
// 0-100 km/h from Honda's launch release; Honda does not say whether its curb weight holds a driver, and by the usual
// meaning of the word it does not. The weight split and the way the engine faces are the oil page's own figures. The
// road load is the EPA coast-down of the US car (2017-2019); the second row EPA prints for it is the cold CO test's,
// which carries 10 % more road load by rule.
// Length, width without mirrors and height are Honda Europe's; the ground clearance is Honda Japan's for the 2020-2021
// car (6BA-FK8), whose spec sheet also holds a side-view dimension drawing to scale (4560 mm long, 2700 mm wheelbase).
// The overhangs and the side profile are measured off that drawing; the three tailpipes in the middle of the diffuser
// are Honda Europe's; where the engine, bay, tank, radiator and intercooler sit is estimated (docs/vehicle-model.md).

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'civic-type-r-fk8',
  name: 'Honda Civic Type R (FK8)',
  years: '2017-2021',
  engine: 'i4/civic-type-r-k20c1',
  gearbox: 'manual-transaxle',
  suspension: { front: 'macpherson', rear: 'multilink' },
  mount: { axis: 'transverse', front: 'right', position: 'front' },
  massKg: 1380,
  massBasis: 'kerb',
  drive: 'fwd',
  body: { frontShare: 0.62, cgHeightM: null, wheelbaseM: 2.699, trackFrontM: 1.599, trackRearM: 1.593, inertia: null, seat: null },
  tyre: { size: '245/30 R20', id: 'street' },
  roadLoad: { a: 154.5, b: 2.568, c: 0.4932, source: 'EPA test car list MY2017 (17tstcar-2018-05-30.xlsx): CIVIC 5DR Type-R, 2.0 L, 6MT, vehicle EHBF1M' },
  aero: null,
  dimensions: {
    lengthM: 4.557,
    widthM: 1.877,
    heightM: 1.434,
    frontOverhangM: 0.936,
    rearOverhangM: 0.922,
    groundClearanceM: 0.125,
    shape: 'hatch',
    profile: { bonnetFront: [0.807, 0.73], cowl: [-0.268, 0.969], roofX: [-1.442, -2.136] },
  },
  packaging: {
    // Timing end to the right, gearbox to the left; the crank sits ahead of and above the differential on the axle.
    crankFront: [0.2, -0.42, 0.4],
    bay: { min: [-0.22, -0.6, 0.15], max: [0.7, 0.6, 0.75] },
    exhaustExit: { at: [-3.58, 0, 0.27], side: 'centre' },
    fuelTank: [-1.95, 0, 0.3],
    radiator: { at: [0.7, 0, 0.5], side: 'centre' },
    intercooler: { at: [0.82, 0, 0.36], side: 'centre' },
  },
  published: { vmaxKmh: 272, vmaxLimited: false, vmaxGear: null, zeroTo100S: 5.7 },
  sources: [
    'https://hondanews.eu/eu/en/cars/media/pressreleases/108909/2017-honda-civic-type-r1',
    'https://en.wikipedia.org/wiki/Honda_Civic_Type_R',
    'https://www.epa.gov/sites/default/files/2018-06/17tstcar-2018-05-30.xlsx',
    'https://www.honda.co.jp/auto-archive/civic/type-r/2021/common/pdf/civictype-r_spec_list.pdf',
  ],
  unverified: [
    'massBasis',
    'mount',
    'body.frontShare',
    'body.cgHeightM',
    'dimensions.frontOverhangM',
    'dimensions.rearOverhangM',
    'dimensions.profile',
    'packaging.crankFront',
    'packaging.bay',
    'packaging.exhaustExit.at',
    'packaging.fuelTank',
    'packaging.radiator',
    'packaging.intercooler',
  ],
};
