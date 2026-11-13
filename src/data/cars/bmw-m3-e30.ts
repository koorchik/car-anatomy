// BMW M3 (E30), the European car without a catalytic converter (200 PS): the car of the first gearbox pages and the
// third car of the overview, in place of the Soviet-era sedan the first plan named. BMW's own press release for the
// M3's thirtieth anniversary gives the 200 PS car 1200 kg, 0-100 km/h in 6.7 s and 235 km/h (it does not say
// whether the mass includes a driver, so the basis stays unverified); no limiter holds it, the German makers' 250 km/h
// agreement being above it. Wikipedia gives the wheelbase, 225/45 R16 tyres (the build order's table names
// 205/55 R15 as the other size, by year) and Cd 0.33.
// The tracks are recalled; they wait for BMW's brochure or a workshop manual (build order, A1). The weight split is
// NHTSA's measurement of a 1986 325i (docs/suspension-research/), a different engine in the same body.
// No EPA row, and the top speed is checked and unlimited, so the drag is solved from it: since stage K2b on the
// gearbox model, whose force at the wheels in the best gear meets the road load at 235 km/h. The frontal area is an
// estimate, areaShare (0.8585, the 911 Carrera 992.2's published area over its width and height) times Wikipedia's
// 1680 mm by 1370 mm; with Cd 0.33 it gives the brochure rule's comparison in docs/vehicle-model.md.
// Length, width and height are Wikipedia's (no BMW document found); the overhangs, ground clearance, side profile and
// where the engine, bay, exhaust, tank and radiator sit are estimates (docs/vehicle-model.md).

import type { CarRecord } from '../../vehicle/car.ts';

export const CAR: CarRecord = {
  id: 'bmw-m3-e30',
  name: 'BMW M3 (E30)',
  years: '1986-1989',
  engine: 'i4/bmw-m3-e30-s14',
  gearbox: 'manual-rwd',
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
  published: { vmaxKmh: 235, vmaxLimited: false, vmaxGear: null, zeroTo100S: 6.7 },
  sources: [
    'https://www.press.bmwgroup.com/usa/article/detail/T0264196EN_US/30-years-of-the-bmw-m3-%E2%80%93-the-story-behind-the-legend',
    'https://en.wikipedia.org/wiki/BMW_M3',
    'https://www.lfs.net/attachment/44487',
    'https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-239-1.bmw-m3-e30.html',
  ],
  unverified: [
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
  ],
};
