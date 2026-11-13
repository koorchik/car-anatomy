// One engine in one car on the test circuit: the lap, the oil model's setup, and the run. Shared by the page, the
// comparison table, the designer's track widget, the tests and scripts/sump-table.ts, so all of them agree.

import type { Design } from '../designer/design.ts';
import { evaluate } from '../designer/physics.ts';
import type { Engine } from '../engine/kinematics.ts';
import type { SumpKind, SystemsSpec } from '../engine/systems-spec.ts';
import type { WellPlace } from '../systems/sump.ts';
import { simulateLap, type LapTrace } from '../vehicle/lap.ts';
import { idealGearbox, topSpeed } from '../vehicle/powertrain.ts';
import { buildTrack, TEST_CIRCUIT, type Track } from '../vehicle/track.ts';
import { TYRES, type TyreId, type VehicleSpec } from '../vehicle/vehicle.ts';
import { LubeRunner, runLubrication, type LubeRun } from './run.ts';
import { lubeSetup, type LubeSetup } from './setup.ts';
import { lapTorqueCurve } from './torque.ts';

/** Driveline efficiency, gear count and spread of the stand-in gearbox (estimates for six-speed boxes). */
export const DRIVELINE = { efficiency: 0.85, gears: 6, spread: 4.3 };

let track: Track | null = null;
export const testTrack = (): Track => (track ??= buildTrack(TEST_CIRCUIT));

const laps = new Map<string, LapTrace>();

/** The lap of this car with this engine on these tyres. Cached: the oil runs share it. */
export function lapFor(design: Design, publishedHp: number | null, car: VehicleSpec, tyre: TyreId): LapTrace {
  const key = JSON.stringify([design, publishedHp, car, tyre]);
  const hit = laps.get(key);
  if (hit) return hit;
  const torque = lapTorqueCurve(evaluate({ ...design, factory: null }).points, publishedHp);
  const pt = idealGearbox({
    torqueAt: torque.at,
    idleRpm: Math.max(600, design.factory?.idleRpm ?? 800),
    redlineRpm: design.rpmLimit,
    gears: DRIVELINE.gears,
    spread: DRIVELINE.spread,
    topSpeedMs: topSpeed(car, torque.peakPowerW, DRIVELINE.efficiency),
    tyreRadiusM: car.tyreRadiusM,
    efficiency: DRIVELINE.efficiency,
  });
  const lap = simulateLap(testTrack(), car, TYRES[tyre], pt);
  if (laps.size > 24) laps.clear();
  laps.set(key, lap);
  return lap;
}

export interface OilChoice {
  kind: SumpKind;
  /** Litres over the full mark: 0 or -1. */
  oilDeltaL: number;
  accumulator: boolean;
  place: WellPlace;
}

/** The engine's systems with the visitor's sump and well. */
export const systemsWith = (systems: SystemsSpec, choice: OilChoice, car: VehicleSpec): SystemsSpec => ({
  ...systems,
  sump: choice.kind,
  well: { place: choice.place, front: car.mount.front },
});

export function setupFor(engine: Engine, systems: SystemsSpec, car: VehicleSpec, choice: OilChoice): LubeSetup {
  return lubeSetup(engine, systemsWith(systems, choice, car), car.mount, { oilDeltaL: choice.oilDeltaL, accumulator: choice.accumulator, place: choice.place });
}

export function oilRun(engine: Engine, systems: SystemsSpec, car: VehicleSpec, trace: LapTrace, choice: OilChoice): LubeRun {
  return runLubrication(setupFor(engine, systems, car, choice), trace, choice.accumulator);
}

export function oilRunner(engine: Engine, systems: SystemsSpec, car: VehicleSpec, trace: LapTrace, choice: OilChoice): LubeRunner {
  return new LubeRunner(setupFor(engine, systems, car, choice), trace, choice.accumulator);
}
