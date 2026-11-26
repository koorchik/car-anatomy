// One car is one car in every section (whole-car plan, tests between the sections). Stage C4's part: a donor as made in
// the car builder gives the gearbox section's 0–100 km/h and v_max for that car within 3 % and the oil page's lap
// time; and in any build the gearbox model, the chassis model and the lap carry the same mass, tyre, tyre radius and
// road load.

import { describe, expect, it } from 'vitest';
import { DONORS, factoryBuild } from '../src/car-designer/build.ts';
import { evaluateBuild, type CarPerformance } from '../src/car-designer/evaluate.ts';
import { oddPresets } from '../src/car-designer/presets.ts';
import { resolveBuild } from '../src/car-designer/resolve.ts';
import { engineById, engineFacts } from '../src/data/engines.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { evaluateGearbox } from '../src/gearbox-designer/evaluate.ts';
import { designFromRecord } from '../src/gearbox-designer/presets.ts';
import { designVehicle } from '../src/gearbox-designer/vehicle.ts';
import { lapFor } from '../src/lubrication/scenario.ts';
import { catalogueChassis } from '../src/suspension-designer/catalogue.ts';
import { vehicleSpec } from '../src/vehicle/car.ts';
import { roadLoadN } from '../src/vehicle/road-load.ts';
import { parseTyreSize, rollingRadiusM } from '../src/vehicle/tyre-size.ts';

describe('the car builder against the sections', () => {
  it.each(DONORS.map((c) => c.id))('%s as made: the gearbox section\'s 0–100 and v_max, the oil page\'s lap', (id) => {
    const car = DONORS.find((c) => c.id === id)!;
    const p = evaluateBuild(factoryBuild(id));
    const page = evaluateGearbox(designFromRecord(gearboxById(car.gearbox!)!));
    expect(Math.abs(p.zeroTo100S! / page.zeroTo100S! - 1)).toBeLessThan(0.03);
    expect(Math.abs(p.vmaxKmh / page.vmaxKmh - 1)).toBeLessThan(0.03);
    const oil = lapFor(designFromSpec(engineById(car.engine)!), engineFacts(car.engine)?.powerHp ?? null, vehicleSpec(car), car.tyre.id);
    expect(p.lapTimeS).toBe(oil.lapTime);
  });

  const builds: Array<[string, CarPerformance]> = [
    ...DONORS.map((c): [string, CarPerformance] => [c.id, evaluateBuild(factoryBuild(c.id))]),
    ...oddPresets().map((p): [string, CarPerformance] => [p.id, evaluateBuild(p.build)]),
    ['911 on the Civic chassis and semi-slicks', evaluateBuild(resolveBuild({ ...factoryBuild('porsche-911-carrera-t-992'), suspension: { catalogue: 'civic-type-r-fk8' }, tyre: { id: 'semi', size: '305/30 ZR21' } }))],
  ];

  it.each(builds)('%s: one mass, tyre and road load in the gearbox model, the chassis and the lap', (_label, p) => {
    const v = designVehicle(p.gearboxDesign);
    expect(p.gearboxDesign.massKg).toBeCloseTo(p.massKg, 9);
    expect(p.vehicle.massKg).toBeCloseTo(p.massKg, 9);
    expect(p.gearboxDesign.tyre).toBe(p.car.tyre.id);
    expect(p.lap.tyre.id).toBe(p.car.tyre.id);
    expect(rollingRadiusM(parseTyreSize(p.gearboxDesign.tyreSize))).toBeCloseTo(p.vehicle.tyreRadiusM, 12);
    for (const kmh of [50, 100, 200]) {
      const ms = kmh / 3.6;
      expect(roadLoadN(v.roadLoad, ms, 0)).toBeCloseTo(roadLoadN(p.vehicle.roadLoad, ms, 0), 6);
    }
    if (p.chassisDesign) {
      const spec = catalogueChassis(p.chassisDesign);
      expect(spec.body.massKg).toBeCloseTo(p.massKg, 6);
      expect(spec.body.frontShare).toBeCloseTo(p.frontShare, 6);
      expect(spec.tyre).toBe(p.car.tyre.id);
      for (const kmh of [50, 100, 200]) {
        const ms = kmh / 3.6;
        expect(roadLoadN(spec.longitudinal.roadLoad, ms, 0)).toBeCloseTo(roadLoadN(p.vehicle.roadLoad, ms, 0), 6);
      }
    }
  });
});
