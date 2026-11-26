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

/** Shear modulus of spring steel, Pa (suspensions plan; the textbook value of steel). */
export const STEEL_SHEAR_MODULUS_PA = 79e9;

/**
 * Torsional rate of an anti-roll bar's twisting section, N·m/rad: K_θ = G·π·(d⁴ − d_i⁴)/(32·L) (OptimumG, «Bar
 * Talk»), d_i = d − 2·wall for a tube.
 */
export function swayBarTorsionRate(diameterM: number, wallM: number | null, spanM: number): number {
  const di = wallM === null ? 0 : Math.max(0, diameterM - 2 * wallM);
  return (STEEL_SHEAR_MODULUS_PA * Math.PI * (diameterM ** 4 - di ** 4)) / (32 * spanM);
}

// ---------------------------------------------------------------------------------------------------------------------
// Gas springs (stage P14-core): an air spring and a hydropneumatic strut obey the same law along their axis. A piston of
// effective area A shortens the element and squeezes a gas of volume V: p·V^n = const, F = (p − p_atm)·A. The air
// spring's gas is the air in its bellows; the hydropneumatic strut pushes incompressible oil into a sphere whose
// nitrogen sits behind a membrane. The rate along the element is k = n·p·A²/V (Firestone's form without the dA/dz term:
// a straight piston, docs/research/suspensions.md 1.3). They part ways when the load changes: levelling keeps the ride
// height by adding air to the bellows (the volume at ride height stays, the pressure follows the load) or oil to the
// strut (the gas keeps its mass and shrinks), docs/suspension-model.md.

/** Atmospheric pressure, Pa. */
export const P_ATM_PA = 101325;

/** Polytropic exponent of the gas in a working spring (Firestone, 1.38). */
export const GAS_POLYTROPIC_N = 1.38;

/**
 * Gauge pressure of each kind at its static load, Pa: what sizes the piston (A = F/p). Estimates: an air spring of a
 * car at about 6 bar, a hydropneumatic strut at about 50 bar, under the 75 bar its nitrogen is charged to at most
 * (Citroën, docs/research/suspensions.md 1.3). The levelled hydropneumatic law does not depend on it (p ≫ p_atm); the
 * levelled air spring's only through the p_atm term.
 */
export const GAS_STATIC_GAUGE_PA = { air: 6e5, hydro: 50e5 } as const;

export type GasKind = keyof typeof GAS_STATIC_GAUGE_PA;

/** A gas spring as built for a static load at its design length. */
export interface GasSpring {
  kind: GasKind;
  /** Effective piston area, m². */
  areaM2: number;
  /** Gas volume and absolute pressure at `designLenM`, m³ and Pa. */
  volumeM3: number;
  pressurePa: number;
  designLenM: number;
  n: number;
}

/**
 * The gas spring of `kind` that carries `staticN` along its axis at length `lenM` with rate `rateNm` along it there:
 * the piston from the kind's static pressure, then the volume from k = n·p·A²/V.
 */
export function gasSpringFor(kind: GasKind, staticN: number, rateNm: number, lenM: number): GasSpring {
  const gauge = GAS_STATIC_GAUGE_PA[kind];
  const areaM2 = Math.max(staticN, 1) / gauge;
  const pressurePa = gauge + P_ATM_PA;
  const n = GAS_POLYTROPIC_N;
  return { kind, areaM2, volumeM3: (n * pressurePa * areaM2 * areaM2) / rateNm, pressurePa, designLenM: lenM, n };
}

/** Smallest share of its design volume the gas may be squeezed to: past it the law is held linear (a stop takes over
 *  long before on any real car). */
const GAS_MIN_SHARE = 0.1;

/** Force along a gas spring at length `lenM`, N (pushes apart; never pulls). */
export function gasSpringForce(g: GasSpring, lenM: number): number {
  const v = g.volumeM3 - g.areaM2 * (g.designLenM - lenM);
  const vMin = GAS_MIN_SHARE * g.volumeM3;
  let p: number;
  if (v >= vMin) p = g.pressurePa * (g.volumeM3 / v) ** g.n;
  else {
    const pMin = g.pressurePa * (1 / GAS_MIN_SHARE) ** g.n;
    p = pMin * (1 + (g.n * (vMin - v)) / vMin);
  }
  const f = (p - P_ATM_PA) * g.areaM2;
  return f > 0 ? f : 0;
}

/** Rate along a gas spring at length `lenM`, N/m: n·p·A²/V (central difference past the volume floor). */
export function gasSpringRate(g: GasSpring, lenM: number): number {
  const v = g.volumeM3 - g.areaM2 * (g.designLenM - lenM);
  if (v >= GAS_MIN_SHARE * g.volumeM3) return (g.n * g.pressurePa * (g.volumeM3 / v) ** g.n * g.areaM2 * g.areaM2) / v;
  const h = 1e-5;
  return (gasSpringForce(g, lenM - h) - gasSpringForce(g, lenM + h)) / (2 * h);
}

/**
 * The same gas spring after levelling to a new static load `staticN` at its design length: air is added to the bellows
 * (the volume stays, the pressure follows the load), oil to the hydropneumatic strut (the nitrogen keeps its mass:
 * p·V^n stays). Unlevelled, the spring would instead sink until its force met the load (gasSpringForce).
 */
export function levelGasSpring(g: GasSpring, staticN: number): GasSpring {
  const pressurePa = Math.max(staticN, 0) / g.areaM2 + P_ATM_PA;
  const volumeM3 = g.kind === 'air' ? g.volumeM3 : g.volumeM3 * (g.pressurePa / pressurePa) ** (1 / g.n);
  return { ...g, pressurePa, volumeM3 };
}

/** The force law of a chassis or corner spring: a coil (possibly progressive) or, when `gas` is set, a gas spring. */
export interface SpringLaw {
  rate: number;
  rate2: number;
  fromM: number;
  freeM: number;
  gas?: GasSpring | null;
}

/** Force along any spring at length `lenM`, N. */
export function springForce(s: SpringLaw, lenM: number): number {
  return s.gas ? gasSpringForce(s.gas, lenM) : coilForce(s.rate, s.freeM, lenM, s.rate2, s.fromM);
}
