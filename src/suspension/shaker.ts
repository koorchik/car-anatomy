// The shaker: the corner on a hydraulic post that moves the tyre up and down, one frequency at a time (suspensions
// plan, the shaker scene).
//
// A sweep would lie here: going over 0.5–25 Hz in 40 s spends about 0.3 s in the body resonance (1.2 Hz, ζ 0.08),
// while the amplitude needs about 1/(ζω) ≈ 1.7 s to build, so the peak comes out low and late. The stepped sine
// instead starts the corner from rest at each frequency, waits until the slowest mode has died down (5/(ζω) of it, and
// at least three periods), then fits a + b·sin ωt + c·cos ωt to the response over a whole number of periods (at least
// three and at least a second) by least squares, which also takes out the mean shift of an asymmetric damper. The post
// moves with the same velocity amplitude at every frequency, as an ISO 8608 road does at constant speed.
//
// The quarter car reads the post as a road driven at 1 m/s, so its position is the time: no special path in it. The
// points come out a few thousand steps at a time (advance), so a page can compute them ahead in portions, like the lap.

import type { ResolvedCorner } from './setup.ts';
import { QuarterSim, type RoadInput } from './quarter.ts';
import { lineariseQuarter, quarterModes } from './evaluate.ts';
import { G } from './forces.ts';

/** Speed the quarter car is driven at on the post, m/s: position along the "road" is time. */
export const SHAKER_SPEED_MS = 1;

/**
 * Physics step on the post, s: four steps per millisecond of the page. Semi-implicit Euler reads the damper with the
 * velocity half a step old, which at 1 ms shifts a wheel driven at its hop resonance by up to 4 % (a bump excites the
 * hop only briefly, so the bump scene keeps 1 ms); at 0.25 ms the points stay within 1 % of the linear curves. The
 * points are computed ahead, so the cost (about 0.2 s for 30 points) is spread over frames.
 */
export const SHAKER_STEP_S = 0.00025;

/** The post: height A·sin(ωt), read by the quarter car at x = t. */
export class ShakerInput implements RoadInput {
  hz = 1;
  amplitudeM = 0;

  heightAt(x: number): number {
    return this.amplitudeM * Math.sin(2 * Math.PI * this.hz * x);
  }

  slopeAt(x: number): number {
    const w = 2 * Math.PI * this.hz;
    return this.amplitudeM * w * Math.cos(w * x);
  }
}

/** `count` frequencies from f1 to f2 on a logarithmic grid, Hz. */
export function logFrequencies(f1: number, f2: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => f1 * (f2 / f1) ** (count > 1 ? i / (count - 1) : 0));
}

/** One measured frequency: amplitudes of the first harmonic per metre of post motion, as quarterGains gives them. */
export interface SinePoint {
  hz: number;
  /** Post amplitude, m. */
  amplitudeM: number;
  bodyAcc: number;
  tyreForce: number;
  travel: number;
  /** Time waited and time measured, s. */
  settleS: number;
  measureS: number;
  /** Whether the tyre left the post at some point of the measurement (the response is then not linear). */
  leftPost: boolean;
}

export interface SteppedSineOptions {
  freqsHz: readonly number[];
  /** Velocity amplitude of the post, m/s: amplitude = v/ω. */
  velocityMs: number;
  /** Physics step, s (SHAKER_STEP_S unless given). */
  stepS?: number;
}

/** Least-squares fit of a + b·sin + c·cos, accumulated sample by sample. */
class SineFit {
  private readonly m = new Float64Array(9);
  private readonly r = new Float64Array(3);

  reset(): void {
    this.m.fill(0);
    this.r.fill(0);
  }

  push(sn: number, cs: number, y: number): void {
    const m = this.m;
    m[0] += 1;
    m[1] += sn;
    m[2] += cs;
    m[4] += sn * sn;
    m[5] += sn * cs;
    m[8] += cs * cs;
    this.r[0] += y;
    this.r[1] += y * sn;
    this.r[2] += y * cs;
  }

  /** Amplitude √(b² + c²) of the fitted sine. */
  amplitude(): number {
    const m = this.m;
    // Symmetric 3×3 solve by Cramer's rule.
    const a = [m[0], m[1], m[2], m[1], m[4], m[5], m[2], m[5], m[8]];
    const det3 = (x: number[]): number =>
      x[0] * (x[4] * x[8] - x[5] * x[7]) - x[1] * (x[3] * x[8] - x[5] * x[6]) + x[2] * (x[3] * x[7] - x[4] * x[6]);
    const d = det3(a);
    const col = (j: number): number[] => a.map((v, i) => (i % 3 === j ? this.r[(i / 3) | 0] : v));
    const b = det3(col(1)) / d;
    const c = det3(col(2)) / d;
    return Math.hypot(b, c);
  }
}

/** Measures the corner on the post at each frequency in turn. */
export class SteppedSine {
  readonly rc: ResolvedCorner;
  readonly options: SteppedSineOptions;
  readonly input = new ShakerInput();
  readonly sim: QuarterSim;
  readonly points: SinePoint[] = [];
  /** Slowest decay rate of the linearised corner, 1/s: the settling time is 5 of its time constants. */
  readonly decayRate: number;
  /** Index of the frequency being measured. */
  index = 0;
  /** Physics step, s. */
  readonly step: number;
  private stepInPoint = 0;
  private settleSteps = 0;
  private measureSteps = 0;
  private readonly staticN: number;
  private readonly fits = [new SineFit(), new SineFit(), new SineFit()];
  private leftPost = false;

  constructor(rc: ResolvedCorner, options: SteppedSineOptions) {
    this.rc = rc;
    this.options = options;
    this.step = options.stepS ?? SHAKER_STEP_S;
    this.sim = new QuarterSim(rc, this.input, SHAKER_SPEED_MS);
    const { body, hop } = quarterModes(lineariseQuarter(rc));
    const rate = (m: { hz: number; zeta: number }): number => {
      const wn = 2 * Math.PI * m.hz;
      // An overdamped pair decays at its slower real root.
      return m.zeta < 1 ? m.zeta * wn : wn * (m.zeta - Math.sqrt(m.zeta * m.zeta - 1));
    };
    this.decayRate = Math.min(rate(body), rate(hop));
    this.staticN = (rc.sprungKg + rc.unsprungKg) * G;
    this.begin();
  }

  get done(): boolean {
    return this.index >= this.options.freqsHz.length;
  }

  /** Frequency on the post now, Hz (the last one when done). */
  get hz(): number {
    return this.input.hz;
  }

  private begin(): void {
    if (this.done) return;
    const hz = this.options.freqsHz[this.index];
    const h = this.step;
    this.input.hz = hz;
    this.input.amplitudeM = this.options.velocityMs / (2 * Math.PI * hz);
    const settleS = Math.max(5 / this.decayRate, 3 / hz);
    const periods = Math.max(3, Math.ceil(hz));
    this.settleSteps = Math.ceil(settleS / h);
    this.measureSteps = Math.round(periods / hz / h);
    this.stepInPoint = 0;
    this.leftPost = false;
    for (const f of this.fits) f.reset();
    this.sim.reset(0);
  }

  /** Runs up to `maxSteps` physics steps. Returns true when every frequency is measured. */
  advance(maxSteps: number): boolean {
    const sim = this.sim;
    const out = sim.out;
    for (let budget = maxSteps; !this.done && budget > 0; budget--) {
      sim.step(this.step);
      this.stepInPoint++;
      if (this.stepInPoint > this.settleSteps) {
        // `out` is the state the step started from, at position out.x = time.
        const w = 2 * Math.PI * this.input.hz;
        const sn = Math.sin(w * out.x);
        const cs = Math.cos(w * out.x);
        this.fits[0].push(sn, cs, out.bodyAcc);
        this.fits[1].push(sn, cs, out.tyreN - this.staticN);
        this.fits[2].push(sn, cs, out.travel);
        if (out.inAir) this.leftPost = true;
      }
      if (this.stepInPoint >= this.settleSteps + this.measureSteps) {
        const a = this.input.amplitudeM;
        this.points.push({
          hz: this.input.hz,
          amplitudeM: a,
          bodyAcc: this.fits[0].amplitude() / a,
          tyreForce: this.fits[1].amplitude() / a,
          travel: this.fits[2].amplitude() / a,
          settleS: this.settleSteps * this.step,
          measureS: this.measureSteps * this.step,
          leftPost: this.leftPost,
        });
        this.index++;
        this.begin();
      }
    }
    return this.done;
  }

  /** Runs to the end (tests and scripts). */
  run(): SinePoint[] {
    while (!this.advance(1_000_000));
    return this.points;
  }
}
