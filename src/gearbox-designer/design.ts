// The gearbox a visitor builds (gearbox plan, the gearbox designer's parameters). Everything here is a choice they
// can make; the teeth, the shafts' layout, the spec and the figures are derived (teeth.ts, to-spec.ts, evaluate.ts).
//
// Two kinds of value sit side by side, as the crank table does in the engine designer:
// - the ladder (first and top ratio, progression, direct gear) gives every gear a target ratio, which gear-pick.ts
//   turns into teeth;
// - hand-set values take a gear out of the ladder: a ratio typed in (`ratios`), or a whole pair of teeth (`pairs`,
//   `mainPair`, `reverse`, `finalPair`), which is how a catalogue copy keeps its real (reconstructed) teeth and how the
//   settings panel of a gearbox page hands its teeth over.
//
// Plain data and maths: no DOM. The visitor-facing names live in presets.ts.

import type { TyreId } from '../vehicle/vehicle.ts';

export type GearboxType = 'layshaft' | 'transaxle';
export const GEARBOX_TYPES: readonly GearboxType[] = ['layshaft', 'transaxle'];

export type SynchroMaterial = 'brass' | 'molybdenum' | 'carbon';
export const SYNCHRO_MATERIALS: readonly SynchroMaterial[] = ['brass', 'molybdenum', 'carbon'];
export type ClutchKind = 'single-dry' | 'twin-dry' | 'wet';
export const CLUTCH_KINDS: readonly ClutchKind[] = ['single-dry', 'twin-dry', 'wet'];
export type FacingKind = 'organic' | 'ceramic';
export const FACING_KINDS: readonly FacingKind[] = ['organic', 'ceramic'];
/** The spring between the crank and the gearbox: a disc damper, a dual-mass flywheel, or a stiff ("solid") disc. */
export type DamperChoice = 'disc' | 'dmf' | 'stiff';
export const DAMPER_CHOICES: readonly DamperChoice[] = ['disc', 'dmf', 'stiff'];
export type DiffChoice = 'open' | 'plate' | 'helical' | 'locked';
export const DIFF_CHOICES: readonly DiffChoice[] = ['open', 'plate', 'helical', 'locked'];
/** Four-wheel drive comes with the centre differential (stage K16a). */
export type DriveChoice = 'fwd' | 'rwd';
export const DRIVE_CHOICES: readonly DriveChoice[] = ['fwd', 'rwd'];
export type ConeCount = 1 | 2 | 3;

/** One pair of teeth set by hand: driving and driven teeth, normal module, face width and profile shift. */
export interface PairSetting {
  teeth: [number, number];
  module: number;
  faceWidth: number;
  shift: [number, number];
}

/**
 * Reverse set by hand, spur or helical with one module and one helix for every gear of it (the idler meshes with
 * both). Three teeth: driving gear, idler, driven gear. Four (transaxle only): driving gear, the idler gear meshing
 * it, the idler gear meshing the driven gear, driven gear: a compound idler.
 */
export interface ReverseSetting {
  teeth: number[];
  module: number;
  helix: number;
  faceWidth: number;
}

/**
 * A transaxle's final drive set by hand: pinion and ring (crown) teeth, the module (outer transverse for a crown
 * wheel), the face width, the helix of a helical pair (it sets the pair's centre distance, which nothing else shares)
 * and the pinion's profile shift of a crown wheel pair (the crown wheel has its negative).
 */
export interface FinalSetting {
  teeth: [number, number];
  module: number;
  faceWidth: number;
  helix: number;
  shift: number;
}

/** What a copy of a catalogue gearbox remembers: its record, for the published figures beside the model's. */
export interface GearboxFactory {
  gearbox: string;
}

export interface GearboxDesign {
  name: string;
  type: GearboxType;

  // The ladder.
  /** Forward gears. */
  gears: number;
  firstRatio: number;
  topRatio: number;
  /** 0: geometric steps; 1: strongly progressive, the steps shrinking toward the top. */
  progression: number;
  /** Layshaft only: the forward gear that locks the input to the output (ratio 1), or 0 for none. */
  directGear: number;
  /** A ratio typed in for each forward gear; null takes the ladder's. */
  ratios: Array<number | null>;
  /** Teeth set by hand for each forward gear; null picks them. Always null for the direct gear. */
  pairs: Array<PairSetting | null>;
  /** Layshaft: the constant-mesh pair set by hand; null picks it. */
  mainPair: PairSetting | null;
  /** Magnitude, as makers publish it. */
  reverseRatio: number;
  reverse: ReverseSetting | null;
  /** Pinion to wheels. A layshaft box's final drive is the axle's; a transaxle's sits in the case. */
  finalDrive: number;
  /** Transaxle: the final drive set by hand; null picks it. */
  finalPair: FinalSetting | null;

  // Teeth.
  /** Normal module of the speed pairs, mm. */
  module: number;
  /** Normal module of first and reverse, mm: usually a quarter of a millimetre coarser. */
  lowModule: number;
  /** Normal module of the constant-mesh pair (layshaft) or of the final drive (transaxle; outer module of a crown wheel), mm. */
  mainModule: number;
  /** Normal pressure angle, degrees. */
  pressureAngle: number;
  /** Nominal helix angle, degrees; 0 is spur. Each pair gets the angle its teeth leave within ±8° of it. */
  helix: number;
  /** Face width of a speed pair at `module`, mm; the other pairs scale with their module. */
  faceWidth: number;
  /** Input (or countershaft) to output shaft, mm. */
  centreMm: number;

  // Synchronisers.
  /** Cones on each forward gear's synchroniser; reverse has one. */
  cones: ConeCount[];
  synchroMaterial: SynchroMaterial;
  /** Cone half angle α, degrees. */
  coneAngle: number;
  /** Full roof angle 2γ of the blocking chamfers, degrees. */
  roofAngle: number;
  /** Sleeve force the driver gives through the lever, N. */
  shiftForceN: number;

  // Clutch.
  clutch: ClutchKind;
  /** Outer facing diameter, mm; the inner is two thirds of it. */
  clutchMm: number;
  /** Clamp force at full engagement, N. */
  clampN: number;
  facing: FacingKind;
  damper: DamperChoice;

  // Differential.
  diff: DiffChoice;
  /** Plate: locking values S = (T_high − T_low)/(T_high + T_low) on drive and on coast. */
  lockDrive: number;
  lockCoast: number;
  /** Plate: spring preload, N·m. */
  preloadNm: number;
  /** Helical: torque bias ratio. */
  tbr: number;

  // The car.
  /** Catalogue car whose body the design rides on: wheelbase, centre of mass height, the other axle's tyres, wheels. */
  car: string;
  /** Catalogue engine: page or page/variant. */
  engine: string;
  /** Driving mass with the driver, kg. */
  massKg: number;
  drive: DriveChoice;
  /** Share of the weight on the front axle at rest. */
  frontShare: number;
  /** The driven axle's tyre size ('225/45 R16'). */
  tyreSize: string;
  tyre: TyreId;
  /** Drag area, m². */
  cdA: number;
  /** Rolling resistance coefficient. */
  crr: number;

  /** A catalogue copy's record; null for a design of the visitor's own. */
  factory: GearboxFactory | null;
}

/** Fewest teeth the picker gives a gear; a pair set by hand may go lower with a profile shift. */
export const MIN_TEETH = 12;
export const MAX_TEETH = 120;
/** Fewest teeth on a gear set by hand (a crown wheel's pinion has 9 in the 911). */
export const MIN_HAND_TEETH = 9;
/** The picker looks for each pair's helix within this many degrees of the nominal one. */
export const HELIX_SPREAD = 8;
/** Steepest helix of any pair, degrees (gearbox plan, constraints). */
export const MAX_HELIX = 40;
/** Smallest step between neighbouring targets, i_k/i_{k+1}: below it the grid of teeth could give two gears one ratio. */
export const MIN_STEP = 1.02;
/** Most and fewest forward gears. The plan's table says 3–8 and its odd preset has ten, so ten it is. */
export const MIN_GEARS = 3;
export const MAX_GEARS = 10;

/**
 * Ratio of the constant-mesh pair a layshaft box gets from its first gear [estimate of the rule, gearbox plan]:
 * i_main = clamp(i_1^0.4, 1.2, 1.8). The E30's 23/45 is 1.96, the TR-6060's 29/38 1.31.
 */
export const mainTarget = (first: number): number => Math.min(1.8, Math.max(1.2, first ** 0.4));

/**
 * The ladder's ratios, first gear first: ln i_k = ln i_top + (ln i_1 − ln i_top)·f(u), u = (n − k)/(n − 1), with
 * f(u) = (1 − p)·u + p·u². At p = 0 the steps are geometric; at p = 1 the bottom step's logarithm is (2 − h)/h times
 * the top one's (h = 1/(n − 1)): nine times on six speeds. Real boxes sit near the middle: the E30 at about 0.4, the
 * Civic at about 0.5. A direct gear d is held at 1 by stretching each side of it in the logarithm.
 */
export function ladder(d: Pick<GearboxDesign, 'gears' | 'firstRatio' | 'topRatio' | 'progression' | 'directGear'>): number[] {
  const n = d.gears;
  const lo = Math.log(d.topRatio);
  const hi = Math.log(d.firstRatio);
  const p = d.progression;
  const f = (u: number): number => (1 - p) * u + p * u * u;
  const logs = Array.from({ length: n }, (_, i) => lo + (hi - lo) * f(n === 1 ? 1 : (n - 1 - i) / (n - 1)));
  const k = d.directGear;
  if (k >= 1 && k <= n) {
    const at = logs[k - 1]!;
    for (let i = 0; i < n; i++) {
      const v = logs[i]!;
      if (i < k - 1) logs[i] = hi === at ? v : hi + ((v - hi) * (0 - hi)) / (at - hi);
      else if (i > k - 1) logs[i] = lo === at ? v : lo + ((v - lo) * (0 - lo)) / (at - lo);
    }
    logs[k - 1] = 0;
  }
  return logs.map(Math.exp);
}

/**
 * The target of every forward gear: the ladder's or the typed-in ratio, then each kept at least MIN_STEP below the one
 * before it (the direct gear stays at 1 and pushes the gears below it up instead). A pair of teeth set by hand has its
 * own ratio, which the caller passes in `fixed`.
 */
export function targetRatios(d: Pick<GearboxDesign, 'gears' | 'firstRatio' | 'topRatio' | 'progression' | 'directGear' | 'ratios'>, fixed: Array<number | null> = []): number[] {
  const base = ladder(d);
  const t = base.map((v, i) => fixed[i] ?? d.ratios[i] ?? v);
  const direct = d.directGear;
  if (direct >= 1 && direct <= t.length) t[direct - 1] = 1;
  for (let i = 1; i < t.length; i++) if (i !== direct - 1) t[i] = Math.min(t[i]!, t[i - 1]! / MIN_STEP);
  if (direct >= 2) for (let i = direct - 2; i >= 0; i--) t[i] = Math.max(t[i]!, t[i + 1]! * MIN_STEP);
  return t;
}

/**
 * The starting design: a five-speed layshaft box with a direct fifth in the BMW M3 E30, its teeth picked from the
 * ladder. Its figures are close to the Getrag 265 but it is no copy of it (presets.ts has the copies).
 */
export const DEFAULT_GEARBOX_DESIGN: GearboxDesign = {
  name: '',
  type: 'layshaft',
  gears: 5,
  firstRatio: 3.72,
  topRatio: 1,
  progression: 0.4,
  directGear: 5,
  ratios: [null, null, null, null, null],
  pairs: [null, null, null, null, null],
  mainPair: null,
  reverseRatio: 4.23,
  reverse: null,
  finalDrive: 3.25,
  finalPair: null,
  module: 1.75,
  lowModule: 2.25,
  mainModule: 2,
  pressureAngle: 20,
  helix: 26,
  faceWidth: 18,
  centreMm: 76,
  cones: [1, 1, 1, 1, 1],
  synchroMaterial: 'brass',
  coneAngle: 6.5,
  roofAngle: 120,
  shiftForceN: 600,
  clutch: 'single-dry',
  clutchMm: 228,
  clampN: 5900,
  facing: 'organic',
  damper: 'disc',
  diff: 'plate',
  lockDrive: 0.25,
  lockCoast: 0.25,
  preloadNm: 0,
  tbr: 2.5,
  car: 'bmw-m3-e30',
  engine: 'i4/bmw-m3-e30-s14',
  massKg: 1275,
  drive: 'rwd',
  frontShare: 0.533,
  tyreSize: '225/45 R16',
  tyre: 'classic',
  cdA: 0.711,
  crr: 0.0088,
  factory: null,
};
