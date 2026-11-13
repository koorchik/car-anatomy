import { describe, expect, it } from 'vitest';
import {
  comfortBands, gaussianGrip, LoadMeter, normalTail, RideMeter, weightingGain, WeightedRms, WeightingFilter, type Weighting,
} from '../src/suspension/comfort.ts';
import { lateralPeakN, tyreAt } from '../src/vehicle/tyre.ts';

/** Steady gain of a digital weighting at `hz`: RMS out over RMS in of a long sine, after the filter has settled. */
function digitalGain(kind: Weighting, hz: number, sampleHz = 1000): number {
  const f = new WeightingFilter(kind, sampleHz);
  const settle = Math.ceil(20 * sampleHz);
  // A whole number of periods for the measurement.
  const periods = Math.max(20, Math.ceil(hz * 10));
  const n = Math.round((periods / hz) * sampleHz);
  let inSq = 0;
  let outSq = 0;
  for (let i = 0; i < settle + n; i++) {
    const x = Math.sin((2 * Math.PI * hz * i) / sampleHz);
    const y = f.process(x);
    if (i >= settle) {
      inSq += x * x;
      outSq += y * y;
    }
  }
  return Math.sqrt(outSq / inSq);
}

describe('ISO 2631-1 weightings', () => {
  it('give the Wk gains of the standard\'s table (±0.003)', () => {
    // These values were checked by computing the filter of Rimell & Mansfield with f6 = 3.35 Hz and comparing with the
    // table of ISO 2631-1 as the research remembers it, not read from the standard's text (docs/research/suspensions.md).
    const table: Array<[number, number]> = [
      [0.5, 0.418], [1, 0.482], [2, 0.531], [4, 0.967], [6.3, 1.054], [8, 1.036], [12.5, 0.902], [16, 0.769],
    ];
    for (const [hz, gain] of table) expect(Math.abs(weightingGain('Wk', hz) - gain), `${hz} Hz`).toBeLessThan(0.003);
  });

  it('weight the horizontal axes by Wd: flat to 1.6 Hz, then velocity (1/f)', () => {
    for (const hz of [0.63, 1, 1.25, 1.6]) expect(Math.abs(weightingGain('Wd', hz) - 1)).toBeLessThan(0.06);
    // Above the 2 Hz transition the gain halves per octave until the 100 Hz band limit.
    expect(weightingGain('Wd', 8) / weightingGain('Wd', 16)).toBeCloseTo(2, 1);
    expect(weightingGain('Wd', 16) / weightingGain('Wd', 32)).toBeCloseTo(2, 1);
  });

  it('as digital filters at 1 kHz match the analogue gains within 1 %', () => {
    for (const kind of ['Wk', 'Wd'] as const) {
      for (const hz of [1, 4, 6.3, 8, 16]) {
        expect(Math.abs(digitalGain(kind, hz) / weightingGain(kind, hz) - 1), `${kind} ${hz} Hz`).toBeLessThan(0.01);
      }
    }
  });

  it('turn a 5 Hz sine of amplitude A into an RMS of A·|Wk(5)|/√2 (1 %)', () => {
    const A = 1.7;
    const rms = new WeightedRms('Wk', 1000);
    // 20 s to settle are left out by measuring the last 10 s window against the run.
    for (let i = 0; i < 40_000; i++) rms.push(A * Math.sin((2 * Math.PI * 5 * i) / 1000));
    expect(Math.abs(rms.windowRms / ((A * weightingGain('Wk', 5)) / Math.SQRT2) - 1)).toBeLessThan(0.01);
  });

  it('keep a running RMS of the last 10 s beside the whole run\'s', () => {
    const rms = new WeightedRms('Wk', 1000, 10);
    const gain = weightingGain('Wk', 5) / Math.SQRT2;
    for (let i = 0; i < 30_000; i++) rms.push(Math.sin((2 * Math.PI * 5 * i) / 1000));
    for (let i = 30_000; i < 60_000; i++) rms.push(3 * Math.sin((2 * Math.PI * 5 * i) / 1000));
    expect(rms.windowRms / gain).toBeCloseTo(3, 2);
    // Half the run at 1 and half at 3: √((1 + 9)/2).
    expect(Math.abs(rms.rms / gain - Math.sqrt(5))).toBeLessThan(0.01);
  });
});

describe('comfort bands', () => {
  it('name the overlapping bands of ISO 2631-1, mildest first', () => {
    expect(comfortBands(0.2)).toEqual(['not']);
    expect(comfortBands(0.4)).toEqual(['little']);
    expect(comfortBands(0.55)).toEqual(['little', 'fairly']);
    expect(comfortBands(0.9)).toEqual(['fairly', 'uncomfortable']);
    expect(comfortBands(1.4)).toEqual(['uncomfortable', 'very']);
    expect(comfortBands(2.2)).toEqual(['very', 'extremely']);
    expect(comfortBands(3)).toEqual(['extremely']);
  });
});

describe('load and grip', () => {
  const staticN = 4316;
  const tyre = tyreAt('street', staticN);
  const { PDY1, PDY2 } = tyre.set;

  it('reads a steady load as full grip with no variation', () => {
    const m = new LoadMeter(staticN, tyre);
    for (let i = 0; i < 1000; i++) m.push(staticN);
    const r = m.result();
    expect(r.dlc).toBe(0);
    expect(r.airShare).toBe(0);
    expect(r.availableGrip).toBeCloseTo(1, 12);
  });

  it('gives DLC a/√2 for a load swinging ±a, and the grip the tyre\'s load sensitivity leaves', () => {
    const a = 0.4;
    const m = new LoadMeter(staticN, tyre);
    const n = 100_000;
    for (let i = 0; i < n; i++) m.push(staticN * (1 + a * Math.sin((2 * Math.PI * i) / n)));
    const r = m.result();
    expect(Math.abs(r.dlc / (a / Math.SQRT2) - 1)).toBeLessThan(0.001);
    // F_max = LMUY·((PDY1 − PDY2)·F + PDY2·F²/F0) at the fitted nominal load F0, so its mean over the sine is
    // F_max(F0)·(1 + (PDY2/PDY1)·a²/2): less than the steady value, because μ falls with load.
    expect(PDY2).toBeLessThan(0);
    expect(r.availableGrip).toBeCloseTo(1 + (PDY2 / PDY1) * (a * a) / 2, 6);
    expect(r.minN).toBeCloseTo(staticN * (1 - a), 3);
  });

  it('counts the time a wheel is off the road and gives it no grip there', () => {
    const a = 1.5;
    const m = new LoadMeter(staticN, tyre);
    const n = 100_000;
    let grip = 0;
    for (let i = 0; i < n; i++) {
      const f = Math.max(0, staticN * (1 + a * Math.sin((2 * Math.PI * i) / n)));
      m.push(f);
      grip += lateralPeakN(tyre.set, f);
    }
    const r = m.result();
    // Off the road while sin < −1/a.
    expect(r.airShare).toBeCloseTo((Math.PI - 2 * Math.asin(1 / a)) / (2 * Math.PI), 3);
    expect(r.minN).toBe(0);
    expect(r.availableGrip).toBeCloseTo(grip / n / lateralPeakN(tyre.set, staticN), 9);
  });

  it('has a closed form for a Gaussian load that matches numerical integration', () => {
    for (const dlc of [0.1, 0.3, 0.6]) {
      const sigma = dlc * staticN;
      // Midpoint rule from −8σ to the lift-off point and from there to +8σ, so neither sum straddles it.
      const pdf = (z: number): number => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
      const z0 = Math.max(-8, -1 / dlc);
      const steps = 20_000;
      let air = 0;
      let grip = 0;
      for (let i = 0; i < steps; i++) {
        const za = -8 + ((z0 + 8) * (i + 0.5)) / steps;
        air += pdf(za) * ((z0 + 8) / steps);
        const zb = z0 + ((8 - z0) * (i + 0.5)) / steps;
        grip += pdf(zb) * ((8 - z0) / steps) * lateralPeakN(tyre.set, staticN + sigma * zb);
      }
      const g = gaussianGrip(staticN, sigma, tyre);
      expect(Math.abs(g.airShare - air)).toBeLessThan(1e-7);
      expect(Math.abs(g.availableGrip - grip / lateralPeakN(tyre.set, staticN))).toBeLessThan(1e-6);
    }
  });

  it('uses a normal tail accurate to 1e-7', () => {
    const known: Array<[number, number]> = [[0, 0.5], [1, 0.158655254], [2, 0.022750132], [3, 0.001349898], [-1, 0.841344746]];
    for (const [x, q] of known) expect(Math.abs(normalTail(x) - q)).toBeLessThan(1e-7);
  });
});

describe('ride meter', () => {
  it('reports travel about its mean, its extremes from rest and what is left to the bump stop', () => {
    const tyre = tyreAt('street', 4316);
    const m = new RideMeter({ sampleHz: 1000, staticN: 4316, tyre, staticTravelM: 0.01, bumpStopTravelM: 0.08 });
    for (let i = 0; i < 10_000; i++) {
      const q = 0.01 + 0.002 + 0.02 * Math.sin((2 * Math.PI * i) / 1000);
      m.push({ bodyAcc: 0, tyreN: 4316, travel: q });
    }
    const r = m.result();
    expect(r.seconds).toBe(10);
    expect(r.travelRmsM).toBeCloseTo(0.02 / Math.SQRT2, 6);
    expect(r.travelMaxM).toBeCloseTo(0.022, 6);
    expect(r.travelMinM).toBeCloseTo(-0.018, 6);
    expect(r.bumpStopMarginM).toBeCloseTo(0.058, 6);
    expect(r.comfortAw).toBe(0);
    expect(r.load.dlc).toBe(0);
  });
});
