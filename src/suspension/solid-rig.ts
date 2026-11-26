// A solid axle on the rig of its page (stage P6b): the body rolled by a set angle and lifted by a set heave over a level
// road, one wheel on a bump if asked, and the axle solved where its wheels stand on the road. What the page shows comes
// from here: camber to the road, the binding and the stretch of each rod (the bushes' colour), the sideways shift of
// the axle, the roll centre, the axle's own steer, a de Dion half-shaft's plunge and joint angles.
//
// The body frame (the axle's own, kinematics.ts) turns by the roll φ, left side up positive, about the car's x axis
// through the road under the middle of the axle. A body point (y, z) then stands at world height y·sin φ + z·cos φ, so a
// wheel centre at body (y_W, z_W + q) is on the road at its loaded height z_W + lift when
//   q = (z_W + lift − y_W·sin φ) / cos φ − z_W,
// lift being the heave (both wheels) plus a bump under the left one. y_W moves a little with the axle (a Panhard rod
// shifts it), so the travels are found by a few fixed-point steps from the solved wheel centres.
//
// Camber to the road: γ_road = γ_body ∓ φ (minus on the left wheel, plus on the right, chassis-sim's convention). The
// wheels sit rigidly on the axle, so on a level road it stays at the static camber whatever the roll (Chalmers [P]);
// a bump under one wheel tilts both by the axle's slope. The same roll on an independent corner (kinematics.ts' table)
// is the page's comparison.

import type { Axle } from './kinematics.ts';
import { newSolidSample, SolidAxle, type SolidSample } from './solid-kinematics.ts';
import type { AxleSpec, SolidAxleLinkage } from './spec.ts';

/** What the rig holds: body roll (rad, left side up positive), heave of both wheels and a bump under the left one (m,
 *  up positive), both relative to the road under the body at design. */
export interface SolidRigInput {
  rollRad: number;
  heaveM: number;
  bumpM: number;
}

export interface SolidRigOut {
  /** Wheel travels relative to the body, left and right, m. */
  travel: [number, number];
  left: SolidSample;
  right: SolidSample;
  /** Camber of each wheel to the road, rad. */
  camberRoad: [number, number];
  /** Largest stretch of a rod (m) and its name; every row's residual, in the solver's row order. */
  bindM: number;
  worst: string;
  residuals: Float64Array;
}

/** Fixed-point steps from the solved wheel centres: the shift of a Panhard rod moves y_W by millimetres, so two steps
 *  leave the wheels under a micrometre off the road. */
const STEPS = 5;

export class SolidRig {
  readonly axle: SolidAxle;
  /** The solved state, warm from the last call: the walk from it is short when a slider moves a little. */
  readonly state: Float64Array;
  private readonly out: SolidRigOut;
  private readonly p = new Float64Array(3);
  private readonly zW: number;
  private readonly yW: number;

  constructor(spec: AxleSpec<SolidAxleLinkage>) {
    this.axle = new SolidAxle(spec);
    this.state = this.axle.rest();
    this.zW = spec.wheelCentre[2];
    this.yW = spec.wheelCentre[1];
    this.out = {
      travel: [0, 0],
      left: newSolidSample(),
      right: newSolidSample(),
      camberRoad: [0, 0],
      bindM: 0,
      worst: '',
      residuals: new Float64Array(this.axle.solver.rows.length),
    };
  }

  /** Solves the rig and measures both wheels. The result object is reused by the next call. Throws where the axle
   *  cannot go (SolidAxle.solve). */
  solve(input: SolidRigInput): SolidRigOut {
    const { rollRad: phi, heaveM, bumpM } = input;
    const s = Math.sin(phi);
    const c = Math.cos(phi);
    const solver = this.axle.solver;
    const out = this.out;
    let yL = this.yW;
    let yR = -this.yW;
    for (let k = 0; k < STEPS; k++) {
      const qL = (this.zW + heaveM + bumpM - yL * s) / c - this.zW;
      const qR = (this.zW + heaveM - yR * s) / c - this.zW;
      this.axle.solve(this.state, qL, qR);
      out.travel[0] = qL;
      out.travel[1] = qR;
      solver.point(this.state, solver.wheelL, this.p);
      yL = this.p[1];
      solver.point(this.state, solver.wheelR, this.p);
      yR = this.p[1];
    }
    this.axle.measure(this.state, 'left', out.left);
    this.axle.measure(this.state, 'right', out.right);
    out.camberRoad[0] = out.left.camber - phi;
    out.camberRoad[1] = out.right.camber + phi;
    solver.residuals(this.state, out.residuals);
    out.bindM = 0;
    out.worst = '';
    for (let i = 0; i < out.residuals.length; i++) {
      if (!solver.binds(i)) continue;
      const r = Math.abs(out.residuals[i]!);
      if (r > out.bindM) {
        out.bindM = r;
        out.worst = solver.rows[i]!;
      }
    }
    return out;
  }

  /** Motions the rods leave the axle at the solved state: 2 (heave and roll) for an axle located exactly, 1 when it
   *  could not roll without stretching a rod. */
  freeMotions(): number {
    return this.axle.solver.freeMotions(this.state).length;
  }
}

/**
 * Camber to the road of an independent corner's left and right wheels under the same rig (no bump): the wheels on the
 * road, the body rolled by φ about the road under the middle of the axle and lifted by the heave. Read from the corner's
 * table, so the corner's own lateral motion is left out (a few tenths of a millimetre of y_W).
 */
export function cornerCamberRoad(axle: Axle, rollRad: number, heaveM: number): [number, number] {
  const spec = axle.spec;
  const zW = spec.wheelCentre[2];
  const yW = spec.wheelCentre[1];
  const s = Math.sin(rollRad);
  const c = Math.cos(rollRad);
  const qL = (zW + heaveM - yW * s) / c - zW;
  const qR = (zW + heaveM + yW * s) / c - zW;
  // The right corner is the left one mirrored: its camber at its own travel reads off the same table.
  return [axle.value('camber', qL) - rollRad, axle.value('camber', qR) + rollRad];
}
