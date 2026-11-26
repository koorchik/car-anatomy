// The build on the canonical lap (whole-car plan, the car builder: lap time, "without shift time and downforce"). The
// lap is the oil page's own (lubrication/scenario.ts), at the level CANONICAL_LAP_LEVEL names, so a ready car's build
// laps in exactly the canonical time. Its powertrain:
// - the donor's gearbox: the oil page's stand-in box (lapPowertrain), as the canonical lap drives it until stage K7
//   gives the lap real gearboxes;
// - an ideal box: the same stand-in with the visitor's gear count and spread;
// - any other gearbox: its real overall ratios and efficiencies, the driver in the gear that pulls hardest, shifts that
//   take no time, the clutch slipping at launch as the stand-in's does.

import type { Design, } from '../designer/design.ts';
import type { Performance } from '../designer/physics.ts';
import { DRIVELINE, lapPowertrain, testTrack } from '../lubrication/scenario.ts';
import { lapTorqueCurve } from '../lubrication/torque.ts';
import { gripChassisFor, transferLap } from '../suspension/lap.ts';
import type { CarRecord } from '../vehicle/car.ts';
import { CANONICAL_LAP_LEVEL, simulateLap, type LapTrace } from '../vehicle/lap.ts';
import { idealGearbox, topSpeed, type DriveSample, type Powertrain } from '../vehicle/powertrain.ts';
import { TYRES, type TyreId, type VehicleSpec } from '../vehicle/vehicle.ts';
import type { IdealGearbox } from './build.ts';

/** Engine speed at which a slipping clutch holds the engine while the car moves off, as the stand-in box has it. */
const LAUNCH_SHARE = 0.55;

export interface RealGear {
  /** Engine speed per wheel speed. */
  overall: number;
  /** Crank to wheels. */
  efficiency: number;
}

/** A real gearbox as the lap drives it: the gear that pulls hardest at this speed, shifts that take no time. */
export function ratioPowertrain(gears: readonly RealGear[], torqueAt: (rpm: number) => number, idleRpm: number, redlineRpm: number, tyreRadiusM: number): Powertrain {
  const launchRpm = Math.max(idleRpm * 1.5, LAUNCH_SHARE * redlineRpm);
  return {
    idleRpm,
    redlineRpm,
    maxDrive(v: number, out: DriveSample): void {
      let best = -1;
      let bestRpm = idleRpm;
      let bestGear = 1;
      for (let k = 0; k < gears.length; k++) {
        const g = gears[k]!;
        const rpm = (Math.max(0, v) / tyreRadiusM) * g.overall * (60 / (2 * Math.PI));
        if (rpm > redlineRpm) continue;
        const engineRpm = k === 0 ? Math.max(rpm, launchRpm) : rpm;
        if (engineRpm < idleRpm) continue;
        const force = (torqueAt(engineRpm) * g.overall * g.efficiency) / tyreRadiusM;
        if (force > best) {
          best = force;
          bestRpm = engineRpm;
          bestGear = k + 1;
        }
      }
      if (best < 0) {
        out.forceN = 0;
        out.rpm = redlineRpm;
        out.gear = gears.length;
        return;
      }
      out.forceN = best;
      out.rpm = bestRpm;
      out.gear = bestGear;
    },
  };
}

export type LapBox = { kind: 'donor' } | { kind: 'ideal'; ideal: IdealGearbox } | { kind: 'real'; gears: RealGear[] };

/** The powertrain the build laps with (see the header). */
export function buildLapPowertrain(design: Design, publishedHp: number | null, vehicle: VehicleSpec, perf: Pick<Performance, 'points'>, box: LapBox): Powertrain {
  if (box.kind === 'donor') return lapPowertrain(design, publishedHp, vehicle, perf);
  const torque = lapTorqueCurve(perf.points, publishedHp);
  const idleRpm = Math.max(600, design.factory?.idleRpm ?? 800);
  if (box.kind === 'ideal') {
    return idealGearbox({
      torqueAt: torque.at,
      idleRpm,
      redlineRpm: design.rpmLimit,
      gears: box.ideal.gears,
      spread: box.ideal.spread,
      topSpeedMs: topSpeed(vehicle, torque.peakPowerW, DRIVELINE.efficiency),
      tyreRadiusM: vehicle.tyreRadiusM,
      efficiency: DRIVELINE.efficiency,
    });
  }
  return ratioPowertrain(box.gears, torque.at, idleRpm, design.rpmLimit, vehicle.tyreRadiusM);
}

/** The canonical lap of the build's car on its tyres. L2 needs the car's record for its weight transfer. */
export function buildLap(car: CarRecord, vehicle: VehicleSpec, tyre: TyreId, pt: Powertrain): LapTrace {
  if (CANONICAL_LAP_LEVEL === 'L2') return transferLap(testTrack(), vehicle, TYRES[tyre], pt, gripChassisFor(car, TYRES[tyre]));
  return simulateLap(testTrack(), vehicle, TYRES[tyre], pt);
}
