import { describe, expect, it } from 'vitest';
import { synthConfig } from '../src/audio/synth.ts';
import { ENGINES } from '../src/data/engines.ts';
import { paramRange, resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec, editDesign, ODD_PRESETS } from '../src/designer/presets.ts';
import { diagnose } from '../src/designer/diagnostics.ts';
import { assessReliability, restartOutlook, wearNow } from '../src/designer/reliability.ts';
import { causesOf, compareMetrics, previewEffects, snapshot } from '../src/designer/sensitivity.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { probesFor } from '../src/ui/designer/probes.ts';
import { PARAM_GROUPS } from '../src/ui/designer/params.ts';

const base = (over: Partial<Design> = {}): Design => resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
const rel = (over: Partial<Design> = {}) => {
  const d = base(over);
  return assessReliability(d, evaluate(d));
};
const load = (over: Partial<Design>, id: string): number => rel(over).items.find((i) => i.id === id)!.load;

describe('factory engines read as their reputation', () => {
  it.each(ENGINES.map((e) => [e.id, e] as const))('%s is neither doomed nor throwaway, and does not wear at its own limit', (_id, spec) => {
    const d = designFromSpec(spec);
    const perf = evaluate(d);
    const r = assessReliability(d, perf);
    expect(['solid', 'sport', 'race']).toContain(r.verdict);
    expect(wearNow(r, d.rpmLimit, 1).rate).toBeLessThan(0.002);
    expect(wearNow(r, spec.idleRpm, 0.1).rate).toBe(0);
    expect(r.safeRpm).toBeLessThanOrEqual(r.failureRpm);
    expect(r.safeRpm).toBeGreaterThan(spec.redlineRpm * 0.9);
  });

  it('a plain diesel is sturdier than a high-revving sports engine', () => {
    const verdict = (id: string) => {
      const d = designFromSpec(ENGINES.find((e) => e.id === id)!);
      return assessReliability(d, evaluate(d)).worst.load;
    };
    expect(verdict('i6d')).toBeLessThan(verdict('i4'));
  });
});

describe('every material and size has a consequence you can see', () => {
  const boosted: Partial<Design> = { charger: 'turbo', boostBar: 2, turboSizeHp: 300, compression: 10, fuel: 'ai98', intercooler: 0.7 };

  it('a forged piston takes more pressure and more knock than a cast one', () => {
    expect(load({ ...boosted, pistonMaterial: 'forged' }, 'piston')).toBeLessThan(load({ ...boosted, pistonMaterial: 'cast' }, 'piston'));
    const knocky: Partial<Design> = { compression: 13, fuel: 'ai92' };
    expect(load({ ...knocky, pistonMaterial: 'forged' }, 'knock')).toBeLessThan(load({ ...knocky, pistonMaterial: 'cast' }, 'knock'));
  });

  it('a titanium rod lets the engine rev higher, as does a shorter stroke or lighter piston', () => {
    const over: Partial<Design> = { rpmLimit: 9000, springForce: 1500 };
    const steel = load(over, 'rod-tension');
    expect(load({ ...over, rodMaterial: 'titanium' }, 'rod-tension')).toBeLessThan(steel);
    expect(load({ ...over, stroke: 70 }, 'rod-tension')).toBeLessThan(steel);
    expect(load({ ...over, pistonMaterial: 'light' }, 'rod-tension')).toBeLessThan(steel);
    expect(rel({ ...over, rodMaterial: 'titanium' }).failureRpm).toBeGreaterThan(rel(over).failureRpm);
  });

  it('a long rod buckles sooner under boost than a short one', () => {
    expect(load({ ...boosted, rodLength: 220 }, 'rod-buckling')).toBeGreaterThan(load({ ...boosted, rodLength: 145 }, 'rod-buckling'));
  });

  it('an iron block holds the head down better than aluminium', () => {
    expect(load({ ...boosted, blockMaterial: 'iron' }, 'gasket')).toBeLessThan(load({ ...boosted, blockMaterial: 'aluminium' }, 'gasket'));
  });

  it('a stiffer spring moves the valve limit up', () => {
    expect(load({ springForce: 1400 }, 'valve-float')).toBeLessThan(load({ springForce: 500 }, 'valve-float'));
  });

  it('a richer mixture cools the exhaust', () => {
    expect(load({ ...boosted, lambda: 0.75 }, 'exhaust-heat')).toBeLessThan(load({ ...boosted, lambda: 0.95 }, 'exhaust-heat'));
  });
});

describe('a bad engine looks bad', () => {
  it('sensible default engine is fine, hopeless one is doomed', () => {
    expect(['solid', 'sport']).toContain(rel().verdict);
    expect(rel({ charger: 'turbo', boostBar: 3.5, turboSizeHp: 300, compression: 13, fuel: 'ai92', intercooler: 0 }).verdict).toBe('doomed');
    expect(rel({ rpmLimit: 21000, springForce: 2200, intakeValve: 36, lift: 11 }).verdict).toBe('doomed');
    expect(rel({ compression: 14, intakeDuration: 330, exhaustDuration: 330, lobeSeparation: 98, lift: 15, intakeValve: 36 }).verdict).toBe('doomed');
  });

  it('says what is weakest', () => {
    expect(rel({ rpmLimit: 21000, springForce: 2200, intakeValve: 36, lift: 11 }).worst.id).toMatch(/rod-tension|piston-speed|valve-float/);
    expect(rel({ compression: 14, intakeDuration: 330, exhaustDuration: 330, lobeSeparation: 98, lift: 15, intakeValve: 36 }).worst.id).toBe('valve-clearance');
  });

  it('odd presets span the range, and each has a verdict', () => {
    for (const preset of ODD_PRESETS) {
      const d = preset.design();
      expect(assessReliability(d, evaluate(d)).verdictName.length).toBeGreaterThan(3);
    }
  });
});

describe('wear', () => {
  const race = rel({ rpmLimit: 9500, springForce: 1600, intakeValve: 36, lift: 11 });

  it('is nothing in the safe zone and grows past it', () => {
    expect(wearNow(race, race.safeRpm - 200, 1).rate).toBe(0);
    const near = wearNow(race, race.failureRpm * 0.96, 1);
    const closer = wearNow(race, race.failureRpm * 0.995, 1);
    expect(near.rate).toBeGreaterThan(0);
    expect(closer.rate).toBeGreaterThan(near.rate);
    expect(closer.worst).not.toBeNull();
  });

  it('takes tens of seconds right at the limit, so it can be watched', () => {
    const r = wearNow(race, race.failureRpm, 1).rate;
    expect(1 / r).toBeGreaterThan(4);
    expect(1 / r).toBeLessThan(90);
  });

  it('gas-driven damage needs throttle', () => {
    const hard = rel({ charger: 'turbo', boostBar: 3, turboSizeHp: 300, compression: 12, fuel: 'ai95' });
    expect(wearNow(hard, 4500, 1).rate).toBeGreaterThan(wearNow(hard, 4500, 0.15).rate);
  });
});

describe('cause and effect', () => {
  it('previews agree with really making the change', () => {
    const d = base();
    const shown = previewEffects(d, 'bore', 96);
    const power = shown.find((e) => e.id === 'power');
    expect(power?.text).toMatch(/^\+/);
    const real = compareMetrics(snapshot(d), snapshot(editDesign(d, { bore: 96 })));
    expect(real.find((e) => e.id === 'power')?.text).toBe(power?.text);
  });

  it('finds what actually moves a limit', () => {
    const d = base({ rpmLimit: 8500, springForce: 1300 });
    const causes = causesOf(d, 'rod-tension', probesFor(d)).map((c) => c.key);
    expect(causes).toContain('stroke');
    expect(causes).toContain('rpmLimit');
    // Without knock in the way, boost sets the pressure directly. With heavy knock the ignition retard hides it.
    const piston = base({ charger: 'turbo', boostBar: 0.8, turboSizeHp: 200, fuel: 'race', compression: 8.5 });
    expect(causesOf(piston, 'piston', probesFor(piston), 6).map((c) => c.key)).toContain('boostBar');
    const rod = causesOf(d, 'rod-tension', probesFor(d));
    expect(rod.every((c) => c.effect.size >= 1)).toBe(true);
  });

  it('does not change the design it looks at', () => {
    const d = base({ crankPreset: 'custom' });
    const copy = JSON.stringify(d);
    causesOf(d, 'power', probesFor(d));
    previewEffects(d, 'bore', 95);
    expect(JSON.stringify(d)).toBe(copy);
  });
});

describe('no control is dead', () => {
  const engines: Array<[string, Design]> = [
    ['petrol', base({ cylinders: 6, layout: 'vee', collector: 'bybank', veeAngle: 90 })],
    ['turbo', base({ charger: 'turbo', boostBar: 1, turboSizeHp: 300, compression: 9.5 })],
    ['supercharged', base({ charger: 'roots', boostBar: 0.8, compression: 9.5 })],
    ['diesel', base({ fuel: 'diesel', lambda: 1.5, compression: 18, charger: 'turbo', boostBar: 1, turboSizeHp: 200 })],
    ['rotary', base({ layout: 'rotary', cylinders: 2 })],
    ['W', base({ layout: 'w', cylinders: 12, collector: 'bybank' })],
  ];
  const soundOf = (d: Design): string => JSON.stringify(synthConfig(buildEngine(designToSpec(d, evaluate(d))), 1));
  const lookOf = (d: Design): string => {
    const s = designToSpec(d, evaluate(d));
    return JSON.stringify([s.coverColor, s.layout, buildEngine(s).cylinders, s.systems]);
  };
  const figures = (d: Design): string => JSON.stringify(snapshot(d).map((m) => [m.id, Math.round(m.value * 1e4)]));

  for (const [label, d] of engines) {
    for (const group of PARAM_GROUPS) {
      if (group.applies && !group.applies(d)) continue;
      for (const param of group.params) {
        if (param.applies && !param.applies(d)) continue;
        if (param.key === 'layout') continue;
        it(`${label}: ${param.label} changes something`, () => {
          let others: unknown[] = [];
          if (param.kind === 'number') {
            const range = paramRange(d, param.key);
            const value = (d[param.key] as number | null) ?? param.shown?.(d) ?? 0;
            const step = (range.max - range.min) * 0.15;
            others = [value + step <= range.max ? value + step : value - step];
          } else if (param.kind === 'choice') {
            const options = typeof param.options === 'function' ? param.options(d) : param.options;
            others = options.map(([v]) => v).filter((v) => v !== d[param.key]);
          } else if (param.kind === 'toggle') {
            others = [!(d[param.key] ?? param.shown?.(d))];
          } else {
            others = ['#123456'];
          }
          if (!others.length) return; // A single available option leaves nothing to move.
          const only = 'only' in param ? param.only : undefined;
          const read = only === 'sound' ? soundOf : only === 'looks' ? lookOf : (x: Design) => figures(x) + soundOf(x);
          const changed = others.some((value) => read(editDesign({ ...d, factory: null }, { [param.key]: value } as Partial<Design>)) !== read(d));
          expect(changed).toBe(true);
        });
      }
    }
  }
});

it('a design too bad to run never makes these tools throw', () => {
  const d = base({ fuel: 'diesel', lambda: 1.5, compression: 4, stroke: 280, bore: 30 });
  expect(() => causesOf(d, 'power', probesFor(d))).not.toThrow();
  expect(() => wearNow(assessReliability(d, evaluate(d)), 500, 1)).not.toThrow();
});

describe('what a restart will do', () => {
  const outlook = (over: Partial<Design>): string => {
    const d = base(over);
    const perf = evaluate(d);
    return restartOutlook(assessReliability(d, perf), perf.idleRpm, d.rpmLimit);
  };

  it('a sound engine is simply repaired', () => {
    expect(outlook({})).toBe('fine');
  });

  it('a rev limit above what the parts take breaks it again at full throttle', () => {
    expect(outlook({ rpmLimit: 16000 })).toBe('revs');
  });

  it('huge boost on high compression breaks it as soon as the throttle opens', () => {
    expect(outlook({ charger: 'turbo', boostBar: 2.5, compression: 12, turboSizeHp: 300 })).toBe('throttle');
  });

  it('valves that hit the pistons break it at any speed', () => {
    expect(outlook({ lift: 40, intakeDuration: 340, exhaustDuration: 340, lobeSeparation: 90 })).toBe('idle');
  });
});

describe('a rotary is only told about parts it has', () => {
  const PISTON_WORDS = /клапан|поршен|шатун|прокладк|циліндр|головк/i;
  const rotary: Partial<Design> = { layout: 'rotary', cylinders: 2 };
  const extremes: Array<Partial<Design>> = [
    {},
    { lambda: 1.5 },
    { lambda: 0.8, ignitionOffset: 8 },
    { fuel: 'ai92', compression: 12, charger: 'turbo', boostBar: 2, intercooler: 0 },
    { charger: 'turbo', boostBar: 2.5, turboSizeHp: 80 },
    { pipeDia: 25, muffler: 'road', rpmLimit: 11000 },
    { rotorR: 130, rotorE: 21, rotorWidth: 130, rpmLimit: 11000, runnerDia: 25 },
  ];

  it.each(extremes.map((over) => [JSON.stringify(over), over] as const))('%s', (_name, over) => {
    const d = base({ ...rotary, ...over });
    const perf = evaluate(d);
    const texts = [
      ...assessReliability(d, perf).items.flatMap((i) => [i.name, i.detail, i.fix, i.failure]),
      ...diagnose(d, perf).flatMap((x) => [x.title, x.text, x.fix ?? '']),
    ];
    expect(texts.filter((text) => PISTON_WORDS.test(text))).toEqual([]);
  });
});
