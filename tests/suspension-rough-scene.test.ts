// The rough-road and shaker scenes of stage P3 (suspensions plan, stage 3): the bars of the ride triangle, the
// damping sweep, the stepped-sine points against the analytic curves and the invariant point with and without tyre
// damping.

import { describe, expect, it } from 'vitest';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import { factorySetup, resolveCorner, type CornerSetup } from '../src/suspension/setup.ts';
import { lineariseQuarter, roughRoadEstimate } from '../src/suspension/evaluate.ts';
import { SteppedSine } from '../src/suspension/shaker.ts';
import {
  clampRough, resolveRoughCorner, ROUGH_BROKEN, ROUGH_DEFAULT, roughSweep, roughTyre, RoughRun, SWEEP_ZETAS, withZeta,
  type RoughScene,
} from '../src/suspension/rough-run.ts';
import {
  GlidingPost, invariantCheck, pointsGap, postAmplitude, SHAKER_FREQS, SHAKER_VELOCITY_MS, SHAKER_ZETAS, standCorner, standCurves,
} from '../src/suspension/shaker-scene.ts';

const corner = jtektCorner();
const factory = factorySetup(corner);
const at = (damper: CornerSetup['damper'], scene: RoughScene = ROUGH_DEFAULT) =>
  resolveRoughCorner(corner, { ...factory, damper }, scene);

describe('the rough road', () => {
  it('moves the comfort and grip bars in opposite directions as the damping changes', () => {
    const soft = new RoughRun(at('comfort'), ROUGH_DEFAULT).run();
    const firm = new RoughRun(at(0.55), ROUGH_DEFAULT).run();
    expect(firm.comfortAw).toBeGreaterThan(soft.comfortAw * 1.1);
    expect(firm.load.dlc).toBeLessThan(soft.load.dlc);
    // Softer than the comfort preset the tyre is worse again while the body is still better than on the firm one.
    const worn = new RoughRun(at(0.1), ROUGH_DEFAULT).run();
    expect(worn.load.dlc).toBeGreaterThan(soft.load.dlc);
    expect(worn.comfortAw).toBeLessThan(firm.comfortAw);
  });

  it('gives the same numbers for the same settings and seed, in portions or in one go', () => {
    const rc = at('sport', { ...ROUGH_DEFAULT, roadClass: 'C' });
    const one = new RoughRun(rc, { ...ROUGH_DEFAULT, roadClass: 'C' }, 4);
    const whole = one.run();
    const parts = new RoughRun(rc, { ...ROUGH_DEFAULT, roadClass: 'C' }, 4);
    let calls = 0;
    while (!parts.advance(1237)) calls++;
    expect(calls).toBeGreaterThan(3);
    expect(parts.result).toEqual(whole);
    expect(parts.trace.bodyAcc).toEqual(one.trace.bodyAcc);
    expect(new RoughRun(rc, { ...ROUGH_DEFAULT, roadClass: 'C', speedKmh: 91 }, 4).run().comfortAw).not.toBe(whole.comfortAw);
    expect(roughSweep(rc, ROUGH_DEFAULT)).toEqual(roughSweep(rc, ROUGH_DEFAULT));
  });

  it('agrees with the frequency-domain estimate it is drawn beside (class B, 90 km/h, 20 s)', () => {
    const rc = at('factory');
    const r = new RoughRun(rc, ROUGH_DEFAULT).run();
    const e = roughSweep(rc, ROUGH_DEFAULT).current;
    expect(Math.abs(r.comfortAw / e.comfortAw - 1)).toBeLessThan(0.15);
    expect(Math.abs(r.load.dlc / e.dlc - 1)).toBeLessThan(0.15);
  });

  it('sweeps the damping with the coefficients the setup itself would give', () => {
    const rc = at('comfort');
    const lin = lineariseQuarter(rc);
    const road = { roadClass: 'B' as const, speedMs: 25 };
    const opts = { patchM: rc.tyre.patchM, tyre: roughTyre(rc) };
    for (const zeta of [0.1, 0.5, 0.9]) {
      const direct = roughRoadEstimate(lineariseQuarter(at(zeta)), road, opts);
      const scaled = roughRoadEstimate(withZeta(lin, rc.zeta, zeta), road, opts);
      expect(Math.abs(scaled.comfortAw / direct.comfortAw - 1)).toBeLessThan(1e-6);
      expect(Math.abs(scaled.dlc / direct.dlc - 1)).toBeLessThan(1e-6);
    }
    const sweep = roughSweep(rc, ROUGH_DEFAULT);
    expect(sweep.zetas).toBe(SWEEP_ZETAS);
    // Comfort wants a soft damper, the tyre a firm one: the model's minima, as docs/suspension-model.md tabulates.
    expect(sweep.bestComfortZeta).toBeGreaterThan(0.1);
    expect(sweep.bestComfortZeta).toBeLessThan(0.2);
    expect(sweep.bestGripZeta).toBeGreaterThan(0.45);
    expect(sweep.bestGripZeta).toBeLessThan(0.65);
  });

  it('loses the road on a broken road at 140 km/h, more with a heavier wheel', () => {
    const scene = { ...ROUGH_DEFAULT, ...ROUGH_BROKEN };
    const r = new RoughRun(at('comfort', scene), scene).run();
    expect(r.load.airShare).toBeGreaterThan(0);
    expect(new RoughRun(at('comfort', ROUGH_DEFAULT), ROUGH_DEFAULT).run().load.airShare).toBe(0);
    const light = roughSweep(at('comfort', { ...ROUGH_DEFAULT, unsprungKg: 30 }), ROUGH_DEFAULT).current;
    const heavy = roughSweep(at('comfort', { ...ROUGH_DEFAULT, unsprungKg: 60 }), ROUGH_DEFAULT).current;
    expect(heavy.dlc).toBeGreaterThan(light.dlc * 1.15);
  });

  it('takes any scene from a link', () => {
    expect(clampRough({ roadClass: 'E' as never, speedKmh: 900, unsprungKg: 41 })).toEqual({ ...ROUGH_DEFAULT, speedKmh: 140 });
    expect(clampRough({})).toEqual(ROUGH_DEFAULT);
  });
});

describe('the stand', () => {
  it.each(['worn', 'comfort', 'track'] as const)('puts the stepped-sine points on the analytic curves within 3 %% (%s)', (damper) => {
    for (const tyre of [true, false]) {
      const curves = standCurves(resolveCorner(corner, { ...factory, damper }), tyre);
      const points = new SteppedSine(curves.corner, { freqsHz: SHAKER_FREQS, velocityMs: SHAKER_VELOCITY_MS }).run();
      expect(points.every((p) => !p.leftPost)).toBe(true);
      expect(pointsGap(curves.lin, points).gap, `tyre damping ${tyre}`).toBeLessThan(0.03);
    }
  });

  it('keeps the corner, its mean damping and its modes, and takes the tyre damping off when asked', () => {
    const rc = resolveCorner(corner, factory);
    const on = standCorner(rc, true);
    const off = standCorner(rc, false);
    expect(lineariseQuarter(on).c).toBeCloseTo(lineariseQuarter(rc).c, 6);
    expect(on.damper.compression).toBe(on.damper.rebound);
    expect(on.tyre.ct).toBe(rc.tyre.ct);
    expect(rc.tyre.ct).toBeGreaterThan(0);
    expect(off.tyre.ct).toBe(0);
    expect(standCorner(rc, true, 0.6).zeta).toBe(0.6);
    expect(lineariseQuarter(standCorner(rc, true, 0.6)).c / lineariseQuarter(on).c).toBeCloseTo(0.6 / rc.zeta, 9);
  });

  it('has three curves through one point without tyre damping (2 %) and near it with (7 %)', () => {
    const rc = resolveCorner(corner, factory);
    const off = invariantCheck(rc, false);
    const on = invariantCheck(rc, true);
    expect(off.ratios).toHaveLength(SHAKER_ZETAS.length);
    expect(off.spread).toBeLessThan(0.02);
    expect(on.spread).toBeLessThan(0.07);
    expect(on.spread).toBeGreaterThan(off.spread + 0.01);
    // The time simulation meets the same point.
    for (const tyre of [false, true]) {
      const check = tyre ? on : off;
      for (const zeta of SHAKER_ZETAS) {
        const [p] = new SteppedSine(standCorner(rc, tyre, zeta), { freqsHz: [check.hz], velocityMs: SHAKER_VELOCITY_MS }).run();
        const ratio = (p.bodyAcc * postAmplitude(check.hz)) / check.bodyAcc;
        expect(Math.abs(ratio - 1), `ζ ${zeta}, tyre ${tyre}`).toBeLessThan(tyre ? 0.07 : 0.02);
      }
    }
  });

  it('moves the invariant point up with a lighter wheel', () => {
    const light = invariantCheck(resolveCorner({ ...corner, unsprungKg: 30 }, factory), false);
    const heavy = invariantCheck(resolveCorner({ ...corner, unsprungKg: 50 }, factory), false);
    expect(light.hz).toBeGreaterThan(heavy.hz);
  });

  it('keeps the phase of the post across a change of frequency, at the same velocity amplitude', () => {
    const post = new GlidingPost(0.08, 1.2);
    const x = 0.37;
    const before = post.heightAt(x);
    post.setHz(12, x);
    // Same phase: the height scales with the amplitude v/ω and nothing else.
    expect(post.heightAt(x) / before).toBeCloseTo(1.2 / 12, 9);
    expect(post.amplitudeM).toBeCloseTo(0.08 / (2 * Math.PI * 12), 12);
  });
});

describe('what the scenes say', async () => {
  const { airAlarm, invariantCaption, percent, rideBars, rideScale, sweepCaption } = await import('../src/ui/suspensions/ride-text.ts');

  it('names the comfort band, flags a wheel off the road and keeps the bars on one scale for any damper', () => {
    const scene = { ...ROUGH_DEFAULT, ...ROUGH_BROKEN };
    const rc = at('worn', scene);
    const r = new RoughRun(rc, scene, 6).run();
    const bars = rideBars(r);
    expect(bars.map((b) => b.id)).toEqual(['comfort', 'grip', 'travel']);
    expect(bars[0].note).toMatch(/неприємно/);
    expect(bars[1].alarm).toBe(true);
    expect(airAlarm(r)).toMatch(/^Колесо втрачає дорогу \d/);
    // The scale comes from the sweep, which does not depend on the damper chosen.
    const firm = at('track', scene);
    const [soft, hard] = [rideScale(roughSweep(rc, scene), null), rideScale(roughSweep(firm, scene), null)];
    expect(hard.comfort / soft.comfort).toBeCloseTo(1, 9);
    expect(hard.grip / soft.grip).toBeCloseTo(1, 9);
    expect(sweepCaption(roughSweep(rc, scene))).toMatch(/ζ 0,1\d.*ζ 0,[5-7]\d/);
    expect(percent(0.0061)).toBe('0,61 %');
    expect(percent(0.997)).toBe('99,7 %');
    expect(percent(0.14)).toBe('14 %');
  });

  it('explains why the curves meet nearly or exactly, with the spread measured', () => {
    const rc = resolveCorner(corner, factory);
    expect(invariantCaption(invariantCheck(rc, true), true)).toMatch(/щонайбільше на 6,0 %.*Вимкни «Демпфування шини»/);
    expect(invariantCaption(invariantCheck(rc, false), false)).toMatch(/0,00 %.*сходяться точно/);
  });
});
