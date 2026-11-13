// BMW M3 (E30), the European car without a catalytic converter (200 PS): the car of the first gearbox pages and the
// third car of the overview, in place of the Soviet-era sedan the first plan named. Wikipedia gives the wheelbase, a mass range of 1165-1360 kg,
// 225/45 R16 tyres (the build order's table names 205/55 R15 as the other size, by year) and 235 km/h, the last for
// the 195 PS car with a catalytic converter.
// The mass and tracks are recalled; all of these wait for BMW's brochure or a workshop manual (build order, A1). The
// weight split is NHTSA's measurement of a 1986 325i (docs/suspension-research/), a different engine in the same
// body. The gearbox link comes with the gearbox data (stage K2b).
// No EPA row, and the top speed of the 200 PS car is unchecked, so the drag is Cd·A times k_EPA: Cd 0.33 is the
// figure Wikipedia gives for the M3 body; the frontal area is an estimate, areaShare (0.8585, the 911 Carrera 992.2's
// published area over its width and height) times Wikipedia's 1680 mm by 1370 mm. BMW Group Classic gives 230 km/h
// without naming the version, which leaves the 200 PS car's 235 km/h unchecked.
// Length, width and height are Wikipedia's (no BMW document found); the overhangs, ground clearance, side profile and
// where the engine, bay, exhaust, tank and radiator sit are estimates (docs/vehicle-model.md).

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
  aero: { cd: 0.33, areaM2: 1.98 },
  dimensions: {
    lengthM: 4.345,
    widthM: 1.68,
    heightM: 1.37,
    frontOverhangM: 0.8,
    rearOverhangM: 0.983,
    groundClearanceM: 0.12,
    shape: 'sedan',
    profile: { bonnetFront: [0.72, 0.7], cowl: [-0.6, 0.93], roofX: [-1.15, -2] },
  },
  packaging: {
    // Timing end forward, just ahead of the front axle; the gearbox follows the flywheel back into the tunnel.
    crankFront: [0.17, 0, 0.38],
    bay: { min: [-0.55, -0.5, 0.15], max: [0.55, 0.5, 0.725] },
    exhaustExit: { at: [-3.5, -0.4, 0.25], side: 'right' },
    fuelTank: [-2.05, 0, 0.35],
    radiator: { at: [0.62, 0, 0.45], side: 'centre' },
    intercooler: null,
  },
  published: { vmaxKmh: 235, vmaxLimited: false, vmaxGear: null, zeroTo100S: null },
  sources: ['https://en.wikipedia.org/wiki/BMW_M3', 'https://www.lfs.net/attachment/44487', 'https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-239-1.bmw-m3-e30.html'],
  unverified: [
    'massKg',
    'massBasis',
    'body.frontShare',
    'body.cgHeightM',
    'body.trackFrontM',
    'body.trackRearM',
    'tyre.size',
    'aero.cd',
    'aero.areaM2',
    'dimensions.frontOverhangM',
    'dimensions.rearOverhangM',
    'dimensions.groundClearanceM',
    'dimensions.profile',
    'packaging.crankFront',
    'packaging.bay',
    'packaging.exhaustExit',
    'packaging.fuelTank',
    'packaging.radiator',
    'published.vmaxKmh',
    'published.vmaxLimited',
  ],
};
