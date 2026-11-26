// Quick estimates of a whole chassis for the designer (suspensions plan, quick estimates for the designer): nothing runs
// in time, everything is a closed form, a frequency-domain sum or a few exact solves, so the sensitivity checks can
// call it dozens of times. Conventions are at the top of kinematics.ts; corners FL, FR, RL, RR; a_y > 0 is a left turn,
// so the right wheels are the outer ones.
//
// Two sources of kinematics, both exact where they are read:
//   - the chassis (buildChassis) for everything linear at rest: the corners' springs, the roll model (statics.ts), the
//     anti percentages (anti.ts) and the heave rates of the ride. By default its axles are built only ±LITE_WINDOW_M
//     around design (ChassisAxle's window): on the same grid steps as the full tables, so the numbers at rest are the
//     full grid's, for a handful of solves instead of the whole range (a solid axle's grid alone takes 100–300 ms);
//   - exact solves for what lies farther out: camber and toe of both wheels at the travels a steady turn brings (three
//     levels of a_y, a parabola through them), the roll centre with the body rolled 3°, the joint angles of the
//     half-shafts at the end stops. A corner takes them from buildAxleLite, a beam from its own solver. With
//     `full: true` the camber and toe are read from the full tables instead, which is what the tests compare against.
//
// Ride: each axle as a linear quarter car about rest (evaluate.ts): the heave rate of its wheel from the springs
// through their motion ratios (a beam's cross terms included), the damper through its heave motion ratio, the tyre
// fitted to the corner's static load. Handling: the linear roll model gives the wheel loads and each axle's roll; the
// Magic Formula tyre of the car turns them into slip angles. Braking: an ideal ABS holds both axles at their peaks, with
// the road load of the car on top; the brake balance says which axle gets there first. Each figure says what it leaves
// out where it is defined.

import type { AnyAxleLinkage, AxleSpec, ChassisSpec, SolidAxleLinkage, SwayBarSpec, TwistBeamLinkage } from './spec.ts';
import { buildChassis, type Chassis } from './chassis.ts';
import { ChassisAxle, newWheelSample } from './chassis-axle.ts';
import { buildAxleLite, LITE_ROLL_RAD, type AxleLite } from './axle-lite.ts';
import { TwistBeamAxle, newBeamSample } from './beam-kinematics.ts';
import { TwistBeamSolver } from './solve-twist-beam.ts';
import { SolidAxle, newSolidSample } from './solid-kinematics.ts';
import { rollModel, type RollModel } from './statics.ts';
import { antiGeometry, type AntiGeometry } from './anti.ts';
import { coilForce, G } from './forces.ts';
import {
  EVALUATE_ROADS, invariantPoints, quarterGains, quarterModes, roughRoadEstimate, newQuarterGains, type InvariantPoints,
  type QuarterLinear, type QuarterMode, type RoughRoadEstimate,
} from './evaluate.ts';
import { comfortBands, type ComfortBand } from './comfort.ts';
import { inclinationOf, lateralPeakN, longitudinalPeakN, mfForces, newMfForces, tyreAt, type Tyre } from '../vehicle/tyre.ts';
import { patchLengthM } from '../vehicle/tyre-data.ts';
import { roadLoadN } from '../vehicle/road-load.ts';

/** Travel the lite chassis tables cover each way from design, m: one node of a beam's 5 mm grid either side of rest,
 *  which gives the full grid's numbers at rest (a wider window gives the same ones and costs a beam 25 solves, not 9). */
export const LITE_WINDOW_M = 0.005;
/** The camber and toe of a steady turn are solved at 0, this and twice this lateral acceleration (a share of g), and a
 *  parabola goes through the three. */
const TURN_LEVEL_G = 0.6;
/** Where the understeer gradient is taken (plan: 0.3 g) and the half-step of its difference, m/s². */
const UNDERSTEER_AT = 0.3 * G;
const UNDERSTEER_STEP = 0.05 * G;
/** Where the camber of the outer wheel to the road is read (plan: 0.8 g). */
const OUTER_CAMBER_AT = 0.8 * G;
/** Highest lateral or braking acceleration the searches look up to, m/s². */
const MAX_ACC = 3 * G;
/** Largest inclination the tyre is asked about, rad: past it a linear roll model on a very soft car would hand the
 *  Magic Formula cambers far outside the range its files were fitted over (an estimate of that range). */
const INCLINATION_MAX = 0.15;
/** Braking from 100 km/h. */
const BRAKING_FROM_MS = 100 / 3.6;

/** Everything the designer reads about one axle. Angles in radians, lengths in metres. */
export interface AxlePerformance {
  /** The axle's corner linearised about rest, and its modes (body and wheel hop). */
  linear: QuarterLinear;
  /** Ride frequency from the heave rate in series with the tyre, Hz. */
  rideHz: number;
  body: QuarterMode;
  hop: QuarterMode;
  invariant: InvariantPoints;
  /** Class B road at 25 m/s and class C at 15 m/s (EVALUATE_ROADS). */
  smooth: RoughRoadEstimate;
  rough: RoughRoadEstimate;
  /** Travel from rest to the bump stop less 3σ of the travel on the rough road (negative: it hits the stop). */
  travelReserveM: number;
  /** Unsprung over sprung mass of a corner. */
  unsprungRatio: number;
  /** Roll centre at design and with the body rolled 3° (height above the road and shift toward the outer wheel). */
  rollCentreM: number;
  rolledRollCentreM: number;
  rolledShiftM: number;
  /** Static camber (negative: top in) and toe (positive: in) relative to the body. */
  camber: number;
  toe: number;
  /** dγ/dq and dτ/dq of one wheel at design, rad/m (on a beam with the other wheel held). */
  camberGain: number;
  bumpSteer: number;
  /** Steering axis at design: inclination, caster, scrub radius (positive: the axis meets the road inboard of the
   *  patch), trail; NaN where the axle has none (a pivot arm or a beam). */
  kpi: number;
  caster: number;
  scrubM: number;
  trailM: number;
  /** Roll steer: the axle's steer toward the turn per radian of its suspension roll (positive: the wheels point into
   *  the turn). */
  rollSteer: number;
  /** Camber of the outer wheel to the road at 0.8 g (positive: top out). */
  outerCamberRoad: number;
  /** Load transfer per g by Milliken's terms, N, and the roll stiffness of the axle's suspension, N·m/rad. */
  transferPerG: { elastic: number; geometric: number; unsprung: number; total: number };
  rollStiffness: number;
  /** Largest share of a half-shaft joint's limit (angle of either joint, plunge) over the travel at straight ahead;
   *  NaN without half-shafts. Steering lock is not in it (the designer has no rack yet, P13-core). */
  jointUse: number;
}

export interface UndersteerTerms {
  /** The tyres alone at the static loads: the weight on each axle against the load sensitivity of its tyres. */
  tyres: number;
  /** What the lateral load transfer adds. */
  transfer: number;
  /** What the cambers of the steady turn add over the static ones (camber in roll, the body's roll to the road); the
   *  static camber is already in `tyres`. */
  camber: number;
  /** What the roll steer of the two axles adds. */
  rollSteer: number;
}

export interface ChassisPerformance {
  axles: [AxlePerformance, AxlePerformance];
  /** Comfort: Wk-weighted body acceleration on the class B road at 25 m/s, the RMS of the two axles, m/s², and its
   *  bands of ISO 2631-1. */
  comfortAw: number;
  comfortBands: ComfortBand[];
  /** Grip on a bad road: the grip left on the class C road at 15 m/s, of the axle that keeps less (0..1). */
  roughGrip: number;
  /** Body roll over the road per g, rad; front axle's share of the lateral load transfer; geometric and elastic shares
   *  of the total transfer (the same at any lateral acceleration in the linear model, read at 0.5 g). */
  rollPerG: number;
  frontTransferShare: number;
  geometricShare: number;
  elasticShare: number;
  /** Understeer gradient at 0.3 g, rad per g (positive: understeer), and its parts; the critical speed of an
   *  oversteering car, m/s (Infinity when it understeers). Compliance and aligning moments are not in it: the spec
   *  has no bush rates (docs/suspension-model.md). */
  understeerPerG: number;
  understeerTerms: UndersteerTerms;
  criticalSpeedMs: number;
  /** Steady skidpad limit, m/s², and the axle that saturates first (0 front, 1 rear). */
  skidpadAcc: number;
  limitAxle: 0 | 1;
  /** Lateral acceleration at which the car would tip, m/s²: half the mean track over the centre of mass height, less
   *  the body's sideways shift in roll. */
  rolloverAcc: number;
  /** Lateral acceleration at which an inner wheel would leave the road by the linear transfer, m/s². */
  liftOffAcc: number;
  /** Braking from 100 km/h with an ideal ABS, both axles at their peaks: distance, m, the tyres' share of the
   *  deceleration, m/s², and whether the rear wheels would leave the road first. */
  brakingM: number;
  brakingAcc: number;
  rearLift: boolean;
  /** At the brake balance: the deceleration at which the first axle reaches its peak, m/s² (where a car without ABS
   *  would lock it; ABS works from there on), and which axle that is (0 front, 1 rear). */
  lockAcc: number;
  firstLock: 0 | 1;
  /** Body pitch per g of braking, rad (nose down positive). */
  pitchPerG: number;
  anti: AntiGeometry;
  /** Total unsprung over the car's mass. */
  unsprungShare: number;
  /** Side force the static toe costs (C_α·τ² per wheel), over the car's rolling resistance. */
  toeDragShare: number;
  /** A live axle under drive at 0.3 g: the load the propshaft torque takes off one rear wheel over its static load
   *  (NaN without a driven axle whose differential sits on it). */
  propUnload: number;
  /** The models behind the numbers. Unless `full`, the chassis's axle tables cover only ±LITE_WINDOW_M around design
   *  and extrapolate past it: a graph over the travel needs its own solves (buildAxleLite's `at`) or a full table. */
  roll: RollModel;
  chassis: Chassis;
}

/** Options of evaluateChassis. */
export interface EvaluateChassisOptions {
  /** Build the full tables and read the turn's camber and toe from them (the reference the tests compare with). */
  full?: boolean;
}

// ----------------------------------------------------------------------------------------------------------------------
// Caches: the sensitivity checks change one control at a time, so the axle that did not change keeps its tables and its
// ride figures.

const CACHE_SIZE = 32;

function remember<T>(cache: Map<string, T>, key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = make();
  cache.set(key, made);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return made;
}

/** What decides an axle's tables: everything but the spring rate and the damper's coefficients. */
function kinematicKey(axle: AxleSpec<AnyAxleLinkage>, bar: SwayBarSpec | null): string {
  const spring = { ...axle.spring, rate: 0, progressive: null };
  const damper = { ...axle.damper, compression: 0, rebound: 0, kneeMs: 0, highRatio: 0 };
  return JSON.stringify([{ ...axle, spring, damper }, bar]);
}

/** Exact solves an axle's probe keeps for the next evaluation (the same travels come back while no spring moves). */
const SOLVES_KEPT = 24;

const liteAxles = new Map<string, ChassisAxle>();
const probes = new Map<string, AxleProbe>();
const quarters = new Map<string, QuarterRide>();

// ----------------------------------------------------------------------------------------------------------------------
// Exact solves away from design.

/** Camber and toe of both wheels at a pair of travels: [camber L, camber R, toe L, toe R]. */
type WheelAngles = [number, number, number, number];

interface AxleProbe {
  lite: AxleLite | null;
  angles(qL: number, qR: number): WheelAngles;
  /** Roll centre with the body rolled LITE_ROLL_RAD (outer wheel into bump). */
  rolled: { heightM: number; lateralM: number };
  jointUse: number;
}

function cornerProbe(spec: AxleSpec<AnyAxleLinkage>): AxleProbe {
  const lite = buildAxleLite(spec as AxleSpec);
  const own = new Map<number, { camber: number; toe: number }>();
  const at = (q: number): { camber: number; toe: number } => {
    let s = own.get(q);
    if (!s) {
      const c = lite.at(q);
      s = { camber: c.camber, toe: c.toe };
      if (own.size >= SOLVES_KEPT) own.clear();
      own.set(q, s);
    }
    return s;
  };
  let jointUse = NaN;
  const shaft = spec.halfshaft;
  if (shaft) {
    jointUse = 0;
    for (const q of [spec.travel.bumpM, 0, -spec.travel.droopM]) {
      try {
        const c = q === 0 ? lite.design : lite.at(q);
        jointUse = Math.max(jointUse, jointShare(c.cvInner, c.cvOuter, c.plunge, shaft));
      } catch {
        jointUse = Infinity;
      }
    }
  }
  return {
    lite,
    angles(qL, qR) {
      const l = at(qL);
      const r = at(qR);
      return [l.camber, r.camber, l.toe, r.toe];
    },
    rolled: lite.rolled,
    jointUse,
  };
}

function jointShare(cvInner: number, cvOuter: number, plunge: number, shaft: NonNullable<AxleSpec['halfshaft']>): number {
  const DEG = Math.PI / 180;
  const inner = Math.abs(cvInner) / (shaft.innerMaxDeg * DEG);
  const outer = shaft.outerMaxDeg > 0 ? Math.abs(cvOuter) / (shaft.outerMaxDeg * DEG) : 0;
  const [pull, push] = shaft.plungeM;
  const axial = plunge >= 0 ? (push > 0 ? plunge / push : 0) : pull < 0 ? plunge / pull : 0;
  return Math.max(inner, outer, axial);
}

function beamProbe(spec: AxleSpec<AnyAxleLinkage>): AxleProbe {
  const link = spec.linkage;
  const twist = link.kind === 'twist-beam';
  const beam = twist ? new TwistBeamAxle(spec as AxleSpec<TwistBeamLinkage>) : null;
  const solid = twist ? null : new SolidAxle(spec as AxleSpec<SolidAxleLinkage>);
  const bs = newBeamSample();
  const ss = newSolidSample();
  type Pair = { camber: [number, number]; toe: [number, number]; rc: number; cv: [number, number, number][] };
  // Each solve starts from the nearest state solved before (rest at first): the travels of the next evaluation are
  // usually a few millimetres from this one's, and a solid axle walks from where it starts in 10 mm steps.
  const solved: Array<{ zL: number; zR: number; state: Float64Array }> = [
    { zL: 0, zR: 0, state: beam ? TwistBeamSolver.rest() : solid!.rest() },
  ];
  const solveAt = (zL: number, zR: number): Pair => {
    let from = solved[0];
    let gap = Infinity;
    for (const x of solved) {
      const g = Math.max(Math.abs(x.zL - zL), Math.abs(x.zR - zR));
      if (g < gap) {
        gap = g;
        from = x;
      }
    }
    const st = from.state.slice();
    if (beam) beam.solve(st, zL, zR);
    else solid!.solve(st, zL, zR);
    if (solved.length >= SOLVES_KEPT) solved.splice(1, 1);
    solved.push({ zL, zR, state: st });
    const out: Pair = { camber: [0, 0], toe: [0, 0], rc: 0, cv: [] };
    if (beam) {
      beam.measure(st, 'left', bs);
      out.camber[0] = bs.camber;
      out.toe[0] = bs.toe;
      out.rc = bs.rcHeight;
      beam.measure(st, 'right', bs);
      out.camber[1] = bs.camber;
      out.toe[1] = bs.toe;
    } else {
      solid!.measure(st, 'left', ss);
      out.camber[0] = ss.camber;
      out.toe[0] = ss.toe;
      out.rc = ss.rcHeight;
      out.cv.push([ss.cvInner, ss.cvOuter, ss.plunge]);
      solid!.measure(st, 'right', ss);
      out.camber[1] = ss.camber;
      out.toe[1] = ss.toe;
      out.cv.push([ss.cvInner, ss.cvOuter, ss.plunge]);
    }
    return out;
  };
  const cache = new Map<string, Pair>();
  const at = (zL: number, zR: number): Pair => {
    const key = `${zL}|${zR}`;
    let p = cache.get(key);
    if (!p) {
      p = solveAt(zL, zR);
      if (cache.size >= SOLVES_KEPT) cache.clear();
      cache.set(key, p);
    }
    return p;
  };
  const dz = (spec.track / 2) * Math.sin(LITE_ROLL_RAD);
  // In a left turn the right wheel is the outer one: into bump.
  const rolled = { heightM: at(-dz, dz).rc, lateralM: NaN };
  let jointUse = NaN;
  const shaft = spec.halfshaft;
  if (shaft && solid) {
    jointUse = 0;
    for (const z of [spec.travel.bumpM, 0, -spec.travel.droopM]) {
      try {
        for (const [ci, co, pl] of at(z, z).cv) jointUse = Math.max(jointUse, jointShare(ci, co, pl, shaft));
      } catch {
        jointUse = Infinity;
      }
    }
  }
  return {
    lite: null,
    angles(qL, qR) {
      const p = at(qL, qR);
      return [p.camber[0], p.camber[1], p.toe[0], p.toe[1]];
    },
    rolled,
    jointUse,
  };
}

function probeOf(spec: AxleSpec<AnyAxleLinkage>, key: string): AxleProbe {
  return remember(probes, key, () => {
    const kind = spec.linkage.kind;
    return kind === 'twist-beam' || kind === 'solid' ? beamProbe(spec) : cornerProbe(spec);
  });
}

// ----------------------------------------------------------------------------------------------------------------------
// Ride.

interface QuarterRide {
  body: QuarterMode;
  hop: QuarterMode;
  smooth: RoughRoadEstimate;
  rough: RoughRoadEstimate;
}

/** Axle k's corner linearised about rest (in heave of both wheels: a beam's cross terms count). */
function axleLinear(c: Chassis, k: 0 | 1): QuarterLinear {
  const cL = c.corners[2 * k];
  const cR = c.corners[2 * k + 1];
  const ax = c.axles[k];
  const L = newWheelSample();
  const R = newWheelSample();
  const support = (q: number): number => {
    ax.sample(q, q, L, R);
    const fL = coilForce(cL.spring.rate, cL.spring.freeM, L.springLen, cL.spring.rate2, cL.spring.fromM);
    const fR = coilForce(cR.spring.rate, cR.spring.freeM, R.springLen, cR.spring.rate2, cR.spring.fromM);
    return fL * L.mrSpring + fR * R.mrSpringCross;
  };
  const eps = 1e-4;
  const k1 = (support(eps) - support(-eps)) / (2 * eps);
  ax.sample(0, 0, L, R);
  const mr = L.mrDamper + L.mrDamperCross;
  const d = cL.damper;
  return {
    ms: cL.sprungN / G,
    mu: cL.unsprungKg,
    k: k1,
    c: ((d.compression + d.rebound) / 2) * mr * mr,
    kt: cL.tyre.kt,
    ct: cL.tyre.ct,
    staticN: cL.staticN,
    damper: d,
    mrDamper: mr,
  };
}

function quarterRide(lin: QuarterLinear, patchM: number, tyre: Tyre): QuarterRide {
  const key = JSON.stringify([lin, patchM, tyre.id, tyre.wheelLoadN]);
  return remember(quarters, key, () => {
    const { body, hop } = quarterModes(lin);
    const opts = { patchM, tyre };
    return { body, hop, smooth: roughRoadEstimate(lin, EVALUATE_ROADS.smooth, opts), rough: roughRoadEstimate(lin, EVALUATE_ROADS.rough, opts) };
  });
}

/** Gains of an axle's quarter car on a logarithmic grid of frequencies, for the graph of its response. */
export function frequencyResponse(lin: QuarterLinear, fromHz = 0.5, toHz = 25, n = 120): { hz: number[]; bodyAcc: number[]; tyreForce: number[] } {
  const g = newQuarterGains();
  const out = { hz: [] as number[], bodyAcc: [] as number[], tyreForce: [] as number[] };
  for (let i = 0; i < n; i++) {
    const f = fromHz * (toHz / fromHz) ** (i / (n - 1));
    quarterGains(lin, f, g);
    out.hz.push(f);
    out.bodyAcc.push(g.bodyAcc);
    out.tyreForce.push(g.tyreForce);
  }
  return out;
}

// ----------------------------------------------------------------------------------------------------------------------
// Tyres.

const mf = newMfForces();

/** Side force of one tyre at slip angle α (rad), inclination γ, load F_z, N. */
function sideForce(tyre: Tyre, side: 'left' | 'right', alpha: number, gamma: number, fz: number): number {
  if (!(fz > 0)) return 0;
  mfForces(tyre.set, side, 0, alpha, gamma, fz, 1, mf);
  return mf.fy;
}

/**
 * Slip angle magnitude at which an axle's two tyres make side force `f` toward +y (a left turn), rad: the Illinois
 * variant of regula falsi between 0 and the first angle past it, NaN beyond the axle's peak.
 */
function axleSlip(tyre: Tyre, fzL: number, fzR: number, gL: number, gR: number, f: number): number {
  const g = (x: number): number => sideForce(tyre, 'left', -x, gL, fzL) + sideForce(tyre, 'right', -x, gR, fzR) - f;
  let lo = 0;
  let glo = g(0);
  if (glo >= 0) return 0;
  let hi = 0.01;
  let ghi = g(hi);
  let prev = glo;
  while (ghi < 0) {
    if (ghi <= prev || hi > 0.6) return NaN;
    prev = ghi;
    lo = hi;
    glo = ghi;
    hi *= 1.6;
    ghi = g(hi);
  }
  let side = 0;
  for (let i = 0; i < 60; i++) {
    const x = (lo * ghi - hi * glo) / (ghi - glo);
    const gx = g(x);
    if (Math.abs(gx) < 1e-9 * Math.max(1, Math.abs(f)) || hi - lo < 1e-12) return x;
    if (gx < 0) {
      lo = x;
      glo = gx;
      if (side === -1) ghi /= 2;
      side = -1;
    } else {
      hi = x;
      ghi = gx;
      if (side === 1) glo /= 2;
      side = 1;
    }
  }
  return (lo + hi) / 2;
}

// ----------------------------------------------------------------------------------------------------------------------
// The evaluation.

/** The chassis the quick estimates read: lite (windowed tables, cached by axle) unless `full`. */
function chassisFor(spec: ChassisSpec, keys: readonly string[], full: boolean): Chassis {
  if (full) return buildChassis(spec);
  return buildChassis(spec, {
    axle: (axle, bar) => remember(liteAxles, keys[axle === spec.front.axle ? 0 : 1], () => new ChassisAxle(axle, bar, { windowM: LITE_WINDOW_M })),
  });
}

/** A parabola through (0, f0), (A, f1), (2A, f2), at a. */
const parabola = (f0: number, f1: number, f2: number, A: number, a: number): number =>
  f0 + (a * (-3 * f0 + 4 * f1 - f2)) / (2 * A) + (a * a * (f0 - 2 * f1 + f2)) / (2 * A * A);

/** Quick estimates of a chassis (see the header). Throws where buildChassis or an axle's solves do. */
export function evaluateChassis(spec: ChassisSpec, options: EvaluateChassisOptions = {}): ChassisPerformance {
  const full = options.full === true;
  const axleSpecs = [spec.front, spec.rear] as const;
  const keys = axleSpecs.map((a) => kinematicKey(a.axle, a.swayBar));
  const c = chassisFor(spec, keys, full);
  const roll = rollModel(c);
  const anti = antiGeometry(c);
  const m = c.massKg;
  const tyre = tyreAt(spec.tyre, (m * G) / 4);
  const probe = [probeOf(spec.front.axle, keys[0]), probeOf(spec.rear.axle, keys[1])] as const;
  const sL = newWheelSample();
  const sR = newWheelSample();
  const tW = [0, 1].map((k) => c.corners[2 * k].y - c.corners[2 * k + 1].y);

  // Camber and toe of the inner (left) and outer (right) wheels at the three levels of a steady left turn.
  const A = TURN_LEVEL_G * G;
  const levels = [0, A, 2 * A];
  const turn = [0, 1].map((k) => {
    const travel = c.spec[k === 0 ? 'front' : 'rear'].axle.travel;
    const clampQ = (q: number): number => Math.min(travel.bumpM, Math.max(-travel.droopM, q));
    return levels.map((a) => {
      const q = (tW[k] / 2) * roll.suspensionGradient[k] * a;
      const qL = clampQ(-q);
      const qR = clampQ(q);
      if (!full) return probe[k].angles(qL, qR);
      c.axles[k].sample(qL, qR, sL, sR);
      return [sL.camber, sR.camber, sL.toe, sR.toe] as WheelAngles;
    });
  });
  /** [camber L, camber R, toe L, toe R] of axle k at lateral acceleration a. */
  const anglesAt = (k: number, at: number): WheelAngles => {
    const t = turn[k];
    // The parabola holds between the levels it went through; past them the travels were clamped to the end stops.
    const a = Math.max(-2 * A, Math.min(2 * A, at));
    return [0, 1, 2, 3].map((i) => parabola(t[0][i], t[1][i], t[2][i], A, a)) as WheelAngles;
  };
  const phi = (a: number): number => roll.gradient * a;
  const share = c.lateralShare;
  const staticN = [c.corners[0].staticN, c.corners[2].staticN];
  const transfer = (k: number, a: number): number => roll.transferPerAy[k].total * a;
  const loads = (k: number, a: number, withTransfer: boolean): [number, number] => {
    const t = withTransfer ? transfer(k, a) : 0;
    const inner = staticN[k] - t;
    // A wheel off the road carries nothing: the outer one takes the axle.
    return inner > 0 ? [inner, staticN[k] + t] : [0, 2 * staticN[k]];
  };
  const inclinations = (k: number, a: number, rolled: boolean): [number, number] => {
    const [cL, cR] = rolled ? anglesAt(k, a) : anglesAt(k, 0);
    const p = rolled ? phi(a) : 0;
    const lim = (g: number): number => Math.max(-INCLINATION_MAX, Math.min(INCLINATION_MAX, g));
    return [lim(inclinationOf('left', cL - p)), lim(inclinationOf('right', cR + p))];
  };
  const steerOf = (k: number, a: number): number => {
    const [, , toeL, toeR] = anglesAt(k, a);
    return (toeR - toeL) / 2;
  };

  // Understeer: α_f − α_r for the same lateral acceleration, by parts, and the roll steer δ_r − δ_f.
  const slipAngles = (a: number, withTransfer: boolean, rolled: boolean): number => {
    let out = 0;
    for (const k of [0, 1]) {
      const [fzL, fzR] = loads(k, a, withTransfer);
      const [gL, gR] = inclinations(k, a, rolled);
      const alpha = axleSlip(tyre, fzL, fzR, gL, gR, m * a * share[k]);
      out += k === 0 ? alpha : -alpha;
    }
    return out;
  };
  const gradient = (f: (a: number) => number): number =>
    ((f(UNDERSTEER_AT + UNDERSTEER_STEP) - f(UNDERSTEER_AT - UNDERSTEER_STEP)) / (2 * UNDERSTEER_STEP)) * G;
  const kTyres = gradient((a) => slipAngles(a, false, false));
  const kTransfer = gradient((a) => slipAngles(a, true, false));
  const kCamber = gradient((a) => slipAngles(a, true, true));
  const kRollSteer = gradient((a) => steerOf(1, a) - steerOf(0, a));
  const understeerPerG = kCamber + kRollSteer;
  const L = c.wheelbaseM;
  const criticalSpeedMs = understeerPerG < 0 ? Math.sqrt((-L * G) / understeerPerG) : Infinity;

  // Skidpad: the highest lateral acceleration both axles can hold at their loads and cambers.
  const holds = (a: number): -1 | 0 | 1 => {
    for (const k of [0, 1] as const) {
      const [fzL, fzR] = loads(k, a, true);
      const [gL, gR] = inclinations(k, a, true);
      const peak = lateralPeakN(tyre.set, fzL, gL) + lateralPeakN(tyre.set, fzR, gR);
      if (m * a * share[k] > peak) return k;
    }
    return -1;
  };
  let lo = 0;
  let hi = MAX_ACC;
  let limitAxle: 0 | 1 = 0;
  if (holds(hi) === -1) lo = hi;
  else {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const k = holds(mid);
      if (k === -1) lo = mid;
      else {
        hi = mid;
        limitAxle = k;
      }
    }
  }
  const skidpadAcc = lo;

  // Rollover: m·a·h = m·g·(t/2 − e), with the sprung centre of mass moved sideways by h′·φ in roll.
  const tMean = (c.tracks[0] + c.tracks[1]) / 2;
  const shift = (c.sprung.massKg / m) * roll.hPrimeM * roll.gradient;
  const rolloverAcc = (G * tMean) / 2 / (c.cgHeightM + G * shift);
  const liftOffAcc = Math.min(...[0, 1].map((k) => (roll.transferPerAy[k].total > 0 ? staticN[k] / roll.transferPerAy[k].total : Infinity)));

  // Braking with an ideal ABS: each axle's valves hold its wheels at their peak while the pedal pressure keeps rising for
  // the other, so both axles end at their peaks whatever the brake balance β. β only decides which axle reaches its
  // peak first (and where a car without ABS would lock it).
  const h = c.cgHeightM;
  const beta = spec.longitudinal.brakeFront;
  const axleLoad = (a: number): [number, number] => [m * G * c.frontShare + (m * a * h) / L, m * G * (1 - c.frontShare) - (m * a * h) / L];
  const peaks = (a: number): [number, number] => {
    const [ff, fr] = axleLoad(a);
    return [2 * longitudinalPeakN(tyre.set, ff / 2), 2 * longitudinalPeakN(tyre.set, Math.max(0, fr) / 2)];
  };
  const search = (holds: (a: number) => boolean): [number, number] => {
    let lo = 0;
    let hi = MAX_ACC;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (holds(mid)) lo = mid;
      else hi = mid;
    }
    return [lo, hi];
  };
  const [brakingAcc, brakingStop] = search((a) => {
    if (axleLoad(a)[1] < 0) return false;
    const [pf, pr] = peaks(a);
    return m * a <= pf + pr;
  });
  // The search stopped where the rear wheels leave the road before the axles saturate.
  const rearLift = axleLoad(brakingStop)[1] <= 0;
  const [lockAcc, lockStop] = search((a) => {
    const [pf, pr] = peaks(a);
    return beta * m * a <= pf && (1 - beta) * m * a <= pr;
  });
  const [pfLock] = peaks(lockStop);
  const firstLock: 0 | 1 = beta * m * lockStop > pfLock ? 0 : 1;
  const rl = spec.longitudinal.roadLoad;
  // s = ∫ v dv / (a + R(v)/m), Simpson on 40 intervals.
  const steps = 40;
  let brakingM = 0;
  for (let i = 0; i <= steps; i++) {
    const v = (BRAKING_FROM_MS * i) / steps;
    const w = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2;
    brakingM += (w * v) / (brakingAcc + roadLoadN(rl, v, 0) / m);
  }
  brakingM *= BRAKING_FROM_MS / steps / 3;

  // Ride of each axle and the pitch in braking.
  const lins = [axleLinear(c, 0), axleLinear(c, 1)];
  const rides = lins.map((lin, k) => {
    const corner = c.corners[2 * k];
    const patch = patchLengthM(corner.tyre.freeRadiusM, corner.staticN / corner.tyre.kt);
    return quarterRide(lin, patch, tyreAt(spec.tyre, corner.staticN));
  });
  const transferN = (m * G * h) / L;
  const sink = (k: number, antiPct: number): number => {
    const lin = lins[k];
    return (transferN / 2) * ((1 - antiPct / 100) / lin.k + 1 / lin.kt);
  };
  const pitchPerG = (sink(0, anti.braking[0]) + sink(1, anti.braking[1])) / L;

  // Toe drag: C_α·τ² on each wheel against the rolling part of the road load at rest.
  let toeDragN = 0;
  for (const k of [0, 1] as const) {
    const [, , toeL] = anglesAt(k, 0);
    const fz = staticN[k];
    const ca = Math.abs(sideForce(tyre, 'left', 1e-4, 0, fz) - sideForce(tyre, 'left', -1e-4, 0, fz)) / 2e-4;
    toeDragN += 2 * ca * toeL * toeL;
  }
  const toeDragShare = rl.a > 0 ? toeDragN / rl.a : NaN;

  // A live axle under drive: the propshaft torque Σ F_x·r / i lifts one rear wheel by T/t (wheel-forces.ts).
  let propUnload = NaN;
  for (const k of [0, 1] as const) {
    const axle = axleSpecs[k].axle;
    if (!(axle.driven && axle.diff === 'axle')) continue;
    const drivenBoth = spec.front.axle.driven && spec.rear.axle.driven;
    const driveShare = drivenBoth ? (k === 0 ? spec.longitudinal.driveFront : 1 - spec.longitudinal.driveFront) : 1;
    const fx = 0.3 * G * m * driveShare;
    const torque = (fx * c.corners[2 * k].tyre.freeRadiusM) / spec.longitudinal.finalDrive;
    propUnload = torque / tW[k] / staticN[k];
  }

  const axles = [0, 1].map((k) => {
    const lin = lins[k];
    const ride = rides[k];
    const kk = k as 0 | 1;
    c.axles[kk].sample(0, 0, sL, sR);
    const lite = probe[k].lite;
    const d = lite?.design;
    const t = roll.transferPerAy[k];
    const outer = anglesAt(k, OUTER_CAMBER_AT)[1] + phi(OUTER_CAMBER_AT);
    // Roll steer per radian of suspension roll, from the parabola's slope at rest.
    const dA = 0.01 * G;
    const phiS = roll.suspensionGradient[k] * dA;
    const rollSteer = phiS !== 0 ? (steerOf(k, dA) - steerOf(k, -dA)) / (2 * phiS) : 0;
    const rideRate = (lin.k * lin.kt) / (lin.k + lin.kt);
    return {
      linear: lin,
      rideHz: Math.sqrt(rideRate / lin.ms) / (2 * Math.PI),
      body: ride.body,
      hop: ride.hop,
      invariant: invariantPoints(lin),
      smooth: ride.smooth,
      rough: ride.rough,
      travelReserveM: bumpReserve(c, kk) - 3 * ride.rough.travelRmsM,
      unsprungRatio: lin.mu / lin.ms,
      rollCentreM: roll.rollCentre[k],
      rolledRollCentreM: probe[k].rolled.heightM,
      rolledShiftM: probe[k].rolled.lateralM,
      camber: sL.camber,
      toe: sL.toe,
      camberGain: sL.camberGain,
      bumpSteer: d ? d.bumpSteer : bumpSteerOf(c, kk),
      kpi: d && Number.isFinite(d.kpi) && lite!.spec.linkage.kind === 'links' ? d.kpi : NaN,
      caster: d && lite!.spec.linkage.kind === 'links' ? d.caster : NaN,
      scrubM: d && lite!.spec.linkage.kind === 'links' ? d.scrub : NaN,
      trailM: d && lite!.spec.linkage.kind === 'links' ? d.trail : NaN,
      rollSteer,
      outerCamberRoad: outer,
      transferPerG: { elastic: t.elastic * G, geometric: t.geometric * G, unsprung: t.unsprung * G, total: t.total * G },
      rollStiffness: roll.stiffness[k].total,
      jointUse: probe[k].jointUse,
    } satisfies AxlePerformance;
  }) as [AxlePerformance, AxlePerformance];

  const totalTransfer = roll.transferPerAy[0].total + roll.transferPerAy[1].total;
  const geometric = roll.transferPerAy[0].geometric + roll.transferPerAy[1].geometric;
  const elastic = roll.transferPerAy[0].elastic + roll.transferPerAy[1].elastic;
  const comfortAw = Math.sqrt((rides[0].smooth.comfortAw ** 2 + rides[1].smooth.comfortAw ** 2) / 2);
  const unsprung = c.corners.reduce((s, x) => s + x.unsprungKg, 0);

  return {
    axles,
    comfortAw,
    comfortBands: comfortBands(comfortAw),
    roughGrip: Math.min(rides[0].rough.availableGrip, rides[1].rough.availableGrip),
    rollPerG: roll.gradient * G,
    frontTransferShare: roll.transferPerAy[0].total / totalTransfer,
    geometricShare: geometric / totalTransfer,
    elasticShare: elastic / totalTransfer,
    understeerPerG,
    understeerTerms: { tyres: kTyres, transfer: kTransfer - kTyres, camber: kCamber - kTransfer, rollSteer: kRollSteer },
    criticalSpeedMs,
    skidpadAcc,
    limitAxle,
    rolloverAcc,
    liftOffAcc,
    brakingM,
    brakingAcc,
    rearLift,
    lockAcc,
    firstLock,
    pitchPerG,
    anti,
    unsprungShare: unsprung / m,
    toeDragShare,
    propUnload,
    roll,
    chassis: c,
  };
}

/** Travel from rest to where the bump stop touches, m: the damper's length over the gap, through its motion ratio. */
function bumpReserve(c: Chassis, k: 0 | 1): number {
  const corner = c.corners[2 * k];
  const s = newWheelSample();
  const r = newWheelSample();
  c.axles[k].sample(0, 0, s, r);
  return (s.damperLen - corner.bumpStop.contactM) / Math.max(1e-6, s.mrDamper + s.mrDamperCross);
}

/** dτ/dq of the left wheel from the chassis tables (a beam's own slope, the other wheel held). */
function bumpSteerOf(c: Chassis, k: 0 | 1): number {
  const L = newWheelSample();
  const R = newWheelSample();
  const h = 1e-4;
  c.axles[k].sample(h, 0, L, R);
  const up = L.toe;
  c.axles[k].sample(-h, 0, L, R);
  return (up - L.toe) / (2 * h);
}
