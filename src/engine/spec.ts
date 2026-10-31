// Declarative description of an engine. Everything the 3D model, the sound and
// the charts need is derived from these fields (see kinematics.ts).

export type Fuel = 'petrol' | 'diesel';
export type Aspiration = 'na' | 'turbo' | 'twin-turbo' | 'quad-turbo';
export type Valvetrain = 'dohc' | 'sohc' | 'ohv';

export type Family = 'inline' | 'vee' | 'flat' | 'narrow' | 'rotary';

export type LayoutDef =
  /** All cylinders in one row. `tilt` leans the whole engine for installation (deg). */
  | { kind: 'inline'; tilt?: number }
  /**
   * Two banks on a shared crank. `numbering` says how cylinder numbers map to banks:
   * alternating: 1,3,5.. on bank A and 2,4,6.. on bank B; sequential: first half A, second half B.
   * `bankA` is the angle of bank A from vertical, clockwise seen from the front.
   */
  | { kind: 'vee'; bankA: number; bankB: number; numbering: 'alternating' | 'sequential' }
  /** Horizontally opposed. Each cylinder has its own crank pin. */
  | { kind: 'boxer'; numbering: 'alternating' | 'sequential' }
  /** Single head over a very narrow zig-zag of cylinders. */
  | { kind: 'vr'; narrow: number }
  /** Two VR banks on one crank. */
  | { kind: 'w'; between: number; narrow: number }
  | { kind: 'wankel'; rotors: number; R: number; e: number; width: number };

export interface ExhaustDef {
  /** Cylinder numbers that meet in the same collector. Each group gets its own pipe. */
  groups: number[][];
  /** Stereo position of each group, -1..1. */
  pans?: number[];
  /** Primary pipe length in metres, one value or one per cylinder number (index n-1). */
  headerM: number | number[];
  /** Length from collector to muffler, metres. */
  pipeM: number;
  /** 0 = heavy road muffler, 1 = open race exhaust. */
  open: number;
  /** Non-linear wave steepening at high load; makes the note raspier. */
  rasp: number;
}

export interface Article {
  /** One-sentence answer to "what is this engine known for". */
  lead: string;
  /** How the mechanism is arranged and why. */
  how: string;
  /** Why it sounds the way it does. */
  sound: string;
  pros: string[];
  cons: string[];
  /** Real cars or machines that use this layout. */
  cars: string[];
}

export interface EngineSpec {
  id: string;
  family: Family;
  /** Short name stamped behind the model, e.g. "V8". */
  badge: string;
  /** Column in the engine table: number of cylinders (rotors count as such). */
  cylinders: number;
  title: string;
  /** Real engine used for all concrete figures. */
  example: string;
  fuel: Fuel;
  aspiration: Aspiration;
  /** mm. Wankel engines ignore these and use R/e/width from the layout. */
  bore: number;
  stroke: number;
  /** Connecting rod length / stroke. */
  rodRatio: number;
  compression: number;
  layout: LayoutDef;
  firingOrder: number[];
  /** Crank degrees between successive firings. Defaults to an even split of the cycle. */
  firingIntervals?: number[];
  valvetrain: Valvetrain;
  valvesPerCyl: 2 | 3 | 4 | 5;
  idleRpm: number;
  redlineRpm: number;
  /** Seconds to climb from idle to redline at full throttle with no load. */
  revTimeS: number;
  /** 0 = silky idle, 1 = lumpy. Scales cycle-to-cycle variation. */
  rough: number;
  /** Lift-off pops from the exhaust. */
  pops: number;
  exhaust: ExhaustDef;
  /** Paint on the cam covers. */
  coverColor: string;
  blockMaterial: 'aluminium' | 'iron';
  article: Article;
  /** Short note when a figure could not be confirmed against a primary source. */
  verifyNote?: string;
}

export const FAMILY_NAMES: Record<Family, string> = {
  inline: 'Рядні',
  vee: 'V-подібні',
  flat: 'Опозитні та плоскі',
  narrow: 'VR і W',
  rotary: 'Роторні',
};

export const ASPIRATION_NAMES: Record<Aspiration, string> = {
  na: 'атмосферний',
  turbo: 'турбо',
  'twin-turbo': 'два турбіни',
  'quad-turbo': 'чотири турбіни',
};

export const VALVETRAIN_NAMES: Record<Valvetrain, string> = {
  dohc: 'два розподільчі вали в головці',
  sohc: 'один розподільчий вал у головці',
  ohv: 'нижній розподільчий вал і штовхачі',
};
