// The tyre forces of the prescribed mode (suspensions plan, the car on four wheels): how the given accelerations become
// the forces in the four contact patches, which ChassisSim then puts through the links. Corners FL, FR, RL, RR; x
// forward, y left; forces on the car, N.
//
// Across: each axle takes its share of m·a_y (the front b/L, so the car does not yaw), shared between its two wheels in
// proportion to their loads; a wheel off the road takes none (stage P7-core).
//
// Along: the tyres together make m·a_x − F_drag, where F_drag is the drag that acts on the body (aeroDragN of the car's
// road load, negative when the car moves forward). The rest of the road load, rolling resistance, acts in the contact
// patches, shared by load, so the drag and the rolling part add up to roadLoadN (whole-car plan, the edits to the
// suspension plan, item 6). The brakes or the drive make up the difference: the brakes between the axles by the brake
// balance, the drive by the driven axles (`driveFront` when both are), each half and half between the two wheels, as
// an open differential and a brake circuit give it. The brakes act only against the motion (standing, against the
// forward motion a scene starts from): a car rolling backwards speeds up backwards on its drive (reverse gear) and slows
// down on its brakes. A car with no driven axle cannot drive at all: what it is asked is the shortfall.
//
// Each wheel can make only so much: its peaks D_x and D_y from the Magic Formula at its load (the car's tyre fitted to
// the mean static load, as statics.ts and the lap fit it, on this wheel's surface), and along the road only what the
// friction ellipse leaves beside its side force, D_x·√(1 − (F_y/D_y)²). A wheel asked for more passes the excess to
// the other wheel of its axle, then to the other axle, as far as those can take it and are able to make that force (any
// wheel brakes, only driven ones drive): an ideal ABS with brake-force distribution, or limited-slip differentials and
// four-wheel drive. Then Σ F_x = m·a_x − F_drag holds exactly. When every wheel that could help is at its limit, the
// sample is impossible for these tyres: the forces stay at the limits and the shortfall is written down, not lost.
// Without the limit (`gripLimit = false`) a wheel makes whatever it is asked, but only on the road: a wheel in the air
// passes its share on as at its limit.
//
// The side forces are not cut: the lateral acceleration is what the scene asks for, and the roll scene and the rollover
// diagnosis need the car to feel all of it. A wheel whose side force is past its peak is marked at its limit (with
// nothing left along the road), and an axle whose two peaks together fall short of its share makes the sample
// impossible, with its lateral shortfall.
//
// The propshaft torque: the drive stub puts T = F_x·r on each driven hub (r the free tyre radius), and an axle whose
// differential sits on it (a live axle, `diff: 'axle'`) takes ΣT/finalDrive from its propshaft. The engine turns the
// shaft clockwise seen from the front, so its reaction rolls the body with that torque (left side up, positive) and the
// pinion turns the axle the other way. With the differential on the body the two reactions cancel inside it.
//
// No DOM and no allocation per call: ChassisSim calls it in every evaluation.

import type { Chassis } from './chassis.ts';
import { G } from './forces.ts';
import { lateralPeakN, longitudinalPeakN, tyreAt } from '../vehicle/tyre.ts';
import type { MfSet } from '../vehicle/tyre-data.ts';
import { aeroDragN, roadLoadN } from '../vehicle/road-load.ts';

/** Height the drag acts at when nobody measured it, m: an estimate (suspensions plan, the car on four wheels). */
export const AERO_HEIGHT_ESTIMATE_M = 0.5;

/** The forces in the four patches and what they could not be. Per corner FL, FR, RL, RR. */
export interface TyreShare {
  /** Along the road (the sum of the next three) and across, N. */
  fx: Float64Array;
  fy: Float64Array;
  /** Brake force (negative forward), drive force and rolling resistance, N. */
  brakeN: Float64Array;
  driveN: Float64Array;
  rollingN: Float64Array;
  /** Peak force along and across the road at this load and surface, N. */
  limitXN: Float64Array;
  limitYN: Float64Array;
  /** The wheel is at the most it can make (along the road, or across). */
  atLimit: Uint8Array;
  /** Drag on the body along x at the aero height, N: negative while the car moves forward. */
  dragN: number;
  /** Propshaft torque each axle's differential takes on that axle (live axles only), N·m, and their sum, which rolls
   *  the body. */
  axlePropNm: Float64Array;
  propNm: number;
  /** What the tyres could not make, N: along the road (all of it in the sum m·a_x) and across (over both axles). */
  shortfallXN: number;
  shortfallYN: number;
  impossible: boolean;
}

const f4 = (): Float64Array => new Float64Array(4);

export const newTyreShare = (): TyreShare => ({
  fx: f4(), fy: f4(), brakeN: f4(), driveN: f4(), rollingN: f4(), limitXN: f4(), limitYN: f4(),
  atLimit: new Uint8Array(4), dragN: 0, axlePropNm: new Float64Array(2), propNm: 0, shortfallXN: 0, shortfallYN: 0,
  impossible: false,
});

/** Turns the prescribed accelerations into patch forces for one chassis. */
export class WheelForces {
  readonly chassis: Chassis;
  /** The car's tyre, fitted to its mean static wheel load. */
  readonly tyre: MfSet;
  /** Each axle's share of the drive force (0 on an undriven axle). */
  readonly driveShare: readonly [number, number];
  readonly driven: readonly [boolean, boolean];
  /** The differential on the axle: its propshaft torque reacts on the axle and the body. */
  readonly diffOnAxle: readonly [boolean, boolean];
  /** How much more each wheel may take; scratch. */
  private readonly cap = f4();
  private readonly demand = f4();
  private readonly left = new Float64Array(2);

  constructor(chassis: Chassis) {
    this.chassis = chassis;
    const spec = chassis.spec;
    this.tyre = tyreAt(spec.tyre, (chassis.massKg * G) / 4).set;
    const driven = [spec.front.axle.driven, spec.rear.axle.driven] as const;
    this.driven = driven;
    const front = driven[0] && driven[1] ? spec.longitudinal.driveFront : driven[0] ? 1 : 0;
    this.driveShare = [driven[0] ? front : 0, driven[1] ? 1 - front : 0];
    this.diffOnAxle = [spec.front.axle.diff === 'axle', spec.rear.axle.diff === 'axle'];
  }

  /**
   * Patch forces for loads `fz` at accelerations `ax`, `ay` (m/s², x forward, y left) and speed `v` (m/s, negative
   * backwards) on surfaces `mu` (share of dry friction per wheel). Without `limit` every wheel on the road makes what it
   * is asked. Allocates nothing.
   */
  share(fz: Float64Array, ax: number, ay: number, v: number, mu: Float64Array, limit: boolean, o: TyreShare): void {
    const c = this.chassis;
    const lon = c.spec.longitudinal;
    const rl = lon.roadLoad;
    const m = c.massKg;
    const { cap, demand } = this;
    let load = 0;
    for (let i = 0; i < 4; i++) {
      load += fz[i];
      o.limitXN[i] = longitudinalPeakN(this.tyre, fz[i], 0, mu[i]);
      o.limitYN[i] = lateralPeakN(this.tyre, fz[i], 0, mu[i]);
      o.atLimit[i] = 0;
    }
    // Across: the axle's share, by load.
    let shortY = 0;
    for (let k = 0; k < 2; k++) {
      const iL = 2 * k;
      const iR = iL + 1;
      const fyAxle = m * ay * c.lateralShare[k];
      const axleLoad = fz[iL] + fz[iR];
      o.fy[iL] = axleLoad > 0 ? (fyAxle * fz[iL]) / axleLoad : 0;
      o.fy[iR] = axleLoad > 0 ? (fyAxle * fz[iR]) / axleLoad : 0;
      if (limit) {
        if (Math.abs(o.fy[iL]) > o.limitYN[iL]) o.atLimit[iL] = 1;
        if (Math.abs(o.fy[iR]) > o.limitYN[iR]) o.atLimit[iR] = 1;
        shortY += Math.max(0, Math.abs(fyAxle) - o.limitYN[iL] - o.limitYN[iR]);
      }
    }
    // Along: drag on the body, rolling resistance in the patches by load, the brakes or the drive for the rest.
    const dir = v > 0 ? 1 : v < 0 ? -1 : 0;
    const drag = -dir * aeroDragN(rl, v);
    const rolling = dir === 0 ? 0 : -dir * (roadLoadN(rl, v, 0) - aeroDragN(rl, v));
    let sumRolling = 0;
    for (let i = 0; i < 4; i++) {
      o.rollingN[i] = load > 0 ? (rolling * fz[i]) / load : 0;
      sumRolling += o.rollingN[i];
    }
    o.dragN = drag;
    const need = m * ax - drag - sumRolling;
    // The brakes only against the motion; standing, a car brakes (from the forward motion the scene starts from).
    const braking = dir < 0 ? need > 0 : need < 0;
    const sign = need < 0 ? -1 : 1;
    const total = Math.abs(need);
    // A car without a driven axle has nothing to drive with.
    let shortX = !braking && !this.driven[0] && !this.driven[1] ? total : 0;
    for (let k = 0; k < 2; k++) {
      const share = braking ? (k === 0 ? lon.brakeFront : 1 - lon.brakeFront) : this.driveShare[k];
      const able = braking || this.driven[k];
      for (let i = 2 * k; i < 2 * k + 2; i++) {
        demand[i] = (total * share) / 2;
        if (!able || !(fz[i] > 0)) {
          cap[i] = 0;
        } else if (!limit) {
          cap[i] = Infinity;
        } else {
          // Room along the road beside the side force, less the rolling resistance that already pushes the same way.
          const dy = o.limitYN[i];
          const r = dy > 0 ? o.fy[i] / dy : 1;
          const room = r * r < 1 ? o.limitXN[i] * Math.sqrt(1 - r * r) : 0;
          cap[i] = Math.max(0, room - sign * o.rollingN[i]);
        }
      }
    }
    if (total > 0) {
      // The excess of a wheel to the other wheel of its axle, then each axle's leftover to the other axle.
      const left = this.left;
      for (let k = 0; k < 2; k++) left[k] = this.toPartner(2 * k, 2 * k + 1) + this.toPartner(2 * k + 1, 2 * k);
      for (let k = 0; k < 2; k++) {
        if (left[k] <= 0) continue;
        const j = 2 * (1 - k);
        const spareL = Math.max(0, cap[j] - demand[j]);
        const spareR = Math.max(0, cap[j + 1] - demand[j + 1]);
        const take = Math.min(left[k], spareL + spareR);
        // Half to each, what one cannot take to the other.
        const toL = Math.min(spareL, Math.max(take / 2, take - spareR));
        demand[j] += toL;
        demand[j + 1] += take - toL;
        shortX += left[k] - take;
      }
      if (limit) for (let i = 0; i < 4; i++) if (cap[i] > 0 && demand[i] >= cap[i] * (1 - 1e-12)) o.atLimit[i] = 1;
    }
    o.axlePropNm[0] = 0;
    o.axlePropNm[1] = 0;
    for (let i = 0; i < 4; i++) {
      const f = sign * demand[i];
      o.brakeN[i] = braking ? f : 0;
      o.driveN[i] = braking ? 0 : f;
      o.fx[i] = f + o.rollingN[i];
      const k = i < 2 ? 0 : 1;
      if (!braking && this.diffOnAxle[k]) o.axlePropNm[k] += (f * c.corners[i].tyre.freeRadiusM) / lon.finalDrive;
    }
    o.propNm = o.axlePropNm[0] + o.axlePropNm[1];
    o.shortfallXN = shortX;
    o.shortfallYN = shortY;
    o.impossible = shortX > 0 || shortY > 0;
  }

  /** Moves what wheel i is asked past its room to wheel j, as far as j has room; returns what j could not take. */
  private toPartner(i: number, j: number): number {
    const { cap, demand } = this;
    if (demand[i] <= cap[i]) return 0;
    const excess = demand[i] - cap[i];
    demand[i] = cap[i];
    const take = Math.min(excess, Math.max(0, cap[j] - demand[j]));
    demand[j] += take;
    return excess - take;
  }
}
