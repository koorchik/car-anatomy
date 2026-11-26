// Every control of the gearbox designer (gearbox plan, the designer's parameters), for the sensitivity checks now and
// the page's panel later (stage K10): what it changes, how it is shown and when it applies. A control that moves none
// of the model's figures must say what it moves instead (`only`), or tests/gearbox-designer "no control is dead" fails.

import { CARS } from '../data/cars.ts';
import { DRIVE_CARS } from '../data/drive-cars.ts';
import { engineById, pageChoices } from '../data/engines.ts';
import { t } from '../i18n/t.ts';
import type { TyreId } from '../vehicle/vehicle.ts';
import type { NumericKey } from './constraints.ts';
import type { GearboxDesign } from './design.ts';

export type ControlGroup = 'type' | 'ratios' | 'teeth' | 'synchro' | 'clutch' | 'diff' | 'car';

export const CONTROL_GROUPS: ReadonlyArray<{ id: ControlGroup; label: string }> = [
  { id: 'type', label: t('Тип') },
  { id: 'ratios', label: t('Передачі') },
  { id: 'teeth', label: t('Зубці') },
  { id: 'synchro', label: t('Синхронізатори') },
  { id: 'clutch', label: t('Зчеплення') },
  { id: 'diff', label: t('Диференціал') },
  { id: 'car', label: t('Авто') },
];

interface ControlBase {
  /** Unique: the design key, or key.index for one gear's value. */
  id: string;
  key: keyof GearboxDesign;
  group: ControlGroup;
  label: string;
  applies?: (d: GearboxDesign) => boolean;
  /**
   * What the control moves when none of the quasi-static figures: 'drive', the differential the full run of the page
   * drives with (vehicle.ts designDifferential).
   */
  only?: 'drive';
}

export interface NumberControl extends ControlBase {
  kind: 'number';
  key: NumericKey;
  /** Whole steps (the number of gears). */
  step?: number;
}

export interface ChoiceControl extends ControlBase {
  kind: 'choice';
  options: (d: GearboxDesign) => Array<[string | number, string]>;
  /** The value now and the patch that sets one: a gear's cones live in an array. */
  get: (d: GearboxDesign) => string | number;
  patch: (d: GearboxDesign, value: string | number) => Partial<GearboxDesign>;
}

export type GearboxControl = NumberControl | ChoiceControl;

const num = (key: NumericKey, group: ControlGroup, label: string, extra: Partial<NumberControl> = {}): NumberControl => ({ id: key, key, group, label, kind: 'number', ...extra });
const choice = (key: keyof GearboxDesign, group: ControlGroup, label: string, options: (d: GearboxDesign) => Array<[string | number, string]>, extra: Partial<ChoiceControl> = {}): ChoiceControl => ({
  id: key, key, group, label, kind: 'choice', options, get: (d) => d[key] as string | number, patch: (_d, value) => ({ [key]: value }) as Partial<GearboxDesign>, ...extra,
});

const layshaft = (d: GearboxDesign): boolean => d.type === 'layshaft';
const transaxle = (d: GearboxDesign): boolean => d.type === 'transaxle';
const plate = (d: GearboxDesign): boolean => d.diff === 'plate';

const CHOICES = {
  type: [['layshaft', t('З проміжним валом')], ['transaxle', t('Двовальна')]],
  synchroMaterial: [['brass', t('Латунь')], ['molybdenum', t('Молібденове покриття')], ['carbon', t('Вуглецеве покриття')]],
  clutch: [['single-dry', t('Один сухий диск')], ['twin-dry', t('Два сухі диски')], ['wet', t('Мокре багатодискове')]],
  facing: [['organic', t('Органічна накладка')], ['ceramic', t('Керамічна накладка')]],
  damper: [['disc', t('Демпфер у диску')], ['dmf', t('Двомасовий маховик')], ['stiff', t('Жорсткий диск')]],
  diff: [['open', t('Вільний')], ['plate', t('Пакетний самоблок')], ['helical', t('Гвинтовий самоблок')], ['locked', t('Заблокований')]],
  drive: [['fwd', t('Передній')], ['rwd', t('Задній')]],
  tyre: [['classic', t('Класичні шини')], ['street', t('Дорожні шини')], ['semi', t('Напівсліки')], ['slick', t('Сліки')]],
} satisfies Record<string, Array<[string, string]>>;

const fixed = (list: Array<[string, string]>) => (): Array<[string, string]> => list;

/** The cars a design may ride on and their engines, as the data names them. */
const carOptions = (): Array<[string, string]> => Object.keys(DRIVE_CARS).flatMap((id) => (CARS[id] ? [[id, CARS[id]!.name] as [string, string]] : []));
const engineOptions = (d: GearboxDesign): Array<[string, string]> => {
  const ids = [...new Set([d.engine, ...Object.keys(DRIVE_CARS).flatMap((id) => (CARS[id] ? [CARS[id]!.engine] : []))])];
  return ids.flatMap((id) => {
    const e = engineById(id);
    // The engine's own name (BMW M3 E30 (S14)), not its layout's page title, which two fours share.
    const name = pageChoices(id).find((c) => c.id === id)?.name ?? e?.title;
    return e && name ? [[id, name] as [string, string]] : [];
  });
};

/** One control per forward gear: its synchroniser's cones. */
function coneControls(d: GearboxDesign): ChoiceControl[] {
  return Array.from({ length: d.gears }, (_, i) => ({
    id: `cones.${i + 1}`,
    key: 'cones',
    group: 'synchro',
    label: t('Конусів на {gear}-й', { gear: i + 1 }),
    kind: 'choice',
    options: () => [[1, '1'], [2, '2'], [3, '3']],
    get: (x) => x.cones[i] ?? 1,
    patch: (x, value) => ({ cones: x.cones.map((c, k) => (k === i ? (value as 1 | 2 | 3) : c)) }),
  }));
}

/** Every control that applies to this design, in panel order. */
export function gearboxControls(d: GearboxDesign): GearboxControl[] {
  const all: GearboxControl[] = [
    choice('type', 'type', t('Тип коробки'), fixed(CHOICES.type)),
    num('gears', 'ratios', t('Кількість передач'), { step: 1 }),
    num('firstRatio', 'ratios', t('Число першої')),
    num('topRatio', 'ratios', t('Число вищої'), { applies: (x) => !(layshaft(x) && x.directGear === x.gears) }),
    num('progression', 'ratios', t('Прогресія')),
    choice('directGear', 'ratios', t('Пряма передача'), (x) => [[0, t('Немає')], ...Array.from({ length: x.gears - 1 }, (_, i) => [i + 2, String(i + 2)] as [number, string])], { applies: layshaft }),
    num('reverseRatio', 'ratios', t('Число заднього ходу')),
    num('finalDrive', 'ratios', t('Головна передача')),
    num('module', 'teeth', t('Модуль передач')),
    num('lowModule', 'teeth', t('Модуль першої й заднього ходу')),
    num('mainModule', 'teeth', t('Модуль головної пари')),
    num('pressureAngle', 'teeth', t('Кут профілю')),
    num('helix', 'teeth', t('Кут нахилу зубця')),
    num('faceWidth', 'teeth', t('Ширина вінця')),
    num('centreMm', 'teeth', t('Міжосьова відстань')),
    choice('synchroMaterial', 'synchro', t('Матеріал кілець'), fixed(CHOICES.synchroMaterial)),
    num('coneAngle', 'synchro', t('Кут конуса')),
    num('roofAngle', 'synchro', t('Кут даху фасок')),
    num('shiftForceN', 'synchro', t('Сила на муфті')),
    ...coneControls(d),
    choice('clutch', 'clutch', t('Зчеплення'), fixed(CHOICES.clutch)),
    num('clutchMm', 'clutch', t('Діаметр диска')),
    num('clampN', 'clutch', t('Притискання')),
    choice('facing', 'clutch', t('Накладка'), fixed(CHOICES.facing), { applies: (x) => x.clutch !== 'wet' }),
    choice('damper', 'clutch', t('Демпфер'), fixed(CHOICES.damper)),
    choice('diff', 'diff', t('Диференціал'), fixed(CHOICES.diff), { only: 'drive' }),
    num('lockDrive', 'diff', t('Блокування в тязі'), { applies: plate, only: 'drive' }),
    num('lockCoast', 'diff', t('Блокування в гальмуванні'), { applies: plate, only: 'drive' }),
    num('preloadNm', 'diff', t('Попереднє стиснення'), { applies: (x) => x.diff === 'plate' || x.diff === 'helical', only: 'drive' }),
    num('tbr', 'diff', t('Розподіл моменту'), { applies: (x) => x.diff === 'helical', only: 'drive' }),
    choice('car', 'car', t('Кузов'), carOptions),
    choice('engine', 'car', t('Двигун'), engineOptions),
    num('massKg', 'car', t('Маса авто')),
    choice('drive', 'car', t('Привід'), fixed(CHOICES.drive), { applies: transaxle }),
    num('frontShare', 'car', t('Вага на передній осі')),
    choice('tyre', 'car', t('Шини'), () => CHOICES.tyre as Array<[TyreId, string]>),
    num('cdA', 'car', t('Аеродинамічний опір')),
    num('crr', 'car', t('Опір кочення')),
  ];
  return all.filter((c) => !c.applies || c.applies(d));
}
