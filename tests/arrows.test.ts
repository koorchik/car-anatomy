// The shared arrow primitives: an arrow ends where its vector does, a short one hides, and an overlay never
// enlarges the box a model is framed by.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Arrows, CoupleArcs, arrowHeadGeometry, arrowShaftGeometry, overlayMaterial } from '../src/scene/arrows.ts';

const make = (widths: number[]): Arrows =>
  new Arrows(arrowShaftGeometry(), arrowHeadGeometry(), overlayMaterial('#ffffff'), widths.map(() => '#ffffff'), widths);

const instance = (mesh: THREE.InstancedMesh, i: number): THREE.Matrix4 => {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  return m;
};

describe('arrows', () => {
  it('runs from the point to the tip of the vector', () => {
    const arrows = make([0.02]);
    arrows.set(0, 1, 2, 3, 0.3, 0, 0.4);
    const start = new THREE.Vector3(0, 0, 0).applyMatrix4(instance(arrows.shafts, 0));
    const tip = new THREE.Vector3(0, 1, 0).applyMatrix4(instance(arrows.heads, 0));
    const neck = new THREE.Vector3(0, 1, 0).applyMatrix4(instance(arrows.shafts, 0));
    const headBase = new THREE.Vector3(0, 0, 0).applyMatrix4(instance(arrows.heads, 0));
    // Instance matrices are kept in single precision.
    expect(start.distanceTo(new THREE.Vector3(1, 2, 3))).toBeLessThan(1e-6);
    expect(tip.distanceTo(new THREE.Vector3(1.3, 2, 3.4))).toBeLessThan(1e-6);
    expect(neck.distanceTo(headBase)).toBeLessThan(1e-6);
  });

  it('hides an arrow shorter than half its width', () => {
    const arrows = make([0.02, 0.02]);
    arrows.set(0, 0, 0, 0, 0, 0.009, 0);
    arrows.set(1, 0, 0, 0, 0, 0.011, 0);
    expect(instance(arrows.shafts, 0).determinant()).toBe(0);
    expect(instance(arrows.heads, 0).determinant()).toBe(0);
    expect(instance(arrows.heads, 1).determinant()).not.toBe(0);
  });

  it('stays out of the frame of the model it is drawn over', () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const before = new THREE.Box3().setFromObject(model);
    const arrows = make([0.05]);
    arrows.set(0, 0, 0, 0, 0, 10, 0);
    arrows.commit();
    const arcs = new CoupleArcs(3, 0.05, arrowHeadGeometry(), overlayMaterial('#ff5c93'));
    arcs.set(1, 0, 5);
    model.add(arrows.shafts, arrows.heads, arcs.group);
    const after = new THREE.Box3().setFromObject(model);
    expect(after.equals(before)).toBe(true);
  });

  it('turns the couple arcs about the couple and hides them without one', () => {
    const arcs = new CoupleArcs(2, 0.05, arrowHeadGeometry(), overlayMaterial('#ff5c93'));
    arcs.set(0, 0, 1);
    expect(arcs.group.visible).toBe(false);
    arcs.set(0, 3, 1);
    expect(arcs.group.visible).toBe(true);
    // Local Y is the couple's axis, local Z stays along the crank.
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(arcs.group.quaternion);
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(arcs.group.quaternion);
    expect(y.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
    expect(z.distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
    arcs.set(2, 0, 1);
    const y2 = new THREE.Vector3(0, 1, 0).applyQuaternion(arcs.group.quaternion);
    expect(y2.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9);
  });

  it('frees the arc tube it built and leaves the caller its head and material', () => {
    const head = arrowHeadGeometry();
    const material = overlayMaterial('#ff5c93');
    const arcs = new CoupleArcs(2, 0.05, head, material);
    const freed = new Set<unknown>();
    const geometries = new Set<THREE.BufferGeometry>();
    arcs.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) geometries.add((o as THREE.Mesh).geometry);
    });
    for (const g of geometries) g.addEventListener('dispose', () => freed.add(g));
    material.addEventListener('dispose', () => freed.add(material));
    arcs.dispose();
    expect([...freed]).toHaveLength(1);
    expect([...freed][0]).toBeInstanceOf(THREE.TubeGeometry);
    expect(freed.has(head)).toBe(false);
  });
});
