// Starting points: any engine from the catalogue, a set of deliberately odd machines, and a random one.

import { ENGINE_VARIANTS } from '../data/engine-variants.ts';
import { CATALOGUE, ENGINES } from '../data/engines.ts';
import type { EngineSpec } from '../engine/spec.ts';
import { t } from '../i18n/t.ts';
import { resolveDesign } from './constraints.ts';
import { catalogueDesign } from './catalogue.ts';
import { DEFAULT_DESIGN, type ChargerKind, type Design, type DesignLayout, type Muffler } from './design.ts';
import type { FuelId } from './fuels.ts';

/** A catalogue engine as a design: its own configuration, ready to be changed. */
export function designFromSpec(spec: EngineSpec): Design {
  const [page, variantId] = spec.id.split('/');
  const entry = CATALOGUE.find((e) => e.id === page);
  if (!entry) throw new Error(`No catalogue entry for ${spec.id}`);
  return catalogueDesign(entry, variantId ? ENGINE_VARIANTS[page!]?.variants.find((v) => v.id === variantId) : undefined);
}

/**
 * The exhaust that usually comes with a layout. It shapes the sound far more than the angle of the cylinders:
 * with one shared collector and even firing, an inline six and a VR6 send identical pulses down the pipe.
 */
const layoutExhaust = (layout: DesignLayout, cylinders: number): Partial<Design> => {
  switch (layout) {
    case 'inline':
      return { collector: 'single', headerLength: 650, headerSpread: 0 };
    case 'vee':
      return { collector: 'bybank', headerLength: 700, headerSpread: 0 };
    case 'boxer':
      // A flat four routes its long pipes around the engine, like the old Subarus. Larger ones get one per bank.
      return cylinders <= 4 ? { collector: 'single', headerLength: 750, headerSpread: 0.35 } : { collector: 'bybank', headerLength: 880, headerSpread: 0.12 };
    case 'flatvee':
      return { collector: 'bybank', headerLength: 900, headerSpread: 0 };
    case 'vr':
      // Rows of a VR sit at different distances from the one exhaust side of the head.
      return { collector: 'single', headerLength: 600, headerSpread: 0.28 };
    case 'w':
      return { collector: 'bybank', headerLength: 620, headerSpread: 0.2 };
    case 'rotary':
      return { collector: 'single', headerLength: 500, headerSpread: 0 };
  }
};

/** Moves a design to another layout, with the exhaust that layout normally has. Everything else stays. */
export function withLayout(d: Design, layout: DesignLayout): Design {
  // A hand-made crank table was written for the old cylinder positions.
  const moved = resolveDesign({
    ...d,
    layout,
    throws: [],
    crankPreset: d.crankPreset === 'custom' ? 'even' : d.crankPreset,
    numbering: 'alternating',
    veeMirror: false,
    rotorOrder: null,
    headerLengths: null,
    collectorOf: null,
    pans: null,
    coverColor: null,
    factory: null,
  });
  return resolveDesign({ ...moved, ...layoutExhaust(layout, moved.cylinders) });
}

// The same engine drawn or heard differently: the factory figures still hold.
const COSMETIC = new Set<keyof Design>(['name', 'coverColor', 'switchKind', 'deactivateGroup']);

/** One edit from the panel, with what that edit implies for the fields that depended on the old value. */
export function editDesign(d: Design, patch: Partial<Design>): Design {
  if (patch.layout !== undefined && patch.layout !== d.layout) return withLayout({ ...d, ...patch }, patch.layout);
  const next: Design = { ...d, ...patch };
  if ('cylinders' in patch) {
    if (next.crankPreset === 'custom') next.crankPreset = 'even';
    next.throws = [];
    next.headerLengths = null;
    next.collectorOf = null;
    next.pans = null;
    next.rotorOrder = null;
  }
  if ('headerLength' in patch || 'headerSpread' in patch) next.headerLengths = null;
  if ('collector' in patch) {
    next.collectorOf = null;
    next.pans = null;
  }
  if ('muffler' in patch && !('mufflerOpen' in patch)) {
    next.mufflerOpen = null;
    next.rasp = null;
    next.pops = null;
  }
  // The first engineering change hands over from the factory figures to the model's own.
  if (Object.keys(patch).some((key) => !COSMETIC.has(key as keyof Design))) next.factory = null;
  return resolveDesign(next);
}

export interface DesignPreset {
  id: string;
  name: string;
  note: string;
  design: () => Design;
}

const make = (over: Partial<Design>): (() => Design) => () => resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });

/** Machines nobody sensible would build. They exist to show what each choice does. */
export const ODD_PRESETS: DesignPreset[] = [
  {
    id: 'big-single',
    name: t('Трилітровий сингл'),
    note: t('Один циліндр на три літри: вагон моменту, а маховик ледве встигає.'),
    design: make({ name: t('Трилітровий сингл'), cylinders: 1, bore: 150, stroke: 170, rodLength: 340, compression: 9, flywheelKg: 45, rpmLimit: 3200, fuel: 'ai95', intakeValve: 72, exhaustValve: 62, valvesPerCyl: 2, lift: 18, valvetrain: 'ohv', springForce: 900, intakeDuration: 235, exhaustDuration: 235, runnerDia: 70, headerDia: 70, pipeDia: 90, muffler: 'sport', catalyst: false }),
  },
  {
    id: 'tiny-v12',
    name: t('Крихітний V12'),
    note: t('Літр робочого об’єму на дванадцять циліндрів і дуже високі оберти.'),
    design: make({ name: t('Крихітний V12 на літр'), layout: 'vee', cylinders: 12, veeAngle: 60, bore: 50, stroke: 42, rodLength: 88, compression: 12.5, intakeValve: 19, exhaustValve: 16, lift: 6, intakeDuration: 280, exhaustDuration: 275, lobeSeparation: 108, springForce: 340, rpmLimit: 16000, fuel: 'ai98', runnerLength: 130, runnerDia: 20, headerLength: 320, headerDia: 18, pipeDia: 60, muffler: 'open', catalyst: false, flywheelKg: 2, collector: 'bybank', pistonMaterial: 'forged', rodMaterial: 'titanium' }),
  },
  {
    id: 'bigbang-v4',
    name: t('V4 «великий удар»'),
    note: t('Усі спалахи скупчені разом, а потім тиша. Рівний за балансом, рваний за звуком.'),
    design: make({ name: t('V4 великий удар'), layout: 'vee', cylinders: 4, veeAngle: 90, crankPreset: 'bigbang', bore: 86, stroke: 64, rodLength: 125, compression: 12.5, intakeDuration: 270, exhaustDuration: 265, lift: 11, rpmLimit: 11500, fuel: 'ai98', springForce: 900, pistonMaterial: 'forged', muffler: 'open', catalyst: false, flywheelKg: 4, runnerLength: 220, headerLength: 700, pipeDia: 58 }),
  },
  {
    id: 'flat-i6',
    name: t('I6 із плоским колінвалом'),
    note: t('Зрівноважену від природи шістку зіпсовано плоским валом: подивись на вібрації.'),
    design: make({ name: t('I6 із плоским валом'), cylinders: 6, crankPreset: 'flat', bore: 84, stroke: 90, rodLength: 150, pipeDia: 70 }),
  },
  {
    id: 'turbo-diesel-twin',
    name: t('Турбодизельна двійка'),
    note: t('Високий ступінь стиснення, велика турбіна і дуже мало циліндрів.'),
    design: make({ name: t('Турбодизельна двійка'), cylinders: 2, fuel: 'diesel', lambda: 1.5, compression: 19, bore: 95, stroke: 110, rodLength: 185, charger: 'turbo', boostBar: 1.6, turboSizeHp: 170, intercooler: 0.7, intakeDuration: 215, exhaustDuration: 220, rpmLimit: 4200, flywheelKg: 30, balanceShafts: 2, springForce: 420, valvesPerCyl: 2, valvetrain: 'sohc', intakeValve: 44, exhaustValve: 38, lift: 9.5, pipeDia: 60 }),
  },
  {
    id: 'hyper-i3',
    name: t('Гіпернаддувний I3'),
    note: t('Літр, три циліндри і 3 бари наддуву на метанолі. Подивись, чим це закінчується.'),
    design: make({ name: t('Гіпернаддувний I3'), cylinders: 3, bore: 74, stroke: 77, rodLength: 130, compression: 8.5, charger: 'turbo', boostBar: 3, turboSizeHp: 240, intercooler: 0.85, fuel: 'methanol', lambda: 0.82, intakeDuration: 255, exhaustDuration: 255, rpmLimit: 8200, springForce: 950, pistonMaterial: 'forged', muffler: 'sport', catalyst: false, pipeDia: 70, flywheelKg: 5 }),
  },
  {
    id: 'bad-cam',
    name: t('Гоночний кулачок у місті'),
    note: t('Дуже широкі фази на високому стисненні: холостий хід гуляє, а клапани можуть зустрітись із поршнем.'),
    design: make({ name: t('Гоночний кулачок у місті'), cylinders: 4, bore: 86, stroke: 86, compression: 13.5, intakeDuration: 320, exhaustDuration: 320, lobeSeparation: 100, lift: 14, rpmLimit: 8500, intakeValve: 36, springForce: 1100 }),
  },
  {
    id: 'atkinson-hybrid',
    name: t('Гібридний Аткінсон'),
    note: t('Стиснення 13 на звичайному бензині: впуск закривається так пізно, що поршень виштовхує частину заряду назад. Мало моменту, зате високий ККД, як у гібридів Toyota.'),
    design: make({ name: t('Гібридний Аткінсон'), cylinders: 4, bore: 80.5, stroke: 88.3, rodLength: 145, compression: 13, fuel: 'ai92', intakeValve: 31, exhaustValve: 26, lift: 9, intakeDuration: 290, exhaustDuration: 240, lobeSeparation: 112, camPhaser: 'intake', intakePhaseRange: 50, rpmLimit: 5600, springForce: 450, muffler: 'road' }),
  },
  {
    id: 'miller-turbo',
    name: t('Міллер із турбіною'),
    note: t('Високе для наддуву стиснення й короткий впускний кулачок. Фазообертач може закрити впуск ще до нижньої мертвої точки, тож стискається менше, ніж розширюється. Volkswagen 1.5 TSI evo іде цим шляхом аж до 12,5 : 1.'),
    design: make({ name: t('Міллер із турбіною'), cylinders: 4, bore: 74.5, stroke: 85.9, rodLength: 140, compression: 11.5, fuel: 'ai95', charger: 'turbo', boostBar: 0.8, turboSizeHp: 170, intercooler: 0.8, directInjection: true, intakeValve: 28, exhaustValve: 24, lift: 8.5, intakeDuration: 180, exhaustDuration: 220, lobeSeparation: 96, camPhaser: 'dual', intakePhaseRange: 80, exhaustPhaseRange: 40, rpmLimit: 6200, springForce: 500 }),
  },
  {
    id: 'mega-rotary',
    name: t('Чотирироторний наддув'),
    note: t('Чотири секції та дві турбіни: компактно, гучно і дуже спрагло.'),
    design: make({ name: t('Чотирироторний із наддувом'), layout: 'rotary', cylinders: 4, charger: 'twinturbo', boostBar: 1, turboSizeHp: 500, fuel: 'race', lambda: 0.85, compression: 9, rpmLimit: 9000, muffler: 'open', catalyst: false, pipeDia: 90, flywheelKg: 6 }),
  },
];

/** Everything in the catalogue, variants included, for the designer's starting list. */
export const CATALOGUE_CHOICES = ENGINES.flatMap((e) => [
  { id: e.id, name: `${e.badge}: ${e.example}` },
  ...(ENGINE_VARIANTS[e.id]?.variants ?? []).map((v) => ({ id: `${e.id}/${v.id}`, name: `${e.badge}: ${v.name}` })),
]);

/** A plausible-to-weird random engine. `random` returns 0..1, so tests can seed it. */
export function randomDesign(random: () => number = Math.random): Design {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const between = (a: number, b: number): number => a + (b - a) * random();
  const layout = pick<DesignLayout>(['inline', 'inline', 'vee', 'vee', 'vee', 'boxer', 'flatvee', 'vr', 'w', 'rotary']);
  const fuel = pick<FuelId>(['ai92', 'ai95', 'ai98', 'ai98', 'race', 'e85', 'methanol', 'diesel']);
  const diesel = fuel === 'diesel';
  const charger = pick<ChargerKind>(['none', 'none', 'turbo', 'twinturbo', 'quadturbo', 'roots', 'centrifugal']);
  const cylinders = pick([1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16]);
  const bore = Math.round(between(55, 125));
  const stroke = Math.round(bore * between(0.6, 1.45));
  return resolveDesign({
    ...DEFAULT_DESIGN,
    name: t('Випадковий двигун'),
    layout,
    cylinders,
    veeAngle: Math.round(between(45, 150)),
    narrowAngle: Math.round(between(10, 24)),
    wAngle: Math.round(between(60, 100)),
    bore,
    stroke,
    rodLength: Math.round(stroke * between(1.5, 2.3)),
    compression: diesel ? Math.round(between(15, 22) * 2) / 2 : Math.round(between(8, 13.5) * 2) / 2,
    crankPreset: pick(['even', 'even', 'even', 'flat', 'cross', 'bigbang']),
    throws: [],
    valvetrain: pick(['dohc', 'dohc', 'sohc', 'ohv']),
    valvesPerCyl: pick([2, 3, 4, 4, 5]),
    intakeValve: bore * 0.4,
    exhaustValve: bore * 0.34,
    lift: bore * 0.12,
    intakeDuration: Math.round(between(215, 300)),
    exhaustDuration: Math.round(between(215, 295)),
    lobeSeparation: Math.round(between(102, 118)),
    springForce: Math.round(between(450, 1300)),
    flywheelKg: Math.round(between(3, 25)),
    balanceShafts: pick([0, 0, 1, 2]),
    charger,
    boostBar: Math.round(between(0.3, 2) * 10) / 10,
    turboSizeHp: Math.round(between(120, 600)),
    intercooler: Math.round(between(0, 0.9) * 10) / 10,
    fuel,
    lambda: diesel ? Math.round(between(1.3, 2) * 10) / 10 : Math.round(between(0.82, 1.05) * 100) / 100,
    rpmLimit: diesel ? Math.round(between(3000, 5000) / 100) * 100 : Math.round(between(5000, 10500) / 100) * 100,
    runnerLength: Math.round(between(120, 520)),
    headerLength: Math.round(between(250, 1100)),
    headerSpread: random() < 0.25 ? between(0.2, 0.6) : 0,
    collector: random() < 0.5 ? 'single' : 'bybank',
    muffler: pick<Muffler>(['road', 'sport', 'open']),
    catalyst: random() < 0.5,
  });
}
