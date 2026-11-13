// Which values a gearbox parameter may take, given all the others (gearbox plan, the limits of geometry). These are
// the limits of geometry: past them the teeth or the parts would not fit. Poor engineering is allowed and judged later
// (stage K9b). resolveGearboxDesign moves the dependent values inside their limits, checks everything a link may carry
// as if it were hostile, and is idempotent: a resolved design resolves to itself.

import { CARS } from '../data/cars.ts';
import { DRIVE_CARS } from '../data/drive-cars.ts';
import { engineById } from '../data/engines.ts';
import { gearboxById } from '../data/gearboxes.ts';
import { helixForCentre } from '../drivetrain/gear-geometry.ts';
import { buildEngine } from '../engine/kinematics.ts';
import { flywheelRadiusMm } from '../vehicle/packaging.ts';
import { parseTyreSize } from '../vehicle/tyre-size.ts';
import { TYRES, type TyreId } from '../vehicle/vehicle.ts';
import {
  CLUTCH_KINDS, DAMPER_CHOICES, DEFAULT_GEARBOX_DESIGN, DIFF_CHOICES, DRIVE_CHOICES, FACING_KINDS, GEARBOX_TYPES, MAX_GEARS, MAX_HELIX, MIN_GEARS,
  MIN_HAND_TEETH, MIN_STEP, SYNCHRO_MATERIALS, mainTarget, targetRatios, type ConeCount, type FinalSetting, type GearboxDesign, type PairSetting,
  type ReverseSetting,
} from './design.ts';
import { bevelMaxFace, designBuild, faceFor, handRatios } from './to-spec.ts';
import { maxModuleFor, minModuleFor, pickCylPair } from './teeth.ts';

export interface Range {
  min: number;
  max: number;
}

export type NumericKey =
  | 'gears' | 'firstRatio' | 'topRatio' | 'progression' | 'reverseRatio' | 'finalDrive' | 'module' | 'lowModule' | 'mainModule'
  | 'pressureAngle' | 'helix' | 'faceWidth' | 'centreMm' | 'coneAngle' | 'roofAngle' | 'shiftForceN' | 'clutchMm' | 'clampN'
  | 'lockDrive' | 'lockCoast' | 'preloadNm' | 'tbr' | 'massKg' | 'frontShare' | 'cdA' | 'crr';

/** Finest module of any pair, mm (gearbox plan: 1.5–4 mm for the speeds). */
export const MODULE_FLOOR = 1.5;
const FIXED: Partial<Record<NumericKey, Range>> = {
  gears: { min: MIN_GEARS, max: MAX_GEARS },
  firstRatio: { min: 1.5, max: 7 },
  progression: { min: 0, max: 1 },
  reverseRatio: { min: 2.5, max: 5.5 },
  finalDrive: { min: 2, max: 5.5 },
  pressureAngle: { min: 17.5, max: 25 },
  helix: { min: 0, max: 35 },
  // Research §4.3: half angles of 6–7.5° in use, 5–15° studied; roofs of 100–130° on cars; 600 N an ordinary shift, 1200 N a hard one.
  coneAngle: { min: 5, max: 15 },
  roofAngle: { min: 90, max: 140 },
  shiftForceN: { min: 200, max: 1500 },
  clampN: { min: 1000, max: 20000 },
  lockDrive: { min: 0, max: 0.8 },
  lockCoast: { min: 0, max: 0.8 },
  preloadNm: { min: 0, max: 300 },
  tbr: { min: 1, max: 6 },
  massKg: { min: 500, max: 3000 },
  frontShare: { min: 0.3, max: 0.7 },
  cdA: { min: 0.3, max: 1.5 },
  crr: { min: 0.005, max: 0.03 },
};
/** Smallest and largest clutch disc, mm; the largest also stops at the flywheel plus 10 % [estimate, gearbox plan]. */
const CLUTCH_MM = { min: 150, max: 350 };
const LOWEST_TOP = 0.45;
/** A typed-in ratio: wider than the ladder's ends, narrow enough that some module gives its pair 12 to 120 teeth. */
const OVERRIDE: Range = { min: 0.3, max: 8 };
const MAIN_PAIR: Range = { min: 1, max: 2.5 };
const HIGHEST_TOP = 1.3;

const flywheels = new Map<string, number>();
/** Flywheel radius of a catalogue engine as the 3D draws it, mm (packaging.ts). */
export function engineFlywheelMm(engineId: string): number {
  let r = flywheels.get(engineId);
  if (r === undefined) {
    const spec = engineById(engineId);
    r = spec ? flywheelRadiusMm(buildEngine(spec)) : 150;
    flywheels.set(engineId, r);
  }
  return r;
}

/** The constant-mesh pair's ratio a layshaft design will have: its own teeth, or the rule's target. */
const mainRatioOf = (d: GearboxDesign): number => (d.mainPair ? d.mainPair.teeth[1] / d.mainPair.teeth[0] : mainTarget(targetRatios(d, handRatios(d))[0]!));

/** Each picked speed pair's own ratio, first first; null for a pair set by hand or the direct gear. */
function pickedPairRatios(d: GearboxDesign): Array<number | null> {
  const main = d.type === 'layshaft' ? mainRatioOf(d) : 1;
  const t = targetRatios(d, handRatios(d));
  return t.map((v, i) => (d.pairs[i] || (d.type === 'layshaft' && d.directGear === i + 1) ? null : v / main));
}

/** The reverse's own ratio: a layshaft's runs through the constant-mesh pair too. */
const reversePairRatio = (d: GearboxDesign): number => (d.type === 'layshaft' ? d.reverseRatio / mainRatioOf(d) : d.reverseRatio);

/** Coarsest module the reverse leaves room for: two gears that never mesh share the centre distance [tip rule of teeth.ts]. */
const reverseMaxModule = (d: GearboxDesign): number => {
  if (d.type !== 'layshaft') return Infinity; // a transaxle turns to a compound idler
  const u = reversePairRatio(d);
  return (2 * d.centreMm) / (12 * (1 + Math.max(u, 1 / u)) + 5);
};

export function paramRange(d: GearboxDesign, key: NumericKey): Range {
  const fixed = FIXED[key];
  if (fixed) return fixed;
  switch (key) {
    case 'topRatio': {
      const n = d.gears;
      if (d.type === 'layshaft' && d.directGear === n) return { min: 1, max: 1 };
      let max = Math.min(HIGHEST_TOP, d.firstRatio / MIN_STEP ** (n - 1));
      if (d.type === 'layshaft' && d.directGear >= 2) max = Math.min(max, 1 / MIN_STEP ** (n - d.directGear));
      return { min: LOWEST_TOP, max };
    }
    case 'centreMm': {
      // Wide enough that every picked pair finds its teeth with the finest module.
      let min = 50;
      const need = (u: number) => (MODULE_FLOOR / maxModuleFor(u, 1, d.helix)) * 1.0001;
      for (const u of pickedPairRatios(d)) if (u !== null) min = Math.max(min, need(u));
      if (d.type === 'layshaft' && !d.mainPair) min = Math.max(min, need(mainTarget(d.firstRatio)));
      return { min: Math.ceil(min), max: Math.max(120, Math.ceil(min)) };
    }
    case 'module': {
      let max = 4;
      let min = MODULE_FLOOR;
      pickedPairRatios(d).forEach((u, i) => {
        if (u === null || i === 0) return;
        max = Math.min(max, maxModuleFor(u, d.centreMm, d.helix));
        min = Math.max(min, minModuleFor(u, d.centreMm, d.helix));
      });
      return moduleRange(min, max);
    }
    case 'lowModule': {
      const first = pickedPairRatios(d)[0];
      let max = Math.min(4.5, reverseMaxModule(d));
      let min = MODULE_FLOOR;
      if (first !== null && first !== undefined) {
        max = Math.min(max, maxModuleFor(first, d.centreMm, d.helix));
        min = Math.max(min, minModuleFor(first, d.centreMm, d.helix));
      }
      return moduleRange(min, max);
    }
    case 'mainModule': {
      if (d.type === 'transaxle') return d.drive === 'rwd' ? { min: 3, max: 9 } : { min: MODULE_FLOOR, max: 4.5 };
      if (d.mainPair) return { min: MODULE_FLOOR, max: 4.5 };
      const u = mainTarget(d.firstRatio);
      return moduleRange(minModuleFor(u, d.centreMm, d.helix), Math.min(4.5, maxModuleFor(u, d.centreMm, d.helix)));
    }
    case 'faceWidth':
      // Gearbox plan: a face of 6 to 14 modules.
      return { min: Math.ceil(6 * d.module * 10) / 10, max: Math.floor(14 * d.module * 10) / 10 };
    case 'clutchMm':
      return { min: CLUTCH_MM.min, max: Math.max(CLUTCH_MM.min, Math.min(CLUTCH_MM.max, Math.floor(2.2 * engineFlywheelMm(d.engine)))) };
    default:
      throw new Error(`no range for ${key}`);
  }
}

const floorTo = (v: number, step: number): number => Math.floor(v / step + 1e-9) * step;
const ceilTo = (v: number, step: number): number => Math.ceil(v / step - 1e-9) * step;

/** Modules between the finest that keeps the big gears within MAX_TEETH and the coarsest that leaves the pinions room. */
function moduleRange(min: number, max: number): Range {
  const lo = Math.max(MODULE_FLOOR, ceilTo(min, 0.05));
  return { min: lo, max: Math.max(lo, floorTo(max, 0.05)) };
}

// ---- Checking what a link may carry ----

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, r: Range): number => Math.min(r.max, Math.max(r.min, v));
const oneOf = <T>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const intIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const numIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Largest profile shift a link may give a gear, either way (the picker's stay within ±1.3). */
const SHIFT_LIMIT = 1.5;
/** Teeth beyond what any car box has; the 3D and the search stay sane. */
const HAND_MAX_TEETH = 150;

/** A pair from a link: well-formed numbers, a face of 6–14 modules, a shift within ±SHIFT_LIMIT; null if anything is off. */
function cleanPair(v: unknown): PairSetting | null {
  if (!isObject(v) || !Array.isArray(v.teeth) || !Array.isArray(v.shift)) return null;
  const z1 = intIn(v.teeth[0], MIN_HAND_TEETH, HAND_MAX_TEETH);
  const z2 = intIn(v.teeth[1], MIN_HAND_TEETH, HAND_MAX_TEETH);
  const m = numIn(v.module, 1, 6);
  const x1 = numIn(v.shift[0], -SHIFT_LIMIT, SHIFT_LIMIT);
  const x2 = numIn(v.shift[1], -SHIFT_LIMIT, SHIFT_LIMIT);
  const b = finite(v.faceWidth, NaN);
  if (z1 === null || z2 === null || m === null || x1 === null || x2 === null || !Number.isFinite(b)) return null;
  return { teeth: [z1, z2], module: m, faceWidth: Math.min(14 * m, Math.max(6 * m, b)), shift: [x1, x2] };
}

/** Whether a pair spans the centre distance with a helix of 0–40°. */
const spans = (p: PairSetting, centreMm: number, alpha: number): boolean => {
  const beta = helixForCentre(centreMm, p.module, p.teeth[0], p.teeth[1], alpha, p.shift[0] + p.shift[1]);
  return Number.isFinite(beta) && beta >= 0 && beta <= MAX_HELIX;
};

function cleanReverse(v: unknown, type: GearboxDesign['type']): ReverseSetting | null {
  if (!isObject(v) || !Array.isArray(v.teeth)) return null;
  const count = v.teeth.length;
  if (count !== 3 && !(count === 4 && type === 'transaxle')) return null;
  const teeth = v.teeth.map((z) => intIn(z, MIN_HAND_TEETH, HAND_MAX_TEETH));
  const m = numIn(v.module, 1, 6);
  const helix = numIn(v.helix, 0, 35);
  const b = finite(v.faceWidth, NaN);
  if (teeth.some((z) => z === null) || m === null || helix === null || !Number.isFinite(b)) return null;
  return { teeth: teeth as number[], module: m, helix, faceWidth: Math.min(14 * m, Math.max(6 * m, b)) };
}

function cleanFinal(v: unknown, kind: 'helical' | 'bevel'): FinalSetting | null {
  if (!isObject(v) || !Array.isArray(v.teeth)) return null;
  const zp = intIn(v.teeth[0], MIN_HAND_TEETH, 40);
  const zr = intIn(v.teeth[1], 20, HAND_MAX_TEETH);
  const m = kind === 'bevel' ? numIn(v.module, 3, 9) : numIn(v.module, 1, 6);
  const helix = numIn(v.helix, 0, 35);
  const shift = numIn(v.shift, -SHIFT_LIMIT, SHIFT_LIMIT);
  const b = finite(v.faceWidth, NaN);
  if (zp === null || zr === null || m === null || helix === null || shift === null || !Number.isFinite(b)) return null;
  const ratio = zr / zp;
  if (ratio < 2 || ratio > 5.5) return null;
  const max = kind === 'bevel' ? bevelMaxFace(m, zp, zr) : 14 * m;
  const min = kind === 'bevel' ? Math.min(max, 3 * m) : 6 * m;
  return { teeth: [zp, zr], module: m, faceWidth: Math.min(max, Math.max(min, b)), helix: kind === 'bevel' ? 0 : helix, shift: kind === 'bevel' ? shift : 0 };
}

/** Moves every field inside its limits, given the others. Accepts anything; the result always builds. */
export function resolveGearboxDesign(input: GearboxDesign): GearboxDesign {
  const raw = (isObject(input) ? input : {}) as Record<string, unknown>;
  const D = DEFAULT_GEARBOX_DESIGN;
  const num = (key: NumericKey): number => finite(raw[key], D[key] as number);
  const d: GearboxDesign = { ...D, ratios: [...D.ratios], pairs: [...D.pairs], cones: [...D.cones] };

  d.name = typeof raw.name === 'string' ? raw.name.slice(0, 80) : D.name;
  d.type = oneOf(raw.type, GEARBOX_TYPES, D.type);
  d.drive = d.type === 'layshaft' ? 'rwd' : oneOf(raw.drive, DRIVE_CHOICES, 'fwd');

  // The car first: the clutch's limit needs its engine.
  d.car = typeof raw.car === 'string' && Object.hasOwn(DRIVE_CARS, raw.car) && CARS[raw.car] ? raw.car : D.car;
  d.engine = typeof raw.engine === 'string' && engineById(raw.engine) ? raw.engine : D.engine;
  for (const key of ['massKg', 'frontShare', 'cdA', 'crr'] as const) d[key] = clamp(num(key), FIXED[key]!);
  d.tyreSize = typeof raw.tyreSize === 'string' && validTyreSize(raw.tyreSize) ? raw.tyreSize.trim() : drivenSize(d.car, d.drive);
  d.tyre = oneOf(raw.tyre, Object.keys(TYRES) as TyreId[], D.tyre);

  // The ladder.
  d.gears = Math.round(clamp(num('gears'), FIXED.gears!));
  const n = d.gears;
  d.directGear = d.type === 'layshaft' && typeof raw.directGear === 'number' && Number.isInteger(raw.directGear) && raw.directGear >= 2 && raw.directGear <= n ? raw.directGear : 0;
  d.firstRatio = clamp(num('firstRatio'), FIXED.firstRatio!);
  d.topRatio = clamp(num('topRatio'), paramRange(d, 'topRatio'));
  d.progression = clamp(num('progression'), FIXED.progression!);
  for (const key of ['reverseRatio', 'finalDrive', 'pressureAngle', 'helix'] as const) d[key] = clamp(num(key), FIXED[key]!);
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  d.ratios = Array.from({ length: n }, (_, i) => numIn(list(raw.ratios)[i], OVERRIDE.min, OVERRIDE.max));
  d.pairs = Array.from({ length: n }, (_, i) => cleanPair(list(raw.pairs)[i]));
  d.mainPair = d.type === 'layshaft' ? cleanPair(raw.mainPair) : null;
  d.reverse = cleanReverse(raw.reverse, d.type);
  d.finalPair = d.type === 'transaxle' ? cleanFinal(raw.finalPair, d.drive === 'fwd' ? 'helical' : 'bevel') : null;
  if (d.directGear) {
    d.ratios[d.directGear - 1] = null;
    d.pairs[d.directGear - 1] = null;
  }

  // The teeth's limits depend on the ratios and on each other: the centre first, then the modules within it.
  d.centreMm = clamp(num('centreMm'), { min: 50, max: 120 });
  for (const key of ['module', 'lowModule', 'mainModule'] as const) d[key] = num(key);
  settleTeeth(d);

  d.faceWidth = clamp(num('faceWidth'), paramRange(d, 'faceWidth'));

  // Synchronisers.
  d.cones = Array.from({ length: n }, (_, i) => {
    const c = list(raw.cones)[i];
    return (c === 1 || c === 2 || c === 3 ? c : 1) as ConeCount;
  });
  d.synchroMaterial = oneOf(raw.synchroMaterial, SYNCHRO_MATERIALS, D.synchroMaterial);
  for (const key of ['coneAngle', 'roofAngle', 'shiftForceN'] as const) d[key] = clamp(num(key), FIXED[key]!);

  // Clutch and differential.
  d.clutch = oneOf(raw.clutch, CLUTCH_KINDS, D.clutch);
  d.clutchMm = clamp(num('clutchMm'), paramRange(d, 'clutchMm'));
  d.clampN = clamp(num('clampN'), FIXED.clampN!);
  d.facing = oneOf(raw.facing, FACING_KINDS, D.facing);
  d.damper = oneOf(raw.damper, DAMPER_CHOICES, D.damper);
  d.diff = oneOf(raw.diff, DIFF_CHOICES, D.diff);
  for (const key of ['lockDrive', 'lockCoast', 'preloadNm', 'tbr'] as const) d[key] = clamp(num(key), FIXED[key]!);

  const factory = isObject(raw.factory) && typeof raw.factory.gearbox === 'string' ? gearboxById(raw.factory.gearbox) : undefined;
  d.factory = factory && factory.car ? { gearbox: factory.id } : null;

  return buildable(d);
}

/**
 * Hand-set pairs that do not span the centre distance, or that break the order of the ratios, become typed-in ratios;
 * the centre grows until every picked pair fits the finest module, and each module stops where its pairs still fit.
 * Repeats until nothing moves, since a dropped pair changes the targets of the others.
 */
function settleTeeth(d: GearboxDesign): void {
  for (let round = 0; round < 2 * MAX_GEARS + 4; round++) {
    // Pairs set by hand in a layshaft box only have a ratio through the constant-mesh pair, so that one is fixed too.
    if (d.type === 'layshaft' && !d.mainPair && d.pairs.some((p) => p !== null)) {
      d.centreMm = clamp(d.centreMm, paramRange(d, 'centreMm'));
      d.mainModule = clamp(d.mainModule, paramRange(d, 'mainModule'));
      const pick = pickCylPair({
        ratio: mainTarget(targetRatios(d)[0]!), centreMm: d.centreMm, module: d.mainModule, helix: d.helix, pressureAngle: d.pressureAngle,
        faceWidth: faceFor(d, d.mainModule),
      });
      if (pick) d.mainPair = { teeth: pick.teeth, module: pick.module, faceWidth: Math.min(14 * pick.module, Math.max(6 * pick.module, pick.faceWidth)), shift: pick.shift };
      else d.pairs = d.pairs.map(() => null);
    }
    const before = JSON.stringify([d.pairs, d.mainPair, d.ratios, d.centreMm, d.module, d.lowModule, d.mainModule]);
    d.centreMm = clamp(d.centreMm, paramRange(d, 'centreMm'));
    const alpha = d.pressureAngle;
    // A constant-mesh pair set by hand stays within 1–2.5 (the E30's is 1.96): with typed-in ratios of 0.3–8 every
    // speed pair then keeps max(u, 1/u) below 9, where some module gives it 12 to 120 teeth.
    const mainOk = (p: PairSetting): boolean => p.teeth[1] / p.teeth[0] >= MAIN_PAIR.min && p.teeth[1] / p.teeth[0] <= MAIN_PAIR.max && spans(p, d.centreMm, alpha);
    if (d.mainPair && !mainOk(d.mainPair)) d.mainPair = null;
    const main = d.type === 'layshaft' ? mainRatioOf(d) : 1;
    d.pairs = d.pairs.map((p, i) => {
      if (p && !spans(p, d.centreMm, alpha)) {
        d.ratios[i] = (p.teeth[1] / p.teeth[0]) * main;
        return null;
      }
      return p;
    });
    // A hand-set pair keeps its ratio only where the order of the gears allows it.
    const fixed = handRatios(d);
    const targets = targetRatios(d, fixed);
    fixed.forEach((r, i) => {
      if (r !== null && Math.abs(targets[i]! - r) > 1e-12) {
        d.pairs[i] = null;
        d.ratios[i] = r;
      }
    });
    // Typed-in ratios are stored as the targets they end up as, so that resolving again changes nothing; one pushed
    // out of the range a link may carry goes back to the ladder.
    const settled = targetRatios(d, handRatios(d));
    d.ratios = d.ratios.map((r, i) => (r === null || settled[i]! < OVERRIDE.min || settled[i]! > OVERRIDE.max ? null : settled[i]!));
    for (const key of ['module', 'lowModule', 'mainModule'] as const) d[key] = clamp(d[key], paramRange(d, key));
    if (JSON.stringify([d.pairs, d.mainPair, d.ratios, d.centreMm, d.module, d.lowModule, d.mainModule]) === before) return;
  }
}

/**
 * The last guard: a design whose teeth cannot be picked (a hand-set reverse that cannot reach both gears, a pair the
 * finest module leaves no room for) loses what it set by hand, then its modules shrink and its centre grows.
 */
function buildable(d: GearboxDesign): GearboxDesign {
  const tries: Array<(x: GearboxDesign) => void> = [
    (x) => (x.reverse = null),
    (x) => {
      // The pairs' ratios first: a layshaft box's run through its constant-mesh pair.
      const kept = handRatios(x);
      x.pairs.forEach((p, i) => {
        if (p) x.ratios[i] = kept[i] ?? null;
      });
      x.finalPair = null;
      x.mainPair = null;
      x.pairs = x.pairs.map(() => null);
      settleTeeth(x);
      x.faceWidth = clamp(x.faceWidth, paramRange(x, 'faceWidth'));
    },
    ...Array.from({ length: 12 }, () => (x: GearboxDesign) => {
      for (const key of ['module', 'lowModule'] as const) x[key] = Math.max(MODULE_FLOOR, floorTo(x[key] * 0.9, 0.05));
      x.centreMm = Math.min(120, x.centreMm + 4);
      settleTeeth(x);
      x.faceWidth = clamp(x.faceWidth, paramRange(x, 'faceWidth'));
    }),
  ];
  let x = d;
  for (let i = 0; ; i++) {
    try {
      designBuild(x);
      return x;
    } catch {
      if (i >= tries.length) {
        // Nothing helped: the starting design, with the car the visitor chose.
        const D = DEFAULT_GEARBOX_DESIGN;
        const fallback: GearboxDesign = {
          ...D, car: x.car, engine: x.engine, massKg: x.massKg, frontShare: x.frontShare, cdA: x.cdA, crr: x.crr, tyre: x.tyre, tyreSize: drivenSize(x.car, D.drive),
        };
        fallback.clutchMm = clamp(fallback.clutchMm, paramRange(fallback, 'clutchMm'));
        designBuild(fallback);
        return fallback;
      }
      x = { ...x, ratios: [...x.ratios], pairs: [...x.pairs] };
      tries[i]!(x);
    }
  }
}

const validTyreSize = (s: string): boolean => {
  try {
    const t = parseTyreSize(s);
    return t.rimIn >= 10 && t.rimIn <= 24 && t.widthMm >= 125 && t.widthMm <= 355 && t.aspect >= 25 && t.aspect <= 80;
  } catch {
    return false;
  }
};

/** The base car's tyre on the driven axle. */
export function drivenSize(car: string, drive: GearboxDesign['drive']): string {
  const c = CARS[car]!;
  return drive === 'rwd' ? (c.tyre.sizeRear ?? c.tyre.size) : c.tyre.size;
}
