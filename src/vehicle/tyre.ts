// One tyre for the whole site: the Magic Formula PAC2002 (pure and combined slip, Fx, Fy, Mz) with its relaxation and
// low-speed handling, the brush form, and the narrow longitudinal view the drivetrain uses. No DOM and no text, so the
// audio worklet may import it. Coefficient sets are data in tyre-data.ts; formulas and their status are in
// docs/suspension-model.md (the Magic Formula section).
//
// Conventions (the .tir files' own, TYDEX W-axis): x along the wheel heading, y to its left, z up.
// - Longitudinal slip κ = (ω·r − vx)/|vx|: positive drives, negative brakes.
// - Slip angle α: tan α = vy/|vx|, with vy the lateral velocity of the wheel centre. Positive α gives negative Fy, so
//   the force always opposes the sliding (PKY1 < 0 in every file).
// - Inclination γ: positive when the top of the wheel leans to −y (to the right looking forward), so a positive γ
//   pushes to −y. For a car wheel use inclinationOf(side, camber).
// - Mz about z: positive turns the heading to the left. The aligning moment turns the wheel towards its velocity.
// The files describe a left tyre. The right one is its mirror: Fy_R(κ, α, γ) = −Fy_L(κ, −α, −γ), the same for Mz,
// Fx_R(κ, α, γ) = Fx_L(κ, −α, −γ), so a car's left turn is the mirror of its right turn even though the files are not
// symmetric (PHY1, PVY1).
//
// Equations: PAC2002 as in Pacejka, «Tire and Vehicle Dynamics», 2nd ed., ch. 4 (MF 5.2 form), cross-checked against
// MFeval Solver.m and Chrono ChPac02Tire.cpp (BSD-3-Clause). Two places where Chrono departs from the book follow the
// book: μy changes with camber as (1 − PDY3·γ²), so the Sedan file's negative PDY3 raises it (Chrono writes
// 1 + PDY3·γ²), and the combined trail uses sign(α_t) (Chrono writes sign(κ)). Chrono's clamp of B·x at ±π/2 is not used: it bends the curve past the peak.

import { drivingMassKg, type CarRecord } from './car.ts';
import { G } from './constants.ts';
import { MF_185_80R14, TYRE_MU, TYRE_SETS, type MfSet } from './tyre-data.ts';
import type { TyreId } from './vehicle.ts';

export type TyreSide = 'left' | 'right';

/** Inclination γ of a car wheel from its camber (ISO 8855: positive when the top leans away from the car). */
export const inclinationOf = (side: TyreSide, camber: number): number => (side === 'left' ? -camber : camber);

/** What one evaluation of the Magic Formula gives. Forces in N, moment in N·m. */
export interface MfForces {
  fx: number;
  fy: number;
  mz: number;
  /** Pure-slip forces at the same slips, and their peaks D at this load, camber and surface. */
  fx0: number;
  fy0: number;
  dx: number;
  dy: number;
  /** Slip stiffness along, N per unit κ, and across, N/rad (negative: the force opposes α). */
  kx: number;
  ky: number;
  /** ∂Fx/∂κ of the pure longitudinal curve times the combined weight G_xα: the slope for a linear-implicit step. */
  dFxdKappa: number;
  /** Lateral curvature E_y as the equations give it, and after the clamp to 1. */
  eyRaw: number;
  ey: number;
}

export const newMfForces = (): MfForces => ({ fx: 0, fy: 0, mz: 0, fx0: 0, fy0: 0, dx: 0, dy: 0, kx: 0, ky: 0, dFxdKappa: 0, eyRaw: 0, ey: 0 });

/** Below this share of the dry friction the surface counts as none: the formula needs D > 0. */
const MU_MIN = 1e-3;

const sgn = (x: number): number => (x >= 0 ? 1 : -1);

/** y = sin(C·atan(B·x − E·(B·x − atan(B·x)))), the Magic Formula without D and the shifts. */
const mf = (b: number, c: number, e: number, x: number): number => {
  const bx = b * x;
  return Math.sin(c * Math.atan(bx - e * (bx - Math.atan(bx))));
};

/** cos(C·atan(B·x − E·(B·x − atan(B·x)))), the weighting function of combined slip without its normaliser. */
const weight = (b: number, c: number, e: number, x: number): number => {
  const bx = b * x;
  return Math.cos(c * Math.atan(bx - e * (bx - Math.atan(bx))));
};

/**
 * The left tyre of set `p`, as measured: longitudinal slip κ, slip angle α and inclination γ in rad, load Fz in N,
 * `muScale` the surface's share of dry friction (it scales LMUX and LMUY, as the MF does for the road). `rolling` is
 * the share of the files' zero-slip shifts and residual moment (PHX, PVX, PHY, PVY, QDZ6-9) that applies: 1 on a
 * rolling tyre, fading to 0 at standstill (lowSpeedShare), where a tyre with no deflection makes no force. Writes `o`.
 */
export function mfEval(p: MfSet, kappa: number, alpha: number, gamma: number, fz: number, muScale: number, o: MfForces, rolling = 1): void {
  if (!(fz > 0)) {
    o.fx = o.fy = o.mz = o.fx0 = o.fy0 = o.dx = o.dy = o.kx = o.ky = o.dFxdKappa = o.eyRaw = o.ey = 0;
    return;
  }
  const mu = Math.max(MU_MIN, muScale);
  const fz0 = p.LFZO * p.FNOMIN;
  const dfz = (fz - fz0) / fz0;
  const lmux = p.LMUX * mu;
  const lmuy = p.LMUY * mu;
  const g2 = gamma * gamma;

  // Longitudinal, pure slip.
  const shx = (p.PHX1 + p.PHX2 * dfz) * rolling;
  const kx1 = kappa + shx;
  const cx = p.PCX1;
  const dx = (p.PDX1 + p.PDX2 * dfz) * (1 - p.PDX3 * g2) * lmux * fz;
  const ex = Math.min(1, (p.PEX1 + p.PEX2 * dfz + p.PEX3 * dfz * dfz) * (1 - p.PEX4 * sgn(kx1)));
  const kxk = fz * (p.PKX1 + p.PKX2 * dfz) * Math.exp(p.PKX3 * dfz);
  const bx = kxk / (cx * dx);
  const svx = fz * (p.PVX1 + p.PVX2 * dfz) * lmux * rolling;
  const bxk = bx * kx1;
  const psiX = bxk - ex * (bxk - Math.atan(bxk));
  const fx0 = dx * Math.sin(cx * Math.atan(psiX)) + svx;
  const dPsiX = bx - ex * (bx - bx / (1 + bxk * bxk));
  const dFx0 = (dx * Math.cos(cx * Math.atan(psiX)) * cx * dPsiX) / (1 + psiX * psiX);

  // Lateral, pure slip, with the camber terms.
  const ky = p.PKY1 * fz0 * Math.sin(2 * Math.atan(fz / (p.PKY2 * fz0))) * (1 - p.PKY3 * Math.abs(gamma));
  const shy = (p.PHY1 + p.PHY2 * dfz + p.PHY3 * gamma) * rolling;
  const svy = fz * (p.PVY1 + p.PVY2 * dfz + (p.PVY3 + p.PVY4 * dfz) * gamma) * lmuy * rolling;
  const ay = alpha + shy;
  const cy = p.PCY1;
  const muy = (p.PDY1 + p.PDY2 * dfz) * (1 - p.PDY3 * g2) * lmuy;
  const dy = muy * fz;
  const eyRaw = (p.PEY1 + p.PEY2 * dfz) * (1 - (p.PEY3 + p.PEY4 * gamma) * sgn(ay));
  const ey = Math.min(1, eyRaw);
  const by = ky / (cy * dy);
  const fy0 = dy * mf(by, cy, ey, ay) + svy;

  // Combined slip: Fx weighted by α, Fy by κ, plus the side force that κ induces. A slippery road scales the
  // saturation slips by μ (D falls, K stays), so every slip the weights see, in their arguments and in RBX2·κ and
  // RBY2·α, is divided by μ as well: the combined curve keeps its dry shape in slips normalised by μ (similarity), and
  // at μ = 1 these are the published equations. With fixed weights, as in the MF, the envelope bulges past the
  // friction ellipse by 12 % on a wet road (0.6) and 39 % on ice (0.1); with only RBX1 and RBY1 divided, a locked wheel
  // on ice at 20° kept a fifth of its sliding force. The weights stop at 0: with RCX1 and RCY1 above 1 the cosine turns
  // negative far into the slide, and the force would push along the sliding (up to 7 % of D at 45–60° even on a
  // dry road).
  const shxa = p.RHX1;
  const bxa = (p.RBX1 / mu) * Math.cos(Math.atan((p.RBX2 * kappa) / mu));
  const exa = Math.min(1, p.REX1 + p.REX2 * dfz);
  const gxa = Math.max(0, weight(bxa, p.RCX1, exa, alpha + shxa)) / weight(bxa, p.RCX1, exa, shxa);
  const fx = gxa * fx0;
  const shyk = p.RHY1 + p.RHY2 * dfz;
  const byk = (p.RBY1 / mu) * Math.cos(Math.atan(p.RBY2 * (alpha / mu - p.RBY3)));
  const eyk = Math.min(1, p.REY1 + p.REY2 * dfz);
  const gyk = Math.max(0, weight(byk, p.RCY1, eyk, kappa + shyk)) / weight(byk, p.RCY1, eyk, shyk);
  const dvyk = muy * fz * (p.RVY1 + p.RVY2 * dfz + p.RVY3 * gamma) * Math.cos(Math.atan(p.RVY4 * alpha));
  const svyk = dvyk * Math.sin(p.RVY5 * Math.atan(p.RVY6 * kappa)) * rolling;
  const fy = gyk * fy0 + svyk;

  // Aligning moment: pneumatic trail times the side force, the residual moment, and Fx on its arm.
  const r0 = p.UNLOADED_RADIUS;
  const at = alpha + p.QHZ1 + p.QHZ2 * dfz + (p.QHZ3 + p.QHZ4 * dfz) * gamma;
  const ar = alpha + shy + svy / ky;
  const bt = ((p.QBZ1 + p.QBZ2 * dfz + p.QBZ3 * dfz * dfz) * (1 + p.QBZ4 * gamma + p.QBZ5 * Math.abs(gamma))) / lmuy;
  const ct = p.QCZ1;
  const dt = (fz * (p.QDZ1 + p.QDZ2 * dfz) * (1 + p.QDZ3 * gamma + p.QDZ4 * g2) * r0) / fz0;
  const et = Math.min(1, (p.QEZ1 + p.QEZ2 * dfz + p.QEZ3 * dfz * dfz) * (1 + ((p.QEZ4 + p.QEZ5 * gamma) * 2 * Math.atan(bt * ct * at)) / Math.PI));
  const br = p.QBZ9 / lmuy + p.QBZ10 * by * cy;
  const dr = fz * (p.QDZ6 + p.QDZ7 * dfz + (p.QDZ8 + p.QDZ9 * dfz) * gamma) * r0 * lmuy;
  const k2 = ((kxk * kappa) / ky) ** 2;
  const tanAt = Math.tan(at);
  const tanAr = Math.tan(ar);
  const atEq = Math.atan(Math.sqrt(tanAt * tanAt + k2)) * sgn(at);
  const arEq = Math.atan(Math.sqrt(tanAr * tanAr + k2)) * sgn(ar);
  const cosA = Math.cos(alpha);
  const trail = dt * weight(bt, ct, et, atEq) * cosA;
  const mzr = dr * Math.cos(Math.atan(br * arEq)) * cosA * rolling;
  const arm = (p.SSZ1 + (p.SSZ2 * fy) / fz0 + (p.SSZ3 + p.SSZ4 * dfz) * gamma) * r0;

  o.fx = fx;
  o.fy = fy;
  o.mz = -trail * (fy - svyk) + mzr + arm * fx;
  o.fx0 = fx0;
  o.fy0 = fy0;
  o.dx = dx;
  o.dy = dy;
  o.kx = kxk;
  o.ky = ky;
  o.dFxdKappa = gxa * dFx0;
  o.eyRaw = eyRaw;
  o.ey = ey;
}

/** The tyre on either side of the car (see the mirror rule at the top of the file). */
export function mfForces(p: MfSet, side: TyreSide, kappa: number, alpha: number, gamma: number, fz: number, muScale: number, o: MfForces, rolling = 1): void {
  if (side === 'left') {
    mfEval(p, kappa, alpha, gamma, fz, muScale, o, rolling);
    return;
  }
  mfEval(p, kappa, -alpha, -gamma, fz, muScale, o, rolling);
  o.fy = -o.fy;
  o.fy0 = -o.fy0;
  o.mz = -o.mz;
}

const loadChange = (p: MfSet, fz: number): number => (fz - p.LFZO * p.FNOMIN) / (p.LFZO * p.FNOMIN);

/** Peak side force D_y, N: the grip available across at this load (friction circles, the lap). */
export function lateralPeakN(p: MfSet, fz: number, gamma = 0, muScale = 1): number {
  if (!(fz > 0)) return 0;
  return (p.PDY1 + p.PDY2 * loadChange(p, fz)) * (1 - p.PDY3 * gamma * gamma) * p.LMUY * Math.max(MU_MIN, muScale) * fz;
}

/** Peak force along the road D_x, N. */
export function longitudinalPeakN(p: MfSet, fz: number, gamma = 0, muScale = 1): number {
  if (!(fz > 0)) return 0;
  return (p.PDX1 + p.PDX2 * loadChange(p, fz)) * (1 - p.PDX3 * gamma * gamma) * p.LMUX * Math.max(MU_MIN, muScale) * fz;
}

/** Shortest relaxation length, m: keeps κ' = u/σ finite as the load goes to zero. */
const SIGMA_MIN_M = 0.01;

/** Longitudinal relaxation length σ_κ, m (PAC2002: PTX1-3). */
export function sigmaKappa(p: MfSet, fz: number): number {
  const dfz = loadChange(p, fz);
  return Math.max(SIGMA_MIN_M, (fz * (p.PTX1 + p.PTX2 * dfz) * Math.exp(-p.PTX3 * dfz) * p.UNLOADED_RADIUS) / (p.LFZO * p.FNOMIN));
}

/** Lateral relaxation length σ_α, m (PAC2002: PTY1, PTY2). */
export function sigmaAlpha(p: MfSet, fz: number, gamma = 0): number {
  const fz0 = p.LFZO * p.FNOMIN;
  return Math.max(SIGMA_MIN_M, p.PTY1 * Math.sin(2 * Math.atan(fz / (p.PTY2 * fz0))) * (1 - p.PKY3 * Math.abs(gamma)) * p.UNLOADED_RADIUS * p.LFZO);
}

// ---------------------------------------------------------------------------------------------------------------------
// A tyre fitted to a car.

/** A tyre choice fitted to one wheel load and one μ. Everything but LFZO, LMUX, LMUY, RBX1 and RBY1 is as in TYRE_SETS. */
export interface Tyre {
  id: TyreId;
  set: MfSet;
  /** The load the set is centred on, N, and the peak friction it has there on a dry road at zero camber. */
  wheelLoadN: number;
  mu: number;
}

/** Slip angle (as tan) and longitudinal slip at which a set saturates, D/K at its nominal load and zero camber. */
const saturationAlpha = (p: MfSet): number => (p.PDY1 * p.LMUY) / Math.abs(p.PKY1 * Math.sin(2 * Math.atan(1 / p.PKY2)));
const saturationKappa = (p: MfSet): number => (p.PDX1 * p.LMUX) / p.PKX1;

/**
 * Tyre `id` fitted to a wheel load: LFZO·FNOMIN becomes the load, and LMUY and LMUX are set so that the peak friction
 * there, at zero camber and averaged over the two directions, is `mu` (the lap's μ unless given). The peaks of the two
 * directions are D ± S_V, so their mean is D = PDY1·LMUY·F_z exactly, and the fit needs no search. Without it a set
 * with one nominal load would give a light car more μ than a heavy one, and the lap would no longer match the
 * chassis (suspensions plan, the tyre fitted to a car).
 *
 * Every set takes its combined-slip weights from mf_185_80R14 (tyre-data.ts). Those act on slips as measured on that
 * tyre, so their slip scales RBX1 and RBY1 are rescaled by how much earlier or later the fitted tyre saturates (D/K
 * across and along); this is our construction, not Chrono's. As published, the stiffer street tyre's envelope would bulge up to 10 % past the friction
 * ellipse, the slick's 13 %; rescaled, every set stays within 0.93–1.04 of it, as mf_185_80R14 does with its own weights
 * (tests/suspension-tyre.test.ts).
 */
export function tyreAt(id: TyreId, wheelLoadN: number, mu: number = TYRE_MU[id]): Tyre {
  if (!(wheelLoadN > 0)) throw new Error(`Wheel load must be positive: ${wheelLoadN}`);
  const base = TYRE_SETS[id];
  const fitted: MfSet = { ...base, LFZO: wheelLoadN / base.FNOMIN, LMUX: mu / base.PDX1, LMUY: mu / base.PDY1 };
  const set: MfSet = {
    ...fitted,
    RBX1: (base.RBX1 * saturationAlpha(MF_185_80R14)) / saturationAlpha(fitted),
    RBY1: (base.RBY1 * saturationKappa(MF_185_80R14)) / saturationKappa(fitted),
  };
  return { id, set, wheelLoadN, mu };
}

/** Mean static load on one wheel of a car, N: the mass every derived model carries (drivingMassKg), over four wheels. */
export const staticWheelLoadN = (car: CarRecord): number => (drivingMassKg(car) * G) / 4;

/** The car's tyre, or another choice on the same car (the oil page offers three). */
export const tyreFor = (car: CarRecord, id: TyreId = car.tyre.id): Tyre => tyreAt(id, staticWheelLoadN(car));

// ---------------------------------------------------------------------------------------------------------------------
// Relaxation and low speed. The state is the carcass deflection u along and across, m, so the transient slips are
// κ' = u_x/σ_κ and tan α' = u_y/σ_α, and σ·dκ'/dt + |vx|·κ' = ω·r − vx (the same across with vy). The update is linear
// implicit, so it is stable at any speed and finite at standstill. Below 3 m/s the force fades from the Magic Formula
// into the carcass spring K/σ inside the friction ellipse, a damper of the deflection fades in, and while the tyre
// slides the deflection cannot grow past what friction holds.

export interface TyreState {
  ux: number;
  uy: number;
}

export const newTyreState = (): TyreState => ({ ux: 0, uy: 0 });

/** What a tyre step gives a wheel and a chassis. */
export interface TyreForces {
  fx: number;
  fy: number;
  mz: number;
  /** Slopes of fx for a linear-implicit wheel and body step, N·s/rad and N·s/m. */
  dFxdOmega: number;
  dFxdV: number;
  /** The transient slips the forces were evaluated at. */
  kappa: number;
  alpha: number;
  /** Peaks along and across at this load, camber and surface, N. */
  dx: number;
  dy: number;
}

export const newTyreForces = (): TyreForces => ({ fx: 0, fy: 0, mz: 0, dFxdOmega: 0, dFxdV: 0, kappa: 0, alpha: 0, dx: 0, dy: 0 });

/** Below this speed the deflection damper fades in, m/s (suspensions plan). */
export const LOW_SPEED_MS = 3;
/**
 * The damper as a share of the carcass stiffness, s: c = K/σ · 0.05. Chrono's bristle model at low speed uses
 * 100 kN/m and 5000 N·s/m, the same ratio. It damps the wheel on its tyre (about 17 Hz) well and the car on its tyres
 * (about 3 Hz) at ζ ≈ 0.3 (our estimate).
 */
export const LOW_SPEED_DAMPING_S = 0.05;
/** VXLOW of both files, m/s: below it the zero-slip shifts fade out, and it bounds the slip of a tyre sliding at standstill. */
const VXLOW_MS = 1;

/** Share of the zero-slip shifts at wheel speed |vx|: MF's low-speed weight 1 − ½(1 + cos(π·|vx|/VXLOW)). */
export const lowSpeedShare = (vx: number): number => {
  const a = Math.abs(vx);
  return a >= VXLOW_MS ? 1 : 0.5 * (1 - Math.cos((Math.PI * a) / VXLOW_MS));
};
/** Validity limits of the files: |κ| ≤ 1.5 (KPUMAX); α is held below 1.4 rad. */
const KAPPA_MAX = 1.5;
const TAN_ALPHA_MAX = Math.tan(1.4);

const scratch = newMfForces();

/**
 * One step of tyre `t` on `side`: wheel spin ω, rad/s, rolling radius r, m, wheel-centre velocity along and across the
 * wheel heading, m/s, load F_z, N, inclination γ, rad, surface share of dry friction, step dt, s. Advances `s` and
 * writes `o`. Allocates nothing.
 */
export function stepTyre(t: Tyre, side: TyreSide, s: TyreState, omega: number, radiusM: number, vx: number, vy: number, fz: number, gamma: number, surfaceMu: number, dt: number, o: TyreForces): void {
  const p = t.set;
  if (!(fz > 0)) {
    s.ux = s.uy = 0;
    o.fx = o.fy = o.mz = o.dFxdOmega = o.dFxdV = o.kappa = o.alpha = o.dx = o.dy = 0;
    return;
  }
  const sx = sigmaKappa(p, fz);
  const sy = sigmaAlpha(p, fz, gamma);
  const avx = Math.abs(vx);
  const vsx = omega * radiusM - vx;
  const ax = 1 + (dt * avx) / sx;
  const ay = 1 + (dt * avx) / sy;
  let ux = (s.ux + dt * vsx) / ax;
  let uy = (s.uy + dt * vy) / ay;

  // Below LOW_SPEED_MS the force fades from the Magic Formula into the carcass spring K·u/σ inside the friction
  // ellipse, and a damper of the deflection fades in. A rolling patch slides in part at any slip, which bends the MF
  // curve; a standing one holds until friction gives way. Chrono blends its bristle model into the MF the same way
  // between 1 and 3 m/s. w is 1 at standstill and 0 from LOW_SPEED_MS.
  const w = avx < LOW_SPEED_MS ? 0.5 * (1 + Math.cos((Math.PI * avx) / LOW_SPEED_MS)) : 0;

  // A sliding tyre: the deflection stops at the slip the speeds give or at the full-slide slip, whichever is larger;
  // at speed the former is the steady state, so the cap never bites there. The full-slide slip is the brush form's
  // 3·D/K when rolling and D/K at standstill, where the spring alone holds the friction force: a tyre that has just
  // stopped sliding keeps no more deflection than friction holds, so a car braked to a stop does not spring back by
  // the deflection of the whole slide.
  const mu = Math.max(MU_MIN, surfaceMu);
  const dxPeak = longitudinalPeakN(p, fz, gamma, mu);
  const dyPeak = lateralPeakN(p, fz, gamma, mu);
  const fz0 = p.LFZO * p.FNOMIN;
  const dfz = (fz - fz0) / fz0;
  const kxk = fz * (p.PKX1 + p.PKX2 * dfz) * Math.exp(p.PKX3 * dfz);
  const kyk = Math.abs(p.PKY1 * fz0 * Math.sin(2 * Math.atan(fz / (p.PKY2 * fz0))) * (1 - p.PKY3 * Math.abs(gamma)));
  const vRef = Math.max(avx, VXLOW_MS);
  const slide = 3 - 2 * w;
  const capX = sx * Math.min(KAPPA_MAX, Math.max((slide * dxPeak) / kxk, Math.abs(vsx) / vRef));
  const capY = sy * Math.min(TAN_ALPHA_MAX, Math.max((slide * dyPeak) / kyk, Math.abs(vy) / vRef));
  const cappedX = Math.abs(ux) > capX;
  if (cappedX) ux = capX * sgn(ux);
  const cappedY = Math.abs(uy) > capY;
  if (cappedY) uy = capY * sgn(uy);

  const kappa = ux / sx;
  const alpha = Math.atan(uy / sy);
  mfForces(p, side, kappa, alpha, gamma, fz, mu, scratch, lowSpeedShare(vx));

  // The carcass spring at standstill, inside the friction ellipse. Across it pushes against u_y on either side.
  let sxF = (kxk * ux) / sx;
  let syF = (-kyk * uy) / sy;
  const ellipse = Math.hypot(sxF / dxPeak, syF / dyPeak);
  if (ellipse > 1) {
    sxF /= ellipse;
    syF /= ellipse;
  }
  const blendX = (1 - w) * scratch.fx + w * sxF;
  const blendY = (1 - w) * scratch.fy + w * syF;

  // The damper. It cannot push the force past the friction peak (the MF force itself may: one direction peaks at
  // D + S_V). A patch held at the sliding bound passes the friction force alone: the bound moves with the load, and
  // its change is no deflection rate, so damping it would pull against the sliding (a wheel spinning on ice whose
  // load rocks flipped its force to −D).
  const cx = (w * LOW_SPEED_DAMPING_S * kxk) / sx;
  const cy = (w * LOW_SPEED_DAMPING_S * kyk) / sy;
  let fx = blendX + (cappedX ? 0 : (cx * (ux - s.ux)) / dt);
  let fy = blendY - (cappedY ? 0 : (cy * (uy - s.uy)) / dt);
  const limitX = Math.max(dxPeak, Math.abs(blendX));
  const limitY = Math.max(dyPeak, Math.abs(blendY));
  const clampedX = Math.abs(fx) > limitX;
  if (clampedX) fx = limitX * sgn(fx);
  if (Math.abs(fy) > limitY) fy = limitY * sgn(fy);

  // ∂fx/∂u_x, then through the implicit update to ω and to vx.
  const dFdu = cappedX || clampedX ? 0 : ((1 - w) * scratch.dFxdKappa + (ellipse > 1 ? 0 : w * kxk)) / sx + cx / dt;
  o.dFxdOmega = (dFdu * dt * radiusM) / ax;
  o.dFxdV = (dFdu * (-dt - (ux * dt * sgn(vx)) / sx)) / ax;
  s.ux = ux;
  s.uy = uy;
  o.fx = fx;
  o.fy = fy;
  o.mz = scratch.mz;
  o.kappa = kappa;
  o.alpha = alpha;
  o.dx = dxPeak;
  o.dy = dyPeak;
}

// ---------------------------------------------------------------------------------------------------------------------
// The drivetrain's view: force along the road only (gearbox plan, the longitudinal tyre interface).

/** Longitudinal carcass deflection, m: the state that keeps the force finite at standstill. */
export interface TyreLongState {
  u: number;
}

export interface TyreLongForce {
  fx: number;
  dFxdOmega: number;
  dFxdV: number;
}

/** What a wheel needs from a tyre along the road. */
export interface LongitudinalTyre {
  /** Advances the deflection over dt and writes the force along the road with its slopes for a linear-implicit step. */
  step(s: TyreLongState, wheelOmega: number, radiusM: number, vx: number, fz: number, surfaceMu: number, dt: number, out: TyreLongForce): void;
  /** Peak friction coefficient at this load on a dry road, for limits and diagnoses. */
  peakMu(fz: number): number;
}

/** The same tyre seen along the road: the full step at zero slip angle and camber, so there is one tyre, not two. */
export function longitudinalOf(tyre: Tyre): LongitudinalTyre {
  const state = newTyreState();
  const forces = newTyreForces();
  return {
    step(s, wheelOmega, radiusM, vx, fz, surfaceMu, dt, out) {
      state.ux = s.u;
      state.uy = 0;
      stepTyre(tyre, 'left', state, wheelOmega, radiusM, vx, 0, fz, 0, surfaceMu, dt, forces);
      s.u = state.ux;
      out.fx = forces.fx;
      out.dFxdOmega = forces.dFxdOmega;
      out.dFxdV = forces.dFxdV;
    },
    peakMu: (fz) => (fz > 0 ? longitudinalPeakN(tyre.set, fz) / fz : 0),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The brush form (Chalmers, «Vehicle Dynamics» compendium, eq. 2.20): the patch as bristles under a parabolic pressure.
// It draws the zones of adhesion and sliding in the patch and checks the MF at small slip; its stiffness per load is
// BRUSH_SLIP_STIFFNESS in tyre-data.ts.

/** Force of a brush tyre of slip stiffness `c`, N per unit slip, and friction limit μ·F_z, N, at slip `s`. */
export function brushForce(c: number, muFz: number, s: number): number {
  if (!(muFz > 0)) return 0;
  const cs = c * s;
  const a = Math.abs(cs);
  if (a >= 3 * muFz) return muFz * sgn(s);
  return cs - (cs * a) / (3 * muFz) + (cs * cs * cs) / (27 * muFz * muFz);
}

/** Share of the patch length still in adhesion (front part), 0..1: 1 − C·|s|/(3·μ·F_z). */
export function brushAdhesionShare(c: number, muFz: number, s: number): number {
  if (!(muFz > 0)) return 0;
  return Math.max(0, 1 - (c * Math.abs(s)) / (3 * muFz));
}
