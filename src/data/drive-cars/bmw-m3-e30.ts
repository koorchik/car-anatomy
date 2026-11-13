// BMW M3 E30 (European car without a catalytic converter): its drivetrain beyond the shared car record.
//
// Final drive 3.25 and the ZF plate limited-slip differential with a 25 % locking value: Wikipedia, auto motor und
// sport's test and m3-klassik.de (secondary). The final drive's teeth are not published; BMW rear axles are hypoid.
// The coast locking value is taken equal to the drive one, and the driveline points are estimates until the car's
// packaging (engine position and the gearbox length) is filled in: wheelbase 2562 mm (Wikipedia), the
// differential's outputs on the rear axle line about 0.16 m off the centre line at wheel-centre height, the gearbox
// output flange behind a 0.55 m engine and a 0.65 m gearbox, one centre bearing.
//
// The dynamics (stage K2b) are estimates until a workshop manual or a parts catalogue gives the sizes: a 228 mm dry
// disc (the default of elements.ts); a two-piece steel propshaft of 70 × 1.6 mm with a rubber coupling at the gearbox
// output, a centre bearing and two universal joints, the coupling at 5 kN·m/rad (research §3.2: "much softer than the
// tube, a few kN·m/rad"); halfshafts as 24 mm steel between joint centres 0.47 m apart (from the differential output
// 0.16 m off the centre line to an outer joint 0.08 m inboard of the wheel centre at half the 1424 mm track); a 16″
// wheel with its tyre, hub and disc 0.9 kg·m² (gearbox plan).

import type { DriveCar } from '../../drivetrain/drive-car.ts';

export const BMW_M3_E30: DriveCar = {
  car: 'bmw-m3-e30',
  gearbox: 'manual-rwd',
  finalDrive: { ratio: 3.25, teeth: null, kind: 'hypoid' },
  differential: { kind: 'plate', lockDrive: 0.25, lockCoast: 0.25 },
  driveline: {
    diffOutputs: { rear: [-2.562, 0.16, 0.3] },
    propshaft: {
      points: [
        [-1.05, 0, 0.33],
        [-1.75, 0, 0.3],
        [-2.36, 0, 0.3],
      ],
    },
  },
  dynamics: {
    clutch: { outerMm: 228, innerMm: 152, clampN: null },
    propshaft: { tubeOuterMm: 70, tubeWallMm: 1.6, couplingNmPerRad: 5000, ujoints: 2, centreBearing: true },
    halfshaft: { diameterMm: 24, lengthM: 0.47 },
    wheelInertia: 0.9,
  },
  sources: [
    'https://en.wikipedia.org/wiki/BMW_M3_(E30)',
    'https://www.auto-motor-und-sport.de/test/bmw-m3-e30/technische-daten/',
    'http://www.m3-klassik.de/m3_daten.htm',
  ],
  unverified: [
    'finalDrive.kind',
    'differential.lockCoast',
    'differential.preloadNm',
    'driveline.diffOutputs',
    'driveline.propshaft',
    'dynamics.clutch',
    'dynamics.propshaft',
    'dynamics.halfshaft',
    'dynamics.wheelInertia',
  ],
};
