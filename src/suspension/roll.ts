// The roll scene's numbers (suspensions plan, the roll scene; stage P7): the car's state at a lateral acceleration, in
// one flat shape the 3D and the page read, for a steady turn (settle), a sweep of steady turns from rest to the tyres'
// limit (the skidpad and the camber chart), and a sudden turn run in time (the transient of step 6). Also the roll
// centre of an axle at any pair of travels, the 40 mm lowering of a whole chassis, and the textbook roll gradient with
// another front roll centre, which the article sets beside Chrysler's measurement. No DOM and no text.
//
// Conventions as in chassis-sim.ts: corners FL, FR, RL, RR; a_y > 0 is a left turn, so the right wheels are the outer
// ones; roll positive with the left side up.

import type { Chassis } from './chassis.ts';
import { newWheelSample, type WheelSample } from './chassis-axle.ts';
import { ChassisSim } from './chassis-sim.ts';
import { G } from './forces.ts';
import { settle, type RollModel, type SteadyState } from './statics.ts';

/** What the roll scene shows at one moment: the body, each wheel and how its load changed. Per corner FL, FR, RL, RR. */
export interface RollState {
  /** Lateral acceleration, m/s². */
  ay: number;
  /** Heave of the sprung centre of mass from design, m; roll and pitch, rad. */
  z: number;
  roll: number;
  pitch: number;
  travel: Float64Array;
  /** Tyre loads, N, and their change from rest in Milliken's three parts: through the links at once (the sprung mass's
   *  side force), through the springs, bars and beam (it needs the body to roll), and the unsprung masses' own. */
  fz: Float64Array;
  geometric: Float64Array;
  elastic: Float64Array;
  unsprung: Float64Array;
  /** Camber to the road, rad (positive top out). */
  camberRoad: Float64Array;
  /** The tyres could not make these side forces: the car slides (wheel-forces.ts). */
  impossible: boolean;
}

const f4 = (): Float64Array => new Float64Array(4);

export const newRollState = (): RollState => ({
  ay: 0, z: 0, roll: 0, pitch: 0, travel: f4(), fz: f4(), geometric: f4(), elastic: f4(), unsprung: f4(), camberRoad: f4(), impossible: false,
});

export function copyRollState(from: RollState, to: RollState): RollState {
  to.ay = from.ay;
  to.z = from.z;
  to.roll = from.roll;
  to.pitch = from.pitch;
  to.travel.set(from.travel);
  to.fz.set(from.fz);
  to.geometric.set(from.geometric);
  to.elastic.set(from.elastic);
  to.unsprung.set(from.unsprung);
  to.camberRoad.set(from.camberRoad);
  to.impossible = from.impossible;
  return to;
}

/** A steady state as the scene shows it. */
export function stateOfSteady(s: SteadyState, out: RollState = newRollState()): RollState {
  out.ay = s.ay;
  out.z = s.z;
  out.roll = s.roll;
  out.pitch = s.pitch;
  for (let i = 0; i < 4; i++) {
    out.travel[i] = s.travel[i]!;
    out.fz[i] = s.fz[i]!;
    out.geometric[i] = s.geometricN[i]!;
    out.elastic[i] = s.elasticN[i]!;
    // The anti-geometry carries nothing in a turn at a steady speed; what it would is the links' too.
    out.unsprung[i] = s.unsprungN[i]! + s.antiN[i]!;
    out.camberRoad[i] = s.camberRoad[i]!;
  }
  out.impossible = s.impossible;
  return out;
}

/** The steady turn at `ay`, or null where the car has no steady state (it is going over). */
export function steadyRoll(chassis: Chassis, ay: number, sim?: ChassisSim): RollState | null {
  try {
    return stateOfSteady(settle(chassis, ay, sim));
  } catch {
    return null;
  }
}

/** Lateral load transfer of axle k, (F_z,outer − F_z,inner)/2 in a left turn, N. */
export const axleTransfer = (s: RollState, k: 0 | 1): number => (s.fz[2 * k + 1]! - s.fz[2 * k]!) / 2;

/** The front axle's share of the total lateral load transfer (NaN at rest). */
export function frontTransferShare(s: RollState): number {
  const f = axleTransfer(s, 0);
  const r = axleTransfer(s, 1);
  return f / (f + r);
}

/** Step of a sweep's lateral acceleration and how far it goes, m/s²: past the 1 g of the slider, for the skidpad. */
export const SWEEP_STEP = 0.02 * G;
export const SWEEP_MAX = 1.3 * G;

/**
 * Steady turns from rest outwards on a grid of SWEEP_STEP, built a few at a time (advance), so a page can spread the
 * hundred-odd milliseconds over frames. It ends where the car has no steady state; `limitAy` is the first point where the
 * tyres can no longer make the side force, which is where a skidpad ends.
 */
export class RollSweep {
  readonly chassis: Chassis;
  readonly states: RollState[] = [];
  /** No steady state past the last point (the car goes over), or the grid's end. */
  done = false;
  private readonly sim: ChassisSim;

  constructor(chassis: Chassis) {
    this.chassis = chassis;
    this.sim = new ChassisSim(chassis);
  }

  /** Builds more points for up to `budgetMs` of wall time (one at least); returns whether the sweep is complete. */
  advance(budgetMs: number): boolean {
    const until = performance.now() + budgetMs;
    while (!this.done) {
      const ay = this.states.length * SWEEP_STEP;
      const s = ay > SWEEP_MAX + 1e-9 ? null : steadyRoll(this.chassis, ay, this.sim);
      if (!s) this.done = true;
      else this.states.push(s);
      if (performance.now() >= until) break;
    }
    return this.done;
  }

  /** The last lateral acceleration with a steady state, m/s². */
  get endAy(): number {
    return (this.states.length - 1) * SWEEP_STEP;
  }

  /** The first point at which the tyres cannot make the side force (the skidpad's end), m/s²; the end if none. */
  get limitAy(): number {
    const i = this.states.findIndex((s) => s.impossible);
    return i < 0 ? this.endAy : Math.max(0, (i - 1) * SWEEP_STEP);
  }

  /** The state at `ay` between the grid's points (linear), clamped to the sweep; null before the first point. */
  at(ay: number, out: RollState): RollState | null {
    const n = this.states.length;
    if (!n) return null;
    const u = Math.min(Math.max(ay / SWEEP_STEP, 0), n - 1);
    const i = Math.min(Math.floor(u), n - 2);
    if (i < 0) return copyRollState(this.states[0]!, out);
    return lerpState(this.states[i]!, this.states[i + 1]!, u - i, out);
  }
}

function lerpState(a: RollState, b: RollState, w: number, out: RollState): RollState {
  const l = (x: number, y: number): number => x + (y - x) * w;
  out.ay = l(a.ay, b.ay);
  out.z = l(a.z, b.z);
  out.roll = l(a.roll, b.roll);
  out.pitch = l(a.pitch, b.pitch);
  for (let i = 0; i < 4; i++) {
    out.travel[i] = l(a.travel[i]!, b.travel[i]!);
    out.fz[i] = l(a.fz[i]!, b.fz[i]!);
    out.geometric[i] = l(a.geometric[i]!, b.geometric[i]!);
    out.elastic[i] = l(a.elastic[i]!, b.elastic[i]!);
    out.unsprung[i] = l(a.unsprung[i]!, b.unsprung[i]!);
    out.camberRoad[i] = l(a.camberRoad[i]!, b.camberRoad[i]!);
  }
  out.impossible = w < 0.5 ? a.impossible : b.impossible;
  return out;
}

/** A sudden turn: the lateral acceleration rises from 0 to its target in SWERVE_RAMP_S and holds. */
export const SWERVE_RAMP_S = 0.3;
export const SWERVE_S = 2.5;
/** Interval of the recorded samples, s. */
export const SWERVE_EVERY_S = 0.004;

/** A sudden turn recorded in time, one sample every SWERVE_EVERY_S. */
export interface SwerveTrace {
  targetAy: number;
  /** Samples recorded; fewer than the run's if the car went over. */
  n: number;
  rolledOver: boolean;
  ay: Float32Array;
  z: Float32Array;
  roll: Float32Array;
  pitch: Float32Array;
  /** Per corner, sample-major: [i·4 + corner]. */
  travel: Float32Array;
  fz: Float32Array;
  geometric: Float32Array;
  elastic: Float32Array;
  unsprung: Float32Array;
  camberRoad: Float32Array;
}

/** Runs ChassisSim through a sudden turn to `targetAy` from a steady straight line, and records it. */
export function runSwerve(chassis: Chassis, targetAy: number): SwerveTrace {
  const n = Math.round(SWERVE_S / SWERVE_EVERY_S) + 1;
  const trace: SwerveTrace = {
    targetAy, n: 0, rolledOver: false,
    ay: new Float32Array(n), z: new Float32Array(n), roll: new Float32Array(n), pitch: new Float32Array(n),
    travel: new Float32Array(4 * n), fz: new Float32Array(4 * n), geometric: new Float32Array(4 * n), elastic: new Float32Array(4 * n),
    unsprung: new Float32Array(4 * n), camberRoad: new Float32Array(4 * n),
  };
  const sim = new ChassisSim(chassis);
  // From where the car stands still (settle leaves the simulation there; a lowered chassis is not at its rest pose).
  settle(chassis, 0, sim);
  const rest = chassis.restSupportN;
  const steps = Math.round(SWERVE_EVERY_S / 0.001);
  for (let k = 0; k < n; k++) {
    const o = sim.observe();
    if (sim.rolledOver) {
      trace.rolledOver = true;
      break;
    }
    trace.ay[k] = o.ay;
    trace.z[k] = o.z;
    trace.roll[k] = o.roll;
    trace.pitch[k] = o.pitch;
    for (let i = 0; i < 4; i++) {
      trace.travel[4 * k + i] = o.travel[i]!;
      trace.fz[4 * k + i] = o.fz[i]!;
      trace.geometric[4 * k + i] = o.geometricN[i]!;
      trace.elastic[4 * k + i] = o.elasticN[i]! - rest[i]!;
      trace.unsprung[4 * k + i] = o.unsprungN[i]! + o.antiN[i]!;
      trace.camberRoad[4 * k + i] = o.camberRoad[i]!;
    }
    trace.n = k + 1;
    for (let s = 0; s < steps; s++) {
      const t = sim.t + 0.001;
      sim.ay = targetAy * Math.min(1, t / SWERVE_RAMP_S);
      sim.step();
    }
  }
  return trace;
}

/** Seconds a trace covers. */
export const swerveSeconds = (trace: SwerveTrace): number => Math.max(0, trace.n - 1) * SWERVE_EVERY_S;

/** The trace's state at `t` seconds (linear between samples, held past the end). */
export function swerveAt(trace: SwerveTrace, t: number, out: RollState): RollState {
  const u = Math.min(Math.max(t / SWERVE_EVERY_S, 0), Math.max(0, trace.n - 1));
  const i = Math.min(Math.floor(u), Math.max(0, trace.n - 2));
  const w = trace.n > 1 ? u - i : 0;
  const j = Math.min(i + 1, trace.n - 1);
  const l = (a: Float32Array, k: number, m: number): number => a[k]! + (a[m]! - a[k]!) * w;
  out.ay = l(trace.ay, i, j);
  out.z = l(trace.z, i, j);
  out.roll = l(trace.roll, i, j);
  out.pitch = l(trace.pitch, i, j);
  for (let c = 0; c < 4; c++) {
    const a = 4 * i + c;
    const b = 4 * j + c;
    out.travel[c] = l(trace.travel, a, b);
    out.fz[c] = l(trace.fz, a, b);
    out.geometric[c] = l(trace.geometric, a, b);
    out.elastic[c] = l(trace.elastic, a, b);
    out.unsprung[c] = l(trace.unsprung, a, b);
    out.camberRoad[c] = l(trace.camberRoad, a, b);
  }
  out.impossible = false;
  return out;
}

/**
 * Where the lines from the two contact patches through their instant centres cross, in the axle's own frame (y left,
 * z up from the road at design, the body's frame): the axle's roll centre at these travels. Each wheel's line is the
 * normal to its patch's path as the wheel travels, z = C_z − tanβ·(y − C_y), so at symmetric travel it crosses the
 * centre line at C_y·tanβ, the roll centre of kinematics.ts. Null when the lines are parallel.
 */
export function rollCentre(L: WheelSample, R: WheelSample, out: { y: number; z: number }): { y: number; z: number } | null {
  const tl = L.tanBeta;
  const tr = R.tanBeta;
  const d = tr - tl;
  if (Math.abs(d) < 1e-9) return null;
  const y = (R.contactZ + tr * R.contactY - L.contactZ - tl * L.contactY) / d;
  out.y = y;
  out.z = L.contactZ - tl * (y - L.contactY);
  return out;
}

/** The roll centre of axle k of a chassis at its two travels (rollCentre). */
export function axleRollCentre(chassis: Chassis, k: 0 | 1, qL: number, qR: number, out: { y: number; z: number }): { y: number; z: number } | null {
  const L = SAMPLES[0];
  const R = SAMPLES[1];
  chassis.axles[k].sample(qL, qR, L, R);
  return rollCentre(L, R, out);
}

const SAMPLES: [WheelSample, WheelSample] = [newWheelSample(), newWheelSample()];

/** What the lowering takes off the ride height, m (the travel scene's lowering button). */
export const ROLL_LOWER_M = 0.04;

/**
 * The same chassis lowered by `dq` on shorter springs, as a tuner lowers a car: every spring's free length is shorter
 * by what the spring shortens over `dq` of bump, so the car stands with every corner at about `dq` of travel (the body
 * that much lower, the wheels where they were) and the springs carry what they did. The bump stops stay where they
 * are, so a lowered car reaches them sooner. Settle finds the exact rest; only the rest pose here is a first guess.
 * Throws on an air or hydropneumatic spring: those level themselves.
 */
export function lowerChassis(chassis: Chassis, dq: number): Chassis {
  const L0 = newWheelSample();
  const R0 = newWheelSample();
  const L1 = newWheelSample();
  const R1 = newWheelSample();
  const corners = chassis.corners.map((c, i) => {
    if (c.spring.gas) throw new Error('A gas spring levels the car itself: it is not lowered on shorter springs');
    const k = c.axle;
    chassis.axles[k].sample(0, 0, L0, R0);
    chassis.axles[k].sample(dq, dq, L1, R1);
    const [s0, s1] = i % 2 === 0 ? [L0, L1] : [R0, R1];
    return { ...c, spring: { ...c.spring, freeM: c.spring.freeM - (s0.springLen - s1.springLen) } };
  }) as unknown as Chassis['corners'];
  return { ...chassis, corners, rest: { ...chassis.rest, z: chassis.rest.z - dq } };
}

/**
 * The textbook roll gradient m_s·h′/(ΣK_φ − m_s·g·h′) of the rigid model, rad per m/s², with the front roll centre at
 * `frontRcM` and everything else as `model` has it: the roll axis runs between the two roll centres, h′ is the sprung
 * centre of mass over it. Chrysler moved the front roll centre to 0, 65 and 132 mm on a real car and its steady roll
 * did not change (docs/research/suspensions.md, 2.2); in this formula it does, which is what the article shows.
 */
export function rigidRollGradient(chassis: Chassis, model: RollModel, frontRcM: number): number {
  const s = chassis.sprung;
  const [xf, xr] = chassis.axleX;
  const rr = model.rollCentre[1];
  const axis = rr + ((frontRcM - rr) * (s.cgX - xr)) / (xf - xr);
  const hPrime = s.cgHeightM - axis;
  const k = model.stiffness[0].total + model.stiffness[1].total;
  return (s.massKg * hPrime) / (k - s.massKg * G * hPrime);
}
