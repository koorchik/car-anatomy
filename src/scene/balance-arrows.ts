// Arrows of the inertia forces drawn over the engine. They live in the model's engine frame, so they shake and
// turn with it, but they are drawn on top of everything and are invisible to framing and part picking.

import * as THREE from 'three';
import { isShown, type BalanceForces, type ForceArrow, type ForceLayers, type ForceSum } from '../engine/balance-forces.ts';
import { MM } from './geometry.ts';

/** Colours shared with the legend. */
export const FORCE_COLORS = {
  order1: '#ffbf3c',
  order2: '#b48cff',
  rotating: '#6fa8ff',
  counterweight: '#63e28c',
  shaft: '#4fd2e0',
  net: '#ffffff',
  couple: '#ff5c93',
} as const;

const colorOf = (a: ForceArrow): string => {
  switch (a.kind) {
    case 'piston':
      return a.order === 1 ? FORCE_COLORS.order1 : FORCE_COLORS.order2;
    case 'rotor':
      return FORCE_COLORS.order1;
    default:
      return FORCE_COLORS[a.kind];
  }
};

const ON_TOP = 30;
const ARC_MAX = (300 * Math.PI) / 180;
const ARC_SEGMENTS = 120;
const ARC_RADIAL = 8;

/** Framing measures the model's bounding box. An empty box keeps the overlay out of it. */
const outOfFrame = <T extends THREE.BufferGeometry>(geometry: T): T => {
  geometry.boundingBox = new THREE.Box3();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
  return geometry;
};

const inert = <T extends THREE.Mesh>(mesh: T, order = ON_TOP): T => {
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
};

const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Straight arrows in two draw calls whatever their number: every shaft is an instance of one mesh and every head of
 * another, each with its own colour. A W16 has some sixty arrows, and a draw call each would cost a phone dearly.
 */
class Arrows {
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

  /** Arrow i from a point along a vector, both in scene units. */
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

/** Curved arrows for the rocking couple, one at each end of the engine, in the plane the couple turns it in. */
class CoupleArcs {
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

interface ShaftParts {
  index: number;
  rod: THREE.Mesh;
  weights: THREE.Mesh[];
}

export class BalanceOverlay {
  readonly group = new THREE.Group();
  private readonly forces: BalanceForces;
  /** Scene units per kg m of force per unit omega^2. */
  private readonly scale: number;
  private readonly arrows: Arrows;
  private readonly net: Arrows;
  private readonly total: ForceSum = { fx: 0, fy: 0, mx: 0, my: 0 };
  private readonly arcs: CoupleArcs;
  private readonly shafts: ShaftParts[] = [];
  private readonly arcRadius: number;
  /** Sideways distance of each piston arrow from the cylinder axis, mm. */
  private readonly pistonGap: number;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private layers: ForceLayers;

  /** @param mmPerUnit Arrow length in mm per kg m of force per unit omega^2, shared by a page. */
  constructor(forces: BalanceForces, mmPerUnit: number, layers: ForceLayers) {
    this.forces = forces;
    this.layers = layers;
    this.scale = mmPerUnit * MM;
    const e = forces.engine;
    const b = e.spec.bore * MM;
    this.pistonGap = e.spec.bore * 0.13;
    const shaftGeo = this.keep(outOfFrame(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0)));
    const headGeo = this.keep(outOfFrame(new THREE.ConeGeometry(1, 1, 16).translate(0, 0.5, 0)));
    const material = (color: string): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.94, toneMapped: false });
      this.materials.push(m);
      return m;
    };
    // White, so that each instance's own colour shows as it is.
    const white = material('#ffffff');
    const thin = (def: ForceArrow): boolean => def.kind === 'rotating' || def.kind === 'counterweight' || def.kind === 'shaft';
    const defs = forces.arrows;
    this.arrows = new Arrows(shaftGeo, headGeo, white, defs.map(colorOf), defs.map((def) => b * (thin(def) ? 0.028 : 0.036)));
    this.group.add(this.arrows.shafts, this.arrows.heads);

    const rodMaterial = material('#5d7c84');
    const weightMaterial = material(FORCE_COLORS.shaft);
    const zs = e.cylinders.map((c) => c.z * MM);
    const zFront = Math.max(...zs) + b * 0.25;
    const zRear = Math.min(...zs) - b * 0.25;
    const sphere = this.keep(outOfFrame(new THREE.SphereGeometry(b * 0.085, 14, 10)));
    forces.shafts.forEach((shaft, index) => {
      const rod = inert(new THREE.Mesh(shaftGeo, rodMaterial), ON_TOP - 1);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(shaft.x * MM, shaft.y * MM, zRear);
      rod.scale.set(b * 0.03, zFront - zRear, b * 0.03);
      const weights = shaft.weights.map(() => inert(new THREE.Mesh(sphere, weightMaterial), ON_TOP - 1));
      this.group.add(rod, ...weights);
      this.shafts.push({ index, rod, weights });
    });

    this.net = new Arrows(shaftGeo, headGeo, white, [FORCE_COLORS.net], [b * 0.05], ON_TOP + 2);
    this.group.add(this.net.shafts, this.net.heads);
    this.arcRadius = Math.max(((e.zMax - e.zMin) / 2) * MM, b * 0.9);
    this.arcs = new CoupleArcs(this.arcRadius, b * 0.04, headGeo, material(FORCE_COLORS.couple));
    this.group.add(this.arcs.group);
  }

  private keep<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  setLayers(layers: ForceLayers): void {
    this.layers = layers;
  }

  update(theta: number): void {
    const forces = this.forces.at(theta);
    const k = this.scale;
    const defs = forces.arrows;
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      if (!isShown(def, this.layers)) {
        this.arrows.hide(i);
        continue;
      }
      // Both orders of a piston act along the same line. Drawn side by side across the bore, they can both be read.
      let x = def.x;
      let y = def.y;
      if (def.kind === 'piston') {
        const side = ((def.order === 1 ? -1 : 1) * this.pistonGap) / (Math.hypot(x, y) || 1);
        const across = x + y * side;
        y -= x * side;
        x = across;
      }
      this.arrows.set(i, x * MM, y * MM, def.z * MM, def.fx * k, def.fy * k, 0);
    }
    this.arrows.commit();
    for (const parts of this.shafts) {
      const shaft = forces.shafts[parts.index]!;
      const shown = this.layers.balancing && (shaft.order === 1 ? this.layers.order1 : this.layers.order2);
      parts.rod.visible = shown;
      for (let i = 0; i < parts.weights.length; i++) {
        const w = shaft.weights[i]!;
        parts.weights[i]!.visible = shown;
        parts.weights[i]!.position.set(w.x * MM, w.y * MM, w.z * MM);
      }
    }
    const sum = forces.sum(this.layers, this.total);
    this.net.set(0, 0, 0, 0, sum.fx * k, sum.fy * k, 0);
    this.net.commit();
    // Each arc is as long as the arrow of a force that makes this couple on the lever of one cylinder spacing,
    // the unit the article's chart uses for couples.
    const couple = Math.hypot(sum.mx, sum.my);
    this.arcs.set(sum.mx, sum.my, (couple / this.forces.lever) * k);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.arrows.dispose();
    this.net.dispose();
    for (const g of this.geometries) g.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !this.geometries.includes(mesh.geometry)) mesh.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
