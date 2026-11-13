// The mechanism view of a corner: links as thin bars, joints as spheres, the strut as a bar along its axis, the bush
// axis dashed, the steering axis as a long line down to the road and the wheel as a circle in its plane. Instanced, so
// the whole drawing costs a handful of draw calls; positions are rewritten each frame without allocating.

import * as THREE from 'three';
import type { CornerMaterials } from './materials.ts';

const UP = new THREE.Vector3(0, 1, 0);
/** Joints and the part each belongs to (for picking through userData.instanceParts). */
const JOINTS = [
  ['armFront', 'susp.bush'],
  ['armRear', 'susp.bush'],
  ['ball', 'susp.ball-joint'],
  ['tieInner', 'susp.rack'],
  ['tieOuter', 'susp.tie-rod'],
  ['top', 'susp.top-mount'],
  ['diffOutput', 'susp.cv-inner'],
  ['outerJoint', 'susp.cv-outer'],
] as const;
const BARS = [
  ['armFront', 'ball', 'susp.lower-arm'],
  ['armRear', 'ball', 'susp.lower-arm'],
  ['tieInner', 'tieOuter', 'susp.tie-rod'],
  ['top', 'lower', 'susp.strut'],
  ['diffOutput', 'outerJoint', 'susp.halfshaft'],
] as const;
const DASHES = 14;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const CIRCLE = 64;

export interface SchematicPoints {
  armFront: THREE.Vector3;
  armRear: THREE.Vector3;
  ball: THREE.Vector3;
  tieInner: THREE.Vector3;
  tieOuter: THREE.Vector3;
  top: THREE.Vector3;
  lower: THREE.Vector3;
  wheelCentre: THREE.Vector3;
  /** Spin axis, unit, outboard. */
  axis: THREE.Vector3;
  contact: THREE.Vector3;
  freeRadius: number;
  diffOutput: THREE.Vector3 | null;
  outerJoint: THREE.Vector3 | null;
}

export class CornerSchematic {
  readonly group = new THREE.Group();
  private readonly joints: THREE.InstancedMesh;
  private readonly bars: THREE.InstancedMesh;
  private readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();

  constructor(materials: CornerMaterials) {
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 16, 12), materials.schematicJoint, JOINTS.length);
    this.joints.userData.instanceParts = JOINTS.map(([, part]) => part);
    this.bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10).translate(0, 0.5, 0), materials.schematic, BARS.length);
    this.bars.userData.instanceParts = BARS.map(([, , part]) => part);
    for (const mesh of [this.joints, this.bars]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
    }
    // Line segments: the bush axis dashed, the steering axis dashed to the road, the wheel's circle.
    const count = 2 * DASHES + 2 * DASHES + 2 * CIRCLE;
    this.positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const axisColor = new THREE.Color('#ffd27a');
    const steerColor = new THREE.Color('#ff9b3d');
    const wheelColor = new THREE.Color('#9fb6bf');
    for (let i = 0; i < count; i++) {
      const c = i < 2 * DASHES ? axisColor : i < 4 * DASHES ? steerColor : wheelColor;
      colors.set([c.r, c.g, c.b], 3 * i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    geo.boundingBox = new THREE.Box3();
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.lines.raycast = () => {};
    this.lines.frustumCulled = false;
    this.group.add(this.joints, this.bars, this.lines);
  }

  private write(i: number, v: THREE.Vector3): void {
    this.positions[3 * i] = v.x;
    this.positions[3 * i + 1] = v.y;
    this.positions[3 * i + 2] = v.z;
  }

  /** A dashed line from a to b into slots [first, first + 2·DASHES). */
  private dashed(first: number, a: THREE.Vector3, b: THREE.Vector3): void {
    for (let k = 0; k < DASHES; k++) {
      this.write(first + 2 * k, this.s.copy(a).lerp(b, k / DASHES));
      this.write(first + 2 * k + 1, this.s.copy(a).lerp(b, (k + 0.55) / DASHES));
    }
  }

  update(p: SchematicPoints): void {
    for (let i = 0; i < JOINTS.length; i++) {
      const at = p[JOINTS[i]![0]];
      if (!at) this.joints.setMatrixAt(i, HIDDEN);
      else this.joints.setMatrixAt(i, this.m.makeTranslation(at.x, at.y, at.z));
    }
    for (let i = 0; i < BARS.length; i++) {
      const a = p[BARS[i]![0]];
      const b = p[BARS[i]![1]];
      if (!a || !b) {
        this.bars.setMatrixAt(i, HIDDEN);
        continue;
      }
      this.d.copy(b).sub(a);
      const len = this.d.length();
      this.q.setFromUnitVectors(UP, this.d.divideScalar(len));
      this.bars.setMatrixAt(i, this.m.compose(a, this.q, this.s.set(1, len, 1)));
    }
    this.joints.instanceMatrix.needsUpdate = true;
    this.bars.instanceMatrix.needsUpdate = true;
    // Bush axis, a third longer than the bushes' span at each end.
    this.a.copy(p.armFront).lerp(p.armRear, -0.3);
    this.b.copy(p.armFront).lerp(p.armRear, 1.3);
    this.dashed(0, this.a, this.b);
    // Steering axis: from above the top mount through the ball joint down to the road under the wheel.
    this.d.copy(p.ball).sub(p.top).normalize();
    this.a.copy(p.top).addScaledVector(this.d, -1.5);
    const toRoad = (p.contact.y - p.top.y) / this.d.y;
    this.b.copy(p.top).addScaledVector(this.d, toRoad);
    this.dashed(2 * DASHES, this.a, this.b);
    // Wheel circle in the wheel plane.
    this.e1.copy(p.axis).cross(UP).normalize();
    this.e2.crossVectors(this.e1, p.axis).normalize();
    const base = 4 * DASHES;
    for (let k = 0; k < CIRCLE; k++) {
      for (let slot = 0; slot < 2; slot++) {
        const ang = ((k + slot) / CIRCLE) * Math.PI * 2;
        this.s.copy(p.wheelCentre).addScaledVector(this.e1, Math.cos(ang) * p.freeRadius).addScaledVector(this.e2, Math.sin(ang) * p.freeRadius);
        this.write(base + 2 * k + slot, this.s);
      }
    }
    this.lines.geometry.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    this.joints.geometry.dispose();
    this.bars.geometry.dispose();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.joints.dispose();
    this.bars.dispose();
  }
}
