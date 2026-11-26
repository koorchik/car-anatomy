// The suspension pages' cars as designs (build order, the rule on the suspension catalogue and the designer): a page's
// real car is a ChassisDesign, so it opens in the designer as it is and its corner comes the one way every design's
// does, catalogueChassis = chassisToSpec(resolveChassis(design)). The page shows one axle of it, the one with the page's
// layout; that axle's left corner, with the masses over it, is the CornerSpec the scenes take.
//
// What a car's record gives is written once as CarFigures (src/data/suspensions/<page>.ts); what no maker publishes
// stays typical, as catalogue.ts has it: the hardpoints (the templates' typical geometry on the car's track and tyres),
// the springs (the typical ride frequency), the dampers («comfort»), the bars (BAR_TYPICAL_MM) and the unsprung masses.

import type { CornerSpec, KnuckleKind } from '../suspension/spec.ts';
import { SPLIT_KNUCKLE_DEFAULTS } from '../suspension/templates/macpherson.ts';
import { drivingMassKg, type CarRecord } from '../vehicle/car.ts';
import { parseTyreSize } from '../vehicle/tyre-size.ts';
import { CARS } from '../data/cars.ts';
import { BAR_TYPICAL_MM, catalogueChassis } from './catalogue.ts';
import { cornerSprungKg, resolveChassis } from './constraints.ts';
import { DEFAULT_CAR, typicalAxle } from './defaults.ts';
import type { SuspensionCarLink } from '../data/suspension-links.ts';
import { designOf, isDriven, type AxleEnd, type AxleParams, type ChassisDesign, type DesignLayout, type Drive } from './design.ts';

/** The pages of the suspension section that have cars, in the order of the catalogue. */
export const SUSPENSION_PAGE_IDS = ['macpherson', 'double-wishbone', 'multilink'] as const;
export type SuspensionPageId = (typeof SUSPENSION_PAGE_IDS)[number];

/** A real car as the suspension pages know it: what its maker or a measurement gives, and what is typical. */
export interface CarFigures {
  /** The shared car id (src/data/cars.ts when the car has a record there). */
  car: string;
  /** Mass on the road with a driver, kg; share of it on the front axle; centre of mass above the road, mm (null:
   *  the typical 0.52 m of CG_HEIGHT_ESTIMATE_M). */
  massKg: number;
  frontShare: number;
  cgHeightMm: number | null;
  wheelbaseMm: number;
  trackMm: readonly [number, number];
  drive: Drive;
  /** Tyre sizes front and rear, '225/45 R17'. */
  tyres: readonly [string, string];
  layouts: readonly [DesignLayout, DesignLayout];
  /** A strut's knuckle in front; plain when left out. */
  knuckle?: KnuckleKind;
  /** Which axles carry an anti-roll bar (the typical size when the maker gives none); both when left out. */
  bars?: readonly [boolean, boolean];
}

const CG_TYPICAL_MM = 520;

/** One axle of the figures: the layout's typical geometry on the car's track and tyres. */
function figureAxle(f: CarFigures, end: AxleEnd): AxleParams {
  const i = end === 'F' ? 0 : 1;
  const size = parseTyreSize(f.tyres[i]);
  let a: AxleParams = {
    ...typicalAxle(f.layouts[i], end),
    trackMm: f.trackMm[i],
    tyreWidthMm: size.widthMm,
    tyreAspect: size.aspect,
    rimIn: size.rimIn,
    barMm: (f.bars?.[i] ?? true) ? BAR_TYPICAL_MM[end] : 0,
  };
  const knuckle = end === 'F' ? (f.knuckle ?? 'plain') : 'plain';
  if (a.layout === 'macpherson' && knuckle !== 'plain') {
    const split = SPLIT_KNUCKLE_DEFAULTS[knuckle];
    a = { ...a, knuckle, kingpinOffsetMm: Math.round(split.kingpinOffsetM * 1e6) / 1e3, kpiDeg: split.kpiDeg };
  }
  return a;
}

/** The design of a car's figures. Its `car` names the shared record when there is one (it keeps that car's road load,
 *  to-spec.ts); a car with no record yet is a design with `car: null`, as resolveChassis would make it. */
export function figuresDesign(f: CarFigures): ChassisDesign {
  // Resolved here, so the design the page holds is the one the designer opens (a small wheel moves the ball joints).
  return resolveChassis(designOf(
    { ...DEFAULT_CAR, car: Object.hasOwn(CARS, f.car) ? f.car : null, massKg: f.massKg, frontShare: f.frontShare, cgHeightMm: f.cgHeightMm ?? CG_TYPICAL_MM, wheelbaseMm: f.wheelbaseMm, drive: f.drive },
    figureAxle(f, 'F'),
    figureAxle(f, 'R'),
  ));
}

/** The figures of a shared car record, with the layouts the record does not hold yet. */
export function recordFigures(car: CarRecord, layouts: CarFigures['layouts'], extra: Partial<CarFigures> = {}): CarFigures {
  return {
    car: car.id,
    massKg: drivingMassKg(car),
    frontShare: car.body.frontShare,
    cgHeightMm: car.body.cgHeightM === null ? null : car.body.cgHeightM * 1000,
    wheelbaseMm: car.body.wheelbaseM * 1000,
    trackMm: [car.body.trackFrontM * 1000, car.body.trackRearM * 1000],
    drive: car.drive,
    tyres: [car.tyre.size, car.tyre.sizeRear ?? car.tyre.size],
    layouts,
    ...extra,
  };
}

/** The left corner of one axle of a design, with the sprung and unsprung masses over it. */
export function designCorner(design: ChassisDesign, end: AxleEnd): CornerSpec {
  const spec = catalogueChassis(design);
  const axle = end === 'F' ? spec.front : spec.rear;
  if (axle.axle.linkage.kind !== 'links') throw new Error(`The ${end} axle of ${design.car ?? 'the design'} is not a corner on links`);
  return {
    axle: { ...axle.axle, linkage: axle.axle.linkage },
    sprungKg: cornerSprungKg(design, end),
    unsprungKg: axle.unsprungKg,
    tyre: design.tyre,
    tyreRadiusM: axle.tyreRadiusM,
  };
}

/** Whether the design drives the wheels of `end`: they then have halfshafts. */
export const drivesEnd = (design: ChassisDesign, end: AxleEnd): boolean => isDriven(design.drive, end);

/** A real car on a suspension page. */
export interface PageCar {
  /** Its line in src/data/suspension-links.ts: id, name, years, the axle shown, the engine on this site. */
  link: SuspensionCarLink;
  design: ChassisDesign;
  /** What the record says of the car's suspension, for the article: visitor text, one fact a line. */
  facts: string[];
  sources: string[];
  /** Figures not confirmed by a source, as the design's keys ('trackMmF', 'frontShare') or a fact's subject. */
  unverified: string[];
}

/** A suspension page: its own corner (typical geometry, or the JTEKT's measured one) and its real cars. */
export interface SuspensionPage {
  id: SuspensionPageId;
  /** The axle the page's own corner stands for, and the corner; a function, so the page builds it only when shown. */
  base: { end: AxleEnd; corner: () => CornerSpec; geometry: 'measured' | 'typical' };
  cars: readonly PageCar[];
}

/** The corner a page shows: its own, or the axle of one of its cars. */
export function pageCorner(page: SuspensionPage, car: PageCar | null): CornerSpec {
  return car ? designCorner(car.design, car.link.end) : page.base.corner();
}

/** The typical car of the double wishbone and multilink pages: the default design driven at the rear, with a double
 *  wishbone in front and a multilink at the back, and a little more of its weight at the rear. Estimates throughout. */
export const TYPICAL_RWD: ChassisDesign = Object.freeze(
  designOf({ ...DEFAULT_CAR, drive: 'rwd', frontShare: 0.52 }, typicalAxle('double-wishbone', 'F'), typicalAxle('multilink', 'R')),
);
