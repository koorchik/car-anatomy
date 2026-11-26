// Everything the overview's 3D reads for each of its cars (stage C1a), held still: the record's sizes, mass and tyre
// radii, where every model stands, the exhaust line, the bay check and the canonical circuit's length. If this fails,
// visitors get another car. Update it (vitest -u) only for a change meant to be seen, and say so in the commit; each
// car has a file of its own, so stages adding cars do not meet in one snapshot. The canonical lap's time joins it with
// the car's lap (stage C3a).

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { drivingMassKg, tyreRadiiM, type Vec3 } from '../src/vehicle/car.ts';
import { buildTrack, TEST_CIRCUIT } from '../src/vehicle/track.ts';
import { engineBoxInCar } from '../src/vehicle/packaging.ts';
import { OVERVIEW_CARS } from '../src/ui/car/overview-cars.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const { CarAssembly, carInputs } = await import('../src/scene/car/assembly.ts');

/** Metres to a tenth of a millimetre. */
const r = (v: number): number => Math.round(v * 1e4) / 1e4;
const rv = (p: readonly number[]): number[] => p.map(r);
const fromScene = (v: THREE.Vector3): Vec3 => [v.z / 10, v.x / 10, v.y / 10];

describe('the cars of the overview', () => {
  for (const id of OVERVIEW_CARS) {
    it(`${id} stands as before`, async () => {
      const assembly = new CarAssembly(carInputs(id));
      const { car, engine } = assembly;
      const anchors = Object.fromEntries(
        Object.entries(assembly.anchors())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, rv(fromScene(v))]),
      );
      const route = assembly.exhaust.route;
      const box = engineBoxInCar(car, engine);
      const snapshot = {
        car: { id: car.id, name: car.name, engine: car.engine, gearbox: car.gearbox, suspension: car.suspension, mount: car.mount, drive: car.drive },
        massKg: car.massKg,
        drivingMassKg: drivingMassKg(car),
        body: car.body,
        tyreRadiiM: Object.fromEntries(Object.entries(tyreRadiiM(car)).map(([k, v]) => [k, r(v)])),
        dimensions: car.dimensions,
        packaging: car.packaging,
        engineBox: { min: rv(box.min), max: rv(box.max) },
        overflow: assembly.overflow,
        anchors,
        exhaust: {
          points: route.points.map(rv),
          lengthM: r(route.lengthM),
          catalyst: { s: r(route.catalyst.s), at: rv(route.catalyst.at) },
          muffler: { s: r(route.muffler.s), at: rv(route.muffler.at), alongPipe: route.muffler.alongPipe },
        },
        systems: Object.keys(assembly.systems).sort(),
        trackLengthM: r(buildTrack(TEST_CIRCUIT).length),
      };
      await expect(`${JSON.stringify(snapshot, null, 2)}\n`).toMatchFileSnapshot(`./__snapshots__/car-snapshot/${id}.json`);
      assembly.dispose();
    });
  }
});
