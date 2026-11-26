// The coil and the boot set their bounding spheres from their own size instead of a pass over every vertex
// (src/scene/suspension/geometry.ts). A sphere that misses a vertex lets three.js cull a part that is on screen, so
// every vertex must lie inside, at any length the corner reaches, a coil pressed past solid included.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Bellows, CoilSpring } from '../src/scene/suspension/geometry.ts';

function outside(geometry: THREE.BufferGeometry): number {
  const p = geometry.attributes.position!;
  const sphere = geometry.boundingSphere!;
  const v = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i < p.count; i++) worst = Math.max(worst, v.fromBufferAttribute(p, i).distanceTo(sphere.center) - sphere.radius);
  return worst;
}

describe('bounding spheres of the parts rewritten every frame', () => {
  it('hold the whole coil, free, pressed and pressed past solid', () => {
    const coil = new CoilSpring(0.55, 6.5, 1);
    const wire = 0.06;
    for (const length of [3.2, 2.4, coil.solidLength(wire), 0.5 * coil.solidLength(wire)]) {
      coil.update(length, wire);
      expect(outside(coil.geometry), `length ${length}`).toBeLessThan(1e-6);
    }
  });

  it('hold the whole boot, straight and bent', () => {
    const boot = new Bellows(0.3, 0.5, 6, 0.05);
    const a = new THREE.Vector3(0, 0, 0);
    const da = new THREE.Vector3(1, 0, 0);
    for (const [b, db] of [
      [new THREE.Vector3(1.2, 0, 0), new THREE.Vector3(1, 0, 0)],
      [new THREE.Vector3(1, 0.4, 0.2), new THREE.Vector3(0.6, 0.8, 0)],
      [new THREE.Vector3(0.8, -0.5, 0.3), new THREE.Vector3(0, -1, 0)],
    ] as const) {
      boot.update(a, da, b, db);
      expect(outside(boot.geometry)).toBeLessThan(1e-6);
    }
  });
});
