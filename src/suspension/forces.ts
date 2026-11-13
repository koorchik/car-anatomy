// Force laws of the suspension elements. Every force acts along the element's own axis and is positive when it pushes
// the ends apart. It reaches the wheel through the motion ratio by virtual work: F_wheel = F·mr, v_element = −mr·q̇,
// with mr = −dL/dq the element's shortening per metre of bump travel (kinematics.ts). Formulas and their status are in
// docs/suspension-model.md.

export const G = 9.81;

/**
 * Coil spring of free length `freeM` at length `lenM`. A progressive coil changes rate from `rate` to `rate2` after
 * `fromM` of compression, blended over 5 mm so the force stays smooth. Seats cannot pull: a spring longer than its
 * free length carries nothing.
 */
export function coilForce(rate: number, freeM: number, lenM: number, rate2 = rate, fromM = Infinity): number {
  const c = freeM - lenM;
  if (c <= 0) return 0;
  return rate * c + (rate2 - rate) * ramp(c - fromM, 0.005);
}

/** ∫ of a smoothstep of width w centred on 0: 0 below −w/2, x above +w/2, a parabola between. */
function ramp(x: number, w: number): number {
  if (x <= -w / 2) return 0;
  if (x >= w / 2) return x;
  const u = x + w / 2;
  return (u * u) / (2 * w);
}

/** Compression of a coil that gives force `f` (inverse of coilForce), m. */
export function coilCompression(f: number, rate: number, rate2 = rate, fromM = Infinity): number {
  if (f <= 0) return 0;
  if (rate2 === rate || !Number.isFinite(fromM)) return f / rate;
  let lo = 0;
  let hi = f / Math.min(rate, rate2) + 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (coilForce(rate, mid, 0, rate2, fromM) < f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Elastomer bump stop squeezed by `x` past contact: F = k·x·(1 + (x/x₀)²), x₀ = 0.4·length. Its stiffness grows
 * fourfold at x₀ and keeps growing, so the stop catches the wheel instead of letting it hit metal. Illustrative law.
 */
export function bumpStopForce(x: number, rate: number, lengthM: number): number {
  if (x <= 0) return 0;
  const r = x / (0.4 * lengthM);
  return rate * x * (1 + r * r);
}

/** Damper coefficients along the damper: below the knee `compression`/`rebound` N·s/m, above it `highRatio` of that. */
export interface DamperCoeffs { compression: number; rebound: number; kneeMs: number; highRatio: number }

/**
 * Damper force for the speed `v` = dL/dt of its length (rebound when v > 0). Opposes the motion, so it is positive
 * (pushes apart) in compression. Piecewise linear: c·v below the knee, then c·v_k + c·r·(v − v_k).
 */
export function damperForce(v: number, d: DamperCoeffs): number {
  const c = v > 0 ? d.rebound : d.compression;
  const s = Math.abs(v);
  const f = s <= d.kneeMs ? c * s : c * d.kneeMs + c * d.highRatio * (s - d.kneeMs);
  return v > 0 ? -f : f;
}

/**
 * Damper coefficients along the damper for a damping ratio ζ at the wheel, after the OptimumG baseline: the initial
 * slope at the wheel is 4π·ζ·f·m, compression takes 2/3 and rebound 3/2 of it below the knee, 1/3 and 3/4 above it
 * (so both halve past the knee). Along the damper the slope is divided by mr².
 */
export function dampingFromZeta(
  zeta: number,
  bodyHz: number,
  sprungKg: number,
  mr: number,
): { compression: number; rebound: number; highRatio: number } {
  const wheel = 4 * Math.PI * zeta * bodyHz * sprungKg;
  const along = wheel / (mr * mr);
  return { compression: (2 / 3) * along, rebound: (3 / 2) * along, highRatio: 0.5 };
}

/** Vertical tyre force for a deflection δ (positive when pressed) and its rate. Never pulls: off the road it is 0. */
export function tyreNormalForce(deflM: number, deflRate: number, kt: number, ct: number): number {
  if (deflM <= 0) return 0;
  const f = kt * deflM + ct * deflRate;
  return f > 0 ? f : 0;
}
