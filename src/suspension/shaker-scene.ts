// The shaker scene (suspensions plan, scenes, «Стенд», stage P3): the corner on a post that moves the tyre with the
// same velocity amplitude at every frequency. The curves are the analytic response of the linear quarter car
// (quarterGains), the points the stepped sine of the quarter car in time (shaker.ts), and three reference dampers
// show the invariant point: at √(k_t/m_u) the body moves m_u/m_s of the post's motion whatever the damper, exactly
// without tyre damping and nearly with it.
//
// The stand fits the corner with a damper equal in bump and rebound and without a knee, of the same mean coefficient
// the analytic curve takes. The corner's own damper is softer in bump than in rebound, and that non-linear damper
// leaves the points up to 3 % off the curve near half the wheel-hop frequency (docs/suspension-model.md, the shaker);
// the stand shows the mechanism, the curve and the points of one and the same corner.
// Pure: no DOM, no text.

import { invariantPoints, lineariseQuarter, newQuarterGains, quarterGains, quarterModes, type QuarterLinear, type QuarterMode } from './evaluate.ts';
import { ShakerInput, logFrequencies, type SinePoint } from './shaker.ts';
import type { ResolvedCorner } from './setup.ts';

const TAU = 2 * Math.PI;

/** Velocity amplitude of the post while the points are measured, m/s: below the knee of every damper of the page. */
export const SHAKER_VELOCITY_MS = 0.02;
/** The measured frequencies: 30 on a logarithmic grid over the plan's 0.5–25 Hz. */
export const SHAKER_BAND_HZ: readonly [number, number] = [0.5, 25];
export const SHAKER_FREQS: readonly number[] = logFrequencies(SHAKER_BAND_HZ[0], SHAKER_BAND_HZ[1], 30);
/** The three dampers whose curves show the invariant point (as the test of the quarter car takes them). */
export const SHAKER_ZETAS: readonly number[] = [0.1, 0.3, 0.7];

/** The corner on the stand: a linear damper of the mean coefficient at `zeta` (its own when null), tyre damping on or off. */
export function standCorner(rc: ResolvedCorner, tyreDamping: boolean, zeta: number | null = null): ResolvedCorner {
  const mr = rc.atRest.mrDamper;
  const mean = (rc.damper.compression + rc.damper.rebound) / 2;
  const along = zeta === null ? mean : mean * (zeta / rc.zeta);
  return {
    ...rc,
    damper: { ...rc.damper, compression: along, rebound: along, highRatio: 1 },
    wheelDamping: { compression: along * mr * mr, rebound: along * mr * mr },
    zeta: zeta ?? rc.zeta,
    tyre: { ...rc.tyre, ct: tyreDamping ? rc.tyre.ct : 0 },
  };
}

/** Amplitudes on the post at SHAKER_VELOCITY_MS: body acceleration, m/s², and dynamic tyre force, N. */
export interface FrfCurve {
  hz: Float64Array;
  bodyAcc: Float64Array;
  tyreForce: Float64Array;
}

/** Post amplitude at `hz` for a velocity amplitude `v`, m. */
export const postAmplitude = (hz: number, v = SHAKER_VELOCITY_MS): number => v / (TAU * hz);

/** The analytic curve of a linear corner on `count` logarithmic frequencies over the band. */
export function frfCurve(lin: QuarterLinear, count = 160): FrfCurve {
  const hz = new Float64Array(logFrequencies(SHAKER_BAND_HZ[0], SHAKER_BAND_HZ[1], count));
  const bodyAcc = new Float64Array(count);
  const tyreForce = new Float64Array(count);
  const g = newQuarterGains();
  hz.forEach((f, i) => {
    quarterGains(lin, f, g);
    const a = postAmplitude(f);
    bodyAcc[i] = g.bodyAcc * a;
    tyreForce[i] = g.tyreForce * a;
  });
  return { hz, bodyAcc, tyreForce };
}

/** Where the three reference curves of the body meet, and how far apart they are there. */
export interface InvariantCheck {
  hz: number;
  /** Body acceleration the invariant point predicts at SHAKER_VELOCITY_MS, m/s². */
  bodyAcc: number;
  /** Each reference curve's body acceleration there over the prediction. */
  ratios: number[];
  /** Largest |ratio − 1|. */
  spread: number;
}

export function invariantCheck(rc: ResolvedCorner, tyreDamping: boolean): InvariantCheck {
  const inv = invariantPoints(lineariseQuarter(standCorner(rc, tyreDamping)));
  const w = TAU * inv.bodyHz;
  const predicted = inv.bodyGain * w * w * postAmplitude(inv.bodyHz);
  const g = newQuarterGains();
  const ratios = SHAKER_ZETAS.map((zeta) => {
    quarterGains(lineariseQuarter(standCorner(rc, tyreDamping, zeta)), inv.bodyHz, g);
    return (g.bodyAcc * postAmplitude(inv.bodyHz)) / predicted;
  });
  return { hz: inv.bodyHz, bodyAcc: predicted, ratios, spread: Math.max(...ratios.map((r) => Math.abs(r - 1))) };
}

/** Everything the stand draws for one corner and tyre damping, but the points. */
export interface StandCurves {
  corner: ResolvedCorner;
  lin: QuarterLinear;
  current: FrfCurve;
  references: FrfCurve[];
  body: QuarterMode;
  hop: QuarterMode;
  invariant: InvariantCheck;
}

export function standCurves(rc: ResolvedCorner, tyreDamping: boolean): StandCurves {
  const corner = standCorner(rc, tyreDamping);
  const lin = lineariseQuarter(corner);
  const { body, hop } = quarterModes(lin);
  return {
    corner,
    lin,
    current: frfCurve(lin),
    references: SHAKER_ZETAS.map((zeta) => frfCurve(lineariseQuarter(standCorner(rc, tyreDamping, zeta)))),
    body,
    hop,
    invariant: invariantCheck(rc, tyreDamping),
  };
}

/** Largest relative gap of measured points from the analytic curve of `lin` (body and tyre), and where. */
export function pointsGap(lin: QuarterLinear, points: readonly SinePoint[]): { gap: number; hz: number } {
  const g = newQuarterGains();
  let gap = 0;
  let hz = Number.NaN;
  for (const p of points) {
    quarterGains(lin, p.hz, g);
    const d = Math.max(Math.abs(p.bodyAcc / g.bodyAcc - 1), Math.abs(p.tyreForce / g.tyreForce - 1));
    if (d > gap) {
      gap = d;
      hz = p.hz;
    }
  }
  return { gap, hz };
}

/**
 * The post for the 3D: a sine whose frequency the page may change at any time without a jump. The phase is carried
 * across the change, so the post moves on smoothly, and the corner on it swings into the new frequency as it would on
 * a real stand. Read at x = time by a quarter car driven at 1 m/s, as ShakerInput.
 */
export class GlidingPost extends ShakerInput {
  /** Velocity amplitude, m/s. */
  velocityMs: number;
  private x0 = 0;
  private phase0 = 0;

  constructor(velocityMs: number, hz: number) {
    super();
    this.velocityMs = velocityMs;
    this.hz = hz;
    this.amplitudeM = postAmplitude(hz, velocityMs);
  }

  /** Changes the frequency from position (time) x on. */
  setHz(hz: number, x: number): void {
    if (hz === this.hz) return;
    this.phase0 = this.phaseAt(x);
    this.x0 = x;
    this.hz = hz;
    this.amplitudeM = postAmplitude(hz, this.velocityMs);
  }

  private phaseAt(x: number): number {
    return this.phase0 + TAU * this.hz * (x - this.x0);
  }

  override heightAt(x: number): number {
    return this.amplitudeM * Math.sin(this.phaseAt(x));
  }

  override slopeAt(x: number): number {
    return this.amplitudeM * TAU * this.hz * Math.cos(this.phaseAt(x));
  }
}
