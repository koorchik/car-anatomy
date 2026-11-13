// Arrows of the inertia forces drawn over the engine. They live in the model's engine frame, so they shake and
// turn with it, but they are drawn on top of everything and are invisible to framing and part picking. The arrow
// and arc primitives are in arrows.ts.

import * as THREE from 'three';
import { isShown, type BalanceForces, type ForceArrow, type ForceLayers, type ForceSum } from '../engine/balance-forces.ts';
import { Arrows, CoupleArcs, ON_TOP, arrowHeadGeometry, arrowShaftGeometry, inert, outOfFrame, overlayMaterial } from './arrows.ts';
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
    const shaftGeo = this.keep(arrowShaftGeometry());
    const headGeo = this.keep(arrowHeadGeometry());
    const material = (color: string): THREE.MeshBasicMaterial => {
      const m = overlayMaterial(color);
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
