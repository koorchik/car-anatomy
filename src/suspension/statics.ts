// Steady cornering of a chassis: where ChassisSim settles at a lateral acceleration, and the closed forms the roll
// scene and the tests set beside it. Conventions are at the top of kinematics.ts; corners FL, FR, RL, RR; a_y > 0 is a
// left turn, so the right wheels are the outer ones.
//
// settle() solves the simulation's own equations for zero accelerations at zero speed (Newton on the seven positions,
// from the car at rest, the side force raised in steps), so a steady state here is exactly where the simulation ends
// up. The closed forms are linear at design (rollModel):
//   - roll stiffness of an axle K_φ: the roll moment its springs (with the rise of their motion ratio), its bar and a
//     twist beam's torsion put on the body per radian of body roll with the wheels held on the road;
//   - roll axis under the sprung centre of mass, between the two axles' roll centres; h′ = h_s minus its height, and
//     the textbook roll gradient with the pendulum term, m_s·h′/(ΣK_φ − m_s·g·h′) (docs/research/suspensions.md, 3.3);
//   - the model's own gradient and each axle's load transfer in Milliken's three terms (elastic K_φ·φ_s/t, geometric
//     m_s,axle·h_rc·a_y/t, unsprung), with the tyres in series and each wheel's own side force taken to the body where
//     its wheel-centre force line crosses the centre line. With rigid tyres on solid axles it is the textbook one.
// understeer() turns the steady wheel loads into slip angles with the Magic Formula tyre of the car (src/vehicle/tyre.ts):
// each axle needs the slip angle at which its two tyres, at their loads (and cambers to the road), make its share of
// m·a_y. A tyre's grip grows slower than its load, so the axle that takes more of the transfer needs a larger angle:
// that is how a stiffer front bar adds understeer (the load sensitivity of PDY2 and PKY1–2), and the gradient is
// d(α_f − α_r)/d(a_y/g), positive for understeer.

import type { Chassis } from './chassis.ts';
import { ChassisSim, CHASSIS_DOF } from './chassis-sim.ts';
import { newWheelSample } from './chassis-axle.ts';
import { coilForce, G } from './forces.ts';
import { solveLinear } from './vec.ts';
import { inclinationOf, mfForces, newMfForces, tyreAt, type Tyre } from '../vehicle/tyre.ts';

/** Where the chassis settles at one lateral acceleration. Per corner FL, FR, RL, RR; forces in N, angles in rad. */
export interface SteadyState {
  ay: number;
  z: number;
  roll: number;
  pitch: number;
  travel: number[];
  fz: number[];
  fy: number[];
  camber: number[];
  camberRoad: number[];
  /** The links' share of each corner's support, split as in ChassisOut, and the elastic support's change from rest. */
  geometricN: number[];
  unsprungN: number[];
  elasticN: number[];
  /** Roll of the body over each axle's wheel centres, (q_R − q_L)/t_W, rad, front and rear. */
  suspensionRoll: [number, number];
  /** Lateral load transfer of each axle, (F_z,R − F_z,L)/2, N, and the front's share of the total. */
  transfer: [number, number];
  frontTransferShare: number;
  /** Newton iterations it took over all steps, and the largest acceleration left, m/s² or rad/s². */
  iterations: number;
  residual: number;
}

/** Steps the side force is raised in from rest. */
const SETTLE_STEPS = 6;
/** Largest acceleration left at a steady state. */
const SETTLE_TOLERANCE = 1e-9;

/** Solves the simulation for zero accelerations at `ay` from rest; throws if Newton does not get there. */
export function settle(chassis: Chassis, ay: number, sim: ChassisSim = new ChassisSim(chassis)): SteadyState {
  sim.reset();
  const n = CHASSIS_DOF;
  const p = new Float64Array(sim.pos);
  const v = new Float64Array(n);
  const r = new Float64Array(n);
  const r1 = new Float64Array(n);
  const J = new Float64Array(n * n);
  const dx = new Float64Array(n);
  const trial = new Float64Array(n);
  const norm = (a: Float64Array): number => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  let iterations = 0;
  let residual = 0;
  for (let step = 1; step <= SETTLE_STEPS; step++) {
    sim.ay = (ay * step) / SETTLE_STEPS;
    sim.accelerations(p, v, r, false);
    for (let it = 0; it < 60 && norm(r) > SETTLE_TOLERANCE; it++) {
      iterations++;
      // Jacobian by central differences (positions in m and rad alike).
      const h = 1e-7;
      for (let j = 0; j < n; j++) {
        const x0 = p[j];
        p[j] = x0 + h;
        sim.accelerations(p, v, r1, false);
        for (let i = 0; i < n; i++) J[i * n + j] = r1[i];
        p[j] = x0 - h;
        sim.accelerations(p, v, r1, false);
        for (let i = 0; i < n; i++) J[i * n + j] = (J[i * n + j] - r1[i]) / (2 * h);
        p[j] = x0;
      }
      for (let i = 0; i < n; i++) dx[i] = -r[i];
      if (solveLinear(J, dx, n) === 0) throw new Error('The chassis has no steady state here: singular');
      // Damped: halve the step until the residual drops.
      const before = norm(r);
      let t = 1;
      for (let k = 0; k < 30; k++) {
        for (let i = 0; i < n; i++) trial[i] = p[i] + t * dx[i];
        sim.accelerations(trial, v, r1, false);
        if (norm(r1) < before || k === 29) break;
        t /= 2;
      }
      p.set(trial);
      r.set(r1);
    }
    residual = norm(r);
    if (!(residual <= 1e-6)) throw new Error(`The chassis does not settle at ${(sim.ay / G).toFixed(2)} g`);
  }
  sim.pos.set(p);
  sim.vel.fill(0);
  const o = sim.observe();
  const c = chassis;
  const arr = (a: ArrayLike<number>): number[] => Array.from(a);
  const transfer: [number, number] = [(o.fz[1] - o.fz[0]) / 2, (o.fz[3] - o.fz[2]) / 2];
  const restSupport = c.restSupportN;
  const rollOf = (k: 0 | 1): number => (o.travel[2 * k + 1] - o.travel[2 * k]) / (c.corners[2 * k].y - c.corners[2 * k + 1].y);
  return {
    ay,
    z: o.z,
    roll: o.roll,
    pitch: o.pitch,
    travel: arr(o.travel),
    fz: arr(o.fz),
    fy: arr(o.fy),
    camber: arr(o.camber),
    camberRoad: arr(o.camberRoad),
    geometricN: arr(o.geometricN),
    unsprungN: arr(o.unsprungN),
    elasticN: arr(o.elasticN).map((s, i) => s - restSupport[i]),
    suspensionRoll: [rollOf(0), rollOf(1)],
    transfer,
    frontTransferShare: transfer[0] / (transfer[0] + transfer[1]),
    iterations,
    residual,
  };
}

/** Roll stiffness of each axle at design, N·m/rad, by parts. */
export interface AxleRollStiffness { springs: number; bar: number; beam: number; total: number }

/**
 * Roll stiffness of axle `k` at rest: the roll moment the suspension puts on the body per radian of body roll, with
 * the wheels held (q_L = −y_L·φ, q_R = −y_R·φ), by central differences of the static elastic forces. The springs'
 * part counts their preload through the changing motion ratio, as the wheel rate of setup.ts does.
 */
export function axleRollStiffness(chassis: Chassis, k: 0 | 1): AxleRollStiffness {
  const ax = chassis.axles[k];
  const cL = chassis.corners[2 * k];
  const cR = chassis.corners[2 * k + 1];
  const L = newWheelSample();
  const R = newWheelSample();
  const bar = chassis.bars[k];
  const kb = chassis.beamTorsion[k];
  const moment = (phi: number): AxleRollStiffness => {
    ax.sample(-cL.y * phi, -cR.y * phi, L, R);
    const fL = coilForce(cL.spring.rate, cL.spring.freeM, L.springLen, cL.spring.rate2, cL.spring.fromM);
    const fR = coilForce(cR.spring.rate, cR.spring.freeM, R.springLen, cR.spring.rate2, cR.spring.fromM);
    const springL = fL * L.mrSpring + fR * R.mrSpringCross;
    const springR = fR * R.mrSpring + fL * L.mrSpringCross;
    const torque = (bar.rate * (L.barZ - R.barZ)) / bar.armM;
    const barL = (torque * (L.mrBar - R.mrBarCross)) / bar.armM;
    const barR = (torque * (L.mrBarCross - R.mrBar)) / bar.armM;
    const beamL = kb * L.beamTwist * L.twistRate;
    const beamR = kb * R.beamTwist * R.twistRate;
    const m = (sl: number, sr: number): number => cL.y * sl + cR.y * sr;
    const springs = m(springL, springR);
    const b = m(barL, barR);
    const beam = m(beamL, beamR);
    return { springs, bar: b, beam, total: springs + b + beam };
  };
  const h = 1e-4;
  const up = moment(h);
  const down = moment(-h);
  const d = (f: keyof AxleRollStiffness): number => -(up[f] - down[f]) / (2 * h);
  return { springs: d('springs'), bar: d('bar'), beam: d('beam'), total: d('total') };
}

/** The linear roll model of a chassis at design (see the header). */
export interface RollModel {
  /** Roll stiffness of the front and rear axle's suspension, N·m/rad, and of its two tyres, k_t·t²/2. */
  stiffness: [AxleRollStiffness, AxleRollStiffness];
  tyreStiffness: [number, number];
  /** Roll centre heights of the two axles at design, m. */
  rollCentre: [number, number];
  /** Where each axle's wheel-centre force line crosses the centre line, m: the height the links take an unsprung
   *  mass's own side force to the body at (its wheel centre's height when the centre moves straight up, the roll
   *  centre's on a swing axle or a solid axle). */
  wheelCentreLine: [number, number];
  /** Height of the roll axis under the sprung centre of mass, and h′ = h_s − that, m. */
  rollAxisM: number;
  hPrimeM: number;
  /** Textbook roll gradient with the pendulum term, m_s·h′/(ΣK_φ − m_s·g·h′), rad per m/s². */
  textbookGradient: number;
  /** The body's roll over the road and each axle's suspension roll (the body over its wheels) per m/s², rad, with the
   *  tyres in series and the wheels' own side force through their links. */
  gradient: number;
  suspensionGradient: [number, number];
  /** Each axle's load transfer per m/s² by Milliken's three terms, N (see millikenTransfer). */
  transferPerAy: [TransferTerms, TransferTerms];
  /** Front axle's share of the total suspension roll stiffness. */
  frontStiffnessShare: number;
}

/** Milliken's three terms of one axle's lateral load transfer, N: elastic K_φ·φ_s/t, geometric m_s,axle·h_rc·a_y/t,
 *  unsprung m_u,axle·(h_u − h_wc + h_rc)·a_y/t (Milliken's m_u·h_u·a_y/t when h_wc = h_rc). */
export interface TransferTerms { elastic: number; geometric: number; unsprung: number; total: number }

/**
 * The linear roll model at design. Per axle k, with T_k its load transfer, φ_s,k its suspension roll and φ the body's
 * roll over the road: φ = φ_s,k + 2·T_k/(k_t·t_k) (the tyres in series); T_k·t_k = K_k·φ_s,k + F_y,k·h_rc,k −
 * m_u,k·a_y·(h_wc,k − h_u,k) (the wheels' vertical balance, with the links' share of the side forces); and the body's
 * moment, Σ T_k·t_k + Σ m_s,k·g·h_rc,k·φ_s,k − m_s·g·h_s·φ = h_s·m·a_y − Σ m_u,k·a_y·(h_s − h_u,k) (the pendulum
 * from the contact patches' arms). With rigid tyres and h_wc = h_rc this is the textbook gradient m_s·h′/(ΣK_φ − m_s·g·h′)
 * and Milliken's split; the simulation settles where this model says to 3 % at small a_y (tests).
 */
export function rollModel(chassis: Chassis): RollModel {
  const c = chassis;
  const s = c.sprung;
  const stiffness: [AxleRollStiffness, AxleRollStiffness] = [axleRollStiffness(c, 0), axleRollStiffness(c, 1)];
  const L = newWheelSample();
  const R = newWheelSample();
  const rc: number[] = [];
  const hwc: number[] = [];
  const hu: number[] = [];
  const kt: number[] = [];
  for (const k of [0, 1] as const) {
    c.axles[k].sample(0, 0, L, R);
    rc.push(L.rcHeight);
    hu.push((c.corners[2 * k].restWheelZM + c.corners[2 * k + 1].restWheelZM) / 2);
    // The left wheel centre's sideways slope in roll (the other wheel opposite), from where it sits.
    hwc.push(hu[k] + L.wheelY * (L.tanBetaWC - L.tanBetaWCCross));
    kt.push(c.corners[2 * k].tyre.kt);
  }
  const [xf, xr] = c.axleX;
  const rollAxisM = rc[1] + ((rc[0] - rc[1]) * (s.cgX - xr)) / (xf - xr);
  const hs = s.cgHeightM;
  const hPrimeM = hs - rollAxisM;
  const K = [stiffness[0].total, stiffness[1].total];
  const total = K[0] + K[1];
  // Two tracks per axle: between the contact points (the arms of the vertical forces, t_C) and between the wheel
  // centres (what a body roll moves the travels by, t_W); they differ by the static camber.
  const mu = [0, 1].map((k) => 2 * c.corners[2 * k].unsprungKg);
  const msAxle = [0, 1].map((k) => c.massKg * c.lateralShare[k] - mu[k]);
  const tC = [c.tracks[0], c.tracks[1]];
  const tW = [0, 1].map((k) => c.corners[2 * k].y - c.corners[2 * k + 1].y);
  // T_k = K_k·φ_s,k/t_W + A_k·a_y and φ_s,k = φ − e_k·T_k, so T_k = c_k·(K_k·φ/t_W + A_k·a_y).
  const A = [0, 1].map((k) => (c.massKg * c.lateralShare[k] * rc[k]) / tC[k] - (mu[k] * (hwc[k] - hu[k])) / tW[k]);
  const e = [0, 1].map((k) => 2 / (kt[k] * tW[k]));
  const ck = [0, 1].map((k) => 1 / (1 + (e[k] * K[k]) / tW[k]));
  const rho = [0, 1].map((k) => tW[k] / tC[k]);
  let D = -s.massKg * G * hs;
  let N = hs * c.massKg - mu[0] * (hs - hu[0]) - mu[1] * (hs - hu[1]);
  for (const k of [0, 1]) {
    D += (tC[k] * ck[k] * K[k]) / tW[k] + msAxle[k] * G * rc[k] * rho[k] * (1 - (e[k] * ck[k] * K[k]) / tW[k]);
    N += -tC[k] * ck[k] * A[k] + msAxle[k] * G * rc[k] * rho[k] * e[k] * ck[k] * A[k];
  }
  const gradient = N / D;
  const suspensionGradient = [0, 1].map((k) => gradient - e[k] * ck[k] * ((K[k] * gradient) / tW[k] + A[k])) as [number, number];
  const transferPerAy = [0, 1].map((k) => {
    const elastic = (K[k] * suspensionGradient[k]) / tW[k];
    const geometric = (msAxle[k] * rc[k]) / tC[k];
    const unsprung = mu[k] * (rc[k] / tC[k] - (hwc[k] - hu[k]) / tW[k]);
    return { elastic, geometric, unsprung, total: elastic + geometric + unsprung };
  }) as [TransferTerms, TransferTerms];
  return {
    stiffness,
    tyreStiffness: [(kt[0] * tW[0] ** 2) / 2, (kt[1] * tW[1] ** 2) / 2],
    rollCentre: [rc[0], rc[1]],
    wheelCentreLine: [hwc[0], hwc[1]],
    rollAxisM,
    hPrimeM,
    textbookGradient: (s.massKg * hPrimeM) / (total - s.massKg * G * hPrimeM),
    gradient,
    suspensionGradient,
    transferPerAy,
    frontStiffnessShare: K[0] / total,
  };
}

/** Lateral load transfer of both axles by Milliken's three terms at `ay` (linear at design, see rollModel). */
export function millikenTransfer(chassis: Chassis, ay: number, model: RollModel = rollModel(chassis)): [TransferTerms, TransferTerms] {
  return model.transferPerAy.map((t) => ({
    elastic: t.elastic * ay,
    geometric: t.geometric * ay,
    unsprung: t.unsprung * ay,
    total: t.total * ay,
  })) as [TransferTerms, TransferTerms];
}

/** The tyre a chassis rides on, fitted to its mean static wheel load (as the lap fits it). */
export function chassisTyre(chassis: Chassis): Tyre {
  return tyreAt(chassis.spec.tyre, (chassis.massKg * G) / 4);
}

export interface Understeer {
  ay: number;
  /** Slip angle each axle needs, rad (negative in a left turn: the tyres point inside their path). NaN when the axle
   *  cannot make its force at any angle. */
  alphaFront: number;
  alphaRear: number;
  /** α_f − α_r for a left turn, rad, positive when the front needs more: understeer. */
  angle: number;
}

/**
 * Slip angle at which the two tyres of an axle at loads (and inclinations) make side force `f`, rad: bisection on the
 * pure side force of the Magic Formula below the peak. NaN past the axle's peak.
 */
export function axleSlipAngle(tyre: Tyre, fzL: number, fzR: number, gammaL: number, gammaR: number, f: number): number {
  const o = newMfForces();
  const force = (alpha: number): number => {
    let s = 0;
    if (fzL > 0) {
      mfForces(tyre.set, 'left', 0, alpha, gammaL, fzL, 1, o);
      s += o.fy;
    }
    if (fzR > 0) {
      mfForces(tyre.set, 'right', 0, alpha, gammaR, fzR, 1, o);
      s += o.fy;
    }
    return s;
  };
  // Positive α makes negative force, so g(x) = sign(f)·F(−sign(f)·x) grows with x up to the axle's peak.
  const sgn = f >= 0 ? 1 : -1;
  const target = Math.abs(f);
  const g = (x: number): number => sgn * force(-sgn * x);
  let x = 0.002;
  let best = -Infinity;
  let bestAt = 0;
  while (x < 0.6) {
    const v = g(x);
    if (v <= best) break;
    best = v;
    bestAt = x;
    if (v >= target) break;
    x *= 1.2;
  }
  if (best < target) return NaN;
  // The zero-slip shifts of the two tyres need not cancel at unequal loads, so the root may lie just below zero.
  let lo = -bestAt;
  let hi = bestAt;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < target) lo = mid;
    else hi = mid;
  }
  return (-sgn * (lo + hi)) / 2;
}

/**
 * The axles' slip angles at the steady state of `ay`, from the Magic Formula at the steady wheel loads; with `camber`
 * the tyres also see their camber to the road.
 */
export function understeer(chassis: Chassis, ay: number, options: { camber?: boolean; tyre?: Tyre; steady?: SteadyState } = {}): Understeer {
  const tyre = options.tyre ?? chassisTyre(chassis);
  const s = options.steady ?? settle(chassis, ay);
  const gamma = (i: number): number => (options.camber ? inclinationOf(i % 2 === 0 ? 'left' : 'right', s.camberRoad[i]) : 0);
  const alpha = [0, 1].map((k) =>
    axleSlipAngle(tyre, s.fz[2 * k], s.fz[2 * k + 1], gamma(2 * k), gamma(2 * k + 1), chassis.massKg * ay * chassis.lateralShare[k]),
  );
  return { ay, alphaFront: alpha[0], alphaRear: alpha[1], angle: Math.sign(ay) * (alpha[1] - alpha[0]) };
}

/** Understeer gradient at `ay`, rad per g of lateral acceleration: d(α_f − α_r)/d(a_y/g) by a central difference. */
export function understeerGradient(chassis: Chassis, ay: number, options: { camber?: boolean; tyre?: Tyre } = {}): number {
  const d = 0.05 * G;
  const up = understeer(chassis, ay + d, options);
  const down = understeer(chassis, ay - d, options);
  return ((up.angle - down.angle) / (2 * d)) * G;
}

/**
 * The smallest lateral acceleration at which an inner wheel leaves the road (its steady load reaches zero), m/s², and
 * which wheel; null if none does below `maxAy`. Bisection on settle().
 */
export function liftOff(chassis: Chassis, maxAy = 1.5 * G): { ay: number; corner: number } | null {
  const sim = new ChassisSim(chassis);
  const inner = (ay: number): { load: number; corner: number } => {
    const s = settle(chassis, ay, sim);
    const corner = s.fz[0] < s.fz[2] ? 0 : 2;
    return { load: Math.min(s.fz[0], s.fz[2]), corner };
  };
  let top: { load: number; corner: number };
  try {
    top = inner(maxAy);
  } catch {
    top = { load: 0, corner: -1 };
  }
  if (top.load > 1e-6) return null;
  let lo = 0;
  let hi = maxAy;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    let load = 0;
    try {
      load = inner(mid).load;
    } catch {
      load = 0;
    }
    if (load > 1e-6) lo = mid;
    else hi = mid;
  }
  const at = (lo + hi) / 2;
  return { ay: at, corner: inner(lo).corner };
}
