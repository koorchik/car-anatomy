// Data types of the suspension section. Stage 1a carries what an independent corner with links and a MacPherson strut
// needs; later stages add fields and linkage kinds (pivot arms, beams, solid axles) without changing these.
// Conventions are at the top of kinematics.ts. Core modules hold no visitor-facing text: names live in the UI and in
// src/data/.

import type { TyreChoice } from '../vehicle/tyre-data.ts';

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

/** Locates the knuckle of an independent corner with exactly five constraints. */
export type CornerLinkage = {
  kind: 'links';
  wishbones: Wishbone[];
  rods: Rod[];
  strut?: StrutSpec;
};

/**
 * Trailing arm, semi-trailing arm and swing axle: the knuckle is rigid to one arm turning about the body axis through
 * `axisA` and `axisB` (the two bushes, or the inner joint and a point along the axis). Solved in closed form.
 */
export interface PivotLinkage { kind: 'pivot'; axisA: Vec3; axisB: Vec3; armPart: string }

/** Every way an independent corner is located. Code that takes any corner says AxleSpec<AnyCornerLinkage> and narrows
 *  on `kind`; plain AxleSpec is a corner of links, which is what most code handles. */
export type AnyCornerLinkage = CornerLinkage | PivotLinkage;

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
  /** For a coil on a strut: how far the upper seat sits below the top mount and the lower seat above the strut's lower
   *  point, m. The spring's length is the strut length minus both; only drawings and the perch need it. */
  strutSeats?: { upperM: number; lowerM: number };
}

export type DamperKind = 'passive' | 'adaptive' | 'magneride' | 'active';

export interface DamperSpec {
  kind: DamperKind;
  body: Vec3;
  wheel: Vec3 | 'strut';
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

/** One axle of the car: an independent corner, given for the left side; the right one is its mirror. */
export interface AxleSpec<L extends AnyCornerLinkage = CornerLinkage> {
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
