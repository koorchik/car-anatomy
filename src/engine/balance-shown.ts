// The arrows the 3D layer draws for one view of the balance forces (balance-phasors.ts): each element of the view at
// the point where BalanceForces puts its force, as long as that element's harmonic is at crank angle theta. Pure, like
// the rest of src/engine, so a test can check that what is drawn adds up to the view's sum.
//
// A piston's two halves add back to a force along its cylinder axis, so its arrow only grows and shrinks, as it does on
// the real engine. The arrows of 'order2' carry only the 2nd harmonic: the small 4th and 6th orders that the arrows of
// BalanceForces fold in belong to no view.

import type { ForceSum } from './balance-forces.ts';
import { vectorAt, type BalancePhasors, type ElementKind, type PhasorView, type Vec2 } from './balance-phasors.ts';

export interface ShownArrow {
  /** Index into BalanceForces.arrows of the arrow it is drawn for: the 3D layer keeps one slot, with its colour, each. */
  slot: number;
  kind: ElementKind;
  /** Order of that arrow: tells a piston's first order from its second. */
  order: 1 | 2;
  /** Point the force acts at, engine frame, mm. */
  x: number;
  y: number;
  z: number;
  /** Force on the engine per unit omega^2, kg m. */
  fx: number;
  fy: number;
}

/** Arrows of one view at a time, reused from call to call: the layer redraws them every frame. */
export class ShownForces {
  readonly phasors: BalancePhasors;
  private readonly pool: ShownArrow[];
  private readonly list: ShownArrow[] = [];
  private readonly step: Vec2 = { x: 0, y: 0 };

  constructor(phasors: BalancePhasors) {
    this.phasors = phasors;
    this.pool = phasors.forces.arrows.map((a, slot) => ({ slot, kind: a.kind, order: a.order, x: 0, y: 0, z: a.z, fx: 0, fy: 0 }));
  }

  /**
   * The view's arrows at crank angle theta, degrees. The list and its arrows are the same objects on every call. Moves
   * the arrows of BalanceForces to theta, which is where the 3D layer wants them too.
   */
  at(view: PhasorView, theta: number): readonly ShownArrow[] {
    const arrows = this.phasors.forces.at(theta).arrows;
    this.list.length = 0;
    for (const el of view.elements) {
      const from = arrows[el.arrow]!;
      const shown = this.pool[el.arrow]!;
      const v = vectorAt(el, view.order, theta, 'net', this.step);
      shown.x = from.x;
      shown.y = from.y;
      shown.z = from.z;
      shown.fx = v.x;
      shown.fy = v.y;
      this.list.push(shown);
    }
    return this.list;
  }
}

/** Net force and rocking couple of some arrows, the way BalanceForces.sum adds its own. */
export function sumOf(arrows: readonly ShownArrow[], out: ForceSum = { fx: 0, fy: 0, mx: 0, my: 0 }): ForceSum {
  out.fx = 0;
  out.fy = 0;
  out.mx = 0;
  out.my = 0;
  for (const a of arrows) {
    out.fx += a.fx;
    out.fy += a.fy;
    out.mx -= (a.z / 1000) * a.fy;
    out.my += (a.z / 1000) * a.fx;
  }
  return out;
}
