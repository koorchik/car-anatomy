// Arrows of the inertia forces drawn over the engine. They live in the model's engine frame, so they shake and
// turn with it, but they are drawn on top of everything and are invisible to framing and part picking.

import * as THREE from 'three';
import { isShown, type BalanceForces, type ForceArrow, type ForceLayers } from '../engine/balance-forces.ts';
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

const inert = (mesh: THREE.Mesh, order = ON_TOP): THREE.Mesh => {
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
};

const UP = new THREE.Vector3(0, 1, 0);

class Arrow {
  readonly group = new THREE.Group();
  private readonly shaft: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly width: number;
  private readonly dir = new THREE.Vector3();

  constructor(shaftGeo: THREE.BufferGeometry, headGeo: THREE.BufferGeometry, material: THREE.Material, width: number, order = ON_TOP) {
    this.width = width;
    this.shaft = inert(new THREE.Mesh(shaftGeo, material), order);
    this.head = inert(new THREE.Mesh(headGeo, material), order);
    this.group.add(this.shaft, this.head);
  }

  /** Arrow from a point along a vector, both in scene units. */
  set(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    const length = Math.hypot(dx, dy, dz);
    if (length < this.width * 0.5) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(x, y, z);
    this.dir.set(dx / length, dy / length, dz / length);
    this.group.quaternion.setFromUnitVectors(UP, this.dir);
    const headLength = Math.min(this.width * 4.2, length * 0.5);
    const headRadius = this.width * 2.3 * Math.min(1, headLength / (this.width * 4.2));
    this.shaft.scale.set(this.width, length - headLength, this.width);
    this.head.position.y = length - headLength;
    this.head.scale.set(headRadius, headLength, headRadius);
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
    for (const side of this.sides) {
      side.pivot.rotation.y = -angle / 2;
      side.tube.geometry.setDrawRange(0, segments * ARC_RADIAL * 6);
      // Cone from the end of the tube along the tangent of the arc.
      side.head.position.set(Math.sin(tip) * this.radius, 0, Math.cos(tip) * this.radius);
      side.head.quaternion.setFromUnitVectors(UP, new THREE.Vector3(Math.cos(tip), 0, -Math.sin(tip)));
      const headRadius = this.width * 2.3 * Math.min(1, headLength / (this.width * 4.2));
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
  private readonly arrows: Array<{ def: ForceArrow; arrow: Arrow }> = [];
  private readonly net: Arrow;
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
    const byColor = new Map<string, THREE.Material>();
    const shared = (color: string): THREE.Material => byColor.get(color) ?? byColor.set(color, material(color)).get(color)!;

    for (const def of forces.arrows) {
      const thin = def.kind === 'rotating' || def.kind === 'counterweight' || def.kind === 'shaft';
      const arrow = new Arrow(shaftGeo, headGeo, shared(colorOf(def)), b * (thin ? 0.028 : 0.036));
      this.group.add(arrow.group);
      this.arrows.push({ def, arrow });
    }

    const rodMaterial = material('#5d7c84');
    const zs = e.cylinders.map((c) => c.z * MM);
    const zFront = Math.max(...zs) + b * 0.25;
    const zRear = Math.min(...zs) - b * 0.25;
    const sphere = this.keep(outOfFrame(new THREE.SphereGeometry(b * 0.085, 14, 10)));
    forces.shafts.forEach((shaft, index) => {
      const rod = inert(new THREE.Mesh(shaftGeo, rodMaterial), ON_TOP - 1);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(shaft.x * MM, shaft.y * MM, zRear);
      rod.scale.set(b * 0.03, zFront - zRear, b * 0.03);
      const weights = shaft.weights.map(() => inert(new THREE.Mesh(sphere, shared(FORCE_COLORS.shaft)), ON_TOP - 1));
      this.group.add(rod, ...weights);
      this.shafts.push({ index, rod, weights });
    });

    this.net = new Arrow(shaftGeo, headGeo, material(FORCE_COLORS.net), b * 0.05, ON_TOP + 2);
    this.group.add(this.net.group);
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
    for (const { def, arrow } of this.arrows) {
      if (!isShown(def, this.layers)) {
        arrow.group.visible = false;
        continue;
      }
      // Both orders of a piston act along the same line. Drawn side by side across the bore, they can both be read.
      let { x, y } = def;
      if (def.kind === 'piston') {
        const side = ((def.order === 1 ? -1 : 1) * this.pistonGap) / (Math.hypot(x, y) || 1);
        [x, y] = [x + y * side, y - x * side];
      }
      arrow.set(x * MM, y * MM, def.z * MM, def.fx * k, def.fy * k, 0);
    }
    for (const parts of this.shafts) {
      const shaft = forces.shafts[parts.index]!;
      const shown = this.layers.balancing && (shaft.order === 1 ? this.layers.order1 : this.layers.order2);
      parts.rod.visible = shown;
      parts.weights.forEach((mesh, i) => {
        const w = shaft.weights[i]!;
        mesh.visible = shown;
        mesh.position.set(w.x * MM, w.y * MM, w.z * MM);
      });
    }
    const sum = forces.sum(this.layers);
    this.net.set(0, 0, 0, sum.fx * k, sum.fy * k, 0);
    // Each arc is as long as the arrow of a force that makes this couple on the lever of one cylinder spacing,
    // the unit the article's chart uses for couples.
    const couple = Math.hypot(sum.mx, sum.my);
    this.arcs.set(sum.mx, sum.my, (couple / this.forces.lever) * k);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geometries) g.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !this.geometries.includes(mesh.geometry)) mesh.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
