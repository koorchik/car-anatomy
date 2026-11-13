import { describe, expect, it } from 'vitest';
import {
  envelopeAtNode, EventRoad, ISO_8608_BAND, ISO_8608_CLASSES, ISO_8608_N0, Iso8608Road, ROAD_STEP_M, RoadBuffer, roadVariance,
  SEGMENT_M, SEGMENT_NODES, TRACK_COHERENCE_RHO, trackCoherence, type RoadProfile,
} from '../src/suspension/road.ts';

const R = 0.344;
const PATCH = 0.2;

/** Fastest of a few runs, so a busy machine does not fail a budget the code meets. */
function bestMs(runs: number, fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('road events', () => {
  const road = new EventRoad([
    { kind: 'bump', atM: 2, lengthM: 0.5, heightM: 0.05 },
    { kind: 'pothole', atM: 6, lengthM: 0.2, depthM: 0.06 },
    { kind: 'step', atM: 10, heightM: 0.1 },
  ]);

  it('draws a half-cosine bump, a sharp pothole and a kerb edge', () => {
    expect(road.heightAt(1.9)).toBe(0);
    expect(road.heightAt(2.25)).toBeCloseTo(0.05, 12);
    expect(road.heightAt(2.125)).toBeCloseTo(0.025, 12);
    expect(road.heightAt(6.1)).toBe(-0.06);
    expect(road.heightAt(6.2)).toBe(0);
    expect(road.heightAt(9.999)).toBe(0);
    expect(road.heightAt(10)).toBe(0.1);
    expect(road.heightAt(50)).toBe(0.1);
  });
});

describe('enveloping', () => {
  it('does not let the tyre into a 0.2 m pothole: a smooth dip shallower than 60 mm', () => {
    const road = new RoadBuffer(new EventRoad([{ kind: 'pothole', atM: 6, lengthM: 0.2, depthM: 0.06 }]), R, PATCH);
    let deepest = 0;
    let steepest = 0;
    for (let x = 5; x < 7; x += ROAD_STEP_M) {
      deepest = Math.min(deepest, road.heightAt(x));
      steepest = Math.max(steepest, Math.abs(road.heightAt(x + ROAD_STEP_M) - road.heightAt(x)));
    }
    // Sagitta of the free circle over the gap is r − √(r² − 0.1²) = 15 mm; the patch average smooths it further.
    expect(deepest).toBeLessThan(-0.003);
    expect(deepest).toBeGreaterThan(-0.016);
    // No step anywhere: the steepest 5 mm change is far below the pothole's 60 mm edge.
    expect(steepest).toBeLessThan(0.001);
    // Without the patch average the dip is the circle's sagitta over the gap, and the average only makes it shallower.
    const circle = new RoadBuffer(new EventRoad([{ kind: 'pothole', atM: 6, lengthM: 0.2, depthM: 0.06 }]), R, 0);
    let bare = 0;
    for (let x = 5; x < 7; x += ROAD_STEP_M) bare = Math.min(bare, circle.heightAt(x));
    expect(Math.abs(-bare - (R - Math.sqrt(R * R - 0.1 * 0.1)))).toBeLessThan(1e-4);
    expect(deepest).toBeGreaterThan(bare);
  });

  it('stretches a kerb edge over more than the patch length', () => {
    const road = new RoadBuffer(new EventRoad([{ kind: 'step', atM: 10, heightM: 0.1 }]), R, PATCH);
    let start = NaN;
    let end = NaN;
    for (let x = 9; x < 11; x += ROAD_STEP_M) {
      const y = road.heightAt(x);
      if (Number.isNaN(start) && y > 0.001) start = x;
      if (Number.isNaN(end) && y > 0.099) end = x;
    }
    expect(end - start).toBeGreaterThan(PATCH);
    // The circle meets the edge √(2rH − H²) = 0.24 m before it, the patch adds half its length before that.
    expect(start).toBeGreaterThan(10 - 0.25 - PATCH / 2 - 0.01);
    expect(road.heightAt(11)).toBeCloseTo(0.1, 6);
  });

  it('follows a smooth bump longer than the patch closely', () => {
    const road = new RoadBuffer(new EventRoad([{ kind: 'bump', atM: 3, lengthM: 2, heightM: 0.05 }]), R, PATCH);
    expect(road.heightAt(4)).toBeLessThan(0.05);
    expect(road.heightAt(4)).toBeGreaterThan(0.045);
  });
});

describe('segment buffer', () => {
  const profile = new EventRoad([
    { kind: 'bump', atM: 3, lengthM: 0.5, heightM: 0.05 },
    { kind: 'pothole', atM: SEGMENT_M - 0.1, lengthM: 0.2, depthM: 0.06 },
    { kind: 'bump', atM: 2 * SEGMENT_M - 0.3, lengthM: 0.7, heightM: 0.07 },
    { kind: 'step', atM: 47, heightM: 0.1 },
  ]);

  it('matches the direct envelope at the grid nodes to 1e-6 m, across segment joins', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    const nodes = [0, 1, 590, 600, 650, 3999, 4000, 4001, 3990, 4010, 7950, 8000, 8050, 9399, 9400, 9420];
    for (const i of nodes) {
      const x = i * ROAD_STEP_M;
      expect(Math.abs(road.heightAt(x) - envelopeAtNode(profile, i, R, PATCH)), `node ${i}`).toBeLessThan(1e-6);
    }
  });

  it('closes each segment on the first node of the next', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    for (const seg of [0, 1, 2]) {
      const x = (seg + 1) * SEGMENT_M;
      const before = road.heightAt(x - 1e-9);
      const after = road.heightAt(x);
      expect(Math.abs(after - before)).toBeLessThan(1e-7);
    }
  });

  it('interpolates linearly between 5 mm nodes', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    const i = 640;
    const a = road.heightAt(i * ROAD_STEP_M);
    const b = road.heightAt((i + 1) * ROAD_STEP_M);
    expect(road.heightAt((i + 0.25) * ROAD_STEP_M)).toBeCloseTo(a + 0.25 * (b - a), 7);
    expect(road.slopeAt((i + 0.5) * ROAD_STEP_M)).toBeCloseTo((b - a) / ROAD_STEP_M, 4);
  });

  it('prepares at most one segment per call, ahead of the wheel', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    expect(road.prepare(5)).toBe(false);
    expect(road.built).toBe(1);
    expect(road.prepare(5)).toBe(true);
    expect(road.built).toBe(2);
    expect(road.prepare(19)).toBe(true);
    expect(road.built).toBe(2);
    expect(road.has(0) && road.has(1)).toBe(true);
  });

  it('reads in under 0.1 µs and builds a 20 m segment in under 2 ms', () => {
    // Worst case for the build: a road that is never flat, so every node runs the full circle window.
    const wavy: RoadProfile = { heightAt: (x) => 0.01 * Math.sin(3 * x) + 0.004 * Math.sin(17 * x) };
    const road = new RoadBuffer(wavy, R, PATCH);
    let seg = 0;
    const build = bestMs(7, () => road.build(seg++));
    expect(build).toBeLessThan(2);
    const n = 1_000_000;
    let sink = 0;
    road.build(0);
    road.build(1);
    const read = bestMs(5, () => {
      for (let i = 0; i < n; i++) sink += road.heightAt(((i * 37) % (2 * SEGMENT_NODES)) * ROAD_STEP_M * 0.999);
    });
    expect(Number.isFinite(sink)).toBe(true);
    expect((read * 1000) / n).toBeLessThan(0.1);
  });
});

describe('ISO 8608 road', () => {
  /** In-place radix-2 FFT of (re, im). */
  function fft(re: Float64Array, im: Float64Array): void {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k);
          const wi = Math.sin(ang * k);
          const a = i + k;
          const b = a + len / 2;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  /** One-sided PSD by Welch (Hann, half overlap): spatial frequencies and densities, m³. */
  function welch(y: Float64Array, dx: number, seg: number): { n: Float64Array; p: Float64Array } {
    const w = Float64Array.from({ length: seg }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / seg));
    const w2 = w.reduce((s, v) => s + v * v, 0);
    const p = new Float64Array(seg / 2);
    let count = 0;
    for (let start = 0; start + seg <= y.length; start += seg / 2) {
      const re = new Float64Array(seg);
      const im = new Float64Array(seg);
      for (let i = 0; i < seg; i++) re[i] = y[start + i] * w[i];
      fft(re, im);
      for (let k = 1; k < seg / 2; k++) p[k] += (2 * (re[k] ** 2 + im[k] ** 2) * dx) / w2;
      count++;
    }
    return { n: Float64Array.from({ length: seg / 2 }, (_, k) => k / (seg * dx)), p: p.map((v) => v / count) };
  }

  const DX = 0.1;
  const SAMPLES = 1 << 14;
  const sampled = (road: Iso8608Road): Float64Array => {
    const y = new Float64Array(SAMPLES);
    road.fill(0, DX, SAMPLES, y);
    return y;
  };

  it('has the slope −2 of the standard (±0.1, mean of 20 seeds)', () => {
    let sum = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { n, p } = welch(sampled(new Iso8608Road({ roadClass: 'C', seed })), DX, 2048);
      // Average in logarithmic bins inside the band, then a least-squares line through log p against log n.
      const edges = Array.from({ length: 21 }, (_, i) => 0.02 * 100 ** (i / 20));
      const xs: number[] = [];
      const ys: number[] = [];
      for (let b = 0; b < 20; b++) {
        let s = 0;
        let c = 0;
        for (let k = 1; k < n.length; k++) {
          if (n[k] >= edges[b] && n[k] < edges[b + 1]) {
            s += p[k];
            c++;
          }
        }
        if (c > 0) {
          xs.push(Math.log(Math.sqrt(edges[b] * edges[b + 1])));
          ys.push(Math.log(s / c));
        }
      }
      const mx = xs.reduce((a, b) => a + b) / xs.length;
      const my = ys.reduce((a, b) => a + b) / ys.length;
      const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
      sum += slope;
    }
    expect(Math.abs(sum / 20 + 2)).toBeLessThan(0.1);
  });

  it('has the height variance G_d(n0)·n0²·(1/n1 − 1/n2) of its class (5 %, mean of 20 seeds)', () => {
    for (const roadClass of ['B', 'C'] as const) {
      let sum = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const y = sampled(new Iso8608Road({ roadClass, seed }));
        const mean = y.reduce((a, b) => a + b) / y.length;
        sum += y.reduce((a, b) => a + (b - mean) ** 2, 0) / y.length;
      }
      const expected = ISO_8608_CLASSES[roadClass] * ISO_8608_N0 ** 2 * (1 / ISO_8608_BAND[0] - 1 / ISO_8608_BAND[1]);
      expect(roadVariance(ISO_8608_CLASSES[roadClass])).toBeCloseTo(expected, 15);
      expect(Math.abs(sum / 20 / expected - 1)).toBeLessThan(0.05);
    }
    // Class B is the ordinary pavement of the research: about 7.6 mm RMS.
    expect(Math.sqrt(roadVariance(ISO_8608_CLASSES.B))).toBeCloseTo(0.0076, 4);
  });

  it('gives the same road for the same seed and another for another seed', () => {
    const a = new Iso8608Road({ roadClass: 'B', seed: 42 });
    const b = new Iso8608Road({ roadClass: 'B', seed: 42 });
    const c = new Iso8608Road({ roadClass: 'B', seed: 43 });
    for (const x of [0, 1.234, 77.7, 1500]) {
      expect(b.heightAt(x)).toBe(a.heightAt(x));
      expect(c.heightAt(x)).not.toBe(a.heightAt(x));
    }
    const ra = new RoadBuffer(a, R, PATCH);
    const rb = new RoadBuffer(b, R, PATCH);
    for (const x of [3.21, 45.678, 99.999]) expect(rb.heightAt(x)).toBe(ra.heightAt(x));
  });

  it('gives the right wheel track the left one\'s spectrum and Bogsjö\'s coherence with it (20 seeds)', () => {
    const track = 1.5;
    expect(trackCoherence(0, track)).toBe(1);
    expect(trackCoherence(1 / (TRACK_COHERENCE_RHO * track), track)).toBeCloseTo(Math.exp(-1), 12);
    // Naming a track width leaves the left track the road of the seed, bit for bit.
    const plain = new Iso8608Road({ roadClass: 'C', seed: 4 });
    const left = new Iso8608Road({ roadClass: 'C', seed: 4, side: 'left', trackM: track });
    for (const x of [0, 12.3, 456.7]) expect(left.heightAt(x)).toBe(plain.heightAt(x));
    expect(() => new Iso8608Road({ roadClass: 'C', seed: 4, side: 'right' })).toThrow();

    // Cross-spectrum by Welch (Hann, half overlap) in logarithmic bins of 0.02–0.5 cycle/m, summed over the seeds.
    const seg = 2048;
    const w = Float64Array.from({ length: seg }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / seg));
    const bins = 10;
    const edges = Array.from({ length: bins + 1 }, (_, i) => 0.02 * 25 ** (i / bins));
    const ll = new Float64Array(bins);
    const rr = new Float64Array(bins);
    const lrRe = new Float64Array(bins);
    const lrIm = new Float64Array(bins);
    let rollVar = 0;
    let heaveVar = 0;
    let rightVar = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const l = sampled(new Iso8608Road({ roadClass: 'C', seed }));
      const r = sampled(new Iso8608Road({ roadClass: 'C', seed, side: 'right', trackM: track }));
      const variance = (f: (i: number) => number): number => {
        let mean = 0;
        for (let i = 0; i < SAMPLES; i++) mean += f(i) / SAMPLES;
        let v = 0;
        for (let i = 0; i < SAMPLES; i++) v += (f(i) - mean) ** 2 / SAMPLES;
        return v;
      };
      rollVar += variance((i) => l[i] - r[i]) / 20;
      heaveVar += variance((i) => (l[i] + r[i]) / 2) / 20;
      rightVar += variance((i) => r[i]) / 20;
      for (let start = 0; start + seg <= SAMPLES; start += seg / 2) {
        const lRe = new Float64Array(seg);
        const lIm = new Float64Array(seg);
        const rRe = new Float64Array(seg);
        const rIm = new Float64Array(seg);
        for (let i = 0; i < seg; i++) {
          lRe[i] = l[start + i] * w[i];
          rRe[i] = r[start + i] * w[i];
        }
        fft(lRe, lIm);
        fft(rRe, rIm);
        for (let k = 1; k < seg / 2; k++) {
          const n = k / (seg * DX);
          const b = Math.floor((bins * Math.log(n / 0.02)) / Math.log(25));
          if (b < 0 || b >= bins) continue;
          ll[b] += lRe[k] ** 2 + lIm[k] ** 2;
          rr[b] += rRe[k] ** 2 + rIm[k] ** 2;
          lrRe[b] += lRe[k] * rRe[k] + lIm[k] * rIm[k];
          lrIm[b] += lIm[k] * rRe[k] - lRe[k] * rIm[k];
        }
      }
    }
    // The model's coherence over a bin, weighted by the spectrum the bin holds (∝ 1/n² · dn = 1/n · d ln n).
    for (let b = 0; b < bins; b++) {
      let num = 0;
      let den = 0;
      for (let j = 0; j < 200; j++) {
        const n = edges[b] * (edges[b + 1] / edges[b]) ** ((j + 0.5) / 200);
        num += trackCoherence(n, track) / n;
        den += 1 / n;
      }
      const measured = Math.hypot(lrRe[b], lrIm[b]) / Math.sqrt(ll[b] * rr[b]);
      expect(Math.abs(measured - num / den), `bin from ${edges[b].toFixed(3)} cycle/m`).toBeLessThan(0.03);
      // The cross-spectrum is real, as Bogsjö's: the imaginary part is noise.
      expect(Math.abs(lrIm[b]) / Math.sqrt(ll[b] * rr[b])).toBeLessThan(0.03);
    }
    // Heave and roll the pair gives a car: ∫G·(1 + γ)/2 dn and 2·∫G·(1 − γ) dn over the band, by the spectrum of the
    // standard and the coherence of the model, not by the generator's own amplitudes (5 %).
    const gd0 = ISO_8608_CLASSES.C;
    let heave = 0;
    let roll = 0;
    const steps = 20_000;
    const [n1, n2] = ISO_8608_BAND;
    for (let j = 0; j < steps; j++) {
      const lo = n1 * (n2 / n1) ** (j / steps);
      const hi = n1 * (n2 / n1) ** ((j + 1) / steps);
      const n = Math.sqrt(lo * hi);
      const g = gd0 * (ISO_8608_N0 / n) ** 2 * (hi - lo);
      heave += (g * (1 + trackCoherence(n, track))) / 2;
      roll += 2 * g * (1 - trackCoherence(n, track));
    }
    expect(Math.abs(rightVar / roadVariance(gd0) - 1)).toBeLessThan(0.05);
    expect(Math.abs(heaveVar / heave - 1)).toBeLessThan(0.05);
    expect(Math.abs(rollVar / roll - 1)).toBeLessThan(0.05);
    // A wider car is rolled more by the same road.
    expect(trackCoherence(0.2, 1.8)).toBeLessThan(trackCoherence(0.2, 1.4));
  });

  it('fills the buffer like the direct sum and the direct envelope (1e-6 m), and interpolates within 0.1 mm', () => {
    const road = new Iso8608Road({ roadClass: 'C', seed: 5 });
    const y = new Float64Array(5000);
    road.fill(123.4, ROAD_STEP_M, y.length, y);
    let fillErr = 0;
    for (let i = 0; i < y.length; i += 37) fillErr = Math.max(fillErr, Math.abs(y[i] - road.heightAt(123.4 + i * ROAD_STEP_M)));
    expect(fillErr).toBeLessThan(1e-9);

    const buffer = new RoadBuffer(road, R, PATCH);
    const nodes = [0, 1, 2000, 3999, 4000, 4001, 7999, 8000, 12_345, 23_999, 24_000];
    for (const i of nodes) {
      expect(Math.abs(buffer.heightAt(i * ROAD_STEP_M) - envelopeAtNode(road, i, R, PATCH)), `node ${i}`).toBeLessThan(1e-6);
    }
    // Between nodes: the envelope of the road shifted by half a step has its nodes at the mid-points, so its buffer
    // gives the enveloped road there, against the straight line of the first buffer.
    const half = ROAD_STEP_M / 2;
    const shifted = new RoadBuffer(
      { heightAt: (x) => road.heightAt(x + half), fill: (x0, dx, count, out) => road.fill(x0 + half, dx, count, out) },
      R,
      PATCH,
    );
    let worst = 0;
    for (let i = 0; i < 2 * SEGMENT_NODES; i++) {
      worst = Math.max(worst, Math.abs(buffer.heightAt(i * ROAD_STEP_M + half) - shifted.heightAt(i * ROAD_STEP_M)));
    }
    expect(worst).toBeLessThan(1e-4);
    // The joins are continuous here too.
    for (const seg of [0, 1, 2]) {
      const x = (seg + 1) * SEGMENT_M;
      expect(Math.abs(buffer.heightAt(x) - buffer.heightAt(x - 1e-9))).toBeLessThan(1e-7);
    }
  });

  it('shows the rear wheels the front ones\' road L/v later', () => {
    const road = new Iso8608Road({ roadClass: 'C', seed: 9 });
    const wheelbase = 2.5;
    const v = 25;
    const front = new RoadBuffer(road, R, PATCH);
    const rear = new RoadBuffer(road, R, PATCH);
    // The front axle starts a wheelbase ahead; 0.1 s is a hundred 1 ms steps.
    const delay = Math.round(wheelbase / v / 0.001);
    expect(delay).toBe(100);
    const f: number[] = [];
    const r: number[] = [];
    for (let i = 0; i < 2000; i++) {
      f.push(front.heightAt(wheelbase + i * 0.001 * v));
      r.push(rear.heightAt(i * 0.001 * v));
    }
    for (let i = delay; i < 2000; i += 7) expect(Math.abs(r[i] - f[i - delay])).toBeLessThan(1e-9);
  });

  it('prepares a 20 m segment of a random road in under 2 ms and reads it in under 0.1 µs', () => {
    const road = new RoadBuffer(new Iso8608Road({ roadClass: 'C', seed: 3 }), R, PATCH);
    let seg = 0;
    expect(bestMs(7, () => road.build(seg++))).toBeLessThan(2);
    const n = 1_000_000;
    let sink = 0;
    road.build(0);
    road.build(1);
    const read = bestMs(5, () => {
      for (let i = 0; i < n; i++) sink += road.heightAt(((i * 37) % (2 * SEGMENT_NODES)) * ROAD_STEP_M * 0.999);
    });
    expect(Number.isFinite(sink)).toBe(true);
    expect((read * 1000) / n).toBeLessThan(0.1);
  });
});
