// The cars the roll scene turns (stage P7): a suspension page's real car is its own design (page-cars.ts); a page's own
// corner stands on a typical car of its kind, the hot hatch of the research for the strut and the typical rear-driven
// car for the double wishbone and the multilink. The scene changes only the anti-roll bars (none, the car's own, a thick
// one, or a diameter), so a car keeps its axles' tables between them, and the whole car gets its VehicleBody from NHTSA
// where NHTSA measured it.
//
// The hot hatch (docs/research/suspensions.md, 13.2; the designer's preset): 1250 kg, 62 % in front, centre of mass at
// 0.55 m, the JTEKT strut in front with a 20 mm bar. Its twist beam has no 3D yet (stage P6a builds it), so until then
// the scene puts the typical multilink at its rear, with no bar of its own, as the beam's car has; every number an
// estimate.

import type { Chassis } from '../suspension/chassis.ts';
import { buildChassis } from '../suspension/chassis.ts';
import { ChassisAxle } from '../suspension/chassis-axle.ts';
import type { AnyAxleLinkage, AxleSpec, ChassisSpec, SwayBarSpec } from '../suspension/spec.ts';
import { NHTSA_CARS } from '../vehicle/body-estimate.ts';
import { catalogueChassis } from './catalogue.ts';
import { resolveChassis } from './constraints.ts';
import { DEFAULT_CAR, typicalAxle } from './defaults.ts';
import { axleOf, designOf, withAxle, type AxleEnd, type ChassisDesign } from './design.ts';
import { TYPICAL_RWD, type PageCar, type SuspensionPage } from './page-cars.ts';

/** A bar as the scene offers it: none, the car's own, a thick one (THICK_BAR_MM), or a diameter in mm. */
export type BarChoice = 'none' | 'factory' | 'thick' | number;

/** The thick bar: 26 mm, the size the chassis tests and the research's hot hatch use (docs/suspension-model.md). */
export const THICK_BAR_MM = 26;
/** Diameters the number field takes, mm: the designer's range (constraints.ts), 0 for none. */
export const BAR_RANGE_MM: readonly [number, number] = [10, 40];

/** The research's hot hatch with the typical multilink in place of its twist beam (see the header). */
export const ROLL_HOT_HATCH: ChassisDesign = Object.freeze(
  resolveChassis(
    designOf(
      { ...DEFAULT_CAR, massKg: 1250, frontShare: 0.62, cgHeightMm: 550, wheelbaseMm: 2500, drive: 'fwd' },
      { ...typicalAxle('macpherson', 'F'), trackMm: 1460, tyreWidthMm: 225, tyreAspect: 40, rimIn: 18, barMm: 20, damper: 'sport', camberDeg: -1 },
      { ...typicalAxle('multilink', 'R'), trackMm: 1440, tyreWidthMm: 225, tyreAspect: 40, rimIn: 18, barMm: 0, damper: 'sport', camberDeg: -1.5 },
    ),
  ),
);

/** The car of a page's own corner in the roll scene. */
export const rollBaseDesign = (page: SuspensionPage): ChassisDesign => (page.id === 'macpherson' ? ROLL_HOT_HATCH : TYPICAL_RWD);

/** The design the scene turns for a page and car, before its bars change. */
export const rollDesignOf = (page: SuspensionPage, car: PageCar | null): ChassisDesign => (car ? car.design : rollBaseDesign(page));

/** The diameter a choice gives on one end of a design, mm (0: none). */
export function barMmOf(design: ChassisDesign, end: AxleEnd, choice: BarChoice): number {
  if (choice === 'factory') return axleOf(design, end).barMm;
  if (choice === 'none') return 0;
  if (choice === 'thick') return THICK_BAR_MM;
  return choice < BAR_RANGE_MM[0] / 2 ? 0 : Math.min(BAR_RANGE_MM[1], Math.max(BAR_RANGE_MM[0], Math.round(choice)));
}

/** The design with the bars the scene chose. */
export function withBars(design: ChassisDesign, front: BarChoice, rear: BarChoice): ChassisDesign {
  const f = barMmOf(design, 'F', front);
  const r = barMmOf(design, 'R', rear);
  if (f === axleOf(design, 'F').barMm && r === axleOf(design, 'R').barMm) return design;
  return withAxle(withAxle(design, 'F', { barMm: f }), 'R', { barMm: r });
}

/** NHTSA rows of the scene's cars that NHTSA measured (body-estimate.ts): the 190 of 1987 is the W201. */
const NHTSA_ROW: Record<string, string> = { 'mercedes-190-w201': '1987 Mercedes 190 (V158)' };

/** Where the whole car's inertias come from in the scene. */
export type InertiaSource = 'nhtsa' | 'maker' | 'estimate';

/** The chassis spec of a design for the scene: the catalogue's, with NHTSA's inertias where NHTSA measured the car
 *  (scaled to the design's mass, as to-spec.ts scales a record's). */
export function rollSpec(design: ChassisDesign, carId: string | null): ChassisSpec {
  const spec = catalogueChassis(design);
  const row = carId ? NHTSA_CARS.find((r) => r.car === NHTSA_ROW[carId]) : undefined;
  if (!row) return spec;
  const k = design.massKg / (row.weightN / 9.80665);
  return { ...spec, body: { ...spec.body, inertia: { ixx: row.ixx * k, iyy: row.iyy * k, izz: row.izz * k, source: 'nhtsa' } } };
}

export const inertiaSource = (spec: ChassisSpec): InertiaSource => spec.body.inertia?.source ?? 'estimate';

/** Axles already tabulated, by their geometry and where their bar links sit: a bar's diameter is not in the tables. */
const AXLES = new Map<string, ChassisAxle>();
const AXLE_CACHE_MAX = 24;

function cachedAxle(axle: AxleSpec<AnyAxleLinkage>, bar: SwayBarSpec | null): ChassisAxle {
  const key = JSON.stringify([axle, bar ? [bar.link, bar.on ?? null] : null]);
  let out = AXLES.get(key);
  if (!out) {
    out = new ChassisAxle(axle, bar);
    if (AXLES.size >= AXLE_CACHE_MAX) AXLES.delete(AXLES.keys().next().value!);
    AXLES.set(key, out);
  } else if (out.bar !== bar) {
    // The same tables with this bar's own spec, so the axle reports the bar it has.
    out = Object.assign(Object.create(Object.getPrototypeOf(out) as object) as ChassisAxle, out, { bar });
  }
  return out;
}

/** The chassis of a spec, its axles' tables shared with every earlier chassis of the same geometry. */
export const rollChassis = (spec: ChassisSpec): Chassis => buildChassis(spec, { axle: cachedAxle });
