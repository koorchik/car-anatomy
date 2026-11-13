import { describe, expect, it } from 'vitest';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import { factorySetup, resolveCorner, type ResolvedCorner } from '../src/suspension/setup.ts';
import { FLAT_ROAD, QuarterSim } from '../src/suspension/quarter.ts';
import { EventRoad, Iso8608Road, RoadBuffer, type RoadClass, type RoadEvent } from '../src/suspension/road.ts';
import { G } from '../src/suspension/forces.ts';
import {
  EVALUATE_ROADS, evaluateQuarter, invariantPoints, lineariseQuarter, newQuarterGains, quarterGains, quarterModes,
  roughRoadEstimate, type QuarterLinear,
} from '../src/suspension/evaluate.ts';
import { logFrequencies, SteppedSine } from '../src/suspension/shaker.ts';
import { RideMeter, type RideResult } from '../src/suspension/comfort.ts';
import { tyreAt } from '../src/vehicle/tyre.ts';

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
    // evaluate.ts finds the same body mode from its own linearisation of the tables.
    const modes = quarterModes(lineariseQuarter(rc));
    expect(Math.abs((2 * Math.PI * modes.body.hz) / wn - 1)).toBeLessThan(1e-4);
    expect(Math.abs(modes.body.zeta / zeta - 1)).toBeLessThan(1e-4);
    const hop = roots.reduce((best, r) => (Math.hypot(...r) > Math.hypot(...best) ? r : best));
    expect(Math.abs((2 * Math.PI * modes.hop.hz) / Math.hypot(...hop) - 1)).toBeLessThan(1e-4);
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

/** The corner with a linear damper of ζ at the wheel (same both ways, no knee) and, if given, another tyre damping. */
function linearDamper(rc: ResolvedCorner, zeta: number, ct = rc.tyre.ct): ResolvedCorner {
  const mr = rc.atRest.mrDamper;
  const cw = 4 * Math.PI * zeta * rc.bodyHz * rc.sprungKg;
  return {
    ...rc,
    damper: { ...rc.damper, compression: cw / mr ** 2, rebound: cw / mr ** 2, highRatio: 1 },
    tyre: { ...rc.tyre, ct },
  };
}

describe('linearisation', () => {
  it('takes the wheel rate of the setup and, for a small sine, the mean of compression and rebound', () => {
    const lin = lineariseQuarter(base);
    expect(Math.abs(lin.k / base.wheelRate - 1)).toBeLessThan(1e-4);
    expect(lin.c).toBeCloseTo((base.wheelDamping.compression + base.wheelDamping.rebound) / 2, 6);
    expect(lin.staticN).toBeCloseTo((corner.sprungKg + corner.unsprungKg) * G, 9);
  });
});

describe('the shaker', () => {
  /** Frequency of the body's displacement peak on the analytic curve, by golden section. */
  function bodyPeakHz(lin: QuarterLinear): number {
    const g = newQuarterGains();
    const disp = (hz: number): number => quarterGains(lin, hz, g).bodyAcc / (2 * Math.PI * hz) ** 2;
    let lo = 0.5;
    let hi = 3;
    const r = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 60; i++) {
      const a = hi - r * (hi - lo);
      const b = lo + r * (hi - lo);
      if (disp(a) > disp(b)) hi = b;
      else lo = a;
    }
    return (lo + hi) / 2;
  }

  it('waits for the slowest mode and measures over whole periods', () => {
    const rc = linearDamper(base, 0.08);
    const sine = new SteppedSine(rc, { freqsHz: [0.5, 1.2, 12, 25], velocityMs: 0.01 });
    const points = sine.run();
    const { body } = quarterModes(lineariseQuarter(rc));
    expect(sine.decayRate).toBeCloseTo(body.zeta * 2 * Math.PI * body.hz, 6);
    for (const p of points) {
      expect(p.settleS).toBeGreaterThanOrEqual(Math.max(5 / sine.decayRate, 3 / p.hz) - 1e-9);
      const periods = p.measureS * p.hz;
      expect(periods).toBeGreaterThanOrEqual(3 - 0.01);
      expect(Math.abs(periods - Math.round(periods))).toBeLessThan(0.01);
    }
  });

  it.each([0.08, 0.3])('puts the points on the analytic curves within 3 %, body resonance included (ζ %s)', (zeta) => {
    const rc = linearDamper(base, zeta);
    const lin = lineariseQuarter(rc);
    const { hop } = quarterModes(lin);
    const freqs = [...logFrequencies(0.5, 25, 30), bodyPeakHz(lin), hop.hz].sort((a, b) => a - b);
    const points = new SteppedSine(rc, { freqsHz: freqs, velocityMs: 0.01 }).run();
    const g = newQuarterGains();
    expect(points.length).toBe(freqs.length);
    for (const p of points) {
      quarterGains(lin, p.hz, g);
      expect(p.leftPost).toBe(false);
      expect(Math.abs(p.bodyAcc / g.bodyAcc - 1), `body at ${p.hz.toFixed(2)} Hz`).toBeLessThan(0.03);
      expect(Math.abs(p.tyreForce / g.tyreForce - 1), `tyre at ${p.hz.toFixed(2)} Hz`).toBeLessThan(0.03);
      expect(Math.abs(p.travel / g.travel - 1), `travel at ${p.hz.toFixed(2)} Hz`).toBeLessThan(0.03);
    }
    // On a lightly damped body the resonance is a real peak: well over the road's own motion.
    if (zeta === 0.08) {
      const peak = points.find((p) => Math.abs(p.hz - bodyPeakHz(lin)) < 1e-12)!;
      expect(peak.bodyAcc / (2 * Math.PI * peak.hz) ** 2).toBeGreaterThan(4);
    }
  });

  it('gives the same points computed in portions as in one go', () => {
    const rc = linearDamper(base, 0.25);
    const options = { freqsHz: logFrequencies(1, 15, 5), velocityMs: 0.02 };
    const whole = new SteppedSine(rc, options).run();
    const parts = new SteppedSine(rc, options);
    let calls = 0;
    while (!parts.advance(997)) calls++;
    expect(calls).toBeGreaterThan(10);
    expect(parts.points).toEqual(whole);
  });

  it('has the invariant point: body motion m_u/m_s of the post\'s at √(k_t/m_u), whatever the damper', () => {
    const spread = (ct: number, tolerance: number): number => {
      const ratios = [0.1, 0.3, 0.7].map((zeta) => {
        const rc = linearDamper(base, zeta, ct);
        const inv = invariantPoints(lineariseQuarter(rc));
        const [p] = new SteppedSine(rc, { freqsHz: [inv.bodyHz], velocityMs: 0.01 }).run();
        const ratio = p.bodyAcc / (2 * Math.PI * inv.bodyHz) ** 2 / inv.bodyGain;
        expect(Math.abs(ratio - 1), `c_t ${ct}, ζ ${zeta}`).toBeLessThan(tolerance);
        return ratio;
      });
      return Math.max(...ratios) - Math.min(...ratios);
    };
    // Without tyre damping the point is exact; the tyre's 50 N·s/m moves it a few per cent, more on a soft damper,
    // which is why the curves on the stand pass only nearly through one point.
    const none = spread(0, 0.02);
    const tyre = spread(base.tyre.ct, 0.07);
    const more = spread(10 * base.tyre.ct, 0.5);
    expect(none).toBeLessThan(0.005);
    expect(tyre).toBeGreaterThan(none);
    expect(more).toBeGreaterThan(tyre);
  });
});

describe('rough road', () => {
  /** A quarter car driven over an ISO 8608 road; the first 2 s settle the start and are not measured. */
  function ride(rc: ResolvedCorner, roadClass: RoadClass, speedMs: number, seed: number, seconds: number): RideResult {
    const staticN = (rc.sprungKg + rc.unsprungKg) * G;
    const road = new RoadBuffer(new Iso8608Road({ roadClass, seed }), rc.tyre.freeRadiusM, rc.tyre.patchM);
    const sim = new QuarterSim(rc, road, speedMs);
    sim.reset(0);
    const meter = new RideMeter({
      sampleHz: 1000, staticN, tyre: tyreAt(rc.corner.tyre, staticN), staticTravelM: rc.staticTravelM,
      bumpStopTravelM: rc.bumpStop.travelM,
    });
    const steps = Math.round((seconds + 2) * 1000);
    for (let i = 0; i < steps; i++) {
      sim.step();
      if (i >= 2000) meter.push(sim.out);
    }
    return meter.result();
  }

  it('matches the frequency-domain estimate over 60 s of a class B road within 10 % (three seeds)', () => {
    const estimate = evaluateQuarter(base).smooth;
    const runs = [1, 2, 3].map((seed) => ride(base, 'B', EVALUATE_ROADS.smooth.speedMs, seed, 60));
    const mean = (f: (r: RideResult) => number): number => runs.reduce((s, r) => s + f(r), 0) / runs.length;
    expect(Math.abs(mean((r) => r.comfortAw) / estimate.comfortAw - 1)).toBeLessThan(0.1);
    expect(Math.abs(mean((r) => r.bodyAccRms) / estimate.bodyAccRms - 1)).toBeLessThan(0.1);
    expect(Math.abs(mean((r) => r.load.dlc) / estimate.dlc - 1)).toBeLessThan(0.1);
    expect(Math.abs(mean((r) => r.travelRmsM) / estimate.travelRmsM - 1)).toBeLessThan(0.1);
    expect(Math.abs(mean((r) => r.load.availableGrip) - estimate.availableGrip)).toBeLessThan(0.002);
  });

  it('gives the same numbers for the same settings and seed', () => {
    const rc = resolveCorner(corner, { ...factory, damper: 'sport' });
    const a = ride(rc, 'C', 25, 7, 5);
    const b = ride(rc, 'C', 25, 7, 5);
    const c = ride(rc, 'C', 25, 8, 5);
    expect(b).toEqual(a);
    expect(c.comfortAw).not.toBe(a.comfortAw);
    const ea = evaluateQuarter(rc);
    expect(evaluateQuarter(rc)).toEqual(ea);
  });

  it('pulls the damper two ways: comfort wants it soft, grip firm', () => {
    // Comfort preset corner, damping swept in the frequency domain on both roads of the designer.
    const zetas = Array.from({ length: 96 }, (_, i) => 0.05 + i * 0.01);
    for (const road of Object.values(EVALUATE_ROADS)) {
      const rows = zetas.map((zeta) => {
        const rc = resolveCorner(corner, { ...factory, damper: zeta });
        const lin = lineariseQuarter(rc);
        return { zeta, e: roughRoadEstimate(lin, road, { patchM: rc.tyre.patchM, tyre: tyreAt('street', lin.staticN) }) };
      });
      const best = (f: (r: (typeof rows)[number]) => number): number => rows.reduce((b, r) => (f(r) < f(b) ? r : b)).zeta;
      const plain = best((r) => r.e.bodyAccRms);
      const weighted = best((r) => r.e.comfortAw);
      const grip = best((r) => r.e.dlc);
      // The plan's ranges, from the research's table of the plain RMS (docs/research/suspensions.md).
      expect(plain).toBeGreaterThanOrEqual(0.15);
      expect(plain).toBeLessThanOrEqual(0.3);
      expect(grip).toBeGreaterThanOrEqual(0.4);
      expect(grip).toBeLessThanOrEqual(0.65);
      // Wk counts 4–8 Hz, where a firmer damper passes more of the wheel's motion to the body, twice as much as the
      // 1–2 Hz bounce, so the weighted comfort wants it softer still (the research found the same on class C).
      expect(weighted).toBeLessThan(plain);
      expect(weighted).toBeGreaterThanOrEqual(0.1);
      expect(weighted).toBeLessThanOrEqual(0.2);
      // The bars of the triangle move apart from the comfort preset to a sporty damper.
      const at = (zeta: number) => rows.find((r) => Math.abs(r.zeta - zeta) < 1e-9)!.e;
      expect(at(0.5).comfortAw).toBeGreaterThan(at(0.25).comfortAw);
      expect(at(0.5).dlc).toBeLessThan(at(0.25).dlc);
      expect(at(0.5).travelRmsM).toBeLessThan(at(0.25).travelRmsM);
    }
  });

  it('pays for a heavier wheel in grip far more than in comfort', () => {
    const results = [30, 40, 50, 60].map((unsprungKg) => evaluateQuarter(resolveCorner({ ...corner, unsprungKg }, factory)).smooth);
    for (let i = 1; i < results.length; i++) expect(results[i].dlc).toBeGreaterThan(results[i - 1].dlc);
    const change = (f: (e: (typeof results)[number]) => number): number => f(results[3]) / f(results[0]) - 1;
    // The plain RMS is the body bounce, which the wheel hardly touches (the research's 'comfort almost the same').
    expect(Math.abs(change((e) => e.bodyAccRms))).toBeLessThan(0.03);
    // Wk also hears the wheel's buzz near 10 Hz, so the weighted comfort does change, but less than the load does
    // (from 30 to 60 kg about 13 % against 27 %).
    expect(change((e) => e.comfortAw)).toBeGreaterThan(0);
    expect(change((e) => e.comfortAw)).toBeLessThan(change((e) => e.dlc));
  });

  it('evaluates a corner in under 5 ms', () => {
    let best = Infinity;
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      evaluateQuarter(base);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(5);
  });
});
