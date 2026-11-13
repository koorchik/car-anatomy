// What only the drivetrain needs to know about a real car, on top of its shared record (src/data/cars/<id>.ts):
// which gearbox, the final drive, the differential and where the driveline runs. Each car has its own file in
// src/data/drive-cars/, keyed by the car id that every section shares ('bmw-m3-e30').
//
// The solver stage adds the dynamic fields (clutch, propshaft and halfshaft stiffness, wheel inertia).

import type { DifferentialDef } from './spec.ts';

/**
 * A point in the car's FRONT-AXLE frame (ISO 8855: x forward, y left, z up, metres; origin on the road under the
 * middle of the front axle), the frame every point of a car record uses.
 */
export type CarPoint = readonly [number, number, number];

/**
 * A transaxle holds its final drive in its own case, and its spec has it (GearboxSpec.finalDrive): the gearbox's output
 * is then the differential case and nothing applies this ratio a second time. The record still states the published
 * figure, and tests hold the gearbox's teeth to it.
 */
export interface FinalDriveDesc {
  /** Pinion to wheels, as published. */
  ratio: number;
  /** Pinion and crown wheel teeth; null when not published. */
  teeth: [number, number] | null;
  kind: 'hypoid' | 'spiral-bevel' | 'helical';
}

export interface DrivelineGeometry {
  /**
   * Centre of the LEFT halfshaft's inner joint at each driven axle; the right one mirrors it in y. The suspension
   * takes its halfshafts from here, so the two sections draw the same shafts.
   */
  diffOutputs: { front?: CarPoint; rear?: CarPoint };
  /**
   * Propshaft of a car with the gearbox away from the driven axle: gearbox output flange, centre bearings, pinion
   * flange, in order. Null for a transaxle.
   */
  propshaft: { points: CarPoint[] } | null;
}

export interface DriveCar {
  /** Shared car id. */
  car: string;
  /** Gearbox record: page or page/variant ('manual-rwd'). */
  gearbox: string;
  finalDrive: FinalDriveDesc;
  differential: DifferentialDef;
  /** Centre differential, AWD only. */
  centre?: DifferentialDef;
  driveline: DrivelineGeometry;
  sources: string[];
  /** Field paths not confirmed against a source. */
  unverified: string[];
}
