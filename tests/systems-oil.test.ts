import { describe, expect, it } from 'vitest';
import { ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { buildEngine, type Engine } from '../src/engine/kinematics.ts';
import { systemsOf } from '../src/engine/systems-spec.ts';
import { AMBIENT_C } from '../src/systems/air.ts';
import { JET_OPEN_BAR, JET_SPAN_BAR, newOilState, oilParams, oilStep, type OilState } from '../src/systems/oil.ts';
import { viscosity, viscosityRatio } from '../src/systems/viscosity.ts';

const design = (over: Partial<Design>): Engine => {
  const d = resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
  return buildEngine(designToSpec(d, evaluate(d)));
};

const at = (engine: Engine, rpm: number, tempC: number, over: Partial<{ supply: number; running: boolean; live: boolean }> = {}): OilState => {
  const out = newOilState();
  oilStep(oilParams(engine, systemsOf(engine.spec)), { rpm, tempC, supply: 1, running: true, live: true, ...over }, out);
  return out;
};

const all = ENGINES.flatMap((page) => pageChoices(page.id).map((c) => buildEngine(engineById(c.id)!)));
/** A plain 2-litre four without jets or turbo. */
const plain = design({});
/** Size of the turbocharged EJ205 (Saab 9-2X Aero): 92 x 75 mm boxer four with piston jets. */
const ej205 = design({ layout: 'boxer', cylinders: 4, bore: 92, stroke: 75, rodLength: 130.5, charger: 'turbo', boostBar: 1, compression: 8 });
/** Size of the Toyota 1ZZ-FE: 79 x 91.5 mm inline four. */
const zz = design({ bore: 79, stroke: 91.5, rodLength: 147, rpmLimit: 6400 });

describe('oil viscosity', () => {
  it('reproduces the 5W-30 data sheet it is fitted to', () => {
    expect(viscosity(40)).toBeCloseTo(62.4, 1);
    expect(viscosity(100)).toBeCloseTo(10.54, 2);
  });

  it('thickens steeply as it cools', () => {
    expect(viscosityRatio(AMBIENT_C)).toBeGreaterThan(10);
    expect(viscosityRatio(120)).toBeLessThan(0.75);
  });
});

describe('oil pressure', () => {
  it('rises in proportion to speed below the relief valve: a positive-displacement pump into a laminar leak', () => {
    expect(at(plain, 2000, 100).pressure / at(plain, 1000, 100).pressure).toBeCloseTo(2, 1);
  });

  it('cold oil multiplies the pressure by its viscosity, until the relief valve holds it', () => {
    const hot = at(plain, 600, 100).pressure;
    const warm = at(plain, 600, 40);
    if (warm.pressure < 5) expect(warm.pressure / hot).toBeCloseTo(viscosityRatio(40), 1);
    else expect(warm.reliefOpen).toBe(true);
    const cold = at(plain, 600, AMBIENT_C);
    expect(cold.reliefOpen).toBe(true);
  });

  it('meets the figures of real engines not used to calibrate it', () => {
    // Saab 9-2X manual, EJ205 at 80 C: at least 98 kPa at 600 rpm and 294 kPa at 5000 rpm.
    expect(at(ej205, 600, 80).pressure).toBeGreaterThanOrEqual(0.98);
    expect(at(ej205, 5000, 80).pressure).toBeGreaterThanOrEqual(2.94);
    // Toyota 1ZZ-FE: 294-539 kPa at 3000 rpm, warm.
    for (const t of [80, 100]) {
      const p = at(zz, 3000, t).pressure;
      expect(p).toBeGreaterThanOrEqual(2.94);
      expect(p).toBeLessThanOrEqual(5.39);
    }
  });

  it('every engine keeps Toyota’s 29 kPa at a hot idle', () => {
    for (const e of all) expect(at(e, e.spec.idleRpm, 100).pressure, e.spec.id).toBeGreaterThanOrEqual(0.29);
  });

  it('the relief valve holds every engine within 15 % of its opening, even cold at the limiter', () => {
    for (const e of all) {
      const p = oilParams(e, systemsOf(e.spec));
      const cold = at(e, e.spec.redlineRpm, AMBIENT_C);
      expect(cold.pressure, e.spec.id).toBeLessThanOrEqual(1.15 * p.reliefBar);
      expect(cold.reliefFlow, e.spec.id).toBeGreaterThan(0);
    }
    const lower = at(plain, 5000, 100);
    const higher = at(plain, 6500, 100);
    expect(lower.reliefOpen).toBe(true);
    expect(higher.reliefFlow).toBeGreaterThan(lower.reliefFlow);
  });

  it('accounts for every litre the pump delivers', () => {
    for (const e of [plain, ej205, ...all.slice(0, 30)]) {
      for (const rpm of [0, 400, e.spec.idleRpm, 2500, e.spec.redlineRpm]) {
        for (const t of [AMBIENT_C, 60, 100, 125]) {
          const o = at(e, rpm, t);
          const sum = o.mains + o.head + o.chain + o.turbo + o.jets + o.reliefFlow;
          expect(Math.abs(sum - o.pumpFlow)).toBeLessThan(1e-9 * Math.max(1, o.pumpFlow));
        }
      }
    }
  });

  it('piston jets stay shut below their opening and only slow the rise once open', () => {
    const jets = systemsOf(ej205.spec).pistonJets;
    expect(jets).toBe(true);
    const shut = at(ej205, 500, 100);
    expect(shut.pressure).toBeLessThan(JET_OPEN_BAR);
    expect(shut.jets).toBe(0);
    // Slope of pressure against speed below the opening and once they are fully open.
    const slope = (a: number, b: number): number => (at(ej205, b, 100).pressure - at(ej205, a, 100).pressure) / (b - a);
    let below = 400;
    while (at(ej205, below + 200, 100).pressure < JET_OPEN_BAR) below += 50;
    let above = below;
    while (at(ej205, above, 100).pressure < JET_OPEN_BAR + JET_SPAN_BAR + 0.05) above += 50;
    expect(slope(above, above + 200)).toBeLessThan(slope(below - 200, below) * 0.9);
    expect(at(ej205, above, 100).jetsOpen).toBe(1);
  });

  it('a turbo gets the pressure Garrett recommends at the limiter of a hot engine', () => {
    for (const e of all.filter((x) => x.spec.aspiration.includes('turbo'))) {
      expect(at(e, e.spec.redlineRpm, 100).pressure, e.spec.id).toBeGreaterThanOrEqual(2.8);
    }
  });

  it('the pump only delivers what it can draw: the hook for the sump', () => {
    const full = at(plain, 1500, 100).pressure;
    expect(at(plain, 1500, 100, { supply: 0.5 }).pressure).toBeCloseTo(full / 2, 6);
    const starved = at(plain, 1500, 100, { supply: 0 });
    expect(starved.pressure).toBe(0);
    expect(starved.warning).toBe(true);
  });

  it('warns only about an engine the visitor is running', () => {
    expect(at(plain, 0, 90, { running: false }).pressure).toBe(0);
    expect(at(plain, 0, 90, { running: false }).warning).toBe(false);
    expect(at(plain, 1500, 100, { supply: 0, live: false }).warning).toBe(false);
  });
});
