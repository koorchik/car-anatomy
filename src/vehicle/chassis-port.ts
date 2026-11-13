// What carries the car between the tyres and the road (whole-car plan, three chassis on one port): the lift, the
// longitudinal chassis of the gearbox pages (longitudinal.ts) and the suspension's ChassisSim implement the same two
// calls around the wheel step, so the drivetrain and wheel.ts never change with the chassis.

import type { WheelBus } from './wheel-bus.ts';

export interface ChassisPort {
  /** Writes fz, vx, vy, camber, rEff and surfaceMu from the state at the start of the step. */
  preStep(bus: WheelBus): void;
  /** Moves the body with the tyre forces and the propshaft reaction. */
  postStep(bus: WheelBus, dt: number): void;
  /** Flat state for the hand-over between threads. */
  snapshotSize(): number;
  snapshot(out: Float64Array, offset: number): void;
  restore(from: Float64Array, offset: number): void;
}
