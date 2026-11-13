// The mechanism view of a corner: links as thin bars, joints as spheres, the strut or damper as a bar along its axis,
// each wishbone's bush axis dashed, the steering axis as a long line down to the road and the wheel as a circle in its
// plane. Instanced, so the whole drawing costs a handful of draw calls; the corner hands it references to its own live
// points once, and positions are rewritten each frame without allocating.

import * as THREE from 'three';
import type { CornerMaterials } from './materials.ts';

const UP = new THREE.Vector3(0, 1, 0);
const DASHES = 14;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const CIRCLE = 64;

/** What the drawing shows: points are the corner's own vectors, read on every update(). */
export interface SchematicPoints {
  /** Joints and the part each belongs to (for picking through userData.instanceParts); a null point is hidden. */
  joints: Array<{ at: THREE.Vector3 | null; part: string }>;
  bars: Array<{ a: THREE.Vector3 | null; b: THREE.Vector3 | null; part: string }>;
  /** The two pivots of each wishbone, for its dashed bush axis. */
  bushAxes: Array<[THREE.Vector3, THREE.Vector3]>;
  /** The steering axis from above the knuckle down to the road; not shown when the corner has none now (a multilink
   *  whose paired links run parallel). */
  steer: { top: THREE.Vector3; road: THREE.Vector3; shown: boolean };
  wheelCentre: THREE.Vector3;
  /** Spin axis, unit, outboard. */
  axis: THREE.Vector3;
  freeRadius: number;
}

export class CornerSchematic {
  readonly group = new THREE.Group();
  private readonly points: SchematicPoints;
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

  constructor(materials: CornerMaterials, points: SchematicPoints) {
    this.points = points;
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 16, 12), materials.schematicJoint, points.joints.length);
    this.joints.userData.instanceParts = points.joints.map((j) => j.part);
    this.bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10).translate(0, 0.5, 0), materials.schematic, points.bars.length);
    this.bars.userData.instanceParts = points.bars.map((b) => b.part);
    for (const mesh of [this.joints, this.bars]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
    }
    // Line segments: the bush axes dashed, the steering axis dashed to the road, the wheel's circle.
    const bush = 2 * DASHES * points.bushAxes.length;
    const count = bush + 2 * DASHES + 2 * CIRCLE;
    this.positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const axisColor = new THREE.Color('#ffd27a');
    const steerColor = new THREE.Color('#ff9b3d');
    const wheelColor = new THREE.Color('#9fb6bf');
    for (let i = 0; i < count; i++) {
      const c = i < bush ? axisColor : i < bush + 2 * DASHES ? steerColor : wheelColor;
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

  /** A dashed line from a to b into slots [first, first + 2·DASHES); a point twice over when hidden. */
  private dashed(first: number, a: THREE.Vector3, b: THREE.Vector3, shown = true): void {
    for (let k = 0; k < DASHES; k++) {
      this.write(first + 2 * k, this.s.copy(a).lerp(b, k / DASHES));
      this.write(first + 2 * k + 1, shown ? this.s.copy(a).lerp(b, (k + 0.55) / DASHES) : this.s);
    }
  }

  update(): void {
    const p = this.points;
    for (let i = 0; i < p.joints.length; i++) {
      const at = p.joints[i]!.at;
      if (!at) this.joints.setMatrixAt(i, HIDDEN);
      else this.joints.setMatrixAt(i, this.m.makeTranslation(at.x, at.y, at.z));
    }
    for (let i = 0; i < p.bars.length; i++) {
      const { a, b } = p.bars[i]!;
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
    // Bush axes, a third longer than the bushes' span at each end.
    let slot = 0;
    for (const [front, rear] of p.bushAxes) {
      this.a.copy(front).lerp(rear, -0.3);
      this.b.copy(front).lerp(rear, 1.3);
      this.dashed(slot, this.a, this.b);
      slot += 2 * DASHES;
    }
    // Steering axis: from above the knuckle down to the road under the wheel.
    this.dashed(slot, p.steer.top, p.steer.road, p.steer.shown);
    slot += 2 * DASHES;
    // Wheel circle in the wheel plane.
    this.e1.copy(p.axis).cross(UP).normalize();
    this.e2.crossVectors(this.e1, p.axis).normalize();
    for (let k = 0; k < CIRCLE; k++) {
      for (let end = 0; end < 2; end++) {
        const ang = ((k + end) / CIRCLE) * Math.PI * 2;
        this.s.copy(p.wheelCentre).addScaledVector(this.e1, Math.cos(ang) * p.freeRadius).addScaledVector(this.e2, Math.sin(ang) * p.freeRadius);
        this.write(slot + 2 * k + end, this.s);
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
