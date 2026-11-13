// Declarative description of an engine. Everything the 3D model, the sound and
// the charts need is derived from these fields (see kinematics.ts).

import { t } from '../i18n/t.ts';
import type { SystemsSpec } from './systems-spec.ts';
import type { VariableValves } from './valve-control.ts';

export type Fuel = 'petrol' | 'diesel';
export type Aspiration = 'na' | 'turbo' | 'twin-turbo' | 'quad-turbo' | 'supercharged';
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

/** Crank degrees after firing TDC. Defaults to a typical road cam. */
export interface ValveTiming {
  exhaustOpen: number;
  exhaustClose: number;
  intakeOpen: number;
  intakeClose: number;
}

/** Only engines from the designer set these. The catalogue derives sizes from the bore. */
export interface ValveSizes {
  intake: number;
  exhaust: number;
  lift: number;
}

/** Behaviour computed by the designer's performance model. */
export interface EngineTuning {
  /** Net torque over normalised speed, 0 to 1.2 of redline, peak = 1. */
  torqueTable?: number[];
  boostLagS?: number;
  /** False when the engine can't sustain itself: the starter turns it and nothing happens. */
  catches?: boolean;
  intakeM?: number;
  supercharger?: boolean;
  flywheelKg?: number;
  /** Multiplies the visible shake, for balance shafts. */
  vibrationGain?: number;
  counterweightMm?: number;
  /** Piston, pin, rings and a third of the rod of one cylinder, kg. Sizes the balance arrows. */
  reciprocatingKg?: number;
  /** Rest of the rod and the crankpin share of one cylinder, which turn with the crank, kg. */
  rotatingKg?: number;
  /** One rotor of a Wankel, kg. */
  rotorKg?: number;
  /** As in the designer: 1 shaft cancels what is left of the first order, 2 the second order as well. */
  balanceShafts?: 0 | 1 | 2;
  /** Loudness correction measured for this exact engine. */
  trim?: number;
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
  /** Audible share of the turbo's whistle, 0 to 1. */
  turboWhine: number;
  /** Power one turbo is sized for, drawn to scale. Zero without a turbo. */
  turboHp: number;
  /** Audible share of the boost dumped when the throttle closes, 0 to 1. */
  blowoff: number;
  exhaust: ExhaustDef;
  /** Paint on the cam covers. */
  coverColor: string;
  blockMaterial: 'aluminium' | 'iron';
  article: Article;
  /** Short note when a figure could not be confirmed against a primary source. */
  verifyNote?: string;
  timing?: ValveTiming;
  valves?: ValveSizes;
  /** Variable valve gear. Only engines that have some. `timing` is then its park position. */
  vvt?: VariableValves;
  tuning?: EngineTuning;
  /** Oil, coolant, fuel, ignition and air hardware, for the systems layers. Built by hand in tests without it. */
  systems?: SystemsSpec;
}

export const FAMILY_NAMES: Record<Family, string> = {
  inline: t('Рядні'),
  vee: t('V-подібні'),
  flat: t('Опозитні та плоскі'),
  narrow: t('VR і W'),
  rotary: t('Роторні'),
};

export const ASPIRATION_NAMES: Record<Aspiration, string> = {
  na: t('атмосферний'),
  turbo: t('турбо'),
  'twin-turbo': t('дві турбіни'),
  'quad-turbo': t('чотири турбіни'),
  supercharged: t('механічний нагнітач'),
};

export const VALVETRAIN_NAMES: Record<Valvetrain, string> = {
  dohc: t('два розподільчі вали в головці'),
  sohc: t('один розподільчий вал у головці'),
  ohv: t('нижній розподільчий вал і штанги'),
};
