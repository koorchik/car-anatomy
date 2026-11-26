// The solid axle in 3D (src/scene/suspension/solid-axle-model.ts): the wheels stay on the solved axle, turn forward
// with the frame's spin on both sides, and the bushes of a set that cannot roll without stretching a rod redden in roll.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidAxleModel } from '../src/scene/suspension/solid-axle-model.ts';
import { DAMAGE } from '../src/scene/palette.ts';
import { axleFrame } from '../src/scene/suspension/axle-model.ts';
import { solidAxle, SOLID_TYPICAL, type SolidAxleIntent } from '../src/suspension/templates/solid-axle.ts';

const WHEEL = { rimRadiusM: 0.2159, rimWidthM: 0.19, tyreWidthM: 0.225 };

function model(intent: SolidAxleIntent): SolidAxleModel {
  return new SolidAxleModel({ which: 'rear', spec: solidAxle(intent), wheel: WHEEL });
}

/** The reddest bush of the model: its colour's red over green, 1 for black rubber. */
function reddest(m: SolidAxleModel): number {
  let worst = 1;
  m.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.part !== 'susp.bush') return;
    const c = (mesh.material as THREE.MeshStandardMaterial).color;
    worst = Math.max(worst, c.r / Math.max(1e-6, c.g));
  });
  return worst;
}

describe('solid axle in 3D', () => {
  it.each(Object.entries(SOLID_TYPICAL))('%s: the wheel centres follow the travels', (_name, intent) => {
    const m = model(intent);
    const frame = axleFrame();
    frame.travel[0] = 0.04;
    frame.travel[1] = -0.03;
    m.update(frame);
    const zW = m.spec.wheelCentre[2];
    const a = m.anchors();
    // Scene y is ISO z·10.
    expect(a['left.wheelCentre']!.y / 10).toBeCloseTo(zW + 0.04, 6);
    expect(a['right.wheelCentre']!.y / 10).toBeCloseTo(zW - 0.03, 6);
    m.dispose();
  });

  it('turns both wheels forward with the spin', () => {
    const m = model(SOLID_TYPICAL.panhard);
    const frame = axleFrame();
    frame.spin[0] = 0.4;
    frame.spin[1] = 0.4;
    m.update(frame);
    m.group.updateMatrixWorld(true);
    // A point on each rim's top: turned forward, it moves to the front of the car (scene +z).
    const tops: number[] = [];
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.part !== 'susp.wheel') return;
      const centre = mesh.localToWorld(new THREE.Vector3(0, 0, 0));
      const top = mesh.localToWorld(new THREE.Vector3(0, 1, 0));
      tops.push(top.z - centre.z);
    });
    expect(tops).toHaveLength(2);
    for (const dz of tops) expect(dz).toBeCloseTo(Math.sin(0.4), 6);
    m.dispose();
  });

  it('reddens the bushes of four links bound in roll, and leaves a triangulated set black', () => {
    const frame = axleFrame();
    frame.travel[0] = 0.04;
    frame.travel[1] = -0.04;
    const bound = model({ ...SOLID_TYPICAL.panhard, upperAngleDeg: 0 });
    bound.update(frame);
    expect(reddest(bound)).toBeGreaterThan(5);
    const free = model(SOLID_TYPICAL.triangulated);
    free.update(frame);
    expect(reddest(free)).toBeCloseTo(1, 1);
    bound.dispose();
    free.dispose();
  });

  it('keeps a failed bush glowing while the axle moves', () => {
    const m = model({ ...SOLID_TYPICAL.panhard, upperAngleDeg: 0 });
    const frame = axleFrame();
    m.setFailure('susp.bush');
    frame.travel[0] = 0.04;
    frame.travel[1] = -0.04;
    m.update(frame);
    const damage = new THREE.Color(DAMAGE).getHex();
    let bushes = 0;
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.part !== 'susp.bush') return;
      bushes++;
      expect((mesh.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(damage);
    });
    expect(bushes).toBeGreaterThan(0);
    m.dispose();
  });
});
