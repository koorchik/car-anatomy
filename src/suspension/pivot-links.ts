// A single-axis corner (trailing arm, semi-trailing arm, swing axle; templates/pivot.ts) written as links, so the pages,
// the setup, the bump and travel scenes and the 3D, which all take a corner on links (CornerSpec), show it unchanged.
//
// The arm is rigid with the knuckle and turns about the axis A–B. Five distances hold exactly that motion, as
// pivotAsLinks writes it for the solver (solve-pivot.ts): the arm's end P on the knuckle at its distances to A and B
// (the wishbone `pivot-arm`, which the 3D draws as the arm: its two bushes and the hub), a second knuckle point across
// the arm at its distances to A and B (`pivot-hold`), and a third one along the axis at its distance to A
// (`pivot-brace`). The last two exist for the solver alone: `rigidArm` tells the 3D to leave them out and to show
// their forces in the arm's. Newton on these five distances lands on the closed form's pose (tests).

import type { AxleSpec, CornerLinkage, PivotLinkage, Vec3 } from './spec.ts';
import { add, cross, dot, scale, sub, unit } from './vec.ts';

/** Where the arm meets the hub: this far inboard of the wheel centre along the spin axis, m. A swing axle's arm end is
 *  then on its shaft. Drawing only: any point of the knuckle off the axis holds the same motion. */
const ARM_END_INBOARD_M = 0.1;
/** Offsets of the two holding points from the arm's end, m (as in pivotAsLinks). */
const HOLD_M = 0.1;

export const PIVOT_ARM_ID = 'pivot-arm';

/** The links of a single-axis corner, with the arm's end on the hub. */
export function pivotLinks(link: PivotLinkage, wheelCentre: Vec3, spinAxis: Vec3): CornerLinkage {
  const A = link.axisA;
  const B = link.axisB;
  const e = unit(sub(B, A));
  const P = sub(wheelCentre, scale(unit(spinAxis), ARM_END_INBOARD_M));
  const r = sub(P, A);
  const radial = sub(r, scale(e, dot(r, e)));
  if (Math.hypot(...radial) < 0.05) throw new Error('The arm reaches the hub too close to its own axis');
  const tangent = cross(e, unit(radial));
  return {
    kind: 'links',
    wishbones: [
      { id: PIVOT_ARM_ID, front: A, rear: B, ball: P, part: link.armPart },
      { id: 'pivot-hold', front: A, rear: B, ball: add(P, scale(tangent, HOLD_M)), part: link.armPart },
    ],
    rods: [{ id: 'pivot-brace', body: A, knuckle: add(P, scale(e, HOLD_M)), part: link.armPart }],
    rigidArm: { arm: PIVOT_ARM_ID, hidden: ['pivot-hold', 'pivot-brace'] },
  };
}

/** A single-axis corner as a corner on links; a corner on links comes back as it is. */
export function asLinksCorner(spec: AxleSpec<CornerLinkage | PivotLinkage>): AxleSpec {
  const link = spec.linkage;
  if (link.kind === 'links') return spec as AxleSpec;
  return { ...spec, linkage: pivotLinks(link, spec.wheelCentre, spec.spinAxis) };
}

/** The axis of a corner written by pivotLinks: its two bushes, or null for any other corner. */
export function rigidArmAxis(link: CornerLinkage): { a: Vec3; b: Vec3 } | null {
  if (!link.rigidArm) return null;
  const arm = link.wishbones.find((w) => w.id === link.rigidArm!.arm);
  return arm ? { a: arm.front, b: arm.rear } : null;
}
