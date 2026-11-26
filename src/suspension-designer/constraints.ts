// Which values a parameter may take, given the others, and resolveChassis, which moves a design inside those limits
// (suspensions plan, the designer's geometric limits). These are the limits of geometry and of a buildable model: past them the
// parts would collide, the linkage would not assemble, or the car could not stand on its springs. Poor engineering is
// allowed and diagnosed later (P8b).
//
// resolveChassis is pure and idempotent, and it takes anything: a design from someone else's link may carry unknown
// keys, wrong types, numbers out of range or a prototype. Every field is read from the input's own properties, checked
// for type, and clamped in an order where each limit depends only on fields already clamped, so a second pass changes
// nothing. Then each axle is built (geometry.ts, cached); one that does not assemble over its travel gets its layout's
// typical geometry, then the typical tyre and track, then the typical axle of its end. No text here: a limit names its
// reason with a code (LimitReason), and the page words it.

import { CARS } from '../data/cars.ts';
import { tyreVertical } from '../vehicle/tyre-data.ts';
import {
  AXLE_KEYS, CAR_KEYS, DAMPER_CHOICES, DRIVES, FRONT_LAYOUTS, KNUCKLES, REAR_LAYOUTS, SOLID_LATERALS, SOLID_LINKS, TYRES,
  axleOf, isDriven, withAxle, type AxleEnd, type AxleKey, type AxleParams, type ChassisDesign, type DesignKey,
  type DesignLayout,
} from './design.ts';
import { DEFAULT_CHASSIS, layoutDefaults, typicalAxle } from './defaults.ts';
import { axleGeometryOf, rimRadiusM, wheelCentreZM, type AxleGeometry } from './geometry.ts';

/** Why a limit sits where it does when another parameter (or the model) sets it. */
export type LimitReason =
  /** An arm longer than half the track less the room for the subframe and the differential. */
  | 'subframe'
  /** The upper arm between 0.4 and 1.2 of the lower one. */
  | 'arm-ratio'
  /** Ball joints inside the rim, clear of the brake disc. */
  | 'rim'
  /** Body pivots above the road. */
  | 'ground'
  /** A tyre between 0.5 and 0.85 m across. */
  | 'tyre-size'
  /** The differential output at least 60 mm off the centre line and far enough in for a half-shaft. */
  | 'halfshaft'
  /** A spring that gives the body 0.6–6 Hz over its corners. */
  | 'ride-frequency'
  /** Unsprung corners light enough for the car to stand on its springs. */
  | 'unsprung'
  /** A swing axle has no adjuster: its wheel stays square to the shaft. */
  | 'no-adjuster'
  /** The sweep of a pivot axis is what makes the layout: fixed for a trailing arm and a swing axle. */
  | 'layout-fixed'
  /** A tube's wall thinner than half its diameter. */
  | 'bar-wall';

export interface Range {
  min: number;
  max: number;
  minWhy?: LimitReason;
  maxWhy?: LimitReason;
}

/** Numeric parameters of the car and of one axle (springNmm when it is a number). */
export type CarNumericKey = 'massKg' | 'frontShare' | 'cgHeightMm' | 'wheelbaseMm' | 'brakeFront' | 'driveFront' | 'finalDrive';
export type AxleNumericKey = {
  [K in AxleKey]: AxleParams[K] extends number ? K : AxleParams[K] extends number | null ? K : never;
}[AxleKey];

const fixed = (min: number, max: number): Range => ({ min, max });

/** Room kept beside the car's centre line for a subframe and a differential, from the wheel centre inward, mm. */
const SUBFRAME_MM = 200;
/** Clearance of a ball joint inside the rim, mm, and the least it sits above or below the hub. */
const RIM_CLEARANCE_MM = 25;
const BALL_FROM_HUB_MM = 40;
/** Lowest a body pivot may hang above the road, mm. */
const GROUND_CLEARANCE_MM = 50;
/** Plan: the differential output no nearer than 60 mm to the centre line; the half-shaft at least 300 mm long. */
const DIFF_MIN_Y_MM = 60;
const HALFSHAFT_MIN_MM = 300;
/** Tyre outer diameter, mm. */
const TYRE_MIN_MM = 500;
const TYRE_MAX_MM = 850;
/** Largest unsprung corner as a share of the car's mass. */
const UNSPRUNG_SHARE = 0.06;
/** Body ride frequencies a spring may give over its corner, Hz (plan). */
const RIDE_HZ: readonly [number, number] = [0.6, 6];

export const CAR_RANGES: Record<CarNumericKey, Range> = {
  massKg: fixed(500, 3500),
  frontShare: fixed(0.3, 0.7),
  cgHeightMm: fixed(300, 1000),
  wheelbaseMm: fixed(1800, 3800),
  brakeFront: fixed(0.4, 0.9),
  driveFront: fixed(0.1, 0.9),
  finalDrive: fixed(2, 6),
};

/** Sprung mass over one corner of an axle, kg. */
export const cornerSprungKg = (d: ChassisDesign, end: AxleEnd): number =>
  (d.massKg * (end === 'F' ? d.frontShare : 1 - d.frontShare)) / 2 - (end === 'F' ? d.unsprungKgF : d.unsprungKgR);

/**
 * Spring rate along the spring (N/m) that gives the body `hz` over the corner, with the tyre in series:
 * k_ride = m·(2πf)², k_wheel = k_ride·k_t/(k_t − k_ride), k = k_wheel/mr². A ride rate near the tyre's own is out of
 * reach; it is held at 0.9 k_t.
 */
export function springForRideHz(sprungKg: number, kt: number, mrSpring: number, hz: number): number {
  const ride = Math.min(sprungKg * (2 * Math.PI * hz) ** 2, 0.9 * kt);
  return (ride * kt) / (kt - ride) / (mrSpring * mrSpring);
}

/** Limits of a spring on an axle whose geometry is built. */
function springRange(d: ChassisDesign, end: AxleEnd, g: AxleGeometry | Error): Range {
  if (g instanceof Error) return fixed(5, 500);
  const m = cornerSprungKg(d, end);
  const kt = tyreVertical(d.tyre).ktNm;
  const at = (hz: number): number => Math.round(springForRideHz(m, kt, g.mrSpring, hz)) / 1000;
  return { min: at(RIDE_HZ[0]), max: at(RIDE_HZ[1]), minWhy: 'ride-frequency', maxWhy: 'ride-frequency' };
}

/** Limits of one axle parameter, given the others. */
export function axleRange(d: ChassisDesign, end: AxleEnd, key: AxleNumericKey): Range {
  const a = axleOf(d, end);
  const front = end === 'F';
  const half = a.trackMm / 2;
  const rimMm = rimRadiusM(a) * 1000;
  const zWMm = wheelCentreZM(a) * 1000;
  switch (key) {
    case 'trackMm':
      return fixed(1100, 1900);
    case 'tyreWidthMm':
      return fixed(135, 355);
    case 'rimIn':
      return fixed(13, 22);
    case 'tyreAspect': {
      const pct = (outer: number): number => ((outer - a.rimIn * 25.4) / (2 * a.tyreWidthMm)) * 100;
      const min = Math.max(25, pct(TYRE_MIN_MM));
      const max = Math.min(85, pct(TYRE_MAX_MM));
      return { min, max, minWhy: min > 25 ? 'tyre-size' : undefined, maxWhy: max < 85 ? 'tyre-size' : undefined };
    }
    case 'kingpinOffsetMm':
      return fixed(5, 60);
    case 'kpiDeg':
      return a.layout === 'macpherson' ? fixed(4, 14) : fixed(0, 18);
    case 'casterDeg':
      return front ? fixed(0, 12) : fixed(-5, 5);
    case 'scrubMm':
      return fixed(-40, 80);
    case 'lowerArmMm':
      return { min: 200, max: half - SUBFRAME_MM, maxWhy: 'subframe' };
    case 'upperArmMm': {
      const room = half - SUBFRAME_MM;
      const max = Math.min(1.2 * a.lowerArmMm, room);
      return { min: 0.4 * a.lowerArmMm, max, minWhy: 'arm-ratio', maxWhy: max < room ? 'arm-ratio' : 'subframe' };
    }
    case 'upperAngleDeg':
      return fixed(-15, 20);
    case 'lowerBallZMm':
      return { min: zWMm - (rimMm - RIM_CLEARANCE_MM), max: zWMm - BALL_FROM_HUB_MM, minWhy: 'rim' };
    case 'upperBallZMm':
      return { min: zWMm + BALL_FROM_HUB_MM, max: zWMm + rimMm - RIM_CLEARANCE_MM, maxWhy: 'rim' };
    case 'lowerPivotZMm': {
      const r = Math.min(150, 0.5 * a.lowerArmMm);
      const min = Math.max(GROUND_CLEARANCE_MM, a.lowerBallZMm - r);
      return { min, max: a.lowerBallZMm + r, minWhy: min > a.lowerBallZMm - r ? 'ground' : undefined };
    }
    case 'svAngleDeg':
      return fixed(-5, 20);
    case 'tieRodDzMm':
      return fixed(-40, 40);
    case 'sweepDeg':
      if (a.layout === 'trailing-arm') return { min: 0, max: 0, minWhy: 'layout-fixed', maxWhy: 'layout-fixed' };
      if (a.layout === 'swing-axle') return { min: 90, max: 90, minWhy: 'layout-fixed', maxWhy: 'layout-fixed' };
      return fixed(5, 45);
    case 'pivotArmMm':
      return a.layout === 'swing-axle' ? fixed(0, 0) : fixed(200, 700);
    case 'pivotYMm':
      return a.layout === 'swing-axle'
        ? { min: DIFF_MIN_Y_MM, max: half - HALFSHAFT_MIN_MM, minWhy: 'halfshaft', maxWhy: 'halfshaft' }
        : { min: 100, max: half - SUBFRAME_MM, maxWhy: 'subframe' };
    case 'pivotDzMm':
      return fixed(-100, 150);
    case 'pivotSvDeg':
      return fixed(-10, 10);
    case 'beamPos':
      return fixed(0, 1);
    case 'shearDzMm':
      return fixed(-100, 100);
    case 'beamArmMm':
      return fixed(300, 700);
    case 'beamBushInMm':
      return fixed(0, 250);
    case 'beamBushDzMm':
      return fixed(-80, 80);
    case 'beamTorsionNmRad':
      return fixed(0, 20000);
    case 'lowerLinkMm':
      return fixed(300, 900);
    case 'upperLinkMm':
      return fixed(250, 800);
    case 'linkAngleDeg':
    case 'upperLinkAngleDeg':
      return fixed(-15, 15);
    case 'lateralZMm':
      return fixed(200, 600);
    case 'diffOutputYMm':
      return { min: DIFF_MIN_Y_MM, max: half - HALFSHAFT_MIN_MM, minWhy: 'halfshaft', maxWhy: 'halfshaft' };
    case 'diffOutputDzMm':
      return fixed(-100, 100);
    case 'camberDeg':
      return a.layout === 'swing-axle' ? { min: 0, max: 0, minWhy: 'no-adjuster', maxWhy: 'no-adjuster' } : fixed(-4, 1);
    case 'toeDeg':
      return a.layout === 'swing-axle' ? { min: 0, max: 0, minWhy: 'no-adjuster', maxWhy: 'no-adjuster' } : fixed(-0.6, 0.6);
    case 'springNmm':
      return springRange(d, end, axleGeometryOf(a, end, d.drive));
    case 'damperCompression':
      return fixed(100, 30000);
    case 'damperRebound':
      return fixed(100, 60000);
    case 'barMm':
      return fixed(10, 45);
    case 'barWallMm': {
      const max = a.barMm > 0 ? Math.max(1.5, a.barMm / 2 - 1) : 8;
      return { min: 1.5, max, maxWhy: 'bar-wall' };
    }
    case 'barArmMm':
      return fixed(100, 350);
    case 'unsprungKg': {
      const max = Math.min(100, UNSPRUNG_SHARE * d.massKg);
      return { min: 15, max, maxWhy: max < 100 ? 'unsprung' : undefined };
    }
  }
}

/** Limits of any numeric parameter, by its key in the design ('massKg', 'springNmmR'). */
export function paramRange(d: ChassisDesign, key: DesignKey): Range {
  if (Object.hasOwn(CAR_RANGES, key)) return CAR_RANGES[key as CarNumericKey];
  const end = key.at(-1) as AxleEnd;
  return axleRange(d, end, key.slice(0, -1) as AxleNumericKey);
}

/** Axle parameters in the order resolveChassis clamps them: each limit reads only parameters before it. */
const CLAMP_ORDER = [
  'trackMm', 'tyreWidthMm', 'rimIn', 'tyreAspect', 'kingpinOffsetMm', 'kpiDeg', 'casterDeg', 'scrubMm', 'lowerArmMm',
  'upperArmMm', 'upperAngleDeg', 'lowerBallZMm', 'upperBallZMm', 'lowerPivotZMm', 'svAngleDeg', 'tieRodDzMm',
  'sweepDeg', 'pivotArmMm', 'pivotYMm', 'pivotDzMm', 'pivotSvDeg', 'beamPos', 'shearDzMm', 'beamArmMm', 'beamBushInMm',
  'beamBushDzMm', 'beamTorsionNmRad', 'lowerLinkMm', 'upperLinkMm', 'linkAngleDeg', 'upperLinkAngleDeg', 'lateralZMm',
  'diffOutputYMm', 'diffOutputDzMm', 'camberDeg', 'toeDeg', 'damperCompression', 'damperRebound', 'barMm', 'barWallMm',
  'barArmMm', 'unsprungKg',
] as const satisfies readonly AxleNumericKey[];

const clamp = (v: number, r: Range): number => Math.min(r.max, Math.max(r.min, v));
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** A field of the input, read only from its own properties. */
const own = (input: object, key: string): unknown => (Object.hasOwn(input, key) ? (input as Record<string, unknown>)[key] : undefined);

/** Every field of a design with the right type, from anything; wrong or missing fields take the default's. */
function typed(input: unknown): ChassisDesign {
  const src = typeof input === 'object' && input !== null ? input : {};
  const out = { ...DEFAULT_CHASSIS } as Record<string, unknown>;
  const base = DEFAULT_CHASSIS as unknown as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const v = own(src, key);
    const d = base[key];
    if (typeof d === 'number') out[key] = isNumber(v) ? v : d;
    else if (typeof d === 'boolean') out[key] = typeof v === 'boolean' ? v : d;
  }
  out.car = typeof own(src, 'car') === 'string' && Object.hasOwn(CARS, own(src, 'car') as string) ? own(src, 'car') : null;
  out.drive = oneOf(DRIVES, own(src, 'drive'), DEFAULT_CHASSIS.drive);
  out.tyre = oneOf(TYRES, own(src, 'tyre'), DEFAULT_CHASSIS.tyre);
  for (const end of ['F', 'R'] as const) {
    const k = (key: AxleKey): string => `${key}${end}`;
    const layouts: readonly DesignLayout[] = end === 'F' ? FRONT_LAYOUTS : REAR_LAYOUTS;
    out[k('layout')] = oneOf(layouts, own(src, k('layout')), base[k('layout')] as DesignLayout);
    out[k('knuckle')] = oneOf(KNUCKLES, own(src, k('knuckle')), 'plain');
    out[k('solidLateral')] = oneOf(SOLID_LATERALS, own(src, k('solidLateral')), 'panhard');
    out[k('solidLinks')] = oneOf(SOLID_LINKS, own(src, k('solidLinks')), 'four');
    out[k('damper')] = oneOf(DAMPER_CHOICES, own(src, k('damper')), 'comfort');
    const spring = own(src, k('springNmm'));
    out[k('springNmm')] = isNumber(spring) ? spring : null;
  }
  return out as unknown as ChassisDesign;
}

/** The axle's numbers clamped in CLAMP_ORDER (the spring is left for later). */
function clampAxle(d: ChassisDesign, end: AxleEnd): ChassisDesign {
  let out = d;
  for (const key of CLAMP_ORDER) {
    const v = axleOf(out, end)[key];
    let next: number;
    if (key === 'barMm') next = v < 5 ? 0 : clamp(v, axleRange(out, end, key));
    else if (key === 'barWallMm') next = v < 0.75 ? 0 : clamp(v, axleRange(out, end, key));
    else next = clamp(v, axleRange(out, end, key));
    if (next !== v) out = withAxle(out, end, { [key]: next });
  }
  return out;
}

/** The axle clamped and built; falls back to typical geometry, then the typical tyre and track, then the end's typical
 *  axle, until it builds. */
function buildable(d: ChassisDesign, end: AxleEnd): ChassisDesign {
  const builds = (x: ChassisDesign): boolean => !(axleGeometryOf(axleOf(x, end), end, x.drive) instanceof Error);
  let out = clampAxle(d, end);
  if (builds(out)) return out;
  const layout = axleOf(out, end).layout;
  const { unsprungKg: _unsprung, ...geometry } = layoutDefaults(layout, end);
  out = clampAxle(withAxle(out, end, geometry), end);
  if (builds(out)) return out;
  const typical = typicalAxle(layout, end);
  out = clampAxle(withAxle(out, end, { trackMm: typical.trackMm, tyreWidthMm: typical.tyreWidthMm, tyreAspect: typical.tyreAspect, rimIn: typical.rimIn }), end);
  if (builds(out)) return out;
  const fallback = end === 'F' ? 'macpherson' : isDriven(out.drive, 'R') ? 'multilink' : 'twist-beam';
  out = clampAxle(withAxle(out, end, typicalAxle(fallback, end)), end);
  if (builds(out)) return out;
  throw new Error(`The typical ${fallback} does not build on this car`);
}

/** A buildable design from anything: typed, clamped, every axle assembling over its travel. */
export function resolveChassis(input: unknown): ChassisDesign {
  let d = typed(input);
  for (const key of Object.keys(CAR_RANGES) as CarNumericKey[]) {
    const v = clamp(d[key], CAR_RANGES[key]);
    if (v !== d[key]) d = { ...d, [key]: v };
  }
  // A twist beam carries no half-shafts: a driven rear axle takes the multilink.
  if (d.layoutR === 'twist-beam' && isDriven(d.drive, 'R')) d = { ...d, layoutR: 'multilink' };
  for (const end of ['F', 'R'] as const) {
    d = buildable(d, end);
    const spring = axleOf(d, end).springNmm;
    if (spring !== null) {
      const v = clamp(spring, axleRange(d, end, 'springNmm'));
      if (v !== spring) d = withAxle(d, end, { springNmm: v });
    }
  }
  return d;
}

/** Whether two designs are the same, field by field. */
export function sameDesign(a: ChassisDesign, b: ChassisDesign): boolean {
  return [...CAR_KEYS, ...AXLE_KEYS.flatMap((k) => [`${k}F`, `${k}R`])].every((k) => (a as unknown as Record<string, unknown>)[k] === (b as unknown as Record<string, unknown>)[k]);
}
