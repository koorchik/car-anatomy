// The whole car in 3D (stage C1a), without WebGL: the engine placed by mountMatrix exactly as large as on its page,
// the gearbox's bellhousing on the engine's flywheel plane, the gearbox's stubs ending where the chassis's halfshafts
// start, the wheels on the record's wheelbase and tracks, the engine inside the body, the bonnet built from the bay
// saying what the bay check says (and cut open exactly where an engine too tall for the bay comes through), the
// exhaust ending at the tailpipe point, the renderOrder bands, and a system for every part.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/data/cars.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { cgPoint, type Vec3 } from '../src/vehicle/car.ts';
import { transaxleStubs } from '../src/vehicle/gearbox-place.ts';
import { carToEngine, mountMatrix } from '../src/vehicle/mount.ts';
import { bayOverflow, crankFrontZMm, engineBoxInCar, engineToCar, fitsBay, wheelCentre } from '../src/vehicle/packaging.ts';
import type { EngineMount } from '../src/vehicle/vehicle.ts';
import { OVERVIEW_CARS } from '../src/ui/car/overview-cars.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const { CarAssembly, CAR_BANDS, carInputs } = await import('../src/scene/car/assembly.ts');
const { lidZ } = await import('../src/scene/car/body-shell.ts');
const { SYSTEM_CARDS } = await import('../src/scene/car/parts.ts');
const { PistonEngineModel } = await import('../src/scene/piston-engine.ts');
const { MM } = await import('../src/scene/geometry.ts');

/** 1 mm in scene units. */
const MM_SCENE = 0.01;
const fromScene = (v: THREE.Vector3): Vec3 => [v.z / 10, v.x / 10, v.y / 10];
const near = (a: Vec3, b: Vec3, tol: number, label: string): void => {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!), `${label} [${k}]: ${a.join(', ')} against ${b.join(', ')}`).toBeLessThan(tol);
};

const built = new Map(OVERVIEW_CARS.map((id) => [id, new CarAssembly(carInputs(id))]));
const civic = built.get('civic-type-r-fk8')!;
/**
 * A deliberately oversize engine in the Civic: the catalogue's tall diesel six with its stroke 30 % longer. Its core
 * stands above the Civic's bay and leaves it nowhere else (packaging.ts), and high enough to come through the bonnet.
 */
const tallSix = engineById('i6d')!;
const oversize = new CarAssembly(carInputs('civic-type-r-fk8', buildEngine({ ...tallSix, stroke: tallSix.stroke * 1.3 })));

/** Every vertex of the shown meshes under `root`, in the front-axle frame. */
function eachVertex(assembly: InstanceType<typeof CarAssembly>, root: THREE.Object3D, visit: (p: Vec3, mesh: THREE.Mesh) => void): void {
  assembly.group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) visit(fromScene(mesh.localToWorld(v.fromBufferAttribute(pos, i))), mesh);
  });
}

describe('mountMatrix', () => {
  const MOUNTS: EngineMount['front'][] = ['forward', 'rearward', 'left', 'right'];

  it('turns the engine without mirroring or scaling it, the inverse of carToEngine, and puts its front at crankFront', () => {
    for (const front of MOUNTS) {
      const mount: EngineMount = { axis: front === 'forward' || front === 'rearward' ? 'longitudinal' : 'transverse', front, position: 'front' };
      const m = new THREE.Matrix4().fromArray(mountMatrix(mount, { crankFront: [0.3, -0.2, 0.45] }, 0.25));
      expect(m.determinant(), front).toBeCloseTo(1, 12);
      // A car-frame direction into the engine frame and back through the matrix's turn comes back unchanged.
      const turn = new THREE.Matrix3().setFromMatrix4(m);
      const e = { x: 0, y: 0, z: 0 };
      for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.5, 0.8]] as Vec3[]) {
        carToEngine(mount, d[0], d[1], d[2], e);
        const back = new THREE.Vector3(e.x, e.y, e.z).applyMatrix3(turn);
        near([back.x, back.y, back.z], d, 1e-12, front);
        near(engineToCar(mount, [e.x, e.y, e.z]), d, 1e-12, front);
      }
      const front3 = new THREE.Vector3(0, 0, 0.25).applyMatrix4(m);
      near([front3.x, front3.y, front3.z], [0.3, -0.2, 0.45], 1e-12, front);
    }
  });
});

describe('the car as the overview assembles it', () => {
  for (const [id, assembly] of built) {
    const car = CARS[id]!;

    it(`${id}: bolts the gearbox's bellhousing to the engine's flywheel plane within 1 mm`, () => {
      const a = assembly.anchors();
      expect(a.flywheel!.distanceTo(a.bellhousing!)).toBeLessThan(MM_SCENE);
    });

    it(`${id}: draws the engine exactly as large as its page does, with its crank's front end at the record's crankFront`, () => {
      assembly.group.updateMatrixWorld(true);
      const m = assembly.engineModel.group.matrixWorld;
      expect(m.determinant()).toBeCloseTo(1, 9);
      const e = m.elements;
      for (const c of [0, 4, 8]) expect(Math.hypot(e[c]!, e[c + 1]!, e[c + 2]!)).toBeCloseTo(1, 9);
      // The same engine on its own, as its page shows it: the same distance between two of its anchors.
      const alone = new PistonEngineModel(assembly.engine);
      const own = alone.anchors();
      const inCar = assembly.anchors();
      expect(inCar.crankFront!.distanceTo(inCar.flywheel!)).toBeCloseTo(own.crankFront!.distanceTo(own.flywheel!), 9);
      alone.dispose();
      near(fromScene(inCar.crankFront!), car.packaging!.crankFront, 0.001, 'crankFront');
      expect(assembly.group.scale.toArray()).toEqual([1, 1, 1]);
    });

    it(`${id}: stands its wheels on the record's wheelbase and tracks`, () => {
      const a = assembly.anchors();
      for (const axle of ['front', 'rear'] as const) {
        for (const side of ['left', 'right'] as const) near(fromScene(a[`${axle}.${side}.wheelCentre`]!), wheelCentre(car, axle, side), 0.001, `${axle} ${side}`);
      }
      near(fromScene(assembly.chassisModel.group.position), [cgPoint(car)[0], 0, 0], 1e-9, 'centre of mass on the road');
    });

    it(`${id}: ends the gearbox's stubs where the chassis's halfshafts start`, () => {
      const drive = DRIVE_CARS[id]!;
      const joint = (drive.driveline.diffOutputs.front ?? drive.driveline.diffOutputs.rear)!;
      const axle = drive.driveline.diffOutputs.front ? 'front' : 'rear';
      const a = assembly.anchors();
      near(fromScene(a[`${axle}.left.diffOutput`]!), joint, 0.001, 'left inner joint');
      near(fromScene(a[`${axle}.right.diffOutput`]!), [joint[0], -joint[1], joint[2]], 0.001, 'right inner joint');
      const stubs = transaxleStubs(car, assembly.engine, assembly.gearboxModel.box.spec, joint);
      const ends = stubs.map(([x, y, z]) => fromScene(assembly.gearboxModel.mounted.localToWorld(new THREE.Vector3(x * MM, y * MM, -z * MM))));
      const left = ends.reduce((p, q) => (q[1] > p[1] ? q : p));
      near(left, joint, 0.001, 'gearbox stub');
    });

    it(`${id}: keeps the engine inside the body and under its bonnet, with the bay check saying the same`, () => {
      const shape = assembly.chassisModel.shell!.shape;
      const box = engineBoxInCar(car, assembly.engine);
      for (let i = 0; i < 8; i++) {
        const p: Vec3 = [(i & 1 ? box.max : box.min)[0], (i & 2 ? box.max : box.min)[1], (i & 4 ? box.max : box.min)[2]];
        expect(shape.contains(p), p.join(', ')).toBe(true);
      }
      expect(fitsBay(car, assembly.engine)).toBe(true);
      expect(assembly.overflow.throughLid).toBeNull();
      expect(assembly.chassisModel.shell!.lidCutouts).toEqual([]);
      // Everything the engine draws (manifolds and turbo too) stays under the lid.
      let worst = -Infinity;
      eachVertex(assembly, assembly.engineModel.group, ([x, y, z]) => {
        if (x >= shape.lid.x0 && x <= shape.lid.x1 && Math.abs(y) <= shape.lid.halfY) worst = Math.max(worst, z - lidZ(shape, x, y));
      });
      expect(worst).toBeLessThan(0);
      // Nowhere does the lid dip under the bay's top: an engine that fits the bay never comes through it.
      for (let i = 0; i <= 40; i++) {
        for (let j = -40; j <= 40; j++) {
          const x = shape.lid.x0 + ((shape.lid.x1 - shape.lid.x0) * i) / 40;
          expect(lidZ(shape, x, (shape.lid.halfY * j) / 40)).toBeGreaterThan(car.packaging!.bay.max[2]);
        }
      }
    });

    it(`${id}: ends the exhaust at the tailpipe point and starts it at the engine's down-pipe`, () => {
      const a = assembly.anchors();
      near(fromScene(a.exhaustEnd!), car.packaging!.exhaustExit.at, 0.001, 'tailpipe');
      assembly.group.updateMatrixWorld(true);
      const start = fromScene(assembly.engineModel.group.localToWorld(assembly.engineModel.anchors().exhaust!.clone()));
      near(assembly.exhaust.route.points[0]!, start, 1e-9, 'down-pipe');
      near(fromScene(assembly.exhaust.route.curve.getPointAt(0)), start, 0.001, 'drawn start');
      const route = assembly.exhaust.route;
      // The muffler at the synthesis's length along the line, when the line has room for it there.
      if (route.muffler.alongPipe) expect(route.muffler.s).toBe(assembly.engine.spec.exhaust.pipeM);
      expect(route.muffler.s).toBeLessThan(route.lengthM);
      expect(route.catalyst.s).toBeLessThan(route.muffler.s);
    });

    it(`${id}: runs no hose or charge pipe through the fins of a radiator or an intercooler`, () => {
      const cores = [...(assembly.radiator?.boxes ?? []), ...(assembly.intercooler?.boxes ?? [])];
      // A pipe ends on its own core's face; a millimetre in, it would be inside the fins.
      const inside = (p: Vec3): boolean => cores.some((b) => [0, 1, 2].every((k) => p[k]! > b.min[k]! + 0.001 && p[k]! < b.max[k]! - 0.001));
      let pipes = 0;
      for (const model of [assembly.radiator, assembly.intercooler]) {
        if (!model) continue;
        eachVertex(assembly, model.group, (p, mesh) => {
          if (!/hose|pipe/.test(mesh.userData.part as string)) return;
          pipes++;
          expect(inside(p), `${mesh.userData.part} at ${p.join(', ')}`).toBe(false);
        });
      }
      expect(pipes).toBeGreaterThan(0);
    });

    it(`${id}: draws each model in its own renderOrder band, the body last`, () => {
      const bands: Array<[THREE.Object3D, number, number]> = [
        [assembly.engineModel.group, CAR_BANDS.engine, CAR_BANDS.engine + 9],
        [assembly.gearboxModel.group, CAR_BANDS.gearbox, CAR_BANDS.gearbox + 9],
        [assembly.chassisModel.front.group, CAR_BANDS.chassis, CAR_BANDS.chassis + 9],
        [assembly.chassisModel.rear.group, CAR_BANDS.chassis, CAR_BANDS.chassis + 9],
        [assembly.exhaust.group, CAR_BANDS.ancillary, CAR_BANDS.ancillary + 9],
        [assembly.chassisModel.shell!.group, 90, 99],
      ];
      for (const m of [assembly.radiator, assembly.intercooler, assembly.fuelTank]) if (m) bands.push([m.group, CAR_BANDS.ancillary, CAR_BANDS.ancillary + 9]);
      for (const [root, lo, hi] of bands) {
        root.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh && !(o as THREE.LineSegments).isLineSegments) return;
          // Overlays a section draws on top of everything (the suspension's forces) are not shown in a car.
          for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return;
          expect(o.renderOrder, `${root.userData.system} ${o.userData.part}`).toBeGreaterThanOrEqual(lo);
          expect(o.renderOrder, `${root.userData.system} ${o.userData.part}`).toBeLessThanOrEqual(hi);
        });
      }
    });

    it(`${id}: gives every part a system, and every system its card`, () => {
      expect(Object.keys(assembly.systems).sort()).toEqual(['air', 'body', 'cooling', 'engine', 'exhaust', 'front-suspension', 'fuel', 'gearbox', 'rear-suspension']);
      for (const [system, root] of Object.entries(assembly.systems)) {
        expect(root.userData.system).toBe(system);
        root.traverse((o) => {
          const key = o.userData.part as string | undefined;
          if (key) expect(assembly.parts[key], key).toBeDefined();
        });
      }
      for (const card of Object.values(assembly.parts)) expect(Object.values(SYSTEM_CARDS)).toContain(card);
      // Only the body wraps the rest, so only it answers a click last.
      assembly.group.traverse((o) => {
        if (o.userData.pickLast) expect(assembly.systems.body!.getObjectById(o.id)).toBeDefined();
      });
    });

    it(`${id}: tints only the system clicked`, () => {
      const emissive = (root: THREE.Object3D): number => {
        let sum = 0;
        root.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m?.emissive) sum += m.emissive.r + m.emissive.g + m.emissive.b;
        });
        return sum;
      };
      const before = { engine: emissive(assembly.systems.engine!), gearbox: emissive(assembly.systems.gearbox!) };
      assembly.highlightSystem('engine');
      expect(emissive(assembly.systems.engine!)).toBeGreaterThan(before.engine);
      expect(emissive(assembly.systems.gearbox!)).toBeCloseTo(before.gearbox, 9);
      assembly.highlightSystem(null);
      expect(emissive(assembly.systems.engine!)).toBeCloseTo(before.engine, 9);
    });
  }
});

describe('the bonnet against an engine too tall for the bay', () => {
  const car = CARS['civic-type-r-fk8']!;
  const overflow = bayOverflow(car, oversize.engine);
  const shape = oversize.chassisModel.shell!.shape;

  it('is an engine the bay check refuses for its height alone', () => {
    expect(fitsBay(car, oversize.engine)).toBe(false);
    expect(overflow.past.top).toBeGreaterThan(0);
    expect(overflow.throughLid).not.toBeNull();
  });

  it('is cut open exactly where the diagnosis says the engine comes through, and nowhere else', () => {
    const cut = overflow.throughLid!;
    expect(oversize.chassisModel.shell!.lidCutouts).toEqual([cut]);
    const lid = oversize.chassisModel.shell!.group.children.find((o) => o.userData.part === 'car.bonnet') as THREE.Mesh;
    const pos = lid.geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = lid.geometry.getIndex()!;
    const v = new THREE.Vector3();
    let inside = 0;
    let besideCut = 0;
    for (let t = 0; t < index.count; t += 3) {
      let x = 0;
      let y = 0;
      for (let k = 0; k < 3; k++) {
        const p = fromScene(v.fromBufferAttribute(pos, index.getX(t + k)));
        x += p[0] / 3;
        y += p[1] / 3;
      }
      if (x > cut.x0 && x < cut.x1 && y > cut.y0 && y < cut.y1) inside++;
      // The lid is whole right up to the hole's edges.
      if (x > cut.x0 - 0.08 && x < cut.x1 + 0.08 && y > cut.y0 - 0.08 && y < cut.y1 + 0.08) besideCut++;
    }
    expect(inside).toBe(0);
    expect(besideCut).toBeGreaterThan(0);
    // The hole's edges are those of the engine's core within the bay.
    const box = engineBoxInCar(car, oversize.engine);
    const bay = car.packaging!.bay;
    expect([cut.x0, cut.x1, cut.y0, cut.y1]).toEqual([Math.max(box.min[0], bay.min[0]), Math.min(box.max[0], bay.max[0]), Math.max(box.min[1], bay.min[1]), Math.min(box.max[1], bay.max[1])]);
    // Wherever over the lid the engine's core rises above the lid's surface, it is inside the hole, and it does somewhere.
    let through = 0;
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 60; j++) {
        const x = shape.lid.x0 + ((shape.lid.x1 - shape.lid.x0) * i) / 60;
        const y = -shape.lid.halfY + (2 * shape.lid.halfY * j) / 60;
        const under = x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1];
        if (!under || box.max[2] <= lidZ(shape, x, y)) continue;
        through++;
        expect(x >= cut.x0 && x <= cut.x1 && y >= cut.y0 && y <= cut.y1, `${x}, ${y}`).toBe(true);
      }
    }
    expect(through).toBeGreaterThan(0);
  });

  it('leaves the Civic’s own bonnet whole', () => {
    expect(civic.chassisModel.shell!.lidCutouts).toEqual([]);
    expect(crankFrontZMm(civic.engine)).toBeGreaterThan(civic.engine.zMax);
  });
});
