// The gearbox in 3D (stage K1b-3d): drawn gears that mesh without overlapping, the power path, the draw budget, and
// boxes with fewer or more speeds. Geometry is checked on the BufferGeometry actually drawn, placed by the model.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { layshaftSpec, type LayshaftDesc } from '../src/drivetrain/layouts/layshaft.ts';
import { withSpeedCount } from '../src/drivetrain/layouts/layshaft-speeds.ts';
import { poseAt } from '../src/drivetrain/table-drive.ts';
import { buildGearbox, type Gearbox } from '../src/drivetrain/topology.ts';
import { buildGearGeometry, DETAIL, faceTwist, drawnGear, layerCount, type GearLayer } from '../src/scene/gearbox/gear-mesh.ts';
import { GearboxModel, type GearboxFrame } from '../src/scene/gearbox/gearbox-model.ts';
import { acquireGeometry, geometryCacheStats, releaseGeometry } from '../src/scene/gearbox/geometry-cache.ts';
import { GEARBOX_PARTS } from '../src/scene/gearbox/parts.ts';
import type { ViewMode } from '../src/scene/model-types.ts';

// The cast aluminium's bump map is drawn on a canvas, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

/**
 * SceneModel<F> of the whole-car plan («Stage для всіх розділів»), verbatim, until O2b puts it in model-types.ts. The
 * model implements it structurally, and tsc checks the assignment in the test below, so the two cannot drift apart.
 */
interface PlannedSceneModel<F> {
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

const e30Record = gearboxById('manual-rwd')!;
const e30Desc = e30Record.layout.desc as LayshaftDesc;
const e30 = buildGearbox(gearboxSpec(e30Record));

/** The section of a drawn gear at world z: its outline in world x, y, between the two layers around z. */
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

/** Crossing test: is the point inside the polygon. */
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
function overlaps(model: GearboxModel, gearA: string, gearB: string): number {
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

/** Member angles that turn gear `id` by `turn` rad, everything else following through the permanent meshes. */
function turnGear(box: Gearbox, id: string, turn: number) {
  const member = box.spec.gears.find((g) => g.id === id)!.member;
  const speed = box.P[box.members.indexOf(member)]![box.basis.indexOf(box.spec.input)]!;
  return poseAt(box, 'N', turn / speed);
}

describe('drawn gears mesh without overlapping (gear-geometry 1 on the 3D)', () => {
  const model = new GearboxModel(e30);
  it.each(e30.meshes.map((m) => [`${m.a}/${m.b}`, m.a, m.b] as const))('BMW M3 E30 %s: none in 12 positions, half a pitch off many', (_name, a, b) => {
    const teeth = e30.spec.gears.find((g) => g.id === a)!.teeth;
    const pitch = (2 * Math.PI) / teeth;
    for (let k = 0; k < 12; k++) {
      model.update(turnGear(e30, a, (k / 12) * pitch));
      expect(overlaps(model, a, b), `position ${k}`).toBe(0);
    }
    // Half a pitch of B off: the check must see it.
    model.update(turnGear(e30, a, 0));
    const mb = model.gearMesh(b)!;
    const teethB = e30.spec.gears.find((g) => g.id === b)!.teeth;
    mb.rotation.z -= Math.PI / teethB;
    expect(overlaps(model, a, b)).toBeGreaterThan(20);
    mb.rotation.z += Math.PI / teethB;
  });

  it('the pairs added for a sixth and seventh speed mesh too', () => {
    const box = buildGearbox(layshaftSpec(withSpeedCount(e30Desc, 7)));
    const m = new GearboxModel(box);
    for (const speed of [6, 7]) {
      const pitch = (2 * Math.PI) / box.spec.gears.find((g) => g.id === `counter-${speed}`)!.teeth;
      for (let k = 0; k < 12; k += 3) {
        m.update(turnGear(box, `counter-${speed}`, (k / 12) * pitch));
        expect(overlaps(m, `counter-${speed}`, `main-${speed}`), `speed ${speed}, position ${k}`).toBe(0);
      }
    }
    m.dispose();
  });
});

/**
 * Every turning part as a solid of revolution round its member's axis: radial and axial extent in mm, in the frame
 * of the member. Merged meshes (all hubs, all blocker rings) are split where their vertices leave a gap along z.
 */
function solids(model: GearboxModel, box: Gearbox) {
  const out: Array<{ member: string; x: number; y: number; part: string; gear?: string; rMin: number; rMax: number; zMin: number; zMax: number }> = [];
  model.group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  for (const def of box.spec.members) {
    const frame = model.memberFrame(def.id)!;
    const axis = box.spec.axes.find((a) => a.id === def.axis)!;
    const toFrame = new THREE.Matrix4();
    frame.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const part = o.userData.part as string | undefined;
      // Forks and rails stand above the shafts; the case is checked by the hull it is built from.
      if (!mesh.isMesh || !part || part === 'gbx-fork' || part === 'gbx-rail') return;
      toFrame.copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld);
      const pos = mesh.geometry.getAttribute('position');
      const points: Array<[number, number]> = [];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(toFrame);
        points.push([-v.z / 0.01, Math.hypot(v.x, v.y) / 0.01]);
      }
      points.sort((p, q) => p[0] - q[0]);
      const merged = part === 'gbx-synchro-hub' || part === 'gbx-blocker-ring';
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
  // Teeth in mesh are checked tooth by tooth above. The input shaft's end runs in a pilot bearing inside the output
  // shaft's front, drawn as two overlapping cylinders hidden in the input gear.
  it.each([4, 5, 6, 7])('%i speeds, in every state', (count) => {
    const box = buildGearbox(layshaftSpec(withSpeedCount(e30Desc, count)));
    const model = new GearboxModel(box);
    const meshing = new Set(box.meshes.map((m) => [m.a, m.b].sort().join('|')));
    const pilot = new Set([box.spec.input, box.spec.output]);
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
          if (d < 1e-6) {
            if (pilot.has(p.member) && pilot.has(q.member) && [p.part, q.part].sort().join() === 'gbx-input,gbx-mainshaft') continue;
            depth = Math.min(p.rMax, q.rMax) - Math.max(p.rMin, q.rMin);
          } else {
            if (p.gear && q.gear && meshing.has([p.gear, q.gear].sort().join('|'))) continue;
            depth = p.rMax + q.rMax - d;
          }
          if (depth > 0.05) clashes.push(`${p.part} ${p.gear ?? p.member} × ${q.part} ${q.gear ?? q.member}: ${depth.toFixed(1)} mm`);
        }
      }
      expect(clashes, `${count} speeds, ${state.name}`).toEqual([]);
    }
    model.dispose();
  });
});

describe('gear mesh', () => {
  const shape = { teeth: 20, module: 2.25, helix: 30.85, pressureAngle: 20, shift: 0, faceWidth: 24, boreRadius: 0 };

  it('has 20–28 outline points per tooth and no layer turning more than its step', () => {
    const geometry = buildGearGeometry(shape);
    const layers = geometry.userData.layers as GearLayer[];
    const g = drawnGear(shape);
    expect(layers.length).toBe(layerCount(g));
    expect(Math.abs(faceTwist(g)) / (layers.length - 1)).toBeLessThanOrEqual((DETAIL.high.maxStepDeg * Math.PI) / 180 + 1e-9);
    const distinct = new Set<string>();
    const pos = geometry.getAttribute('position');
    for (let i = layers[0]!.start; i < layers[0]!.start + layers[0]!.count; i++) distinct.add(`${pos.getX(i).toFixed(7)},${pos.getY(i).toFixed(7)}`);
    expect(distinct.size / shape.teeth).toBeGreaterThanOrEqual(20);
    expect(distinct.size / shape.teeth).toBeLessThanOrEqual(28);
  });

  it('a spur gear has two layers', () => {
    expect((buildGearGeometry({ ...shape, helix: 0 }).userData.layers as GearLayer[]).length).toBe(2);
  });

  it('is closed and wound outward: its signed volume is the section area times the width', () => {
    const bore = 8;
    const geometry = buildGearGeometry({ ...shape, boreRadius: bore });
    const pos = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.index!;
    let volume = 0;
    let disagree = 0;
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let f = 0; f < index.count; f += 3) {
      a.fromBufferAttribute(pos, index.getX(f));
      b.fromBufferAttribute(pos, index.getX(f + 1));
      c.fromBufferAttribute(pos, index.getX(f + 2));
      volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
      // The smoothed vertex normals never point against their face.
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (n.lengthSq() > 1e-20 && new THREE.Vector3().fromBufferAttribute(normal, index.getX(f)).dot(n) < 0) disagree++;
    }
    // The section of the front layer, minus the bore, times the face width (scene units).
    const layer = (geometry.userData.layers as GearLayer[])[0]!;
    let area = 0;
    for (let i = 0; i < layer.count; i++) {
      const j = (i + 1) % layer.count;
      area += pos.getX(layer.start + i) * pos.getY(layer.start + j) - pos.getX(layer.start + j) * pos.getY(layer.start + i);
    }
    const segments = 40;
    const boreArea = (segments / 2) * (bore * 0.01) ** 2 * Math.sin((2 * Math.PI) / segments);
    const expected = (Math.abs(area) / 2 - boreArea) * shape.faceWidth * 0.01;
    expect(volume).toBeGreaterThan(0);
    expect(Math.abs(volume / expected - 1)).toBeLessThan(0.005);
    expect(disagree).toBe(0);
  });

  it('a bore through the root circle is refused', () => {
    expect(() => buildGearGeometry({ ...shape, boreRadius: 25 })).toThrow(/root circle/);
  });
});

describe('the model', () => {
  it('stays in the draw budget: at most 60 meshes and 120 thousand triangles (gearboxes plan, «Бюджет»)', () => {
    const model = new GearboxModel(e30);
    for (const view of ['solid', 'xray', 'mechanism'] as const) {
      model.setView(view);
      const { draws, triangles } = model.drawStats();
      expect(draws, view).toBeLessThanOrEqual(60);
      expect(triangles, view).toBeLessThanOrEqual(120_000);
    }
    const low = new GearboxModel(e30, { quality: 'low' });
    expect(low.drawStats().triangles).toBeLessThan(0.75 * model.drawStats().triangles);
    model.dispose();
    low.dispose();
  });

  it('every 4–6 speed box of the settings panel keeps to 60 meshes, and to 120 thousand triangles on phones', () => {
    for (const count of [4, 5, 6]) {
      const box = buildGearbox(layshaftSpec(withSpeedCount(e30Desc, count)));
      const high = new GearboxModel(box);
      const low = new GearboxModel(box, { quality: 'low' });
      high.setView('solid');
      low.setView('solid');
      expect(high.drawStats().draws, `${count} speeds`).toBeLessThanOrEqual(60);
      expect(low.drawStats().triangles, `${count} speeds`).toBeLessThanOrEqual(120_000);
      high.dispose();
      low.dispose();
    }
  });

  it.each([4, 5, 6])('builds a box with %i speeds, its case as long as its gear stack', (count) => {
    const desc = withSpeedCount(e30Desc, count);
    const box = buildGearbox(layshaftSpec(desc));
    expect(box.states.filter((s) => s.kind === 'gear' && s.ratio! > 0)).toHaveLength(count);
    const model = new GearboxModel(box);
    model.group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.4);
    for (const g of box.spec.gears) expect(model.gearMesh(g.id), g.id).toBeDefined();
    model.dispose();
  });

  it('a box with 4, 5 and 6 speed pairs builds', () => {
    for (const [count, pairs] of [[4, 4], [6, 5], [7, 6]] as const) {
      const desc = withSpeedCount(e30Desc, count);
      expect(desc.speeds.filter((s) => s !== 'direct')).toHaveLength(pairs);
      expect(() => new GearboxModel(buildGearbox(layshaftSpec(desc))).dispose()).not.toThrow();
    }
  });

  it('a longer box has a longer case', () => {
    const length = (count: number) => {
      const model = new GearboxModel(buildGearbox(layshaftSpec(withSpeedCount(e30Desc, count))));
      model.group.updateMatrixWorld(true);
      const z = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()).z;
      model.dispose();
      return z;
    };
    expect(length(6)).toBeGreaterThan(length(5) + 0.1);
  });

  it('rebuilding after one pair changed builds only that pair, the rest comes from the cache', () => {
    const first = new GearboxModel(e30);
    first.dispose();
    const second: LayshaftDesc = { ...e30Desc, speeds: e30Desc.speeds.map((s, i) => (i === 1 && s !== 'direct' ? { ...s, teeth: [34, 44] as [number, number] } : s)) };
    const built = geometryCacheStats.built;
    const reused = geometryCacheStats.reused;
    const model = new GearboxModel(buildGearbox(layshaftSpec(second)));
    expect(geometryCacheStats.built - built).toBe(2);
    expect(geometryCacheStats.reused - reused).toBe(e30.spec.gears.length - 2);
    model.dispose();
  });

  it('a geometry released twice is not evicted once it is in use again', () => {
    const geometry = acquireGeometry('test-twice', () => new THREE.BufferGeometry());
    let evicted = false;
    geometry.addEventListener('dispose', () => (evicted = true));
    releaseGeometry(geometry);
    releaseGeometry(geometry);
    expect(acquireGeometry('test-twice', () => new THREE.BufferGeometry())).toBe(geometry);
    // More idle keys than the cache keeps, so a stale key queued by the second release would come out now.
    for (let i = 0; i < 120; i++) releaseGeometry(acquireGeometry(`test-churn-a${i}`, () => new THREE.BufferGeometry()));
    expect(evicted).toBe(false);
    releaseGeometry(geometry);
  });

  it('a model disposed twice gives its geometry back once', () => {
    // Phone quality: every other model of that quality in this file is disposed, so these users are ours alone.
    const first = new GearboxModel(e30, { quality: 'low' });
    const second = new GearboxModel(e30, { quality: 'low' });
    first.dispose();
    first.dispose();
    const evicted: string[] = [];
    for (const g of e30.spec.gears) second.gearMesh(g.id)!.geometry.addEventListener('dispose', () => evicted.push(g.id));
    for (let i = 0; i < 120; i++) releaseGeometry(acquireGeometry(`test-churn-b${i}`, () => new THREE.BufferGeometry()));
    expect(evicted).toEqual([]);
    second.dispose();
  });

  it('tags every part with a key that has a card', () => {
    const model = new GearboxModel(e30);
    const keys = new Set<string>();
    model.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        expect(o.userData.part, o.type).toBeDefined();
        keys.add(o.userData.part as string);
      }
    });
    for (const key of keys) {
      expect(key).toMatch(/^gbx-/);
      expect(GEARBOX_PARTS[key], key).toBeDefined();
    }
    model.dispose();
  });

  it('first gear lights two pairs, direct fifth none, reverse three meshes', () => {
    const model = new GearboxModel(e30);
    const lit = (state: string) => {
      model.update(poseAt(e30, state, 0.3));
      return e30.spec.gears.filter((g) => (model.gearMesh(g.id)!.material as THREE.MeshStandardMaterial).emissive.r > 0.1).map((g) => g.id).sort();
    };
    expect(lit('1')).toEqual(['counter-1', 'counter-main', 'input-main', 'main-1']);
    expect(lit('5')).toEqual([]);
    expect(lit('N')).toEqual([]);
    expect(lit('R')).toEqual(['counter-R', 'counter-main', 'idler-R', 'input-main', 'main-R']);
    model.dispose();
  });

  it('a gear turns with its member and its phase: angle = phase + member angle', () => {
    const model = new GearboxModel(e30);
    const pose = poseAt(e30, '2', 1.234);
    model.update(pose);
    for (const g of e30.spec.gears) {
      const mesh = model.gearMesh(g.id)!;
      const member = e30.members.indexOf(g.member);
      const world = -(mesh.rotation.z + mesh.parent!.rotation.z);
      const expected = (e30.phases[g.id] ?? 0) + pose.angles[member]!;
      const diff = Math.atan2(Math.sin(world - expected), Math.cos(world - expected));
      expect(Math.abs(diff), g.id).toBeLessThan(1e-9);
    }
    model.dispose();
  });

  it('views, ghost, highlight, render bands and anchors work without a renderer', () => {
    const model: PlannedSceneModel<GearboxFrame> & GearboxModel = new GearboxModel(e30);
    // The overview needs all three of the plan's optional methods from the gearbox (gearboxes plan, change 6).
    expect([model.anchors, model.setHighlight, model.setGhost, model.setRenderBand].every((f) => typeof f === 'function')).toBe(true);
    model.setView('solid');
    model.setView('mechanism');
    model.setGhost(0.15);
    model.setHighlight(true);
    model.setFailure('main-2');
    expect((model.gearMesh('main-2')!.material as THREE.MeshStandardMaterial).emissive.r).toBeGreaterThan(0.9);
    model.setFailure(null);
    model.setRenderBand(20);
    model.group.traverse((o) => expect(o.renderOrder).toBeGreaterThanOrEqual(20));
    model.setExplode(1);
    const anchors = model.anchors();
    // The bellhousing faces the engine (+Z), the output flange the other way, both on the input axis.
    expect(anchors.bellhousing!.z).toBeGreaterThan(anchors.output!.z + 0.4);
    expect(anchors.bellhousing!.x).toBeCloseTo(0, 9);
    model.dispose();
  });
});
