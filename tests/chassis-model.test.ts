// The chassis of the Civic FK8 and the 911 Carrera T as the 3D draws it (stage P7-geom), without WebGL: the wheels on
// the record's wheelbase and tracks, the suspension's VehicleBody the record's own, the halfshafts starting where the
// gearbox's stubs end, the steering at the lock of the published turning circle, a body that never cuts a wheel, a bay
// lid over the bay, and cards for every part.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/data/cars.ts';
import { CHASSIS_CARS, chassisCarById } from '../src/data/chassis.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { bodyOf, cgBehindFrontAxleM, cgToCarFrame, drivingMassKg, tyreRadiiM, type CarRecord } from '../src/vehicle/car.ts';
import { wheelCentre } from '../src/vehicle/packaging.ts';
import { carChassis, lockFromTurning, sweepPoints, type CarChassis } from '../src/suspension/car-chassis.ts';
import { Axle, newCornerSample } from '../src/suspension/kinematics.ts';
import { CornerSolver } from '../src/suspension/solve.ts';
import type { LayoutId, Vec3 } from '../src/suspension/spec.ts';
import type { ViewMode } from '../src/scene/model-types.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const { ChassisModel, chassisFrame } = await import('../src/scene/suspension/chassis-model.ts');
const { bodyShape } = await import('../src/scene/car/body-shell.ts');

/**
 * The shell's SceneModel<F>, word for word from the whole-car plan («Stage для всіх розділів»). O2b puts it in
 * model-types.ts and the chassis then declares it; until then this keeps the chassis fitting it.
 */
interface SceneModel<F> {
  group: THREE.Group;
  update(frame: F): void;
  setView(view: ViewMode): void;
  setExplode(amount: number): void;
  setFailure(part: string | null): void;
  dispose(): void;
  anchors?(): Record<string, THREE.Vector3>;
  setHighlight?(on: boolean): void;
  setGhost?(alpha: number): void;
  setRenderBand?(base: number): void;
}

const IDS = Object.keys(CHASSIS_CARS);
const chassisOf = (id: string): CarChassis => carChassis(CARS[id]!, CHASSIS_CARS[id]!, DRIVE_CARS[id]?.driveline.diffOutputs ?? {});
const built = new Map(IDS.map((id) => [id, chassisOf(id)]));
const models = new Map(IDS.map((id) => [id, new ChassisModel(built.get(id)!)]));

/** A scene point of the chassis (CG frame) in the record's front-axle frame. */
const toCar = (car: CarRecord, v: THREE.Vector3): Vec3 => cgToCarFrame(car)([v.z / 10, v.x / 10, v.y / 10]);

/** Every vertex of the meshes under `root` that are on show and pass `keep`, in the front-axle frame, as drawn. */
function drawnPoints(car: CarRecord, root: THREE.Object3D, keep: (mesh: THREE.Mesh) => boolean, visit: (p: Vec3, part: string) => void): void {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !keep(mesh)) return;
    for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    for (let k = 0; k < (instanced ? instanced.count : 1); k++) {
      if (instanced) instanced.getMatrixAt(k, m);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (instanced) v.applyMatrix4(m);
        visit(toCar(car, mesh.localToWorld(v)), String(o.userData.part));
      }
    }
  });
}

/** Height of a half-section's top (its first four points) at |y|; null beyond them. */
function topOfSection(half: Array<[number, number]>, y: number): number | null {
  for (let i = 1; i <= 3; i++) {
    const [y0, z0] = half[i - 1]!;
    const [y1, z1] = half[i]!;
    if (y <= y1) return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0);
  }
  return null;
}

const LAYOUTS: readonly LayoutId[] = ['macpherson', 'double-wishbone', 'multilink', 'pushrod', 'trailing-arm', 'semi-trailing', 'swing-axle', 'twist-beam', 'live-axle', 'de-dion'];

describe('chassis records', () => {
  it('the Civic FK8 and the 911 Carrera T have one', () => {
    expect(IDS.sort()).toEqual(['civic-type-r-fk8', 'porsche-911-carrera-t-992']);
    expect(chassisCarById('constructor')).toBeUndefined();
  });

  it.each(IDS)('%s: the car record names the layouts its chassis builds', (id) => {
    const car = CARS[id]!;
    const c = CHASSIS_CARS[id]!;
    expect(c.car).toBe(id);
    expect(car.suspension).toEqual({ front: c.front.layout, rear: c.rear.layout });
    for (const layout of [car.suspension!.front, car.suspension!.rear]) expect(LAYOUTS).toContain(layout);
    expect(c.sources.length).toBeGreaterThan(0);
  });

  it('gives the Civic a dual-axis strut and the 911 a plain one, both with a five-link rear', () => {
    expect(CHASSIS_CARS['civic-type-r-fk8']!.front).toEqual({ layout: 'macpherson', knuckle: 'dual-axis' });
    expect(CHASSIS_CARS['porsche-911-carrera-t-992']!.front).toEqual({ layout: 'macpherson', knuckle: 'plain' });
    for (const id of IDS) expect(built.get(id)!.rear.corner.axle.linkage.rods).toHaveLength(5);
  });
});

describe.each(IDS)('%s', (id) => {
  const car = CARS[id]!;
  const chassis = built.get(id)!;
  const model = models.get(id)!;
  const anchors = model.anchors();

  it('stands its wheels on the record’s wheelbase and tracks, at the tyres’ rolling radius', () => {
    for (const axle of ['front', 'rear'] as const) {
      for (const side of ['left', 'right'] as const) {
        const at = toCar(car, anchors[`${axle}.${side}.wheelCentre`]!);
        const want = wheelCentre(car, axle, side);
        for (let k = 0; k < 3; k++) expect(at[k], `${axle} ${side} ${k}`).toBeCloseTo(want[k]!, 9);
      }
    }
    const fl = anchors['front.left.wheelCentre']!;
    const rl = anchors['rear.left.wheelCentre']!;
    expect((fl.z - rl.z) / 10).toBeCloseTo(car.body.wheelbaseM, 9);
    expect((anchors['front.left.wheelCentre']!.x - anchors['front.right.wheelCentre']!.x) / 10).toBeCloseTo(car.body.trackFrontM, 9);
    expect((anchors['rear.left.wheelCentre']!.x - anchors['rear.right.wheelCentre']!.x) / 10).toBeCloseTo(car.body.trackRearM, 9);
    // The tyres are the record's sizes: the 911's rear is the larger.
    expect(chassis.front.corner.tyreRadiusM).toBeGreaterThan(tyreRadiiM(car).front);
    expect(chassis.rear.wheel.outerRadiusM).toBeCloseTo(chassis.rear.corner.tyreRadiusM!, 12);
  });

  it('takes its VehicleBody from bodyOf and stands on the record’s centre of mass', () => {
    expect(chassis.body).toEqual(bodyOf(car));
    expect(chassis.body.massKg).toBe(drivingMassKg(car));
    for (const k of ['frontShare', 'wheelbaseM', 'trackFrontM', 'trackRearM'] as const) expect(chassis.body[k]).toBe(car.body[k]);
    // The origin is on the road under the centre of mass: the front axle a = L·(1 − frontShare) ahead of it.
    expect(chassis.front.xCg).toBeCloseTo(cgBehindFrontAxleM(car), 12);
    expect(chassis.rear.xCg).toBeCloseTo(cgBehindFrontAxleM(car) - car.body.wheelbaseM, 12);
    expect(anchors.cg!.length()).toBe(0);
    // Each corner carries its share of the weight over its axle.
    const share = { front: chassis.body.frontShare, rear: 1 - chassis.body.frontShare };
    for (const axle of [chassis.front, chassis.rear]) {
      expect(2 * (axle.corner.sprungKg + axle.corner.unsprungKg)).toBeCloseTo(chassis.body.massKg * share[axle.which], 9);
    }
  });

  it('starts the halfshafts at the gearbox’s inner joints, and only on the driven axle', () => {
    const drive = DRIVE_CARS[id]!;
    const driven = car.drive === 'fwd' ? 'front' : 'rear';
    const other = driven === 'front' ? 'rear' : 'front';
    const joint = drive.driveline.diffOutputs[driven]!;
    const left = toCar(car, anchors[`${driven}.left.diffOutput`]!);
    const right = toCar(car, anchors[`${driven}.right.diffOutput`]!);
    for (let k = 0; k < 3; k++) {
      expect(left[k], `left ${k}`).toBeCloseTo(joint[k]!, 9);
      expect(right[k], `right ${k}`).toBeCloseTo(k === 1 ? -joint[k]! : joint[k]!, 9);
    }
    expect(anchors[`${other}.left.diffOutput`]).toBeUndefined();
    expect(chassis[other].corner.axle.halfshaft).toBeNull();
    // Each shaft reaches its wheel within the joints' limits at design.
    const axle = new Axle(chassis[driven].corner.axle);
    const s = newCornerSample();
    axle.measureAt(0, s);
    expect(s.cvInner).toBeLessThan((chassis[driven].corner.axle.halfshaft!.innerMaxDeg * Math.PI) / 180);
  });

  it('steers to the lock its published turning circle gives', () => {
    const lock = chassis.front.lock!;
    const outer = lockFromTurning(CHASSIS_CARS[id]!.turning, car.body.wheelbaseM, chassis.front.wheel.tyreWidthM);
    expect(lock.outerRad).toBe(outer);
    // Within the 25–35° of road cars, and the left wheel in by that much at the lock's rack.
    expect((outer * 180) / Math.PI).toBeGreaterThan(25);
    expect((outer * 180) / Math.PI).toBeLessThan(35);
    const a = new Axle(chassis.front.corner.axle, { table: false });
    const pose = CornerSolver.identity();
    expect(a.solver.solve(pose, 0, -lock.rackM, 40).ok).toBe(true);
    const s = newCornerSample();
    a.measure(pose, 0, -lock.rackM, s);
    expect(s.toe).toBeCloseTo(outer, 6);
    expect(lock.rackM).toBeGreaterThan(0.02);
    expect(lock.rackM).toBeLessThan(0.1);
    expect(chassis.rear.lock).toBeNull();
  });

  it('keeps every tyre out of the body over the arches’ bump and the whole lock, both ways', () => {
    const shape = model.shell!.shape;
    for (const axle of [chassis.front, chassis.rear]) {
      const x = axle.which === 'front' ? 0 : -car.body.wheelbaseM;
      const points = sweepPoints(axle.corner, axle.wheel, axle.lock ? axle.lock.rackM : null);
      expect(points.length).toBeGreaterThan(300);
      for (const [px, py, pz] of points) {
        for (const side of [1, -1]) {
          const p: Vec3 = [px + x, side * py, pz];
          expect(shape.contains(p), `${axle.which} ${p.map((v) => v.toFixed(3)).join(', ')}`).toBe(false);
        }
      }
      // And the arch is round the wheel: the tyre's top is under it, and the well is open at the wheel.
      const arch = shape.archAt(x)!;
      expect(arch).not.toBeNull();
      expect(arch.z + arch.radius).toBeGreaterThan(axle.sweep.topZ);
    }
  });

  it('keeps the drawn tyres of all four wheels out of the body at the lock either way', () => {
    // The 3D's own tyres, not the sweep the arches were sized from: the right side through its mirror, the rack's sign
    // on each side and the tyre's real section are all checked by what is drawn.
    const shape = model.shell!.shape;
    const frame = chassisFrame();
    try {
      for (const k of [-1, 1]) {
        frame.front.rack = k * model.lockRackM;
        model.update(frame);
        let n = 0;
        const inside: string[] = [];
        drawnPoints(car, model.group, (m) => /^susp\.(front|rear)\.tyre$/.test(String(m.userData.part)), (p, part) => {
          n++;
          if (inside.length < 3 && shape.contains(p)) inside.push(`${part} ${p.map((c) => c.toFixed(3)).join(', ')}`);
        });
        expect(n).toBeGreaterThan(4000);
        expect(inside, `rack ${k}`).toEqual([]);
      }
    } finally {
      frame.front.rack = 0;
      model.update(frame);
    }
  });

  it('keeps every part of the chassis under the body’s top, strut towers included, at the lock either way', () => {
    // The JTEKT strut stands 0.47 m over the wheel centre: under the 911's low bonnet line its tower has to be covered.
    const shape = model.shell!.shape;
    const frame = chassisFrame();
    try {
      for (const k of [-1, 0, 1]) {
        frame.front.rack = k * model.lockRackM;
        model.update(frame);
        let worst = -Infinity;
        let where = '';
        drawnPoints(car, model.group, (m) => !String(m.userData.part).startsWith('car.'), (p, part) => {
          if (p[0] > shape.xFront || p[0] < shape.xRear) return;
          const top = topOfSection(shape.section(p[0]), Math.abs(p[1]));
          if (top === null || p[2] - top <= worst) return;
          worst = p[2] - top;
          where = `${part} ${p.map((c) => c.toFixed(3)).join(', ')}`;
        });
        expect(worst, where).toBeLessThan(-0.005);
      }
    } finally {
      frame.front.rack = 0;
      model.update(frame);
    }
  });

  it('keeps the arches inside the body, and the body round the wheels', () => {
    const shape = model.shell!.shape;
    const d = car.dimensions!;
    for (const a of shape.arches) {
      expect(a.x + a.radius).toBeLessThan(shape.xFront);
      expect(a.x - a.radius).toBeGreaterThan(shape.xRear);
      expect(a.innerY).toBeGreaterThan(0.3);
      // The fender stands over the arch and the well's wall inboard of the body's side.
      const half = shape.section(a.x);
      expect(half[3]![1]).toBeGreaterThan(a.z + a.radius);
      expect(a.innerY).toBeLessThan(shape.halfWidth(a.x));
    }
    // The shell's outer box is the record's.
    expect(shape.xFront).toBeCloseTo(d.frontOverhangM, 12);
    expect(shape.xRear).toBeCloseTo(-(car.body.wheelbaseM + d.rearOverhangM), 12);
    let top = 0;
    let wide = 0;
    for (const x of shape.stations) {
      top = Math.max(top, ...shape.section(x).map(([, z]) => z));
      wide = Math.max(wide, shape.halfWidth(x));
      expect(shape.floorZ(x)).toBeGreaterThanOrEqual(d.groundClearanceM - 1e-9);
    }
    expect(top).toBeLessThanOrEqual(d.heightM + 1e-9);
    expect(top).toBeGreaterThan(d.heightM - 0.02);
    expect(2 * wide).toBeCloseTo(d.widthM, 9);
  });

  it('builds the lid over the bay and never dips the body under the bay’s top there', () => {
    const shape = model.shell!.shape;
    const bay = car.packaging!.bay;
    const lid = shape.lid;
    expect(lid.kind).toBe(car.mount.position === 'front' ? 'bonnet' : 'engine-lid');
    expect([lid.x0, lid.x1]).toEqual([bay.min[0], bay.max[0]]);
    expect(lid.halfY).toBe(Math.max(-bay.min[1], bay.max[1]));
    for (let i = 0; i <= 40; i++) {
      const x = bay.min[0] + ((bay.max[0] - bay.min[0]) * i) / 40;
      expect(shape.topZ(x)).toBeGreaterThanOrEqual(bay.max[2]);
    }
    // A point just under the bay's top over the middle of the bay is inside the body, one just over the shell is not.
    const mid = (bay.min[0] + bay.max[0]) / 2;
    expect(shape.contains([mid, 0, bay.max[2] - 0.01])).toBe(true);
    expect(shape.contains([mid, 0, shape.topZ(mid) + 0.01])).toBe(false);
    // The bulkhead stands at the bay's cabin end, inside the wheel wells.
    const bulk = shape.bulkhead;
    expect(bulk.x).toBe(car.mount.position === 'front' ? bay.min[0] : bay.max[0]);
    const arch = shape.archAt(bulk.x);
    if (arch) expect(bulk.halfY).toBeLessThanOrEqual(arch.innerY);
  });

  it('places the shell where carFrameToCg puts the front axle', () => {
    const origin = chassis.toCg([0, 0, 0]);
    const p = model.shell!.group.position;
    expect([p.z / 10, p.x / 10, p.y / 10]).toEqual([origin[0], origin[1], origin[2]]);
  });

  it('fits the shell’s scene model, and every tagged part has a card', () => {
    const m: SceneModel<ReturnType<typeof chassisFrame>> = model;
    expect(m.group).toBe(model.group);
    const keys = new Set<string>();
    model.group.traverse((o) => {
      if (o.userData.part) keys.add(o.userData.part as string);
      for (const list of [o.userData.partOf, o.userData.instanceParts] as Array<string[] | undefined>) for (const k of list ?? []) keys.add(k);
    });
    const missing = [...keys].filter((k) => !model.parts[k]);
    expect(missing).toEqual([]);
    // Every corner key carries its axle, so a strut's spring and a link's spring keep their own cards.
    for (const k of keys) expect(k, k).toMatch(/^(susp\.(front|rear)\.|car\.)/);
    expect(model.parts['susp.front.anti-roll-bar']).toBeDefined();
    expect(model.parts['susp.front.rack']!.text).not.toBe(model.parts['susp.rear.toe-link']?.text);
    // And no card for a part that is not there: the rear axle does not steer.
    expect(model.parts['susp.rear.rack']).toBeUndefined();
  });

  it('keeps its draw calls within the chassis budget of the whole-car plan', () => {
    for (const view of ['solid', 'xray', 'mechanism'] as const) {
      model.setView(view);
      let meshes = 0;
      model.group.traverse((o) => {
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
        if ((o as THREE.Mesh).isMesh || (o as THREE.LineSegments).isLineSegments) meshes++;
      });
      expect(meshes, view).toBeLessThanOrEqual(260);
    }
    model.setView('solid');
  });

  it('turns lock to lock, pulls apart and comes back without throwing', () => {
    const frame = chassisFrame();
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      frame.front.rack = k * model.lockRackM;
      model.update(frame);
    }
    model.setExplode(1);
    model.setExplode(0);
    model.setHighlight(true);
    model.setHighlight(false);
    model.setGhost(0.15);
    model.setGhost(1);
    model.setRenderBand(30);
    model.setFailure('susp.front.spring');
    model.setFailure(null);
    frame.front.rack = 0;
    model.update(frame);
  });

  it('keeps a body that is switched off hidden through the ghost and the views', () => {
    model.setBody(false);
    model.setGhost(0.4);
    expect(model.shell!.group.visible).toBe(false);
    model.setView('xray');
    expect(model.shell!.group.visible).toBe(false);
    model.setBody(true);
    expect(model.shell!.group.visible).toBe(true);
    model.setView('mechanism');
    model.setGhost(1);
    expect(model.shell!.group.visible).toBe(false);
    model.setView('solid');
    expect(model.shell!.group.visible).toBe(true);
  });

  it('keeps the bar’s links their length as the wheel steers', () => {
    const frame = chassisFrame();
    const lengths = (): number[] => {
      const out: number[] = [];
      model.front.group.traverse((o) => {
        if (o.userData.part === 'susp.front.bar-link') out.push(o.scale.y);
      });
      return out;
    };
    const rest = lengths();
    expect(rest).toHaveLength(2);
    frame.front.rack = model.lockRackM;
    model.update(frame);
    const turned = lengths();
    for (let i = 0; i < 2; i++) expect(turned[i]).toBeCloseTo(rest[i]!, 6);
    frame.front.rack = 0;
    model.update(frame);
  });
});

describe('the body’s shape', () => {
  it('needs the record’s dimensions and packaging', () => {
    const e30 = CARS['bmw-m3-e30']!;
    const bare: CarRecord = { ...e30, dimensions: undefined, packaging: undefined };
    expect(() => bodyShape(bare, [])).toThrow(/dimensions/);
  });
});
