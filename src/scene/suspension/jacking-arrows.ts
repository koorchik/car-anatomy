// The body lift of a single pivot axle (suspensions plan, stage 5: the swing axle's jacking shown by an arrow). A
// cornering force Fy pushes the outer tyre toward the middle of the turn; the linkage takes it to the body along the
// line from the contact patch through the instant centre, so the body is lifted by Fy·tanβ, tanβ being that line's
// slope (the roll centre's height over the patch's distance from the centre line). A trailing arm's line lies on the
// road and lifts nothing; a swing axle's climbs steeply to its joint. Two arrows at the section's one scale (1 kN =
// 40 mm, overlays.ts): the tyre's sideways force at the contact patch and the lift on the centre line at the roll
// centre. The inner wheel pulls the body down by its own share; with less weight on it in a turn, it pulls less.

import * as THREE from 'three';
import { Arrows, arrowHeadGeometry, arrowShaftGeometry, overlayMaterial } from '../arrows.ts';
import { OVERLAY_WHITE } from '../palette.ts';
import { FORCE_COLORS, FORCE_SCALE } from './overlays.ts';

const ARROW_WIDTH = 0.055;

/** What the arrows show: the patch and the roll centre (ISO, m) and the forces, N. */
export interface Jacking {
  contactX: number;
  contactY: number;
  contactZ: number;
  rcHeight: number;
  /** Sideways force on the tyre, toward the middle of the car (positive), and the lift it gives the body. */
  lateralN: number;
  liftN: number;
}

/** The lift on the body from a sideways force `lateralN` at a patch `contactY` from the centre line under a roll centre
 *  `rcHeight` up, N. */
export const jackingLift = (lateralN: number, rcHeight: number, contactY: number): number => (lateralN * rcHeight) / contactY;

export class JackingArrows {
  readonly group = new THREE.Group();
  private readonly arrows: Arrows;
  private readonly shaftGeo = arrowShaftGeometry();
  private readonly headGeo = arrowHeadGeometry();
  private readonly material = overlayMaterial(OVERLAY_WHITE);

  constructor() {
    this.arrows = new Arrows(this.shaftGeo, this.headGeo, this.material, [FORCE_COLORS.tyre, FORCE_COLORS.links], [ARROW_WIDTH, ARROW_WIDTH]);
    this.group.add(this.arrows.shafts, this.arrows.heads);
    this.set(null);
  }

  /** Shows the forces, or hides both with null. Scene = (y, z, x)·10 of ISO (geometry.ts). */
  set(j: Jacking | null): void {
    const a = this.arrows;
    if (!j) {
      a.hide(0);
      a.hide(1);
    } else {
      const s = FORCE_SCALE;
      a.set(0, j.contactY * 10, j.contactZ * 10, j.contactX * 10, -j.lateralN * s, 0, 0);
      a.set(1, 0, j.rcHeight * 10, j.contactX * 10, 0, j.liftN * s, 0);
    }
    a.commit();
  }

  dispose(): void {
    this.arrows.dispose();
    this.shaftGeo.dispose();
    this.headGeo.dispose();
    this.material.dispose();
  }
}
