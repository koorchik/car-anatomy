// Quick estimates of a corner without running it in time (suspensions plan, quick estimates for the designer). The
// designer's sensitivity calls these dozens of times, so everything here is a closed form or a frequency-domain sum.
//
// The quarter car is linearised about rest: the wheel rate is the slope of the support force the simulation itself
// computes (spring through the varying motion ratio, preload and any stop touching at rest), the tyre is k_t and c_t,
// and the damper becomes one coefficient at the wheel. A damper with different compression and rebound below its
// knee acts on a sine like the mean of the two (the first harmonic of its force); past the knee it is weaker, so on a
// random road it is replaced by the coefficient that dissipates the same power for a Gaussian damper speed of the RMS
// the road gives (statistical linearisation, iterated until the RMS and the coefficient agree).
//
//   m_s·s²·Z_s = P·(Z_u − Z_s)                    P = k + c·s,  T = k_t + c_t·s
//   m_u·s²·Z_u = −P·(Z_u − Z_s) + T·(Y − Z_u)     Δ = (m_u·s² + P + T)·(m_s·s² + P) − P²
//   Z_s = P·T·Y/Δ,  travel = m_s·s²·T·Y/Δ,  tyre force = T·(Y − Z_u) = s²·T·(m_u·m_s·s² + (m_u + m_s)·P)·Y/Δ
//
// On a random road the response is ∫|H(f)|²·S(f) df over the road's band, with S(f) = G_d(f/v)/v the road seen at
// speed v, and the road filtered by the tyre's patch average the way RoadBuffer filters it. The circle of the
// envelope follows a class B or C road almost exactly (its curvature is far below 1/r), so only the average counts.
// The sum runs on 301 logarithmic frequencies by Simpson's rule.

import type { ResolvedCorner } from './setup.ts';
import type { DamperCoeffs } from './forces.ts';
import { G } from './forces.ts';
import { FLAT_ROAD, QuarterSim } from './quarter.ts';
import { gaussianGrip, normalTail, weightingGain } from './comfort.ts';
import { ISO_8608_BAND, ISO_8608_CLASSES, ROAD_STEP_M, roadPsd, type RoadClass } from './road.ts';
import { tyreAt, type Tyre } from '../vehicle/tyre.ts';

const TAU = 2 * Math.PI;

/** The corner linearised about rest. Masses in kg, rates in N/m, damping in N·s/m, all at the wheel. */
export interface QuarterLinear {
  ms: number;
  mu: number;
  k: number;
  /** Damping at the wheel for a small sine: the mean of compression and rebound below the knee. */
  c: number;
  kt: number;
  ct: number;
  /** Tyre load at rest, N. */
  staticN: number;
  /** The damper along its axis and its motion ratio at rest, for the statistical linearisation. */
  damper: DamperCoeffs;
  mrDamper: number;
}

/** Linearises a resolved corner about rest, with the same tables and stops the quarter car runs on. */
export function lineariseQuarter(rc: ResolvedCorner): QuarterLinear {
  const sim = new QuarterSim(rc, FLAT_ROAD, 0);
  const s = sim.state;
  const z0 = s[0];
  const d = new Float64Array(4);
  const eps = 1e-4;
  // The body down by ε is the wheel up by ε relative to it: travel +ε.
  s[0] = z0 - eps;
  sim.derivs(s, 0, d, true);
  const up = sim.out.supportN;
  s[0] = z0 + eps;
  sim.derivs(s, 0, d, true);
  const down = sim.out.supportN;
  s[0] = z0;
  const mr = rc.atRest.mrDamper;
  return {
    ms: rc.sprungKg,
    mu: rc.unsprungKg,
    k: (up - down) / (2 * eps),
    c: ((rc.damper.compression + rc.damper.rebound) / 2) * mr * mr,
    kt: rc.tyre.kt,
    ct: rc.tyre.ct,
    staticN: (rc.sprungKg + rc.unsprungKg) * G,
    damper: rc.damper,
    mrDamper: mr,
  };
}

/**
 * Damping at the wheel that dissipates what the damper does for a Gaussian damper speed of RMS `rmsMs` along it:
 * c_eq = E[F·v]/E[v²] = (c_c + c_r)·(½ − (1 − r)·Q(v_k/σ))·mr², Q the normal tail. Equals the small-sine value when
 * the speed stays under the knee, and tends to its share r far past it.
 */
export function equivalentDamping(d: DamperCoeffs, mr: number, rmsMs: number): number {
  const tail = rmsMs > 0 ? normalTail(d.kneeMs / rmsMs) : 0;
  return (d.compression + d.rebound) * (0.5 - (1 - d.highRatio) * tail) * mr * mr;
}

/** Gains of the linear quarter car per metre of road height at one frequency. */
export interface QuarterGains {
  /** Body acceleration, 1/s². */
  bodyAcc: number;
  /** Dynamic tyre force, N/m. */
  tyreForce: number;
  /** Suspension travel (wheel relative to body), m/m. */
  travel: number;
  /** Wheel height above the road datum, m/m. */
  wheel: number;
}

export const newQuarterGains = (): QuarterGains => ({ bodyAcc: 0, tyreForce: 0, travel: 0, wheel: 0 });

/** Frequency response of the linear quarter car at `hz` into `out` (magnitudes). `c` overrides the damping. */
export function quarterGains(lin: QuarterLinear, hz: number, out: QuarterGains, c = lin.c): QuarterGains {
  const w = TAU * hz;
  const w2 = w * w;
  const { ms, mu, k, kt, ct } = lin;
  // P = k + icω, T = kt + ictω, B = −ms·ω² + P, A = −mu·ω² + P + T, Δ = A·B − P².
  const pr = k;
  const pi = c * w;
  const tr = kt;
  const ti = ct * w;
  const br = k - ms * w2;
  const bi = pi;
  const ar = k + kt - mu * w2;
  const ai = (c + ct) * w;
  const dr = ar * br - ai * bi - (pr * pr - pi * pi);
  const di = ar * bi + ai * br - 2 * pr * pi;
  const dAbs = Math.hypot(dr, di);
  const tAbs = Math.hypot(tr, ti);
  // Tyre force numerator: −mu·ms·ω² + (mu + ms)·P.
  const fr = -mu * ms * w2 + (mu + ms) * pr;
  const fi = (mu + ms) * pi;
  // Wheel: Z_u = T·B·Y/Δ.
  out.bodyAcc = (w2 * Math.hypot(pr, pi) * tAbs) / dAbs;
  out.travel = (ms * w2 * tAbs) / dAbs;
  out.tyreForce = (w2 * tAbs * Math.hypot(fr, fi)) / dAbs;
  out.wheel = (tAbs * Math.hypot(br, bi)) / dAbs;
  return out;
}

/** A mode of the quarter car: the undamped frequency of its pair of roots and its damping ratio. */
export interface QuarterMode {
  hz: number;
  zeta: number;
}

/** Body and wheel-hop modes from the four roots of Δ(s) = 0. With heavy damping a pair may be real (ζ > 1). */
export function quarterModes(lin: QuarterLinear, c = lin.c): { body: QuarterMode; hop: QuarterMode } {
  const { ms, mu, k, kt, ct } = lin;
  const poly = [mu * ms, mu * c + (c + ct) * ms, mu * k + ct * c + (k + kt) * ms, ct * k + kt * c, k * kt];
  const roots = polyRoots(poly);
  // Pair each complex root with its conjugate; the real ones pair among themselves.
  const complex = roots.filter((r) => Math.abs(r[1]) > 1e-9 * Math.hypot(r[0], r[1])).filter((r) => r[1] > 0);
  const real = roots.filter((r) => Math.abs(r[1]) <= 1e-9 * Math.hypot(r[0], r[1])).map((r) => r[0]).sort((a, b) => a - b);
  const modes: QuarterMode[] = complex.map(([re, im]) => {
    const wn = Math.hypot(re, im);
    return { hz: wn / TAU, zeta: -re / wn };
  });
  for (let i = 0; i + 1 < real.length; i += 2) {
    const wn = Math.sqrt(real[i] * real[i + 1]);
    modes.push({ hz: wn / TAU, zeta: -(real[i] + real[i + 1]) / (2 * wn) });
  }
  modes.sort((a, b) => a.hz - b.hz);
  return { body: modes[0], hop: modes[modes.length - 1] };
}

/** Roots of a polynomial given from the highest power, as [re, im] pairs (Durand–Kerner on the monic form). */
export function polyRoots(coeffs: readonly number[]): Array<[number, number]> {
  const n = coeffs.length - 1;
  // Scale s so the roots sit near the unit circle: the geometric mean of their magnitudes is |c_n/c_0|^(1/n).
  const scale = Math.abs(coeffs[n] / coeffs[0]) ** (1 / n) || 1;
  const a = coeffs.map((c, i) => c / coeffs[0] / scale ** i);
  const zr = new Float64Array(n);
  const zi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Powers of 0.4 + 0.9i: distinct, off the real axis, not symmetric about it.
    const ang = i * Math.atan2(0.9, 0.4);
    const mag = Math.hypot(0.4, 0.9) ** i;
    zr[i] = mag * Math.cos(ang);
    zi[i] = mag * Math.sin(ang);
  }
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      // p(z) by Horner.
      let pr = 1;
      let pi = 0;
      for (let j = 1; j <= n; j++) {
        const r = pr * zr[i] - pi * zi[i] + a[j];
        pi = pr * zi[i] + pi * zr[i];
        pr = r;
      }
      let qr = 1;
      let qi = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dr = zr[i] - zr[j];
        const di = zi[i] - zi[j];
        const r = qr * dr - qi * di;
        qi = qr * di + qi * dr;
        qr = r;
      }
      const den = qr * qr + qi * qi;
      const sr = (pr * qr + pi * qi) / den;
      const si = (pi * qr - pr * qi) / den;
      zr[i] -= sr;
      zi[i] -= si;
      moved = Math.max(moved, Math.hypot(sr, si));
    }
    if (moved < 1e-15) break;
  }
  return Array.from({ length: n }, (_, i) => [zr[i] * scale, zi[i] * scale] as [number, number]);
}

/** Points where the damper and the spring change nothing (Hedrick & Butsuen; docs/suspension-research). */
export interface InvariantPoints {
  /** √(k_t/m_u): body acceleration k_t/m_s per metre of road, i.e. body motion m_u/m_s of the road's (c_t = 0). */
  bodyHz: number;
  bodyGain: number;
  /** √(k_t/(m_s + m_u)): travel (m_s + m_u)/m_s of the road's. */
  travelHz: number;
  travelGain: number;
}

export function invariantPoints(lin: QuarterLinear): InvariantPoints {
  return {
    bodyHz: Math.sqrt(lin.kt / lin.mu) / TAU,
    bodyGain: lin.mu / lin.ms,
    travelHz: Math.sqrt(lin.kt / (lin.ms + lin.mu)) / TAU,
    travelGain: (lin.ms + lin.mu) / lin.ms,
  };
}

/** A rough road at a speed. */
export interface RoughRoad {
  roadClass: RoadClass | number;
  speedMs: number;
}

/** The ride triangle of a quarter car on a random road, in the frequency domain. */
export interface RoughRoadEstimate {
  road: RoughRoad;
  /** Wk-weighted and plain RMS of the body acceleration, m/s². */
  comfortAw: number;
  bodyAccRms: number;
  /** RMS of the dynamic tyre force, N, and over the static load. */
  tyreForceRmsN: number;
  dlc: number;
  /** RMS of the travel, m, and of its rate, m/s. */
  travelRmsM: number;
  travelRateRmsMs: number;
  /** For a Gaussian load: share of time off the road, and ⟨F_max(max(F_z, 0))⟩/F_max(F_z,static). */
  airShare: number;
  availableGrip: number;
  /** Damping at the wheel the estimate settled on, N·s/m. */
  dampingNsm: number;
}

export interface RoughRoadOptions {
  /** Patch length the road is averaged over, m (RoadBuffer's window); 0 for none. */
  patchM: number;
  /** The tyre for the available grip, fitted to the corner's static load. */
  tyre: Tyre;
  /** Keep the small-sine damping instead of linearising the knee for the road's damper speed. */
  smallSine?: boolean;
  /** Intervals of Simpson's rule on the logarithmic grid (even). */
  intervals?: number;
}

/** Patch average of RoadBuffer at spatial frequency n: a moving mean of 2a + 1 nodes 5 mm apart. */
function patchGain(n: number, patchM: number): number {
  const width = 2 * Math.max(0, Math.round(patchM / (2 * ROAD_STEP_M))) + 1;
  if (width === 1) return 1;
  const x = Math.PI * n * ROAD_STEP_M;
  return Math.abs(Math.sin(width * x) / (width * Math.sin(x)));
}

/** Comfort, grip and travel of a linear quarter car on an ISO 8608 road (see the head of the file). */
export function roughRoadEstimate(lin: QuarterLinear, road: RoughRoad, o: RoughRoadOptions): RoughRoadEstimate {
  const gd0 = typeof road.roadClass === 'number' ? road.roadClass : ISO_8608_CLASSES[road.roadClass];
  if (!(gd0 >= 0)) throw new Error(`Unknown road class: ${road.roadClass}`);
  // Backwards the wheel meets the same spectrum; standing still or on a perfect road, nothing moves (the band below
  // would collapse to 0 Hz and every sum to NaN).
  const v = Math.abs(road.speedMs);
  if (!(v > 0) || gd0 === 0) {
    return {
      road, comfortAw: 0, bodyAccRms: 0, tyreForceRmsN: 0, dlc: 0, travelRmsM: 0, travelRateRmsMs: 0, airShare: 0,
      availableGrip: 1, dampingNsm: lin.c,
    };
  }
  const intervals = o.intervals ?? 300;
  const f1 = ISO_8608_BAND[0] * v;
  const f2 = ISO_8608_BAND[1] * v;
  const h = Math.log(f2 / f1) / intervals;
  // The road's share of each frequency (S(f)·df with Simpson's weights) and the comfort weighting do not depend on
  // the damping, so the linearisation loop below only recomputes the gains.
  const freq = new Float64Array(intervals + 1);
  const share = new Float64Array(intervals + 1);
  const wk2 = new Float64Array(intervals + 1);
  for (let i = 0; i <= intervals; i++) {
    const f = f1 * Math.exp(i * h);
    const n = f / v;
    const pg = patchGain(n, o.patchM);
    // S(f)·df = G_d(n)/v · f·d(ln f), Simpson weights 1, 4, 2, …, 4, 1.
    const weight = (i === 0 || i === intervals ? 1 : i % 2 === 1 ? 4 : 2) * (h / 3);
    freq[i] = f;
    share[i] = ((roadPsd(gd0, n) * pg * pg) / v) * f * weight;
    wk2[i] = weightingGain('Wk', f) ** 2;
  }
  const gains = newQuarterGains();
  const integrate = (c: number) => {
    let aw = 0;
    let acc = 0;
    let force = 0;
    let travel = 0;
    let rate = 0;
    for (let i = 0; i <= intervals; i++) {
      const s = share[i];
      quarterGains(lin, freq[i], gains, c);
      const a2 = gains.bodyAcc * gains.bodyAcc * s;
      const t2 = gains.travel * gains.travel * s;
      aw += a2 * wk2[i];
      acc += a2;
      force += gains.tyreForce * gains.tyreForce * s;
      travel += t2;
      rate += t2 * (TAU * freq[i]) ** 2;
    }
    return { aw: Math.sqrt(aw), acc: Math.sqrt(acc), force: Math.sqrt(force), travel: Math.sqrt(travel), rate: Math.sqrt(rate) };
  };
  let c = lin.c;
  let r = integrate(c);
  if (!o.smallSine) {
    // A fixed point: the damping sets the damper's RMS speed, which sets the damping. It converges in a few rounds
    // because the RMS changes much less than the damping does.
    for (let it = 0; it < 50; it++) {
      const next = equivalentDamping(lin.damper, lin.mrDamper, r.rate * lin.mrDamper);
      const done = Math.abs(next - c) <= 1e-7 * c;
      c = next;
      r = integrate(c);
      if (done) break;
    }
  }
  const dlc = r.force / lin.staticN;
  const gauss = gaussianGrip(lin.staticN, r.force, o.tyre);
  return {
    road,
    comfortAw: r.aw,
    bodyAccRms: r.acc,
    tyreForceRmsN: r.force,
    dlc,
    travelRmsM: r.travel,
    travelRateRmsMs: r.rate,
    airShare: gauss.airShare,
    availableGrip: gauss.availableGrip,
    dampingNsm: c,
  };
}

/** The two roads every corner is judged on: class B at 25 m/s (90 km/h) and class C at 15 m/s (54 km/h). */
export const EVALUATE_ROADS = {
  smooth: { roadClass: 'B', speedMs: 25 },
  rough: { roadClass: 'C', speedMs: 15 },
} as const satisfies Record<string, RoughRoad>;

/** Everything the designer reads about a corner's ride. */
export interface QuarterEvaluation {
  linear: QuarterLinear;
  /** Ride frequency from the ride rate (spring and tyre in series), Hz, as the setup gives it; `body` is the mode. */
  rideHz: number;
  body: QuarterMode;
  hop: QuarterMode;
  invariant: InvariantPoints;
  smooth: RoughRoadEstimate;
  rough: RoughRoadEstimate;
  /** Unsprung over sprung mass. */
  unsprungRatio: number;
  /** Travel from rest to the bump stop less 3σ of the travel on the rough road, m (negative: it will hit the stop). */
  travelReserveM: number;
}

/** Linear estimates of a corner's ride. `tyre` defaults to the corner's tyre fitted to its static load. */
export function evaluateQuarter(rc: ResolvedCorner, tyre?: Tyre): QuarterEvaluation {
  const lin = lineariseQuarter(rc);
  const t = tyre ?? tyreAt(rc.corner.tyre, lin.staticN);
  const opts: RoughRoadOptions = { patchM: rc.tyre.patchM, tyre: t };
  const { body, hop } = quarterModes(lin);
  const rough = roughRoadEstimate(lin, EVALUATE_ROADS.rough, opts);
  return {
    linear: lin,
    rideHz: rc.bodyHz,
    body,
    hop,
    invariant: invariantPoints(lin),
    smooth: roughRoadEstimate(lin, EVALUATE_ROADS.smooth, opts),
    rough,
    unsprungRatio: lin.mu / lin.ms,
    travelReserveM: rc.bumpStop.travelM - 3 * rough.travelRmsM,
  };
}
