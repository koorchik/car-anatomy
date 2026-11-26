// A slice of the body round one axle, in glass (suspensions plan, 3D: an axle model with the body in section): the two
// wheelhouses, the wings over the tyres, the lid across the car and a rail under each wheelhouse. The roll scene rolls
// it with the axle, so the body's lean shows against the wheels on the road.
//
// The shape is a drawing (typical), not a car's: it follows the axle it stands on, the inner wheelhouse wall a little inboard
// of the tyre, the arch over the tyre's top with room for the bump the scene reaches, and the lid over the towers of the
// top mounts (towerTop). Axle frame, scene units: (y, z, x)·10, origin on the road under the middle of the axle.

import * as THREE from 'three';
import { merge } from '../geometry.ts';
import { glassMaterial } from '../materials.ts';
import { tag } from '../model-types.ts';
import type { AxleSpec } from '../../suspension/spec.ts';
import { slab } from './geometry.ts';
import { towerTop } from './axle-model.ts';

/** Sizes of the drawing, m. */
const SECTION = {
  /** Along the car: the slice is this deep, centred on the axle line. */
  depthM: 0.5,
  wallM: 0.02,
  /** Inner wheelhouse wall inboard of the tyre's inner face, wing outboard of its outer face. */
  innerGapM: 0.06,
  outerGapM: 0.03,
  /** Arch over the tyre's top, and the lid over the arch at least, and over the towers. */
  archGapM: 0.07,
  lidOverArchM: 0.18,
  lidOverTowerM: 0.03,
  /** The rail under the wheelhouse: its width and height. */
  railM: [0.1, 0.1] as const,
};

/** The top of the slice above the road, m, where the roll scene stands its load bars. */
export function sectionTopM(spec: AxleSpec, tyreRadiusM: number): number {
  const arch = spec.wheelCentre[2] + tyreRadiusM + SECTION.archGapM;
  return Math.max(arch + SECTION.lidOverArchM, towerTop(spec).z + SECTION.lidOverTowerM) + 0.03;
}

/** The glass slice of the body round an axle; `part` is its card's key. */
export function bodySection(spec: AxleSpec, tyreRadiusM: number, tyreWidthM: number, part: string): THREE.Mesh {
  const [, yc, wz] = spec.wheelCentre;
  const yIn = yc - tyreWidthM / 2 - SECTION.innerGapM;
  const yOut = yc + tyreWidthM / 2 + SECTION.outerGapM;
  const zArch = wz + tyreRadiusM + SECTION.archGapM;
  const zLid = sectionTopM(spec, tyreRadiusM) - 0.03;
  const zRail = wz - 0.03;
  // Left half, from the middle of the lid out and round the arch into the wheelhouse, down to the rail.
  const half: Array<[number, number]> = [
    [0, zLid + 0.03],
    [yOut - 0.1, zLid],
    [yOut, zLid - 0.1],
    [yOut, zArch],
    [yIn, zArch],
    [yIn, zRail + SECTION.railM[1] / 2],
  ];
  const v = (y: number, z: number): THREE.Vector3 => new THREE.Vector3(y * 10, z * 10, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    for (let i = 0; i + 1 < half.length; i++) {
      const a = v(s * half[i]![0], half[i]![1]);
      const b = v(s * half[i + 1]![0], half[i + 1]![1]);
      const d = b.clone().sub(a);
      // The wall's thickness across the outline, its width along the car.
      parts.push(slab(a, b, new THREE.Vector3(-d.y, d.x, 0), SECTION.depthM * 10, SECTION.wallM * 10));
    }
    const [rw, rh] = SECTION.railM;
    const rail = new THREE.BoxGeometry(rw * 10, rh * 10, SECTION.depthM * 10 * 1.4).translate(s * (yIn - rw / 2) * 10, zRail * 10, 0);
    parts.push(rail);
  }
  const mesh = tag(new THREE.Mesh(merge(parts), glassMaterial('#bcd9e4', 0.05, 0.45)), part);
  mesh.renderOrder = 3;
  return mesh;
}
