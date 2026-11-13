// The whole car as a load on the crank (whole-car plan, the chain of force; it replaces the gearbox plan's
// DrivelineLoad). LoadedCrank integrates the crank with the engine's torque; the car takes it through the damper
// spring alone, so inertia() is 0 and the crank is an outside angle of the drivetrain (anchorCrank, slot CRANK_SLOT),
// as the wheels are. One step:
//   1. the crank angle moves on with the crank speed of this step (symplectic, as the drivetrain's own angles);
//   2. the controls set the clutch, the sleeves and the brakes (control/manual.ts);
//   3. VehicleStep steps the chassis, the tyres, the drivetrain and the wheels against that angle and speed;
//   4. the torque the damper passed to the crank goes back, with its slope c + k·dt for the semi-implicit crank.
// active() is always true: the pedal asks the engine for torque, as an electronic throttle does, so in neutral a
// floored pedal takes it to the limiter.
//
// Everything comes in as plain data (VehicleLoadSpec, built on the main thread by car-load.ts), so the audio thread
// derives nothing. snapshot() and restore() carry the whole state between the worklet and the main-thread copy. No DOM
// and no text.

import type { DrivetrainCore } from '../drivetrain/core.ts';
import { ManualControl, type ManualSpec, type ShiftPhase } from '../drivetrain/control/manual.ts';
import type { CrankInput, CrankLoad, EngineRequest, LoadCommand, LoadSnapshot, LoadTorque } from '../engine/load.ts';
import { LongitudinalChassis, type LongitudinalSpec } from './longitudinal.ts';
import { longitudinalOf, type Tyre } from './tyre.ts';
import { VehicleStep } from './vehicle-step.ts';
import { WHEELS } from './wheel-bus.ts';

/** The anchor slot of the crank: after the four wheels. */
export const CRANK_SLOT = WHEELS;

export interface VehicleLoadSpec {
  kind: 'vehicle';
  /** The drivetrain with the crank outside it: its damper spring ends on CRANK_SLOT. */
  drivetrain: DrivetrainCore;
  chassis: { kind: 'longitudinal'; core: LongitudinalSpec };
  /** Each wheel's tyre, FL, FR, RL, RR. */
  tyres: Tyre[];
  /** Each wheel with its tyre, hub and brake disc, kg·m². */
  wheelInertia: number[];
  /** The propshaft spring, whose torque reacts on the body; −1 without one. */
  propshaft: number;
  control: ManualSpec;
  /** Longest stable step, s: the drivetrain's stableStep, at most 1 ms. */
  maxStepS: number;
}

export type VehicleCommand =
  | { kind: 'vehicle'; action: 'gear'; gear: string }
  /** The driver's clutch pedal, 0 released … 1 floored; it acts only with the auto clutch off. */
  | { kind: 'vehicle'; action: 'clutch'; pedal: number }
  | { kind: 'vehicle'; action: 'autoClutch'; on: boolean }
  | { kind: 'vehicle'; action: 'brake'; value: number }
  /** Grade along the road, rad, uphill positive, and each wheel's surface as a share of dry friction. */
  | { kind: 'vehicle'; action: 'road'; gradeRad: number; surfaceMu: [number, number, number, number] };

export interface VehicleReadings {
  kind: 'vehicle';
  /** Steps averaged into this reading, and the seconds they cover. */
  samples: number;
  seconds: number;
  /** Road speed, m/s, and distance, m, at the end. */
  speed: number;
  distance: number;
  /** The gear that holds ('N' while none does) and the one the lever asks for, at the end. */
  gear: string;
  selected: string;
  shift: ShiftPhase;
  /** Clutch clamp share, slip, rad/s, and plate temperature, °C, at the end. */
  clutch: number;
  clutchSlip: number;
  clutchC: number;
  /** Mean torque the car took from the crank, N·m, and the mean drive torque on the driven hubs together, N·m. */
  crankNm: number;
  wheelNm: number;
}

/** The car's whole state as flat numbers (VehicleLoad.snapshot): it crosses threads in every report. */
export interface VehicleSnapshot {
  kind: 'vehicle';
  values: Float64Array;
}

export class VehicleLoad implements CrankLoad<VehicleReadings> {
  readonly spec: VehicleLoadSpec;
  readonly vehicle: VehicleStep;
  readonly chassis: LongitudinalChassis;
  readonly control: ManualControl;
  /** The crank as the drivetrain sees it: angle, rad, unwrapped, and speed, rad/s. */
  crankAngle = 0;
  crankSpeed = 0;
  private readonly damper: number;
  private readonly torque: LoadTorque = { torqueNm: 0, dTorque: 0 };
  private sum = { samples: 0, seconds: 0, crankNm: 0, wheelNm: 0 };

  constructor(spec: VehicleLoadSpec) {
    this.spec = spec;
    this.chassis = new LongitudinalChassis(spec.chassis.core);
    const tyres = spec.tyres.map(longitudinalOf);
    this.vehicle = new VehicleStep({ core: spec.drivetrain, chassis: this.chassis, tyres, wheelInertia: spec.wheelInertia, propshaft: spec.propshaft });
    this.damper = spec.drivetrain.springs.anchor.indexOf(CRANK_SLOT);
    if (this.damper < 0) throw new Error('vehicle: the drivetrain has no spring on the crank slot (anchorCrank)');
    this.control = new ManualControl(spec.control);
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
    const veh = this.vehicle;
    const s = veh.solver;
    this.crankAngle += dt * input.omega;
    this.crankSpeed = input.omega;
    s.anchorAngle[CRANK_SLOT] = this.crankAngle;
    s.anchorSpeed[CRANK_SLOT] = input.omega;
    this.control.step(s, veh.bus, input, dt);
    veh.step(dt);
    const S = s.core.springs;
    // springApplied is what the damper passed to its anchor, the crank; braking the crank is positive here.
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

  engineRequest(): EngineRequest | null {
    return null;
  }

  command(cmd: LoadCommand): void {
    if (cmd.kind !== 'vehicle') return;
    const c = this.control;
    switch (cmd.action) {
      case 'gear': {
        const i = c.gearIndex(cmd.gear);
        if (i !== undefined) c.target = i;
        break;
      }
      case 'clutch':
        c.pedal = Math.min(1, Math.max(0, cmd.pedal));
        break;
      case 'autoClutch':
        c.autoClutch = cmd.on;
        break;
      case 'brake':
        c.brake = Math.min(1, Math.max(0, cmd.value));
        break;
      case 'road':
        this.chassis.gradeRad = cmd.gradeRad;
        this.chassis.surfaceMu.set(cmd.surfaceMu);
        break;
    }
  }

  /** Nothing to catch up: the crank angle moves on every step, on the engine's free path too. */
  engage(): void {}

  readings(): VehicleReadings {
    const s = this.vehicle.solver;
    const c = this.control;
    const clutch = c.spec.clutch;
    const sum = this.sum;
    const n = Math.max(1, sum.samples);
    const reading: VehicleReadings = {
      kind: 'vehicle',
      samples: sum.samples,
      seconds: sum.seconds,
      speed: this.chassis.v,
      distance: this.chassis.x,
      gear: c.gearIn(s),
      selected: c.target < 0 ? 'N' : c.spec.gears[c.target]!.name,
      shift: c.phase,
      clutch: c.clamp,
      clutchSlip: s.slip[clutch]!,
      clutchC: s.temperature[clutch]!,
      crankNm: sum.crankNm / n,
      wheelNm: sum.wheelNm / n,
    };
    this.sum = { samples: 0, seconds: 0, crankNm: 0, wheelNm: 0 };
    return reading;
  }

  private size(): number {
    return 2 + this.vehicle.snapshotSize() + this.control.snapshotSize();
  }

  snapshot(): VehicleSnapshot {
    const values = new Float64Array(this.size());
    values[0] = this.crankAngle;
    values[1] = this.crankSpeed;
    this.vehicle.snapshot(values, 2);
    this.control.snapshot(values, 2 + this.vehicle.snapshotSize());
    return { kind: 'vehicle', values };
  }

  /** Takes a snapshot of a load built from the same spec; one of another car (another size) is ignored. */
  restore(snap: LoadSnapshot): void {
    if (snap.kind !== 'vehicle' || snap.values.length !== this.size()) return;
    const v = snap.values;
    this.crankAngle = v[0]!;
    this.crankSpeed = v[1]!;
    this.vehicle.restore(v, 2);
    this.control.restore(v, 2 + this.vehicle.snapshotSize());
  }
}
