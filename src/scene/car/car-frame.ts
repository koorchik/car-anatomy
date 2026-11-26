// The car's frame in the scene: the front-axle frame of car.ts (x forward, y left, z up, metres) drawn as
// scene = (y, z, x)·10, 1 unit = 100 mm, as the body shell and the suspensions draw it. A cyclic swap of axes, so a
// proper rotation: nothing is mirrored.

import * as THREE from 'three';
import type { Vec3 } from '../../vehicle/car.ts';

export const toScene = (p: Vec3, out = new THREE.Vector3()): THREE.Vector3 => out.set(p[1] * 10, p[2] * 10, p[0] * 10);

export const fromScene = (v: THREE.Vector3): Vec3 => [v.z / 10, v.x / 10, v.y / 10];

/** The matrix that takes front-axle frame metres to scene units. */
export const CAR_TO_SCENE = new THREE.Matrix4().set(0, 10, 0, 0, 0, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 1);
