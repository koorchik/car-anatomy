// What the car builder works out for a build (whole-car plan, "what is computed and by what"). Every figure comes from
// the model of the section that owns it; this module only puts the units into the donor and hands each model the car
// it now sits in:
//
// - mass and weight split: the donor's mass less its engine and gearbox plus the new ones, each weighed by its
//   designer's model (the engine designer's estimate for both engines, the gearbox designer's for both gearboxes), so a
//   difference of masses comes from one model; the change sits where the unit sits (the engine at its box's centre, the
//   gearbox at the end of the donor engine's crank);
// - centre of mass height: the donor's plus the engine's shift. Ahead of a separate gearbox and final drive the engine
//   keeps its lowest point where the donor's engine had it, but never sits higher than the donor's crank, so a
//   shallower (dry) pan lowers it; behind a transaxle the axle line holds the crank where it was;
// - 0–100, 0–400 m, v_max and its gear: the gearbox designer's quasi-static model (evaluateGearbox) with this engine's
//   torque and this car's mass, tyres and road load; 80–120 km/h in fifth (or top) and first-gear wheelspin from its
//   traction curves and its tyres' grip (drivenGripN);
// - lap time: the canonical lap (lap.ts);
// - braking, skidpad, understeer, ride: the suspension designer's quick estimates (evaluateChassis) of the donor's
//   chassis, or the chosen one, under this car's mass; the springs stay those of the car the chassis came from;
// - does the engine fit: engineEnvelope against the donor's bay;
// - cruise fuel at 90 and 120 km/h: the engine model on the road load's power in top gear;
// - oil on the lap and the engine's wear: oilAndWear (slow: the page runs it after a pause).
//
// evaluateSteps yields between the heavy parts so that a page or the "what this changes" pass can spread a build over
// frames (sensitivity.ts); evaluateBuild runs it through. The input goes through resolveBuild first.

import { engineById, engineFacts } from '../data/engines.ts';
import { gearboxById } from '../data/gearboxes.ts';
import type { Design } from '../designer/design.ts';
import { FUELS } from '../designer/fuels.ts';
import { evaluate, Model, type Performance, type RpmPoint } from '../designer/physics.ts';
import { designFromSpec } from '../designer/presets.ts';
import { assessReliability, wearNow, type Reliability } from '../designer/reliability.ts';
import { designToSpec, factoryInputs } from '../designer/to-spec.ts';
import { torqueMapFor } from '../designer/torque-map.ts';
import { engineEnvelope, type Box3 } from '../engine/envelope.ts';
import { buildEngine, type Engine } from '../engine/kinematics.ts';
import type { EngineSpec } from '../engine/spec.ts';
import { systemsOf, type SystemsSpec } from '../engine/systems-spec.ts';
import { resolveGearboxDesign } from '../gearbox-designer/constraints.ts';
import { DEFAULT_GEARBOX_DESIGN, type GearboxDesign, type GearboxType } from '../gearbox-designer/design.ts';
import { drivenGripN, evaluateGearbox, type GearboxPerformance } from '../gearbox-designer/evaluate.ts';
import { gearboxMass } from '../gearbox-designer/mass.ts';
import { designFromRecord } from '../gearbox-designer/presets.ts';
import { assessGearbox, type GearboxReliability, type GearboxVerdictId } from '../gearbox-designer/reliability.ts';
import { designBuild } from '../gearbox-designer/to-spec.ts';
import { designVehicle, type DesignEngine, type DesignVehicle } from '../gearbox-designer/vehicle.ts';
import { DRIVELINE, oilRun } from '../lubrication/scenario.ts';
import { lapTorqueCurve } from '../lubrication/torque.ts';
import type { LubeSummary } from '../lubrication/run.ts';
import { catalogueChassis, catalogueEntry } from '../suspension-designer/catalogue.ts';
import { axleOf, withAxle, type AxleEnd, type ChassisDesign } from '../suspension-designer/design.ts';
import { springRateNm } from '../suspension-designer/to-spec.ts';
import { evaluateChassis, type ChassisPerformance } from '../suspension/evaluate-chassis.ts';
import type { ChassisSpec } from '../suspension/spec.ts';
import { cgHeightM, drivingMassKg, vehicleSpec, type CarRecord, type Vec3 } from '../vehicle/car.ts';
import { AIR_DENSITY, G } from '../vehicle/constants.ts';
import { CANONICAL_LAP_LEVEL, type LapLevel, type LapTrace } from '../vehicle/lap.ts';
import { engineToCar } from '../vehicle/packaging.ts';
import { topSpeed } from '../vehicle/powertrain.ts';
import { roadLoadCoeffs, roadLoadN, type RoadLoadCoeffs } from '../vehicle/road-load.ts';
import { parseTyreSize } from '../vehicle/tyre-size.ts';
import type { TyreId, VehicleSpec } from '../vehicle/vehicle.ts';
import { donorById, type CarBuild, type IdealGearbox } from './build.ts';
import { buildLap, buildLapPowertrain, type LapBox } from './lap.ts';
import { donorGearboxType, drivenTyreSize, resolveBuildWithNotes, type ResolveNote } from './resolve.ts';

const KMH = 3.6;
const RPM = 30 / Math.PI;
/** Steps of the 80–120 km/h integration. */
const ELASTIC_STEPS = 40;

// ---------------------------------------------------------------------------------------------------------------------
// Caches. A build changes one unit at a time, so the others keep their models.

const CACHE = 48;
function remember<T>(cache: Map<string, T>, key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = make();
  if (cache.size >= CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, made);
  return made;
}
const perfs = new Map<string, Performance>();
const reliabilities = new Map<string, Reliability>();
const copies = new Map<string, GearboxDesign>();
const gearboxes = new Map<string, GearboxPerformance>();
const chassisSpecs = new Map<string, ChassisSpec | null>();
const chassisPerfs = new Map<string, ChassisPerformance | null>();
const masses = new Map<string, number>();

/** The engine designer's model of a design, run once per design. */
export const enginePerf = (d: Design): Performance => remember(perfs, JSON.stringify(d), () => evaluate(d));
const engineReliability = (d: Design): Reliability => remember(reliabilities, JSON.stringify(d), () => assessReliability(d, enginePerf(d)));
/** A catalogue gearbox in its own car as the gearbox designer copies it. */
const gearboxCopy = (id: string): GearboxDesign => remember(copies, id, () => designFromRecord(gearboxById(id)!));
const gearboxMassKg = (d: GearboxDesign): number => remember(masses, JSON.stringify(d), () => gearboxMass(d, designBuild(d).spec).totalKg);

// ---------------------------------------------------------------------------------------------------------------------
// The units of a build.

/** The engine of a build with everything the models read of it. */
export interface BuildEngineParts {
  /** The catalogue id, or null for a design of the engine designer. */
  catalogueId: string | null;
  name: string;
  /** With the build's sump and oil. */
  design: Design;
  spec: EngineSpec;
  engine: Engine;
  systems: SystemsSpec;
  /** The published power the lap's curve is brought to (lapTorqueCurve), as the oil page does. */
  publishedHp: number | null;
}

/** The engine's design with the build's sump and oil. */
function engineDesign(build: CarBuild): Design {
  const own = 'catalogue' in build.engine ? designFromSpec(engineById(build.engine.catalogue)!) : build.engine.design;
  const lube = build.lubrication;
  return lube ? { ...own, sump: lube.sump, oilL: lube.oilL } : own;
}

function engineParts(build: CarBuild, design: Design, perf: Performance): BuildEngineParts {
  const lube = build.lubrication;
  if ('catalogue' in build.engine) {
    const id = build.engine.catalogue;
    const base = engineById(id)!;
    const spec = lube ? { ...base, systems: { ...systemsOf(base), sump: lube.sump, oilL: lube.oilL } } : base;
    return { catalogueId: id, name: base.example, design, spec, engine: buildEngine(spec), systems: systemsOf(spec), publishedHp: engineFacts(id)?.powerHp ?? null };
  }
  const spec = designToSpec(design, design.factory ? factoryInputs(design) : perf);
  return { catalogueId: null, name: design.name, design, spec, engine: buildEngine(spec), systems: systemsOf(spec), publishedHp: design.factory?.published?.powerHp ?? null };
}

/** The donor's own engine. */
function donorEngine(car: CarRecord): { design: Design; engine: Engine; box: Box3 } {
  const spec = engineById(car.engine)!;
  const engine = buildEngine(spec);
  return { design: designFromSpec(spec), engine, box: engineEnvelope(engine) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Placing the engine.

const corners = (box: Box3): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i): Vec3 => [(i & 1 ? box.max : box.min)[0], (i & 2 ? box.max : box.min)[1], (i & 4 ? box.max : box.min)[2]]);

function inCar(car: CarRecord, box: Box3, at: Vec3): Box3 {
  const pts = corners(box).map((p): Vec3 => {
    const q = engineToCar(car.mount, p);
    return [q[0] + at[0], q[1] + at[1], q[2] + at[2]];
  });
  const lo = (k: number): number => Math.min(...pts.map((p) => p[k]!));
  const hi = (k: number): number => Math.max(...pts.map((p) => p[k]!));
  return { min: [lo(0), lo(1), lo(2)], max: [hi(0), hi(1), hi(2)] };
}

const centre = (b: Box3): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];

export interface EngineFit {
  /** The engine's box in the car, front-axle frame, metres. */
  box: Box3;
  bay: Box3;
  /** How far the engine sticks out of the bay on each side, mm; 0 where it is inside. */
  overMm: { front: number; rear: number; left: number; right: number; top: number; bottom: number };
  /** The engine's lowest point over the road against the donor's ground clearance, mm (negative: below it). */
  clearanceMm: number;
  fits: boolean;
  /** How much lower the crank sits than in the donor, mm: a shallower pan lets it down. */
  crankDropMm: number;
}

function fitOf(car: CarRecord, box: Box3, donorBox: Box3): EngineFit {
  const pack = car.packaging!;
  // The engine keeps its lowest point where the donor's engine had it, but never sits higher than the donor's crank.
  // Behind a transaxle the crank cannot go down at all: the box with the final drive bolts to the engine and its
  // output shafts stay level with the wheel hubs, so the axle line holds the crank's height.
  const drop = donorGearboxType(car) === 'layshaft' ? Math.max(0, -donorBox.min[1] - -box.min[1]) : 0;
  const at: Vec3 = [pack.crankFront[0], pack.crankFront[1], pack.crankFront[2] - drop];
  const placed = inCar(car, box, at);
  const bay = pack.bay;
  const mm = (v: number): number => Math.max(0, Math.round(v * 1000));
  const overMm = {
    front: mm(placed.max[0] - bay.max[0]),
    rear: mm(bay.min[0] - placed.min[0]),
    left: mm(placed.max[1] - bay.max[1]),
    right: mm(bay.min[1] - placed.min[1]),
    top: mm(placed.max[2] - bay.max[2]),
    bottom: mm(bay.min[2] - placed.min[2]),
  };
  const clearanceMm = Math.round((placed.min[2] - car.dimensions!.groundClearanceM) * 1000);
  return { box: placed, bay, overMm, clearanceMm, fits: Object.values(overMm).every((v) => v === 0), crankDropMm: Math.round(drop * 1000) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The gearbox.

/** The donor's own gearbox as a design, or null when the gearbox section has none for it. */
export const donorGearbox = (car: CarRecord): GearboxDesign | null => (car.gearbox && gearboxById(car.gearbox)?.car ? gearboxCopy(car.gearbox) : null);

/**
 * An ideal box as a gearbox design: the gear count and spread in a geometric ladder, top gear at the limiter at the
 * speed where full power meets the road load, as the oil page's stand-in box has it; teeth picked by the designer.
 */
function idealDesign(car: CarRecord, type: GearboxType, ideal: IdealGearbox, vtopMs: number, redlineRpm: number, radiusM: number): GearboxDesign {
  const base = donorGearbox(car) ?? { ...DEFAULT_GEARBOX_DESIGN, type };
  const overallTop = ((redlineRpm / RPM) * radiusM) / vtopMs;
  let finalDrive = base.finalDrive;
  let topRatio = overallTop / finalDrive;
  // Keep the top gear where boxes have it; the final drive takes the rest.
  if (topRatio < 0.6 || topRatio > 1.2) {
    topRatio = Math.min(1.2, Math.max(0.6, topRatio));
    finalDrive = overallTop / topRatio;
  }
  const n = ideal.gears;
  return resolveGearboxDesign({
    ...base,
    name: '',
    type,
    gears: n,
    topRatio,
    firstRatio: topRatio * ideal.spread,
    progression: 0,
    directGear: 0,
    ratios: Array(n).fill(null),
    pairs: Array(n).fill(null),
    cones: Array(n).fill(1),
    mainPair: null,
    reverse: null,
    finalPair: null,
    finalDrive,
    factory: null,
  });
}

/**
 * The build's road load: the donor's (its C_dA kept), the rolling part scaled to the build's mass, the way the
 * suspension designer scales a design's (to-spec.ts) and the gearbox designer's C_rr does, so all three models see
 * one road load. The donor's own when the mass did not change.
 */
export function buildRoadLoad(donor: CarRecord, car: CarRecord): RoadLoadCoeffs {
  const own = roadLoadCoeffs(donor);
  const m = drivingMassKg(car);
  const k = m / drivingMassKg(donor);
  return k === 1 ? own : { ...own, a: own.a * k, b: own.b * k, massKg: m };
}

/** The gearbox design in this build's car: its mass, weight split, tyres, road load, final drive and differential. */
function rebaseGearbox(g: GearboxDesign, car: CarRecord, rl: RoadLoadCoeffs, build: CarBuild, engineId: string, tyre: { id: TyreId; size: string }): GearboxDesign {
  const m = drivingMassKg(car);
  const patch: Partial<GearboxDesign> = {
    car: car.id,
    engine: engineId,
    massKg: m,
    drive: car.drive === 'fwd' ? 'fwd' : 'rwd',
    frontShare: car.body.frontShare,
    tyreSize: tyre.size,
    tyre: tyre.id,
    cdA: (2 * rl.c) / AIR_DENSITY,
    crr: rl.a / (m * G),
  };
  if (build.finalDrive !== null) Object.assign(patch, { finalDrive: build.finalDrive, finalPair: null });
  if (build.differential !== null) patch.diff = build.differential;
  const changed = (Object.keys(patch) as Array<keyof GearboxDesign>).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(g[k]));
  return changed ? resolveGearboxDesign({ ...g, ...patch }) : g;
}

/** 80–120 km/h at full load in one gear, s, from the gearbox model's traction curve, no more than the driven tyres
 *  pull (drivenGripN); null if the gear cannot. */
function elasticity(perf: GearboxPerformance, v: DesignVehicle, gear: number, massKg: number): number | null {
  const tr = perf.traction;
  const forces = tr.gears[gear - 1];
  if (!forces) return null;
  const at = (kmh: number): number | null => {
    const k = tr.kmh;
    for (let i = 1; i < k.length; i++) {
      if (kmh <= k[i]!) {
        const a = forces[i - 1];
        const b = forces[i];
        const ra = tr.roadLoadN[i - 1]!;
        const rb = tr.roadLoadN[i]!;
        if (a === null || a === undefined || b === null || b === undefined) return null;
        const s = (kmh - k[i - 1]!) / (k[i]! - k[i - 1]!);
        const road = ra + (rb - ra) * s;
        return Math.min(a + (b - a) * s, drivenGripN(v, road)) - road;
      }
    }
    return null;
  };
  let t = 0;
  const dv = (120 - 80) / KMH / ELASTIC_STEPS;
  for (let i = 0; i < ELASTIC_STEPS; i++) {
    const surplus = at(80 + (i + 0.5) * dv * KMH);
    if (surplus === null || surplus <= 0) return null;
    t += (massKg * dv) / surplus;
  }
  return t;
}

/** Speed in first gear up to which the driven wheels spin at full throttle, km/h (0: they never do): the gearbox
 *  model's force at the wheels against the most its tyres pull there (drivenGripN, with the weight transfer). */
export function spinSpeedKmh(v: DesignVehicle, perf: GearboxPerformance): number {
  const tr = perf.traction;
  let top = 0;
  tr.gears[0]?.forEach((f, i) => {
    if (f !== null && f > drivenGripN(v, tr.roadLoadN[i]!)) top = Math.max(top, tr.kmh[i]!);
  });
  return top;
}

// ---------------------------------------------------------------------------------------------------------------------
// The chassis.

/** A chassis design under this build's car: the car's mass, split, centre of mass, wheelbase, drive and tyres; the
 *  springs pinned to the rate they had in the car the chassis came from. */
function rebaseChassis(d: ChassisDesign, car: CarRecord, tyre: { id: TyreId; size: string }): ChassisDesign {
  let out: ChassisDesign = d;
  for (const end of ['F', 'R'] as AxleEnd[]) {
    if (axleOf(d, end).springNmm === null) out = withAxle(out, end, { springNmm: springRateNm(d, end) / 1000 });
  }
  const size = parseTyreSize(tyre.size);
  const driven: AxleEnd[] = car.drive === 'fwd' ? ['F'] : car.drive === 'rwd' ? ['R'] : ['R'];
  for (const end of driven) out = withAxle(out, end, { tyreWidthMm: size.widthMm, tyreAspect: size.aspect, rimIn: size.rimIn });
  return {
    ...out,
    car: car.id,
    massKg: drivingMassKg(car),
    frontShare: car.body.frontShare,
    cgHeightMm: Math.round(cgHeightM(car) * 1e6) / 1e3,
    wheelbaseMm: Math.round(car.body.wheelbaseM * 1e6) / 1e3,
    drive: car.drive,
    tyre: tyre.id,
  };
}

/** The suspension model's spec of a chassis design; null when it cannot be built. */
function chassisSpec(d: ChassisDesign): ChassisSpec | null {
  return remember(chassisSpecs, JSON.stringify(d), () => {
    try {
      return catalogueChassis(d);
    } catch {
      return null;
    }
  });
}

function chassisPerf(d: ChassisDesign): ChassisPerformance | null {
  return remember(chassisPerfs, JSON.stringify(d), () => {
    const spec = chassisSpec(d);
    if (!spec) return null;
    try {
      return evaluateChassis(spec);
    } catch {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Cruise fuel.

/** Fuel at a steady cruise, l/100 km: the engine model finds the throttle (or, in a diesel, the mixture) for the power. */
function cruiseFuel(design: Design, rpm: number, kw: number, kmh: number): number | null {
  if (!(rpm > 0) || !(kw > 0)) return null;
  const model = new Model({ ...design, factory: null });
  const diesel = FUELS[design.fuel].diesel;
  const solve = (noBoost: boolean): RpmPoint | null => {
    const at = (x: number): RpmPoint => model.at(rpm, diesel ? { throttle: 1, lambda: x, noBoost } : { throttle: x, lambda: 1, noBoost });
    // Power rises with throttle and falls with a leaner diesel mixture.
    let lo = diesel ? 9 : 0.04;
    let hi = diesel ? 1.2 : 1;
    if (at(hi).powerKw < kw) return null;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid).powerKw < kw) lo = mid;
      else hi = mid;
    }
    return at(hi);
  };
  const p = solve(true) ?? solve(false);
  return p && Number.isFinite(p.fuelLh) ? (p.fuelLh / kmh) * 100 : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The evaluation.

export interface CarPerformance {
  build: CarBuild;
  notes: ResolveNote[];
  donor: CarRecord;
  /** The build as a car record: the donor's with the new mass, weight split, centre of mass and tyres. */
  car: CarRecord;
  vehicle: VehicleSpec;
  engine: BuildEngineParts & {
    perf: Performance;
    reliability: Reliability;
    massKg: number;
    donorMassKg: number;
    /** Peak power as the lap's curve has it (the published one for a catalogue engine), kW, and its speed. */
    peakKw: number;
    peakKwRpm: number;
    /** Peak torque at the gearbox's input, N·m. */
    peakNm: number;
    /** The donor engine's peak torque: what its gearbox was built for. */
    donorPeakNm: number;
  };
  /** Driving mass with the driver, kg, and the change from the donor. */
  massKg: number;
  massDeltaKg: number;
  frontShare: number;
  cgHeightM: number;
  cgShiftMm: number;
  gearboxDesign: GearboxDesign;
  gearbox: GearboxPerformance;
  gearboxReliability: GearboxReliability;
  /** The verdict on the donor's own gearbox behind the donor's own engine. */
  donorGearboxVerdict: GearboxVerdictId;
  /** The gearbox's mass and the donor's, kg. */
  gearboxMassKg: number;
  donorGearboxMassKg: number;
  gearboxKind: 'donor' | 'catalogue' | 'design' | 'ideal';
  vmaxKmh: number;
  vmaxGear: number;
  vmaxAtLimiter: boolean;
  /** The donor's electronic limit, which the builder does not carry over, km/h; null when it has none. */
  donorLimitKmh: number | null;
  zeroTo100S: number | null;
  zeroTo400mS: number | null;
  /** 80–120 km/h in fifth, or in top on a box with fewer gears. */
  elasticGear: number;
  eightyTo120S: number | null;
  /** Speed up to which the driven wheels spin at full throttle in first gear, km/h; the donor's as made. */
  spinKmh: number;
  donorSpinKmh: number;
  lap: LapTrace;
  lapTimeS: number;
  lapLevel: LapLevel;
  chassisDesign: ChassisDesign | null;
  chassis: ChassisPerformance | null;
  /** The donor's chassis figures, for what changed with the mass. */
  donorChassis: ChassisPerformance | null;
  fit: EngineFit;
  /** Fuel at a steady 90 and 120 km/h in top gear, l/100 km; null when the engine cannot hold it there. */
  fuel90: number | null;
  fuel120: number | null;
}

/** The donor's chassis design: the suspension catalogue's copy of the donor, or none. */
const donorChassis = (car: CarRecord): ChassisDesign | null => catalogueEntry(car.id)?.design ?? null;

/** The build's evaluation, a heavy part between yields (see the header). */
export function* evaluateSteps(input: unknown): Generator<void, CarPerformance, void> {
  const { build, notes } = resolveBuildWithNotes(input);
  const donor = donorById(build.donor)!;

  // The engines.
  const donorOwn = donorEngine(donor);
  const design = engineDesign(build);
  const perf = enginePerf(design);
  yield;
  const parts = engineParts(build, design, perf);
  yield;
  const donorPerf = enginePerf(donorOwn.design);
  const reliability = engineReliability(parts.design);
  yield;

  // Where the new engine sits and what it weighs.
  const box = engineEnvelope(parts.engine, parts.systems);
  const fit = fitOf(donor, box, donorOwn.box);
  const donorPlaced = inCar(donor, donorOwn.box, donor.packaging!.crankFront);
  const engineDelta = perf.massKg - donorPerf.massKg;

  yield;

  // The gearbox: its own design first, for its mass.
  const type = donorGearboxType(donor);
  const donorBox = donorGearbox(donor);
  const tyre = build.tyre ?? { id: donor.tyre.id, size: drivenTyreSize(donor) };
  const engineId = parts.catalogueId ?? donor.engine;
  const lapTorque = lapTorqueCurve(perf.points, parts.publishedHp);
  const g = build.gearbox;
  const kind: CarPerformance['gearboxKind'] = g === null ? 'donor' : 'catalogue' in g ? 'catalogue' : 'design' in g ? 'design' : 'ideal';
  const donorGearboxMassKg = donorBox ? gearboxMassKg(donorBox) : 0;

  // The car with the new units, before the gearbox's own mass is known for an ideal box (it weighs the donor's).
  const place = (gearboxDelta: number): CarRecord => {
    if (engineDelta === 0 && gearboxDelta === 0 && fit.crankDropMm === 0 && !build.tyre) return donor;
    const M = drivingMassKg(donor);
    const a = donor.body.wheelbaseM * (1 - donor.body.frontShare);
    const x0 = -a;
    const z0 = cgHeightM(donor);
    const e1 = centre(fit.box);
    const e0 = centre(donorPlaced);
    // The gearbox bolts to the end of the donor engine's crank.
    const gz = engineToCar(donor.mount, [0, 0, donorOwn.box.min[2]]);
    const gAt: Vec3 = [gz[0] + donor.packaging!.crankFront[0], gz[1] + donor.packaging!.crankFront[1], gz[2] + donor.packaging!.crankFront[2]];
    const M1 = M + engineDelta + gearboxDelta;
    const x1 = (M * x0 + perf.massKg * e1[0] - donorPerf.massKg * e0[0] + gearboxDelta * gAt[0]) / M1;
    const z1 = (M * z0 + perf.massKg * e1[2] - donorPerf.massKg * e0[2] + gearboxDelta * gAt[2]) / M1;
    const size = tyre.size;
    const tyres = donor.drive === 'fwd' ? { ...donor.tyre, id: tyre.id, size } : { ...donor.tyre, id: tyre.id, ...(donor.tyre.sizeRear ? { sizeRear: size } : { size }) };
    const moved = engineDelta !== 0 || gearboxDelta !== 0 || fit.crankDropMm !== 0;
    return {
      ...donor,
      engine: engineId,
      massKg: donor.massKg + engineDelta + gearboxDelta,
      body: moved ? { ...donor.body, frontShare: 1 + x1 / donor.body.wheelbaseM, cgHeightM: z1 } : donor.body,
      tyre: tyres,
    };
  };

  let gearboxDesign: GearboxDesign;
  let lapBox: LapBox;
  let gearboxMassKgNow = donorGearboxMassKg;
  let car: CarRecord;
  if (kind === 'ideal') {
    const ideal = (g as { ideal: IdealGearbox }).ideal;
    car = place(0);
    const vehicle = { ...vehicleSpec(car), roadLoad: buildRoadLoad(donor, car) };
    const vtop = topSpeed(vehicle, lapTorque.peakPowerW, DRIVELINE.efficiency);
    gearboxDesign = idealDesign(donor, type, ideal, vtop, parts.design.rpmLimit, vehicle.tyreRadiusM);
    lapBox = { kind: 'ideal', ideal };
  } else {
    const own = kind === 'donor' ? donorBox! : kind === 'catalogue' ? gearboxCopy((g as { catalogue: string }).catalogue) : (g as { design: GearboxDesign }).design;
    // A new box's copy picks its teeth, and its mass builds it: two heavy parts.
    if (kind !== 'donor') yield;
    gearboxMassKgNow = kind === 'donor' ? donorGearboxMassKg : gearboxMassKg(own);
    car = place(gearboxMassKgNow - donorGearboxMassKg);
    gearboxDesign = own;
    lapBox = { kind: 'donor' };
  }
  const roadLoad = buildRoadLoad(donor, car);
  const vehicle: VehicleSpec = { ...vehicleSpec(car), roadLoad };
  gearboxDesign = rebaseGearbox(gearboxDesign, car, roadLoad, build, engineId, tyre);
  yield;

  // The gearbox model with this engine.
  let designEngine: DesignEngine | undefined;
  if (!parts.catalogueId) {
    const d = parts.design;
    designEngine = { key: JSON.stringify(d), map: torqueMapFor(d, perf, d.factory?.published ?? null), firingPerRev: (parts.engine.cylinders.length * 360) / parts.engine.cycle };
  }
  const gearboxKey = JSON.stringify([gearboxDesign, designEngine?.key ?? null]);
  const gearbox = remember(gearboxes, gearboxKey, () => evaluateGearbox(gearboxDesign, designEngine));
  const gearboxReliability = assessGearbox(gearbox);
  if (kind === 'catalogue' || kind === 'design') lapBox = { kind: 'real', gears: gearbox.gears.map((x) => ({ overall: x.overall, efficiency: x.efficiency })) };
  yield;

  // The chassis.
  const ownChassis = build.suspension === null ? donorChassis(donor) : 'catalogue' in build.suspension ? (catalogueEntry(build.suspension.catalogue)?.design ?? null) : build.suspension.design;
  const chassisDesign = ownChassis ? rebaseChassis(ownChassis, car, tyre) : null;
  // The chassis's spec and its model are two heavy parts.
  if (chassisDesign) chassisSpec(chassisDesign);
  yield;
  const chassis = chassisDesign ? chassisPerf(chassisDesign) : null;
  yield;
  const donorOwnChassis = donorChassis(donor);
  const donorChassisDesign = donorOwnChassis ? rebaseChassis(donorOwnChassis, donor, { id: donor.tyre.id, size: drivenTyreSize(donor) }) : null;
  if (donorChassisDesign) chassisSpec(donorChassisDesign);
  yield;
  const donorChassisPerf = donorChassisDesign ? chassisPerf(donorChassisDesign) : null;
  yield;

  // The lap.
  const pt = buildLapPowertrain(parts.design, parts.publishedHp, vehicle, perf, lapBox);
  const lap = buildLap(car, vehicle, tyre.id, pt);
  yield;

  // Cruise fuel in top gear.
  const top = gearbox.gears[gearbox.gears.length - 1]!;
  const cruise = (kmh: number): number | null => {
    const v = kmh / KMH;
    const rpm = (kmh / top.kmhPer1000) * 1000;
    if (rpm < perf.idleRpm || rpm > parts.design.rpmLimit) return null;
    const kw = (roadLoadN(vehicle.roadLoad, v, 0) * v) / top.efficiency / 1000;
    return cruiseFuel(parts.design, rpm, kw, kmh);
  };
  const fuel90 = cruise(90);
  yield;
  const fuel120 = cruise(120);

  // The donor's own gearbox in the donor as made: what the new engine's torque and the verdict are measured against.
  const donorFactory = donorBox ? remember(gearboxes, JSON.stringify([donorBox, null]), () => evaluateGearbox(donorBox)) : gearbox;
  const elasticGear = Math.min(5, gearbox.gears.length);
  // The car the gearbox model drove (cached by evaluateGearbox): its tyres and axle loads for the grip.
  const gearboxVehicle = designVehicle(gearboxDesign, designEngine);
  const M = drivingMassKg(car);
  return {
    build,
    notes,
    donor,
    car,
    vehicle,
    engine: {
      ...parts,
      perf,
      reliability,
      massKg: perf.massKg,
      donorMassKg: donorPerf.massKg,
      peakKw: lapTorque.peakPowerW / 1000,
      peakKwRpm: perf.peakPower.rpm,
      peakNm: gearbox.peakTorqueNm,
      donorPeakNm: donorFactory.peakTorqueNm,
    },
    massKg: M,
    massDeltaKg: M - drivingMassKg(donor),
    frontShare: car.body.frontShare,
    cgHeightM: cgHeightM(car),
    cgShiftMm: Math.round((cgHeightM(car) - cgHeightM(donor)) * 1000),
    gearboxDesign,
    gearbox,
    gearboxReliability,
    donorGearboxVerdict: assessGearbox(donorFactory).verdict,
    gearboxMassKg: gearboxMassKgNow,
    donorGearboxMassKg,
    gearboxKind: kind,
    vmaxKmh: gearbox.vmaxKmh,
    vmaxGear: gearbox.vmaxGear,
    vmaxAtLimiter: gearbox.vmaxAtLimiter,
    donorLimitKmh: donor.published.vmaxLimited ? donor.published.vmaxKmh : null,
    zeroTo100S: gearbox.zeroTo100S,
    zeroTo400mS: gearbox.zeroTo400mS,
    elasticGear,
    eightyTo120S: elasticity(gearbox, gearboxVehicle, elasticGear, M),
    spinKmh: spinSpeedKmh(gearboxVehicle, gearbox),
    donorSpinKmh: donorBox ? spinSpeedKmh(designVehicle(donorBox), donorFactory) : spinSpeedKmh(gearboxVehicle, gearbox),
    lap,
    lapTimeS: lap.lapTime,
    lapLevel: CANONICAL_LAP_LEVEL,
    chassisDesign,
    chassis,
    donorChassis: donorChassisPerf,
    fit,
    fuel90,
    fuel120,
  };
}

/** The build's evaluation in one go. */
export function evaluateBuild(input: unknown): CarPerformance {
  const steps = evaluateSteps(input);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Oil and wear on the lap: slow, so the page runs it after a pause.

export interface OilAndWear {
  /** The oil model on the build's lap; null for a rotary, which the oil model does not cover. */
  oil: LubeSummary | null;
  /** The least oil over the pickup's screen on the lap, mm (a wet pan), and the least in the tank, litres (a dry
   *  sump's): how much reserve the oil quantity leaves even where nothing starves. NaN where the sump has none. */
  minImmersionMm: number;
  minTankL: number;
  /** Share of the engine's life the lap uses by the engine designer's reliability model (wearNow over the lap). */
  wearPerLap: number;
}

export function oilAndWear(p: CarPerformance): OilAndWear {
  const { engine, lap, vehicle } = p;
  let oil: LubeSummary | null = null;
  let minImmersionMm = Number.NaN;
  let minTankL = Number.NaN;
  if (!engine.engine.isRotary) {
    const place = engine.systems.well?.place ?? 'middle';
    const run = oilRun(engine.engine, engine.systems, vehicle, lap, { kind: engine.systems.sump, oilDeltaL: 0, accumulator: false, place });
    oil = run.summary;
    const least = (a: Float32Array): number => (a.length ? a.reduce((m, v) => Math.min(m, v), Infinity) : Number.NaN);
    if (engine.systems.sump === 'dry') minTankL = least(run.tankL);
    else minImmersionMm = least(run.immersion);
  }
  let wear = 0;
  for (let i = 0; i < lap.t.length; i++) {
    const dt = (i + 1 < lap.t.length ? lap.t[i + 1]! : lap.lapTime) - lap.t[i]!;
    wear += wearNow(engine.reliability, lap.rpm[i]!, lap.throttle[i]!).rate * dt;
  }
  return { oil, minImmersionMm, minTankL, wearPerLap: wear };
}
