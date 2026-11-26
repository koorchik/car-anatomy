// What a page shows of the car on the crank (stage K3a): the dash's figures and the angles the 3D and the inset turn
// by. VehicleLoad.frame() fills it on whichever thread steps the car; the worklet sends it in every report and Drive
// continues its angles to the frame by their speeds, as it does the crank's (DriveSnapshot.vehicle). Plain numbers and
// typed arrays, for postMessage. No DOM and no text.

import type { ShiftPhase } from '../drivetrain/control/manual.ts';
import type { VehicleLoad } from './vehicle-load.ts';
import { WHEELS } from './wheel-bus.ts';

export interface VehicleFrame {
  kind: 'vehicle';
  /** Road speed, m/s, and distance, m. */
  speed: number;
  distance: number;
  /** The gear that holds ('N' while none does), the one the lever asks for, and the one whose sleeve is pushed in. */
  gear: string;
  selected: string;
  lever: string;
  shift: ShiftPhase;
  /** Clutch clamp share 0…1 and its slip, rad/s; brake pedal 0…1. */
  clutch: number;
  clutchSlip: number;
  brake: number;
  /** Every wheel, FL, FR, RL, RR: angle, rad, unwrapped, spin, rad/s, and effective rolling radius, m. */
  wheelAngle: Float64Array;
  wheelOmega: Float64Array;
  wheelRadius: Float64Array;
  /** The drivetrain's base coordinates, rad, unwrapped, and their speeds, rad/s: a member turns by P·φ. */
  phi: Float64Array;
  phiDot: Float64Array;
}

/** The frame of a car now. A new object each call: it goes to another thread. */
export function vehicleFrame(load: VehicleLoad): VehicleFrame {
  const { vehicle, chassis, control } = load;
  const s = vehicle.solver;
  const bus = vehicle.bus;
  const gears = control.spec.gears;
  return {
    kind: 'vehicle',
    speed: chassis.v,
    distance: chassis.x,
    gear: control.gearIn(s),
    selected: control.target < 0 ? 'N' : gears[control.target]!.name,
    lever: control.sleeve < 0 ? 'N' : gears[control.sleeve]!.name,
    shift: control.phase,
    clutch: control.clamp,
    clutchSlip: s.slip[control.spec.clutch]!,
    brake: control.brake,
    wheelAngle: Float64Array.from(bus.angle.subarray(0, WHEELS)),
    wheelOmega: Float64Array.from(bus.omega.subarray(0, WHEELS)),
    wheelRadius: Float64Array.from(bus.rEff.subarray(0, WHEELS)),
    phi: Float64Array.from(s.phi),
    phiDot: Float64Array.from(s.phiDot),
  };
}
