// The catalogue as designs (suspensions plan, the designer's chain; build order, the rule on the
// suspension catalogue and the designer). A catalogue chassis is a design, and its ChassisSpec comes the one way every design's does:
// catalogueChassis = chassisToSpec(resolveChassis(design)). So a car of the catalogue opens in the designer as it is,
// and a new parameter of the designer reaches the catalogue at once. Suspension pages merged after this stage write
// their cars as designs and take their specs from catalogueChassis.
//
// The real cars come from the shared records: src/data/cars/<id>.ts gives the mass, centre of mass, wheelbase, tracks,
// drive and tyres, src/data/chassis/<id>.ts the layouts, the knuckle and which axles carry an anti-roll bar, the car's
// DriveCar its final drive and the half-shafts' inner joints. What no maker publishes stays typical and is marked so:
// the hardpoints (the templates' typical geometry), the springs (the typical ride frequency), the dampers (the
// «comfort» preset), the bars' sizes (BAR_TYPICAL_MM) and the unsprung masses (40 kg a corner, as car-chassis.ts has).

import { CARS } from '../data/cars.ts';
import { CHASSIS_CARS } from '../data/chassis.ts';
import { driveCarById } from '../data/drive-cars.ts';
import type { DriveCar } from '../drivetrain/drive-car.ts';
import type { AxleChoice, ChassisCar } from '../suspension/car-chassis.ts';
import { UNSPRUNG_KG } from '../suspension/car-chassis.ts';
import type { ChassisSpec } from '../suspension/spec.ts';
import { SPLIT_KNUCKLE_DEFAULTS } from '../suspension/templates/macpherson.ts';
import { cgHeightM, drivingMassKg, type CarRecord } from '../vehicle/car.ts';
import { parseTyreSize } from '../vehicle/tyre-size.ts';
import { resolveChassis } from './constraints.ts';
import { DEFAULT_CAR, typicalAxle } from './defaults.ts';
import { designOf, type AxleEnd, type AxleParams, type ChassisDesign } from './design.ts';
import { wheelCentreZM } from './geometry.ts';
import { chassisToSpec } from './to-spec.ts';

/** A chassis of the catalogue: its id (the shared car id for a real car) and its design. */
export interface ChassisCatalogueEntry {
  id: string;
  design: ChassisDesign;
}

/** Bar diameters of a car that has bars but publishes no size, mm: the typical chassis' (an estimate). */
export const BAR_TYPICAL_MM: Record<AxleEnd, number> = { F: 22, R: 16 };

const mm = (m: number): number => Math.round(m * 1e6) / 1e3;

/** One axle of a real car. */
function carAxle(car: CarRecord, chassis: ChassisCar, drive: DriveCar | undefined, end: AxleEnd): AxleParams {
  const choice: AxleChoice = end === 'F' ? chassis.front : chassis.rear;
  const front = end === 'F';
  const size = parseTyreSize(front ? car.tyre.size : (car.tyre.sizeRear ?? car.tyre.size));
  let a: AxleParams = {
    ...typicalAxle(choice.layout, end),
    trackMm: mm(front ? car.body.trackFrontM : car.body.trackRearM),
    tyreWidthMm: size.widthMm,
    tyreAspect: size.aspect,
    rimIn: size.rimIn,
    barMm: (front ? chassis.antiRollBars.front : chassis.antiRollBars.rear) ? BAR_TYPICAL_MM[end] : 0,
    unsprungKg: UNSPRUNG_KG,
  };
  if (choice.layout === 'macpherson') {
    a = { ...a, knuckle: choice.knuckle };
    if (choice.knuckle !== 'plain') {
      const split = SPLIT_KNUCKLE_DEFAULTS[choice.knuckle];
      a = { ...a, kingpinOffsetMm: mm(split.kingpinOffsetM), kpiDeg: split.kpiDeg };
    }
  }
  // The inner joint where the gearbox's stub ends (DriveCar.driveline.diffOutputs, front-axle frame).
  const joint = drive?.driveline.diffOutputs[front ? 'front' : 'rear'];
  if (joint) a = { ...a, diffOutputYMm: mm(joint[1]), diffOutputDzMm: mm(joint[2] - wheelCentreZM(a)) };
  return a;
}

/** A real car's chassis as a design. */
export function designFromCar(car: CarRecord, chassis: ChassisCar, drive?: DriveCar): ChassisDesign {
  if (chassis.car !== car.id) throw new Error(`The chassis of ${chassis.car} is not ${car.id}'s`);
  if (drive && drive.car !== car.id) throw new Error(`The drivetrain of ${drive.car} is not ${car.id}'s`);
  return designOf(
    {
      ...DEFAULT_CAR,
      car: car.id,
      massKg: drivingMassKg(car),
      frontShare: car.body.frontShare,
      cgHeightMm: mm(cgHeightM(car)),
      wheelbaseMm: mm(car.body.wheelbaseM),
      drive: car.drive,
      finalDrive: drive ? drive.finalDrive.ratio : DEFAULT_CAR.finalDrive,
      tyre: car.tyre.id,
    },
    carAxle(car, chassis, drive, 'F'),
    carAxle(car, chassis, drive, 'R'),
  );
}

/** The real cars of the catalogue, by shared car id: every car with a chassis (src/data/chassis.ts). */
export const CHASSIS_CATALOGUE: readonly ChassisCatalogueEntry[] = Object.values(CHASSIS_CARS).map((chassis) => {
  const car = CARS[chassis.car];
  if (!car) throw new Error(`The chassis of ${chassis.car} has no car record`);
  return { id: car.id, design: designFromCar(car, chassis, driveCarById(car.id)) };
});

/** A catalogue entry by id, or undefined. */
export const catalogueEntry = (id: string): ChassisCatalogueEntry | undefined => CHASSIS_CATALOGUE.find((e) => e.id === id);

/** The ChassisSpec of a catalogue design: the designer's own chain. */
export function catalogueChassis(entry: ChassisCatalogueEntry | ChassisDesign): ChassisSpec {
  const design = 'design' in entry ? entry.design : entry;
  return chassisToSpec(resolveChassis(design));
}
