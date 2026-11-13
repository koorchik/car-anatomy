import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { ENGINE_VARIANTS } from '../src/data/engine-variants.ts';
import { resolveDesign, paramRange } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, isRotary, type Design } from '../src/designer/design.ts';
import { diagnose } from '../src/designer/diagnostics.ts';
import { lubricationFigures } from '../src/designer/lubrication-figures.ts';
import { derivedDesignOilL, sumpFrictionBar } from '../src/designer/lubrication.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec, editDesign, withLayout } from '../src/designer/presets.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { systemsOf, type SumpKind } from '../src/engine/systems-spec.ts';
import { panShape } from '../src/systems/sump.ts';
import { FIELD_NAMES } from '../src/ui/article.ts';

const LS3: Design = resolveDesign({ ...DEFAULT_DESIGN, layout: 'vee', cylinders: 8, veeAngle: 90, bore: 103.25, stroke: 92, rodLength: 154, valvetrain: 'ohv', valvesPerCyl: 2, collector: 'bybank', rpmLimit: 6600, crankPreset: 'cross', intakeValve: 55, exhaustValve: 40.4, lift: 13.5, compression: 10.7 });
const withSump = (d: Design, sump: SumpKind, oilL: number | null = null): Design => resolveDesign({ ...d, sump, oilL });

describe('resolveDesign keeps the sump fields sane', () => {
  it('turns a foreign sump into null and a non-number oil into null, and clamps the rest', () => {
    const bad = resolveDesign({ ...LS3, sump: 'oily' as unknown as SumpKind, oilL: 'lots' as unknown as number });
    expect(bad.sump).toBeNull();
    expect(bad.oilL).toBeNull();
    const huge = resolveDesign({ ...LS3, oilL: 1000 });
    expect(huge.oilL).toBe(paramRange(huge, 'oilL').max);
    const tiny = resolveDesign({ ...LS3, oilL: 0.01 });
    expect(tiny.oilL).toBe(paramRange(tiny, 'oilL').min);
  });

  it('is idempotent on random values of the new fields', () => {
    const kinds: unknown[] = [null, 'wet', 'baffled', 'integrated-dry', 'dry', 'x', 3];
    for (let i = 0; i < 60; i++) {
      const raw = { ...LS3, sump: kinds[i % kinds.length] as SumpKind, oilL: [null, -5, 0.5, 7, 40, Number.NaN][i % 6] as number | null, cylinders: [4, 6, 8][i % 3]! };
      const once = resolveDesign(raw);
      expect(resolveDesign(once)).toEqual(once);
    }
  });
});

describe('editDesign and withLayout', () => {
  it('lets the capacity follow a new sump or layout, and hands over from the factory figures', () => {
    const own = editDesign(LS3, { oilL: 8 });
    expect(own.oilL).toBe(8);
    expect(editDesign(own, { sump: 'dry' }).oilL).toBeNull();
    expect(withLayout(own, 'inline').oilL).toBeNull();
    const factory = designFromSpec(engineById('v8-cross')!);
    expect(factory.factory).not.toBeNull();
    expect(editDesign(factory, { sump: 'baffled' }).factory).toBeNull();
    expect(editDesign(factory, { oilL: 7 }).factory).toBeNull();
  });
});

describe('the sump in the designer', () => {
  const height = (d: Design): number => lubricationFigures(d).crankHeightMm;
  it('a dry sump lowers the crank by at least 50 mm', () => {
    expect(height(withSump(LS3, 'wet')) - height(withSump(LS3, 'dry'))).toBeGreaterThan(50);
  });

  it('more oil means a deeper pan', () => {
    const derived = derivedDesignOilL(LS3);
    expect(height(withSump(LS3, 'wet', derived + 1.5))).toBeGreaterThan(height(withSump(LS3, 'wet', derived)));
  });

  it('a dry sump gains 1-4 % of peak power on an LS-sized engine (EFI University measured about 2.5 %)', () => {
    const wet = evaluate(withSump(LS3, 'wet')).peakPower.powerHp;
    const dry = evaluate(withSump(LS3, 'dry')).peakPower.powerHp;
    const gain = dry / wet - 1;
    expect(gain).toBeGreaterThan(0.01);
    expect(gain).toBeLessThan(0.04);
  });

  it('orders the masses: dry > integrated dry > baffled > wet', () => {
    const mass = (k: SumpKind): number => evaluate(withSump(LS3, k)).massKg;
    expect(mass('dry')).toBeGreaterThan(mass('integrated-dry'));
    expect(mass('integrated-dry')).toBeGreaterThan(mass('baffled'));
    expect(mass('baffled')).toBeGreaterThan(mass('wet'));
  });

  it('leaves a rotary alone: no friction change and no crank height', () => {
    const rotary = resolveDesign({ ...DEFAULT_DESIGN, layout: 'rotary', cylinders: 2, sump: 'dry' });
    expect(sumpFrictionBar(rotary, 20)).toBe(0);
    expect(Number.isNaN(lubricationFigures(rotary).crankHeightMm)).toBe(true);
  });

  it('warns about a pan too deep to fit under a car', () => {
    const deep = withSump(LS3, 'wet', paramRange(LS3, 'oilL').max);
    expect(diagnose(deep, evaluate(deep)).some((x) => x.id === 'deep-pan')).toBe(true);
    expect(diagnose(LS3, evaluate(LS3)).some((x) => x.id === 'deep-pan')).toBe(false);
  });
});

describe('the catalogue', () => {
  const ids = ENGINES.flatMap((page) => pageChoices(page.id).map((c) => c.id));
  const sumpOf = (id: string): SumpKind => systemsOf(engineById(id)!).sump;
  /** The real lubrication of every engine that isn't a plain wet sump, from the sources in the plan. */
  const NOT_WET: Record<string, SumpKind> = {
    b6: 'dry', 'v8-flat': 'dry', v10: 'dry', v12: 'dry', f12: 'dry', w16: 'dry', r4: 'dry',
    'b6/porsche-992-carrera-3-0': 'integrated-dry', 'b6/porsche-718-gt4-4-0': 'integrated-dry', 'b6/porsche-cayman-981-3-4': 'integrated-dry', 'b6/porsche-993-carrera': 'dry',
    'v8-flat/ferrari-488-gtb-f154': 'dry', 'v8-flat/mclaren-720s-m840t': 'dry', 'v8-flat/corvette-z06-c8-lt6': 'dry',
    'v10/audi-r8-52-fsi': 'dry', 'v10/huracan-lp610-4': 'dry', 'v10/gallardo-50-even-fire': 'dry', 'v10/bmw-m5-e60-s85': 'baffled',
    'v12/ferrari-812-superfast-f140': 'dry', 'v12/aventador-lp700-4-l539': 'dry',
    'f12/ferrari-512bb': 'dry', 'f12/ferrari-f512m': 'dry', 'f12/ferrari-312t': 'dry', 'f12/porsche-917-912': 'dry', 'f12/alfa-115-12': 'dry',
    'w16/veyron-super-sport': 'dry', 'w16/chiron': 'dry', 'w16/chiron-super-sport': 'dry', 'w16/bolide-race': 'dry',
    'w12/a8-phaeton-6-0-420': 'dry', 'i6/bmw-m3-e46-s54': 'baffled', 'v6-60/nissan-gtr-vr38dett': 'baffled',
    'i8/mercedes-w196': 'dry', 'i8/alfa-romeo-8c-2300': 'dry', 'r4/mazda-767-13j': 'dry', 'r4/mercedes-c111-ii': 'dry',
  };

  it('gives every engine its own lubrication: page values do not leak into variants', () => {
    for (const id of ids) expect(sumpOf(id), id).toBe(NOT_WET[id] ?? 'wet');
  });

  it('keeps the oil volumes taken from GM capacity tables', () => {
    expect(systemsOf(engineById('v8-cross/camaro-ss-lt1')!).oilL).toBe(9.5);
    expect(systemsOf(engineById('v8-flat/corvette-z06-c8-lt6')!).oilL).toBe(7.6);
  });

  it('gives no catalogue piston engine a deep-pan warning, and every dry sump a lower crank than its wet twin', () => {
    for (const id of ids) {
      const spec = engineById(id)!;
      if (spec.layout.kind === 'wankel') continue;
      const engine = buildEngine(spec);
      const own = panShape(engine, systemsOf(spec));
      expect(own.crankHeightMm, id).toBeLessThan(250);
      if (own.kind === 'dry') {
        const wet = panShape(engine, { ...systemsOf(spec), sump: 'wet' });
        expect(own.crankHeightMm, id).toBeLessThan(wet.crankHeightMm);
      }
    }
  });

  it('gives no catalogue engine a low-oil warning: every factory pan covers its pickup at the limiter', () => {
    for (const id of ids) {
      const d = designFromSpec(engineById(id)!);
      if (isRotary(d)) continue;
      expect(lubricationFigures(d).immersionMm, id).toBeGreaterThanOrEqual(20);
    }
    const starved = resolveDesign({ ...LS3, oilL: paramRange(LS3, 'oilL').min });
    expect(diagnose(starved, evaluate(starved)).some((x) => x.id === 'low-oil')).toBe(true);
  });

  it('names every field it could not verify', () => {
    for (const [page, { base, variants }] of Object.entries(ENGINE_VARIANTS)) {
      for (const facts of [base, ...variants]) for (const name of facts.unverified.filter((n) => n === 'sump' || n === 'oilL')) expect(FIELD_NAMES[name], `${page} ${name}`).toBeDefined();
    }
  });

  it('skips rotaries in the pan figures', () => {
    for (const id of ['r2', 'r4']) {
      const d = designFromSpec(engineById(id)!);
      expect(isRotary(d)).toBe(true);
      expect(Number.isNaN(lubricationFigures(d).crankHeightMm)).toBe(true);
    }
  });
});

describe('the word', () => {
  it('says «олива», never «масло», in the lubrication text', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
    });
    const files = [...walk('src/i18n'), ...walk('src/vehicle'), ...walk('src/lubrication'), 'src/designer/lubrication.ts', 'src/systems/sump.ts'];
    for (const file of files) expect(/масл/i.test(readFileSync(file, 'utf8')), file).toBe(false);
  });
});
