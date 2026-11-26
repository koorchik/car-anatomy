// The suspension pages and their travel scene in numbers (stage P4): the cars are designs that resolve, their links
// agree with the pages, and the scene's lessons hold on the pages' own corners: a MacPherson strut's camber turns
// back inside its travel and a double wishbone's does not, 10 mm of inner tie-rod height tilts the toe curve, and the
// five links of a multilink each take one freedom away.

import { describe, expect, it } from 'vitest';
import { CARS } from '../src/data/cars.ts';
import { CG_HEIGHT_ESTIMATE_M } from '../src/vehicle/car.ts';
import { engineById } from '../src/data/engines.ts';
import { SUSPENSION_CAR_LINKS } from '../src/data/suspension-links.ts';
import { pageCar, SUSPENSION_PAGES, suspensionPage } from '../src/data/suspensions.ts';
import { resolveChassis } from '../src/suspension-designer/constraints.ts';
import { AXLE_KEYS, CAR_KEYS } from '../src/suspension-designer/design.ts';
import { pageCorner } from '../src/suspension-designer/page-cars.ts';
import { buildAxle } from '../src/suspension/kinematics.ts';
import { factorySetup, resolveCorner } from '../src/suspension/setup.ts';
import { camberGainLeft, camberReversal, curveAt, freeMotions, jointRange, linkRows, toeRodOf, travelCurves, withInnerToeShift } from '../src/suspension/travel-curves.ts';

const DESIGN_KEYS = new Set<string>([...CAR_KEYS, ...AXLE_KEYS.flatMap((k) => [`${k}F`, `${k}R`])]);
/** Subjects of an unverified fact that are not a design key. */
const SUBJECTS = new Set(['tyre size', 'suspension layout']);

describe('the suspension pages', () => {
  it('list every car of the link table on its page, and nothing else', () => {
    const onPages = SUSPENSION_PAGES.flatMap((p) => p.cars.map((c) => c.link));
    expect(onPages).toEqual([...SUSPENSION_CAR_LINKS].sort((a, b) => SUSPENSION_PAGES.findIndex((p) => p.id === a.page) - SUSPENSION_PAGES.findIndex((p) => p.id === b.page)));
    for (const link of SUSPENSION_CAR_LINKS) {
      const page = suspensionPage(link.page)!;
      expect(pageCar(page, link.car)?.link).toBe(link);
    }
  });

  it.each(SUSPENSION_CAR_LINKS.map((l) => [l.car, l] as const))('%s is a design that resolves to itself, with its layout on the axle shown', (_id, link) => {
    const car = pageCar(suspensionPage(link.page)!, link.car)!;
    expect(car.design.car).toBe(Object.hasOwn(CARS, link.car) ? link.car : null);
    expect(resolveChassis(car.design)).toEqual(car.design);
    const corner = pageCorner(suspensionPage(link.page)!, car);
    expect(corner.axle.layout).toBe(link.page);
    if (link.engine !== null) expect(engineById(link.engine), link.engine).toBeDefined();
    for (const key of car.unverified) expect(DESIGN_KEYS.has(key) || SUBJECTS.has(key), key).toBe(true);
    // A centre of mass nobody measured is the typical estimate, and the article says so.
    if (car.design.cgHeightMm === Math.round(CG_HEIGHT_ESTIMATE_M * 1000)) expect(car.unverified).toContain('cgHeightMm');
    expect(car.sources.length).toBeGreaterThan(0);
    expect(car.facts.length).toBeGreaterThan(0);
  });

  it.each(SUSPENSION_PAGES.flatMap((p) => [null, ...p.cars].map((c) => [`${p.id}/${c?.link.car ?? 'page'}`, p, c] as const)))(
    '%s resolves with its factory setup and lowered by 40 mm',
    (_name, page, car) => {
      const corner = pageCorner(page, car);
      const factory = factorySetup(corner);
      expect(resolveCorner(corner, factory).staticTravelM).toBeCloseTo(0, 12);
      expect(resolveCorner(corner, { ...factory, rideHeightM: -0.04 }).staticTravelM).toBeCloseTo(0.04, 9);
    },
  );
});

describe('the travel scene', () => {
  const macpherson = buildAxle(pageCorner(suspensionPage('macpherson')!, null).axle);
  const wishbone = pageCorner(suspensionPage('double-wishbone')!, null);

  it('turns the strut camber back inside its travel, and the double wishbone keeps gaining', () => {
    const strut = travelCurves(macpherson);
    const turn = camberReversal(strut)!;
    expect(turn).toBeGreaterThan(0.04);
    expect(turn).toBeLessThan(macpherson.spec.travel.bumpM - 0.02);
    // Past the turn the camber goes back toward positive: visible on the curve and the laser.
    expect(curveAt(strut, 'camber', macpherson.spec.travel.bumpM) - curveAt(strut, 'camber', turn)).toBeGreaterThan(0.5);
    // Lowered by 40 mm, the strut has less camber left to gain before it turns.
    expect(Math.abs(camberGainLeft(strut, 0.04))).toBeLessThan(Math.abs(camberGainLeft(strut, 0)) / 3);
    for (const page of ['double-wishbone', 'multilink']) {
      for (const car of [null, ...suspensionPage(page)!.cars]) {
        const c = travelCurves(buildAxle(pageCorner(suspensionPage(page)!, car).axle));
        expect(camberReversal(c), `${page}/${car?.link.car}`).toBeNull();
        for (let i = 1; i < c.camberDeg.length; i++) expect(c.camberDeg[i]!, `${page} at ${c.travel[i]}`).toBeLessThan(c.camberDeg[i - 1]!);
      }
    }
  });

  it('tilts the toe curve when the inner tie-rod joint moves 10 mm, and keeps the toe at design', () => {
    for (const spec of [macpherson.spec, wishbone.axle]) {
      const before = travelCurves(buildAxle(spec));
      const after = travelCurves(buildAxle(withInnerToeShift(spec, 0.01)));
      expect(Math.abs(curveAt(after, 'toe', 0))).toBeLessThan(1e-3);
      const tilt = (c: typeof before) => curveAt(c, 'toe', 0.05) - curveAt(c, 'toe', -0.05);
      // Tenths of a degree over 25 mm (suspensions plan, step 6): more than 0.5° across ±50 mm.
      expect(Math.abs(tilt(after) - tilt(before))).toBeGreaterThan(0.5);
    }
    expect(toeRodOf(suspensionPage('multilink')!.base.corner().axle)?.id).toBe('toe-link');
  });

  it('frees one more motion for every link of a five-link taken away', () => {
    const axle = buildAxle(pageCorner(suspensionPage('multilink')!, null).axle);
    const links = linkRows(axle.spec).map((l) => l.id);
    expect(links).toHaveLength(5);
    const dofs = links.map((_, i) => freeMotions(axle, 0, links.slice(0, i)).length);
    expect([...dofs, freeMotions(axle, 0, links).length]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('gives the joints of a driven corner within their limits on the travel, and the outer joint bends more on lock', () => {
    const straight = jointRange(macpherson, 0)!;
    expect(straight.plunge[0]).toBeLessThan(0);
    expect(straight.plunge[1]).toBeGreaterThan(0);
    expect(straight.innerDeg).toBeLessThan(straight.limits.innerDeg);
    expect(jointRange(macpherson, 0.04)!.outerDeg).toBeGreaterThan(straight.outerDeg + 5);
    expect(jointRange(buildAxle(wishbone.axle), 0)).toBeNull();
  });
});

describe('the engine articles', () => {
  it('name the suspension page of each car with that engine, and link to the car on it', async () => {
    const { articleHtml } = await import('../src/ui/article.ts');
    const { buildEngine } = await import('../src/engine/kinematics.ts');
    const html = (id: string): string => articleHtml(buildEngine(engineById(id)!));
    expect(html('b4/gr86-fa24')).toContain('href="#/suspensions/double-wishbone/subaru-brz-zd8"');
    expect(html('i4/civic-type-r-k20c1')).toContain('href="#/suspensions/macpherson/civic-type-r-fk8"');
    expect(html('i6/toyota-supra-b58')).toContain('href="#/suspensions/multilink/toyota-gr-supra-a90"');
    expect(html('i4')).not.toContain('#/suspensions/');
    for (const link of SUSPENSION_CAR_LINKS.filter((l) => l.engine)) expect(html(link.engine!)).toContain(`#/suspensions/${link.page}/${link.car}`);
  });
});
