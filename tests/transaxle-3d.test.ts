// The two-shaft transaxle in 3D (stage K6a-3d): the Civic Type R FK8's and the 911 Carrera T's boxes mesh without
// overlapping (gear-geometry 1 on the drawn geometry, the crown wheel and pinion too), light the speed's pair and the
// final drive, keep the budget, and their halfshaft stubs end on the inner joints the car records hold.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CARS } from '../src/data/cars.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { engineById } from '../src/data/engines.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { transaxleFrame, type GearboxPoint } from '../src/drivetrain/layouts/transaxle.ts';
import { poseAt } from '../src/drivetrain/table-drive.ts';
import { buildGearbox, type Gearbox } from '../src/drivetrain/topology.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { bevelPenetration, type BevelMeshSpec } from '../src/scene/gearbox/bevel-mesh.ts';
import type { GearLayer } from '../src/scene/gearbox/gear-mesh.ts';
import type { GearboxFrame } from '../src/scene/gearbox/gearbox-model.ts';
import { GEARBOX_PARTS } from '../src/scene/gearbox/parts.ts';
import { TransaxleModel } from '../src/scene/gearbox/transaxle-model.ts';
import type { SceneModel } from '../src/scene/model-types.ts';
import { blockBackZMm, gearboxToCar, transaxleStubs } from '../src/vehicle/gearbox-place.ts';
import { crankFrontZMm, engineToCar } from '../src/vehicle/packaging.ts';

// The cast aluminium's bump map is drawn on a canvas, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const BOXES = [
  { id: 'manual-transaxle', car: 'civic-type-r-fk8' },
  { id: 'manual-transaxle/porsche-911-carrera-t-992', car: 'porsche-911-carrera-t-992' },
] as const;
const boxOf = (id: string): Gearbox => buildGearbox(gearboxSpec(gearboxById(id)!));
const MM = 0.01;

/** The section of a drawn cylindrical gear at world z: its outline in world x, y, between the two layers around z. */
function slice(mesh: THREE.Mesh, worldZ: number): THREE.Vector2[] {
  const geometry = mesh.geometry;
  const layers = geometry.userData.layers as GearLayer[];
  const inverse = mesh.matrixWorld.clone().invert();
  const localZ = new THREE.Vector3(0, 0, worldZ).applyMatrix4(inverse).z;
  let k = 0;
  while (k + 2 < layers.length && layers[k + 1]!.z > localZ) k++;
  const A = layers[k]!;
  const B = layers[k + 1]!;
  const t = Math.min(1, Math.max(0, (A.z - localZ) / (A.z - B.z)));
  const pos = geometry.getAttribute('position');
  const out: THREE.Vector2[] = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i < A.count; i++) {
    p.fromBufferAttribute(pos, A.start + i);
    q.fromBufferAttribute(pos, B.start + i);
    p.lerp(q, t).applyMatrix4(mesh.matrixWorld);
    out.push(new THREE.Vector2(p.x, p.y));
  }
  return out;
}

function inside(polygon: THREE.Vector2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Points of either drawn section inside the other, at several depths across the face. */
function overlaps(model: TransaxleModel, gearA: string, gearB: string): number {
  const ma = model.gearMesh(gearA)!;
  const mb = model.gearMesh(gearB)!;
  model.group.updateMatrixWorld(true);
  const layers = (m: THREE.Mesh) => (m.geometry.userData.layers as GearLayer[]).map((l) => new THREE.Vector3(0, 0, l.z).applyMatrix4(m.matrixWorld).z);
  const depths = [...layers(ma), ...layers(mb)];
  const zMin = Math.min(...depths);
  const zMax = Math.max(...depths);
  for (let i = 1; i < 6; i++) depths.push(zMin + ((zMax - zMin) * i) / 6);
  let count = 0;
  for (const z of depths) {
    const sa = slice(ma, z);
    const sb = slice(mb, z);
    for (const p of sa) if (inside(sb, p.x, p.y)) count++;
    for (const p of sb) if (inside(sa, p.x, p.y)) count++;
  }
  return count;
}

/**
 * The pose in neutral that turns gear `id` by `turn` rad, everything else following through the meshes. In neutral a
 * gear follows either the input shaft or the differential (the output shaft and the gears it turns), so the base
 * coordinate that moves it turns.
 */
function turnGear(box: Gearbox, id: string, turn: number) {
  const row = box.P[box.members.indexOf(box.spec.gears.find((g) => g.id === id)!.member)]!;
  const byInput = row[box.basis.indexOf(box.spec.input)]!;
  if (Math.abs(byInput) > 1e-12) return poseAt(box, 'N', turn / byInput);
  return poseAt(box, 'N', 0, turn / row[box.basis.indexOf(box.spec.output)]!);
}

const bevelShape = (box: Gearbox, id: string): BevelMeshSpec => {
  const g = box.spec.gears.find((x) => x.id === id)!;
  return { teeth: g.teeth, module: g.module, pressureAngle: g.pressureAngle, shift: g.shift, faceWidth: g.faceWidth, cone: g.cone!, boreRadius: 0 };
};

/** Vertices of each drawn bevel gear that lie inside the other's (unthinned) teeth, deeper than 1 µm. */
function bevelOverlaps(model: TransaxleModel, box: Gearbox): number {
  model.group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let count = 0;
  for (const [a, b] of [['final-pinion', 'final-ring'], ['final-ring', 'final-pinion']] as const) {
    const ma = model.gearMesh(a)!;
    const mb = model.gearMesh(b)!;
    const toB = mb.matrixWorld.clone().invert().multiply(ma.matrixWorld);
    const shape = bevelShape(box, b);
    const pos = ma.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toB);
      if (bevelPenetration(shape, v.x / MM, v.y / MM, v.z / MM, 0) > 1e-3) count++;
    }
  }
  return count;
}

describe.each(BOXES)('$id', ({ id, car: carId }) => {
  const box = boxOf(id);
  const model = new TransaxleModel(box);
  const cylindrical = box.meshes.filter((m) => !m.bevel);

  it.each(cylindrical.map((m) => [`${m.a}/${m.b}`, m.a, m.b] as const))('%s: drawn teeth do not overlap in 12 positions, half a pitch off they do', (_name, a, b) => {
    const pitch = (2 * Math.PI) / box.spec.gears.find((g) => g.id === a)!.teeth;
    for (let k = 0; k < 12; k++) {
      model.update(turnGear(box, a, (k / 12) * pitch));
      expect(overlaps(model, a, b), `position ${k}`).toBe(0);
    }
    model.update(turnGear(box, a, 0));
    const mb = model.gearMesh(b)!;
    mb.rotation.z -= Math.PI / box.spec.gears.find((g) => g.id === b)!.teeth;
    expect(overlaps(model, a, b)).toBeGreaterThan(20);
    mb.rotation.z += Math.PI / box.spec.gears.find((g) => g.id === b)!.teeth;
  });

  it('lights the speed pair and the final drive in each gear, the idler too in reverse, nothing in neutral', () => {
    const lit = (state: string) => {
      model.update(poseAt(box, state, 0.3));
      return box.spec.gears.filter((g) => (model.gearMesh(g.id)!.material as THREE.MeshStandardMaterial).emissive.r > 0.1).map((g) => g.id).sort();
    };
    for (const s of box.states.filter((x) => x.kind === 'gear' && x.name !== 'R')) {
      expect(lit(s.name), s.name).toEqual(['final-pinion', 'final-ring', `in-${s.name}`, `out-${s.name}`].sort());
    }
    expect(lit('N')).toEqual([]);
    const reverse = box.spec.gears.filter((g) => g.id.endsWith('-R') || g.id.startsWith('idler-R')).map((g) => g.id);
    expect(lit('R')).toEqual(['final-pinion', 'final-ring', ...reverse].sort());
  });

  it('turns every cylindrical gear by its phase plus its member’s angle', () => {
    const pose = poseAt(box, '2', 1.234);
    model.update(pose);
    for (const g of box.spec.gears.filter((x) => x.cone === undefined)) {
      const mesh = model.gearMesh(g.id)!;
      const world = -(mesh.rotation.z + mesh.parent!.rotation.z);
      const expected = (box.phases[g.id] ?? 0) + pose.angles[box.members.indexOf(g.member)]!;
      expect(Math.abs(Math.atan2(Math.sin(world - expected), Math.cos(world - expected))), g.id).toBeLessThan(1e-9);
    }
  });

  it('stays in the draw budget: at most 60 meshes in every view, 120 thousand triangles on phones', () => {
    const low = new TransaxleModel(box, { quality: 'low' });
    for (const view of ['solid', 'xray', 'mechanism'] as const) {
      model.setView(view);
      low.setView(view);
      expect(model.drawStats().draws, view).toBeLessThanOrEqual(60);
      expect(low.drawStats().triangles, view).toBeLessThanOrEqual(120_000);
    }
    model.setView('xray');
    low.dispose();
  });

  it('tags every part with a key that has a card', () => {
    const keys = new Set<string>();
    model.group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      expect(o.userData.part, o.type).toBeDefined();
      keys.add(o.userData.part as string);
    });
    for (const key of keys) expect(GEARBOX_PARTS[key], key).toBeDefined();
    for (const key of ['gbx-final-drive', 'gbx-diff-case', 'gbx-halfshaft', 'gbx-cv-joint', 'gbx-bellhousing', 'gbx-case']) expect(keys.has(key), key).toBe(true);
  });

  it('turns the wheels forward in the forward gears and back in reverse', () => {
    // The differential's spin axis in the car: d(angle) > 0 turns its group by −angle about its own Z.
    const car = CARS[carId]!;
    const spin = model.memberFrame('diff')!;
    spin.updateMatrixWorld(true);
    const axis = new THREE.Vector3(0, 0, -1).transformDirection(model.mounted.matrixWorld.clone().invert().multiply(spin.matrixWorld));
    const inCar = engineToCar(car.mount, [axis.x, axis.y, axis.z]);
    // Forward rolling turns a wheel about +y (left) of the car, ISO 8855.
    for (const s of box.states.filter((x) => x.kind === 'gear')) {
      const turns = Math.sign(1 / s.ratio!);
      expect(Math.sign(inCar[1]) * turns, s.name).toBe(s.name === 'R' ? -1 : 1);
      expect(Math.abs(inCar[1]), s.name).toBeCloseTo(1, 9);
    }
  });

  it('has views, ghost, highlight, render bands and anchors without a renderer; the bellhousing faces the engine', () => {
    const m: SceneModel<GearboxFrame> & TransaxleModel = new TransaxleModel(box, { quality: 'low' });
    expect([m.anchors, m.setHighlight, m.setGhost, m.setRenderBand].every((f) => typeof f === 'function')).toBe(true);
    for (const view of ['solid', 'xray', 'mechanism'] as const) m.setView(view);
    m.setGhost(0.15);
    m.setHighlight(true);
    m.setFailure('final-ring');
    expect((m.gearMesh('final-ring')!.material as THREE.MeshStandardMaterial).emissive.r).toBeGreaterThan(0.9);
    m.setFailure(null);
    m.setRenderBand(30);
    m.group.traverse((o) => expect(o.renderOrder).toBeGreaterThanOrEqual(30));
    const anchors = m.anchors();
    expect(anchors.bellhousing!.x).toBeCloseTo(0, 9);
    expect(anchors.bellhousing!.z).toBeGreaterThan(anchors.input!.z);
    m.setExplode(1);
    m.dispose();
  });

  it('crown wheel and pinion or helical pair: the final drive is drawn without overlap in 12 positions', () => {
    const pinion = box.spec.gears.find((g) => g.id === 'final-pinion')!;
    if (pinion.cone === undefined) {
      expect(cylindrical.some((m) => m.a === 'final-pinion')).toBe(true);
      return;
    }
    const pitch = (2 * Math.PI) / pinion.teeth;
    for (let k = 0; k < 12; k++) {
      model.update(turnGear(box, 'final-pinion', (k / 12) * pitch));
      expect(bevelOverlaps(model, box), `position ${k}`).toBe(0);
    }
    model.update(turnGear(box, 'final-pinion', 0));
    const ring = model.gearMesh('final-ring')!;
    ring.rotation.z -= Math.PI / box.spec.gears.find((g) => g.id === 'final-ring')!.teeth;
    expect(bevelOverlaps(model, box)).toBeGreaterThan(20);
    ring.rotation.z += Math.PI / box.spec.gears.find((g) => g.id === 'final-ring')!.teeth;
  });
});

/**
 * Every turning part as a solid of revolution round its member's axis, in mm: radial and axial extent in the frame of
 * the member. Merged meshes (hubs, blocker rings) are split where their vertices leave a gap along z. Members on an
 * axis across the shafts (the 911's differential) are left out: their parts do not turn round Z.
 */
function solids(model: TransaxleModel, box: Gearbox) {
  const out: Array<{ member: string; x: number; y: number; part: string; gear?: string; rMin: number; rMax: number; zMin: number; zMax: number }> = [];
  model.group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  for (const def of box.spec.members) {
    const axis = box.spec.axes.find((a) => a.id === def.axis)!;
    if (axis.across !== undefined) continue;
    const frame = model.memberFrame(def.id)!;
    const toFrame = new THREE.Matrix4();
    frame.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const part = o.userData.part as string | undefined;
      if (!mesh.isMesh || !part || part === 'gbx-fork' || part === 'gbx-rail') return;
      toFrame.copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld);
      const pos = mesh.geometry.getAttribute('position');
      const points: Array<[number, number]> = [];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(toFrame);
        points.push([-v.z / MM, Math.hypot(v.x, v.y) / MM]);
      }
      points.sort((p, q) => p[0] - q[0]);
      const merged = part === 'gbx-ta-synchro-hub' || part === 'gbx-blocker-ring';
      let current: (typeof out)[number] | null = null;
      for (const [z, r] of points) {
        if (!current || (merged && z - current.zMax > 1)) {
          current = { member: def.id, x: axis.x, y: axis.y, part, gear: o.userData.gear as string | undefined, rMin: r, rMax: r, zMin: z, zMax: z };
          out.push(current);
        }
        current.zMax = z;
        current.rMin = Math.min(current.rMin, r);
        current.rMax = Math.max(current.rMax, r);
      }
    });
  }
  return out;
}

describe('no part runs into a part of another member', () => {
  it.each(BOXES)('$id, in every state', ({ id }) => {
    const box = boxOf(id);
    const model = new TransaxleModel(box, { quality: 'low' });
    const meshing = new Set(box.meshes.map((m) => [m.a, m.b].sort().join('|')));
    for (const state of box.states) {
      model.update(poseAt(box, state.name, 0));
      const parts = solids(model, box);
      const clashes: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const p = parts[i]!;
          const q = parts[j]!;
          if (p.member === q.member) continue;
          if (Math.min(p.zMax, q.zMax) - Math.max(p.zMin, q.zMin) <= 0.05) continue;
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          let depth: number;
          if (d < 1e-6) depth = Math.min(p.rMax, q.rMax) - Math.max(p.rMin, q.rMin);
          else {
            if (p.gear && q.gear && meshing.has([p.gear, q.gear].sort().join('|'))) continue;
            depth = p.rMax + q.rMax - d;
          }
          if (depth > 0.05) clashes.push(`${p.part} ${p.gear ?? p.member} × ${q.part} ${q.gear ?? q.member}: ${depth.toFixed(1)} mm`);
        }
      }
      expect(clashes, state.name).toEqual([]);
    }
    model.dispose();
  });
});

describe('in the car', () => {
  /** An anchor of the model back in the gearbox frame: mm from the input axis, z behind the front face. */
  const gearboxPoint = (model: TransaxleModel, key: string): GearboxPoint => {
    model.mounted.updateMatrix();
    const p = model.anchors()[key]!.applyMatrix4(model.mounted.matrix.clone().invert());
    return [p.x / MM, p.y / MM, -p.z / MM];
  };

  it.each(BOXES)('$id: the stub ends sit on the car’s inner joints, DriveCar.diffOutputs and its mirror', ({ id, car: carId }) => {
    const car = CARS[carId]!;
    const engine = buildEngine(engineById(car.engine)!);
    const box = boxOf(id);
    const axle = car.drive === 'fwd' ? 'front' : 'rear';
    const left = DRIVE_CARS[carId]!.driveline.diffOutputs[axle]!;
    const frame = transaxleFrame(box.spec);
    const toCar = gearboxToCar(car, engine, frame.bellhousing);
    for (const stubs of [transaxleStubs(car, engine, box.spec, left), undefined]) {
      const model = new TransaxleModel(box, { quality: 'low', ...(stubs ? { stubs } : {}) });
      const ends = ['stub0', 'stub1'].map((k) => toCar(gearboxPoint(model, k)));
      const [l, r] = ends[0]![1] > ends[1]![1] ? [ends[0]!, ends[1]!] : [ends[1]!, ends[0]!];
      // The left joint is the stored one (to its millimetre of rounding), with or without the car's stubs.
      for (let k = 0; k < 3; k++) expect(Math.abs(l[k]! - left[k]!), `left ${k}`).toBeLessThanOrEqual(0.0006);
      if (stubs) for (let k = 0; k < 3; k++) expect(Math.abs(r[k]! - (k === 1 ? -left[k]! : left[k]!)), `right ${k}`).toBeLessThanOrEqual(0.0006);
      model.dispose();
    }
  });

  it.each(BOXES)('$id: stays in the engine bay (a rear engine\'s box only across the car and in height)', ({ id, car: carId }) => {
    // A transverse box ends in the bay, short of the left wheel's inner side as it steers; the 911's reaches forward
    // past its bay under the rear seats, so only its width and height are held.
    const car = CARS[carId]!;
    const engine = buildEngine(engineById(car.engine)!);
    const box = boxOf(id);
    const model = new TransaxleModel(box, { quality: 'low' });
    model.setView('solid');
    const toCar = gearboxToCar(car, engine, transaxleFrame(box.spec).bellhousing);
    const bay = car.packaging!.bay;
    const axes = car.mount.axis === 'transverse' ? [0, 1, 2] : [1, 2];
    model.group.updateMatrixWorld(true);
    const toMounted = model.mounted.matrixWorld.clone().invert();
    const v = new THREE.Vector3();
    const outside: string[] = [];
    model.group.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = toMounted.clone().multiply(mesh.matrixWorld);
      const pos = mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const p = toCar([v.x / MM, v.y / MM, -v.z / MM]);
        for (const k of axes) {
          if (p[k]! < bay.min[k]! || p[k]! > bay.max[k]!) outside.push(`${o.userData.part as string} ${'xyz'[k]} ${p[k]!.toFixed(3)}`);
        }
      }
    });
    expect([...new Set(outside)].slice(0, 5)).toEqual([]);
    model.dispose();
  });

  it.each(BOXES)('$id: the bellhousing meets the back of the engine block on the crank axis', ({ id, car: carId }) => {
    const car = CARS[carId]!;
    const engine = buildEngine(engineById(car.engine)!);
    const box = boxOf(id);
    const model = new TransaxleModel(box, { quality: 'low' });
    const bell = gearboxPoint(model, 'bellhousing');
    expect(bell[2]).toBeCloseTo(transaxleFrame(box.spec).bellhousing, 9);
    const p = gearboxToCar(car, engine, transaxleFrame(box.spec).bellhousing)(bell);
    const crank = car.packaging!.crankFront;
    const expected = engineToCar(car.mount, [0, 0, (blockBackZMm(engine) - crankFrontZMm(engine)) / 1000]);
    for (let k = 0; k < 3; k++) expect(p[k]).toBeCloseTo(crank[k]! + expected[k]!, 9);
    model.dispose();
  });
});
