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
/** Any car of the page with its own well, cached the same way. */
const pageRun = (id: string, kind: SumpKind, tyre: TyreId, oilDeltaL: number, accumulator = false): LubeRun => {
  const key = `${id} ${kind} ${tyre} ${oilDeltaL} ${accumulator}`;
  let r = cache.get(key);
  if (!r) {
    const c = sumpCarFor(id)!;
    const s = engineById(id)!;
    r = oilRun(buildEngine(s), systemsOf(s), c.vehicle, lapFor(designFromSpec(s), engineFacts(id)?.powerHp ?? null, c.vehicle, tyre), { kind, oilDeltaL, accumulator, place: c.well });
    cache.set(key, r);
  }
  return r;
};

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

  // Calibration targets, not laws of physics: agreement with sources, met by global constants alone
  // (docs/lubrication-model.md, "Calibration").
  it('keeps the factory wet pan above the need on street tyres with full oil', () => {
    expect(run('wet', 'street', 0).summary.belowNeedS).toBe(0);
  });
  it('survives a litre short on street tyres and full oil on semi-slicks, as GM sells this pan for track days', () => {
    expect(run('wet', 'street', -1).summary.wearPerLap).toBeLessThanOrEqual(0.02);
    expect(run('wet', 'semi', 0).summary.wearPerLap).toBeLessThanOrEqual(0.01);
  });
  it('dips on slicks even with full oil, deeper a litre short, and wears no more than a fifth of the bearings a lap', () => {
    // Slicks without downforce give 1.4-1.8 g; BMW rates even the S65's wet sump, with its own return pump, to 1.4 g.
    expect(run('wet', 'slick', 0).summary.belowNeedS).toBeGreaterThan(1);
    expect(run('wet', 'slick', -1).summary.belowNeedS).toBeGreaterThan(run('wet', 'slick', 0).summary.belowNeedS);
    expect(run('wet', 'slick', 0).summary.wearPerLap).toBeLessThanOrEqual(0.2);
  });
  it('a track pan holds on semi-slicks with full oil', () => {
    expect(run('baffled', 'semi', 0).summary.belowNeedS).toBe(0);
  });
  it('halves the time below the need with an accumulator, and refilling it never pushes the pressure below the need', () => {
    // Settings that do dip: two litres short here, a litre short in the smaller pans of the Civic and the STI.
    const cases: Array<[LubeRun, LubeRun]> = [[run('wet', 'semi', -2), run('wet', 'semi', -2, true)]];
    for (const id of ['i4/civic-type-r-k20c1', 'b4']) cases.push([pageRun(id, 'wet', 'semi', -1), pageRun(id, 'wet', 'semi', -1, true)]);
    for (const [without, withAcc] of cases) {
      expect(without.summary.belowNeedS).toBeGreaterThan(1);
      expect(withAcc.summary.belowNeedS).toBeLessThanOrEqual(without.summary.belowNeedS / 2);
      for (let i = 1; i < withAcc.count; i++) {
        if (withAcc.accOilL[i]! > withAcc.accOilL[i - 1]! + 1e-9) expect(withAcc.pressure[i]!).toBeGreaterThanOrEqual(withAcc.need[i]!);
      }
    }
  });

  it('shows the lifters bleeding down only after the gallery has carried the bad oil to them', () => {
    // A litre short on slicks with the accumulator's help gone: the pump draws air in the carousel.
    const r = oilRun(engine, systems, car.vehicle, lap('slick'), { kind: 'wet', oilDeltaL: -2.5, accumulator: false, place: car.well });
    const setup = setupFor(engine, systems, car.vehicle, { kind: 'wet', oilDeltaL: -2.5, accumulator: false, place: car.well });
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
    const r = oilRun(engine, systems, car.vehicle, lap('slick'), { kind: 'wet', oilDeltaL: -2.5, accumulator: false, place: car.well });
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

describe('the four sumps on the same lap', () => {
  // Settings where the oil runs short, so the order is tested on numbers that are not all zero.
  const SHORT: Array<[string, TyreId, number]> = [
    ['b4', 'semi', -1], ['b4', 'slick', -1], ['b4', 'semi', -2], ['b4', 'slick', -2],
    ['i4/civic-type-r-k20c1', 'semi', -1], ['i4/civic-type-r-k20c1', 'slick', -1], ['i4/civic-type-r-k20c1', 'semi', -2], ['i4/civic-type-r-k20c1', 'slick', -2],
  ];

  it('orders them: each kind keeps at least as much oil at the pickup as the one before', () => {
    for (const [id, tyre, oil] of SHORT) {
      const w = SUMP_KINDS.map((kind) => pageRun(id, kind, tyre, oil).summary.wearPerLap);
      const below = SUMP_KINDS.map((kind) => pageRun(id, kind, tyre, oil).summary.belowNeedS);
      expect(below[0], `${id} ${tyre} ${oil}: the wet pan must dip for the order to mean anything`).toBeGreaterThan(1);
      for (let i = 1; i < w.length; i++) {
        expect(w[i]!, `${SUMP_KINDS[i]} ${id} ${tyre} ${oil}`).toBeLessThanOrEqual(w[i - 1]! + 1e-9);
        expect(below[i]!, `${SUMP_KINDS[i]} ${id} ${tyre} ${oil}`).toBeLessThanOrEqual(below[i - 1]! + 1e-9);
      }
      // A track pan holds oil round the pickup that a factory well lets go, and a dry sump never dips.
      expect(below[1]!).toBeLessThan(below[0]!);
      expect(below[3]).toBe(0);
    }
  });

  it('does not collapse: with two litres short on slicks the STI tells all four apart, worst to best', () => {
    // The page offers this setting. Wet, baffled, integrated dry and dry, strictly in that order of time below the need.
    const below = SUMP_KINDS.map((kind) => pageRun('b4', kind, 'slick', -2).summary.belowNeedS);
    expect(below[3]).toBe(0);
    for (let i = 1; i < below.length; i++) expect(below[i]!, SUMP_KINDS[i]).toBeLessThan(below[i - 1]!);
    expect(below[2]).toBeGreaterThan(1);
  });

  it('never lets more grip or less oil help a factory wet pan', () => {
    for (const id of ['b4', 'i4/civic-type-r-k20c1']) {
      const w = (tyre: TyreId, oil: number): number => pageRun(id, 'wet', tyre, oil).summary.wearPerLap;
      // Wear per lap at the dipstick's minimum; with less oil the shorter lap on slicks can wear less per lap.
      expect(w('semi', -1), id).toBeGreaterThanOrEqual(w('street', -1));
      expect(w('slick', -1), id).toBeGreaterThanOrEqual(w('semi', -1));
      for (const tyre of TYRE_IDS) {
        expect(w(tyre, -1), `${id} ${tyre}`).toBeGreaterThanOrEqual(w(tyre, 0));
        expect(w(tyre, -2), `${id} ${tyre}`).toBeGreaterThanOrEqual(w(tyre, -1));
      }
    }
  });

  it('keeps an integrated dry sump no worse than a track pan and a dry sump above the need, on every car', () => {
    for (const c of SUMP_CARS) {
      for (const tyre of TYRE_IDS) {
        for (const oil of [0, -1, -2]) {
          const baffled = pageRun(c.engineId, 'baffled', tyre, oil).summary;
          const integrated = pageRun(c.engineId, 'integrated-dry', tyre, oil).summary;
          expect(integrated.wearPerLap, `${c.engineId} ${tyre} ${oil}`).toBeLessThanOrEqual(baffled.wearPerLap + 1e-9);
          expect(pageRun(c.engineId, 'dry', tyre, oil).summary.belowNeedS, `${c.engineId} ${tyre} ${oil}`).toBe(0);
        }
      }
    }
  }, 60_000);
});

describe('every car of the page', () => {
  // Calibration targets from sources (docs/lubrication-model.md): a factory wet pan holds on street tyres (GM sells
  // wet-sump cars for track days on 1.10 g tyres), and slicks at 1.4-1.8 g go past what even BMW's S65 wet sump with
  // its own return pump is rated for (1.4 g). Porsche sells the GT4 with its integrated dry sump on Cup 2 tyres and
  // goes to a separate tank only on the RS models.
  it('holds with a plain wet pan and full oil on street tyres, and dips with it on slicks', () => {
    for (const c of SUMP_CARS) {
      expect(pageRun(c.engineId, 'wet', 'street', 0).summary.wearPerLap, c.engineId).toBeLessThanOrEqual(0.001);
      expect(pageRun(c.engineId, 'wet', 'slick', 0).summary.belowNeedS, c.engineId).toBeGreaterThan(1);
    }
  }, 60_000);

  it('holds with an integrated dry sump and full oil on semi-slicks', () => {
    for (const c of SUMP_CARS) expect(pageRun(c.engineId, 'integrated-dry', 'semi', 0).summary.belowNeedS, c.engineId).toBe(0);
  }, 60_000);

  it('survives a hundred laps on street tyres with its own sump and full oil', () => {
    for (const c of SUMP_CARS) {
      const s = engineById(c.engineId)!;
      const r = oilRun(buildEngine(s), systemsOf(s), c.vehicle, lapFor(designFromSpec(s), engineFacts(c.engineId)?.powerHp ?? null, c.vehicle, 'street'), { kind: systemsOf(s).sump, oilDeltaL: 0, accumulator: false, place: c.well });
      expect(r.summary.wearPerLap, c.engineId).toBeLessThanOrEqual(0.01);
    }
  });
});
