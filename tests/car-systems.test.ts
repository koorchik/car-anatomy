// Drill-down and the way back (the whole-car plan, navigation): every system of every overview car leads into its
// section's page with this car (`car=`), and «← До авто» from that page, even after the page rewrote its address,
// brings the same system back into focus.

import { describe, expect, it } from 'vitest';
import { carById } from '../src/data/cars.ts';
import { backToCar, onCar } from '../src/shell/menu-model.ts';
import { pageShown } from '../src/shell/registry.ts';
import { formatRoute, parseRoute } from '../src/shell/routes.ts';
import { OVERVIEW_CARS } from '../src/ui/car/overview-cars.ts';
import { CAR_SYSTEMS, drillTarget, focusForRoute, isCarSystem, returnFocus, type PageShown } from '../src/vehicle/car-systems.ts';

const shown: PageShown = (section, page) => pageShown(section, page);
const cases = OVERVIEW_CARS.flatMap((carId) => CAR_SYSTEMS.map((system) => [carId, system] as const));

/** The system the overview brings back after «← До авто» from `hash`, having gone in from `came`. */
const back = (hash: string, carId: string, came: string): string | null => {
  const href = backToCar(parseRoute(hash));
  if (!href) return null;
  const route = parseRoute(href);
  expect(route.section).toBe('car');
  expect(route.path[0]).toBe(carId);
  const asked = route.query.focus;
  expect(isCarSystem(asked)).toBe(true);
  return returnFocus(carById(carId)!, asked as never, came as never, shown);
};

describe('the overview drills into the sections', () => {
  it.each(cases)('%s: %s leads to a page of its section with this car', (carId, system) => {
    const car = carById(carId)!;
    const target = drillTarget(car, system, shown);
    // The brakes and the body have no section yet: their card alone explains them.
    if (system === 'brakes' || system === 'body') {
      expect(target).toBeNull();
      return;
    }
    expect(target, system).not.toBeNull();
    const route = parseRoute(formatRoute({ ...target!, path: target!.path }));
    expect(route.section).toBe(target!.section);
    expect(route.page).toBe(target!.page);
    expect(route.query.car).toBe(carId);
  });

  it.each(cases)('%s: %s comes back into focus through «← До авто»', (carId, system) => {
    const target = drillTarget(carById(carId)!, system, shown);
    if (!target) return;
    const hash = formatRoute(target);
    expect(back(hash, carId, system)).toBe(system);
  });

  it.each(cases)('%s: %s comes back into focus after the page rewrote its address', (carId, system) => {
    const target = drillTarget(carById(carId)!, system, shown);
    if (!target) return;
    // A page adds its own keys (a mode, a view, a slider's value) and may drop the layer the overview turned on.
    const { l: _layer, ...rest } = target.query;
    for (const query of [{ ...target.query, v: 'mech', m: 'dyno' }, { ...rest, x: '1' }]) {
      expect(back(formatRoute({ ...target, query }), carId, system)).toBe(system);
    }
  });

  it('names the page’s own system when the visitor did not come from the overview', () => {
    const civic = carById('civic-type-r-fk8')!;
    expect(focusForRoute(parseRoute('#/engines/i4/civic-type-r-k20c1?car=civic-type-r-fk8&l=coolant'), civic)).toBe('cooling');
    expect(focusForRoute(parseRoute('#/engines/i4/civic-type-r-k20c1?car=civic-type-r-fk8&l=coolant,oil'), civic)).toBe('engine');
    expect(focusForRoute(parseRoute('#/sump/i4?car=civic-type-r-fk8'), civic)).toBe('oil');
    expect(focusForRoute(parseRoute(`#/suspensions/${civic.suspension!.rear}?car=civic-type-r-fk8`), civic)).toBe('rear-suspension');
    expect(back('#/designer?car=civic-type-r-fk8', civic.id, 'gearbox')).toBe('engine');
  });
});

describe('«На авто»', () => {
  it.each(OVERVIEW_CARS)('%s: the pages of its engine variant and suspensions lead to it', (carId) => {
    const car = carById(carId)!;
    const hashes = [`#/engines/${car.engine}`, ...(car.suspension ? [`#/suspensions/${car.suspension.front}/${car.id}`, `#/suspensions/${car.suspension.rear}/${car.id}`] : [])];
    for (const hash of hashes) {
      const on = onCar(parseRoute(hash));
      expect(on?.name, hash).toBe(car.name);
      const route = parseRoute(on!.href);
      expect(route.section).toBe('car');
      expect(route.path[0]).toBe(carId);
      expect(route.query.focus).toBe(focusForRoute(parseRoute(hash), car));
    }
  });

  it('gives way to «← До авто» when the visitor came from the car, and says nothing on a page of no car', () => {
    expect(onCar(parseRoute('#/engines/i4/civic-type-r-k20c1?car=civic-type-r-fk8'))).toBeNull();
    expect(onCar(parseRoute('#/engines/i4'))).toBeNull();
    expect(onCar(parseRoute('#/engines/v8-cross'))).toBeNull();
  });
});
