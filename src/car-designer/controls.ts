// Every control of the car builder, for the "what this changes" checks now and the page's panel later (stage C5): what
// it changes, its options or range, and when it applies. A control that moves none of the quasi-static figures says
// what it moves instead (`only`), or tests/car-build "no control is dead" fails:
// - 'drive': the differential, which only the drive (stage C6a) feels;
// - 'oil': the oil on the lap, which the page works out after a pause (oilAndWear).
//
// Every change goes through editBuild, which knows what a change takes with it.

import { CAR_LIST } from '../data/cars.ts';
import { gearboxById } from '../data/gearboxes.ts';
import { TYRE_NAMES } from '../data/vehicle-names.ts';
import { paramRange } from '../designer/constraints.ts';
import { effectiveOilL, effectiveSump, SUMP_NAMES } from '../designer/lubrication.ts';
import { CATALOGUE_CHOICES } from '../designer/presets.ts';
import { SUMP_KINDS, type SumpKind } from '../engine/systems-spec.ts';
import { DIFF_CHOICES, type DiffChoice, type GearboxDesign } from '../gearbox-designer/design.ts';
import { t } from '../i18n/t.ts';
import { CHASSIS_CATALOGUE } from '../suspension-designer/catalogue.ts';
import { CARS } from '../data/cars.ts';
import { TYRES, type TyreId } from '../vehicle/vehicle.ts';
import { DEFAULT_GEARBOX_DESIGN } from '../gearbox-designer/design.ts';
import { designFromRecord } from '../gearbox-designer/presets.ts';
import { donorById, FINAL_DRIVE, IDEAL_DEFAULT, IDEAL_GEARS, IDEAL_SPREAD, type CarBuild } from './build.ts';
import { drivenTyreSize, engineDesignOf, gearboxChoices, resolveBuild } from './resolve.ts';

export type ControlGroup = 'car' | 'engine' | 'gearbox' | 'suspension' | 'tyres';

export const CONTROL_GROUPS: ReadonlyArray<{ id: ControlGroup; label: string }> = [
  { id: 'car', label: t('Авто-донор') },
  { id: 'engine', label: t('Двигун') },
  { id: 'gearbox', label: t('Коробка передач') },
  { id: 'suspension', label: t('Підвіска') },
  { id: 'tyres', label: t('Шини') },
];

interface ControlBase {
  id: string;
  group: ControlGroup;
  label: string;
  applies?: (b: CarBuild) => boolean;
  only?: 'drive' | 'oil';
}

export interface ChoiceControl extends ControlBase {
  kind: 'choice';
  options: (b: CarBuild) => Array<[string, string]>;
  get: (b: CarBuild) => string;
  set: (b: CarBuild, value: string) => CarBuild;
}

export interface NumberControl extends ControlBase {
  kind: 'number';
  range: (b: CarBuild) => { min: number; max: number };
  step: number;
  get: (b: CarBuild) => number;
  set: (b: CarBuild, value: number) => CarBuild;
}

export type BuildControl = ChoiceControl | NumberControl;

/**
 * One change to a build, with what it takes along: another donor brings its own tyres and final drive, another engine
 * its own sump, another gearbox its own final drive and differential. The result is resolved.
 */
export function editBuild(b: CarBuild, patch: Partial<CarBuild>): CarBuild {
  const out: CarBuild = { ...b, ...patch };
  if (patch.donor !== undefined && patch.donor !== b.donor) {
    if (!('tyre' in patch)) out.tyre = null;
    if (!('finalDrive' in patch)) out.finalDrive = null;
  }
  if (patch.engine !== undefined && JSON.stringify(patch.engine) !== JSON.stringify(b.engine) && !('lubrication' in patch)) out.lubrication = null;
  if (patch.gearbox !== undefined && JSON.stringify(patch.gearbox) !== JSON.stringify(b.gearbox)) {
    if (!('finalDrive' in patch)) out.finalDrive = null;
    if (!('differential' in patch)) out.differential = null;
  }
  return resolveBuild(out);
}

const designs = new Map<string, GearboxDesign>();
/** The gearbox design a build starts from, before it is put in the build's car (evaluate.ts does that). */
export function gearboxBase(b: CarBuild): GearboxDesign {
  const g = b.gearbox;
  if (g && 'design' in g) return g.design;
  const id = g && 'catalogue' in g ? g.catalogue : g === null ? donorById(b.donor)!.gearbox : null;
  if (!id) return DEFAULT_GEARBOX_DESIGN;
  let d = designs.get(id);
  if (!d) {
    d = designFromRecord(gearboxById(id)!);
    designs.set(id, d);
  }
  return d;
}

const isIdeal = (b: CarBuild): boolean => !!b.gearbox && 'ideal' in b.gearbox;
const isPiston = (b: CarBuild): boolean => engineDesignOf(b.engine).layout !== 'rotary';
const ideal = (b: CarBuild) => (b.gearbox && 'ideal' in b.gearbox ? b.gearbox.ideal : IDEAL_DEFAULT);

function gearboxName(id: string): string {
  const g = gearboxById(id)!;
  const car = g.car ? CARS[g.car] : undefined;
  return car ? `${g.name} · ${car.name}` : g.name;
}

/** Driven-axle sizes of the site's cars, and the build's own. */
function sizeOptions(b: CarBuild): Array<[string, string]> {
  const sizes = new Set<string>([drivenTyreSize(donorById(b.donor)!), ...(b.tyre ? [b.tyre.size] : [])]);
  for (const car of CAR_LIST) {
    sizes.add(car.tyre.size);
    if (car.tyre.sizeRear) sizes.add(car.tyre.sizeRear);
  }
  return [...sizes].sort().map((s) => [s, s]);
}

const tyreOf = (b: CarBuild): { id: TyreId; size: string } => b.tyre ?? { id: donorById(b.donor)!.tyre.id, size: drivenTyreSize(donorById(b.donor)!) };
const lubeOf = (b: CarBuild): { sump: SumpKind; oilL: number } => {
  if (b.lubrication) return b.lubrication;
  const d = engineDesignOf(b.engine);
  return { sump: effectiveSump(d), oilL: Math.round(effectiveOilL(d) * 10) / 10 };
};

export function buildControls(b: CarBuild): BuildControl[] {
  const list: BuildControl[] = [
    {
      kind: 'choice', id: 'donor', group: 'car', label: t('Донор'),
      options: () => CAR_LIST.filter((c) => donorById(c.id)).map((c) => [c.id, c.name]),
      get: (x) => x.donor,
      set: (x, v) => editBuild(x, { donor: v }),
    },
    {
      kind: 'choice', id: 'engine', group: 'engine', label: t('Двигун'),
      options: (x) => [...('design' in x.engine ? [['design', x.engine.design.name || t('Двигун із конструктора')] as [string, string]] : []), ...CATALOGUE_CHOICES.map((c): [string, string] => [c.id, c.name])],
      get: (x) => ('catalogue' in x.engine ? x.engine.catalogue : 'design'),
      set: (x, v) => (v === 'design' ? x : editBuild(x, { engine: { catalogue: v } })),
    },
    {
      kind: 'choice', id: 'gearbox', group: 'gearbox', label: t('Коробка'),
      options: (x) => {
        const car = donorById(x.donor)!;
        return [
          ['donor', t('Власна коробка авто')],
          ...gearboxChoices(car).filter((id) => id !== car.gearbox).map((id): [string, string] => [id, gearboxName(id)]),
          ['ideal', t('Ідеальна коробка')],
          ...(x.gearbox && 'design' in x.gearbox ? [['design', x.gearbox.design.name || t('Коробка з конструктора')] as [string, string]] : []),
        ];
      },
      get: (x) => (x.gearbox === null ? 'donor' : 'catalogue' in x.gearbox ? x.gearbox.catalogue : 'ideal' in x.gearbox ? 'ideal' : 'design'),
      set: (x, v) => (v === 'design' ? x : editBuild(x, { gearbox: v === 'donor' ? null : v === 'ideal' ? { ideal: { ...IDEAL_DEFAULT } } : { catalogue: v } })),
    },
    {
      kind: 'number', id: 'idealGears', group: 'gearbox', label: t('Число передач'), step: 1, applies: isIdeal,
      range: () => ({ ...IDEAL_GEARS }),
      get: (x) => ideal(x).gears,
      set: (x, v) => editBuild(x, { gearbox: { ideal: { ...ideal(x), gears: v } } }),
    },
    {
      kind: 'number', id: 'idealSpread', group: 'gearbox', label: t('Розкид передач'), step: 0.1, applies: isIdeal,
      range: () => ({ ...IDEAL_SPREAD }),
      get: (x) => ideal(x).spread,
      set: (x, v) => editBuild(x, { gearbox: { ideal: { ...ideal(x), spread: v } } }),
    },
    {
      kind: 'number', id: 'finalDrive', group: 'gearbox', label: t('Головна передача'), step: 0.01, applies: (x) => !isIdeal(x),
      range: () => ({ ...FINAL_DRIVE }),
      get: (x) => x.finalDrive ?? gearboxBase(x).finalDrive,
      set: (x, v) => editBuild(x, { finalDrive: v }),
    },
    {
      kind: 'choice', id: 'differential', group: 'gearbox', label: t('Диференціал'), only: 'drive',
      options: () => DIFF_CHOICES.map((d): [string, string] => [d, DIFF_NAMES[d]]),
      get: (x) => x.differential ?? gearboxBase(x).diff,
      set: (x, v) => editBuild(x, { differential: v as DiffChoice }),
    },
    {
      kind: 'choice', id: 'suspension', group: 'suspension', label: t('Підвіска'),
      options: (x) => [
        ['donor', t('Власна підвіска авто')],
        ...CHASSIS_CATALOGUE.filter((e) => e.id !== x.donor).map((e): [string, string] => [e.id, CARS[e.id]?.name ?? e.id]),
        ...(x.suspension && 'design' in x.suspension ? [['design', t('Підвіска з конструктора')] as [string, string]] : []),
      ],
      get: (x) => (x.suspension === null ? 'donor' : 'catalogue' in x.suspension ? x.suspension.catalogue : 'design'),
      set: (x, v) => (v === 'design' ? x : editBuild(x, { suspension: v === 'donor' ? null : { catalogue: v } })),
    },
    {
      kind: 'choice', id: 'tyre', group: 'tyres', label: t('Шини'),
      options: () => (Object.keys(TYRES) as TyreId[]).map((id): [string, string] => [id, TYRE_NAMES[id]]),
      get: (x) => tyreOf(x).id,
      set: (x, v) => editBuild(x, { tyre: { ...tyreOf(x), id: v as TyreId } }),
    },
    {
      kind: 'choice', id: 'tyreSize', group: 'tyres', label: t('Розмір шин ведучої осі'),
      options: sizeOptions,
      get: (x) => tyreOf(x).size,
      set: (x, v) => editBuild(x, { tyre: { ...tyreOf(x), size: v } }),
    },
    {
      kind: 'choice', id: 'sump', group: 'engine', label: t('Картер'), applies: isPiston,
      options: () => SUMP_KINDS.map((k): [string, string] => [k, SUMP_NAMES[k]]),
      get: (x) => lubeOf(x).sump,
      set: (x, v) => {
        const d = { ...engineDesignOf(x.engine), sump: v as SumpKind, oilL: null };
        return editBuild(x, { lubrication: { sump: v as SumpKind, oilL: effectiveOilL(d) } });
      },
    },
    {
      kind: 'number', id: 'oilL', group: 'engine', label: t('Олива'), step: 0.1, applies: isPiston, only: 'oil',
      range: (x) => paramRange({ ...engineDesignOf(x.engine), sump: lubeOf(x).sump, oilL: null }, 'oilL'),
      get: (x) => lubeOf(x).oilL,
      set: (x, v) => editBuild(x, { lubrication: { ...lubeOf(x), oilL: v } }),
    },
  ];
  return list.filter((c) => !c.applies || c.applies(b));
}

const DIFF_NAMES: Record<DiffChoice, string> = {
  open: t('Вільний'),
  plate: t('Пакетний самоблок'),
  helical: t('Гвинтовий самоблок'),
  locked: t('Заблокований'),
};
