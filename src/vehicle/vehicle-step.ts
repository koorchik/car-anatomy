// One step of the whole car as a load on the crank, in the order of the whole-car plan (the chain of force):
//   1. the chassis writes loads, wheel-centre speeds, radii and surfaces from the state at the start of the step;
//   2. the tyres turn the wheels' spin at the start of the step into forces, with the slope for the wheel step;
//   3. the drivetrain steps against the wheels' angles and speeds at the start of the step and writes the halfshaft
//      torques it used (driveNm) and the propshaft torque (propNm);
//   4. wheel.ts integrates every wheel, linear-implicit in the tyre force;
//   5. the chassis moves the body.
// The drivetrain and the wheels see each other only through the WheelBus, so a ChassisSim can replace the
// longitudinal chassis without a change here. No DOM: the worklet will run it (stage K2c adds VehicleLoad around it).

import type { DrivetrainCore } from '../drivetrain/core.ts';
import { DrivetrainSolver } from '../drivetrain/solver.ts';
import type { ChassisPort } from './chassis-port.ts';
import type { LongitudinalTyre, TyreLongForce, TyreLongState } from './tyre.ts';
import { stepWheels } from './wheel.ts';
import { newWheelBus, WHEELS, type WheelBus } from './wheel-bus.ts';

export interface VehicleStepSpec {
  core: DrivetrainCore;
  chassis: ChassisPort;
  /** The tyre of each wheel, FL, FR, RL, RR (one object may serve several: it keeps no state of its own). */
  tyres: readonly LongitudinalTyre[];
  /** Each wheel with its tyre, hub and brake disc, kg·m². */
  wheelInertia: ArrayLike<number>;
  /** The propshaft spring, whose torque reacts on the body; −1 without one. */
  propshaft: number;
}

export class VehicleStep {
  readonly bus: WheelBus;
  readonly solver: DrivetrainSolver;
  readonly chassis: ChassisPort;
  readonly tyres: readonly LongitudinalTyre[];
  readonly tyreStates: TyreLongState[];
  readonly wheelInertia: Float64Array;
  readonly propshaft: number;
  /** Springs that end on a wheel, with their slots. */
  private readonly hubs: Array<[number, number]>;
  private readonly force: TyreLongForce = { fx: 0, dFxdOmega: 0, dFxdV: 0 };
  time = 0;

  constructor(spec: VehicleStepSpec) {
    if (spec.tyres.length !== WHEELS) throw new Error(`vehicle: ${spec.tyres.length} tyres for ${WHEELS} wheels`);
    this.solver = new DrivetrainSolver(spec.core);
    this.chassis = spec.chassis;
    this.tyres = spec.tyres;
    this.tyreStates = Array.from({ length: WHEELS }, () => ({ u: 0 }));
    this.wheelInertia = Float64Array.from(spec.wheelInertia);
    this.propshaft = spec.propshaft;
    this.bus = newWheelBus();
    const S = spec.core.springs;
    this.hubs = [];
    for (let j = 0; j < S.ids.length; j++) if (S.anchor[j]! >= 0) this.hubs.push([j, S.anchor[j]!]);
  }

  step(dt: number): void {
    const { bus, solver } = this;
    this.chassis.preStep(bus);
    for (let i = 0; i < WHEELS; i++) {
      this.tyres[i]!.step(this.tyreStates[i]!, bus.omega[i]!, bus.rEff[i]!, bus.vx[i]!, bus.fz[i]!, bus.surfaceMu[i]!, dt, this.force);
      bus.fx[i] = this.force.fx;
      bus.dFxdOmega[i] = this.force.dFxdOmega;
    }
    for (let k = 0; k < solver.anchorAngle.length; k++) {
      solver.anchorAngle[k] = bus.angle[k]!;
      solver.anchorSpeed[k] = bus.omega[k]!;
    }
    solver.step(dt);
    bus.driveNm.fill(0);
    for (const [j, slot] of this.hubs) bus.driveNm[slot]! += solver.springApplied[j]!;
    bus.propNm = this.propshaft >= 0 ? solver.springApplied[this.propshaft]! : 0;
    stepWheels(bus, this.wheelInertia, dt);
    this.chassis.postStep(bus, dt);
    this.time += dt;
  }
}
