// What drives the wheels. `idealGearbox` is a stand-in until the gearbox section brings a real one with the same
// interface: six geometric ratios, top gear at the limiter at top speed, the driver always in the gear that pulls
// hardest, shifts that take no time.

import { dragForce, type VehicleSpec } from './vehicle.ts';

export interface DriveSample {
  /** Tractive force at the wheels, newtons, at full throttle. */
  forceN: number;
  rpm: number;
  /** 1-based gear. */
  gear: number;
}

export interface Powertrain {
  readonly idleRpm: number;
  readonly redlineRpm: number;
  /** Most tractive force at the wheels at this road speed, with the gear that gives it. Writes into `out`. */
  maxDrive(v: number, out: DriveSample): void;
}

export interface IdealGearboxOptions {
  /** Engine torque at full throttle, N·m, at a crank speed. */
  torqueAt: (rpm: number) => number;
  idleRpm: number;
  redlineRpm: number;
  gears: number;
  /** First gear ratio over top gear ratio. */
  spread: number;
  topSpeedMs: number;
  tyreRadiusM: number;
  /** Driveline efficiency, 0..1. */
  efficiency: number;
}

/** Engine speed at which a slipping clutch holds the engine while the car moves off. */
const LAUNCH_SHARE = 0.55;

export function idealGearbox(o: IdealGearboxOptions): Powertrain {
  const top = (o.redlineRpm * 2 * Math.PI * o.tyreRadiusM) / 60 / o.topSpeedMs;
  const ratios = Array.from({ length: o.gears }, (_, k) => top * o.spread ** ((o.gears - 1 - k) / Math.max(1, o.gears - 1)));
  const launchRpm = Math.max(o.idleRpm * 1.5, LAUNCH_SHARE * o.redlineRpm);
  return {
    idleRpm: o.idleRpm,
    redlineRpm: o.redlineRpm,
    maxDrive(v, out) {
      let best = -1;
      let bestRpm = o.idleRpm;
      let bestGear = 1;
      for (let k = 0; k < ratios.length; k++) {
        const ratio = ratios[k]!;
        const rpm = (Math.max(0, v) / o.tyreRadiusM) * ratio * (60 / (2 * Math.PI));
        if (rpm > o.redlineRpm) continue;
        // Below the launch speed in first, the clutch slips and the engine stays at the launch speed.
        const engineRpm = k === 0 ? Math.max(rpm, launchRpm) : rpm;
        if (engineRpm < o.idleRpm) continue;
        const force = (o.torqueAt(engineRpm) * ratio * o.efficiency) / o.tyreRadiusM;
        if (force > best) {
          best = force;
          bestRpm = engineRpm;
          bestGear = k + 1;
        }
      }
      if (best < 0) {
        // Past the limiter in top: no drive, the engine sits at the limiter.
        out.forceN = 0;
        out.rpm = o.redlineRpm;
        out.gear = ratios.length;
        return;
      }
      out.forceN = best;
      out.rpm = bestRpm;
      out.gear = bestGear;
    },
  };
}

/** Speed where full power just matches drag, m/s: what top gear is geared for. */
export function topSpeed(car: Pick<VehicleSpec, 'roadLoad'>, peakPowerW: number, efficiency: number): number {
  let lo = 1;
  let hi = 200;
  for (let i = 0; i < 80; i++) {
    const v = (lo + hi) / 2;
    const need = dragForce(car, v) * v;
    if (need > efficiency * peakPowerW) hi = v;
    else lo = v;
  }
  return (lo + hi) / 2;
}
