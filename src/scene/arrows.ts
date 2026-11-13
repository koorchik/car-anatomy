// Force arrows and couple arcs drawn over a model. The engine's inertia forces (balance-arrows.ts) are built on them,
// and so are the suspension's forces. They are drawn on top of everything and are invisible to framing and part
// picking. Lengths, widths and colours are the caller's, in scene units: each overlay keeps its own scale and legend.

import * as THREE from 'three';

/** renderOrder of an overlay: after the model and its glass shells. */
export const ON_TOP = 30;
const ARC_MAX = (300 * Math.PI) / 180;
const ARC_SEGMENTS = 120;
const ARC_RADIAL = 8;

/** Framing measures the model's bounding box. An empty box keeps the overlay out of it. */
export const outOfFrame = <T extends THREE.BufferGeometry>(geometry: T): T => {
  geometry.boundingBox = new THREE.Box3();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
  return geometry;
};

/** A mesh of an overlay: never picked, never culled, drawn in the given order. */
export const inert = <T extends THREE.Mesh>(mesh: T, order = ON_TOP): T => {
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
};

/** Arrow shaft: a cylinder of radius 1 and length 1 that starts at the origin and points along +Y. */
export const arrowShaftGeometry = (): THREE.CylinderGeometry => outOfFrame(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0));

/** Arrow head: a cone of radius 1 and length 1 that starts at the origin and points along +Y. */
export const arrowHeadGeometry = (): THREE.ConeGeometry => outOfFrame(new THREE.ConeGeometry(1, 1, 16).translate(0, 0.5, 0));

/** Flat colour seen through the model. White lets each arrow's own instance colour show as it is. */
export const overlayMaterial = (color: string): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.94, toneMapped: false });

const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Straight arrows in two draw calls whatever their number: every shaft is an instance of one mesh and every head of
 * another, each with its own colour. A W16 has some sixty arrows, and a draw call each would cost a phone dearly.
 * Each frame: set() or hide() every arrow, then commit().
 */
export class Arrows {
  readonly shafts: THREE.InstancedMesh;
  readonly heads: THREE.InstancedMesh;
  private readonly widths: number[];
  private readonly matrix = new THREE.Matrix4();
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly size = new THREE.Vector3();

  /** @param colors Colour of each arrow. @param widths Shaft radius of each arrow, scene units. */
  constructor(shaftGeo: THREE.BufferGeometry, headGeo: THREE.BufferGeometry, material: THREE.Material, colors: string[], widths: number[], order = ON_TOP) {
    this.widths = widths;
    this.shafts = inert(new THREE.InstancedMesh(shaftGeo, material, widths.length), order);
    this.heads = inert(new THREE.InstancedMesh(headGeo, material, widths.length), order);
    const color = new THREE.Color();
    for (const mesh of [this.shafts, this.heads]) {
      colors.forEach((c, i) => mesh.setColorAt(i, color.set(c)));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Framing measures the instances unless the mesh already has an (empty) box.
      mesh.boundingBox = new THREE.Box3();
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    }
  }

  hide(i: number): void {
    this.shafts.setMatrixAt(i, HIDDEN);
    this.heads.setMatrixAt(i, HIDDEN);
  }

  /** Arrow i from a point along a vector, both in scene units. Shorter than half its width, it hides. */
  set(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    const width = this.widths[i]!;
    const length = Math.hypot(dx, dy, dz);
    if (length < width * 0.5) {
      this.hide(i);
      return;
    }
    this.dir.set(dx / length, dy / length, dz / length);
    this.turn.setFromUnitVectors(UP, this.dir);
    const headLength = Math.min(width * 4.2, length * 0.5);
    const headRadius = width * 2.3 * Math.min(1, headLength / (width * 4.2));
    this.at.set(x, y, z);
    this.shafts.setMatrixAt(i, this.matrix.compose(this.at, this.turn, this.size.set(width, length - headLength, width)));
    this.at.addScaledVector(this.dir, length - headLength);
    this.heads.setMatrixAt(i, this.matrix.compose(this.at, this.turn, this.size.set(headRadius, headLength, headRadius)));
  }

  /** Sends this frame's set() and hide() to the GPU. */
  commit(): void {
    this.shafts.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  /** Frees the instance buffers. The geometries and the material belong to the caller. */
  dispose(): void {
    this.shafts.dispose();
    this.heads.dispose();
  }
}

interface ArcSide {
  pivot: THREE.Group;
  tube: THREE.Mesh;
  head: THREE.Mesh;
}

/**
 * Curved arrows for a rocking couple, one at each end of an engine along Z, in the plane the couple turns it in. Both
 * lie on a circle of `radius` about the origin of the group, which goes in the middle of the engine.
 */
export class CoupleArcs {
  readonly group = new THREE.Group();
  private readonly sides: ArcSide[] = [];
  private readonly radius: number;
  private readonly width: number;
  private readonly basis = new THREE.Matrix4();
  private readonly axis = new THREE.Vector3();
  private readonly along = new THREE.Vector3();
  private readonly front = new THREE.Vector3(0, 0, 1);
  private readonly tangent = new THREE.Vector3();

  constructor(radius: number, width: number, headGeo: THREE.BufferGeometry, material: THREE.Material) {
    this.radius = radius;
    this.width = width;
    // The arc starts at the front end of the engine and sweeps towards local +X: p(t) = R (sin t, 0, cos t).
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = (i / ARC_SEGMENTS) * ARC_MAX;
      points.push(new THREE.Vector3(Math.sin(t) * radius, 0, Math.cos(t) * radius));
    }
    const tubeGeo = outOfFrame(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), ARC_SEGMENTS, width, ARC_RADIAL, false));
    for (const turn of [0, Math.PI]) {
      const side = new THREE.Group();
      side.rotation.y = turn;
      const pivot = new THREE.Group();
      const tube = inert(new THREE.Mesh(tubeGeo, material));
      const head = inert(new THREE.Mesh(headGeo, material));
      pivot.add(tube);
      side.add(pivot, head);
      this.group.add(side);
      this.sides.push({ pivot, tube, head });
    }
  }

  /** Couple vector (scene axes, about X and Y) and the arc length that stands for it, in scene units. */
  set(mx: number, my: number, arcLength: number): void {
    const size = Math.hypot(mx, my);
    const angle = Math.min(ARC_MAX, arcLength / this.radius);
    if (size === 0 || angle * this.radius < this.width) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    // Local frame: Y along the couple, Z along the crank, X = Y x Z, the way the front end is pushed.
    this.axis.set(mx / size, my / size, 0);
    this.along.crossVectors(this.axis, this.front);
    this.basis.makeBasis(this.along, this.axis, this.front);
    this.group.quaternion.setFromRotationMatrix(this.basis);
    const headLength = Math.min(this.width * 4.2, angle * this.radius * 0.5);
    const headAngle = headLength / this.radius;
    const shown = angle - headAngle;
    const segments = Math.max(1, Math.round((shown / ARC_MAX) * ARC_SEGMENTS));
    const end = angle / 2;
    const tip = end - headAngle;
    // Cone from the end of the tube along the tangent of the arc.
    this.tangent.set(Math.cos(tip), 0, -Math.sin(tip));
    const headRadius = this.width * 2.3 * Math.min(1, headLength / (this.width * 4.2));
    for (const side of this.sides) {
      side.pivot.rotation.y = -angle / 2;
      side.tube.geometry.setDrawRange(0, segments * ARC_RADIAL * 6);
      side.head.position.set(Math.sin(tip) * this.radius, 0, Math.cos(tip) * this.radius);
      side.head.quaternion.setFromUnitVectors(UP, this.tangent);
      side.head.scale.set(headRadius, headLength, headRadius);
    }
  }
}
