import { describe, expect, it } from 'vitest';
import { ENGINES, engineById, engineFacts, pageChoices } from '../src/data/engines.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec, editDesign } from '../src/designer/presets.ts';
import { torqueMapFor } from '../src/designer/torque-map.ts';
import {
  ATM_BAR,
  HP_PER_KW,
  brakeTorque,
  holdCharge,
  leakCharge,
  manifoldBar,
  mapValue,
  peakPower,
  peakTorque,
  type EngineTorqueMap,
} from '../src/engine/torque-map.ts';

const ALL = ENGINES.flatMap((e) => pageChoices(e.id).map((c) => c.id));

const catalogueMap = (id: string): EngineTorqueMap => {
  const design = designFromSpec(engineById(id)!);
  return torqueMapFor(design, evaluate(design), engineFacts(id)!);
};

describe('the dyno on a catalogue page reads what the article says', () => {
  const rows = ALL.map((id) => {
    const facts = engineFacts(id)!;
    const map = catalogueMap(id);
    const hp = peakPower(map).kw * HP_PER_KW;
    const nm = peakTorque(map).nm;
    return { id, facts, map, hp, nm };
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s: peak power and torque within 0.5 %', (_id, r) => {
    expect(Math.abs(r.hp / r.facts.powerHp - 1)).toBeLessThan(0.005);
    if (r.facts.torqueNm !== null) expect(Math.abs(r.nm / r.facts.torqueNm - 1)).toBeLessThan(0.005);
    expect(r.map.anchor.clamped).toBe(false);
  });

  it('needs factors well inside their limits, and says which engines are furthest off', () => {
    const sorted = [...rows].sort((a, b) => Math.abs(Math.log(b.map.anchor.scale)) - Math.abs(Math.log(a.map.anchor.scale)));
    const worst = sorted.slice(0, 4).map((r) => `${r.id} ×${r.map.anchor.scale.toFixed(2)}`);
    for (const r of rows) {
      expect(r.map.anchor.scale, worst.join(', ')).toBeGreaterThan(0.55);
      expect(r.map.anchor.scale, worst.join(', ')).toBeLessThan(1.5);
    }
  });

  it('never claims more than the maker: the curve stays under both published figures', () => {
    for (const r of rows) {
      r.map.wotNm.forEach((nm, i) => {
        if (r.facts.torqueNm !== null) expect(nm).toBeLessThanOrEqual(r.facts.torqueNm * 1.0001);
        expect((nm * r.map.rpm[i]!) / 9549.3 * HP_PER_KW).toBeLessThanOrEqual(r.facts.powerHp * 1.0001);
      });
    }
  });

  it('keeps the model shape below the ceilings: one factor on every point it does not clip', () => {
    for (const id of ['v8-cross', 'i3', 'i4d', 'b6/porsche-cayman-981-3-4']) {
      const design = designFromSpec(engineById(id)!);
      const perf = evaluate(design);
      const map = torqueMapFor(design, perf, engineFacts(id)!);
      const facts = engineFacts(id)!;
      perf.points.forEach((p, i) => {
        const nm = map.wotNm[i]!;
        const underTorque = facts.torqueNm === null || nm < facts.torqueNm * 0.999;
        const underPower = (nm * p.rpm) / 9549.3 * HP_PER_KW < facts.powerHp * 0.999;
        if (underTorque && underPower) expect(nm).toBeCloseTo(p.torqueNm * map.anchor.scale, 6);
      });
    }
  });
});

describe('the designer shows the model as it is', () => {
  it('a factory design without facts gets no anchor', () => {
    const design = designFromSpec(engineById('i6')!);
    const perf = evaluate(design);
    const map = torqueMapFor(design, perf);
    expect(map.anchor.scale).toBe(1);
    expect(peakTorque(map).nm).toBeCloseTo(perf.peakTorque.torqueNm, 6);
    expect(peakPower(map).kw).toBeCloseTo(perf.peakPower.powerKw, 6);
  });

  it('a first change on a factory design moves the figures by what the change does, not by an anchor', () => {
    const design = designFromSpec(engineById('i6')!);
    expect(design.factory?.published?.powerHp).toBe(engineFacts('i6')!.powerHp);
    const before = torqueMapFor(design);
    const after = torqueMapFor(editDesign(design, { bore: design.bore + 1 }));
    expect(Math.abs(peakPower(after).kw / peakPower(before).kw - 1)).toBeLessThan(0.05);
  });
});

describe('part load follows the Willans line', () => {
  const maps = ['i4', 'v8-cross', 'i3', 'i4d', 'r2', 'w16', 'i1/honda-cg125'].map((id) => [id, catalogueMap(id)] as const);
  const designed = resolveDesign({ ...DEFAULT_DESIGN, throws: [] });
  const all: Array<readonly [string, EngineTorqueMap]> = [...maps, ['designer', torqueMapFor(designed)]];

  it.each(all)('%s: zero at the hold charge, the off-boost curve at 1, full boost at the pressure ratio', (_id, map) => {
    for (const rpm of map.rpm) {
      expect(brakeTorque(map, rpm, holdCharge(map, rpm))).toBeCloseTo(0, 6);
      expect(brakeTorque(map, rpm, 1)).toBeCloseTo(mapValue(map, map.baseNm, rpm), 6);
      const ratio = mapValue(map, map.pressureRatio, rpm);
      if (ratio > 1.001) expect(brakeTorque(map, rpm, ratio)).toBeCloseTo(mapValue(map, map.wotNm, rpm), 6);
    }
  });

  it.each(all)('%s: the map makes sense', (_id, map) => {
    for (let i = 1; i < map.rpm.length; i++) expect(map.rpm[i]!).toBeGreaterThan(map.rpm[i - 1]!);
    expect(map.rpm[map.rpm.length - 1]).toBeCloseTo(map.limitRpm, 6);
    // Friction grows with piston speed.
    expect(map.interceptNm.every((v) => v > 0)).toBe(true);
    expect(map.interceptNm[map.interceptNm.length - 1]!).toBeGreaterThan(map.interceptNm[0]!);
    map.baseNm.forEach((v, i) => expect(v).toBeLessThanOrEqual(map.wotNm[i]! + 1e-9));
    if (map.boostKind !== 'turbo') map.baseNm.forEach((v, i) => expect(v).toBe(map.wotNm[i]));
  });

  it('a turbo map takes its pressure ratio from the model', () => {
    const design = designFromSpec(engineById('i3')!);
    const perf = evaluate(design);
    const map = torqueMapFor(design, perf);
    expect(Math.max(...map.pressureRatio)).toBeCloseTo(1 + Math.max(...perf.points.map((p) => p.boostBar)) / ATM_BAR, 9);
    expect(map.boostKind).toBe('turbo');
    expect(map.spoolRpm).toBeGreaterThan(map.idleRpm);
    expect(map.spoolRpm).toBeLessThan(map.limitRpm);
  });

  it('idles a petrol engine at a small manifold pressure, part of it leaking past the shut throttle', () => {
    // The Willans line with pumping linear in the charge gives 0.12-0.2 bar absolute. Real engines idle at 0.3-0.4:
    // spark retarded for a torque reserve and residual gas take efficiency the line does not know about.
    for (const [id, map] of maps) {
      if (map.diesel) continue;
      const absolute = manifoldBar(map, map.idleRpm, holdCharge(map, map.idleRpm), 1) + ATM_BAR;
      expect(absolute, id).toBeGreaterThan(0.1);
      expect(absolute, id).toBeLessThan(0.45);
      expect(leakCharge(map, map.idleRpm)).toBeLessThan(holdCharge(map, map.idleRpm));
      // The leak is choked: charge per cycle halves when the speed doubles.
      expect(leakCharge(map, map.idleRpm * 2)).toBeCloseTo(leakCharge(map, map.idleRpm) / 2, 9);
    }
  });
});

describe('published figures from a link', () => {
  const base = (): Design => designFromSpec(engineById('i6')!);

  it('are checked like everything else in a link, and resolving stays idempotent', () => {
    const junk = resolveDesign({
      ...base(),
      factory: { idleRpm: 800, revTimeS: 1, rough: 0.3, trim: 0.5, published: { powerHp: -4, powerRpm: Number.NaN, torqueNm: 'x' as unknown as number, torqueRpm: 1e9 } },
    });
    expect(junk.factory!.published).toBeNull();
    const odd = resolveDesign({
      ...base(),
      factory: { idleRpm: 800, revTimeS: 1, rough: 0.3, trim: 0.5, published: { powerHp: 1e6, powerRpm: Number.NaN, torqueNm: 'x' as unknown as number, torqueRpm: 1e9 } },
    });
    expect(odd.factory!.published).toEqual({ powerHp: 3000, powerRpm: null, torqueNm: null, torqueRpm: 25000 });
    expect(resolveDesign(odd)).toEqual(odd);
    const old = resolveDesign({ ...base(), factory: { idleRpm: 800, revTimeS: 1, rough: 0.3, trim: 0.5 } });
    expect(old.factory!.published).toBeNull();
  });
});
