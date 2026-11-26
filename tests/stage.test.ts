// The stage's pure parts in Node (the plan of the whole car, «Stage для всіх розділів»): the bounds framing sees, what a
// ray hit names, the framing distance, camera moves between views, and the resolution that drops on a slow machine and
// comes back on a fast one.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraMove, ease, fitDistance, presetDirection, type FrameView } from '../src/scene/camera-moves.ts';
import { fitBox, partKeyOf, systemOf } from '../src/scene/stage.ts';
import { FAST_SECONDS_TO_RAISE, QUALITY_BEST, QUALITY_LEAST, QualityGovernor, SLOW_FRAMES_TO_DROP } from '../src/scene/stage-quality.ts';

/** A ray hit with only what partKeyOf reads. */
const hit = (fields: Partial<THREE.Intersection>): THREE.Intersection => ({ distance: 1, point: new THREE.Vector3(), ...fields }) as THREE.Intersection;

const box = (size: number, x = 0): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  mesh.position.x = x;
  return mesh;
};

describe('fitBox', () => {
  it('leaves out what is marked noFit, and puts it back', () => {
    const root = new THREE.Group();
    const stub = box(1, 10);
    stub.userData.noFit = true;
    root.add(box(2), stub);
    const fitted = fitBox(root);
    expect(fitted.max.x).toBeCloseTo(1);
    expect(stub.parent).toBe(root);
    expect(new THREE.Box3().setFromObject(root).max.x).toBeCloseTo(10.5);
  });
});

describe('what a hit names', () => {
  it('reads the part of a mesh, of a merged mesh by vertex and of an instance', () => {
    const plain = box(1);
    plain.userData.part = 'block';
    expect(partKeyOf(hit({ object: plain }))).toBe('block');

    const merged = box(1);
    const count = merged.geometry.getAttribute('position').count;
    merged.geometry.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    merged.userData.partOf = ['oil-pump', 'oil-filter'];
    expect(partKeyOf(hit({ object: merged, face: { a: 0, b: 1, c: 2, normal: new THREE.Vector3(), materialIndex: 0 } }))).toBe('oil-filter');

    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), undefined, 2);
    instanced.userData.instanceParts = ['valve', 'spring'];
    expect(partKeyOf(hit({ object: instanced, instanceId: 1 }))).toBe('spring');
  });

  it('takes the system from the object or its nearest ancestor that has one', () => {
    const car = new THREE.Group();
    const gearbox = new THREE.Group();
    gearbox.userData.system = 'gearbox';
    const gear = box(1);
    car.add(gearbox);
    gearbox.add(gear);
    expect(systemOf(gear)).toBe('gearbox');
    expect(systemOf(car)).toBeNull();
    gear.userData.system = 'synchro';
    expect(systemOf(gear)).toBe('synchro');
  });
});

describe('framing', () => {
  const view: FrameView = { fovDeg: 28, width: 1440, height: 900, insets: { left: 0, right: 0, top: 0, bottom: 0 } };

  it('stands back in proportion to the radius', () => {
    expect(fitDistance(2, view, 1)).toBeCloseTo(2 * fitDistance(1, view, 1));
    expect(fitDistance(1, view, 0.5)).toBeCloseTo(0.5 * fitDistance(1, view, 1));
  });

  it('frames by the free part of the window: panels push the camera back', () => {
    const free = fitDistance(1, view, 1);
    const withPanel = fitDistance(1, { ...view, insets: { left: 0, right: 700, top: 60, bottom: 200 } }, 1);
    expect(withPanel).toBeGreaterThan(free);
    // A sphere at that distance fills the free height exactly when height is the tighter side.
    const tall: FrameView = { ...view, width: 4000 };
    const d = fitDistance(1, tall, 1);
    expect(Math.asin(1 / d) * 2).toBeCloseTo((28 * Math.PI) / 180);
  });
});

describe('camera moves', () => {
  const from = { target: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(1, 0, 0), distance: 10 };
  const to = { target: new THREE.Vector3(0, 2, 0), direction: presetDirection('front', new THREE.Vector3(1, 1, 1)), distance: 20 };

  it('eases from rest to rest', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it('gets there on time, along the shorter turn, never cutting through the target', () => {
    const move = new CameraMove(from, to, 1);
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      move.step(0.1, position, target);
      const distance = position.distanceTo(target);
      expect(distance).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(distance).toBeLessThanOrEqual(20 + 1e-9);
    }
    expect(move.done).toBe(true);
    expect(target.distanceTo(to.target)).toBeLessThan(1e-9);
    expect(position.clone().sub(target).normalize().distanceTo(to.direction)).toBeLessThan(1e-6);
    expect(position.distanceTo(target)).toBeCloseTo(20);
  });

  it('jumps at once with no duration, as with prefers-reduced-motion', () => {
    const move = new CameraMove(from, to, 0);
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    move.step(0, position, target);
    expect(move.done).toBe(true);
    expect(position.distanceTo(target)).toBeCloseTo(20);
  });

  it('names the views: front looks along +Z, side along +X, top from above, home as given', () => {
    const home = new THREE.Vector3(2, 0, 0);
    expect(presetDirection('front', home).z).toBeGreaterThan(0.9);
    expect(presetDirection('side', home).x).toBeGreaterThan(0.9);
    expect(presetDirection('top', home).y).toBeGreaterThan(0.99);
    expect(presetDirection('home', home).toArray()).toEqual([1, 0, 0]);
    expect(home.x).toBe(2);
  });
});

describe('render quality', () => {
  const play = (governor: QualityGovernor, dt: number, seconds: number): void => {
    for (let t = 0; t < seconds; t += dt) governor.frame(dt);
  };

  it('drops a step after enough slow frames, down to the least and no further', () => {
    const q = new QualityGovernor();
    for (let i = 0; i < SLOW_FRAMES_TO_DROP; i++) q.frame(0.05);
    expect(q.scale).toBe(QUALITY_BEST);
    q.frame(0.05);
    expect(q.scale).toBe(0.8);
    play(q, 0.05, 60);
    expect(q.scale).toBe(QUALITY_LEAST);
  });

  it('comes back a step after 10 s of fast frames, and not before', () => {
    const q = new QualityGovernor();
    q.set(0.6);
    play(q, 1 / 60, FAST_SECONDS_TO_RAISE - 0.5);
    expect(q.scale).toBe(0.6);
    play(q, 1 / 60, 1);
    expect(q.scale).toBe(0.8);
    play(q, 1 / 60, FAST_SECONDS_TO_RAISE + 0.5);
    expect(q.scale).toBe(QUALITY_BEST);
  });

  it('starts the count of fast frames over after a slow one', () => {
    const q = new QualityGovernor();
    q.set(0.8);
    play(q, 1 / 60, FAST_SECONDS_TO_RAISE - 1);
    q.frame(0.05);
    play(q, 1 / 60, 2);
    expect(q.scale).toBe(0.8);
  });

  it('does not flicker: a raise the machine cannot keep makes the next one wait longer', () => {
    const q = new QualityGovernor();
    q.set(0.8);
    play(q, 1 / 60, FAST_SECONDS_TO_RAISE + 0.1);
    expect(q.scale).toBe(1);
    play(q, 0.05, 3);
    expect(q.scale).toBe(0.8);
    play(q, 1 / 60, FAST_SECONDS_TO_RAISE + 0.5);
    expect(q.scale).toBe(0.8);
    play(q, 1 / 60, FAST_SECONDS_TO_RAISE);
    expect(q.scale).toBe(1);
  });

  it('stands still while nothing feeds it, as on a frozen page', () => {
    const q = new QualityGovernor();
    q.set(1);
    expect(q.scale).toBe(1);
    q.set(0.6);
    expect(q.scale).toBe(0.6);
  });
});
