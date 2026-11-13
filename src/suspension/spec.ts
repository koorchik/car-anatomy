// Data types of the suspension section. Stage 1a carries what an independent corner with links and a MacPherson strut
// needs, stage P4-core the split strut knuckles, the multilink's virtual steering axis and springs on arms; later
// stages add fields and linkage kinds (pivot arms, beams, solid axles) without changing these.
// Conventions are at the top of kinematics.ts. Core modules hold no visitor-facing text: names live in the UI and in
// src/data/.

import type { TyreChoice } from '../vehicle/tyre-data.ts';
import type { VehicleBody } from '../vehicle/car.ts';
import type { RoadLoadCoeffs } from '../vehicle/road-load.ts';

/** ISO 8855, metres: x forward, y left, z up. Points of an independent corner are given for the left side. */
export type Vec3 = readonly [number, number, number];

export type LayoutId =
  | 'macpherson' | 'double-wishbone' | 'multilink' | 'pushrod'
  | 'trailing-arm' | 'semi-trailing' | 'swing-axle'
  | 'twist-beam' | 'live-axle' | 'de-dion';

/**
 * A rod with a ball joint at each end: one distance. With `steer`, the body end follows the steering linkage (along y
 * for a rack). `lengthM` overrides the length the two points give, as a turnbuckle does: the static toe of the setup
 * is set this way, so the points stay where the drawing has them and the knuckle turns instead.
 */
export interface Rod { id: string; body: Vec3; knuckle: Vec3; part: string; steer?: boolean; lengthM?: number }

/** A wishbone: two body pivots and one ball joint on the knuckle. Two distances, so it turns about the pivot axis. */
export interface Wishbone { id: string; front: Vec3; rear: Vec3; ball: Vec3; part: string }

/**
 * MacPherson strut: the strut tube is rigid with the knuckle, so the knuckle-fixed axis through `lower` (in the
 * direction of `top` at design) must pass through the top mount on the body. Two constraints. `topShift` moves the
 * top mount on the body (camber plates) without turning the axis inside the knuckle.
 */
export interface StrutSpec { top: Vec3; lower: Vec3; topShift?: Vec3 }

/**
 * The knuckle of a MacPherson strut. 'plain': rigid with the strut tube, so the steering axis runs from the lower ball
 * joint to the top mount. A split axis ('dual-axis' as on the Honda Civic Type R, 'revoknuckle' as on the Ford Focus RS
 * Mk2) puts the wheel on a second knuckle that turns relative to the strut carrier about its own axis, fixed in the
 * carrier, closer to the wheel. The carrier then holds the strut, the wishbones and `hold`; the rods (the tie rod) act
 * on the wheel knuckle, which adds one unknown (its turn) and no constraint of its own.
 */
export type KnuckleKind = 'plain' | 'dual-axis' | 'revoknuckle';

export interface SplitKnuckle {
  kind: Exclude<KnuckleKind, 'plain'>;
  /** Two points of the steering axis on the carrier at design, the lower one first. */
  axisLower: Vec3;
  axisUpper: Vec3;
  /**
   * What keeps the carrier from spinning about the strut: its joint to the lower arm (a sleeve bush on the RevoKnuckle)
   * lets it turn about `body` (a body direction, the arm's pivot axis) and tilt about `carrier` (a carrier direction,
   * square to `body` at design), not spin about the third axis. One constraint: the two stay square.
   */
  hold: { body: Vec3; carrier: Vec3 };
  /** Parts of the two knuckles, for the 3D cards. */
  carrierPart: string;
  knucklePart: string;
}

/**
 * Locates the knuckle of an independent corner with exactly five constraints (six on a split knuckle, which has one
 * unknown more).
 */
export type CornerLinkage = {
  kind: 'links';
  wishbones: Wishbone[];
  rods: Rod[];
  strut?: StrutSpec;
  /** A MacPherson knuckle with a split steering axis; absent for a plain one. */
  knuckle?: SplitKnuckle;
  /**
   * Where the steering axis is when no two ball joints carry it (a multilink): through two virtual pivots, each where
   * the lines of two named rods come closest. The pivots move with the links, as on the car.
   */
  virtualAxis?: { lower: readonly [string, string]; upper: readonly [string, string] };
};

/**
 * Trailing arm, semi-trailing arm and swing axle: the knuckle is rigid to one arm turning about the body axis through
 * `axisA` and `axisB` (the two bushes, or the inner joint and a point along the axis). Solved in closed form.
 */
export interface PivotLinkage { kind: 'pivot'; axisA: Vec3; axisB: Vec3; armPart: string }

/** Every way an independent corner is located. Code that takes any corner says AxleSpec<AnyCornerLinkage> and narrows
 *  on `kind`; plain AxleSpec is a corner of links, which is what most code handles. */
export type AnyCornerLinkage = CornerLinkage | PivotLinkage;

/**
 * Twist beam: two trailing arms on body bushes, welded to a cross member that is stiff in bending and soft in torsion.
 * Both wheels hang on one part, so the axle has two degrees of freedom and is solved as a whole (solve-twist-beam.ts):
 * in heave both arms swing about the line through the two bushes, in roll each arm turns about the line from its bush
 * to the beam's shear centre. Points are the left ones; the right bush is the mirror.
 */
export interface TwistBeamLinkage {
  kind: 'twist-beam';
  bush: Vec3;
  /** Shear centre of the beam's section on the car's centre line at design. */
  shearCentre: Vec3;
  /** Torque per radian of twist of one arm relative to the other, N·m/rad. */
  torsionNmPerRad: number;
  armPart: string;
  beamPart: string;
}

/**
 * Watt's linkage on a solid axle: a rocker on the axle turning about the axle's x axis at `pivotOnAxle`, `centreLinkM`
 * long and upright at design, and two rods from its ends to the body, the upper one to `upperBody` and the lower one to
 * `lowerBody`, on opposite sides of the car. The pivot then runs nearly straight up and down.
 */
export interface WattSpec { pivotOnAxle: Vec3; upperBody: Vec3; lowerBody: Vec3; centreLinkM: number }

/**
 * Leaf spring of the left side (the right one is its mirror), as the SAE three-link model draws it (solve-axle.ts):
 * the front eye on the body, the rear eye on a shackle that hangs `shackleM` from a body pivot straight above it at
 * design, and the seat clamped to the axle. `rateNmm` is the vertical rate at the seat, N/mm.
 */
export interface LeafSpec { frontEye: Vec3; rearEye: Vec3; shackleM: number; axleSeat: Vec3; rateNmm: number }

/** How a solid axle is held across the car: a Panhard rod (body end, axle end), Watt's linkage, or the leaf springs
 *  themselves, which hold it every way. Rods angled in plan (a triangulated four-link) need none: 'rods'. */
export type SolidLateral =
  | { kind: 'panhard'; body: Vec3; axle: Vec3 }
  | { kind: 'watt'; spec: WattSpec }
  | { kind: 'leaf'; spec: LeafSpec }
  | { kind: 'rods' };

/**
 * Solid axle (live axle or de Dion tube): both wheels on one rigid part, solved as a whole by weighted least squares
 * (solve-axle.ts). Every rod is written out, both sides, because a solid axle need not be symmetric; a rod's `knuckle`
 * end is a point of the axle.
 */
export interface SolidAxleLinkage {
  kind: 'solid';
  rods: Rod[];
  lateral: SolidLateral;
  /** Stiffness of each rod along its axis, N/m: a redundant set binds instead of failing. */
  rodStiffness: number;
  axlePart: string;
}

/** Both wheels on one part: a twist beam or a solid axle. */
export type BeamLinkage = TwistBeamLinkage | SolidAxleLinkage;

export type SpringKind = 'coil' | 'torsion' | 'leaf' | 'air' | 'hydro';

export interface SpringSpec {
  kind: SpringKind;
  /** Along the spring, N/m. */
  rate: number;
  /** Second rate and the compression where it starts, for a progressive coil. */
  progressive: { rate: number; fromM: number } | null;
  /** Upper end, on the body. */
  body: Vec3;
  /** End on the arm or knuckle, or 'strut' for a coil around the damper (its length then follows the strut). */
  wheel: Vec3 | 'strut';
  /** Id of the wishbone or rod that carries the `wheel` end; absent when it sits on the knuckle. A rod carries it on
   *  its own line (its spin about that line is free). */
  on?: string;
  /** For a coil on a strut: how far the upper seat sits below the top mount and the lower seat above the strut's lower
   *  point, m. The spring's length is the strut length minus both; only drawings and the perch need it. */
  strutSeats?: { upperM: number; lowerM: number };
}

export type DamperKind = 'passive' | 'adaptive' | 'magneride' | 'active';

export interface DamperSpec {
  kind: DamperKind;
  body: Vec3;
  wheel: Vec3 | 'strut';
  /** Id of the wishbone or rod that carries the `wheel` end, as for the spring. */
  on?: string;
  /** N·s/m along the damper, below the knee. */
  compression: number;
  rebound: number;
  /** Damper speed of the knee, m/s. */
  kneeMs: number;
  /** Slope above the knee as a share of the slope below (digressive < 1). */
  highRatio: number;
  strokeM: number;
}

/** Elastomer bump stop on the damper rod. `gapM` is measured along the damper from its length at design. */
export interface BumpStopSpec { gapM: number; lengthM: number; rate: number }

/** A driven independent corner: halfshaft from the differential output on the body to the hub. */
export interface HalfshaftSpec {
  /** Centre of the inner joint at design, car frame (left side). Agreed with the gearbox data where there is any. */
  diffOutput: Vec3;
  /** Centre of the outer joint at design: a knuckle point on the hub axis. */
  outerJoint: Vec3;
  inner: 'tripod' | 'ball-plunge' | 'cross';
  outer: 'fixed-ball' | 'none';
  /** Maker limits used for the warnings. */
  innerMaxDeg: number;
  outerMaxDeg: number;
  /** Axial travel of the inner joint, m: [most pulled out, most pushed in] as [negative, positive]. */
  plungeM: [number, number];
  diameterM: number;
}

/** One axle of the car: an independent corner, given for the left side; the right one is its mirror. A beam axle
 *  (BeamLinkage) is given the same way: its left wheel, spring and damper, mirrored for the right. */
export interface AxleSpec<L extends AnyCornerLinkage | BeamLinkage = CornerLinkage> {
  layout: LayoutId;
  /** Track at design ride height, m. */
  track: number;
  linkage: L;
  /** Wheel centre at design ride height (a knuckle point), left corner. */
  wheelCentre: Vec3;
  /** Spin axis of the left wheel at design, unit, pointing outboard (+y with zero camber and toe). */
  spinAxis: Vec3;
  spring: SpringSpec;
  damper: DamperSpec;
  bumpStop: BumpStopSpec;
  driven: boolean;
  /** Where the differential sits: on the body (independent, de Dion), on the axle (live axle), or none. */
  diff: 'body' | 'axle' | 'none';
  /** Driven corners with the differential on the body; null otherwise. */
  halfshaft: HalfshaftSpec | null;
  /** Wheel travel from design ride height to the end stops, m: bump to a fully pressed bump stop, droop to damper
   *  top-out. The kinematic tables cover this range. */
  travel: { bumpM: number; droopM: number };
}

/** What a quarter car needs on top of the axle: the masses over this corner and the tyre. */
export interface CornerSpec {
  axle: AxleSpec;
  /** Sprung mass carried by this corner, kg. */
  sprungKg: number;
  /** Unsprung mass of the corner: wheel, tyre, brake, hub, knuckle, half the links and spring, kg. */
  unsprungKg: number;
  /** Which tyre data the corner rides on (src/vehicle/tyre-data.ts). */
  tyre: TyreChoice;
  /** Free tyre radius when the car's tyre size is known, m; null takes the radius of the tyre file. */
  tyreRadiusM: number | null;
}

/**
 * Anti-roll bar of an axle: a torsion bar across the car whose two arms run to drop links on the wheels. Its torsional
 * rate is K_θ = G·π·(d⁴ − d_i⁴)/(32·span) (forces.ts); the drop links are taken as upright and short against the arms,
 * so each arm's end rises with its link point and the bar twists by the difference of the two rises over `armM`.
 * Bending of the arms and the rubber of the bushes are left out (docs/suspension-model.md).
 */
export interface SwayBarSpec {
  /** Outer diameter, m, and wall thickness of a tube; null for a solid bar. */
  diameterM: number;
  wallM: number | null;
  /** Lever arm from the bar's axis to the drop link, m. */
  armM: number;
  /** Length of the twisting section between the two arms, m. */
  spanM: number;
  /** Lower end of the left drop link at design: a point of the knuckle (of the strut carrier on a split knuckle), of the
   *  wishbone or rod named by `on`, of the arm on a twist beam, of the axle on a solid axle. The right one is the mirror. */
  link: Vec3;
  on?: string;
}

/** Every linkage an axle of the chassis may have. */
export type AnyAxleLinkage = AnyCornerLinkage | BeamLinkage;

/** One axle of a chassis: the axle as the templates give it, its bar, the unsprung mass and the tyre radius. */
export interface ChassisAxleSpec {
  axle: AxleSpec<AnyAxleLinkage>;
  swayBar: SwayBarSpec | null;
  /** Unsprung mass of one corner (wheel, tyre, brake, hub, knuckle, half the links, spring and damper); on a beam axle
   *  half the axle, kg. */
  unsprungKg: number;
  /** Free tyre radius when the car's tyre size is known, m; null takes the radius of the tyre file. */
  tyreRadiusM: number | null;
}

/**
 * How a chassis brakes and drives, and what holds it back (stage P9-core). The driven axles are those whose AxleSpec
 * says `driven`, and each axle's `diff` says where its differential sits.
 */
export interface ChassisLongitudinal {
  /** Share of the brake force on the front axle (the brake balance). */
  brakeFront: number;
  /** Whether each axle's brakes sit inboard, on the body or the differential (a de Dion, racing cars), and not in the
   *  wheel: their torque then reaches the body through the half-shafts instead of the knuckle. [front, rear] */
  brakeInboard: readonly [boolean, boolean];
  /** Share of the drive force on the front axle when both axles are driven; ignored otherwise. */
  driveFront: number;
  /** Final drive ratio: the propshaft torque is the driven wheels' torque over it. */
  finalDrive: number;
  /** The car's road load (src/vehicle/road-load.ts): its drag part acts on the body at `aeroHeightM`, the rest (rolling)
   *  in the contact patches. */
  roadLoad: RoadLoadCoeffs;
  /** Height above the road the drag acts at, m. */
  aeroHeightM: number;
}

/**
 * A whole chassis for ChassisSim and statics.ts. `body` holds what NHTSA measures for the whole car, unsprung masses
 * included (the shared VehicleBody of src/vehicle/car.ts with the mass, as bodyOf gives it); buildChassis derives the
 * sprung body from it. The tracks of the chassis are those of its axles.
 */
export interface ChassisSpec {
  id: string;
  body: VehicleBody & { massKg: number };
  front: ChassisAxleSpec;
  rear: ChassisAxleSpec;
  /** Which tyre the car rides on (src/vehicle/tyre-data.ts), the same on all four wheels. */
  tyre: TyreChoice;
  /** Brakes, drive and road load. */
  longitudinal: ChassisLongitudinal;
  /** 'measured' only for published hardpoints (JTEKT). Everything else is typical geometry. */
  geometry: 'measured' | 'typical';
}

/**
 * The body on the springs: the whole car of VehicleBody without the four unsprung corners (point masses at the wheel
 * centres). Heights above the road, x from the whole car's centre of mass (positive forward), inertias about the sprung
 * centre of mass, kg·m².
 */
export interface SprungBody { massKg: number; cgHeightM: number; cgX: number; ixx: number; iyy: number; izz: number }
