// Starting points of the suspension designer (suspensions plan, the designer's presets and links): the real cars of the catalogue,
// typical cars of five kinds, deliberately odd ones that P8b's diagnoses should catch, and a random one from a seed.
// Presets that need other spring and damper kinds (P14-core) come with that stage; the steering group (P13-core) brought
// a steered live axle to the front, which the random designs pick too.
//
// The typical and odd presets are not real cars: masses, sizes and centres of mass are estimates of their class, the
// geometry the templates' typical geometry, every number illustrative. The Corvair swing axle preset is a rear-engined car on
// a swing axle in the spirit of the 1960–63 Corvair, not that car's data. Each design is resolved when first asked for,
// so loading the presets builds nothing.

import { t } from '../i18n/t.ts';
import { CARS } from '../data/cars.ts';
import { resolveChassis } from './constraints.ts';
import { DEFAULT_CAR, typicalAxle } from './defaults.ts';
import {
  DAMPER_CHOICES, designOf, FRONT_LAYOUTS, isDriven, KNUCKLES, REAR_LAYOUTS, SOLID_LATERALS, STEERING_ASSISTS,
  STEERING_GEARS, TYRES, type AxleEnd, type AxleParams, type CarParams, type ChassisDesign, type DesignLayout, type Drive,
} from './design.ts';
import { CHASSIS_CATALOGUE } from './catalogue.ts';

export interface ChassisPreset {
  id: string;
  name: string;
  /** One sentence on what the preset is for. */
  note: string;
  kind: 'catalogue' | 'typical' | 'odd';
  /** The design, resolved on first call. */
  design: () => ChassisDesign;
}

const once = (make: () => ChassisDesign): (() => ChassisDesign) => {
  let made: ChassisDesign | null = null;
  return () => (made ??= resolveChassis(make()));
};

/** A design from the car, two layouts and patches of each axle over that layout's typical values. */
function build(car: Partial<CarParams>, front: DesignLayout, rear: DesignLayout, f: Partial<AxleParams> = {}, r: Partial<AxleParams> = {}): ChassisDesign {
  return designOf({ ...DEFAULT_CAR, ...car }, { ...typicalAxle(front, 'F'), ...f }, { ...typicalAxle(rear, 'R'), ...r });
}

export const CATALOGUE_PRESETS: readonly ChassisPreset[] = CHASSIS_CATALOGUE.map((entry) => ({
  id: entry.id,
  // A make and model reads the same in both languages.
  name: CARS[entry.id]!.name,
  note: t('Справжнє авто каталогу: компоновка, маси й розміри від виробника, а точки кріплення, пружини й амортизатори типові.'),
  kind: 'catalogue',
  design: once(() => entry.design),
}));

export const TYPICAL_PRESETS: readonly ChassisPreset[] = [
  {
    id: 'comfort-sedan',
    name: t('Комфортний седан'),
    note: t('Задній привід, подвійні важелі спереду й багаторичажна ззаду, м\'які амортизатори.'),
    kind: 'typical',
    design: once(() =>
      build(
        { massKg: 1650, frontShare: 0.52, cgHeightMm: 560, wheelbaseMm: 2900, drive: 'rwd' },
        'double-wishbone',
        'multilink',
        { trackMm: 1600, tyreWidthMm: 225, tyreAspect: 55, rimIn: 17, barMm: 24 },
        { trackMm: 1610, tyreWidthMm: 225, tyreAspect: 55, rimIn: 17, barMm: 18 },
      ),
    ),
  },
  {
    id: 'hot-hatch',
    name: t('Хот-хетч'),
    note: t('Передній привід, стійки спереду й скручувана балка ззаду, спортивні амортизатори.'),
    kind: 'typical',
    design: once(() =>
      build(
        { massKg: 1250, frontShare: 0.62, cgHeightMm: 550, wheelbaseMm: 2500, drive: 'fwd' },
        'macpherson',
        'twist-beam',
        { trackMm: 1460, tyreWidthMm: 225, tyreAspect: 40, rimIn: 18, barMm: 20, damper: 'sport', camberDeg: -1 },
        { trackMm: 1440, tyreWidthMm: 225, tyreAspect: 40, rimIn: 18, barMm: 0, damper: 'sport', camberDeg: -1.5 },
      ),
    ),
  },
  {
    id: 'roadster',
    name: t('Родстер'),
    note: t('Легкий задньопривідний на подвійних важелях, центр мас низько, вага порівну.'),
    kind: 'typical',
    design: once(() =>
      build(
        { massKg: 1100, frontShare: 0.5, cgHeightMm: 460, wheelbaseMm: 2310, drive: 'rwd' },
        'double-wishbone',
        'double-wishbone',
        { trackMm: 1500, tyreWidthMm: 205, tyreAspect: 45, rimIn: 17, barMm: 20, damper: 'sport', camberDeg: -1 },
        { trackMm: 1500, tyreWidthMm: 205, tyreAspect: 45, rimIn: 17, barMm: 12, damper: 'sport', camberDeg: -1.5 },
      ),
    ),
  },
  {
    id: 'track',
    name: t('Трековий'),
    note: t('Жорсткі пружини й стабілізатори, напівсліки, великий від\'ємний розвал.'),
    kind: 'typical',
    design: once(() =>
      build(
        { massKg: 1250, frontShare: 0.45, cgHeightMm: 450, wheelbaseMm: 2450, drive: 'rwd', tyre: 'semi' },
        'double-wishbone',
        'double-wishbone',
        { trackMm: 1600, tyreWidthMm: 255, tyreAspect: 35, rimIn: 18, springNmm: 140, damper: 'track', barMm: 30, camberDeg: -2.5 },
        { trackMm: 1580, tyreWidthMm: 285, tyreAspect: 30, rimIn: 18, springNmm: 160, damper: 'track', barMm: 22, camberDeg: -1.8 },
      ),
    ),
  },
  {
    id: 'leaf-offroader',
    name: t('Позашляховик на ресорах'),
    note: t('Високий і важкий: подвійні важелі спереду, нерозрізний міст на ресорах ззаду.'),
    kind: 'typical',
    design: once(() =>
      build(
        { massKg: 2100, frontShare: 0.55, cgHeightMm: 750, wheelbaseMm: 3000, drive: 'rwd' },
        'double-wishbone',
        'live-axle',
        { trackMm: 1540, tyreWidthMm: 265, tyreAspect: 70, rimIn: 16, barMm: 28, unsprungKg: 55 },
        { trackMm: 1550, tyreWidthMm: 265, tyreAspect: 70, rimIn: 16, barMm: 0, solidLateral: 'leaf', unsprungKg: 80 },
      ),
    ),
  },
];

export const ODD_PRESETS: readonly ChassisPreset[] = [
  {
    id: 'too-soft',
    name: t('Надто м\'яка'),
    note: t('Пружини на межі й зношені амортизатори: кузов розгойдується й пробиває відбійники.'),
    kind: 'odd',
    design: once(() => build({}, 'macpherson', 'multilink', { springNmm: 1, damper: 'worn', barMm: 0 }, { springNmm: 1, damper: 'worn', barMm: 0 })),
  },
  {
    id: 'bump-steer',
    name: t('Кермо смикає'),
    note: t('Внутрішній шарнір рульової тяги піднято на 30 мм: колесо підрулює на кожній нерівності.'),
    kind: 'odd',
    design: once(() => build({}, 'double-wishbone', 'multilink', { tieRodDzMm: 30 })),
  },
  {
    id: 'high-roll-centre',
    name: t('Високий центр крену'),
    note: t('Внутрішні опори важелів підняті: центр крену вище 300 мм, кузов підкидає в повороті.'),
    kind: 'odd',
    design: once(() => build({}, 'double-wishbone', 'multilink', { upperAngleDeg: 10, lowerPivotZMm: 230 })),
  },
  {
    id: 'corvair-swing-axle',
    name: t('Хитний міст Corvair'),
    note: t('Двигун ззаду, хитний міст: на відбої колесо йде в позитивний розвал. Числа типові, не самого Corvair.'),
    kind: 'odd',
    design: once(() =>
      build(
        { massKg: 1150, frontShare: 0.38, cgHeightMm: 520, wheelbaseMm: 2700, drive: 'rwd', tyre: 'classic' },
        'double-wishbone',
        'swing-axle',
        { trackMm: 1380, tyreWidthMm: 165, tyreAspect: 80, rimIn: 13, barMm: 0 },
        { trackMm: 1380, tyreWidthMm: 165, tyreAspect: 80, rimIn: 13, barMm: 0 },
      ),
    ),
  },
];

export const CHASSIS_PRESETS: readonly ChassisPreset[] = [...CATALOGUE_PRESETS, ...TYPICAL_PRESETS, ...ODD_PRESETS];

/** A preset by id, or undefined. */
export const chassisPreset = (id: string): ChassisPreset | undefined => CHASSIS_PRESETS.find((p) => p.id === id);

/** mulberry32: a seeded random of 0..1, so a random design can be shared by its seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A plausible-to-weird random design, resolved. `random` returns 0..1, so tests and links can seed it. */
export function randomChassis(random: () => number = Math.random): ChassisDesign {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const between = (a: number, b: number): number => a + (b - a) * random();
  const drive: Drive = pick(['fwd', 'rwd', 'awd'] as const);
  const front = pick(FRONT_LAYOUTS);
  let rear: DesignLayout = pick(REAR_LAYOUTS);
  if (rear === 'twist-beam' && isDriven(drive, 'R')) rear = 'multilink';
  const axle = (layout: DesignLayout, end: AxleEnd): AxleParams => {
    const a = typicalAxle(layout, end);
    const k = (lo: number, hi: number): number => between(lo, hi);
    return {
      ...a,
      trackMm: k(1250, 1750),
      knuckle: pick(KNUCKLES),
      kingpinOffsetMm: k(10, 55),
      kpiDeg: a.kpiDeg + k(-4, 4),
      casterDeg: end === 'F' ? k(1, 10) : k(-2, 2),
      scrubMm: k(-20, 60),
      lowerArmMm: a.lowerArmMm * k(0.75, 1.25),
      upperArmMm: a.upperArmMm * k(0.75, 1.25),
      upperAngleDeg: a.upperAngleDeg + k(-8, 8),
      lowerPivotZMm: a.lowerPivotZMm + k(-40, 40),
      lowerBallZMm: a.lowerBallZMm + k(-30, 40),
      upperBallZMm: a.upperBallZMm + k(-60, 30),
      svAngleDeg: k(-3, 12),
      tieRodDzMm: random() < 0.2 ? k(-30, 30) : 0,
      sweepDeg: layout === 'semi-trailing' ? k(5, 40) : a.sweepDeg,
      pivotArmMm: layout === 'swing-axle' ? 0 : k(250, 600),
      pivotYMm: layout === 'swing-axle' ? k(70, 200) : k(120, 400),
      pivotDzMm: k(-60, 100),
      pivotSvDeg: k(-6, 6),
      beamPos: k(0, 1),
      shearDzMm: k(-60, 60),
      beamArmMm: k(350, 650),
      beamBushInMm: k(20, 200),
      beamBushDzMm: k(-50, 50),
      beamTorsionNmRad: k(0, 8000),
      solidLateral: pick(SOLID_LATERALS),
      solidLinks: random() < 0.5 ? 'four' : 'three',
      lowerLinkMm: k(400, 800),
      upperLinkMm: k(300, 700),
      linkAngleDeg: k(-10, 10),
      upperLinkAngleDeg: k(-10, 10),
      lateralZMm: k(250, 550),
      diffOutputYMm: k(80, 350),
      diffOutputDzMm: k(-60, 60),
      camberDeg: k(-3, 0.5),
      toeDeg: k(-0.4, 0.4),
      springNmm: random() < 0.5 ? null : k(10, 200),
      damper: pick(DAMPER_CHOICES),
      damperCompression: k(800, 6000),
      damperRebound: k(1500, 12000),
      damperKneeMs: k(0.05, 0.3),
      damperHighRatio: k(0.2, 1.2),
      barMm: random() < 0.3 ? 0 : k(12, 35),
      barWallMm: random() < 0.7 ? 0 : k(2, 6),
      barArmMm: k(150, 300),
      unsprungKg: k(25, 70),
      tyreWidthMm: k(155, 335),
      tyreAspect: k(25, 75),
      rimIn: Math.round(k(14, 21)),
      brakeInboard: random() < 0.1,
      // A live axle's rack becomes a box in resolveChassis.
      steeringGear: pick(STEERING_GEARS),
      rackMmPerRev: k(35, 100),
      boxRatio: k(12, 24),
      variableRatio: random() < 0.6 ? 1 : k(0.8, 1.5),
      assist: pick(STEERING_ASSISTS),
      ackermann: random() < 0.5 ? null : k(-0.3, 1.3),
      dragLinkDeg: random() < 0.5 ? 0 : k(-20, 20),
    };
  };
  return resolveChassis(
    designOf(
      {
        car: null,
        massKg: between(700, 2800),
        frontShare: between(0.35, 0.65),
        cgHeightMm: between(380, 850),
        wheelbaseMm: between(2100, 3300),
        drive,
        brakeFront: between(0.55, 0.8),
        driveFront: between(0.3, 0.7),
        finalDrive: between(2.5, 4.8),
        tyre: pick(TYRES),
      },
      axle(front, 'F'),
      axle(rear, 'R'),
    ),
  );
}

