// The MacPherson corner as the 3D draws it, without WebGL: every part of the full corner with its card, what each
// view shows, a cast knuckle that is not convex, links that never stretch over the travel, and a tyre pressed onto
// exactly the road that is drawn, so a bump never passes through it.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { factorySetup, resolveCorner } from '../src/suspension/setup.ts';
import { QuarterSim } from '../src/suspension/quarter.ts';
import { EventRoad, RoadBuffer } from '../src/suspension/road.ts';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import type { Vec3 } from '../src/suspension/spec.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const { CornerModel, cornerFrame, frameFromQuarter, springWireM } = await import('../src/scene/suspension/corner-model.ts');
const { SUSPENSION_PARTS } = await import('../src/scene/suspension/parts.ts');
const { pressPoint, roadHeightAt, ROAD_SAMPLES } = await import('../src/scene/suspension/tyre-press.ts');

const corner = jtektCorner();
const resolved = resolveCorner(corner, factorySetup(corner));
const spec = resolved.axle.spec;
const scene = (p: ArrayLike<number>): THREE.Vector3 => new THREE.Vector3(p[1]! * 10, p[2]! * 10, p[0]! * 10);
const knucklePoint = (pose: Float64Array, k: Vec3): THREE.Vector3 => {
  const out = [0, 0, 0];
  resolved.axle.knucklePoint(pose, k, out);
  return scene(out);
};

/** Part keys of everything that is shown (and could be clicked) in the model. */
function shownKeys(root: THREE.Object3D): Set<string> {
  const keys = new Set<string>();
  root.traverse((o) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    if (o.userData.part) keys.add(o.userData.part as string);
    for (const k of (o.userData.instanceParts as string[] | undefined) ?? []) keys.add(k);
  });
  return keys;
}

const partOf = (model: InstanceType<typeof CornerModel>, key: string): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  model.group.traverse((o) => {
    if (o.userData.part === key && (o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};

const visible = (o: THREE.Object3D): boolean => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

/**
 * Draw calls of a frame: every shown mesh, line and sprite in the main pass, and every shown mesh that casts a shadow
 * once more in the key light's shadow pass (the stage and the viewer have one such light). No material here is both
 * transparent and two-sided, which three.js would draw twice.
 */
function drawCalls(root: THREE.Object3D): { main: number; shadow: number } {
  let main = 0;
  let shadow = 0;
  root.traverse((o) => {
    const any = o as THREE.Mesh & THREE.Line & THREE.Sprite;
    if (!(any.isMesh || any.isLine || any.isSprite) || !visible(o)) return;
    main++;
    if (any.isMesh && o.castShadow) shadow++;
    const materials = [any.material].flat() as THREE.Material[];
    expect(materials.some((m) => m.transparent && m.side === THREE.DoubleSide), 'a two-pass material').toBe(false);
  });
  return { main, shadow };
}

const FULL_CORNER = [
  'susp.knuckle', 'susp.lower-arm', 'susp.bush', 'susp.ball-joint', 'susp.strut', 'susp.damper-rod', 'susp.spring',
  'susp.bump-stop', 'susp.top-mount', 'susp.tie-rod', 'susp.rack', 'susp.hub', 'susp.brake-disc', 'susp.caliper',
  'susp.wheel', 'susp.tyre', 'susp.halfshaft', 'susp.cv-inner', 'susp.cv-outer', 'susp.cv-boot', 'susp.body',
  'susp.subframe', 'susp.road',
];

describe('MacPherson corner in 3D', () => {
  it('has the full corner, and a card for every part', () => {
    const model = new CornerModel(resolved);
    const all = new Set<string>();
    model.group.traverse((o) => {
      if (o.userData.part) all.add(o.userData.part as string);
      for (const k of (o.userData.instanceParts as string[] | undefined) ?? []) all.add(k);
    });
    for (const key of FULL_CORNER) expect(shownKeys(model.group), key).toContain(key);
    for (const key of all) expect(SUSPENSION_PARTS[key], key).toBeDefined();
    for (const key of Object.keys(SUSPENSION_PARTS)) expect(key.startsWith('susp.'), key).toBe(true);
    model.dispose();
  });

  it('shows the damper piston, its oil and the tripod rollers through glass in the X-ray only', () => {
    const model = new CornerModel(resolved);
    const inner = ['susp.damper-piston', 'susp.damper-oil'];
    for (const key of inner) expect(partOf(model, key).some(visible), `${key} hidden in the solid view`).toBe(false);
    model.setView('xray');
    for (const key of inner) expect(partOf(model, key).some(visible), key).toBe(true);
    // The rollers are the spider's mesh: shown, solid, inside a glass tulip.
    const spider = model.halfshaft!.spider;
    expect(visible(spider)).toBe(true);
    expect((spider.material as THREE.Material).transparent).toBe(false);
    // Shells turn to glass (the wheel's nuts stay solid, so its rim is enough).
    for (const glass of ['susp.strut', 'susp.tyre', 'susp.wheel', 'susp.body']) {
      expect(partOf(model, glass).some((mesh) => (mesh.material as THREE.Material).transparent), glass).toBe(true);
    }
    expect((model.halfshaft!.tulip.material as THREE.Material).transparent).toBe(true);
    // Glass that lost its shader on a clone would be a plain opaque-looking material: every glass here keeps it.
    for (const mesh of [model.halfshaft!.tulip, ...partOf(model, 'susp.strut')]) {
      expect((mesh.material as THREE.Material).customProgramCacheKey()).toMatch(/^glass-/);
    }
    model.dispose();
  });

  it('leaves only what moves in «Механізм», with joints and links drawn thin', () => {
    const model = new CornerModel(resolved);
    model.setView('mechanism');
    const keys = shownKeys(model.group);
    for (const gone of ['susp.tyre', 'susp.wheel', 'susp.body', 'susp.subframe', 'susp.brake-disc', 'susp.caliper']) expect(keys, gone).not.toContain(gone);
    for (const kept of ['susp.knuckle', 'susp.lower-arm', 'susp.tie-rod', 'susp.ball-joint', 'susp.spring', 'susp.strut']) expect(keys, kept).toContain(kept);
    // Links are the schematic's thin bars there, not their solid meshes.
    for (const solid of ['susp.lower-arm', 'susp.tie-rod', 'susp.strut', 'susp.halfshaft']) expect(partOf(model, solid).some(visible), solid).toBe(false);
    model.dispose();
  });

  it('stays within the corner budget of 60 draw calls in every view, shadows included', () => {
    const model = new CornerModel(resolved);
    for (const view of ['solid', 'xray', 'mechanism'] as const) {
      model.setView(view);
      const { main, shadow } = drawCalls(model.group);
      expect(main + shadow, view).toBeLessThanOrEqual(60);
    }
    model.dispose();
  });

  it('casts a knuckle that is not convex', () => {
    const model = new CornerModel(resolved);
    const knuckle = partOf(model, 'susp.knuckle')[0]!;
    expect(partOf(model, 'susp.knuckle')).toHaveLength(1);
    model.group.updateMatrixWorld(true);
    // A point among the ends the arms reach (strut clamp, ball joint, steering arm): inside the hull of the casting.
    const ends = [spec.linkage.strut!.lower, spec.linkage.wishbones[0]!.ball, spec.linkage.rods[0]!.knuckle].map((p) => knucklePoint(model.pose, p));
    const probe = ends.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(ends.length);
    // A solid holding the probe stops every ray from it; a casting with empty room between its arms lets some out.
    const solid = new THREE.Mesh(knuckle.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    solid.matrixWorld.copy(knuckle.matrixWorld);
    const ray = new THREE.Raycaster();
    let escaped = 0;
    let total = 0;
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 6; j++) {
        const theta = (i / 12) * Math.PI * 2;
        const phi = ((j + 0.5) / 6) * Math.PI;
        ray.set(probe, new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)));
        total++;
        if (ray.intersectObject(solid, false).length === 0) escaped++;
      }
    }
    expect(escaped).toBeGreaterThan(total / 4);
    // And every end it holds is inside its own boss: the casting does reach them.
    for (const end of ends) {
      ray.set(end, new THREE.Vector3(0, 1, 0));
      expect(ray.intersectObject(solid, false).length, 'an end outside the casting').toBeGreaterThan(0);
    }
    model.dispose();
  });

  it('never stretches a link over the whole travel, steered or not', () => {
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const table = resolved.axle.table;
    const tol = 1e-5; // scene units: 1e-6 m
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const strut = spec.linkage.strut!;
    const rod = spec.linkage.rods[0]!;
    const top = scene(strut.top);
    let checked = 0;
    for (const rack of [-0.03, 0, 0.03]) {
      for (let i = 0; i < table.n; i += 3) {
        frame.travel = table.travel0 + i * table.step;
        frame.rack = rack;
        model.update(frame);
        model.group.updateMatrixWorld(true);
        const pose = model.pose;
        for (const link of model.links) {
          a.copy(link.bodyEnd).applyMatrix4(link.object.matrixWorld);
          b.copy(link.knuckleEnd).applyMatrix4(link.object.matrixWorld);
          const body = link.name === 'tie-rod' ? scene([rod.body[0], rod.body[1] + rack, rod.body[2]]) : scene(link.name.endsWith('front') ? spec.linkage.wishbones[0]!.front : spec.linkage.wishbones[0]!.rear);
          const knuckleEnd = knucklePoint(pose, link.name === 'tie-rod' ? rod.knuckle : spec.linkage.wishbones[0]!.ball);
          expect(a.distanceTo(body), `${link.name} body end at ${frame.travel}`).toBeLessThan(tol);
          expect(b.distanceTo(knuckleEnd), `${link.name} knuckle end at ${frame.travel}`).toBeLessThan(tol);
        }
        // The strut's rod hangs from the top mount through the knuckle's strut point, and the tube on the knuckle
        // points at the top mount.
        const strutTop = model.group.getObjectByName('strut-top')!;
        const origin = new THREE.Vector3().applyMatrix4(strutTop.matrixWorld);
        const down = new THREE.Vector3(0, -1, 0).transformDirection(strutTop.matrixWorld);
        expect(origin.distanceTo(top)).toBeLessThan(tol);
        const lower = knucklePoint(pose, strut.lower);
        const off = lower.clone().sub(origin);
        expect(off.clone().addScaledVector(down, -off.dot(down)).length(), 'rod off the strut axis').toBeLessThan(tol);
        // The halfshaft is rigid, and it ends at the hub's joint.
        const hs = model.halfshaft!;
        hs.shaftEnds(a, b);
        expect(b.distanceTo(knucklePoint(pose, spec.halfshaft!.outerJoint))).toBeLessThan(tol);
        expect(Math.abs(a.distanceTo(b) - hs.length)).toBeLessThan(tol);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    model.dispose();
  });

  it('keeps a highlight on every part, and the red marks right once it goes', () => {
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const stop = model.materials.bumpStop;
    const joint = model.halfshaft!.tulip.material as THREE.MeshStandardMaterial;
    // Deep in bump the stop is squeezed past a fifth of its length and glows red.
    frame.travel = 0.12;
    model.update(frame);
    expect(model.bumpStopSqueeze).toBeGreaterThan(0.2);
    expect(stop.emissive.getHexString()).toBe('ff2a10');
    model.setHighlight(true);
    model.update(frame);
    // The shaft's joints keep the highlight frame after frame, as everything else does.
    expect(joint.emissive.getHexString()).toBe('ffb35c');
    // Back to rest under the highlight, then the highlight goes: the stop is not red any more.
    frame.travel = 0;
    model.update(frame);
    model.setHighlight(false);
    model.update(frame);
    expect(stop.emissive.getHexString()).toBe('000000');
    expect(joint.emissive.getHexString()).toBe('000000');
    model.dispose();
  });

  it('ghosts the materials of both views, so a view change keeps the ghost', () => {
    const model = new CornerModel(resolved);
    model.setView('xray');
    model.setGhost(0.3);
    model.setView('solid');
    for (const mesh of [model.halfshaft!.tulip, model.halfshaft!.bell, ...partOf(model, 'susp.wheel')]) {
      expect((mesh.material as THREE.Material).opacity, mesh.userData.part as string).toBeCloseTo(0.3, 9);
    }
    model.dispose();
  });

  it('sizes the coil wire from the spring rate', () => {
    // k = G·d⁴/(8·D³·n): 25 N/mm on a 120 mm coil with 4.5 active turns takes 11.8 mm wire, and four times the rate
    // takes √2 times the wire.
    expect(springWireM(25000)).toBeCloseTo(0.0118, 4);
    expect(springWireM(100000) / springWireM(25000)).toBeCloseTo(Math.SQRT2, 6);
  });
});

describe('the tyre on the road', () => {
  const bump = new EventRoad([{ kind: 'bump', atM: 5, lengthM: 0.5, heightM: 0.05 }]);
  const x0 = spec.wheelCentre[0];

  it('reads the drawn profile under the whole tyre into its uniforms', () => {
    const model = new CornerModel(resolved, bump);
    const frame = cornerFrame();
    frame.roadX = 5.2;
    frame.travel = 0.03;
    model.update(frame);
    const u = model.press;
    const radius = resolved.tyre.freeRadiusM * 10;
    const centreZ = model.anchors().wheelCentre!.z;
    expect(u.uRoadZ0.value).toBeLessThan(centreZ - radius);
    expect(u.uRoadZ0.value + (ROAD_SAMPLES - 1) * u.uRoadDz.value).toBeGreaterThan(centreZ + radius);
    for (let i = 0; i < ROAD_SAMPLES; i++) {
      const z = u.uRoadZ0.value + i * u.uRoadDz.value;
      expect(u.uRoadH.value[i]).toBeCloseTo(bump.heightAt(frame.roadX + z / 10 - x0) * 10, 5);
    }
    // The matrices take the tyre's own vertices to the model's frame and back.
    model.group.updateMatrixWorld(true);
    const v = new THREE.Vector3(1, 2, 3);
    const viaWorld = v.clone().applyMatrix4(model.tyre.matrixWorld).applyMatrix4(model.group.matrixWorld.clone().invert());
    expect(v.clone().applyMatrix4(u.uRoadFromLocal.value).distanceTo(viaWorld)).toBeLessThan(1e-9);
    expect(v.clone().applyMatrix4(u.uRoadFromLocal.value).applyMatrix4(u.uLocalFromRoad.value).distanceTo(v)).toBeLessThan(1e-9);
    model.dispose();
  });

  /** Height of the strip's top as drawn (straight between its columns) at scene Z. */
  const drawnTop = (model: InstanceType<typeof CornerModel>, z: number): number => {
    const top = model.road.mesh.geometry.getAttribute('position');
    const columns = top.count / 6;
    const z0 = top.getZ(2);
    const dz = (top.getZ(6 * (columns - 1) + 2) - z0) / (columns - 1);
    const u = (z - z0) / dz;
    const i = Math.max(0, Math.min(columns - 2, Math.floor(u)));
    const a = top.getY(6 * i + 2);
    return a + (top.getY(6 * i + 8) - a) * (u - i);
  };

  const SCENES = {
    bump,
    kerb: new EventRoad([
      { kind: 'step', atM: 5, heightM: 0.1 },
      { kind: 'step', atM: 8, heightM: -0.1 },
    ]),
    pothole: new EventRoad([{ kind: 'pothole', atM: 5, lengthM: 0.2, depthM: 0.06 }]),
  };

  it.each([
    ['bump', 6.2],
    ['kerb', 8.6],
    ['pothole', 6.2],
  ] as const)('never lets the %s through the tyre, and never hangs it over the road it stands on', (name, until) => {
    const road = SCENES[name];
    const model = new CornerModel(resolved, road);
    const sim = new QuarterSim(resolved, new RoadBuffer(road, resolved.tyre.freeRadiusM, resolved.tyre.patchM), 30 / 3.6);
    sim.reset(4.3);
    const frame = cornerFrame();
    const positions = model.tyre.geometry.getAttribute('position');
    const local = new THREE.Vector3();
    const out = new THREE.Vector3();
    let throughDrawn = 0;
    let offProfile = 0;
    let frames = 0;
    let loaded = 0;
    while (sim.x < until) {
      for (let k = 0; k < 4; k++) sim.step();
      frameFromQuarter(sim.observe(), frame);
      model.update(frame);
      let pressed = 0;
      for (let i = 0; i < positions.count; i += 2) {
        local.fromBufferAttribute(positions, i);
        if (pressPoint(model.press, local, out)) pressed++;
        // The strip as it is drawn: a kerb's edge is a 2 cm ramp there, and the tread must not dip under it.
        throughDrawn = Math.max(throughDrawn, drawnTop(model, out.z) - out.y);
        // And the exact profile, where it is smooth.
        if (name === 'bump') offProfile = Math.max(offProfile, road.heightAt(frame.roadX + out.z / 10 - x0) * 10 - out.y);
      }
      if (frame.tyreN > 0.2 * (resolved.sprungKg + resolved.unsprungKg) * 9.81) {
        loaded++;
        expect(pressed, `tyre over the road at x = ${frame.roadX.toFixed(3)} m`).toBeGreaterThan(0);
      }
      frames++;
    }
    expect(frames).toBeGreaterThan(50);
    expect(loaded).toBeGreaterThan(frames / 2);
    // Read at the strip's own columns, the press lies on the drawn top to float precision (scene units: 0.01 mm).
    expect(throughDrawn).toBeLessThan(1e-4);
    // Columns 2 cm apart follow a 0.5 m cosine bump to a fraction of a millimetre.
    expect(offProfile).toBeLessThan(0.005);
    expect(roadHeightAt(model.press, model.press.uRoadZ0.value)).toBeCloseTo(model.press.uRoadH.value[0]!, 9);
    model.dispose();
  });

  it('presses nothing once the wheel is pulled off its hub', () => {
    const model = new CornerModel(resolved, bump);
    model.setExplode(1);
    const positions = model.tyre.geometry.getAttribute('position');
    const local = new THREE.Vector3();
    const out = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) expect(pressPoint(model.press, local.fromBufferAttribute(positions, i), out)).toBe(false);
    model.dispose();
  });
});
