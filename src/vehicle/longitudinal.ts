// The car moving along the road only: the chassis of the gearbox pages (gearbox plan, the longitudinal chassis), on the same
// ChassisPort as the suspension's ChassisSim. The body is a point mass on a grade with the site's one road load
// (roadLoadCoeffs, the lap's coefficients); the loads follow the pitch balance with weight transfer,
//   F_z,rear = m·g·(a·cos θ + h·sin θ)/L + m·a_x·h/L,  a = L·(1 − frontShare),
// with a_x of the step before, split equally left and right. Every wheel may stand on its own surface. The wheels'
// spin is not here: wheel.ts integrates it for every chassis. No DOM: the worklet runs it.

import { cgHeightM, tyreRadiiM, type CarRecord } from './car.ts';
import type { ChassisPort } from './chassis-port.ts';
import { G } from './constants.ts';
import { roadLoadCoeffs, roadLoadN, type RoadLoadCoeffs } from './road-load.ts';
import { FL, FR, RL, RR, WHEELS, type WheelBus } from './wheel-bus.ts';

export interface LongitudinalSpec {
  /** The road load; its massKg (the driving mass) is the body's mass. */
  roadLoad: RoadLoadCoeffs;
  frontShare: number;
  cgHeightM: number;
  wheelbaseM: number;
  /** Rolling radius of the front and the rear tyres, m. */
  radiusFront: number;
  radiusRear: number;
}

/** A car record's longitudinal chassis: its road load, mass layout and tyre radii, nothing stored twice. */
export const longitudinalSpec = (car: CarRecord): LongitudinalSpec => {
  const r = tyreRadiiM(car);
  return {
    roadLoad: roadLoadCoeffs(car),
    frontShare: car.body.frontShare,
    cgHeightM: cgHeightM(car),
    wheelbaseM: car.body.wheelbaseM,
    radiusFront: r.front,
    radiusRear: r.rear,
  };
};

export class LongitudinalChassis implements ChassisPort {
  readonly spec: LongitudinalSpec;
  /** Speed along the road, m/s, and distance, m. */
  v = 0;
  x = 0;
  /** Acceleration of the last step, m/s²: the weight transfer of the next. */
  ax = 0;
  /** Grade, rad, uphill positive for a car going forward. */
  gradeRad = 0;
  /** Each wheel's surface as a share of dry friction (surface.ts). */
  readonly surfaceMu = Float64Array.of(1, 1, 1, 1);
  /** A wheel off the ground carries nothing; a one-dimensional body does not hand its share to the others. */
  readonly lifted = new Uint8Array(WHEELS);

  constructor(spec: LongitudinalSpec) {
    this.spec = spec;
  }

  /** Rear axle load, N, at acceleration ax and the present grade. */
  rearLoad(ax = this.ax): number {
    const { roadLoad, frontShare, cgHeightM: h, wheelbaseM: L } = this.spec;
    const m = roadLoad.massKg;
    const a = L * (1 - frontShare);
    return (m * G * (a * Math.cos(this.gradeRad) + h * Math.sin(this.gradeRad))) / L + (m * ax * h) / L;
  }

  /** Front and rear axle loads, N, at the present acceleration and grade. */
  axleLoads(ax = this.ax): { front: number; rear: number } {
    const rear = this.rearLoad(ax);
    return { front: this.spec.roadLoad.massKg * G * Math.cos(this.gradeRad) - rear, rear };
  }

  /** Allocates nothing: the audio thread steps it. */
  preStep(bus: WheelBus): void {
    const rear = this.rearLoad();
    const front = this.spec.roadLoad.massKg * G * Math.cos(this.gradeRad) - rear;
    for (let i = 0; i < WHEELS; i++) {
      const load = i === FL || i === FR ? front / 2 : rear / 2;
      bus.fz[i] = this.lifted[i] ? 0 : Math.max(0, load);
      bus.vx[i] = this.v;
      bus.vy[i] = 0;
      bus.camber[i] = 0;
      bus.rEff[i] = i === FL || i === FR ? this.spec.radiusFront : this.spec.radiusRear;
      bus.surfaceMu[i] = this.surfaceMu[i]!;
    }
  }

  /**
   * m·v̇ = Σfx − m·g·sin θ − road load. The road load opposes the motion and cannot reverse it within a step: a car
   * whose net push is below the rolling part stays put, as on a real road.
   */
  postStep(bus: WheelBus, dt: number): void {
    const rl = this.spec.roadLoad;
    const m = rl.massKg;
    const push = bus.fx[FL]! + bus.fx[FR]! + bus.fx[RL]! + bus.fx[RR]! - m * G * Math.sin(this.gradeRad);
    const trial = this.v + (dt * push) / m;
    const resist = (dt * roadLoadN(rl, this.v, 0)) / m;
    const v = trial > resist ? trial - resist : trial < -resist ? trial + resist : 0;
    this.ax = (v - this.v) / dt;
    this.x += dt * v;
    this.v = v;
  }

  snapshotSize(): number {
    return 3;
  }

  snapshot(out: Float64Array, offset: number): void {
    out[offset] = this.v;
    out[offset + 1] = this.x;
    out[offset + 2] = this.ax;
  }

  restore(from: Float64Array, offset: number): void {
    this.v = from[offset]!;
    this.x = from[offset + 1]!;
    this.ax = from[offset + 2]!;
  }
}

