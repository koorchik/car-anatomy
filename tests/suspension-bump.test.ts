// The bump scene's run (src/suspension/bump.ts): what the «Перешкода» page plays back and the numbers it prints.

import { describe, expect, it } from 'vitest';
import {
  BUMP_DEFAULT, BUMP_PUNCH, clampScene, newBumpSample, OBSTACLE_IDS, resolveBumpCorner, runBump, sampleTrace, traceSeconds,
  WHEEL_UNSPRUNG_KG, type BumpScene,
} from '../src/suspension/bump.ts';
import { G } from '../src/suspension/forces.ts';
import { QuarterSim } from '../src/suspension/quarter.ts';
import { RoadBuffer, EventRoad } from '../src/suspension/road.ts';
import { factorySetup, type CornerSetup } from '../src/suspension/setup.ts';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';

const corner = jtektCorner();
const factory = factorySetup(corner);
const resolved = (setup: Partial<CornerSetup> = {}, wheel: BumpScene['wheel'] = 'cast') => resolveBumpCorner(corner, { ...factory, ...setup }, wheel);

describe('bump run', () => {
  it('peaks within 10 % of RK4 at 100 kHz on the 50 mm × 0.5 m bump at 30 km/h (what ×1 shows)', () => {
    const rc = resolved();
    const run = runBump(rc, BUMP_DEFAULT);
    const v = BUMP_DEFAULT.speedKmh / 3.6;
    const sim = new QuarterSim(rc, new RoadBuffer(new EventRoad(run.trace.events), rc.tyre.freeRadiusM, rc.tyre.patchM), v);
    sim.reset(0);
    const h = 1e-5;
    let peak = 0;
    for (let i = 0, n = Math.round(traceSeconds(run.trace) / h); i < n; i++) {
      sim.stepRk4(h);
      peak = Math.max(peak, Math.abs(sim.out.bodyAcc));
    }
    expect(Math.abs(run.stats.bodyPeakG / (peak / G) - 1)).toBeLessThan(0.1);
    expect(run.stats.bodyPeakG).toBeGreaterThan(0.3);
  });

  it('starts at rest: the spring carries the static load through the motion ratio and the damper nothing', () => {
    for (const setup of [{}, { rideHeightM: -0.04, springNmm: 15 }, { rideHeightM: 0.03, damper: 'track' as const, pressureBar: 1.6 }]) {
      const rc = resolved(setup);
      const run = runBump(rc, BUMP_DEFAULT);
      const s = sampleTrace(run.trace, 0, newBumpSample());
      // mr = −dL/dq is the spring's travel per wheel travel, so the spring's force is the load times the wheel's travel
      // per spring travel (1/mr): the static load × the motion ratio in the wheel-over-spring convention.
      expect(s.springN).toBeCloseTo((rc.sprungKg * G) / rc.atRest.mrSpring, 0);
      expect(Math.abs(s.damperN)).toBeLessThan(1e-6);
      expect(s.stopN).toBe(0);
      expect(s.tyreN).toBeCloseTo((rc.sprungKg + rc.unsprungKg) * G, 0);
      // Nothing moves before the wheel reaches the obstacle.
      const before = sampleTrace(run.trace, run.trace.reachS - 0.1, newBumpSample());
      expect(Math.abs(before.travel - rc.staticTravelM)).toBeLessThan(1e-6);
    }
  });

  it('hops again and again on a worn damper and once at most on a track one', () => {
    const worn = runBump(resolved({ damper: 'worn' }), BUMP_DEFAULT).stats;
    const track = runBump(resolved({ damper: 'track' }), BUMP_DEFAULT).stats;
    expect(worn.hops).toBeGreaterThanOrEqual(2);
    expect(track.hops).toBeLessThanOrEqual(1);
    expect(worn.airS).toBeGreaterThan(2 * track.airS);
    // The track damper jerks the body harder (step 4) and settles sooner.
    expect(track.bodyPeakG).toBeGreaterThan(worn.bodyPeakG);
    expect(track.settleS).not.toBeNull();
    expect(worn.settleS === null || worn.settleS > track.settleS!).toBe(true);
  });

  it('rolls slowly over the bump with the body and swallows it at speed (step 5)', () => {
    const rc = resolved();
    const slow = runBump(rc, { ...BUMP_DEFAULT, speedKmh: 10 }).stats;
    const fast = runBump(rc, { ...BUMP_DEFAULT, speedKmh: 120 }).stats;
    expect(slow.airS).toBe(0);
    expect(slow.hitHz!).toBeLessThan(rc.hopHz);
    expect(fast.hitHz!).toBeGreaterThan(rc.hopHz);
    expect(fast.bodyRiseM).toBeLessThan(slow.bodyRiseM / 3);
  });

  it('reaches the bump stop on the 120 mm kerb at 40 km/h (step 8) and not on the bump', () => {
    const rc = resolved();
    const punch = runBump(rc, BUMP_PUNCH).stats;
    expect(punch.stopHit).toBe(true);
    expect(punch.travelMaxM).toBeGreaterThan(punch.toStopM);
    expect(punch.stopPeakG).toBeGreaterThan(2);
    const bump = runBump(rc, BUMP_DEFAULT).stats;
    expect(bump.stopHit).toBe(false);
    expect(bump.travelMaxM).toBeLessThan(bump.toStopM);
  });

  it('changes its numbers with the setup and the wheel', () => {
    const base = runBump(resolved(), BUMP_DEFAULT).stats;
    expect(runBump(resolved({ springNmm: 60 }), BUMP_DEFAULT).stats.bodyPeakG).not.toBeCloseTo(base.bodyPeakG, 2);
    expect(runBump(resolved({ pressureBar: 3.2 }), BUMP_DEFAULT).stats.tyreMax).not.toBeCloseTo(base.tyreMax, 2);
    expect(runBump(resolved({ rideHeightM: -0.04 }), BUMP_DEFAULT).stats.toStopM).toBeLessThan(base.toStopM - 0.03);
    // Lighter wheels keep the tyre on the road longer; the body hardly notices (step 7).
    const steel = runBump(resolved({}, 'steel'), BUMP_DEFAULT).stats;
    const forged = runBump(resolved({}, 'forged'), BUMP_DEFAULT).stats;
    expect(forged.airS).toBeLessThan(steel.airS);
    expect(Math.abs(forged.bodyPeakG - steel.bodyPeakG)).toBeLessThan(0.05);
    expect(resolved({}, 'steel').unsprungKg - resolved({}, 'forged').unsprungKg).toBeCloseTo(WHEEL_UNSPRUNG_KG.steel - WHEEL_UNSPRUNG_KG.forged, 9);
  });

  it('runs every obstacle with a load that never pulls and a trace the page can play at any time', () => {
    const rc = resolved();
    const s = newBumpSample();
    for (const obstacle of OBSTACLE_IDS) {
      const run = runBump(rc, { ...BUMP_DEFAULT, obstacle });
      expect(run.stats.tyreMin).toBeGreaterThanOrEqual(0);
      expect(run.trace.n).toBeGreaterThan(1000);
      // Sample times give the samples back; between them the playback interpolates; past the end it holds.
      expect(sampleTrace(run.trace, 0.5, s).travel).toBeCloseTo(run.trace.travel[500]!, 6);
      sampleTrace(run.trace, 1e3, s);
      expect(s.x).toBeCloseTo(run.trace.x[run.trace.n - 1]!, 6);
    }
  });

  it('takes any scene from a link', () => {
    expect(clampScene({ obstacle: 'cliff' as never, speedKmh: 900, wheel: undefined })).toEqual({ ...BUMP_DEFAULT, speedKmh: 120 });
    expect(clampScene({ speedKmh: Number.NaN })).toEqual(BUMP_DEFAULT);
  });

  it('computes a run fast enough to follow a slider', () => {
    const rc = resolved();
    runBump(rc, BUMP_DEFAULT);
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) runBump(rc, { ...BUMP_DEFAULT, speedKmh: 30 + i });
    expect((performance.now() - t0) / 5).toBeLessThan(40);
  });
});

describe('what the scene says about a run', async () => {
  const { bumpCaption, bumpRows } = await import('../src/ui/suspensions/bump-text.ts');
  const rc = resolved();

  it('explains the obstacle by its frequency against the body and the wheel', () => {
    expect(bumpCaption(runBump(rc, { ...BUMP_DEFAULT, obstacle: 'hump', speedKmh: 10 }).stats)).toContain('перекочується');
    expect(bumpCaption(runBump(rc, { ...BUMP_DEFAULT, speedKmh: 15 }).stats)).toContain('пружина й амортизатор');
    expect(bumpCaption(runBump(rc, { ...BUMP_DEFAULT, speedKmh: 60 }).stats)).toContain('вища за підскок');
    expect(bumpCaption(runBump(rc, { ...BUMP_DEFAULT, obstacle: 'kerb' }).stats)).toContain('сходинка');
  });

  it('flags the wheel off the road, the bump stop and a corner that never settles', () => {
    const worn = bumpRows(runBump(resolved({ damper: 'worn' }), BUMP_DEFAULT).stats);
    expect(worn.find((r) => r.id === 'air')).toMatchObject({ alarm: true, value: expect.stringContaining('відривалося 4 рази') });
    const punch = bumpRows(runBump(rc, BUMP_PUNCH).stats);
    expect(punch.find((r) => r.id === 'travel')).toMatchObject({ alarm: true, label: 'Удар у відбійник' });
    const slow = bumpRows(runBump(rc, { ...BUMP_DEFAULT, speedKmh: 10 }).stats);
    expect(slow.find((r) => r.id === 'air')).toMatchObject({ alarm: false });
    expect(slow.find((r) => r.id === 'settle')!.value).toMatch(/^за /);
  });
});
