// A power-split hybrid as a drivetrain the solver steps and a load the engine drives (stage K15a): the crank and the
// transaxle damper, the power-split box with its motors, the axle with the differential and the halfshafts, the wheels
// and the tyre from the car's record, and the control's plain data (control/ths.ts). Main thread, scripts and tests:
// it derives (topology.ts); the worklet gets the flat core inside HybridLoadSpec. It takes the records themselves;
// buildPowerSplitDrive in src/data/car-drive.ts finds them by the car's id.

import type { EngineSpec } from '../engine/spec.ts';
import { brakeTorque, type EngineTorqueMap } from '../engine/torque-map.ts';
import { drivingMassKg, drivenTyreRadiusM, tyreRadiiM, type CarRecord } from '../vehicle/car.ts';
import { longitudinalSpec } from '../vehicle/longitudinal.ts';
import { tyreFor, type Tyre } from '../vehicle/tyre.ts';
import { CRANK_SLOT } from '../vehicle/vehicle-load.ts';
import { FL, FR } from '../vehicle/wheel-bus.ts';
import { brakeTorques } from './car-load.ts';
import { gearboxSpec, type GearboxRecord } from './catalogue.ts';
import { LINE_SHARE, type MotorLimits, type ThsSpec } from './control/ths.ts';
import { anchorCrank, buildCore, gearboxDraft, launchDraft, memberIndex, mergeDrafts, type CoreDraft, type DrivetrainCore } from './core.ts';
import { axleDraft, FINAL_DRIVE_EFFICIENCY, shaftTorsion, type AxleParts } from './final-drive.ts';
import type { HybridCar } from './hybrid-car.ts';
import { MG1, MG1_ROTOR, MG2, MG2_ROTOR, splitKinematics, type SplitKinematics } from './layouts/power-split.ts';
import { stableStep } from './modes.ts';
import type { MotorDef } from './spec.ts';
import { buildGearbox, type Gearbox } from './topology.ts';
import type { HybridLoadSpec } from '../vehicle/hybrid-load.ts';

const RPM = 30 / Math.PI;
/** The control keeps the engine this far under its rev limiter, rpm. */
const LIMITER_MARGIN_RPM = 200;

/** The records a power-split car is built from, found by the car's id in src/data/car-drive.ts. */
export interface PowerSplitRecords {
  car: CarRecord;
  hybrid: HybridCar;
  gearbox: GearboxRecord;
  /** The engine's torque map, catalogueTorqueMap of the car's engine. */
  map: EngineTorqueMap;
  /** The engine itself, for its simulation (scripts and tests run the real EngineSim on the crank). */
  engine: EngineSpec;
}

export interface PowerSplitDrive extends PowerSplitRecords {
  box: Gearbox;
  kin: SplitKinematics;
  axle: AxleParts;
  /** The drivetrain with the crank as a member and the halfshafts anchored to the wheels. */
  draft: CoreDraft;
  /** Per wheel, FL, FR, RL, RR: inertia, kg·m², and rolling radius, m. */
  wheelInertia: Float64Array;
  radius: Float64Array;
  tyre: Tyre;
  mg1: MotorLimits;
  mg2: MotorLimits;
}

const limits = (m: MotorDef): MotorLimits => ({ maxNm: m.maxNm, maxW: 1000 * m.maxKw, maxOmega: m.maxRpm / RPM });

/** A power-split car ready to drive from its records. */
export function powerSplitDriveOf(records: PowerSplitRecords): PowerSplitDrive {
  const { car, hybrid, gearbox } = records;
  if (car.drive !== 'fwd') throw new Error(`${car.id}: a power-split car here drives its front wheels`);
  const box = buildGearbox(gearboxSpec(gearbox));
  const kin = splitKinematics(box);
  const motor = (id: string) => {
    const m = box.spec.motors?.find((x) => x.id === id);
    if (!m) throw new Error(`${box.spec.id}: no motor ${id}`);
    return m;
  };
  // The final drive is in the box (its output is the differential case), so the axle adds no ratio of its own; its
  // loaded loss stands for the counter pair and the final pair, two helical meshes. The power-split and reduction sets'
  // own mesh losses are left out [estimate: they roll a small share of the power].
  const axle: AxleParts = {
    ratio: 1,
    efficiency: FINAL_DRIVE_EFFICIENCY.helical ** 2,
    differential: hybrid.differential,
    propshaft: null,
    halfshaftStiffness: shaftTorsion(hybrid.halfshaft.diameterMm, hybrid.halfshaft.lengthM),
    wheelInertia: hybrid.wheelInertia,
    slots: [FL, FR],
  };
  const launch = { engineInertia: records.map.inertia, damper: hybrid.damper, clutch: null };
  const draft = mergeDrafts(launchDraft(box.spec.input, launch), gearboxDraft(box), axleDraft(box.spec.output, axle));
  const r = tyreRadiiM(car);
  return {
    ...records, box, kin, axle, draft,
    wheelInertia: Float64Array.of(hybrid.wheelInertia, hybrid.wheelInertia, hybrid.wheelInertia, hybrid.wheelInertia),
    radius: Float64Array.of(r.front, r.front, r.rear, r.rear),
    tyre: tyreFor(car),
    mg1: limits(motor(MG1)),
    mg2: limits(motor(MG2)),
  };
}

/**
 * The engine's operating line: for each power, the lowest speed from `min` to `max` at which it is LINE_SHARE of the
 * full-load torque; past that share at `max`, the full load there. Powers rise with the speeds.
 */
export function operatingLine(map: EngineTorqueMap, minOmega: number, maxOmega: number): { lineW: number[]; lineOmega: number[] } {
  const lineW: number[] = [];
  const lineOmega: number[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const w = minOmega + ((maxOmega - minOmega) * i) / steps;
    const p = LINE_SHARE * brakeTorque(map, w * RPM, 1) * w;
    if (lineW.length && p <= lineW[lineW.length - 1]!) continue;
    lineW.push(p);
    lineOmega.push(w);
  }
  lineW.push(brakeTorque(map, maxOmega * RPM, 1) * maxOmega);
  lineOmega.push(maxOmega);
  return { lineW, lineOmega };
}

/** Inertia the engine's speed sees with the output held, kg·m²: the crank, the damper's mass and the box through P. */
function engineSideInertia(pd: PowerSplitDrive, core: DrivetrainCore): number {
  const { box } = pd;
  let j = pd.map.inertia + pd.hybrid.damper.inertia;
  box.members.forEach((_, i) => (j += box.inertia[i]! * box.P[i]![0]! ** 2));
  return j + core.inertia[memberIndex(core, 'disc-hub')]!;
}

/** The control's plain data for this car on this core. */
export function thsSpec(pd: PowerSplitDrive, core: DrivetrainCore): ThsSpec {
  const { car, hybrid, map, kin } = pd;
  const minOmega = map.idleRpm / RPM;
  // Clear of the rev limiter, which cuts at limitRpm and lets go 180 rpm lower (loaded-crank.ts): an engine held on it
  // would bounce between fuel and cut.
  const maxOmega = Math.min(hybrid.control.engineMaxRpm, map.limitRpm - LIMITER_MARGIN_RPM) / RPM;
  const line = operatingLine(map, minOmega, maxOmega);
  // The engine's peak torque reaches the output through the ring: −k.mg1[1]/k.mg1[0] = (z_r/(z_s + z_r))·i_ring.
  const peakNm = Math.max(...Array.from({ length: 41 }, (_, i) => brakeTorque(map, (minOmega + ((maxOmega - minOmega) * i) / 40) * RPM, 1)));
  const engineAtOutput = (-kin.mg1[1] / kin.mg1[0]) * peakNm;
  return {
    kind: 'ths',
    mg1: memberIndex(core, MG1_ROTOR),
    mg2: memberIndex(core, MG2_ROTOR),
    output: memberIndex(core, pd.box.spec.output),
    kin,
    mg1Limits: pd.mg1,
    mg2Limits: pd.mg2,
    battery: hybrid.battery,
    map,
    engineInertia: engineSideInertia(pd, core),
    startOmega: map.idleRpm / RPM,
    minOmega,
    maxOmega,
    ...line,
    systemW: 1000 * hybrid.control.systemKw,
    maxOutputNm: pd.mg2.maxNm * Math.abs(kin.mg2) + engineAtOutput,
    evMaxSpeed: hybrid.control.evMaxKmh / 3.6,
    vmaxCap: car.published.vmaxLimited ? car.published.vmaxKmh / 3.6 : null,
    radius: drivenTyreRadiusM(car),
    massKg: drivingMassKg(car),
    brakeNm: brakeTorques(pd),
  };
}

/** The car standing still with the engine off, as plain data for HybridLoad on either thread. */
export function hybridLoadSpec(pd: PowerSplitDrive): HybridLoadSpec {
  const core = buildCore(anchorCrank(pd.draft, CRANK_SLOT));
  return {
    kind: 'hybrid',
    drivetrain: core,
    chassis: { kind: 'longitudinal', core: longitudinalSpec(pd.car) },
    tyres: [pd.tyre, pd.tyre, pd.tyre, pd.tyre],
    wheelInertia: Array.from(pd.wheelInertia),
    control: thsSpec(pd, core),
    maxStepS: Math.min(0.001, stableStep(core)),
  };
}
