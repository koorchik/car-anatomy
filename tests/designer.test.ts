import { describe, expect, it } from 'vitest';
import { ENGINES } from '../src/data/engines.ts';
import { decodeDesign, encodeDesign } from '../src/designer/codec.ts';
import { cylinderChoices, minRodLength, paramRange, resolveDesign, safeCounterweight, type NumericKey } from '../src/designer/constraints.ts';
import { axisAngle, balancedOrder, crankForPreset, firingFromCrank } from '../src/designer/crank.ts';
import { DEFAULT_DESIGN, displacementL, type Design, type DesignLayout } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec, ODD_PRESETS, randomDesign } from '../src/designer/presets.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { balance, buildEngine, cyclePhase, mod, pistonPin } from '../src/engine/kinematics.ts';

const seeded = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

const base = (over: Partial<Design> = {}): Design => resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
const toEngine = (d: Design) => buildEngine(designToSpec(d, evaluate(d)));

const LAYOUTS: DesignLayout[] = ['inline', 'vee', 'boxer', 'flatvee', 'vr', 'w', 'rotary'];

describe('any design resolves to something buildable', () => {
  it.each(LAYOUTS.flatMap((l) => cylinderChoices(l).map((n) => [l, n] as const)))('%s with %d cylinders', (layout, cylinders) => {
    const d = base({ layout, cylinders });
    const engine = toEngine(d);
    expect(engine.cylinders.length).toBe(layout === 'rotary' ? cylinders * 3 : cylinders);
    expect(engine.intervals.reduce((a, b) => a + b, 0)).toBeCloseTo(engine.cycle);
    if (layout !== 'rotary') {
      for (const c of engine.cylinders) {
        expect(pistonPin(engine, c, c.fire)).toBeCloseTo(engine.r + engine.l, 6);
        expect(cyclePhase(engine, c, c.fire)).toBeCloseTo(0);
      }
    }
  });

  it('survives hostile input', () => {
    const hostile = {
      ...DEFAULT_DESIGN,
      layout: 'rotary-v' as DesignLayout,
      cylinders: 999,
      bore: Number.NaN,
      stroke: -5,
      rodLength: 1,
      compression: Infinity,
      lift: 500,
      valvesPerCyl: 9 as Design['valvesPerCyl'],
      rpmLimit: 1e9,
      throws: [{ pin: 1e6, turn: 7 as 0 }],
      crankPreset: 'custom' as const,
    };
    const d = resolveDesign(hostile);
    expect(() => toEngine(d)).not.toThrow();
    expect(cylinderChoices(d.layout)).toContain(d.cylinders);
  });

  it('is idempotent', () => {
    const random = seeded(11);
    for (let i = 0; i < 60; i++) {
      const once = randomDesign(random);
      const twice = resolveDesign(once);
      expect(twice).toEqual(once);
    }
  });

  it('every random design is geometrically valid in every respect', () => {
    const random = seeded(4242);
    for (let i = 0; i < 300; i++) {
      const d = randomDesign(random);
      for (const key of ['bore', 'stroke', 'rodLength', 'veeAngle', 'intakeValve', 'exhaustValve', 'lift', 'compression', 'rotorE'] as NumericKey[]) {
        const range = paramRange(d, key);
        expect(d[key] as number).toBeGreaterThanOrEqual(range.min - 1e-9);
        expect(d[key] as number).toBeLessThanOrEqual(range.max + 1e-9);
      }
      expect(() => toEngine(d)).not.toThrow();
      expect(d.throws).toHaveLength(d.cylinders);
    }
  });
});

describe('dependent limits', () => {
  it('a longer stroke pulls the rod along', () => {
    const d = base({ stroke: 90, rodLength: 150 });
    const longer = resolveDesign({ ...d, stroke: 200 });
    expect(longer.rodLength).toBeGreaterThanOrEqual(minRodLength(longer.bore, 200));
    expect(longer.rodLength).toBeGreaterThan(150);
  });

  it('the piston skirt always clears the counterweight at bottom dead centre', () => {
    const random = seeded(77);
    for (let i = 0; i < 300; i++) {
      const d = randomDesign(random);
      if (d.layout === 'rotary') continue;
      const cw = safeCounterweight(d.bore, d.stroke, d.rodLength);
      const skirtBottom = d.rodLength - d.stroke / 2 - 0.34 * d.bore;
      expect(skirtBottom).toBeGreaterThan(cw);
    }
  });

  it('a smaller bore shrinks the valves with it', () => {
    const d = base({ bore: 100, intakeValve: 42, exhaustValve: 36 });
    const small = resolveDesign({ ...d, bore: 50 });
    expect(small.intakeValve).toBeLessThanOrEqual(50 * 0.42);
    expect(small.exhaustValve).toBeLessThanOrEqual(50 * 0.38);
    expect(small.lift).toBeLessThanOrEqual(small.intakeValve * 0.55 + 0.5);
  });

  it('valves on one cylinder fit together', () => {
    for (const valvesPerCyl of [2, 3, 4, 5] as const) {
      const d = base({ valvesPerCyl, valvetrain: 'dohc', bore: 86, intakeValve: 200, exhaustValve: 200 });
      expect(d.intakeValve).toBeLessThan(86);
      expect(d.exhaustValve).toBeLessThan(86);
      expect(d.intakeValve + d.exhaustValve).toBeLessThan(86 * 1.05);
    }
  });

  it('a big bore on a short engine forbids a narrow V, and says why', () => {
    const narrow = paramRange(base({ layout: 'vee', bore: 60, stroke: 80 }), 'veeAngle');
    const wide = paramRange(base({ layout: 'vee', bore: 160, stroke: 40 }), 'veeAngle');
    expect(wide.min).toBeGreaterThan(narrow.min);
    expect(wide.minWhy).toBeTruthy();
  });

  it('a rotor keeps a workable R/e', () => {
    const d = base({ layout: 'rotary', cylinders: 2, rotorR: 105, rotorE: 40 });
    expect(d.rotorR / d.rotorE).toBeGreaterThanOrEqual(6.2);
  });

  it('switching layouts keeps the other parameters', () => {
    const d = base({ bore: 92, compression: 11.5 });
    const rotary = resolveDesign({ ...d, layout: 'rotary', cylinders: 2 });
    const back = resolveDesign({ ...rotary, layout: 'inline', cylinders: 4 });
    expect(back.bore).toBe(92);
    expect(back.compression).toBe(11.5);
  });
});

describe('crank table', () => {
  it('derives firing from pins, including simultaneous firings', () => {
    const d = base({ cylinders: 2 });
    const plan = firingFromCrank(d, [{ pin: 0, turn: 0 }, { pin: 0, turn: 0 }]);
    expect(plan.intervals).toEqual([0, 720]);
    expect(plan.intervals.reduce((a, b) => a + b, 0)).toBe(720);
  });

  it('custom pins give exactly that crank, whatever they are', () => {
    const random = seeded(99);
    for (let i = 0; i < 40; i++) {
      const throws = Array.from({ length: 6 }, () => ({ pin: Math.round(random() * 355), turn: (random() < 0.5 ? 0 : 1) as 0 | 1 }));
      const d = base({ cylinders: 6, crankPreset: 'custom', throws });
      const engine = toEngine(d);
      expect(d.throws).toEqual(throws);
      // Relative pin angles survive the trip through the spec.
      const offset = mod(engine.cylinders.find((c) => c.n === 1)!.pin - throws[0]!.pin, 360);
      for (const c of engine.cylinders) {
        const diff = mod(c.pin - throws[c.n - 1]!.pin - offset, 360);
        expect(Math.min(diff, 360 - diff)).toBeLessThan(1e-6);
      }
    }
  });

  it('even preset fires evenly on every layout', () => {
    for (const layout of LAYOUTS.filter((l) => l !== 'rotary')) {
      for (const cylinders of cylinderChoices(layout)) {
        const d = base({ layout, cylinders });
        const plan = firingFromCrank(d, d.throws);
        for (const gap of plan.intervals) expect(gap).toBeCloseTo(720 / cylinders, 6);
      }
    }
  });

  it('the optimiser finds firing orders as balanced as the textbook ones', () => {
    const shake = (over: Partial<Design>) => {
      const b = balance(toEngine(base(over)));
      return b.force1 + b.force2 + b.couple1 + b.couple2;
    };
    expect(shake({ cylinders: 6 })).toBeLessThan(0.02); // inline six: zero
    expect(shake({ layout: 'vee', cylinders: 12, veeAngle: 60 })).toBeLessThan(0.05);
    const i4 = balance(toEngine(base({ cylinders: 4 })));
    expect(i4.force1).toBeLessThan(0.01);
    expect(i4.couple1).toBeLessThan(0.01);
  });

  it('flat crank pins are 0 and 180 only; cross crank uses four quadrants', () => {
    const flat = crankForPreset(base({ layout: 'vee', cylinders: 8 }), 'flat');
    expect(new Set(flat.map((t) => t.pin))).toEqual(new Set([0, 180]));
    const cross = crankForPreset(base({ layout: 'vee', cylinders: 8 }), 'cross');
    expect(new Set(cross.map((t) => t.pin))).toEqual(new Set([0, 90, 180, 270]));
  });

  it('big-bang fires in clumps', () => {
    const d = base({ layout: 'vee', cylinders: 4, crankPreset: 'bigbang' });
    const plan = firingFromCrank(d, d.throws);
    expect(Math.max(...plan.intervals)).toBeGreaterThan(Math.min(...plan.intervals) * 2.5);
  });

  it('axis angle agrees with the geometry the spec builds', () => {
    const random = seeded(5);
    for (let i = 0; i < 60; i++) {
      const d = randomDesign(random);
      if (d.layout === 'rotary') continue;
      const engine = toEngine(d);
      for (const c of engine.cylinders) expect(c.alpha).toBeCloseTo(axisAngle(d, c.n), 6);
    }
  });

  it('is deterministic and fast', () => {
    const d = base({ layout: 'w', cylinders: 16 });
    const start = performance.now();
    const order = balancedOrder({ ...d, wAngle: 91 });
    expect(performance.now() - start).toBeLessThan(400);
    expect(balancedOrder({ ...d, wAngle: 91 })).toEqual(order);
  });
});

describe('catalogue engines open in the designer', () => {
  it.each(ENGINES.map((e) => [e.id, e] as const))('%s keeps its identity', (_id, spec) => {
    const d = designFromSpec(spec);
    const original = buildEngine(spec);
    const engine = toEngine(d);
    expect(d.cylinders).toBe(spec.cylinders);
    expect(engine.displacementCc / original.displacementCc).toBeGreaterThan(0.99);
    expect(engine.displacementCc / original.displacementCc).toBeLessThan(1.01);
  });

  it('a boxer six keeps the same firing gaps', () => {
    const spec = ENGINES.find((e) => e.id === 'b6')!;
    const engine = toEngine(designFromSpec(spec));
    expect(engine.intervals.every((v) => Math.abs(v - 120) < 1e-6)).toBe(true);
  });

  it('a crossplane V8 stays crossplane', () => {
    const engine = toEngine(designFromSpec(ENGINES.find((e) => e.id === 'v8-cross')!));
    expect(engine.throws).toHaveLength(4);
    const first = engine.throws[0]!.angle;
    expect(new Set(engine.throws.map((t) => Math.round(mod(t.angle - first, 360))))).toEqual(new Set([0, 90, 180, 270]));
  });
});

describe('odd presets', () => {
  it.each(ODD_PRESETS.map((p) => [p.id, p] as const))('%s builds and runs', (_id, preset) => {
    const d = preset.design();
    expect(() => toEngine(d)).not.toThrow();
    expect(evaluate(d).peakPower.powerKw).toBeGreaterThan(0);
  });

  it('displacement formula is right for pistons and rotors', () => {
    expect(displacementL(base({ bore: 86, stroke: 86, cylinders: 4 }))).toBeCloseTo(1.998, 2);
    expect(displacementL(base({ layout: 'rotary', cylinders: 1, rotorR: 105, rotorE: 15, rotorWidth: 80 }))).toBeCloseTo(0.6546, 3);
  });
});

describe('links', () => {
  it('round-trips a design', () => {
    const random = seeded(31);
    for (let i = 0; i < 30; i++) {
      const d = randomDesign(random);
      expect(decodeDesign(encodeDesign(d))).toEqual(d);
    }
  });

  it('round-trips a custom crank', () => {
    const throws = Array.from({ length: 4 }, (_, i) => ({ pin: i * 37, turn: (i % 2) as 0 | 1 }));
    const d = base({ crankPreset: 'custom', throws });
    expect(decodeDesign(encodeDesign(d))).toEqual(d);
  });

  it('keeps Cyrillic names', () => {
    const d = base({ name: 'Мій дивний V7 ©' });
    expect(decodeDesign(encodeDesign(d))?.name).toBe('Мій дивний V7 ©');
  });

  it('a link cannot smuggle in values the model does not know', () => {
    const d = decodeDesign(btoa(JSON.stringify({ fuel: 'nitro', muffler: 'x', layout: 'radial', charger: 7, valvesPerCyl: 99, name: 'x'.repeat(500), balanceShafts: 9 })));
    expect(d).not.toBeNull();
    expect(d!.fuel).toBe(DEFAULT_DESIGN.fuel);
    expect(d!.muffler).toBe(DEFAULT_DESIGN.muffler);
    expect(d!.layout).toBe(DEFAULT_DESIGN.layout);
    expect(d!.name.length).toBeLessThanOrEqual(60);
    expect(() => evaluate(d!)).not.toThrow();
    expect(Number.isFinite(evaluate(d!).peakPower.powerKw)).toBe(true);
  });

  it('a link cannot push the pops outside their range', () => {
    const decode = (pops: unknown): number | null | undefined => decodeDesign(btoa(JSON.stringify({ pops })))?.pops;
    expect(decode(50)).toBe(1);
    expect(decode(-3)).toBe(0);
    expect(decode(0.4)).toBe(0.4);
    expect(decode(null)).toBeNull();
  });

  it('rejects garbage without throwing', () => {
    expect(decodeDesign('@@@not base64')).toBeNull();
    expect(decodeDesign('')).toBeNull();
    expect(decodeDesign(btoa('[1,2,3'))).toBeNull();
    const hostile = btoa(JSON.stringify({ bore: 'wide', cylinders: 'x', __proto__: { y: 1 }, nope: 1, throws: [[1], 'a'] }));
    expect(() => decodeDesign(hostile)).not.toThrow();
    expect(decodeDesign(hostile)?.bore).toBe(DEFAULT_DESIGN.bore);
  });

  it('a default design makes a short link', () => {
    expect(encodeDesign(base()).length).toBeLessThan(40);
  });
});
