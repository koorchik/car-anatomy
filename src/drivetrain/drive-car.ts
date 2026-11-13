// What only the drivetrain needs to know about a real car, on top of its shared record (src/data/cars/<id>.ts):
// which gearbox, the final drive, the differential and where the driveline runs. Each car has its own file in
// src/data/drive-cars/, keyed by the car id that every section shares ('bmw-m3-e30').
//
// Stage K2b adds what the solver needs to drive the car (`dynamics`): the clutch, the propshaft, the halfshafts and
// the wheels' inertia. A car without it can stand on the table but not drive.

import type { DifferentialDef } from './spec.ts';

/**
 * A point in the car's FRONT-AXLE frame (ISO 8855: x forward, y left, z up, metres; origin on the road under the
 * middle of the front axle), the frame every point of a car record uses.
 */
export type CarPoint = readonly [number, number, number];

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

/** A propshaft as built: the tube's size and what joins it. Its length is the polyline of `driveline.propshaft.points`. */
export interface PropshaftDef {
  /** Steel tube: outer diameter and wall, mm. */
  tubeOuterMm: number;
  tubeWallMm: number;
  /** Rubber flex coupling (giubo) at the gearbox output, N·m/rad; null when a joint bolts on directly. */
  couplingNmPerRad: number | null;
  /** Universal joints, for the 3D and the Cardan demonstration; the dynamics takes them as constant-velocity on average. */
  ujoints: number;
  centreBearing: boolean;
}

export interface DrivelineDynamics {
  /** Dry single-plate clutch: facing diameters, mm; clamp null sizes it for CLUTCH_RESERVE times the engine's peak torque. */
  clutch: { outerMm: number; innerMm: number; clampN: number | null };
  /** Null on a car whose final drive sits in the gearbox (transaxle). */
  propshaft: PropshaftDef | null;
  /** One driven halfshaft as a solid steel shaft between its joints, mm and m. */
  halfshaft: { diameterMm: number; lengthM: number };
  /** One wheel with its tyre, hub and brake disc, kg·m². */
  wheelInertia: number;
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
  /** What the solver needs to drive it (stage K2b); absent, the car can be shown but not driven. */
  dynamics?: DrivelineDynamics;
  sources: string[];
  /** Field paths not confirmed against a source. */
  unverified: string[];
}
