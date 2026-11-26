// The geometry level of the car builder (whole-car plan, constraints and diagnoses): resolveBuild moves only what cannot
// be, and explains it. The engineering level (diagnostics.ts) forbids nothing.
//
// - A transverse engine takes only a transverse gearbox and a longitudinal one only a longitudinal gearbox, so a gearbox
//   of the other kind than the donor's is replaced by the donor's own.
// - The donor sets the drive.
// - A unit that names nothing (an unknown engine, gearbox, chassis or tyre) falls back to the donor's.
// - Nested designs go through their sections' resolvers (resolveDesign, resolveGearboxDesign, resolveChassis).
// - Choosing what the donor already has is the donor's: the same build has one form, and one link.
//
// It takes anything (a link from someone else decodes to any JSON), never throws and is idempotent:
// resolveBuild(resolveBuild(x)) is resolveBuild(x).

import { engineById } from '../data/engines.ts';
import { ALL_GEARBOXES, gearboxById } from '../data/gearboxes.ts';
import { driveCarById } from '../data/drive-cars.ts';
import { designFromObject } from '../designer/codec.ts';
import { paramRange } from '../designer/constraints.ts';
import type { Design } from '../designer/design.ts';
import { effectiveOilL, effectiveSump } from '../designer/lubrication.ts';
import { designFromSpec } from '../designer/presets.ts';
import { SUMP_KINDS, type SumpKind } from '../engine/systems-spec.ts';
import { resolveGearboxDesign } from '../gearbox-designer/constraints.ts';
import { DIFF_CHOICES, type DiffChoice, type GearboxDesign, type GearboxType } from '../gearbox-designer/design.ts';
import { catalogueEntry } from '../suspension-designer/catalogue.ts';
import { resolveChassis } from '../suspension-designer/constraints.ts';
import type { CarRecord } from '../vehicle/car.ts';
import { parseTyreSize } from '../vehicle/tyre-size.ts';
import { TYRES, type TyreId } from '../vehicle/vehicle.ts';
import {
  DEFAULT_DONOR, donorById, FINAL_DRIVE, IDEAL_GEARS, IDEAL_SPREAD, type BuildEngine, type BuildGearbox, type CarBuild,
} from './build.ts';

/** What resolveBuild changed and why; diagnostics.ts says it in words. */
export type ResolveNote =
  | { id: 'donor'; asked: string }
  | { id: 'engine'; asked: string }
  | { id: 'gearbox'; asked: string }
  | { id: 'gearbox-type'; asked: GearboxType; donor: GearboxType }
  | { id: 'suspension'; asked: string }
  | { id: 'tyre' }
  | { id: 'lubrication-rotary' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Record<string, unknown>, key: string): unknown => (Object.hasOwn(o, key) ? o[key] : undefined);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round = (v: number, step: number): number => Number((Math.round(v / step) * step).toFixed(6));

/** The gearbox kind a donor's layout takes: its own box's, or by where and how the engine sits. */
export function donorGearboxType(car: CarRecord): GearboxType {
  const own = car.gearbox ? gearboxById(car.gearbox) : undefined;
  if (own) return own.layout.kind as GearboxType;
  return car.mount.axis === 'longitudinal' && car.mount.position === 'front' && car.drive === 'rwd' ? 'layshaft' : 'transaxle';
}

/** Catalogue gearboxes that fit a donor: copyable (in a car the gearbox section drives) and of the donor's kind. */
export function gearboxChoices(car: CarRecord): string[] {
  const type = donorGearboxType(car);
  return [car.gearbox, ...ALL_GEARBOXES.map((g) => g.id)].filter((id, i, all): id is string => {
    if (!id || all.indexOf(id) !== i) return false;
    const g = gearboxById(id);
    return !!g && !!g.car && !!driveCarById(g.car) && g.layout.kind === type;
  });
}

/** The engine's own design: the catalogue's copy, or the visitor's design. */
export const engineDesignOf = (engine: BuildEngine): Design => ('design' in engine ? engine.design : designFromSpec(engineById(engine.catalogue)!));

function resolveEngine(raw: unknown, car: CarRecord, notes: ResolveNote[]): BuildEngine {
  if (isObject(raw)) {
    const id = own(raw, 'catalogue');
    if (typeof id === 'string') {
      if (engineById(id)) return { catalogue: id };
      notes.push({ id: 'engine', asked: id.slice(0, 40) });
    } else {
      // Read the way the engine designer reads its links, so a design of any shape builds and links back unchanged.
      const design = designFromObject(own(raw, 'design'));
      if (design) return { design };
    }
  }
  return { catalogue: car.engine };
}

function resolveGearbox(raw: unknown, car: CarRecord, notes: ResolveNote[]): BuildGearbox | null {
  if (!isObject(raw)) return null;
  const type = donorGearboxType(car);
  const id = own(raw, 'catalogue');
  if (typeof id === 'string') {
    if (id === car.gearbox) return null;
    if (gearboxChoices(car).includes(id)) return { catalogue: id };
    const g = gearboxById(id);
    if (g && g.layout.kind !== type) notes.push({ id: 'gearbox-type', asked: g.layout.kind as GearboxType, donor: type });
    else notes.push({ id: 'gearbox', asked: id.slice(0, 60) });
    return null;
  }
  const design = own(raw, 'design');
  if (isObject(design)) {
    const d = resolveGearboxDesign(design as unknown as GearboxDesign);
    if (d.type === type) return { design: d };
    notes.push({ id: 'gearbox-type', asked: d.type, donor: type });
    return null;
  }
  const ideal = own(raw, 'ideal');
  if (isObject(ideal)) {
    const gears = own(ideal, 'gears');
    const spread = own(ideal, 'spread');
    return {
      ideal: {
        gears: finite(gears) ? Math.round(clamp(gears, IDEAL_GEARS.min, IDEAL_GEARS.max)) : 6,
        spread: finite(spread) ? round(clamp(spread, IDEAL_SPREAD.min, IDEAL_SPREAD.max), 0.01) : 4.3,
      },
    };
  }
  return null;
}

function resolveSuspension(raw: unknown, car: CarRecord, notes: ResolveNote[]): CarBuild['suspension'] {
  if (!isObject(raw)) return null;
  const id = own(raw, 'catalogue');
  if (typeof id === 'string') {
    if (id === car.id) return null;
    if (catalogueEntry(id)) return { catalogue: id };
    notes.push({ id: 'suspension', asked: id.slice(0, 60) });
    return null;
  }
  const design = own(raw, 'design');
  return isObject(design) ? { design: resolveChassis(design) } : null;
}

const validSize = (s: string): boolean => {
  try {
    const t = parseTyreSize(s);
    return t.rimIn >= 10 && t.rimIn <= 24 && t.widthMm >= 125 && t.widthMm <= 355 && t.aspect >= 25 && t.aspect <= 80;
  } catch {
    return false;
  }
};

/** The donor's tyre size on its driven axle (the rear on four-wheel drive, as the lap takes it). */
export const drivenTyreSize = (car: CarRecord): string => (car.drive === 'fwd' ? car.tyre.size : (car.tyre.sizeRear ?? car.tyre.size));

function resolveTyre(raw: unknown, car: CarRecord, notes: ResolveNote[]): CarBuild['tyre'] {
  if (!isObject(raw)) return null;
  const id = own(raw, 'id');
  const size = own(raw, 'size');
  if (typeof id !== 'string' || !Object.hasOwn(TYRES, id) || typeof size !== 'string' || !validSize(size)) {
    notes.push({ id: 'tyre' });
    return null;
  }
  const tyre = { id: id as TyreId, size: size.trim() };
  return tyre.id === car.tyre.id && tyre.size === drivenTyreSize(car) ? null : tyre;
}

function resolveLubrication(raw: unknown, engine: BuildEngine, notes: ResolveNote[]): CarBuild['lubrication'] {
  if (!isObject(raw)) return null;
  const design = engineDesignOf(engine);
  if (design.layout === 'rotary') {
    notes.push({ id: 'lubrication-rotary' });
    return null;
  }
  const sumpRaw = own(raw, 'sump');
  const sump: SumpKind = SUMP_KINDS.includes(sumpRaw as SumpKind) ? (sumpRaw as SumpKind) : effectiveSump(design);
  const withSump: Design = { ...design, sump, oilL: null };
  const range = paramRange(withSump, 'oilL');
  const oilRaw = own(raw, 'oilL');
  const oilL = round(clamp(finite(oilRaw) ? oilRaw : effectiveOilL(withSump), range.min, range.max), 0.1);
  return sump === effectiveSump(design) && oilL === round(effectiveOilL(design), 0.1) ? null : { sump, oilL };
}

/** The build as it can be, and what had to change. */
export function resolveBuildWithNotes(input: unknown): { build: CarBuild; notes: ResolveNote[] } {
  const raw = isObject(input) ? input : {};
  const notes: ResolveNote[] = [];
  const asked = own(raw, 'donor');
  let car = typeof asked === 'string' ? donorById(asked) : undefined;
  if (!car) {
    if (asked !== undefined) notes.push({ id: 'donor', asked: String(asked).slice(0, 40) });
    car = donorById(DEFAULT_DONOR)!;
  }
  const engine = resolveEngine(own(raw, 'engine'), car, notes);
  const gearbox = resolveGearbox(own(raw, 'gearbox'), car, notes);
  const fd = own(raw, 'finalDrive');
  // An ideal box's top gear sits at the limiter at v_max whatever the final drive: it has none of its own.
  const finalDrive = gearbox && 'ideal' in gearbox ? null : finite(fd) ? round(clamp(fd, FINAL_DRIVE.min, FINAL_DRIVE.max), 0.01) : null;
  const diff = own(raw, 'differential');
  const differential = DIFF_CHOICES.includes(diff as DiffChoice) ? (diff as DiffChoice) : null;
  const build: CarBuild = {
    donor: car.id,
    engine,
    gearbox,
    finalDrive,
    differential,
    suspension: resolveSuspension(own(raw, 'suspension'), car, notes),
    tyre: resolveTyre(own(raw, 'tyre'), car, notes),
    lubrication: resolveLubrication(own(raw, 'lubrication'), engine, notes),
  };
  return { build, notes };
}

/** The build as it can be (see the header). */
export const resolveBuild = (input: unknown): CarBuild => resolveBuildWithNotes(input).build;
