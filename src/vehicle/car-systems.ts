// The systems of a car the overview tells apart (the whole-car plan, what the visitor sees, item 5), where each one
// leads, and which system a section's page is about, for the way back. A pure module without the DOM or three.js: the
// shell's menu reads it for 'Back to the car', the car section for its chips and cards, the routes' tests in Node.
//
// Drill-down. A system leads to the page of its section with this car (`car=`), when that page exists. Some sections
// are not built yet, so a system leads where the plan says it does until then: the final drive to the gearbox's page,
// the halfshafts, the steering and the wheels to the driven or front axle's suspension page. The brakes and the body
// have no section: their card alone explains them.
//
// The way back. 'Back to the car' leads to `#/car/<car>?focus=<system>`, where the system is the one the page shown is
// about (focusForRoute). Several systems share a page (the exhaust and the engine both lead to the engine's page), so
// the overview remembers which one the visitor came from and, when the address names the page's system, brings that
// one back (returnFocus).

import type { CarRecord } from './car.ts';

export type CarSystem =
  | 'engine'
  | 'gearbox'
  | 'final-drive'
  | 'halfshafts'
  | 'front-suspension'
  | 'rear-suspension'
  | 'steering'
  | 'wheels'
  | 'brakes'
  | 'exhaust'
  | 'oil'
  | 'cooling'
  | 'fuel'
  | 'air'
  | 'body';

/** In the order of the chips under the car's name (the plan's list), the body last. */
export const CAR_SYSTEMS: readonly CarSystem[] = [
  'engine',
  'gearbox',
  'final-drive',
  'halfshafts',
  'front-suspension',
  'rear-suspension',
  'steering',
  'wheels',
  'brakes',
  'exhaust',
  'oil',
  'cooling',
  'fuel',
  'air',
  'body',
];

export const isCarSystem = (value: string | undefined | null): value is CarSystem => !!value && (CAR_SYSTEMS as readonly string[]).includes(value);

/** A route as the router takes it (router.ts RouteTarget), without importing the shell. */
export interface SystemTarget {
  section: 'engines' | 'gearboxes' | 'suspensions';
  page: string;
  path: string[];
  query: Record<string, string>;
}

/** Whether a page of a section can be opened now (the shell's pageShown, by the id in its address). */
export type PageShown = (section: 'gearboxes' | 'suspensions', page: string) => boolean;

/** The engines' systems layer each system of the engine bay opens (`l=`). */
const LAYER: Partial<Record<CarSystem, string>> = { cooling: 'coolant', fuel: 'fuel', air: 'air' };

/** The driven axle's end; the front for an all-wheel-drive car, whose front axle the overview steers too. */
const drivenEnd = (car: CarRecord): 'front' | 'rear' => (car.drive === 'rwd' ? 'rear' : 'front');

/**
 * Where a system of this car leads: its section's page with the car in `car=`, or null when the system has no section
 * (the brakes, the body) or its page cannot be opened yet.
 */
export function drillTarget(car: CarRecord, system: CarSystem, shown: PageShown): SystemTarget | null {
  const query = { car: car.id };
  const engine = car.engine.split('/');
  const suspension = (end: 'front' | 'rear'): SystemTarget | null => {
    const page = car.suspension?.[end];
    return page && shown('suspensions', page) ? { section: 'suspensions', page: 'catalogue', path: [page, car.id], query } : null;
  };
  const gearbox = (): SystemTarget | null => {
    const path = car.gearbox?.split('/');
    return path && shown('gearboxes', path[0]!) ? { section: 'gearboxes', page: 'catalogue', path, query } : null;
  };
  switch (system) {
    case 'engine':
    case 'exhaust':
      // The exhaust's sound is the engine's: its article says how the pipes shape it.
      return { section: 'engines', page: 'catalogue', path: engine, query };
    case 'oil':
      return { section: 'engines', page: 'sump', path: engine, query };
    case 'cooling':
    case 'fuel':
    case 'air':
      return { section: 'engines', page: 'catalogue', path: engine, query: { l: LAYER[system]!, ...query } };
    case 'gearbox':
    case 'final-drive':
      return gearbox();
    case 'halfshafts':
      return suspension(drivenEnd(car)) ?? gearbox();
    case 'front-suspension':
    case 'steering':
    case 'wheels':
      return suspension('front');
    case 'rear-suspension':
      return suspension('rear');
    case 'brakes':
    case 'body':
      return null;
  }
}

/** What focusForRoute needs of a route (routes.ts Route). */
export interface RouteLike {
  section: string;
  page: string;
  path: readonly string[];
  query: Readonly<Record<string, string>>;
}

/** The engines' layer of a route, when exactly one is on: the system of the bay it belongs to. */
const LAYER_SYSTEM: Record<string, CarSystem> = { oil: 'oil', coolant: 'cooling', fuel: 'fuel', air: 'air' };

/**
 * The system of `car` a page is about, for 'Back to the car': the engine for its pages and the designer, the oil for
 * the oil on track, the system of a layer when one alone is on, the gearbox, and the front or rear suspension by which
 * end of the car the page's layout is. Null for a page about none of them.
 */
export function focusForRoute(route: RouteLike, car: CarRecord | undefined): CarSystem | null {
  switch (route.section) {
    case 'engines': {
      if (route.page === 'sump') return 'oil';
      const layers = (route.query.l ?? '').split(',').filter((l) => l in LAYER_SYSTEM);
      return layers.length === 1 ? LAYER_SYSTEM[layers[0]!]! : 'engine';
    }
    case 'gearboxes':
      return 'gearbox';
    case 'suspensions': {
      const page = route.path[0];
      return car?.suspension && page === car.suspension.rear && page !== car.suspension.front ? 'rear-suspension' : 'front-suspension';
    }
    default:
      return null;
  }
}

/**
 * The system to bring back into focus: the one the visitor drilled in from (`came`), when the address names the
 * system of the page it led to; otherwise the address's own.
 */
export function returnFocus(car: CarRecord, asked: CarSystem, came: CarSystem | null, shown: PageShown): CarSystem {
  if (!came || came === asked) return asked;
  const target = drillTarget(car, came, shown);
  return target && focusForRoute(target, car) === asked ? came : asked;
}
