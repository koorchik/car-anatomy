// The car a design drives (gearbox plan, the designer's car group): the catalogue engine's torque map, the base car's body with
// the design's mass, weight split, tyres and drag, the clutch and damper the design chose, and the inertias the
// quasi-static model needs. Built from the same parts and constants as car-model.ts, so a copy of a catalogue car is
// that car: the same road load, tyre, wheels, propshaft and final drive efficiency (drivetrain-vehicle 7 holds it).

import { CARS } from '../data/cars.ts';
import { driveCarById } from '../data/drive-cars.ts';
import { engineById } from '../data/engines.ts';
import { catalogueTorqueMap } from '../designer/torque-map.ts';
import { DISC_DAMPER, DMF_DAMPER, DRY_ORGANIC, DRY_STRIBECK, MANUAL_SPIN_LOSS, meanRadius, stiffDisc, WET_PACK } from '../drivetrain/elements.ts';
import { CASE_INERTIA, FINAL_DRIVE_EFFICIENCY, PINION_INERTIA, PROPSHAFT_FITTINGS, SIDE_INERTIA, tubeInertia } from '../drivetrain/final-drive.ts';
import type { DamperDef, FrictionDef, SpinLossDef } from '../drivetrain/spec.ts';
import type { EngineTorqueMap } from '../engine/torque-map.ts';
import { cgHeightM, type CarRecord } from '../vehicle/car.ts';
import { AIR_DENSITY, G } from '../vehicle/constants.ts';
import { roadLoadCoeffs, type RoadLoadCoeffs } from '../vehicle/road-load.ts';
import { parseTyreSize, rollingRadiusM } from '../vehicle/tyre-size.ts';
import { tyreAt, type Tyre } from '../vehicle/tyre.ts';
import type { GearboxDesign } from './design.ts';

/**
 * One wheel with its tyre, hub and disc when the base car's record gives none, kg·m² [estimate: the 16-inch wheel of
 * the gearbox plan, as the E30's DriveCar takes it].
 */
export const WHEEL_INERTIA_ESTIMATE = 0.9;
/**
 * A propshaft for a layshaft box in a car whose record has none [estimate, the E30's]: a 70 × 1.6 mm steel tube over
 * half the wheelbase, with its fittings.
 */
const PROPSHAFT_ESTIMATE = { outerMm: 70, wallMm: 1.6, wheelbaseShare: 0.5 };
/** Ceramic (cerametallic) dry facing [estimate: above the organic's 0.25–0.37, research §6 gives no figure]. */
const DRY_CERAMIC = { muStatic: 0.4, muKinetic: 0.36 } as const;
/** Friction faces of a wet multi-plate clutch [estimate: four plates]. */
const WET_FACES = 8;

export interface DesignVehicle {
  base: CarRecord;
  map: EngineTorqueMap;
  roadLoad: RoadLoadCoeffs;
  /** The driven tyre, fitted to a quarter of the driving mass, as tyreFor() fits a catalogue car's. */
  tyre: Tyre;
  /** Rolling radius of the driven and of the other axle's tyres, m. */
  radius: number;
  otherRadius: number;
  /** One wheel, kg·m². */
  wheelInertia: number;
  massKg: number;
  frontShare: number;
  cgHeightM: number;
  wheelbaseM: number;
  drive: GearboxDesign['drive'];
  clutch: FrictionDef;
  damper: DamperDef;
  spinLoss: SpinLossDef;
  /** The final drive outside the box (a layshaft box's axle): ratio and loaded efficiency; 1 and 1 for a transaxle. */
  axleRatio: number;
  axleEfficiency: number;
  /** Inertia that turns with the wheels beyond the box, per unit wheel speed, kg·m²: axle parts and the propshaft. */
  axleInertia: number;
}

/** The design's clutch as the core's friction element: the inner diameter two thirds of the outer, as on the E30's 228/152. */
export function designClutch(d: GearboxDesign): FrictionDef {
  const wet = d.clutch === 'wet';
  const mu = wet ? WET_PACK : d.facing === 'ceramic' ? DRY_CERAMIC : DRY_ORGANIC;
  const faces = wet ? WET_FACES : d.clutch === 'twin-dry' ? 4 : 2;
  return { faces, rIn: d.clutchMm / 3, rOut: d.clutchMm / 2, ...mu, stribeck: DRY_STRIBECK, clampN: d.clampN, actuator: wet ? 'hydraulic' : 'diaphragm' };
}

/** Kinetic capacity of the clutch, N·m: what it passes while it slips at the launch. */
export const clutchKineticNm = (f: FrictionDef): number => f.muKinetic * f.clampN * meanRadius(f) * f.faces;

export function designDamper(d: GearboxDesign, map: EngineTorqueMap): DamperDef {
  return d.damper === 'dmf' ? DMF_DAMPER : d.damper === 'stiff' ? stiffDisc(map.inertia) : DISC_DAMPER;
}

const vehicles = new Map<string, DesignVehicle>();

export function designVehicle(d: GearboxDesign): DesignVehicle {
  const key = JSON.stringify([d.type, d.car, d.engine, d.massKg, d.drive, d.frontShare, d.tyreSize, d.tyre, d.cdA, d.crr, d.clutch, d.clutchMm, d.clampN, d.facing, d.damper, d.finalDrive]);
  let v = vehicles.get(key);
  if (v) return v;
  const base = CARS[d.car];
  const spec = engineById(d.engine);
  if (!base || !spec) throw new Error(`designer: no car ${d.car} or engine ${d.engine}`);
  const map = catalogueTorqueMap(spec);
  const own = roadLoadCoeffs(base);
  const m = d.massKg;
  const c = 0.5 * AIR_DENSITY * d.cdA;
  // The rolling part from C_rr; the speed-linear part per kg as the base car has it; drag from C_dA.
  const roadLoad: RoadLoadCoeffs = { a: d.crr * m * G, b: (own.b / own.massKg) * m, c, aeroC: (c * own.aeroC) / own.c, massKg: m };
  const drive = driveCarById(d.car);
  const other = d.drive === 'rwd' ? base.tyre.size : (base.tyre.sizeRear ?? base.tyre.size);
  let propshaft = 0;
  if (d.type === 'layshaft') {
    const prop = drive?.dynamics?.propshaft;
    const points = drive?.driveline.propshaft?.points;
    if (prop && points && points.length > 1) {
      const length = points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1], p[2] - points[i]![2]), 0);
      propshaft = tubeInertia(prop.tubeOuterMm, prop.tubeWallMm, length) + 2 * PROPSHAFT_FITTINGS;
    } else {
      const e = PROPSHAFT_ESTIMATE;
      propshaft = tubeInertia(e.outerMm, e.wallMm, e.wheelbaseShare * base.body.wheelbaseM) + 2 * PROPSHAFT_FITTINGS;
    }
  }
  const layshaft = d.type === 'layshaft';
  const axleRatio = layshaft ? d.finalDrive : 1;
  v = {
    base,
    map,
    roadLoad,
    tyre: tyreAt(d.tyre, (m * G) / 4),
    radius: rollingRadiusM(parseTyreSize(d.tyreSize)),
    otherRadius: rollingRadiusM(parseTyreSize(other)),
    wheelInertia: drive?.dynamics?.wheelInertia ?? WHEEL_INERTIA_ESTIMATE,
    massKg: m,
    frontShare: d.frontShare,
    cgHeightM: cgHeightM(base),
    wheelbaseM: base.body.wheelbaseM,
    drive: d.drive,
    clutch: designClutch(d),
    damper: designDamper(d, map),
    spinLoss: MANUAL_SPIN_LOSS,
    axleRatio,
    // A layshaft box drives a rear axle with a hypoid pair (car-model.ts takes the DriveCar's kind; the E30's is hypoid).
    axleEfficiency: layshaft ? FINAL_DRIVE_EFFICIENCY.hypoid : 1,
    // The pinion with its half of the propshaft and the propshaft's front half turn with the box's output; the case and
    // the side gears with the wheels (final-drive.ts). A transaxle's case is a member of the box.
    axleInertia: layshaft ? (PINION_INERTIA + propshaft) * axleRatio ** 2 + CASE_INERTIA + 2 * SIDE_INERTIA : 2 * SIDE_INERTIA,
  };
  if (vehicles.size > 32) vehicles.clear();
  vehicles.set(key, v);
  return v;
}
