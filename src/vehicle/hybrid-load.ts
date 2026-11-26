// A power-split hybrid as a load on the crank (stage K15a). Like VehicleLoad (vehicle-load.ts): LoadedCrank integrates
// the crank, and the car takes it through the damper spring alone, an outside angle of the drivetrain (CRANK_SLOT).
// Unlike it, the load runs the engine: the control (control/ths.ts) asks for the throttle and for the ignition, so the
// engine starts when MG1 has turned it up and stops when the control lets it go (EngineRequest.ignition). One step:
//   1. the crank angle moves on with the crank speed of this step;
//   2. the control sets MG1's and MG2's torques, the brakes and the engine request for the next step;
//   3. VehicleStep steps the chassis, the tyres, the drivetrain and the wheels;
//   4. the torque the damper passed to the crank goes back, with its slope c + k·dt.
// Everything comes in as plain data (HybridLoadSpec, power-split-car.ts), so the audio thread derives nothing. No DOM
// and no text.

import { ThsControl, type ThsSpec } from '../drivetrain/control/ths.ts';
import type { DrivetrainCore } from '../drivetrain/core.ts';
import type { CrankInput, CrankLoad, EngineRequest, LoadCommand, LoadSnapshot, LoadTorque } from '../engine/load.ts';
import { LongitudinalChassis, type LongitudinalSpec } from './longitudinal.ts';
import { longitudinalOf, type Tyre } from './tyre.ts';
import { CRANK_SLOT } from './vehicle-load.ts';
import { VehicleStep } from './vehicle-step.ts';
import { WHEELS } from './wheel-bus.ts';

export interface HybridLoadSpec {
  kind: 'hybrid';
  /** The drivetrain with the crank outside it: its damper spring ends on CRANK_SLOT. */
  drivetrain: DrivetrainCore;
  chassis: { kind: 'longitudinal'; core: LongitudinalSpec };
  tyres: Tyre[];
  wheelInertia: number[];
  control: ThsSpec;
  /** Longest stable step, s. */
  maxStepS: number;
}

export type HybridCommand =
  /** The driver's accelerator, 0…1. */
  | { kind: 'hybrid'; action: 'pedal'; value: number }
  | { kind: 'hybrid'; action: 'brake'; value: number }
  /** False lifts the limited top speed. */
  | { kind: 'hybrid'; action: 'cap'; on: boolean }
  /** Holds the engine at this speed, rpm, with this share of its full load; null lets the control choose again. */
  | { kind: 'hybrid'; action: 'hold'; rpm: number | null; share?: number }
  | { kind: 'hybrid'; action: 'road'; gradeRad: number; surfaceMu: [number, number, number, number] };

export interface HybridReadings {
  kind: 'hybrid';
  samples: number;
  seconds: number;
  /** Road speed, m/s, and distance, m, at the end. */
  speed: number;
  distance: number;
  /** At the end: MG1's and MG2's speed, rpm, and torque, N·m; the battery's power, kW (positive out of it), and charge. */
  mg1Rpm: number;
  mg1Nm: number;
  mg2Rpm: number;
  mg2Nm: number;
  batteryKw: number;
  soc: number;
  engineOn: boolean;
  mode: string;
  /** Mean torque the car took from the crank, N·m, and the mean drive torque on the driven hubs together, N·m. */
  crankNm: number;
  wheelNm: number;
}

export interface HybridSnapshot {
  kind: 'hybrid';
  values: Float64Array;
}

const RPM = 30 / Math.PI;

export class HybridLoad implements CrankLoad<HybridReadings> {
  readonly spec: HybridLoadSpec;
  readonly vehicle: VehicleStep;
  readonly chassis: LongitudinalChassis;
  readonly control: ThsControl;
  crankAngle = 0;
  crankSpeed = 0;
  private readonly damper: number;
  private readonly torque: LoadTorque = { torqueNm: 0, dTorque: 0 };
  private readonly engine: EngineRequest = { ignition: false, throttle: 0 };
  private sum = { samples: 0, seconds: 0, crankNm: 0, wheelNm: 0 };

  constructor(spec: HybridLoadSpec) {
    this.spec = spec;
    this.chassis = new LongitudinalChassis(spec.chassis.core);
    const tyres = spec.tyres.map(longitudinalOf);
    this.vehicle = new VehicleStep({ core: spec.drivetrain, chassis: this.chassis, tyres, wheelInertia: spec.wheelInertia, propshaft: -1 });
    this.damper = spec.drivetrain.springs.anchor.indexOf(CRANK_SLOT);
    if (this.damper < 0) throw new Error('hybrid: the drivetrain has no spring on the crank slot (anchorCrank)');
    this.control = new ThsControl(spec.control);
  }

  active(): boolean {
    return true;
  }

  inertia(): number {
    return 0;
  }

  maxStepS(): number {
    return this.spec.maxStepS;
  }

  step(input: CrankInput, dt: number): LoadTorque {
    if (!(dt > 0)) return this.torque;
    const veh = this.vehicle;
    const s = veh.solver;
    this.crankAngle += dt * input.omega;
    this.crankSpeed = input.omega;
    s.anchorAngle[CRANK_SLOT] = this.crankAngle;
    s.anchorSpeed[CRANK_SLOT] = input.omega;
    this.control.step(s, veh.bus, input, this.chassis.v, dt);
    veh.step(dt);
    const S = s.core.springs;
    const t = this.torque;
    t.torqueNm = -s.springApplied[this.damper]!;
    t.dTorque = S.damping[this.damper]! + S.stiffness[this.damper]! * dt;
    const sum = this.sum;
    sum.samples += 1;
    sum.seconds += dt;
    sum.crankNm += t.torqueNm;
    for (let i = 0; i < WHEELS; i++) sum.wheelNm += veh.bus.driveNm[i]!;
    return t;
  }

  /** The control runs the engine: its throttle, and the ignition, which starts and stops it without a starter. */
  engineRequest(): EngineRequest {
    this.engine.ignition = this.control.request.ignition;
    this.engine.throttle = this.control.request.throttle;
    return this.engine;
  }

  command(cmd: LoadCommand): void {
    if (cmd.kind !== 'hybrid') return;
    const c = this.control;
    switch (cmd.action) {
      case 'pedal':
        c.pedal = Math.min(1, Math.max(0, cmd.value));
        break;
      case 'brake':
        c.brake = Math.min(1, Math.max(0, cmd.value));
        break;
      case 'cap':
        c.capOn = cmd.on;
        break;
      case 'hold':
        c.holdOmega = cmd.rpm === null ? Number.NaN : cmd.rpm / RPM;
        if (cmd.share !== undefined) c.holdShare = Math.min(1, Math.max(0, cmd.share));
        break;
      case 'road':
        this.chassis.gradeRad = cmd.gradeRad;
        this.chassis.surfaceMu.set(cmd.surfaceMu);
        break;
    }
  }

  engage(): void {}

  readings(): HybridReadings {
    const c = this.control;
    const sum = this.sum;
    const n = Math.max(1, sum.samples);
    const reading: HybridReadings = {
      kind: 'hybrid',
      samples: sum.samples,
      seconds: sum.seconds,
      speed: this.chassis.v,
      distance: this.chassis.x,
      mg1Rpm: c.mg1Omega * RPM,
      mg1Nm: c.mg1Nm,
      mg2Rpm: c.mg2Omega * RPM,
      mg2Nm: c.mg2Nm,
      batteryKw: c.batteryW / 1000,
      soc: c.soc,
      engineOn: c.engineOn,
      mode: c.mode,
      crankNm: sum.crankNm / n,
      wheelNm: sum.wheelNm / n,
    };
    this.sum = { samples: 0, seconds: 0, crankNm: 0, wheelNm: 0 };
    return reading;
  }

  private size(): number {
    return 2 + this.vehicle.snapshotSize() + this.control.snapshotSize();
  }

  snapshot(): HybridSnapshot {
    const values = new Float64Array(this.size());
    values[0] = this.crankAngle;
    values[1] = this.crankSpeed;
    this.vehicle.snapshot(values, 2);
    this.control.snapshot(values, 2 + this.vehicle.snapshotSize());
    return { kind: 'hybrid', values };
  }

  restore(snap: LoadSnapshot): void {
    if (snap.kind !== 'hybrid' || snap.values.length !== this.size()) return;
    const v = snap.values;
    this.crankAngle = v[0]!;
    this.crankSpeed = v[1]!;
    this.vehicle.restore(v, 2);
    this.control.restore(v, 2 + this.vehicle.snapshotSize());
  }
}
