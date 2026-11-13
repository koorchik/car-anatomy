import { describe, expect, it } from 'vitest';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import { factorySetup, resolveCorner, type ResolvedCorner } from '../src/suspension/setup.ts';
import { FLAT_ROAD, QuarterSim } from '../src/suspension/quarter.ts';
import { EventRoad, RoadBuffer, type RoadEvent } from '../src/suspension/road.ts';
import { G } from '../src/suspension/forces.ts';

const corner = jtektCorner();
const factory = factorySetup(corner);
const base = resolveCorner(corner, factory);

const roadFor = (rc: ResolvedCorner, events: RoadEvent[]): RoadBuffer => new RoadBuffer(new EventRoad(events), rc.tyre.freeRadiusM, rc.tyre.patchM);

/** Runs a corner over a road for `seconds` and keeps the peaks. RK4 when `rk4` is a step, Euler at 1 ms otherwise. */
function run(rc: ResolvedCorner, events: RoadEvent[], speedMs: number, seconds: number, rk4 = 0) {
  const sim = new QuarterSim(rc, roadFor(rc, events), speedMs);
  sim.reset(0);
  const h = rk4 || 0.001;
  const n = Math.round(seconds / h);
  let peakAcc = 0;
  let peakTyre = 0;
  let minTyre = Infinity;
  let air = 0;
  for (let i = 0; i < n; i++) {
    if (rk4) sim.stepRk4(h);
    else sim.step(h);
    const o = sim.out;
    peakAcc = Math.max(peakAcc, Math.abs(o.bodyAcc));
    peakTyre = Math.max(peakTyre, o.tyreN);
    minTyre = Math.min(minTyre, o.tyreN);
    if (o.inAir) air += h;
  }
  return { peakAcc, peakTyre, minTyre, air };
}

describe('quarter car at rest', () => {
  it('stands on the tyre with the whole corner weight at the static travel and stays there', () => {
    for (const setup of [factory, { ...factory, rideHeightM: -0.04, springNmm: 15, pressureBar: 1.6 }, { ...factory, rideHeightM: 0.03, damper: 'track' as const }]) {
      const rc = resolveCorner(corner, setup);
      const sim = new QuarterSim(rc, FLAT_ROAD, 0);
      const o = sim.observe();
      expect(o.tyreN).toBeCloseTo((corner.sprungKg + corner.unsprungKg) * G, 6);
      expect(o.travel).toBeCloseTo(rc.staticTravelM, 12);
      expect(Math.abs(o.bodyAcc)).toBeLessThan(1e-9);
      expect(Math.abs(o.wheelAcc)).toBeLessThan(1e-9);
      for (let i = 0; i < 2000; i++) sim.step();
      expect(Math.abs(sim.out.travel - rc.staticTravelM)).toBeLessThan(1e-9);
      expect(sim.out.damperN).toBeCloseTo(0, 6);
    }
  });
});

describe('free decay', () => {
  /** Roots of a quartic by Durand–Kerner, as [re, im] pairs. */
  function quarticRoots(c: number[]): Array<[number, number]> {
    const a = c.map((v) => v / c[0]);
    let z: Array<[number, number]> = [[0.4, 0.9], [-0.7, 0.3], [0.2, -1.1], [-0.3, -0.5]].map(([r, i]) => [r * 50, i * 50]);
    const mul = (p: [number, number], q: [number, number]): [number, number] => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
    const div = (p: [number, number], q: [number, number]): [number, number] => {
      const d = q[0] * q[0] + q[1] * q[1];
      return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
    };
    for (let it = 0; it < 500; it++) {
      z = z.map((zi, i) => {
        let p: [number, number] = [1, 0];
        for (let k = 1; k <= 4; k++) p = [mul(p, zi)[0] + a[k], mul(p, zi)[1]];
        let den: [number, number] = [1, 0];
        z.forEach((zj, j) => {
          if (j !== i) den = mul(den, [zi[0] - zj[0], zi[1] - zj[1]]);
        });
        const step = div(p, den);
        return [zi[0] - step[0], zi[1] - step[1]];
      });
    }
    return z;
  }

  it('rings at the frequency and damping of the linear two-mass system (3 %)', () => {
    // A linear damper (same both ways, no knee) of about ζ 0.2, linear spring; 30 mm off rest, then let go.
    const mr = base.atRest.mrDamper;
    const cw = 4 * Math.PI * 0.2 * base.bodyHz * corner.sprungKg;
    const rc: ResolvedCorner = { ...base, damper: { ...base.damper, compression: cw / mr ** 2, rebound: cw / mr ** 2, highRatio: 1 } };
    const sim = new QuarterSim(rc, FLAT_ROAD, 0);
    sim.reset(0);
    const z0 = rc.bodyStaticM;
    // Body 30 mm up, wheel left on the ground: the suspension starts 30 mm into droop.
    sim.state[0] += 0.03;
    const peaks: Array<[number, number]> = [];
    let prev = 0;
    let prev2 = 0;
    for (let i = 0; i < 4000; i++) {
      sim.step();
      const x = sim.state[0] - z0;
      if (i > 1 && prev > prev2 && prev >= x && prev > 0) peaks.push([(i - 1) * 0.001, prev]);
      prev2 = prev;
      prev = x;
    }
    // The first peak is the release itself; the next two give the period and the decrement.
    const [t1, x1] = peaks[0];
    const [t2, x2] = peaks[1];
    const delta = Math.log(x1 / x2);
    const zetaSim = delta / Math.sqrt(4 * Math.PI ** 2 + delta ** 2);
    const wnSim = (2 * Math.PI) / (t2 - t1) / Math.sqrt(1 - zetaSim ** 2);

    // det(M s² + C s + K) for (z_b, w) with the corner's linearised rates.
    const ms = corner.sprungKg;
    const mu = corner.unsprungKg;
    const k = rc.wheelRate;
    const c = cw;
    const kt = rc.tyre.kt;
    const ct = rc.tyre.ct;
    const p1 = [ms, c, k];
    const p2 = [mu, c + ct, k + kt];
    const coeffs = [0, 0, 0, 0, 0];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) coeffs[i + j] += p1[i] * p2[j];
    const cross = [c * c, 2 * c * k, k * k];
    for (let i = 0; i < 3; i++) coeffs[i + 2] -= cross[i];
    const roots = quarticRoots(coeffs);
    const body = roots.reduce((best, r) => (Math.hypot(...r) < Math.hypot(...best) ? r : best));
    const wn = Math.hypot(body[0], body[1]);
    const zeta = -body[0] / wn;
    expect(Math.abs(wnSim / wn - 1)).toBeLessThan(0.03);
    expect(Math.abs(zetaSim / zeta - 1)).toBeLessThan(0.03);
    expect(zeta).toBeGreaterThan(0.15);
  });
});

describe('integrator', () => {
  const bump: RoadEvent[] = [{ kind: 'bump', atM: 3, lengthM: 0.5, heightM: 0.05 }];

  it.each([
    ['15 m/s (plan test)', 15],
    ['30 km/h (stage acceptance)', 30 / 3.6],
  ])('semi-implicit Euler at 1 kHz matches RK4 at 100 kHz on a 50 mm × 0.5 m bump at %s within 3 %', (_name, v) => {
    const seconds = 3 / v + 1.5;
    const euler = run(base, bump, v, seconds);
    const rk4 = run(base, bump, v, seconds, 1e-5);
    expect(Math.abs(euler.peakAcc / rk4.peakAcc - 1)).toBeLessThan(0.03);
    expect(Math.abs(euler.peakTyre / rk4.peakTyre - 1)).toBeLessThan(0.03);
    // The bump is felt: the body takes well over a tenth of g and the tyre at least half again its static load.
    expect(rk4.peakAcc).toBeGreaterThan(0.1 * G);
    expect(rk4.peakTyre).toBeGreaterThan(1.5 * (corner.sprungKg + corner.unsprungKg) * G);
  });
});

describe('wheel lift', () => {
  it('never pulls the wheel down, and leaves the road off a 100 mm kerb at 60 km/h', () => {
    const r = run(base, [{ kind: 'step', atM: 3, heightM: -0.1 }], 60 / 3.6, 2);
    expect(r.minTyre).toBe(0);
    expect(r.air).toBeGreaterThan(0);
    const slow = run(base, [{ kind: 'step', atM: 3, heightM: -0.1 }], 60 / 3.6, 2, 1e-5);
    expect(slow.minTyre).toBeGreaterThanOrEqual(0);
  });

  it('bounces longer on a worn damper than on a track one', () => {
    const worn = resolveCorner(corner, { ...factory, damper: 'worn' });
    const track = resolveCorner(corner, { ...factory, damper: 'track' });
    const bump: RoadEvent[] = [{ kind: 'bump', atM: 3, lengthM: 0.5, heightM: 0.05 }];
    expect(run(worn, bump, 30 / 3.6, 3).air).toBeGreaterThan(run(track, bump, 30 / 3.6, 3).air);
  });
});

describe('time budget', () => {
  it('steps in under 2 µs, road read included', () => {
    const sim = new QuarterSim(base, roadFor(base, [{ kind: 'bump', atM: 3, lengthM: 0.5, heightM: 0.05 }]), 15);
    let best = Infinity;
    for (let r = 0; r < 5; r++) {
      sim.reset(0);
      const t0 = performance.now();
      for (let i = 0; i < 100_000; i++) {
        sim.step();
        if (sim.x > 15) sim.x = 0;
      }
      best = Math.min(best, performance.now() - t0);
    }
    expect((best * 1000) / 100_000).toBeLessThan(2);
  });
});
