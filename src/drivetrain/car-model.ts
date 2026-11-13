// A catalogue car as a drivetrain the solver steps and a vehicle the tests and tables drive: the engine's torque map
// and inertia, the clutch and damper, the gearbox, the axle from its DriveCar record, the wheels and the tyre from
// its CarRecord. Main thread, scripts and tests only: it derives (topology.ts), and the worklet gets the flat core.
// It takes the records themselves: buildCarDrive in src/data/car-drive.ts finds them by the car's id, so this core
// file imports no text data (tests/worklet-imports.test.ts).

import { peakTorque, type EngineTorqueMap } from '../engine/torque-map.ts';
import { drivingMassKg, tyreRadiiM, type CarRecord } from '../vehicle/car.ts';
import { LongitudinalChassis, longitudinalSpec } from '../vehicle/longitudinal.ts';
import { longitudinalOf, tyreFor, type Tyre } from '../vehicle/tyre.ts';
import { VehicleStep } from '../vehicle/vehicle-step.ts';
import { FL, FR, RL, RR } from '../vehicle/wheel-bus.ts';
import { gearboxSpec, type GearboxRecord } from './catalogue.ts';
import { buildCore, CLUTCH, CRANK, DAMPER, gearboxDraft, gearLossDraft, launchDraft, mergeDrafts, type CoreDraft, type DrivetrainCore, type LaunchParts } from './core.ts';
import type { DriveCar } from './drive-car.ts';
import { DISC_DAMPER, dryClutch, MANUAL_SPIN_LOSS } from './elements.ts';
import {
  axleDraft, FINAL_DRIVE_EFFICIENCY, HALFSHAFT_LEFT, HALFSHAFT_RIGHT, PROPSHAFT, PROPSHAFT_FITTINGS, seriesStiffness, shaftTorsion, tubeInertia, tubeTorsion,
  type AxleParts,
} from './final-drive.ts';
import { type Matrix, nullSpace } from './linalg.ts';
import type { DamperDef, DifferentialDef, SpinLossDef } from './spec.ts';
import { buildGearbox, type Gearbox } from './topology.ts';

export interface CarDriveOptions {
  /** Another differential than the car's (the open one of the ice demonstration). */
  differential?: DifferentialDef;
  /** False bolts the pinion to the gearbox output: what the propshaft adds to the shunt. */
  propshaft?: boolean;
  damper?: DamperDef;
}

export interface CarGear {
  name: string;
  /** The shift element that selects it. */
  element: string;
  ratio: number;
  /** 1 − Σ(1 − η_m)·P_rolling/P_in of its power path. */
  efficiency: number;
}

export interface CarDrive {
  car: CarRecord;
  drive: DriveCar;
  gearbox: GearboxRecord;
  box: Gearbox;
  map: EngineTorqueMap;
  launch: LaunchParts;
  axle: AxleParts;
  spinLoss: SpinLossDef;
  /** The drivetrain with its halfshafts anchored to the wheel slots. */
  draft: CoreDraft;
  core: DrivetrainCore;
  /** Per wheel, FL, FR, RL, RR: inertia, kg·m², and rolling radius, m. */
  wheelInertia: Float64Array;
  radius: Float64Array;
  /** Wheel slots of the left and right driven wheels. */
  driven: [number, number];
  tyre: Tyre;
  /** Forward gears, first first. */
  gears: CarGear[];
}

const pathLength = (points: readonly (readonly number[])[]): number =>
  points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0]! - points[i]![0]!, p[1]! - points[i]![1]!, p[2]! - points[i]![2]!), 0);

/** The records a car's drive is built from, found by the car's id in src/data/car-drive.ts. */
export interface CarDriveRecords {
  car: CarRecord;
  drive: DriveCar;
  gearbox: GearboxRecord;
  /** The engine's torque map, catalogueTorqueMap of the car's engine. */
  map: EngineTorqueMap;
}

/** A car ready to drive from its records: throws when its DriveCar has no dynamics yet. */
export function carDriveOf(records: CarDriveRecords, o: CarDriveOptions = {}): CarDrive {
  const { car, drive, gearbox, map } = records;
  const carId = car.id;
  const dyn = drive.dynamics;
  if (!dyn) throw new Error(`${carId}: its DriveCar has no dynamics yet (stage K2b)`);
  if (car.drive === 'awd') throw new Error(`${carId}: four-wheel drive comes with stage K16a`);
  const box = buildGearbox(gearboxSpec(gearbox));

  const clutch = dryClutch(peakTorque(map).nm, dyn.clutch.outerMm, dyn.clutch.innerMm);
  if (dyn.clutch.clampN !== null) clutch.clampN = dyn.clutch.clampN;
  const launch: LaunchParts = { engineInertia: map.inertia, damper: o.damper ?? DISC_DAMPER, clutch };

  const prop = dyn.propshaft;
  const points = drive.driveline.propshaft?.points ?? [];
  let propshaft: AxleParts['propshaft'] = null;
  if (prop && o.propshaft !== false) {
    if (points.length < 2) throw new Error(`${carId}: a propshaft needs its points`);
    const length = pathLength(points);
    const tube = tubeTorsion(prop.tubeOuterMm, prop.tubeWallMm, length);
    propshaft = {
      stiffness: prop.couplingNmPerRad === null ? tube : seriesStiffness(tube, prop.couplingNmPerRad),
      inertia: tubeInertia(prop.tubeOuterMm, prop.tubeWallMm, length) + 2 * PROPSHAFT_FITTINGS,
    };
  }
  const driven: [number, number] = car.drive === 'fwd' ? [FL, FR] : [RL, RR];
  const axle: AxleParts = {
    ratio: drive.finalDrive.ratio,
    efficiency: FINAL_DRIVE_EFFICIENCY[drive.finalDrive.kind],
    differential: o.differential ?? drive.differential,
    propshaft,
    halfshaftStiffness: shaftTorsion(dyn.halfshaft.diameterMm, dyn.halfshaft.lengthM),
    wheelInertia: dyn.wheelInertia,
    slots: driven,
  };
  const draft = mergeDrafts(launchDraft(box.spec.input, launch), gearboxDraft(box), gearLossDraft(box), axleDraft(box.spec.output, axle));
  const r = tyreRadiiM(car);
  const gears = box.states
    .filter((s) => s.kind === 'gear' && s.ratio! > 0)
    .map((s) => ({ name: s.name, element: s.closed[0]!, ratio: s.ratio!, efficiency: s.efficiency ?? 1 }));
  return {
    car, drive, gearbox, box, map, launch, axle, spinLoss: box.spec.spinLoss ?? MANUAL_SPIN_LOSS, draft, core: buildCore(draft),
    wheelInertia: Float64Array.of(dyn.wheelInertia, dyn.wheelInertia, dyn.wheelInertia, dyn.wheelInertia),
    radius: Float64Array.of(r.front, r.front, r.rear, r.rear),
    driven, tyre: tyreFor(car), gears,
  };
}

/** The car on the longitudinal chassis of the gearbox pages, standing still. */
export function carVehicle(cd: CarDrive, chassis = new LongitudinalChassis(longitudinalSpec(cd.car))): VehicleStep {
  const tyre = longitudinalOf(cd.tyre);
  return new VehicleStep({
    core: cd.core, chassis, tyres: [tyre, tyre, tyre, tyre], wheelInertia: cd.wheelInertia, propshaft: cd.core.springs.ids.indexOf(PROPSHAFT),
  });
}

export const WHEEL_LEFT = 'wheel-left';
export const WHEEL_RIGHT = 'wheel-right';

/**
 * The drivetrain with rigid tyres for its natural frequencies and equivalent masses: the halfshafts end on two wheel
 * members that roll together on the body, the body's mass and the undriven wheels on them as m·r² (the left one;
 * the right is linked to it). Built from the same draft, so it is the same drivetrain.
 */
export function modalCore(cd: CarDrive): DrivetrainCore {
  const base = cd.draft;
  const [l, r] = cd.driven;
  const rd = cd.radius[l]!;
  const undriven = [FL, FR, RL, RR].filter((i) => i !== l && i !== r);
  const body = drivingMassKg(cd.car) + undriven.reduce((s, i) => s + cd.wheelInertia[i]! / cd.radius[i]! ** 2, 0);
  const wheelOf = (slot: number | undefined) => (slot === l ? WHEEL_LEFT : slot === r ? WHEEL_RIGHT : null);
  const draft: CoreDraft = {
    ...base,
    members: [...base.members, { id: WHEEL_LEFT, inertia: cd.wheelInertia[l]! + body * rd * rd }, { id: WHEEL_RIGHT, inertia: cd.wheelInertia[r]! }],
    links: [...base.links, [[WHEEL_LEFT, 1], [WHEEL_RIGHT, -1]]],
    springs: base.springs.map((s) => (s.anchor === undefined ? s : { id: s.id, a: s.a, b: wheelOf(s.anchor), stiffness: s.stiffness, damping: s.damping })),
  };
  return buildCore(draft);
}

/**
 * Mass at the tyres of everything that moves as one with these elements locked and these members held, the springs
 * taken as rigid, kg: 2·(kinetic energy) at 1 m/s. The rigid motion must be the only one left.
 */
export function rigidMass(cd: CarDrive, core: DrivetrainCore, locked: string[], held: string[] = []): number {
  const { n, P } = core;
  const rows: Matrix = [
    ...locked.map((id) => Array.from(core.elements.rows.subarray(core.elements.ids.indexOf(id) * n, (core.elements.ids.indexOf(id) + 1) * n))),
    ...core.springs.ids.map((_, j) => Array.from(core.springs.rows.subarray(j * n, (j + 1) * n))),
    ...held.map((id) => Array.from(P.subarray(core.members.indexOf(id) * n, (core.members.indexOf(id) + 1) * n))),
  ];
  for (const id of locked) if (!core.elements.ids.includes(id)) throw new Error(`rigidMass: no element ${id}`);
  const N = nullSpace(rows, n).basis;
  if ((N[0]?.length ?? 0) !== 1) throw new Error(`rigidMass: ${N[0]?.length ?? 0} motions left, not one`);
  const v = N.map((row) => row[0]!);
  const wheel = core.members.indexOf(WHEEL_LEFT);
  let ww = 0;
  for (let k = 0; k < n; k++) ww += P[wheel * n + k]! * v[k]!;
  let e = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) e += v[a]! * core.mass[a * n + b]! * v[b]!;
  const speed = ww * cd.radius[cd.driven[0]]!;
  return e / (speed * speed);
}

export { CLUTCH, CRANK, DAMPER, HALFSHAFT_LEFT, HALFSHAFT_RIGHT, PROPSHAFT };
