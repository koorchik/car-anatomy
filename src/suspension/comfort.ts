// How much a ride shakes the people and how much it takes from the tyre (suspensions plan, comfort and grip).
//
// Comfort: ISO 2631-1 frequency weighting of the body acceleration, Wk for the vertical axis of a seated person and Wd
// for the horizontal ones, then the RMS. The weightings are the standard's analogue filters as written out by Rimell &
// Mansfield (Industrial Health 45:512–519, 2007, equations 1–4): band limits f1 0.4 Hz and f2 100 Hz with Q = 1/√2, the
// acceleration–velocity transition (Wk: f3 = f4 = 12.5 Hz, Q4 0.63; Wd: f3 = f4 = 2 Hz, Q4 0.63) and, for Wk only, the
// upward step (f5 2.37 Hz, Q5 0.91, f6 3.35 Hz, Q6 0.91, with its gain (f5/f6)² at low frequency). The article's table
// prints f6 = 3.3 Hz; 3.35 Hz reproduces the standard's table of gains to the third digit and 3.3 Hz misses it by 3 % at
// 1 Hz (docs/research/suspensions.md; that table is as the research remembers it, the standard itself was not read). The digital filter is a cascade of biquads from the bilinear transform,
// prewarped at each section's own frequency; at 1 kHz it stays within 0.15 % of the analogue gain up to 20 Hz and
// 0.3 % up to 31.5 Hz.
//
// Grip: the dynamic load coefficient DLC = σ(F_z)/F_z,static from the truck and pavement literature, the share of time
// the wheel is off the road, the lowest load, and the available grip ⟨F_max(F_z(t))⟩ / F_max(F_z,static), with F_max
// the peak side force D_y of the Magic Formula. The tyre gives less grip per newton as the load grows, so a load that
// swings round its mean gives less grip on average than a steady one; a wheel in the air gives none. The frequency-
// domain estimate (evaluate.ts) knows only the RMS of the load, so it takes the load as Gaussian, for which the share
// off the road and the available grip have a closed form (gaussianGrip).
//
// Nothing here knows text: the comfort scale returns keys, the interface names them.

import type { Tyre } from '../vehicle/tyre.ts';
import { lateralPeakN } from '../vehicle/tyre.ts';

export type Weighting = 'Wk' | 'Wd';

/** An s-domain biquad (b2·s² + b1·s + b0)/(a2·s² + a1·s + a0) and the frequency it is prewarped at, rad/s. */
interface AnalogSection {
  b: readonly [number, number, number];
  a: readonly [number, number, number];
  w: number;
}

const TAU = 2 * Math.PI;

/** The sections of a weighting (ISO 2631-1 through Rimell & Mansfield 2007, f6 = 3.35 Hz as explained above). */
function sections(kind: Weighting): AnalogSection[] {
  const q12 = Math.SQRT1_2;
  const w1 = TAU * 0.4;
  const w2 = TAU * 100;
  const f34 = kind === 'Wk' ? 12.5 : 2;
  const w3 = TAU * f34;
  const w4 = TAU * f34;
  const q4 = 0.63;
  const list: AnalogSection[] = [
    // High pass at f1.
    { b: [0, 0, 1], a: [w1 * w1, w1 / q12, 1], w: w1 },
    // Low pass at f2.
    { b: [w2 * w2, 0, 0], a: [w2 * w2, w2 / q12, 1], w: w2 },
    // Acceleration–velocity transition: (1 + s/ω3) / (1 + s/(Q4·ω4) + s²/ω4²).
    { b: [w4 * w4, (w4 * w4) / w3, 0], a: [w4 * w4, w4 / q4, 1], w: w4 },
  ];
  if (kind === 'Wk') {
    const w5 = TAU * 2.37;
    const w6 = TAU * 3.35;
    const q56 = 0.91;
    // Upward step: (s² + s·ω5/Q5 + ω5²) / (s² + s·ω6/Q6 + ω6²).
    list.push({ b: [w5 * w5, w5 / q56, 1], a: [w6 * w6, w6 / q56, 1], w: w6 });
  }
  return list;
}

const SECTIONS: Record<Weighting, AnalogSection[]> = { Wk: sections('Wk'), Wd: sections('Wd') };

/** Gain of the analogue weighting at `hz` (ISO 2631-1). */
export function weightingGain(kind: Weighting, hz: number): number {
  const w = TAU * hz;
  let gain = 1;
  for (const s of SECTIONS[kind]) {
    // Each polynomial at s = iω: (c0 − c2·ω²) + i·c1·ω.
    const num = Math.hypot(s.b[0] - s.b[2] * w * w, s.b[1] * w);
    const den = Math.hypot(s.a[0] - s.a[2] * w * w, s.a[1] * w);
    gain *= num / den;
  }
  return gain;
}

/** A weighting as a cascade of digital biquads at a fixed sample rate. Allocates nothing per sample. */
export class WeightingFilter {
  readonly kind: Weighting;
  readonly sampleHz: number;
  /** Per section: b0, b1, b2, a1, a2 (a0 = 1). */
  private readonly coeffs: Float64Array;
  /** Per section: the two delays of the transposed direct form II. */
  private readonly z: Float64Array;
  private readonly count: number;

  constructor(kind: Weighting, sampleHz: number) {
    this.kind = kind;
    this.sampleHz = sampleHz;
    const list = SECTIONS[kind];
    this.count = list.length;
    this.coeffs = new Float64Array(5 * list.length);
    this.z = new Float64Array(2 * list.length);
    list.forEach((s, i) => {
      // s = K·(1 − z⁻¹)/(1 + z⁻¹) with K = ω/tan(ω·T/2), so the section's own frequency maps exactly.
      const K = s.w / Math.tan(s.w / (2 * sampleHz));
      const K2 = K * K;
      const map = (c: readonly [number, number, number]): [number, number, number] => [
        c[2] * K2 + c[1] * K + c[0],
        2 * (c[0] - c[2] * K2),
        c[2] * K2 - c[1] * K + c[0],
      ];
      const [b0, b1, b2] = map(s.b);
      const [a0, a1, a2] = map(s.a);
      this.coeffs.set([b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0], 5 * i);
    });
  }

  reset(): void {
    this.z.fill(0);
  }

  /** Filters one sample. */
  process(x: number): number {
    const c = this.coeffs;
    const z = this.z;
    let v = x;
    for (let i = 0; i < this.count; i++) {
      const o = 5 * i;
      const y = c[o] * v + z[2 * i];
      z[2 * i] = c[o + 1] * v - c[o + 3] * y + z[2 * i + 1];
      z[2 * i + 1] = c[o + 2] * v - c[o + 4] * y;
      v = y;
    }
    return v;
  }
}

/** Comfort bands of ISO 2631-1 for the weighted RMS, m/s². They overlap on purpose: the standard gives ranges. */
export type ComfortBand = 'not' | 'little' | 'fairly' | 'uncomfortable' | 'very' | 'extremely';

/** Lower and upper bound of each band, m/s² (Ribeiro & Cunha 2026, table 3; Prosig puts the last at 2.5). */
export const COMFORT_BANDS: Record<ComfortBand, readonly [number, number]> = {
  not: [0, 0.315],
  little: [0.315, 0.63],
  fairly: [0.5, 1],
  uncomfortable: [0.8, 1.6],
  very: [1.25, 2.5],
  extremely: [2, Infinity],
};

/** The one or two bands a weighted RMS falls in, mildest first. */
export function comfortBands(aw: number): ComfortBand[] {
  const out: ComfortBand[] = [];
  for (const key of Object.keys(COMFORT_BANDS) as ComfortBand[]) {
    const [lo, hi] = COMFORT_BANDS[key];
    if (aw >= lo && aw < hi) out.push(key);
  }
  return out;
}

/**
 * Weighted RMS of a signal sampled at a fixed rate: over the whole run and over the last `windowS` seconds (a running
 * RMS, as a passenger would feel it change along the road).
 */
export class WeightedRms {
  readonly filter: WeightingFilter;
  private readonly ring: Float64Array;
  private head = 0;
  private filled = 0;
  private windowSum = 0;
  private total = 0;
  /** Samples seen. */
  count = 0;

  constructor(kind: Weighting, sampleHz: number, windowS = 10) {
    this.filter = new WeightingFilter(kind, sampleHz);
    this.ring = new Float64Array(Math.max(1, Math.round(windowS * sampleHz)));
  }

  reset(): void {
    this.filter.reset();
    this.ring.fill(0);
    this.head = 0;
    this.filled = 0;
    this.windowSum = 0;
    this.total = 0;
    this.count = 0;
  }

  /** Adds one sample; returns its weighted value. */
  push(x: number): number {
    const y = this.filter.process(x);
    const y2 = y * y;
    this.total += y2;
    this.windowSum += y2 - this.ring[this.head];
    this.ring[this.head] = y2;
    this.head = (this.head + 1) % this.ring.length;
    if (this.filled < this.ring.length) this.filled++;
    this.count++;
    return y;
  }

  /** RMS over every sample so far. */
  get rms(): number {
    return this.count > 0 ? Math.sqrt(this.total / this.count) : 0;
  }

  /** RMS over the last window (or what there is of it). */
  get windowRms(): number {
    return this.filled > 0 ? Math.sqrt(Math.max(0, this.windowSum) / this.filled) : 0;
  }
}

/** What a wheel load does to grip over a run. */
export interface LoadStats {
  /** σ(F_z)/F_z,static. */
  dlc: number;
  /** Share of samples with the wheel off the road. */
  airShare: number;
  minN: number;
  maxN: number;
  /** ⟨F_max(F_z)⟩ / F_max(F_z,static): 1 on a smooth road, less as the load swings. */
  availableGrip: number;
}

/** Collects the wheel load sample by sample against the tyre's peak side force on a dry road at zero camber. */
export class LoadMeter {
  readonly staticN: number;
  readonly tyre: Tyre;
  private readonly peakStatic: number;
  private n = 0;
  private sum = 0;
  private sum2 = 0;
  private air = 0;
  private grip = 0;
  private min = Infinity;
  private max = -Infinity;

  constructor(staticN: number, tyre: Tyre) {
    this.staticN = staticN;
    this.tyre = tyre;
    this.peakStatic = lateralPeakN(tyre.set, staticN);
  }

  reset(): void {
    this.n = 0;
    this.sum = 0;
    this.sum2 = 0;
    this.air = 0;
    this.grip = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  push(fz: number): void {
    // Sums of the deviation from the static load, so σ keeps its digits when it is small.
    const d = fz - this.staticN;
    this.n++;
    this.sum += d;
    this.sum2 += d * d;
    if (fz <= 0) this.air++;
    else this.grip += Math.max(0, lateralPeakN(this.tyre.set, fz));
    if (fz < this.min) this.min = fz;
    if (fz > this.max) this.max = fz;
  }

  result(): LoadStats {
    const n = Math.max(1, this.n);
    const mean = this.sum / n;
    const variance = Math.max(0, this.sum2 / n - mean * mean);
    return {
      dlc: Math.sqrt(variance) / this.staticN,
      airShare: this.air / n,
      minN: this.n > 0 ? this.min : this.staticN,
      maxN: this.n > 0 ? this.max : this.staticN,
      availableGrip: this.n > 0 ? this.grip / n / this.peakStatic : 1,
    };
  }
}

/** What the quarter car reports each step that the ride meter reads (QuarterOut has all of it). */
export interface RideSample {
  bodyAcc: number;
  tyreN: number;
  travel: number;
}

/** The three corners of the ride triangle over one run: comfort, grip, travel. */
export interface RideResult {
  seconds: number;
  /** Wk-weighted RMS of the body acceleration, m/s², over the run and over the last window. */
  comfortAw: number;
  comfortAwWindow: number;
  /** Plain RMS of the body acceleration, m/s² (what the weighting is compared with). */
  bodyAccRms: number;
  load: LoadStats;
  /** Travel about its mean: σ, m; and the extremes from rest, m (positive in bump). */
  travelRmsM: number;
  travelMaxM: number;
  travelMinM: number;
  /** What is left to the bump stop at the deepest bump of the run, m (negative: the stop was squeezed). */
  bumpStopMarginM: number;
}

export interface RideMeterOptions {
  sampleHz: number;
  staticN: number;
  tyre: Tyre;
  /** Travel at rest, and from rest to the bump stop, m. */
  staticTravelM: number;
  bumpStopTravelM: number;
  windowS?: number;
}

/** Comfort, grip and travel of a quarter car, step by step. Allocates nothing per step. */
export class RideMeter {
  readonly options: RideMeterOptions;
  readonly comfort: WeightedRms;
  readonly load: LoadMeter;
  private n = 0;
  private acc2 = 0;
  private tSum = 0;
  private tSum2 = 0;
  private tMax = -Infinity;
  private tMin = Infinity;

  constructor(o: RideMeterOptions) {
    this.options = o;
    this.comfort = new WeightedRms('Wk', o.sampleHz, o.windowS ?? 10);
    this.load = new LoadMeter(o.staticN, o.tyre);
  }

  reset(): void {
    this.comfort.reset();
    this.load.reset();
    this.n = 0;
    this.acc2 = 0;
    this.tSum = 0;
    this.tSum2 = 0;
    this.tMax = -Infinity;
    this.tMin = Infinity;
  }

  push(s: RideSample): void {
    this.n++;
    this.comfort.push(s.bodyAcc);
    this.acc2 += s.bodyAcc * s.bodyAcc;
    this.load.push(s.tyreN);
    const q = s.travel - this.options.staticTravelM;
    this.tSum += q;
    this.tSum2 += q * q;
    if (q > this.tMax) this.tMax = q;
    if (q < this.tMin) this.tMin = q;
  }

  result(): RideResult {
    const n = Math.max(1, this.n);
    const mean = this.tSum / n;
    const any = this.n > 0;
    return {
      seconds: this.n / this.options.sampleHz,
      comfortAw: this.comfort.rms,
      comfortAwWindow: this.comfort.windowRms,
      bodyAccRms: Math.sqrt(this.acc2 / n),
      load: this.load.result(),
      travelRmsM: Math.sqrt(Math.max(0, this.tSum2 / n - mean * mean)),
      travelMaxM: any ? this.tMax : 0,
      travelMinM: any ? this.tMin : 0,
      bumpStopMarginM: this.options.bumpStopTravelM - (any ? this.tMax : 0),
    };
  }
}

/** Upper tail of the standard normal distribution, Q(x) = ½·erfc(x/√2) (Numerical Recipes' erfc, error < 1.2e-7). */
export function normalTail(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 +
          t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r / 2 : 1 - r / 2;
}

/**
 * Off-road share and available grip for a Gaussian load of mean `staticN` and RMS `sigmaN`. The peak side force of
 * the Magic Formula is quadratic in the load, a1·F + a2·F² (μ falls linearly with load), so its mean over the part of
 * the Gaussian above zero has a closed form: E[F; F > 0] = F0·Φ + σ·φ, E[F²; F > 0] = (F0² + σ²)·Φ + F0·σ·φ.
 */
export function gaussianGrip(staticN: number, sigmaN: number, tyre: Tyre): { airShare: number; availableGrip: number } {
  const f0 = staticN;
  const peak = lateralPeakN(tyre.set, f0);
  if (!(sigmaN > 0)) return { airShare: 0, availableGrip: 1 };
  const a2 = (lateralPeakN(tyre.set, 2 * f0) - 2 * peak) / (2 * f0 * f0);
  const a1 = (peak - a2 * f0 * f0) / f0;
  const x = f0 / sigmaN;
  const big = 1 - normalTail(x);
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(TAU);
  const e1 = f0 * big + sigmaN * pdf;
  const e2 = (f0 * f0 + sigmaN * sigmaN) * big + f0 * sigmaN * pdf;
  return { airShare: normalTail(x), availableGrip: (a1 * e1 + a2 * e2) / peak };
}
