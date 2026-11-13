// A real car's chassis as the suspension draws it (stage P7-geom): its two independent axles from the templates, set
// on the car's record. The wheels stand on the record's wheelbase and tracks at its tyres' rolling radius, the driven
// axle's halfshafts start at the gearbox's inner joints (DriveCar.driveline.diffOutputs), and the steered axle turns
// to the lock its published turning circle gives. No DOM, no three.js, no text (src/suspension/ rules).
//
// Frames. Records are in the front-axle frame, the chassis in the CG frame (carFrameToCg, car.ts); each axle's corner
// is given in the axle's own frame, origin on the road under the middle of the axle, as every corner of the section.
// An axle's own frame is the CG frame moved along x by `xCg`.
//
// What is the car's and what is typical: the layouts, the turning circle and the anti-roll bars are the maker's
// (ChassisCar.sources). The hardpoints are not published: the strut corner is JTEKT's measured one moved out to the
// car's track, the five-link is the template's typical geometry; masses per corner are the template's 40 kg unsprung
// and the record's weight over the axle (docs/suspension-model.md, the chassis section).

import type { CarPoint } from '../drivetrain/drive-car.ts';
import { bodyOf, carFrameToCg, tyreRadiiM, type CarRecord, type VehicleBody } from '../vehicle/car.ts';
import { outerDiameterM, parseTyreSize } from '../vehicle/tyre-size.ts';
import { Axle, newCornerSample } from './kinematics.ts';
import { CornerSolver, POSE_SIZE } from './solve.ts';
import type { AxleSpec, CornerLinkage, CornerSpec, KnuckleKind, LayoutId, Vec3 } from './spec.ts';
import { macphersonJtekt } from './templates/macpherson.ts';
import { multilink, multilinkDefaults } from './templates/multilink.ts';
import { typicalCorner } from './templates/typical-corner.ts';

/** How one axle of a real car is built: the layouts this stage has. */
export type AxleChoice = { layout: 'macpherson'; knuckle: KnuckleKind } | { layout: 'multilink' };

/** What the suspension knows of a real car beyond its shared record (src/data/chassis/<id>.ts). */
export interface ChassisCar {
  /** Shared car id. */
  car: string;
  front: AxleChoice;
  rear: AxleChoice;
  /**
   * The published turning circle: 'radius' is the Japanese 最小回転半径, the radius the outer front tyre's contact
   * centre traces; 'kerb-diameter' the diameter the outer front tyre's outer edge traces. Rigid geometry turns either
   * into the outer wheel's lock (lockFromTurning).
   */
  turning: { kind: 'radius' | 'kerb-diameter'; m: number };
  /** Anti-roll bars as the maker lists them. */
  antiRollBars: { front: boolean; rear: boolean };
  sources: string[];
  /** Fields not confirmed by a source, as paths: 'turning.kind'. */
  unverified: string[];
}

/** Unsprung mass of a corner, kg: the reference quarter car of the research (typical-corner.ts), not the car's. */
export const UNSPRUNG_KG = 40;

/** The car's wheel as the 3D draws it: from the tyre size, the rim a little narrower than the tyre's section. */
export interface WheelSize {
  /** Free (outer) radius of the tyre, m. */
  outerRadiusM: number;
  rimRadiusM: number;
  rimWidthM: number;
  tyreWidthM: number;
}

/** Rim width as a share of the tyre's section width: 8.5J on 245 and 11.5J on 305 (Porsche) give 0.88 and 0.96. */
const RIM_SHARE = 0.9;

export function wheelSize(size: string): WheelSize {
  const s = parseTyreSize(size);
  const tyreWidthM = s.widthMm / 1000;
  return { outerRadiusM: outerDiameterM(s) / 2, rimRadiusM: (s.rimIn * 0.0254) / 2, rimWidthM: tyreWidthM * RIM_SHARE, tyreWidthM };
}

/** Where the wheel sweeps relative to its design centre (axle frame, left wheel), for the body's wheel arches. */
export interface WheelSweep {
  /** Farthest any tyre point gets from the axle line in the side view, above the wheel centre or level with it, m. */
  reachM: number;
  /** Farthest fore or aft any tyre point gets, m. */
  halfLengthM: number;
  /** Nearest any tyre point gets to the car's centre line, m. */
  innerY: number;
  /** Highest tyre point above the road, m. */
  topZ: number;
}

export interface ChassisAxle {
  which: 'front' | 'rear';
  layout: LayoutId;
  /** The axle line in the CG frame, m: the x of its wheel centres at design. */
  xCg: number;
  /** The left corner in the axle's own frame. */
  corner: CornerSpec;
  wheel: WheelSize;
  antiRollBar: boolean;
  /** Rack travel at full lock (m, either way) and the outer and inner wheels' angles there (rad); null unsteered. */
  lock: { rackM: number; outerRad: number; innerRad: number } | null;
  /** The left wheel's sweep over the travel the arches allow for and, steered, over the whole lock. */
  sweep: WheelSweep;
}

export interface CarChassis {
  car: CarRecord;
  /** The suspension's VehicleBody: bodyOf(car), the same mass and split as every other section. */
  body: VehicleBody & { massKg: number };
  /** Front-axle frame to CG frame (carFrameToCg). */
  toCg: (p: CarPoint) => CarPoint;
  front: ChassisAxle;
  rear: ChassisAxle;
}

/** Bump travel the wheel arches leave room for above the static wheel, m: typical. */
export const ARCH_BUMP_M = 0.04;

/** Every lateral position of a corner on links moved by `dy` (out for dy > 0): the same linkage on a wider track. */
export function widenCorner(spec: AxleSpec, dy: number): AxleSpec {
  const sh = (p: Vec3): Vec3 => [p[0], p[1] + dy, p[2]];
  const shWheel = (p: Vec3 | 'strut'): Vec3 | 'strut' => (p === 'strut' ? p : sh(p));
  const link = spec.linkage;
  const linkage: CornerLinkage = {
    ...link,
    wishbones: link.wishbones.map((w) => ({ ...w, front: sh(w.front), rear: sh(w.rear), ball: sh(w.ball) })),
    rods: link.rods.map((r) => ({ ...r, body: sh(r.body), knuckle: sh(r.knuckle) })),
    ...(link.strut ? { strut: { ...link.strut, top: sh(link.strut.top), lower: sh(link.strut.lower) } } : {}),
    ...(link.knuckle ? { knuckle: { ...link.knuckle, axisLower: sh(link.knuckle.axisLower), axisUpper: sh(link.knuckle.axisUpper) } } : {}),
  };
  return {
    ...spec,
    track: spec.track + 2 * dy,
    linkage,
    wheelCentre: sh(spec.wheelCentre),
    spring: { ...spec.spring, body: sh(spec.spring.body), wheel: shWheel(spec.spring.wheel) },
    damper: { ...spec.damper, body: sh(spec.damper.body), wheel: shWheel(spec.damper.wheel) },
    halfshaft: spec.halfshaft ? { ...spec.halfshaft, diffOutput: sh(spec.halfshaft.diffOutput), outerJoint: sh(spec.halfshaft.outerJoint) } : null,
  };
}

/**
 * The outer front wheel's lock (rad) for a turning circle, by rigid geometry: the turning centre on the rear axle's
 * line, the outer wheel's contact centre `R` from it, so sin δ = L / R. A kerb-to-kerb diameter is taken at the outer
 * tyre's outer edge, half a tyre width out from its contact centre.
 */
export function lockFromTurning(turning: ChassisCar['turning'], wheelbaseM: number, tyreWidthM: number): number {
  const R = turning.kind === 'radius' ? turning.m : turning.m / 2 - tyreWidthM / 2;
  if (!(R > wheelbaseM)) throw new Error(`A turning circle of ${turning.m} m is tighter than the wheelbase allows`);
  return Math.asin(wheelbaseM / R);
}

/** The left corner's toe (rad, toe-in positive) at design travel with the rack at `rack`. */
function toeAt(axle: Axle, pose: Float64Array, travel: number, rack: number): number {
  const res = axle.solver.solve(pose, travel, rack, 40);
  if (!res.ok) return NaN;
  const s = newCornerSample();
  axle.measure(pose, travel, rack, s);
  return s.toe;
}

/**
 * Rack travel that turns the left wheel in by `outerRad`: the outer wheel of a right turn. Rack to the right (negative)
 * pulls the left steering arm in. The inner wheel is the mirror of the left one at the opposite rack.
 */
export function steerLock(spec: AxleSpec, outerRad: number): { rackM: number; outerRad: number; innerRad: number } {
  const axle = new Axle(spec, { table: false });
  const pose = CornerSolver.identity();
  // Walk out 2 mm at a time (warm starts), then halve the last step.
  let lo = 0;
  let hi = 0;
  for (let rack = -0.002; ; rack -= 0.002) {
    if (rack < -0.2) throw new Error('The rack does not reach the lock within 200 mm');
    const toe = toeAt(axle, pose, 0, rack);
    if (!Number.isFinite(toe)) throw new Error(`The corner does not solve at ${(rack * 1000).toFixed(0)} mm of rack`);
    if (toe >= outerRad) {
      lo = rack;
      hi = rack + 0.002;
      break;
    }
  }
  const work = new Float64Array(POSE_SIZE);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    work.set(pose);
    if (toeAt(axle, work, 0, mid) >= outerRad) lo = mid;
    else hi = mid;
  }
  const rackM = -(lo + hi) / 2;
  const back = CornerSolver.identity();
  const innerRad = -toeAt(axle, back, 0, rackM);
  return { rackM, outerRad, innerRad };
}

/**
 * Points of the tyre as a cylinder of its free radius and section width, at a solved pose, axle frame: rings at five
 * places across the tread, every 10°.
 */
function tyrePoints(axle: Axle, pose: Float64Array, wheel: WheelSize, out: Vec3[]): void {
  const spec = axle.spec;
  const c = [0, 0, 0];
  axle.knucklePoint(pose, spec.wheelCentre, c);
  const s = [0, 0, 0];
  axle.solver.direction(pose, spec.spinAxis, s);
  // Two directions square to the spin axis: one level (forward when straight), one up.
  const fx = s[1]!;
  const fy = -s[0]!;
  const fl = Math.hypot(fx, fy);
  const f = [fx / fl, fy / fl, 0];
  const u = [s[1]! * f[2]! - s[2]! * f[1]!, s[2]! * f[0]! - s[0]! * f[2]!, s[0]! * f[1]! - s[1]! * f[0]!];
  if (u[2]! < 0) for (let k = 0; k < 3; k++) u[k] = -u[k]!;
  const r = wheel.outerRadiusM;
  for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) {
    for (let i = 0; i < 36; i++) {
      const t = (i / 36) * 2 * Math.PI;
      const cf = Math.cos(t) * r;
      const cu = Math.sin(t) * r;
      out.push([
        c[0]! + s[0]! * a * wheel.tyreWidthM + f[0]! * cf + u[0]! * cu,
        c[1]! + s[1]! * a * wheel.tyreWidthM + f[1]! * cf + u[1]! * cu,
        c[2]! + s[2]! * a * wheel.tyreWidthM + f[2]! * cf + u[2]! * cu,
      ]);
    }
  }
}

/** Tyre points of the left wheel over the arches' travel (design and ARCH_BUMP_M of bump) and, steered, the lock. */
export function sweepPoints(corner: CornerSpec, wheel: WheelSize, lockRackM: number | null): Vec3[] {
  const axle = new Axle(corner.axle, { table: false });
  const racks = lockRackM === null ? [0] : [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((k) => k * lockRackM);
  const points: Vec3[] = [];
  for (const travel of [0, ARCH_BUMP_M]) {
    const pose = CornerSolver.identity();
    for (const rack of racks) {
      const res = axle.solver.solve(pose, travel, rack, 40);
      if (!res.ok) throw new Error(`The corner does not solve at ${travel} m of travel and ${rack} m of rack: ${res.worst}`);
      tyrePoints(axle, pose, wheel, points);
    }
  }
  return points;
}

function sweepOf(points: Vec3[], centre: Vec3): WheelSweep {
  let reach = 0;
  let half = 0;
  let inner = Infinity;
  let top = -Infinity;
  for (const p of points) {
    const dx = p[0] - centre[0];
    const dz = Math.max(0, p[2] - centre[2]);
    reach = Math.max(reach, Math.hypot(dx, dz));
    half = Math.max(half, Math.abs(dx));
    inner = Math.min(inner, p[1]);
    top = Math.max(top, p[2]);
  }
  return { reachM: reach, halfLengthM: half, innerY: inner, topZ: top };
}

/** The left corner of one axle from the car's choice, in the axle's own frame, before masses. */
function axleSpec(choice: AxleChoice, which: 'front' | 'rear', car: CarRecord, diffOutput: Vec3 | null): AxleSpec {
  const track = which === 'front' ? car.body.trackFrontM : car.body.trackRearM;
  const h = tyreRadiiM(car)[which];
  const driven = diffOutput !== null;
  let spec: AxleSpec;
  if (choice.layout === 'macpherson') {
    // JTEKT's measured strut, moved out to the car's track (its own is 1460 mm).
    const jtekt = macphersonJtekt({ wheelCentreZM: h, knuckle: choice.knuckle });
    spec = widenCorner(jtekt, track / 2 - jtekt.wheelCentre[1]);
    // The steered strut keeps JTEKT's rack; the rear of a car would need a toe link instead.
    if (which === 'rear') throw new Error('A rear strut needs a toe link in place of the tie rod, which this stage does not build');
  } else {
    const defaults = multilinkDefaults(which);
    spec = multilink({
      ...defaults,
      trackM: track,
      wheelCentreZM: h,
      driven,
      steered: which === 'front',
      diffOutputYM: diffOutput ? diffOutput[1] : defaults.diffOutputYM,
    });
  }
  if (!driven) return { ...spec, driven: false, diff: 'none', halfshaft: null };
  // The inner joint exactly where the gearbox's stub ends.
  return { ...spec, driven: true, diff: 'body', halfshaft: { ...spec.halfshaft!, diffOutput: diffOutput! } };
}

/**
 * The chassis of a car: `drive` is its DriveCar's diffOutputs (front-axle frame), required for the driven axle. The
 * driven axle is the record's (car.drive); four-wheel drive needs both.
 */
export function carChassis(car: CarRecord, chassis: ChassisCar, diffOutputs: { front?: CarPoint; rear?: CarPoint }): CarChassis {
  if (chassis.car !== car.id) throw new Error(`The chassis of ${chassis.car} is not ${car.id}'s`);
  const body = bodyOf(car);
  const toCg = carFrameToCg(car);
  const L = car.body.wheelbaseM;
  const build = (which: 'front' | 'rear'): ChassisAxle => {
    const x = which === 'front' ? 0 : -L;
    const drivenHere = car.drive === 'awd' || (car.drive === 'fwd') === (which === 'front');
    const joint = drivenHere ? diffOutputs[which] : undefined;
    if (drivenHere && !joint) throw new Error(`${car.id}: the driven ${which} axle has no inner joints (DriveCar.driveline.diffOutputs)`);
    // The joint in the axle's own frame.
    const diffOutput: Vec3 | null = joint ? [joint[0] - x, joint[1], joint[2]] : null;
    const choice = which === 'front' ? chassis.front : chassis.rear;
    const spec = axleSpec(choice, which, car, diffOutput);
    const share = which === 'front' ? body.frontShare : 1 - body.frontShare;
    const wheel = wheelSize(which === 'rear' ? (car.tyre.sizeRear ?? car.tyre.size) : car.tyre.size);
    const typical = typicalCorner(spec);
    const corner: CornerSpec = {
      ...typical,
      sprungKg: (body.massKg * share) / 2 - UNSPRUNG_KG,
      unsprungKg: UNSPRUNG_KG,
      tyre: car.tyre.id,
      tyreRadiusM: wheel.outerRadiusM,
    };
    const steered = spec.linkage.rods.some((r) => r.steer);
    const lock = steered ? steerLock(spec, lockFromTurning(chassis.turning, L, wheel.tyreWidthM)) : null;
    const sweep = sweepOf(sweepPoints(corner, wheel, lock ? lock.rackM : null), spec.wheelCentre);
    return {
      which,
      layout: spec.layout,
      xCg: toCg([x, 0, 0])[0],
      corner,
      wheel,
      antiRollBar: which === 'front' ? chassis.antiRollBars.front : chassis.antiRollBars.rear,
      lock,
      sweep,
    };
  };
  return { car, body, toCg, front: build('front'), rear: build('rear') };
}
