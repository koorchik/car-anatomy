// Arrows of the inertia forces drawn over the engine, one view of them at a time (balance-phasors.ts): a thin arrow for
// each element of the view, one big arrow of their sum at the middle of the crank and the arc of their rocking couple.
// They live in the model's engine frame, so they shake and turn with it, but they are drawn on top of everything and
// are invisible to framing and part picking. The arrow and arc primitives are in arrows.ts, what each arrow is in
// balance-shown.ts.

import * as THREE from 'three';
import type { ForceArrow, ForceSum } from '../engine/balance-forces.ts';
import { sumAt, type BalancePhasors, type PhasorView } from '../engine/balance-phasors.ts';
import { ShownForces } from '../engine/balance-shown.ts';
import { Arrows, CoupleArcs, ON_TOP, arrowHeadGeometry, arrowShaftGeometry, inert, outOfFrame, overlayMaterial } from './arrows.ts';
import { MM } from './geometry.ts';
import { BALANCE_FORCE, OVERLAY_WHITE } from './palette.ts';

/** Colours shared with the legend (palette.ts). */
export const FORCE_COLORS = BALANCE_FORCE;

/** Colour of an arrow of BalanceForces: a piston's by its order, a rotor's as a piston's first order. */
export const colorOf = (a: Pick<ForceArrow, 'kind' | 'order'>): string => {
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
  private readonly phasors: BalancePhasors;
  private readonly shown: ShownForces;
  /** Scene units per kg m of force per unit omega^2. */
  private readonly scale: number;
  private readonly arrows: Arrows;
  private readonly net: Arrows;
  private readonly total: ForceSum = { fx: 0, fy: 0, mx: 0, my: 0 };
  private readonly arcs: CoupleArcs;
  private readonly shafts: ShaftParts[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private view: PhasorView | null = null;

  /** @param mmPerUnit Arrow length in mm per kg m of force per unit omega^2, shared by a page. */
  constructor(phasors: BalancePhasors, mmPerUnit: number) {
    this.phasors = phasors;
    this.shown = new ShownForces(phasors);
    const forces = phasors.forces;
    this.scale = mmPerUnit * MM;
    const e = forces.engine;
    const b = e.spec.bore * MM;
    const shaftGeo = this.keep(arrowShaftGeometry());
    const headGeo = this.keep(arrowHeadGeometry());
    const material = (color: string): THREE.MeshBasicMaterial => {
      const m = overlayMaterial(color);
      this.materials.push(m);
      return m;
    };
    // White, so that each instance's own colour shows as it is. One slot for each arrow of BalanceForces: a view
    // draws each at most once, and its colour stays with it.
    const white = material(OVERLAY_WHITE);
    const defs = forces.arrows;
    this.arrows = new Arrows(shaftGeo, headGeo, white, defs.map(colorOf), defs.map(() => b * 0.026));
    this.group.add(this.arrows.shafts, this.arrows.heads);

    const rodMaterial = material(BALANCE_FORCE.rod);
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

    this.net = new Arrows(shaftGeo, headGeo, white, [FORCE_COLORS.net], [b * 0.055], ON_TOP + 2);
    this.group.add(this.net.shafts, this.net.heads);
    const arcRadius = Math.max(((e.zMax - e.zMin) / 2) * MM, b * 0.9);
    this.arcs = new CoupleArcs(arcRadius, b * 0.04, headGeo, material(FORCE_COLORS.couple));
    this.group.add(this.arcs.group);
  }

  private keep<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  /** The view to draw, or null for none. */
  setView(view: PhasorView | null): void {
    this.view = view;
    this.group.visible = view !== null;
  }

  update(theta: number): void {
    const view = this.view;
    if (!view) return;
    const k = this.scale;
    const count = this.phasors.forces.arrows.length;
    for (let i = 0; i < count; i++) this.arrows.hide(i);
    for (const a of this.shown.at(view, theta)) this.arrows.set(a.slot, a.x * MM, a.y * MM, a.z * MM, a.fx * k, a.fy * k, 0);
    this.arrows.commit();
    // A shaft shows in the view of its order, with its weights where shown.at() has just put them.
    const forces = this.phasors.forces;
    const order = view.view === 'rotating' ? 0 : view.order;
    for (const parts of this.shafts) {
      const shaft = forces.shafts[parts.index]!;
      const on = view.options.shafts && shaft.order === order;
      parts.rod.visible = on;
      for (let i = 0; i < parts.weights.length; i++) {
        const w = shaft.weights[i]!;
        parts.weights[i]!.visible = on;
        parts.weights[i]!.position.set(w.x * MM, w.y * MM, w.z * MM);
      }
    }
    const sum = sumAt(view, theta, this.total);
    this.net.set(0, 0, 0, 0, sum.fx * k, sum.fy * k, 0);
    this.net.commit();
    // Each arc is as long as the arrow of a force that makes this couple on the lever of one cylinder spacing,
    // the unit the article's chart uses for couples.
    const couple = Math.hypot(sum.mx, sum.my);
    this.arcs.set(sum.mx, sum.my, (couple / forces.lever) * k);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.arrows.dispose();
    this.net.dispose();
    this.arcs.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
