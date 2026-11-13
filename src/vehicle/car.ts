// A real car as one record that every section reads: the oil page's lap, the gearboxes, the suspensions and the
// whole-car overview. Facts are stored once (src/data/cars/<id>.ts); what a model needs is derived from them here.
// No DOM and no text, so the audio worklet may import it.
//
// Car frame (ISO 8855): x forward, y left, z up, metres. Every point stored in a CarRecord (packaging, profile, seat)
// is in the FRONT-AXLE frame: origin on the road under the middle of the front axle. It does not move when the car
// builder swaps an engine. The suspension's ChassisModel and ChassisSim work in the CG frame (origin on the road
// under the centre of mass); carFrameToCg() is the only way between the two.

import { LAP_STAND_IN } from './constants.ts';
import type { RoadLoad } from './road-load.ts';
import type { EngineMount, TyreId, VehicleSpec } from './vehicle.ts';

export type Vec3 = readonly [number, number, number];

export interface VehicleBody {
  /** Share of weight on the front axle at rest. */
  frontShare: number;
  /** Null: CG_HEIGHT_ESTIMATE_M, listed in unverified. */
  cgHeightM: number | null;
  wheelbaseM: number;
  trackFrontM: number;
  trackRearM: number;
  /** Whole-vehicle inertias about the whole-vehicle CG, kg·m² (NHTSA where measured); null: from body-estimate.ts. */
  inertia: { ixx: number; iyy: number; izz: number; source: 'nhtsa' | 'maker' | 'estimate' } | null;
  /** Seat point for the comfort measure, front-axle frame. Null: from the wheelbase. */
  seat: Vec3 | null;
}

/** For the body shell, the overview and the engine-bay check (stage A1c). Profile points are in the front-axle frame. */
export interface CarDimensions {
  lengthM: number;
  widthM: number;
  heightM: number;
  frontOverhangM: number;
  rearOverhangM: number;
  groundClearanceM: number;
  shape: 'sedan' | 'hatch' | 'coupe' | 'wagon' | 'roadster';
  /** Side profile (x, z): bonnet front edge, base of the windscreen; roof from x0 to x1 at heightM. */
  profile: { bonnetFront: readonly [number, number]; cowl: readonly [number, number]; roofX: readonly [number, number] };
}

/** Where things sit, front-axle frame (stage A1c). Estimates go to unverified. */
export interface CarPackaging {
  /** Front end of the crankshaft (the timing end). */
  crankFront: Vec3;
  /** Engine bay as a box. The shell's bonnet region is built from it, so the fit check and the picture agree. */
  bay: { min: Vec3; max: Vec3 };
  /** Tailpipe point; side is for the label and the second pipe of a 'both' layout. */
  exhaustExit: { at: Vec3; side: 'left' | 'right' | 'centre' | 'both' };
  fuelTank: Vec3 | null;
  radiator: Vec3 | null;
  /** Turbo and supercharged cars: intercooler centre (front-mounted on the Civic). */
  intercooler: Vec3 | null;
}

export interface CarRecord {
  /** Shared by every section: 'civic-type-r-fk8', 'bmw-m3-e30'. Never 'designer'. */
  id: string;
  /** Make and model as the maker writes them, the same in both languages. */
  name: string;
  years: string;
  /** Catalogue engine: page or page/variant. */
  engine: string;
  /** Gearbox page or page/variant; null until the gearbox section has this car's gearbox. */
  gearbox: string | null;
  /** Suspension layouts of the two axles; null until the suspension section has this car. */
  suspension: { front: string; rear: string } | null;
  mount: EngineMount;
  massKg: number;
  /** 'kerb' excludes the driver, 'eu' includes 75 kg, 'measured' is the NHTSA test mass. drivingMassKg() adds the driver once. */
  massBasis: 'kerb' | 'eu' | 'measured';
  drive: 'fwd' | 'rwd' | 'awd';
  body: VehicleBody;
  /** '245/30 R20'; sizeRear only on staggered cars. Radii come from the sizes (tyre-size.ts) and are never typed in. */
  tyre: { size: string; sizeRear?: string; id: TyreId };
  /** EPA coast-down in SI, if the car is in the EPA test car list for this model year. */
  roadLoad: RoadLoad | null;
  /** Maker's Cd and frontal area, for governed cars without an EPA row. */
  aero: { cd: number; areaM2: number } | null;
  /** Filled by stage A1c for the cars of the overview. */
  dimensions?: CarDimensions;
  packaging?: CarPackaging;
  published: { vmaxKmh: number; vmaxLimited: boolean; vmaxGear: number | null; zeroTo100S: number | null };
  sources: string[];
  /** Fields not confirmed by a source, as paths into the record: 'massKg', 'body.trackFrontM', 'tyre.size'. */
  unverified: string[];
}

/** What the EU mass in running order counts for the driver, and what drivingMassKg adds to the other bases, kg. */
export const DRIVER_KG = 75;

/** CG height of a record without one, m: NHTSA measured 0.50-0.57 m on passenger cars (docs/vehicle-model.md). */
export const CG_HEIGHT_ESTIMATE_M = 0.52;

/** The car with one driver aboard, kg. */
export const drivingMassKg = (car: CarRecord): number => car.massKg + (car.massBasis === 'eu' ? 0 : DRIVER_KG);

/**
 * The mass every derived model carries. Stage A1a keeps the oil page's lap as it was, and that lap carries no driver,
 * so this is the recorded mass; A1b checks the masses against the makers and switches it to drivingMassKg.
 */
export const modelMassKg = (car: CarRecord): number => car.massKg;

/** Share of the weight on the driven wheels at rest; all of it on four-wheel drive. */
export const drivenShare = (car: CarRecord): number => (car.drive === 'awd' ? 1 : car.drive === 'fwd' ? car.body.frontShare : 1 - car.body.frontShare);

/** Distance from the front axle back to the centre of mass, m: a = L·(1 − frontShare). */
export const cgBehindFrontAxleM = (car: CarRecord): number => car.body.wheelbaseM * (1 - car.body.frontShare);

export const cgHeightM = (car: CarRecord): number => car.body.cgHeightM ?? CG_HEIGHT_ESTIMATE_M;

/** Front-axle frame to CG frame: x + a, with a = L·(1 − frontShare); y and z unchanged. */
export function carFrameToCg(car: CarRecord): (p: Vec3) => Vec3 {
  const a = cgBehindFrontAxleM(car);
  return (p) => [p[0] + a, p[1], p[2]];
}

/** CG frame back to the front-axle frame. */
export function cgToCarFrame(car: CarRecord): (p: Vec3) => Vec3 {
  const a = cgBehindFrontAxleM(car);
  return (p) => [p[0] - a, p[1], p[2]];
}

/** The centre of mass in the front-axle frame: (−a, 0, cgHeight). */
export const cgPoint = (car: CarRecord): Vec3 => [-cgBehindFrontAxleM(car), 0, cgHeightM(car)];

/**
 * The lap's VehicleSpec, derived and never stored a second time. Until stage A1b the drag, rolling resistance and
 * tyre radius are the lap's stand-ins for every car, as they were before the records existed.
 */
export function vehicleSpec(car: CarRecord): VehicleSpec {
  return {
    name: car.name,
    massKg: modelMassKg(car),
    cdA: LAP_STAND_IN.cdA,
    clA: LAP_STAND_IN.clA,
    crr: LAP_STAND_IN.crr,
    tyreRadiusM: LAP_STAND_IN.tyreRadiusM,
    drive: car.drive,
    drivenShare: drivenShare(car),
    mount: car.mount,
  };
}

/** The suspension plan's VehicleBody with the mass, for ChassisSpec: the same mass as vehicleSpec. */
export const bodyOf = (car: CarRecord): VehicleBody & { massKg: number } => ({ ...car.body, massKg: modelMassKg(car) });
