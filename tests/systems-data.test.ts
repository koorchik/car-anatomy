import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_VARIANTS } from '../src/data/engine-variants.ts';
import { CATALOGUE, ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { catalogueDesign } from '../src/designer/catalogue.ts';
import { decodeDesign, encodeDesign } from '../src/designer/codec.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec, editDesign, randomDesign } from '../src/designer/presets.ts';
import { SYSTEM_KEYS, fuelSystemsFor, systemsOfDesign } from '../src/designer/systems.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { COOLINGS, FUEL_SYSTEMS, IGNITIONS, OIL_COOLERS, OIL_PUMP_DRIVES } from '../src/engine/systems-spec.ts';

const seeded = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

const base = (over: Partial<Design> = {}): Design => resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });

/** Anything a link could carry for the new fields, valid or not. */
const junk = (random: () => number): Partial<Design> => {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const any = [null, 'nonsense', 3, true, false, undefined, {}];
  return {
    fuelSystem: pick([...FUEL_SYSTEMS, ...any]),
    cooling: pick([...COOLINGS, ...any]),
    oilCooler: pick([...OIL_COOLERS, ...any]),
    ignition: pick([...IGNITIONS, ...any]),
    oilPump: pick([...OIL_PUMP_DRIVES, ...any]),
    sparkPlugs: pick([1, 2, ...any]),
    pistonJets: pick(any),
    glowPlugs: pick(any),
    oilFilter: pick(any),
  } as unknown as Partial<Design>;
};

describe('systems fields in a design', () => {
  it('resolve idempotently from anything a link may carry', () => {
    const random = seeded(17);
    for (let i = 0; i < 300; i++) {
      const once = resolveDesign({ ...randomDesign(random), ...junk(random) });
      expect(resolveDesign(once)).toEqual(once);
      for (const key of ['pistonJets', 'glowPlugs', 'oilFilter'] as const) expect([null, true, false]).toContain(once[key]);
      if (once.fuelSystem !== null) expect(fuelSystemsFor(once)).toContain(once.fuelSystem);
      expect(once.cooling === null || COOLINGS.includes(once.cooling)).toBe(true);
      expect(once.sparkPlugs === null || once.sparkPlugs === 1 || once.sparkPlugs === 2).toBe(true);
    }
  });

  it('a fuel system that no longer fits falls back to derived, and never sets the injection', () => {
    const carb = base({ fuelSystem: 'carburettor' });
    expect(carb.fuelSystem).toBe('carburettor');
    const direct = resolveDesign({ ...carb, directInjection: true });
    expect(direct.fuelSystem).toBeNull();
    expect(systemsOfDesign(direct).fuelSystem).toBe('direct');
    const asked = base({ fuelSystem: 'direct', directInjection: false });
    expect(asked.directInjection).toBe(false);
    expect(asked.fuelSystem).toBeNull();
  });

  it('never changes the power model', () => {
    const random = seeded(5);
    for (let i = 0; i < 12; i++) {
      const d = randomDesign(random);
      const before = JSON.stringify(evaluate(d));
      const after = JSON.stringify(evaluate(resolveDesign({ ...d, ...junk(random) })));
      expect(after).toBe(before);
    }
  });

  it('survives a link', () => {
    const d = base({ layout: 'vee', cylinders: 12, veeAngle: 60, fuelSystem: 'carburettor', cooling: 'fan', pistonJets: false, oilFilter: false });
    expect(decodeDesign(encodeDesign(d))).toEqual(d);
    expect(encodeDesign(base()).length).toBeLessThan(10);
  });
});

describe('derived systems', () => {
  it('follow the fuel, the injection and the charger', () => {
    expect(systemsOfDesign(base())).toMatchObject({ fuelSystem: 'port', cooling: 'liquid', ignition: 'coil-on-plug', sparkPlugs: 1, pistonJets: false, oilCooler: 'none' });
    expect(systemsOfDesign(base({ directInjection: true }))).toMatchObject({ fuelSystem: 'direct' });
    const diesel = systemsOfDesign(base({ fuel: 'diesel', lambda: 1.5, compression: 18, charger: 'turbo', directInjection: true }));
    expect(diesel).toMatchObject({ fuelSystem: 'common-rail', sparkPlugs: 0, ignition: null, glowPlugs: true, pistonJets: true, oilCooler: 'coolant' });
    expect(systemsOfDesign(base({ fuel: 'diesel', lambda: 1.5, compression: 21 })).fuelSystem).toBe('diesel-idi');
    expect(systemsOfDesign(base({ fuelSystem: 'carburettor' })).ignition).toBe('distributor');
    expect(systemsOfDesign(base({ cooling: 'fan' })).oilCooler).toBe('air');
    expect(systemsOfDesign(base({ charger: 'roots' }))).toMatchObject({ supercharger: 'roots', pistonJets: true });
  });

  it('a rotary keeps the hardware its construction fixes', () => {
    const r = systemsOfDesign(base({ layout: 'rotary', cylinders: 2, cooling: 'fan', pistonJets: true, sparkPlugs: 1, oilPump: 'crank' }));
    expect(r).toMatchObject({ cooling: 'liquid', pistonJets: false, sparkPlugs: 2, oilPump: 'chain' });
  });

  it('carry the mixture and the ignition offset the power model uses', () => {
    const s = systemsOfDesign(base({ lambda: 0.82, ignitionOffset: -6 }));
    expect(s.lambda).toBe(0.82);
    expect(s.ignitionOffset).toBe(-6);
  });
});

describe('editDesign and the systems fields', () => {
  const catalogue = designFromSpec(engineById('v8-cross')!);

  it('a systems field keeps the factory figures', () => {
    for (const [key, value] of [['fuelSystem', 'carburettor'], ['cooling', 'fan'], ['pistonJets', true], ['oilFilter', false], ['oilPump', 'shaft']] as const) {
      expect(editDesign(catalogue, { [key]: value }).factory).not.toBeNull();
    }
  });

  it('switching the injection resets the fuel system', () => {
    const carb = editDesign(base(), { fuelSystem: 'carburettor' });
    expect(editDesign(carb, { directInjection: true }).fuelSystem).toBeNull();
  });

  it('a new charger lets piston jets and the oil cooler follow it', () => {
    const plain = editDesign(base(), { pistonJets: false, oilCooler: 'none' });
    const turbo = editDesign(plain, { charger: 'turbo' });
    expect(turbo.pistonJets).toBeNull();
    expect(systemsOfDesign(turbo)).toMatchObject({ pistonJets: true, oilCooler: 'coolant' });
  });

  it('a new fuel system brings its own ignition', () => {
    const cop = editDesign(base(), { ignition: 'coil-on-plug' });
    expect(systemsOfDesign(editDesign(cop, { fuelSystem: 'carburettor' })).ignition).toBe('distributor');
  });
});

describe('catalogue systems', () => {
  const all = ENGINES.flatMap((page) => pageChoices(page.id).map((c) => engineById(c.id)!));

  it('every engine carries its systems', () => {
    for (const spec of all) expect(spec.systems, spec.id).toBeDefined();
  });

  it('a diesel has no spark', () => {
    for (const spec of all.filter((s) => s.fuel === 'diesel')) {
      expect(spec.systems!.sparkPlugs, spec.id).toBe(0);
      expect(spec.systems!.ignition, spec.id).toBeNull();
    }
  });

  it('a variant without facts of its own gets what its own design implies, not its page', () => {
    for (const entry of CATALOGUE) {
      for (const variant of ENGINE_VARIANTS[entry.id]?.variants ?? []) {
        if (variant.systems) continue;
        const own = catalogueDesign(entry, variant);
        const derived = resolveDesign({ ...own, ...Object.fromEntries(SYSTEM_KEYS.map((k) => [k, null])) });
        expect(systemsOfDesign(own), `${entry.id}/${variant.id}`).toEqual(systemsOfDesign(derived));
      }
    }
  });

  it('every design is the same through designToSpec as through the catalogue', () => {
    for (const spec of all) {
      const d = designFromSpec(spec);
      expect(designToSpec({ ...d, factory: null }, evaluate({ ...d, factory: null })).systems, spec.id).toEqual(spec.systems);
    }
  });
});

describe('words', () => {
  const walk = (dir: string): string[] =>
    !existsSync(dir) ? [] : readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
    });

  it('the site says «олива», never «масло»', () => {
    const files = [...walk('src/i18n'), ...walk('src/designer'), ...walk('src/ui'), ...walk('src/scene'), ...walk('src/systems')];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n').filter((line) => /масл/i.test(line));
      expect(lines, file).toEqual([]);
    }
  });
});
