import { describe, expect, it } from 'vitest';
import { engineById, engineFacts } from '../src/data/engines.ts';
import { SUMP_CARS, sumpCarFor } from '../src/data/sump-cars.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { SUMP_KINDS, systemsOf, type SumpKind } from '../src/engine/systems-spec.ts';
import { worstMoments } from '../src/lubrication/events.ts';
import { LubeRunner, runLubrication, type LubeRun } from '../src/lubrication/run.ts';
import { lapFor, oilRun, setupFor } from '../src/lubrication/scenario.ts';
import { TYRE_IDS, type TyreId } from '../src/vehicle/vehicle.ts';

const ID = 'v8-cross/camaro-ss-lt1';
const spec = engineById(ID)!;
const engine = buildEngine(spec);
const systems = systemsOf(spec);
const car = sumpCarFor(ID)!;
const design = designFromSpec(spec);
const lap = (tyre: TyreId) => lapFor(design, engineFacts(ID)!.powerHp, car.vehicle, tyre);
const cache = new Map<string, LubeRun>();
const run = (kind: SumpKind, tyre: TyreId, oilDeltaL: number, accumulator = false): LubeRun => {
  const key = `${kind} ${tyre} ${oilDeltaL} ${accumulator}`;
  let r = cache.get(key);
  if (!r) {
    r = oilRun(engine, systems, car.vehicle, lap(tyre), { kind, oilDeltaL, accumulator, place: car.well });
    cache.set(key, r);
  }
  return r;
};
const wear = (kind: SumpKind, tyre: TyreId, oil: number): number => run(kind, tyre, oil).summary.wearPerLap;

describe('a Camaro SS lapping the test circuit', () => {
  it('works in slices exactly as in one go', () => {
    const setup = setupFor(engine, systems, car.vehicle, { kind: 'wet', oilDeltaL: -1, accumulator: true, place: 'middle' });
    const whole = runLubrication(setup, lap('slick'), true);
    const runner = new LubeRunner(setup, lap('slick'), true);
    while (!runner.advance(1500));
    for (const key of ['pressure', 'levelBox', 'wearRate', 'accOilL'] as const) {
      expect(Buffer.from(runner.run[key].buffer).equals(Buffer.from(whole[key].buffer)), key).toBe(true);
    }
  });

  it('orders the sumps: each kind keeps at least as much oil at the pickup as the one before', () => {
    for (const tyre of TYRE_IDS) {
      for (const oil of [0, -1]) {
        const w = SUMP_KINDS.map((kind) => wear(kind, tyre, oil));
        for (let i = 1; i < w.length; i++) expect(w[i]!, `${SUMP_KINDS[i]} ${tyre} ${oil}`).toBeLessThanOrEqual(w[i - 1]! + 1e-9);
      }
    }
    // More grip and less oil never help a wet pan.
    expect(wear('wet', 'semi', -1)).toBeGreaterThanOrEqual(wear('wet', 'street', -1));
    expect(wear('wet', 'slick', -1)).toBeGreaterThanOrEqual(wear('wet', 'semi', -1));
    for (const tyre of TYRE_IDS) expect(wear('wet', tyre, -1)).toBeGreaterThanOrEqual(wear('wet', tyre, 0));
  });

  // Calibration targets, not laws of physics: agreement with sources, met by global constants alone
  // (docs/lubrication-model.md, "Calibration").
  it('keeps the factory wet pan above the need on street tyres with full oil', () => {
    expect(run('wet', 'street', 0).summary.belowNeedS).toBe(0);
  });
  it('dips on street tyres with a litre short, but the bearings survive the lap easily', () => {
    const s = run('wet', 'street', -1).summary;
    expect(s.belowNeedS).toBeGreaterThan(1);
    expect(s.wearPerLap).toBeLessThanOrEqual(0.02);
  });
  it('dips on semi-slicks with full oil without real wear', () => {
    const s = run('wet', 'semi', 0).summary;
    expect(s.belowNeedS).toBeGreaterThan(0);
    expect(s.wearPerLap).toBeLessThanOrEqual(0.01);
  });
  it('dips for seconds a lap on slicks with full oil, and wears no more than a fifth of the bearings a lap', () => {
    const s = run('wet', 'slick', 0).summary;
    expect(s.belowNeedS).toBeGreaterThan(1);
    expect(s.belowNeedS).toBeGreaterThan(run('wet', 'semi', 0).summary.belowNeedS);
    expect(s.wearPerLap).toBeLessThanOrEqual(0.2);
    expect(run('wet', 'slick', -1).summary.wearPerLap).toBeGreaterThan(0);
  });
  it('a track pan holds on semi-slicks, but its doors do not save a litre short through long corners on slicks', () => {
    expect(run('baffled', 'semi', 0).summary.belowNeedS).toBe(0);
    expect(run('baffled', 'slick', -1).summary.wearPerLap).toBeGreaterThan(0);
  });
  it('an integrated dry sump is no worse than a track pan, and a dry sump never dips', () => {
    for (const tyre of TYRE_IDS) {
      for (const oil of [0, -1]) {
        expect(wear('integrated-dry', tyre, oil)).toBeLessThanOrEqual(wear('baffled', tyre, oil));
        expect(run('dry', tyre, oil).summary.belowNeedS).toBe(0);
      }
    }
  });

  it('halves the time below the need with an accumulator, and refilling it never pushes the pressure below the need', () => {
    for (const oil of [0, -1]) {
      const without = run('wet', 'semi', oil).summary.belowNeedS;
      const withAcc = run('wet', 'semi', oil, true);
      expect(withAcc.summary.belowNeedS).toBeLessThanOrEqual(without / 2 + 1e-9);
      for (let i = 1; i < withAcc.count; i++) {
        if (withAcc.accOilL[i]! > withAcc.accOilL[i - 1]! + 1e-9) expect(withAcc.pressure[i]!).toBeGreaterThanOrEqual(withAcc.need[i]!);
      }
    }
  });

  it('shows the lifters bleeding down only after the gallery has carried the bad oil to them', () => {
    const r = run('wet', 'slick', -1);
    const setup = setupFor(engine, systems, car.vehicle, { kind: 'wet', oilDeltaL: -1, accumulator: false, place: car.well });
    const bad = (i: number): boolean => r.pumpSupply[i]! < 0.85 || r.pressure[i]! < 0.5 * r.need[i]!;
    let checked = 0;
    for (let i = 1; i < r.count; i++) {
      if (!(r.lifters[i] && !r.lifters[i - 1])) continue;
      // Plug flow: what reaches the lifters now entered the gallery one gallery volume of flow ago.
      let carried = 0;
      let m = i;
      while (m > 0 && carried < setup.galleryL) carried += r.delivered[--m]! * r.dt;
      if (m === 0) continue;
      let seen = false;
      for (let j = Math.max(0, m - 3); j <= Math.min(i, m + 3); j++) seen ||= bad(j);
      expect(seen, `lifters at ${(i * r.dt).toFixed(2)} s`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(r.lifters.some((v) => v === 1)).toBe(true);
  });

  it('names the worst moments in the corners where they happen', () => {
    const r = run('wet', 'slick', -1);
    const moments = worstMoments(r, lap('slick'));
    expect(moments.length).toBeGreaterThan(0);
    for (const m of moments) {
      expect(m.end).toBeGreaterThanOrEqual(m.start);
      expect(m.shortfall).toBeGreaterThan(0);
    }
    expect(moments[0]!.sector).not.toBe('');
  });

  it('runs two laps quickly enough to recompute on every click', () => {
    const t0 = performance.now();
    runLubrication(setupFor(engine, systems, car.vehicle, { kind: 'baffled', oilDeltaL: 0, accumulator: false, place: 'middle' }), lap('semi'));
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('every car of the page', () => {
  it('survives a hundred laps on street tyres with its own sump and full oil', () => {
    for (const c of SUMP_CARS) {
      const s = engineById(c.engineId)!;
      const r = oilRun(buildEngine(s), systemsOf(s), c.vehicle, lapFor(designFromSpec(s), engineFacts(c.engineId)?.powerHp ?? null, c.vehicle, 'street'), { kind: systemsOf(s).sump, oilDeltaL: 0, accumulator: false, place: c.well });
      expect(r.summary.wearPerLap, c.engineId).toBeLessThanOrEqual(0.01);
    }
  });
});
