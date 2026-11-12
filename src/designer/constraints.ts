// Which values a parameter may take, given all the others. These are the limits of geometry:
// past them the parts would physically occupy the same space. Poor engineering is allowed and diagnosed later.

import { DEG } from '../engine/kinematics.ts';
import { t } from '../i18n/t.ts';
import { crankForPreset } from './crank.ts';
import { DEFAULT_DESIGN, valveSplit, type Design, type DesignLayout } from './design.ts';
import { resolveValvetrain } from './valvetrain.ts';

export interface Range {
  min: number;
  max: number;
  /** Why the lower limit is where it is, when another parameter sets it. */
  minWhy?: string;
  maxWhy?: string;
}

export const PISTON_SKIRT = 0.34;
export const PISTON_CROWN = 0.42;
/** Radial clearance kept between the skirt and the counterweight at bottom dead centre, mm. */
const SKIRT_CLEARANCE = 4;

/** Shortest rod that lets the piston skirt clear a counterweight of minimum size. */
export const minRodLength = (bore: number, stroke: number): number => {
  const r = stroke / 2;
  const minimumWeight = r + bore * 0.12;
  return Math.ceil(r + PISTON_SKIRT * bore + minimumWeight + SKIRT_CLEARANCE);
};

/** Largest counterweight radius that clears the skirt, in mm. Used when drawing the crank. */
export const safeCounterweight = (bore: number, stroke: number, rodLength: number): number => {
  const r = stroke / 2;
  const roomy = r + bore * 0.3;
  const available = rodLength - r - PISTON_SKIRT * bore - SKIRT_CLEARANCE;
  return Math.max(r + bore * 0.08, Math.min(roomy, available));
};

/** Crank centre to deck, mm. Mirrors kinematics: rod, throw, crown and head gasket. */
const deckHeight = (d: Design): number => d.rodLength + d.stroke / 2 + d.stroke * PISTON_CROWN + 2;

/** V angle below which the two heads would hit each other. */
const minVeeAngle = (d: Design): number => {
  const headHalf = d.bore * 0.6;
  const ratio = Math.min(0.98, (headHalf * 1.15) / deckHeight(d));
  return Math.ceil((2 * Math.asin(ratio)) / DEG);
};

const valveShares = (d: Design): { intake: number; exhaust: number; sum: number } => {
  // Fractions of the bore a valve head may take. They come from packing the circles in a pent-roof.
  switch (d.valvesPerCyl) {
    case 2:
      return { intake: 0.52, exhaust: 0.45, sum: 0.92 };
    case 3:
      return { intake: 0.4, exhaust: 0.48, sum: 0.86 };
    case 4:
      return { intake: 0.42, exhaust: 0.38, sum: 0.78 };
    case 5:
      return { intake: 0.32, exhaust: 0.36, sum: 0.66 };
  }
};

const CYLINDER_CHOICES: Record<DesignLayout, number[]> = {
  inline: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
  vee: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16],
  boxer: [2, 3, 4, 5, 6, 8, 10, 12],
  flatvee: [2, 4, 6, 8, 10, 12, 16],
  vr: [2, 3, 4, 5, 6, 7, 8],
  w: [8, 12, 16],
  rotary: [1, 2, 3, 4],
};

export const cylinderChoices = (layout: DesignLayout): number[] => CYLINDER_CHOICES[layout];

const fixed = (min: number, max: number): Range => ({ min, max });

export type NumericKey =
  | 'veeAngle' | 'narrowAngle' | 'wAngle' | 'tilt' | 'bore' | 'stroke' | 'rodLength' | 'compression' | 'flywheelKg'
  | 'intakeValve' | 'exhaustValve' | 'lift' | 'intakeDuration' | 'exhaustDuration' | 'lobeSeparation' | 'springForce'
  | 'runnerLength' | 'runnerDia' | 'boostBar' | 'turboSizeHp' | 'intercooler' | 'lambda' | 'ignitionOffset'
  | 'headerLength' | 'headerDia' | 'headerSpread' | 'pipeDia' | 'pipeLength' | 'rpmLimit' | 'rotorR' | 'rotorE' | 'rotorWidth'
  | 'mufflerOpen' | 'rasp' | 'pops' | 'turboWhine'
  | 'intakePhaseRange' | 'exhaustPhaseRange' | 'switchRpm' | 'lowLift' | 'lowDuration';

export function paramRange(d: Design, key: NumericKey): Range {
  switch (key) {
    case 'veeAngle': {
      const min = Math.max(40, minVeeAngle(d));
      return { min, max: 170, minWhy: min > 40 ? t('Ближче головки блока зачеплять одна одну. Менший діаметр або довший шатун дозволять звузити розвал.') : undefined };
    }
    case 'narrowAngle':
      return fixed(8, 30);
    case 'wAngle':
      return fixed(50, 120);
    case 'tilt':
      return fixed(-45, 45);
    case 'bore':
      return fixed(30, 220);
    case 'stroke':
      return fixed(20, 280);
    case 'rodLength': {
      const min = minRodLength(d.bore, d.stroke);
      return { min, max: Math.max(min + 20, Math.round(d.stroke * 3.6)), minWhy: t('Коротший шатун упре спідницю поршня в противагу колінвала.') };
    }
    case 'compression':
      return fixed(4, 26);
    case 'flywheelKg':
      return fixed(1, 60);
    case 'intakeValve': {
      const shares = valveShares(d);
      const max = Math.max(12, Math.floor(Math.min(d.bore * shares.intake, d.bore * shares.sum - d.exhaustValve * 0.5) * 2) / 2);
      return { min: 12, max, maxWhy: t('Більший клапан не вміститься в камері згоряння при такому діаметрі циліндра.') };
    }
    case 'exhaustValve': {
      const shares = valveShares(d);
      const max = Math.max(10, Math.floor(Math.min(d.bore * shares.exhaust, d.bore * shares.sum - d.intakeValve * 0.5) * 2) / 2);
      return { min: 10, max, maxWhy: t('Більший клапан не вміститься в камері згоряння при такому діаметрі циліндра.') };
    }
    case 'lift': {
      const max = Math.max(4, Math.round(d.intakeValve * 0.55 * 2) / 2);
      return { min: 3, max, maxWhy: t('Понад половину діаметра клапана вигравати вже нічого, а кулачок стає нереальним.') };
    }
    case 'intakeDuration':
    case 'exhaustDuration':
      return fixed(180, 340);
    case 'lobeSeparation':
      return fixed(96, 125);
    case 'springForce':
      return fixed(200, 2200);
    case 'runnerLength':
      return fixed(60, 900);
    case 'runnerDia': {
      const max = Math.round(d.bore * 0.72);
      return { min: 14, max, maxWhy: t('Ширший патрубок не підійде до головки циліндра.') };
    }
    case 'boostBar':
      return fixed(0.1, 4);
    case 'turboSizeHp':
      return fixed(40, 1500);
    case 'intercooler':
      return fixed(0, 0.95);
    case 'lambda':
      return fixed(0.65, d.fuel === 'diesel' ? 3 : 1.5);
    case 'ignitionOffset':
      return fixed(-25, 15);
    case 'headerLength':
      return fixed(100, 1600);
    case 'headerDia': {
      const max = Math.round(Math.max(20, d.exhaustValve * 1.8));
      return { min: 15, max, maxWhy: t('Труба стає значно більшою за випускний отвір.') };
    }
    case 'headerSpread':
      return fixed(0, 0.8);
    case 'pipeDia':
      return fixed(25, 150);
    case 'pipeLength':
      return fixed(300, 4000);
    case 'rpmLimit':
      return fixed(1500, 22000);
    case 'rotorR':
      return fixed(60, 160);
    case 'rotorE': {
      // A rotor needs its flanks to clear the housing: R/e of about 6.2 is the tightest that works.
      const max = Math.floor(d.rotorR / 6.2);
      return { min: Math.ceil(d.rotorR / 10), max, maxWhy: t('Більший ексцентриситет не дає ротору розминутися з корпусом.') };
    }
    case 'rotorWidth':
      return fixed(30, 130);
    case 'mufflerOpen':
    case 'rasp':
    case 'pops':
    case 'turboWhine':
      return fixed(0, 1);
    case 'intakePhaseRange':
      return fixed(10, 80);
    case 'exhaustPhaseRange':
      return fixed(10, 60);
    case 'switchRpm':
      return { min: 1500, max: Math.max(1500, d.rpmLimit - 300), maxWhy: t('Вище відсічки високий кулачок уже не встигне попрацювати.') };
    case 'lowLift':
      return { min: 2, max: Math.max(2, d.lift - 0.5), maxWhy: t('Низький кулачок має бути нижчим за основний, інакше перемикати нічого.') };
    case 'lowDuration':
      return { min: 160, max: Math.max(160, d.intakeDuration - 10), maxWhy: t('Низький кулачок має бути коротшим за основний, інакше перемикати нічого.') };
  }
}

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

const ALLOWED = {
  layout: Object.keys(CYLINDER_CHOICES),
  pistonMaterial: ['cast', 'forged', 'light'],
  rodMaterial: ['steel', 'titanium'],
  blockMaterial: ['aluminium', 'iron'],
  crankPreset: ['even', 'flat', 'cross', 'bigbang', 'custom'],
  balanceShafts: [0, 1, 2],
  valvetrain: ['dohc', 'sohc', 'ohv'],
  valvesPerCyl: [2, 3, 4, 5],
  charger: ['none', 'turbo', 'twinturbo', 'quadturbo', 'roots', 'centrifugal'],
  fuel: ['ai92', 'ai95', 'ai98', 'race', 'e85', 'methanol', 'diesel'],
  collector: ['single', 'bybank'],
  muffler: ['open', 'sport', 'road'],
  blowoff: ['recirculated', 'soft', 'vented'],
  camPhaser: ['none', 'intake', 'dual', 'coupled'],
  camSwitch: ['none', 'intake', 'exhaust', 'both'],
  switchKind: ['pin', 'slide'],
  liftControl: ['cam', 'continuous', 'multiair'],
  deactivation: ['none', 'valves', 'fuel'],
  deactivateGroup: ['first', 'second', 'alternate'],
};

const ORDERED_KEYS: NumericKey[] = [
  'bore', 'stroke', 'rodLength', 'veeAngle', 'narrowAngle', 'wAngle', 'tilt', 'compression', 'flywheelKg',
  'exhaustValve', 'intakeValve', 'exhaustValve', 'lift', 'intakeDuration', 'exhaustDuration', 'lobeSeparation', 'springForce',
  'runnerLength', 'runnerDia', 'boostBar', 'turboSizeHp', 'intercooler', 'lambda', 'ignitionOffset',
  'headerLength', 'headerDia', 'headerSpread', 'pipeDia', 'pipeLength', 'rpmLimit', 'rotorR', 'rotorE', 'rotorWidth',
  'mufflerOpen', 'rasp', 'pops', 'turboWhine',
  // After lift, intakeDuration and rpmLimit, which bound them.
  'intakePhaseRange', 'exhaustPhaseRange', 'switchRpm', 'lowLift', 'lowDuration',
];

/** Brings any design, however it arose, to a state that can be built. Pure and idempotent. */
export function resolveDesign(input: Design): Design {
  const d: Design = { ...input };
  // Designs arrive in links, so nothing about them can be taken on trust.
  for (const [key, allowed] of Object.entries(ALLOWED)) {
    const target = d as unknown as Record<string, unknown>;
    if (!(allowed as readonly unknown[]).includes(target[key])) target[key] = (DEFAULT_DESIGN as unknown as Record<string, unknown>)[key];
  }
  d.name = String(d.name ?? '').slice(0, 60) || DEFAULT_DESIGN.name;
  d.catalyst = d.catalyst === true;
  d.directInjection = d.directInjection === true;
  d.throws = Array.isArray(d.throws) ? d.throws : [];
  const choices = CYLINDER_CHOICES[d.layout];
  if (!choices.includes(d.cylinders)) {
    d.cylinders = choices.reduce((best, c) => (Math.abs(c - d.cylinders) < Math.abs(best - d.cylinders) ? c : best), choices[0]!);
  }
  // Pushrods can't practically work more than a couple of valves per cylinder, except for the few real 4-valve twins.
  if (d.valvetrain === 'ohv' && d.valvesPerCyl === 5) d.valvesPerCyl = 4;
  if (d.valvetrain === 'sohc' && d.valvesPerCyl === 5) d.valvesPerCyl = 4;
  if (d.mufflerOpen !== null && !Number.isFinite(d.mufflerOpen)) d.mufflerOpen = null;
  if (d.rasp !== null && !Number.isFinite(d.rasp)) d.rasp = null;
  if (d.pops !== null && !Number.isFinite(d.pops)) d.pops = null;
  resolveValvetrain(d);
  for (const key of ORDERED_KEYS) {
    if (d[key] === null) continue;
    const range = paramRange(d, key);
    (d[key] as number) = clamp(d[key] as number, range.min, range.max);
  }
  resolveExhaustTables(d);
  resolveIdentity(d);
  if (d.collector === 'bybank' && !['vee', 'flatvee', 'boxer', 'w'].includes(d.layout)) d.collector = 'single';
  if (d.throws.length !== d.cylinders && d.crankPreset === 'custom') d.crankPreset = 'even';
  d.throws = crankForPreset(d, d.crankPreset).map((t) => {
    const pin = Number.isFinite(t?.pin) ? t.pin : 0;
    return { pin: ((pin % 360) + 360) % 360, turn: t?.turn ? 1 : 0 };
  });
  return d;
}

const finiteList = (list: unknown, length: number): list is number[] => Array.isArray(list) && list.length === length && list.every((v) => Number.isFinite(v));

/** Tables tied to the cylinder count, kept only when they still describe this engine. */
function resolveExhaustTables(d: Design): void {
  const rotary = d.layout === 'rotary';
  if (rotary || !finiteList(d.headerLengths, d.cylinders)) d.headerLengths = null;
  if (d.headerLengths) {
    d.headerLengths = d.headerLengths.map((v) => clamp(v, 100, 1600));
    // The model tunes to the average pipe.
    d.headerLength = Math.round(d.headerLengths.reduce((a, b) => a + b, 0) / d.headerLengths.length);
  }
  if (rotary || !finiteList(d.collectorOf, d.cylinders) || d.collectorOf.some((g) => !Number.isInteger(g) || g < 0 || g > 3)) d.collectorOf = null;
  // Collector numbers run without gaps, so the pan table lines up with them.
  if (d.collectorOf) {
    const used = [...new Set(d.collectorOf)].sort((a, b) => a - b);
    d.collectorOf = d.collectorOf.map((g) => used.indexOf(g));
  }
  const groups = d.collectorOf ? Math.max(...d.collectorOf) + 1 : d.collector === 'bybank' ? 2 : 1;
  if (groups < 2 || !finiteList(d.pans, groups)) d.pans = null;
  else d.pans = d.pans.map((v) => clamp(v, -1, 1));
}

/** What a catalogue engine carries so it stays itself. Links can hold anything, so all of it is checked. */
function resolveIdentity(d: Design): void {
  if (d.numbering !== 'sequential' || d.cylinders % 2 === 1) d.numbering = 'alternating';
  d.veeMirror = d.veeMirror === true;
  if (typeof d.coverColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(d.coverColor)) d.coverColor = null;
  const expected = Array.from({ length: d.cylinders }, (_, i) => i + 1);
  const order = d.rotorOrder;
  if (d.layout !== 'rotary' || !finiteList(order, d.cylinders) || [...order].sort((a, b) => a - b).some((v, i) => v !== expected[i])) d.rotorOrder = null;
  const f = d.factory;
  if (f && typeof f === 'object') {
    d.factory = {
      idleRpm: clamp(f.idleRpm, 300, 3000),
      revTimeS: clamp(f.revTimeS, 0.2, 10),
      rough: clamp(f.rough, 0, 1),
      trim: clamp(f.trim, 0.02, 3),
    };
  } else {
    d.factory = null;
  }
}

/** Names of the parameters whose value changed in resolving, so the interface can say so. */
export function adjustedKeys(before: Design, after: Design): NumericKey[] {
  return ORDERED_KEYS.filter((k, i) => ORDERED_KEYS.indexOf(k) === i && before[k] !== null && after[k] !== null && Math.abs((before[k] as number) - (after[k] as number)) > 1e-6);
}

export const valveCountLabel = (d: Design): string => {
  const { intake, exhaust } = valveSplit(d);
  return t('{intake} впускн., {exhaust} випускн.', { intake, exhaust });
};
