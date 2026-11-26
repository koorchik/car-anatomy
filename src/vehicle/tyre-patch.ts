// The contact patch as the brush model draws it (Chalmers, «Vehicle Dynamics» compendium, eq. 2.20; Pacejka, ch. 3):
// bristles under a parabolic pressure enter the patch at its leading edge undeflected, are dragged sideways (or along)
// in proportion to how far they have travelled while they stick, and slide once the pressure no longer holds them.
// The sticking zone at the front shrinks and the sliding zone grows from the trailing edge as the slip rises, until
// the whole patch slides at the peak. This is the picture of the tyre scene; the forces of the site come from the Magic
// Formula (tyre.ts), whose slip stiffnesses and peaks at the same load feed the brush, so both describe one tyre.
//
// Combined slip uses the similarity form: the slip vector is weighted by the stiffnesses along and across, and one
// normalised slip φ sets the sticking share as for pure slip. An illustration, not a combined-slip model.
//
// Normalised along the patch: ξ runs 0 at the leading edge to 1 at the trailing edge. Shear per unit length, in units
// of 3·μ·F_z/a: the friction limit is ξ·(1 − ξ) (the parabola), the sticking bristles carry φ·ξ, and they meet at
// ξ = 1 − φ.

import { inclinationOf, mfForces, newMfForces } from './tyre.ts';
import { patchLengthM, type MfSet } from './tyre-data.ts';

export interface PatchInput {
  set: MfSet;
  /** Load, N. */
  fz: number;
  /** Slip angle, rad (positive: the force pushes the wheel to its right). */
  alpha: number;
  /** Longitudinal slip κ (positive drives). */
  kappa: number;
  /** Camber, rad (ISO: negative leans the top towards the car), on a left wheel. */
  camber: number;
  /** Free radius of the tyre, m, and its vertical stiffness, N/m: they give the patch length. */
  freeRadiusM: number;
  ktNm: number;
  /** Width of the tread on the road, m. */
  widthM: number;
}

export interface ContactPatch {
  /** Patch length and width, m, and the deflection of the tyre that makes the length, m. */
  lengthM: number;
  widthM: number;
  deflectionM: number;
  /** Normalised slip φ: 0 rolling free, 1 and above sliding all over. */
  phi: number;
  /** Share of the patch length, from the leading edge, where the tread still sticks. */
  adhesion: number;
  /** Direction the tread is dragged, in the wheel's frame (x forward, y to its left), unit; 0, 0 with no slip. */
  dirX: number;
  dirY: number;
  /** Friction limit μ·F_z in that direction, N, and the brush's force, N. */
  limitN: number;
  forceN: number;
}

/** Sticking share of the patch for a normalised slip φ. */
export const adhesionShare = (phi: number): number => Math.max(0, 1 - phi);

/** Shear the tread carries at ξ along the patch (0 leading, 1 trailing), in units of 3·μ·F_z/a. */
export const shearAt = (phi: number, xi: number): number => Math.min(phi * xi, xi * (1 - xi));

/** True where the tread slides at ξ. */
export const slidesAt = (phi: number, xi: number): boolean => xi > adhesionShare(phi);

/** Brush force for a normalised slip, as a share of the friction limit: 3φ − 3φ² + φ³ up to φ = 1. */
export const brushShare = (phi: number): number => (phi >= 1 ? 1 : 3 * phi - 3 * phi * phi + phi * phi * phi);

const mf = newMfForces();

/** The contact patch of a left tyre under these conditions. */
export function contactPatch(p: PatchInput): ContactPatch {
  const deflectionM = p.ktNm > 0 ? Math.max(0, p.fz) / p.ktNm : 0;
  const lengthM = patchLengthM(p.freeRadiusM, deflectionM);
  mfForces(p.set, 'left', 0, 0, inclinationOf('left', p.camber), p.fz, 1, mf);
  // Stiffnesses and peaks of this load and camber (the Magic Formula's own), positive.
  const kx = Math.abs(mf.kx);
  const ky = Math.abs(mf.ky);
  const dx = Math.abs(mf.dx);
  const dy = Math.abs(mf.dy);
  const sx = p.kappa / (1 + p.kappa);
  const sy = Math.tan(p.alpha) / (1 + p.kappa);
  // Force per unit of normalised slip in each direction; positive α drags the tread to −y.
  const ax = kx * sx;
  const ay = -ky * sy;
  const pull = Math.hypot(ax, ay);
  const dirX = pull > 0 ? ax / pull : 0;
  const dirY = pull > 0 ? ay / pull : 0;
  // The friction ellipse with the two peaks as its axes, in the direction of the drag.
  const limitN = pull > 0 && dx > 0 && dy > 0 ? 1 / Math.hypot(dirX / dx, dirY / dy) : dy;
  const phi = limitN > 0 ? pull / (3 * limitN) : 0;
  return { lengthM, widthM: p.widthM, deflectionM, phi, adhesion: adhesionShare(phi), dirX, dirY, limitN, forceN: limitN * brushShare(phi) };
}
