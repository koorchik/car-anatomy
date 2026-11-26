// A car the visitor puts together (whole-car plan, the car builder): a real donor car and the units that go into it.
// The donor decides everything the sections do not model (body, dimensions, aerodynamics, where the engine sits,
// wheelbase and tracks), so the builder never invents a body; it moves units between real ones. Each unit comes from its
// section's catalogue or designer, and every figure of the build comes from that section's model (evaluate.ts).
//
// A ready car of the site is the build with nothing replaced (factoryBuild): the drive mode (stage C6a) takes a build,
// so #/car/<car>?m=drive and #/car/designer/<code>?m=drive open the same drive. Plain data, no DOM and no text.

import { CAR_LIST } from '../data/cars.ts';
import { driveCarById } from '../data/drive-cars.ts';
import type { Design } from '../designer/design.ts';
import type { SumpKind } from '../engine/systems-spec.ts';
import type { DiffChoice, GearboxDesign } from '../gearbox-designer/design.ts';
import type { ChassisDesign } from '../suspension-designer/design.ts';
import type { CarRecord } from '../vehicle/car.ts';
import type { TyreId } from '../vehicle/vehicle.ts';

export type BuildEngine = { catalogue: string } | { design: Design };
export type BuildGearbox = { catalogue: string } | { design: GearboxDesign } | { ideal: IdealGearbox };

/** The oil page's stand-in box: this many gears in a geometric row, first over top `spread`, top at the limiter at v_max. */
export interface IdealGearbox {
  gears: number;
  spread: number;
}

export interface CarBuild {
  /** CarRecord id: body, dimensions, aero, packaging, tyres and, unless replaced, suspension and gearbox. */
  donor: string;
  engine: BuildEngine;
  /** Null: the donor's. */
  gearbox: BuildGearbox | null;
  /** Null: the gearbox's own. */
  finalDrive: number | null;
  /** Null: the gearbox's own. Only the drive (stage C6a) feels it: the quasi-static figures have no differential. */
  differential: DiffChoice | null;
  /** Null: the donor's (the suspension catalogue's copy of it, when the catalogue has the donor). */
  suspension: { catalogue: string } | { design: ChassisDesign } | null;
  /** Compound and the driven axle's size; null: the donor's. */
  tyre: { id: TyreId; size: string } | null;
  /** Piston engines only: the sump type and oil, as in the engine designer; null: the engine's own. */
  lubrication: { sump: SumpKind; oilL: number } | null;
}

/** The gear count and spread of an ideal box, when the visitor first picks one: the oil page's (DRIVELINE). */
export const IDEAL_DEFAULT: IdealGearbox = { gears: 6, spread: 4.3 };
export const IDEAL_GEARS = { min: 3, max: 10 } as const;
export const IDEAL_SPREAD = { min: 2, max: 8 } as const;
/** Final drive the builder offers, as the gearbox pages' settings panel (the build order's A3). */
export const FINAL_DRIVE = { min: 2, max: 5.5 } as const;

/**
 * Cars a build can start from: those whose body the overview draws (dimensions and packaging, for the bay and the
 * shell) and whose driveline the gearbox section models (a DriveCar). A car gains both as the overview grows (stage C8).
 */
export const DONORS: readonly CarRecord[] = CAR_LIST.filter((c) => c.dimensions && c.packaging && driveCarById(c.id));

export const donorById = (id: string): CarRecord | undefined => DONORS.find((c) => c.id === id);

/** The default donor: the Civic, as the plan's entry opens it. */
export const DEFAULT_DONOR = 'civic-type-r-fk8';

/** The car as it left the factory: its own engine and nothing replaced. */
export const factoryBuild = (donor: string): CarBuild => {
  const car = donorById(donor) ?? donorById(DEFAULT_DONOR)!;
  return { donor: car.id, engine: { catalogue: car.engine }, gearbox: null, finalDrive: null, differential: null, suspension: null, tyre: null, lubrication: null };
};

/** Nothing replaced: the build is its donor as made. */
export const isFactory = (b: CarBuild): boolean => JSON.stringify(b) === JSON.stringify(factoryBuild(b.donor));
