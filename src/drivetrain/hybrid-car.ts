// What the drivetrain needs to know about a hybrid car on top of its shared record (src/data/cars/<id>.ts): which
// power-split box, the differential, the damper and the halfshafts, the battery and the control's own figures. Each
// car has its own file in src/data/hybrid-cars/, keyed by the shared car id. A power-split car has no clutch, so it is
// not a DriveCar (drive-car.ts), whose dynamics start from one.

import type { BatteryDef } from './battery.ts';
import type { DamperDef, DifferentialDef } from './spec.ts';

/** The control's figures that belong to the car, not to the code (control/ths.ts). */
export interface ThsFigures {
  /** Power the whole system gives, kW: the maker's system output. */
  systemKw: number;
  /** Below this road speed the control may drive on MG2 alone, km/h. */
  evMaxKmh: number;
  /** The engine never turns faster than this, rpm. */
  engineMaxRpm: number;
}

export interface HybridCar {
  /** Shared car id. */
  car: string;
  /** Gearbox record of the power-split box. */
  gearbox: string;
  differential: DifferentialDef;
  /** Spring and mass between the crank and the box's input (the transaxle damper). */
  damper: DamperDef;
  /** One driven halfshaft as a solid steel shaft between its joints, mm and m. */
  halfshaft: { diameterMm: number; lengthM: number };
  /** One wheel with its tyre, hub and brake disc, kg·m². */
  wheelInertia: number;
  battery: BatteryDef;
  control: ThsFigures;
  sources: string[];
  /** Field paths not confirmed against a source. */
  unverified: string[];
}
