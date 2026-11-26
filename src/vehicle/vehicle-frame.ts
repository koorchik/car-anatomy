// What a page shows of the car on the crank (stage K3a): the dash's figures and the angles the 3D and the inset turn
// by. VehicleLoad.frame() fills it on whichever thread steps the car; the worklet sends it in every report and Drive
// continues its angles to the frame by their speeds, as it does the crank's (DriveSnapshot.vehicle). Plain numbers and
// typed arrays, for postMessage. No DOM and no text.

import type { ShiftPhase } from '../drivetrain/control/manual.ts';
import type { VehicleLoad } from './vehicle-load.ts';
import { WHEELS } from './wheel-bus.ts';

export interface VehicleFrame {
  kind: 'vehicle';
  /** Road speed, m/s, distance, m, and the body's acceleration along the road, m/s². */
  speed: number;
  distance: number;
  accel: number;
  /** Seconds the car has been on the crank, by the simulation's clock (VehicleLoad.time). */
  time: number;
  /** The gear that holds ('N' while none does), the one the lever asks for, and the one whose sleeve is pushed in. */
  gear: string;
  selected: string;
  lever: string;
  shift: ShiftPhase;
  /** Clutch clamp share 0…1 and its slip, rad/s; brake pedal 0…1. */
  clutch: number;
  clutchSlip: number;
  brake: number;
  /** Clutch plate temperature, °C, and the heat it has taken since the car was put on the crank, J (stage K3b). */
  clutchC: number;
  clutchJ: number;
  /** Drive torque on the driven hubs together, N·m, and the throttle the rev matching asks for, 0 none. */
  driveNm: number;
  blip: number;
  /** Every wheel, FL, FR, RL, RR: angle, rad, unwrapped, spin, rad/s, and effective rolling radius, m. */
  wheelAngle: Float64Array;
  wheelOmega: Float64Array;
  wheelRadius: Float64Array;
  /** The drivetrain's base coordinates, rad, unwrapped, and their speeds, rad/s: a member turns by P·φ. */
  phi: Float64Array;
  phiDot: Float64Array;
}

/**
 * The frame of a car now: a new object, for a report that goes to another thread, or written into `into` when it is a
 * frame of the same drivetrain (the main-thread copy, every frame, allocates nothing).
 */
export function vehicleFrame(load: VehicleLoad, into?: VehicleFrame): VehicleFrame {
  const { vehicle, chassis, control } = load;
  const s = vehicle.solver;
  const bus = vehicle.bus;
  const gears = control.spec.gears;
  const f: VehicleFrame =
    into && into.phi.length === s.phi.length
      ? into
      : {
          kind: 'vehicle',
          speed: 0,
          distance: 0,
          accel: 0,
          time: 0,
          gear: 'N',
          selected: 'N',
          lever: 'N',
          shift: 'engaged',
          clutch: 0,
          clutchSlip: 0,
          brake: 0,
          clutchC: 0,
          clutchJ: 0,
          driveNm: 0,
          blip: 0,
          wheelAngle: new Float64Array(WHEELS),
          wheelOmega: new Float64Array(WHEELS),
          wheelRadius: new Float64Array(WHEELS),
          phi: new Float64Array(s.phi.length),
          phiDot: new Float64Array(s.phi.length),
        };
  f.speed = chassis.v;
  f.distance = chassis.x;
  f.accel = chassis.ax;
  f.time = load.time;
  f.gear = control.gearIn(s);
  f.selected = control.target < 0 ? 'N' : gears[control.target]!.name;
  f.lever = control.sleeve < 0 ? 'N' : gears[control.sleeve]!.name;
  f.shift = control.phase;
  f.clutch = control.clamp;
  f.clutchSlip = s.slip[control.spec.clutch]!;
  f.brake = control.brake;
  f.clutchC = s.temperature[control.spec.clutch]!;
  f.clutchJ = s.energy[control.spec.clutch]!;
  let drive = 0;
  for (let i = 0; i < WHEELS; i++) drive += bus.driveNm[i]!;
  f.driveNm = drive;
  f.blip = control.blip;
  f.wheelAngle.set(bus.angle.subarray(0, WHEELS));
  f.wheelOmega.set(bus.omega.subarray(0, WHEELS));
  f.wheelRadius.set(bus.rEff.subarray(0, WHEELS));
  f.phi.set(s.phi);
  f.phiDot.set(s.phiDot);
  return f;
}
