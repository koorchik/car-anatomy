// The engine a visitor builds. Everything here is a choice they can make. Anything derived lives elsewhere.

import { t } from '../i18n/t.ts';
import type { Cooling, FuelSystem, Ignition, OilCooler, OilPumpDrive, SumpKind } from '../engine/systems-spec.ts';
import type { FuelId } from './fuels.ts';

export type DesignLayout = 'inline' | 'vee' | 'boxer' | 'flatvee' | 'vr' | 'w' | 'rotary';
export type CrankPreset = 'even' | 'flat' | 'cross' | 'bigbang' | 'custom';
export type ChargerKind = 'none' | 'turbo' | 'twinturbo' | 'quadturbo' | 'roots' | 'centrifugal';
export type DesignValvetrain = 'dohc' | 'sohc' | 'ohv';
export type PistonMaterial = 'cast' | 'forged' | 'light';
export type RodMaterial = 'steel' | 'titanium';
export type BalanceShafts = 0 | 1 | 2;
export type Muffler = 'open' | 'sport' | 'road';
export type CollectorKind = 'single' | 'bybank';
export type BlowoffKind = 'recirculated' | 'soft' | 'vented';
export type BlockMaterial = 'aluminium' | 'iron';
export type CamPhaser = 'none' | 'intake' | 'dual' | 'coupled';
export type CamSwitch = 'none' | 'intake' | 'exhaust' | 'both';
export type SwitchKind = 'pin' | 'slide';
export type LiftControl = 'cam' | 'continuous' | 'multiair';
export type Deactivation = 'none' | 'valves' | 'fuel';
export type DeactivateGroup = 'first' | 'second' | 'alternate';

export interface CrankThrow {
  /** Crank pin angle, degrees. */
  pin: number;
  /** Which of the two crank turns of the cycle this cylinder fires in, 0 or 1. */
  turn: 0 | 1;
}

/** Published figures of a real engine, as its article shows them. */
export interface PublishedFigures {
  powerHp: number;
  powerRpm: number | null;
  torqueNm: number | null;
  torqueRpm: number | null;
}

/** Exact figures of a real engine. They hold only until the first engineering change. */
export interface FactoryCalibration {
  idleRpm: number;
  revTimeS: number;
  rough: number;
  trim: number;
  /** What the maker published, shown beside the model's own figures. Null when unknown. */
  published?: PublishedFigures | null;
}

export interface Design {
  name: string;
  layout: DesignLayout;
  cylinders: number;
  /** How cylinder numbers run on two-bank layouts: across the banks, or along one bank then the other. */
  numbering: 'alternating' | 'sequential';
  /** Swaps which side the first bank is on. */
  veeMirror: boolean;
  /** Paint on the cam covers. Null: the layout's usual colour. */
  coverColor: string | null;
  /** V angle between banks, degrees. */
  veeAngle: number;
  /** Narrow angle of a VR or of each W bank, degrees. */
  narrowAngle: number;
  /** Angle between the banks of a W, degrees. */
  wAngle: number;
  /** Lean of an inline engine, degrees. */
  tilt: number;

  bore: number;
  stroke: number;
  rodLength: number;
  compression: number;
  pistonMaterial: PistonMaterial;
  rodMaterial: RodMaterial;
  blockMaterial: BlockMaterial;

  crankPreset: CrankPreset;
  throws: CrankThrow[];
  /** Flywheel mass, kg. */
  flywheelKg: number;
  balanceShafts: BalanceShafts;

  valvetrain: DesignValvetrain;
  valvesPerCyl: 2 | 3 | 4 | 5;
  intakeValve: number;
  exhaustValve: number;
  /** Valve lift, mm. */
  lift: number;
  directInjection: boolean;
  /** Intake cam duration, crank degrees. */
  intakeDuration: number;
  exhaustDuration: number;
  /** Angle between intake and exhaust lobe peaks, in cam degrees, as cam makers quote it. */
  lobeSeparation: number;
  /** Valve spring force at full lift, N. */
  springForce: number;

  runnerLength: number;
  runnerDia: number;

  charger: ChargerKind;
  /** Target boost above atmospheric, bar. */
  boostBar: number;
  /** Horsepower one turbo is sized for. */
  turboSizeHp: number;
  intercooler: number;

  fuel: FuelId;
  lambda: number;
  /** Ignition relative to best timing, crank degrees. Positive is earlier. */
  ignitionOffset: number;

  // The systems layers' hardware. Null: what the rest of the design implies (src/designer/systems.ts).
  // None of these changes the power model, so a catalogue engine keeps its factory figures.
  fuelSystem: FuelSystem | null;
  cooling: Cooling | null;
  oilCooler: OilCooler | null;
  pistonJets: boolean | null;
  /** Spark plugs per cylinder. */
  sparkPlugs: 1 | 2 | null;
  ignition: Ignition | null;
  glowPlugs: boolean | null;
  oilPump: OilPumpDrive | null;
  oilFilter: boolean | null;
  /** How the oil returns to the pump. Changes windage, mass and the pan's depth. Null: a wet sump. */
  sump: SumpKind | null;
  /** Oil capacity with the filter, litres. Null: what the size and the sump imply (src/designer/lubrication.ts). */
  oilL: number | null;

  headerLength: number;
  headerDia: number;
  /** Difference between the longest and shortest primary, 0..1. */
  headerSpread: number;
  collector: CollectorKind;
  pipeDia: number;
  pipeLength: number;
  catalyst: boolean;
  muffler: Muffler;
  /** Exact openness, 0 to 1. Null: what the muffler type implies. */
  mufflerOpen: number | null;
  /** Roughness of the exhaust note, 0 to 1. Null: follows from the muffler and pipes. */
  rasp: number | null;
  /** Pops on lift-off, 0 to 1: fuel left unburnt on purpose or by a rich overrun. Null: what the muffler type implies. */
  pops: number | null;
  /** How much of the turbo's whistle reaches the listener, 0 to 1. A factory airbox hides most of it. */
  turboWhine: number;
  /** Where the boost goes when the throttle closes. A recirculating valve returns it to the intake and is not heard. */
  blowoff: BlowoffKind;
  /** Length of each primary, mm, by cylinder number. Null: nominal length and spread. */
  headerLengths: number[] | null;
  /** Which collector each cylinder feeds, by cylinder number. Null: from the collector type. */
  collectorOf: number[] | null;
  /** Stereo position of each collector, -1 to 1. Null: spread evenly. */
  pans: number[] | null;

  rpmLimit: number;

  /** Cam phasers. The cam fields above describe the middle of their travel. */
  camPhaser: CamPhaser;
  /** Crank degrees the intake phaser moves; for a coupled phaser, the whole shaft. */
  intakePhaseRange: number;
  exhaustPhaseRange: number;
  /** Which cams have a second, milder profile. The fields above are the high one. */
  camSwitch: CamSwitch;
  switchRpm: number;
  /** Low cam lift, mm, and intake duration, crank degrees. The exhaust low cam keeps the same difference. */
  lowLift: number;
  lowDuration: number;
  /** How the switch is built. Only drawn, the figures don't depend on it. */
  switchKind: SwitchKind;
  /** What sets the intake charge at part load: the throttle, or the intake valve itself. */
  liftControl: LiftControl;
  deactivation: Deactivation;
  /** Which half of the firing order rests. Only heard and drawn. */
  deactivateGroup: DeactivateGroup;
  /** Engine speeds between which cylinders may rest, from the manufacturer. Null: a generic estimate. */
  deactivateRpm: [number, number] | null;

  /** Wankel only. */
  rotorR: number;
  rotorE: number;
  rotorWidth: number;
  /** Order the rotors fire in. Null: along the shaft. */
  rotorOrder: number[] | null;
  factory: FactoryCalibration | null;
}

export const DEFAULT_DESIGN: Design = {
  name: t('Мій двигун'),
  layout: 'inline',
  cylinders: 4,
  numbering: 'alternating',
  veeMirror: false,
  coverColor: null,
  veeAngle: 90,
  narrowAngle: 15,
  wAngle: 72,
  tilt: 0,
  bore: 86,
  stroke: 86,
  rodLength: 145,
  compression: 10.5,
  pistonMaterial: 'cast',
  rodMaterial: 'steel',
  blockMaterial: 'aluminium',
  crankPreset: 'even',
  throws: [],
  flywheelKg: 9,
  balanceShafts: 0,
  valvetrain: 'dohc',
  valvesPerCyl: 4,
  intakeValve: 34,
  exhaustValve: 29,
  lift: 9.5,
  directInjection: false,
  intakeDuration: 245,
  exhaustDuration: 245,
  lobeSeparation: 112,
  springForce: 700,
  runnerLength: 320,
  runnerDia: 40,
  charger: 'none',
  boostBar: 0.8,
  turboSizeHp: 300,
  intercooler: 0.7,
  fuel: 'ai95',
  lambda: 0.92,
  ignitionOffset: 0,
  fuelSystem: null,
  cooling: null,
  oilCooler: null,
  pistonJets: null,
  sparkPlugs: null,
  ignition: null,
  glowPlugs: null,
  oilPump: null,
  oilFilter: null,
  sump: null,
  oilL: null,
  headerLength: 650,
  headerDia: 40,
  headerSpread: 0,
  collector: 'single',
  pipeDia: 60,
  pipeLength: 1800,
  catalyst: true,
  muffler: 'road',
  mufflerOpen: null,
  rasp: null,
  pops: null,
  turboWhine: 0.12,
  blowoff: 'recirculated',
  headerLengths: null,
  collectorOf: null,
  pans: null,
  rpmLimit: 6800,
  camPhaser: 'none',
  intakePhaseRange: 50,
  exhaustPhaseRange: 40,
  camSwitch: 'none',
  switchRpm: 5500,
  lowLift: 7,
  lowDuration: 210,
  switchKind: 'pin',
  liftControl: 'cam',
  deactivation: 'none',
  deactivateGroup: 'first',
  deactivateRpm: null,
  rotorR: 105,
  rotorE: 15,
  rotorWidth: 80,
  rotorOrder: null,
  factory: null,
};

/** Openness of the exhaust as the sound and the back pressure see it. */
export const effectiveOpen = (d: Design): number =>
  d.mufflerOpen ?? { road: 0.25, sport: 0.62, open: 0.95 }[d.muffler] - (d.catalyst ? 0.05 : 0);

/** Roughness of the note: a free exhaust and narrow primaries sound harsher. */
export const effectiveRasp = (d: Design): number => {
  if (d.rasp !== null && Number.isFinite(d.rasp)) return d.rasp;
  return Math.min(1, effectiveOpen(d) * 0.6 + (45 / Math.max(d.headerDia, 20)) * 0.12);
};

/** A road engine cuts fuel on overrun, so nothing is left to ignite in the pipe. A diesel has no unburnt mixture at all. */
export const effectivePops = (d: Design): number => {
  if (d.fuel === 'diesel') return 0;
  return d.pops ?? { road: 0, sport: 0.2, open: 0.5 }[d.muffler];
};

/** Collectors as lists of cylinder numbers. */
export const exhaustGroups = (d: Design): number[][] => {
  if (isRotary(d)) return [Array.from({ length: d.cylinders * 3 }, (_, i) => i + 1)];
  const all = Array.from({ length: d.cylinders }, (_, i) => i + 1);
  if (d.collectorOf) {
    const count = Math.max(...d.collectorOf) + 1;
    return Array.from({ length: count }, (_, g) => all.filter((n) => d.collectorOf![n - 1] === g)).filter((g) => g.length > 0);
  }
  if (d.collector === 'single') return [all];
  if (d.layout === 'w') return [all.slice(0, d.cylinders / 2), all.slice(d.cylinders / 2)];
  return [all.filter((n) => n % 2 === 1), all.filter((n) => n % 2 === 0)];
};

export const isRotary = (d: Design): boolean => d.layout === 'rotary';

export const isTurbo = (d: Design): boolean => d.charger === 'turbo' || d.charger === 'twinturbo' || d.charger === 'quadturbo';

export const turboCount = (d: Design): number => ({ turbo: 1, twinturbo: 2, quadturbo: 4 } as Record<string, number>)[d.charger] ?? 0;

export const isBoosted = (d: Design): boolean => d.charger !== 'none';

/** Number of intake and exhaust valves on one cylinder. */
export const valveSplit = (d: Design): { intake: number; exhaust: number } => {
  switch (d.valvesPerCyl) {
    case 2:
      return { intake: 1, exhaust: 1 };
    case 3:
      return { intake: 2, exhaust: 1 };
    case 4:
      return { intake: 2, exhaust: 2 };
    case 5:
      return { intake: 3, exhaust: 2 };
  }
};

/** Swept volume of one chamber in mm3. */
export const sweptPerChamber = (d: Design): number =>
  isRotary(d) ? 3 * Math.sqrt(3) * d.rotorR * d.rotorE * d.rotorWidth : (Math.PI / 4) * d.bore * d.bore * d.stroke;

/** Displacement in litres, as the car world counts it. A rotor counts one chamber per rotor. */
export const displacementL = (d: Design): number => (sweptPerChamber(d) * d.cylinders) / 1e6;
