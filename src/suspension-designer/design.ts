// The suspension designer's design: a flat object of the visitor's choices (suspensions plan, the designer's
// parameters). The chain is ChassisDesign → resolveChassis (constraints.ts) → chassisToSpec (to-spec.ts) → ChassisSpec
// → buildChassis, and the catalogue goes the same way (catalogue.ts), so a new parameter reaches both at once.
//
// Keys are flat. What belongs to one axle is written once as AxleParams and appears twice, with the suffix `F` for the
// front axle and `R` for the rear one (`layoutF`, `springNmmR`). Lengths are in millimetres and angles in degrees, as the
// panel shows them; to-spec.ts turns them into the SI of src/suspension/. A parameter that a layout does not read stays
// in the design with its value, so switching back restores it; editChassis (edit.ts) sets the typical values of the
// layout chosen. No visitor-facing text here: names live in the presets and on the page.

import type { KnuckleKind, LayoutId } from '../suspension/spec.ts';
import type { SteeringAssist, SteeringGearKind } from '../suspension/steering.ts';
import type { DamperPreset } from '../suspension/setup.ts';
import type { TyreChoice } from '../vehicle/tyre-data.ts';

/** Layouts the designer builds: every axle whose core exists. A steered front axle has links, or is a live axle steered
 *  by a drag link (P13-core); the rear takes any. The pushrod has no core yet. */
export type DesignLayout = Extract<
  LayoutId,
  'macpherson' | 'double-wishbone' | 'multilink' | 'trailing-arm' | 'semi-trailing' | 'swing-axle' | 'twist-beam' | 'live-axle' | 'de-dion'
>;

export const FRONT_LAYOUTS = ['macpherson', 'double-wishbone', 'multilink', 'live-axle'] as const satisfies readonly DesignLayout[];
export const REAR_LAYOUTS = [
  'double-wishbone', 'multilink', 'trailing-arm', 'semi-trailing', 'swing-axle', 'twist-beam', 'live-axle', 'de-dion',
] as const satisfies readonly DesignLayout[];

export type Drive = 'fwd' | 'rwd' | 'awd';
export const DRIVES = ['fwd', 'rwd', 'awd'] as const satisfies readonly Drive[];

export const KNUCKLES = ['plain', 'dual-axis', 'revoknuckle'] as const satisfies readonly KnuckleKind[];

/** What holds a solid axle across the car (templates/solid-axle.ts). */
export type SolidLateralChoice = 'panhard' | 'watt' | 'triangulated' | 'leaf';
export const SOLID_LATERALS = ['panhard', 'watt', 'triangulated', 'leaf'] as const satisfies readonly SolidLateralChoice[];
export const SOLID_LINKS = ['four', 'three'] as const;

/** A damper preset (the bump scene's ζ at the wheel, setup.ts) or the visitor's own coefficients. */
export type DamperChoice = DamperPreset | 'custom';
export const DAMPER_CHOICES = ['worn', 'comfort', 'sport', 'track', 'custom'] as const satisfies readonly DamperChoice[];

export const TYRES = ['street', 'semi', 'slick', 'classic'] as const satisfies readonly TyreChoice[];

export { STEERING_ASSISTS, STEERING_GEARS } from '../suspension/steering.ts';
/** Gears that steer a solid axle: a box with a pitman arm (a rack would ride on the axle and fight the drag link). */
export const BOX_GEARS = ['worm-roller', 'recirculating-ball'] as const satisfies readonly SteeringGearKind[];

/** Everything one axle has. Which fields a layout reads is in AXLE_KEYS_OF (below). */
export interface AxleParams {
  layout: DesignLayout;
  /** Track at design, mm. */
  trackMm: number;

  // MacPherson strut: the knuckle, and the split steering axis of a dual-axis or RevoKnuckle knuckle.
  knuckle: KnuckleKind;
  /** Kingpin offset at the hub of a split axis, mm (the plain knuckle's is fixed by its hardpoints). */
  kingpinOffsetMm: number;

  // Steering axis of a split strut knuckle, a double wishbone or a multilink.
  kpiDeg: number;
  casterDeg: number;
  /** Scrub radius, mm, positive when the steering axis meets the road inboard of the contact patch. */
  scrubMm: number;

  // Double wishbone and multilink (the multilink is a double wishbone with each arm split in two links).
  lowerArmMm: number;
  upperArmMm: number;
  /** Front-view slope of the upper arm, degrees, positive when its inner pivot is lower than the ball joint. */
  upperAngleDeg: number;
  /** Heights above the road of the lower arm's inner pivots and of the two ball joints, mm, as the templates take
   *  them (the steering arm keeps the template's height too). */
  lowerPivotZMm: number;
  lowerBallZMm: number;
  upperBallZMm: number;
  /** Side-view tilt of the arm axes toward the anti effect, degrees. */
  svAngleDeg: number;
  /** Height shift of the inner tie-rod (toe-link) joint from where it gives no bump steer, mm. */
  tieRodDzMm: number;

  // A single pivot axis: trailing arm (sweep 0°), semi-trailing arm, swing axle (90°).
  sweepDeg: number;
  /** Inner pivot ahead of the wheel centre, from the car's centre line, and above the wheel centre, mm. */
  pivotArmMm: number;
  pivotYMm: number;
  pivotDzMm: number;
  /** Side-view slope of the pivot axis, degrees. */
  pivotSvDeg: number;

  // Twist beam.
  /** Where the beam joins the arms: 0 at the bushes, 1 at the wheels. */
  beamPos: number;
  /** Shear centre above the line from the bush to the wheel centre, mm. */
  shearDzMm: number;
  /** The bush: ahead of the wheel centre, inboard of it, above it, mm. */
  beamArmMm: number;
  beamBushInMm: number;
  beamBushDzMm: number;
  /** Torsional stiffness of the beam, N·m/rad. */
  beamTorsionNmRad: number;

  // Solid axle (live axle, de Dion).
  solidLateral: SolidLateralChoice;
  solidLinks: (typeof SOLID_LINKS)[number];
  lowerLinkMm: number;
  upperLinkMm: number;
  /** Side-view slopes of the lower and upper links, degrees, positive when the link rises toward the front. */
  linkAngleDeg: number;
  upperLinkAngleDeg: number;
  /** Height of the Panhard rod or of the Watt pivot above the road, mm. */
  lateralZMm: number;

  // Half-shafts of a driven axle with the differential on the body.
  /** Inner joint from the car's centre line and relative to the wheel centre's height, mm. */
  diffOutputYMm: number;
  diffOutputDzMm: number;

  // Alignment.
  /** Static camber, degrees, negative when the top leans in; static toe, degrees, positive toe-in. */
  camberDeg: number;
  toeDeg: number;

  // Spring, damper, anti-roll bar.
  /** Rate along the spring, N/mm; null: the typical rate, the one that gives the body TYPICAL_RIDE_HZ over this axle. */
  springNmm: number | null;
  damper: DamperChoice;
  /** Own damper, N·s/m along the damper below the knee (with `damper: 'custom'`). */
  damperCompression: number;
  damperRebound: number;
  /** Own damper's knee, m/s, and its slope past the knee as a share of the slope below (below 1: digressive). */
  damperKneeMs: number;
  damperHighRatio: number;
  /** Anti-roll bar: outer diameter (0: none), wall thickness of a tube (0: solid), lever arm, mm. */
  barMm: number;
  barWallMm: number;
  barArmMm: number;

  // Wheels and brakes.
  /** Unsprung mass of one corner (half the axle on a beam), kg. */
  unsprungKg: number;
  /** Tyre size: section width, mm; sidewall as a percentage of it; rim diameter, inches. */
  tyreWidthMm: number;
  tyreAspect: number;
  rimIn: number;
  /** Brakes on the differential, not in the wheel. */
  brakeInboard: boolean;

  // Steering (the front axle; src/suspension/steering.ts).
  steeringGear: SteeringGearKind;
  /** Rack travel per turn of the steering wheel on centre, mm. */
  rackMmPerRev: number;
  /** Steering-wheel angle per pitman-arm angle of a box on centre. */
  boxRatio: number;
  /** Gain of the gear toward the lock over its gain on centre (1: a constant ratio). */
  variableRatio: number;
  assist: SteeringAssist;
  /** Share of the Jeantaud angle the steering arms point at; null keeps the template's arms. */
  ackermann: number | null;
  /** Front-view angle of a steered solid axle's drag link to the road, degrees, positive with the pitman end higher
   *  (0: level, parallel to the Panhard rod). */
  dragLinkDeg: number;
}

type Suffixed<S extends string> = { [K in keyof AxleParams as `${K & string}${S}`]: AxleParams[K] };

export interface CarParams {
  /** The shared car the design started from (src/data/cars.ts), or null. It keeps that car's road load (to-spec.ts). */
  car: string | null;
  /** Mass on the road, driver included, kg; share of it on the front axle; centre of mass above the road, mm. */
  massKg: number;
  frontShare: number;
  cgHeightMm: number;
  wheelbaseMm: number;
  drive: Drive;
  /** Brake balance: share of the brake force on the front axle. */
  brakeFront: number;
  /** Share of the drive force on the front axle when both axles are driven. */
  driveFront: number;
  finalDrive: number;
  tyre: TyreChoice;
}

export type ChassisDesign = CarParams & Suffixed<'F'> & Suffixed<'R'>;

export type AxleEnd = 'F' | 'R';
export type AxleKey = keyof AxleParams;
export type DesignKey = keyof ChassisDesign;

/** The body ride frequency a typical spring gives, Hz, with the tyre in series: front lower than rear for a flat ride.
 *  The typical cars' figures (templates/typical-chassis.ts tests), estimates. */
export const TYPICAL_RIDE_HZ: Record<AxleEnd, number> = { F: 1.3, R: 1.45 };

export const AXLE_KEYS = [
  'layout', 'trackMm', 'knuckle', 'kingpinOffsetMm', 'kpiDeg', 'casterDeg', 'scrubMm', 'lowerArmMm', 'upperArmMm',
  'upperAngleDeg', 'lowerPivotZMm', 'lowerBallZMm', 'upperBallZMm', 'svAngleDeg', 'tieRodDzMm', 'sweepDeg',
  'pivotArmMm', 'pivotYMm', 'pivotDzMm', 'pivotSvDeg', 'beamPos', 'shearDzMm', 'beamArmMm', 'beamBushInMm',
  'beamBushDzMm', 'beamTorsionNmRad', 'solidLateral', 'solidLinks', 'lowerLinkMm', 'upperLinkMm', 'linkAngleDeg',
  'upperLinkAngleDeg', 'lateralZMm', 'diffOutputYMm', 'diffOutputDzMm', 'camberDeg', 'toeDeg', 'springNmm', 'damper',
  'damperCompression', 'damperRebound', 'damperKneeMs', 'damperHighRatio', 'barMm', 'barWallMm', 'barArmMm',
  'unsprungKg', 'tyreWidthMm', 'tyreAspect', 'rimIn', 'brakeInboard', 'steeringGear', 'rackMmPerRev', 'boxRatio',
  'variableRatio', 'assist', 'ackermann', 'dragLinkDeg',
] as const satisfies readonly AxleKey[];

export const CAR_KEYS = [
  'car', 'massKg', 'frontShare', 'cgHeightMm', 'wheelbaseMm', 'drive', 'brakeFront', 'driveFront', 'finalDrive', 'tyre',
] as const satisfies readonly (keyof CarParams)[];

/** The key of an axle parameter on one end: axleKey('springNmm', 'R') is 'springNmmR'. */
export const axleKey = <K extends AxleKey>(key: K, end: AxleEnd): `${K}${AxleEnd}` & DesignKey => `${key}${end}` as `${K}${AxleEnd}` & DesignKey;

/** The suffixed keys of each end, in AXLE_KEYS order: built once, since axleOf runs thousands of times a second. */
const SUFFIXED: Record<AxleEnd, readonly string[]> = { F: AXLE_KEYS.map((k) => `${k}F`), R: AXLE_KEYS.map((k) => `${k}R`) };

/** Axles already read from a design: designs are never changed once made (every edit makes a new one), and the
 *  model reads the same axle of the same design many times over. */
const AXLES = new WeakMap<ChassisDesign, { F?: Readonly<AxleParams>; R?: Readonly<AxleParams> }>();

/** One axle's parameters without the suffix. The object is shared and frozen: copy it to change it. */
export function axleOf(d: ChassisDesign, end: AxleEnd): Readonly<AxleParams> {
  let seen = AXLES.get(d);
  const hit = seen?.[end];
  if (hit) return hit;
  const out = {} as Record<AxleKey, unknown>;
  const src = d as unknown as Record<string, unknown>;
  const keys = SUFFIXED[end];
  for (let i = 0; i < AXLE_KEYS.length; i++) out[AXLE_KEYS[i]] = src[keys[i]];
  const axle = Object.freeze(out) as unknown as Readonly<AxleParams>;
  if (!seen) {
    seen = {};
    AXLES.set(d, seen);
  }
  seen[end] = axle;
  return axle;
}

/** The design with some parameters of one axle replaced. */
export function withAxle(d: ChassisDesign, end: AxleEnd, patch: Partial<AxleParams>): ChassisDesign {
  const out = { ...d } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) out[`${key}${end}`] = value;
  return out as unknown as ChassisDesign;
}

/** Gathers two axles and the car into a design. */
export function designOf(car: CarParams, front: AxleParams, rear: AxleParams): ChassisDesign {
  return withAxle(withAxle({ ...car } as ChassisDesign, 'F', front), 'R', rear);
}

const PIVOT_LAYOUTS: readonly DesignLayout[] = ['trailing-arm', 'semi-trailing', 'swing-axle'];
const SOLID_LAYOUTS: readonly DesignLayout[] = ['live-axle', 'de-dion'];
export const isPivot = (layout: DesignLayout): boolean => PIVOT_LAYOUTS.includes(layout);
export const isSolid = (layout: DesignLayout): boolean => SOLID_LAYOUTS.includes(layout);
/** Layouts built from the double wishbone template's intents. */
export const isWishbone = (layout: DesignLayout): boolean => layout === 'double-wishbone' || layout === 'multilink';

/** Whether an axle is driven by the car's drive. */
export const isDriven = (drive: Drive, end: AxleEnd): boolean => drive === 'awd' || (drive === 'fwd') === (end === 'F');
