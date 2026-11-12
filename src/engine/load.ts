// What the crank can drive: a dyno absorber now, a clutch, gearbox and car later. Described by plain data so the
// same load can be built on the audio thread and in the main-thread copy of the simulation.

import type { DynoCommand, DynoReadings, DynoSpec } from './dyno-load.ts';
import type { EngineState } from './sim.ts';

export interface CrankInput {
  /** Crank speed, rad/s. */
  omega: number;
  /** Engine brake torque on the previous step, N·m: what a dyno estimates from its load cell and the acceleration. */
  engineNm: number;
  /** Engine's own rotating inertia, kg·m². */
  engineInertia: number;
  state: EngineState;
}

export interface LoadTorque {
  /** Torque the load takes from the crank, N·m: positive brakes it, negative drives it. */
  torqueNm: number;
  /** d(torqueNm)/d(omega), for the semi-implicit step. Zero if unknown. */
  dTorque: number;
}

/** What a load may ask of the engine. Every field is optional; the dyno uses only the throttle. */
export interface EngineRequest {
  /** Throttle 0..1 in place of the driver's pedal. */
  throttle?: number;
  /** Ignition and fuel off for this step, as for a flat shift. */
  cutFuel?: boolean;
  /** Engine torque no higher than this, N·m, as for a torque reduction during a shift. */
  maxNm?: number;
}

/** State of the engine when a load takes hold of it, so its controllers can start without a jolt. */
export interface Engagement {
  omega: number;
  engineNm: number;
  /** Throttle that gives the engine's present charge. */
  throttle: number;
}

/**
 * Anything the crank drives.
 *
 * active() is true while the load sets its own torque. While it is false the engine runs its free path, with the
 * load's inertia added: the pedal then asks for a speed, as it does with nothing attached.
 *
 * inertia() is only what is rigidly coupled to the crank at this moment. A load with a slipping element (a clutch,
 * a torque converter) integrates the speed behind it itself and reports zero inertia for it.
 */
export interface CrankLoad {
  active(): boolean;
  inertia(): number;
  step(input: CrankInput, dt: number): LoadTorque;
  engineRequest(): EngineRequest | null;
  command(cmd: LoadCommand): void;
  /** The engine starts driving it again: controllers start from where things are. */
  engage(state: Engagement): void;
  /** Averages since the last call, plain data for postMessage. */
  readings(): LoadReadings;
}

/** The drivetrain adds its own kinds to these unions. */
export type LoadSpec = DynoSpec;
export type LoadCommand = DynoCommand;
export type LoadReadings = DynoReadings;
