// The car builder's model (whole-car plan, tests/car-build; stage C4): a donor as made gives the calibrated v_max,
// 0–100 km/h within ±15 % of the maker's (or a written exception within the gearbox section's own bound) and exactly
// the canonical lap time; the same engine put back changes nothing; links survive a round trip and anything broken;
// resolveBuild is idempotent; no control is dead; the "what this changes" pass never holds the page for 50 ms; and the
// engine's box holds what the rotary model draws.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DONORS, factoryBuild, isFactory, type CarBuild } from '../src/car-designer/build.ts';
import { decodeBuild, encodeBuild } from '../src/car-designer/codec.ts';
import { buildControls, editBuild } from '../src/car-designer/controls.ts';
import { diagnoseBuild } from '../src/car-designer/diagnostics.ts';
import { evaluateBuild, oilAndWear, type CarPerformance } from '../src/car-designer/evaluate.ts';
import { carMetrics } from '../src/car-designer/metrics.ts';
import { factoryPresets, oddPresets } from '../src/car-designer/presets.ts';
import { publishedRows, ZERO_TO_100, ZERO_TO_100_EXCEPTIONS } from '../src/car-designer/published.ts';
import { resolveBuild, resolveBuildWithNotes } from '../src/car-designer/resolve.ts';
import { controlTries, runPass, sensitivityPass } from '../src/car-designer/sensitivity.ts';
import { engineById, engineFacts } from '../src/data/engines.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { editDesign, designFromSpec } from '../src/designer/presets.ts';
import { crankFrontZMm, engineEnvelope } from '../src/engine/envelope.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { evaluateGearbox } from '../src/gearbox-designer/evaluate.ts';
import { designFromRecord, withGearboxType } from '../src/gearbox-designer/presets.ts';
import { lapFor } from '../src/lubrication/scenario.ts';
import { MM } from '../src/scene/geometry.ts';
import { catalogueEntry } from '../src/suspension-designer/catalogue.ts';
import { vehicleSpec } from '../src/vehicle/car.ts';

// The rotary model draws its glow sprites on a canvas, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const figures = (p: CarPerformance): string => JSON.stringify(carMetrics(p).map((m) => [m.id, Number.isFinite(m.value) ? Math.round(m.value * 1e4) : null]));

describe('a donor as made', () => {
  it.each(DONORS.map((c) => c.id))('%s: calibrated v_max, 0–100 against the maker and the canonical lap', (id) => {
    const car = DONORS.find((c) => c.id === id)!;
    const p = evaluateBuild(factoryBuild(id));
    // Nothing moved: the build's car is the donor's record.
    expect(p.massDeltaKg).toBe(0);
    expect(p.car.body).toBe(car.body);
    // v_max is the gearbox model's on the donor's own copy, which the road load is calibrated on.
    const own = evaluateGearbox(designFromRecord(gearboxById(car.gearbox!)!));
    expect(p.vmaxKmh).toBe(own.vmaxKmh);
    expect(p.zeroTo100S).toBe(own.zeroTo100S);
    for (const row of publishedRows(p)) expect(row.ok, `${row.figure}: ${row.model} against ${row.published}`).toBe(true);
    // Exactly the oil page's lap of this car, engine and tyres.
    const canonical = lapFor(designFromSpec(engineById(car.engine)!), engineFacts(car.engine)?.powerHp ?? null, vehicleSpec(car), car.tyre.id);
    expect(p.lapTimeS).toBe(canonical.lapTime);
  });

  it('takes an exception to ±15 % on 0–100 only where the run really is outside it', () => {
    for (const id of Object.keys(ZERO_TO_100_EXCEPTIONS)) {
      const row = publishedRows(evaluateBuild(factoryBuild(id))).find((r) => r.figure === 'zeroTo100')!;
      expect(Math.abs(row.error), id).toBeGreaterThan(ZERO_TO_100);
    }
  });

  it('has no fatal diagnosis', () => {
    for (const preset of factoryPresets()) {
      const fatal = diagnoseBuild(evaluateBuild(preset.build)).filter((d) => d.severity === 'fatal');
      expect(fatal.map((d) => d.title), preset.id).toEqual([]);
    }
  });

  it('is the same with its own engine put back from the engine designer', () => {
    for (const car of DONORS) {
      const factory = evaluateBuild(factoryBuild(car.id));
      const back = evaluateBuild({ ...factoryBuild(car.id), engine: { design: designFromSpec(engineById(car.engine)!) } });
      expect(back.massKg).toBe(factory.massKg);
      expect(back.frontShare).toBe(factory.frontShare);
      expect(back.vmaxKmh).toBeCloseTo(factory.vmaxKmh, 6);
      expect(back.zeroTo100S!).toBeCloseTo(factory.zeroTo100S!, 6);
      expect(back.lapTimeS).toBe(factory.lapTimeS);
    }
  });
});

describe('the odd presets', () => {
  it('put real units in real cars and say what goes wrong', () => {
    const odd = oddPresets();
    expect(odd.map((p) => p.id)).toEqual(['w16-civic', 'e30-civic-engine', 'civic-slicks-dry']);
    for (const p of odd) expect(isFactory(p.build)).toBe(false);
    const w16 = evaluateBuild(odd[0]!.build);
    expect(w16.massDeltaKg).toBeGreaterThan(150);
    expect(w16.frontShare).toBeGreaterThan(w16.donor.body.frontShare);
    const d = diagnoseBuild(w16).map((x) => x.id);
    expect(d).toEqual(expect.arrayContaining(['gearbox-doomed', 'torque', 'clutch']));
    // A dry sump's shallow pan lets the engine down; slicks brake shorter and lap faster.
    const slicks = evaluateBuild(odd[2]!.build);
    const civic = evaluateBuild(factoryBuild('civic-type-r-fk8'));
    expect(slicks.fit.crankDropMm).toBeGreaterThan(30);
    expect(slicks.cgHeightM).toBeLessThan(civic.cgHeightM);
    expect(slicks.lapTimeS).toBeLessThan(civic.lapTimeS);
    expect(slicks.chassis!.brakingM).toBeLessThan(civic.chassis!.brakingM);
  });
});

/** Builds that between them use every kind of unit. */
function sampleBuilds(): CarBuild[] {
  const civic = factoryBuild('civic-type-r-fk8');
  const e30 = factoryBuild('bmw-m3-e30');
  const engine = editDesign(designFromSpec(engineById('i6')!), { bore: designFromSpec(engineById('i6')!).bore + 2 });
  const box = withGearboxType(designFromRecord(gearboxById('manual-rwd')!), 'transaxle');
  return [
    civic,
    e30,
    ...oddPresets().map((p) => p.build),
    resolveBuild({ ...e30, engine: { design: engine } }),
    resolveBuild({ ...civic, gearbox: { design: { ...box, drive: 'fwd' } }, finalDrive: 4.4, differential: 'plate' }),
    resolveBuild({ ...civic, gearbox: { ideal: { gears: 5, spread: 3.6 } } }),
    resolveBuild({ ...factoryBuild('porsche-911-carrera-t-992'), suspension: { catalogue: 'civic-type-r-fk8' }, tyre: { id: 'semi', size: '305/30 ZR21' } }),
    resolveBuild({ ...civic, suspension: { design: { ...catalogueEntry('civic-type-r-fk8')!.design, barMmF: 26 } } }),
    resolveBuild({ ...e30, engine: { catalogue: 'r2' } }),
  ];
}

describe('links', () => {
  it('come back as the same build', () => {
    for (const b of sampleBuilds()) {
      const text = encodeBuild(b);
      expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeBuild(text)).toEqual(b);
    }
  });

  it('are short for a donor as made', () => {
    for (const car of DONORS) expect(encodeBuild(factoryBuild(car.id)).length).toBeLessThan(120);
  });

  it('broken ones still open a build that runs', () => {
    expect(decodeBuild('not a link!')).toBeNull();
    expect(decodeBuild('')).toBeNull();
    const enc = (o: unknown): string => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // Not a build at all: the page opens its default instead.
    expect(decodeBuild(enc([]))).toBeNull();
    expect(decodeBuild(enc('civic'))).toBeNull();
    const wrecks: unknown[] = [
      { donor: 'lada' },
      { donor: 42, engine: 'w16', gearbox: { catalogue: 'nope' }, tyre: { id: 'ice', size: 'round' } },
      { donor: 'bmw-m3-e30', gearbox: { catalogue: 'manual-transaxle' } },
      { donor: 'civic-type-r-fk8', gearbox: { code: '%%%' }, engine: { code: '***' }, suspension: { code: 12 } },
      { donor: 'civic-type-r-fk8', finalDrive: 99, gearbox: { ideal: { gears: 40, spread: -1 } } },
      JSON.parse('{"donor":"civic-type-r-fk8","__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}'),
      { donor: 'bmw-m3-e30', engine: { catalogue: 'r4' }, lubrication: { sump: 'dry', oilL: 6 } },
    ];
    for (const w of wrecks) {
      const b = decodeBuild(enc(w));
      expect(b, JSON.stringify(w)).not.toBeNull();
      expect(DONORS.map((c) => c.id)).toContain(b!.donor);
      expect(Number.isFinite(evaluateBuild(b).lapTimeS)).toBe(true);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('say what they had to change', () => {
    expect(resolveBuildWithNotes({ donor: 'bmw-m3-e30', gearbox: { catalogue: 'manual-transaxle' } }).notes).toEqual([{ id: 'gearbox-type', asked: 'transaxle', donor: 'layshaft' }]);
    expect(resolveBuildWithNotes({ donor: 'nope' }).notes[0]!.id).toBe('donor');
    const rotary = resolveBuildWithNotes({ donor: 'bmw-m3-e30', engine: { catalogue: 'r2' }, lubrication: { sump: 'dry', oilL: 6 } });
    expect(rotary.build.lubrication).toBeNull();
    expect(rotary.notes.map((n) => n.id)).toEqual(['lubrication-rotary']);
    // Choosing what the donor already has is the donor's: one build, one link.
    expect(resolveBuild({ ...factoryBuild('civic-type-r-fk8'), gearbox: { catalogue: 'manual-transaxle' }, suspension: { catalogue: 'civic-type-r-fk8' }, tyre: { id: 'street', size: '245/30 R20' } })).toEqual(factoryBuild('civic-type-r-fk8'));
  });
});

describe('resolveBuild', () => {
  it('is idempotent', () => {
    const inputs: unknown[] = [
      ...sampleBuilds(),
      null,
      'civic',
      { donor: 'porsche-911-carrera-t-992', finalDrive: 1, tyre: { id: 'slick', size: '345/25 ZR21' }, lubrication: { sump: 'integrated-dry', oilL: 0.1 } },
      { donor: 'civic-type-r-fk8', engine: { design: { layout: 'vee', cylinders: 12, bore: 200 } }, gearbox: { design: { gears: 99 } } },
      { donor: 'civic-type-r-fk8', suspension: { design: { massKg: -5, layoutF: 'nothing' } }, gearbox: { ideal: { gears: 7.4, spread: 3.333 } } },
    ];
    for (const x of inputs) {
      const once = resolveBuild(x);
      expect(resolveBuild(once), JSON.stringify(x).slice(0, 80)).toEqual(once);
      expect(resolveBuild(JSON.parse(JSON.stringify(once)))).toEqual(once);
    }
  });
});

describe('no control is dead', () => {
  const read = (p: CarPerformance, only: 'drive' | 'oil' | undefined): string =>
    only === 'drive' ? JSON.stringify(p.gearboxDesign.diff) : only === 'oil' ? JSON.stringify(oilAndWear(p)) : figures(p);
  const builds: Array<[string, CarBuild]> = [
    ['Civic as made', factoryBuild('civic-type-r-fk8')],
    ['E30 as made', factoryBuild('bmw-m3-e30')],
    ['911 with an ideal box', resolveBuild({ ...factoryBuild('porsche-911-carrera-t-992'), gearbox: { ideal: { gears: 6, spread: 4.3 } } })],
  ];
  for (const [label, b] of builds) {
    for (const control of buildControls(b)) {
      it(`${label}: ${control.id} changes something`, () => {
        const tries = controlTries(b, control, 0.15).slice(0, 3);
        expect(tries.length).toBeGreaterThan(0);
        const before = read(evaluateBuild(b), control.only);
        expect(tries.some((x) => read(evaluateBuild(x.build), control.only) !== before)).toBe(true);
      });
    }
  }

  it('every choice tells its options apart by label', () => {
    for (const [, b] of builds) {
      for (const c of buildControls(b)) {
        if (c.kind !== 'choice') continue;
        const labels = c.options(b).map(([, label]) => label);
        expect(new Set(labels).size, c.id).toBe(labels.length);
      }
    }
  });

  it('an edit takes along what belongs to the old unit', () => {
    const b = resolveBuild({ ...factoryBuild('civic-type-r-fk8'), finalDrive: 4.5, tyre: { id: 'semi', size: '245/30 R20' }, lubrication: { sump: 'dry', oilL: 7 } });
    const other = editBuild(b, { donor: 'porsche-911-carrera-t-992' });
    expect(other.tyre).toBeNull();
    expect(other.finalDrive).toBeNull();
    expect(editBuild(b, { engine: { catalogue: 'i6' } }).lubrication).toBeNull();
    expect(editBuild(b, { gearbox: { ideal: { gears: 6, spread: 4 } } }).finalDrive).toBeNull();
  });
});

describe('"what this changes"', () => {
  it('never holds the page longer than 50 ms at a time', () => {
    const b = oddPresets()[0]!.build;
    evaluateBuild(b);
    // The first pass compiles the models; the bound is on a warm page. A slow machine gets two more tries.
    let longest = Infinity;
    for (let attempt = 0; attempt < 3 && longest >= 50; attempt++) {
      const pass = sensitivityPass(b);
      longest = 0;
      for (;;) {
        const t0 = performance.now();
        const r = pass.next();
        longest = Math.max(longest, performance.now() - t0);
        if (r.done) break;
      }
    }
    expect(longest).toBeLessThan(50);
  });

  it('runs in slices to the end and names what each control moves', () => {
    const b = factoryBuild('civic-type-r-fk8');
    const pass = sensitivityPass(b);
    let result = null;
    let slices = 0;
    while (!(result = runPass(pass, 20))) slices++;
    expect(slices).toBeGreaterThan(2);
    const tyre = result.find((c) => c.id === 'tyre')!;
    expect(tyre.effects.map((e) => e.id)).toContain('lap');
    expect(JSON.stringify(b)).toBe(JSON.stringify(factoryBuild('civic-type-r-fk8')));
  });
});

describe('engineEnvelope', () => {
  /** Extrusions carry a bevel of up to 2 mm beyond their outline (geometry.ts), which the box leaves out. */
  const BEVEL_M = 0.005;
  const M_PER_UNIT = 1 / (MM * 1000);

  it.each(['r2', 'r4'])('%s: holds what the rotary model draws of its core', async (id) => {
    const { RotaryEngineModel } = await import('../src/scene/rotary-engine.ts');
    const engine = buildEngine(engineById(id)!);
    const model = new RotaryEngineModel(engine);
    model.group.updateMatrixWorld(true);
    const offset = model.mounted.position.clone().negate();
    const drawn = new THREE.Box3();
    const core = new Set(['housing', 'eccentric', 'flywheel', 'pulley', 'rotor', 'sump']);
    model.mounted.traverse((o) => {
      const key = o.userData.part as string | undefined;
      if ((o as THREE.Mesh).isMesh && key && core.has(key)) drawn.union(new THREE.Box3().setFromObject(o).translate(offset));
    });
    const box = engineEnvelope(engine);
    const front = crankFrontZMm(engine) / 1000;
    const lo = [drawn.min.x * M_PER_UNIT, drawn.min.y * M_PER_UNIT, drawn.min.z * M_PER_UNIT - front];
    const hi = [drawn.max.x * M_PER_UNIT, drawn.max.y * M_PER_UNIT, drawn.max.z * M_PER_UNIT - front];
    for (let k = 0; k < 3; k++) {
      expect(lo[k]!, `min ${'xyz'[k]}`).toBeGreaterThanOrEqual(box.min[k]! - BEVEL_M);
      expect(hi[k]!, `max ${'xyz'[k]}`).toBeLessThanOrEqual(box.max[k]! + BEVEL_M);
      // And it is no loose box either: within 2 cm of the drawing on every side.
      expect(box.max[k]! - hi[k]!).toBeLessThan(0.02);
      expect(lo[k]! - box.min[k]!).toBeLessThan(0.02);
    }
  });

  it('draws a dry sump shallower than a wet one', () => {
    const engine = buildEngine(engineById('i4/civic-type-r-k20c1')!);
    const wet = engineEnvelope(engine);
    const dry = engineEnvelope(engine, { ...engine.spec.systems!, sump: 'dry' });
    expect(dry.min[1]).toBeGreaterThan(wet.min[1] + 0.03);
  });
});
