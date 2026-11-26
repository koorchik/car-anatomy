// The full dynamic run of a design (gearbox plan, stage 10: the button «Проїхати»): the whole core on the longitudinal
// chassis, driven by the scripted driver of runs.ts, on the car the quasi-static model drives (vehicle.ts). The page
// shows its speed over time and plays its engine speed back through the sound, and the plan asks that its 0–100 km/h
// lands within 3 % of the panel's quasi-static figure (tests/gearbox-designer-run).
//
// The drivetrain is built here from the design's parts rather than through carDriveOf, which reads a catalogue car's
// records: the design's clutch (facing, plates), damper and differential, and a transaxle's final drive inside the box
// (the axle then adds ratio 1 with no loss). Two things the core cannot drive yet stand in for the real ones:
// - a helical (Torsen-type) differential drives as a plate one with the locking value its bias ratio gives,
//   S = (TBR − 1)/(TBR + 1), the same split of torque between the wheels (the core's helical element comes with K6a);
// - a car of the catalogue without its own drivetrain dynamics takes the E30's halfshafts [estimate].
//
// No DOM: the page calls it, the tests run it in Node.

import { CRANK, type CarDrive, type CarGear } from '../drivetrain/car-model.ts';
import type { GearboxRecord } from '../drivetrain/catalogue.ts';
import { buildCore, gearboxDraft, gearLossDraft, launchDraft, memberIndex, mergeDrafts } from '../drivetrain/core.ts';
import type { DriveCar } from '../drivetrain/drive-car.ts';
import { axleDraft, PROPSHAFT_FITTINGS, seriesStiffness, shaftTorsion, tubeInertia, tubeTorsion, type AxleParts } from '../drivetrain/final-drive.ts';
import { dynamicRun, type RunResult } from '../drivetrain/runs.ts';
import type { DifferentialDef } from '../drivetrain/spec.ts';
import type { CarRecord } from '../vehicle/car.ts';
import type { LongitudinalChassis } from '../vehicle/longitudinal.ts';
import { tyreAt } from '../vehicle/tyre.ts';
import { FL, FR, RL, RR } from '../vehicle/wheel-bus.ts';
import { driveCarById } from '../data/drive-cars.ts';
import type { GearboxDesign } from './design.ts';
import { designBuild, designLayout } from './to-spec.ts';
import { designDifferential, designVehicle } from './vehicle.ts';
import { G } from '../vehicle/constants.ts';

const RPM = 30 / Math.PI;
const KMH = 3.6;
/** Halfshafts of a car without its own drivetrain dynamics [estimate: the E30's 24 mm steel over 0.47 m]. */
const HALFSHAFT_ESTIMATE = { diameterMm: 24, lengthM: 0.47 };
/** Propshaft of a layshaft design in a car whose record has none [estimate, the E30's tube; as vehicle.ts]. */
const PROPSHAFT_ESTIMATE = { outerMm: 70, wallMm: 1.6, wheelbaseShare: 0.5 };

/** The differential the core drives: a helical one as the plate one of the same torque split. */
export function runDifferential(d: GearboxDesign): DifferentialDef {
  const diff = designDifferential(d);
  if (diff.kind !== 'helical') return diff;
  const tbr = diff.tbr ?? d.tbr;
  const s = (tbr - 1) / (tbr + 1);
  return { kind: 'plate', lockDrive: s, lockCoast: s, preloadNm: diff.preloadNm ?? 0 };
}

/** The base car as the design changes it: mass, weight split, drive, driven tyres and the road load of vehicle.ts. */
function designCar(d: GearboxDesign): CarRecord {
  const v = designVehicle(d);
  const base = v.base;
  const other = d.drive === 'rwd' ? base.tyre.size : (base.tyre.sizeRear ?? base.tyre.size);
  const tyre = d.drive === 'fwd' ? { size: d.tyreSize, sizeRear: other, id: d.tyre } : { size: other, sizeRear: d.tyreSize, id: d.tyre };
  return {
    ...base,
    massKg: d.massKg,
    // The design's mass already carries the driver.
    massBasis: 'eu',
    drive: d.drive,
    body: { ...base.body, frontShare: d.frontShare },
    tyre,
    // c so that its body part, c/k_EPA, is the design's ½ρ·C_dA as vehicle.ts takes it.
    roadLoad: { a: v.roadLoad.a, b: v.roadLoad.b, c: v.roadLoad.c, source: 'designer' },
  };
}

/** The design in its car as the core drives it. */
export function designCarDrive(d: GearboxDesign): CarDrive {
  const v = designVehicle(d);
  const car = designCar(d);
  const { box } = designBuild(d);
  const record = driveCarById(d.car);
  const dyn = record?.dynamics;
  const layshaft = d.type === 'layshaft';
  let propshaft: AxleParts['propshaft'] = null;
  if (layshaft) {
    const prop = dyn?.propshaft;
    const points = record?.driveline.propshaft?.points;
    if (prop && points && points.length > 1) {
      const length = points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1], p[2] - points[i]![2]), 0);
      const tube = tubeTorsion(prop.tubeOuterMm, prop.tubeWallMm, length);
      propshaft = {
        stiffness: prop.couplingNmPerRad === null ? tube : seriesStiffness(tube, prop.couplingNmPerRad),
        inertia: tubeInertia(prop.tubeOuterMm, prop.tubeWallMm, length) + 2 * PROPSHAFT_FITTINGS,
      };
    } else {
      const e = PROPSHAFT_ESTIMATE;
      const length = e.wheelbaseShare * v.wheelbaseM;
      propshaft = { stiffness: tubeTorsion(e.outerMm, e.wallMm, length), inertia: tubeInertia(e.outerMm, e.wallMm, length) + 2 * PROPSHAFT_FITTINGS };
    }
  }
  const half = dyn?.halfshaft ?? HALFSHAFT_ESTIMATE;
  const driven: [number, number] = d.drive === 'fwd' ? [FL, FR] : [RL, RR];
  const axle: AxleParts = {
    ratio: v.axleRatio,
    efficiency: v.axleEfficiency,
    differential: runDifferential(d),
    propshaft,
    halfshaftStiffness: shaftTorsion(half.diameterMm, half.lengthM),
    wheelInertia: v.wheelInertia,
    slots: driven,
  };
  const launch = { engineInertia: v.map.inertia, damper: v.damper, clutch: v.clutch };
  const draft = mergeDrafts(launchDraft(box.spec.input, launch), gearboxDraft(box), gearLossDraft(box), axleDraft(box.spec.output, axle));
  const gears: CarGear[] = box.states
    .filter((s) => s.kind === 'gear' && s.ratio! > 0)
    .map((s) => ({ name: s.name, element: s.closed[0]!, ratio: s.ratio!, efficiency: s.efficiency ?? 1 }));
  const front = d.drive === 'fwd' ? v.radius : v.otherRadius;
  const rear = d.drive === 'fwd' ? v.otherRadius : v.radius;
  const gearbox: GearboxRecord = { id: 'designer', name: d.name, car: d.car, layout: designLayout(d), published: { ratios: [], reverse: null, ratedTorqueNm: null, centreMm: null }, sources: [], unverified: [] };
  const drive: DriveCar = {
    car: d.car,
    gearbox: 'designer',
    finalDrive: { ratio: d.finalDrive, teeth: null, kind: layshaft ? 'hypoid' : 'helical' },
    differential: axle.differential,
    driveline: record?.driveline ?? { diffOutputs: {}, propshaft: null },
    sources: [],
    unverified: [],
  };
  return {
    car, drive, gearbox, box, map: v.map, launch, axle, spinLoss: v.spinLoss, draft, core: buildCore(draft),
    wheelInertia: Float64Array.of(v.wheelInertia, v.wheelInertia, v.wheelInertia, v.wheelInertia),
    radius: Float64Array.of(front, front, rear, rear),
    driven,
    tyre: tyreAt(d.tyre, (d.massKg * G) / 4),
    gears,
  };
}

/** One frame of the run as the page plays it back. */
export interface RunSample {
  t: number;
  kmh: number;
  rpm: number;
  /** Forward gear, first is 1. */
  gear: number;
  /** The driver's foot, 0 to 1: off while the clutch is open for a shift. */
  throttle: number;
}

export interface DesignRun extends RunResult {
  samples: RunSample[];
  /** Forward gears' names, first first, as the box's states call them. */
  gearNames: string[];
}

/** How often the run is sampled for the chart and the sound, s. */
export const RUN_SAMPLE_S = 1 / 30;

/** The standing start to 100 km/h and over 400 m by the whole core, sampled for playback. */
export function designRun(d: GearboxDesign): DesignRun {
  const cd = designCarDrive(d);
  const samples: RunSample[] = [];
  let next = 0;
  let crank = -1;
  const result = dynamicRun(cd, {
    sampleS: RUN_SAMPLE_S,
    sleeveN: d.shiftForceN,
    observe: (veh, phase, gear) => {
      if (veh.time + 1e-9 < next) return;
      next += RUN_SAMPLE_S;
      if (crank < 0) crank = memberIndex(veh.solver.core, CRANK);
      const ch = veh.chassis as LongitudinalChassis;
      samples.push({
        t: veh.time,
        kmh: ch.v * KMH,
        rpm: veh.solver.memberSpeed(crank) * RPM,
        gear: gear + 1,
        throttle: phase === 'shift' || phase === 'close' ? 0 : 1,
      });
    },
  });
  return { ...result, samples, gearNames: cd.gears.map((g) => g.name) };
}
