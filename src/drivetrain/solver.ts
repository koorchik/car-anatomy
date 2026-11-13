// Steps a DrivetrainCore (docs/gearbox-model.md, the dynamics section). The audio thread, the main-thread copy and the tests
// all run this file, so it imports nothing but the core's constants and the element laws, and allocates nothing
// per step but its rare events.
//
// Equations of motion in base coordinates, linear-implicit in every speed-dependent torque:
//
//   [ M + h·C   Bᵀ ] [ φ̈ ]   [ f(φ, φ̇) ]
//   [ B         0  ] [ −μ ] = [ r       ]        φ̇ ← φ̇ + h·φ̈,   φ ← φ + h·φ̇   (symplectic Euler)
//
// f: external torques on the members, springs, the spin loss and the slipping elements; C: their slopes in φ̇
// (damper damping, spin loss, the Stribeck slope of a slipping clutch). B: rows of the locked elements and of the
// members held at a set speed; μ: their torques. Springs stay explicit, so they keep their energy; damping is
// implicit, so a stiff viscous law cannot shake a long step apart.
//
// Stick and slip follow Karnopp: a locked element holds while |μ| ≤ T_s; if several exceed, the one with the
// largest |μ|/T_s lets go first and the system is solved again (four passes at most). A slipping element whose slip
// changed sign or fell below LOCK_SLIP is offered the lock; if the torque it needs is within T_s it locks, and the
// speeds are projected onto the lock with the mass metric, φ̇ ← φ̇ − M⁻¹Gᵀ(GM⁻¹Gᵀ)⁻¹G·φ̇: the momentum-preserving
// average of the bodies, which never adds energy. What it removes goes into the element's energy counter.
//
// The KKT system is factorised on every pass: C changes with every slipping element, and the sizes are tiny (a
// dozen coordinates, a handful of rows).

import { DOG, type DrivetrainCore, FRICTION, ONEWAY, SYNCHRO } from './core.ts';
import { BELL_HOUSING_C, DISC_COOLING_S, LOCK_SLIP, SPIN_LOSS_FADE, SYNC_WINDOW } from './elements.ts';

/** Element states, as reported. */
export const OPEN = 0;
export const SLIP = 1;
export const LOCKED = 2;
export type ElementState = typeof OPEN | typeof SLIP | typeof LOCKED;

/** Karnopp passes per step (the gearbox plan's budget). */
const MAX_PASSES = 4;
/**
 * The negative Stribeck slopes of all slipping elements together may take at most this share of the inertia their
 * slips see per step. A steeper fall is an instability faster than the step can follow; capping it keeps M + h·C
 * positive definite.
 */
const NEGATIVE_SLOPE_SHARE = 0.5;
/** Relative regularisation of the constraint block, so redundant locks (a jammed box) stay solvable. */
const REGULARISE = 1e-12;
/** A dog that closes with less slip than this makes no knock, rad/s. */
const KNOCK_SLIP = 0.01;

export interface DrivetrainEvent {
  /** 'knock': a dog clutch closed with a speed difference; the energy went into the impact. */
  kind: 'knock';
  element: number;
  energyJ: number;
}

export class DrivetrainSolver {
  readonly core: DrivetrainCore;
  /** Base angles, unwrapped, rad. */
  readonly phi: Float64Array;
  /** Base speeds, rad/s. */
  readonly phiDot: Float64Array;
  /** External torque on each member, N·m, positive in the crank's direction; kept until changed. */
  readonly memberTorque: Float64Array;
  /** A member held at this speed (a stub engine, a dyno), rad/s; NaN leaves it free. */
  readonly drive: Float64Array;
  /** Torque the speed hold put on each held member in the last step, N·m. */
  readonly driveTorque: Float64Array;
  /**
   * Per element. Friction: clamp share 0…1 (a clutch takes pedalClamp(pedal)). Synchroniser: sleeve force, N.
   * Dog: closes when above zero. One-way: unused.
   */
  readonly command: Float64Array;
  /** OPEN, SLIP or LOCKED per element after the last step. */
  readonly state: Uint8Array;
  /** Torque the element put on its member a in the last step, N·m (member b got the opposite). */
  readonly torque: Float64Array;
  /** Δω = ω_a − ω_b after the last step, rad/s. */
  readonly slip: Float64Array;
  /** Energy the element has turned into heat, J, cumulative. */
  readonly energy: Float64Array;
  /** Temperature of what the element heats, °C (elements with a heat capacity). */
  readonly temperature: Float64Array;
  /** Events of the last steps; the reader empties it. */
  events: DrivetrainEvent[] = [];
  /** Simulated time, s. */
  time = 0;

  // Scratch, sized once.
  private readonly A: Float64Array;
  private readonly f: Float64Array;
  private readonly z: Float64Array;
  private readonly acc: Float64Array;
  private readonly G: Float64Array;
  private readonly Y: Float64Array;
  private readonly S: Float64Array;
  private readonly rhs: Float64Array;
  private readonly mu: Float64Array;
  private readonly rowElement: Int32Array;
  private readonly rowMember: Int32Array;
  private readonly cls: Uint8Array;
  private readonly crossed: Uint8Array;
  /** Direction of a slip too small to have its own sign; `released` makes it win over the sign. */
  private readonly slipDir: Float64Array;
  private readonly released: Uint8Array;
  private readonly slope: Float64Array;
  /** Kinetic torque a slipping element put on member a in the last assembly. */
  private readonly applied: Float64Array;
  private readonly heat: Float64Array;
  private readonly dv: Float64Array;
  private readonly Yp: Float64Array;
  private readonly Sp: Float64Array;
  private readonly impulse: Float64Array;
  private readonly impact: Float64Array;
  private rows = 0;

  constructor(core: DrivetrainCore) {
    this.core = core;
    const { n } = core;
    const nm = core.members.length;
    const ne = core.elements.ids.length;
    const maxRows = ne + nm;
    this.phi = new Float64Array(n);
    this.phiDot = new Float64Array(n);
    this.memberTorque = new Float64Array(nm);
    this.drive = new Float64Array(nm).fill(Number.NaN);
    this.driveTorque = new Float64Array(nm);
    this.command = new Float64Array(ne);
    this.state = new Uint8Array(ne);
    this.torque = new Float64Array(ne);
    this.slip = new Float64Array(ne);
    this.energy = new Float64Array(ne);
    this.temperature = new Float64Array(ne).fill(BELL_HOUSING_C);
    this.A = new Float64Array(n * n);
    this.f = new Float64Array(n);
    this.z = new Float64Array(n);
    this.acc = new Float64Array(n);
    this.G = new Float64Array(maxRows * n);
    this.Y = new Float64Array(maxRows * n);
    this.S = new Float64Array(maxRows * maxRows);
    this.rhs = new Float64Array(maxRows);
    this.mu = new Float64Array(maxRows);
    this.rowElement = new Int32Array(maxRows);
    this.rowMember = new Int32Array(maxRows);
    this.cls = new Uint8Array(ne);
    this.crossed = new Uint8Array(ne);
    this.slipDir = new Float64Array(ne).fill(1);
    this.released = new Uint8Array(ne);
    this.slope = new Float64Array(ne);
    this.applied = new Float64Array(ne);
    this.heat = new Float64Array(ne);
    this.dv = new Float64Array(n);
    this.Yp = new Float64Array(maxRows * n);
    this.Sp = new Float64Array(maxRows * maxRows);
    this.impulse = new Float64Array(maxRows);
    this.impact = new Float64Array(ne);
  }

  /** Speed of a member, rad/s. */
  memberSpeed(i: number): number {
    return this.dotRow(this.core.P, i, this.phiDot);
  }

  /** Angle of a member, unwrapped, rad. */
  memberAngle(i: number): number {
    return this.dotRow(this.core.P, i, this.phi);
  }

  /** Twist of a spring, rad. */
  springTwist(j: number): number {
    return this.dotRow(this.core.springs.rows, j, this.phi);
  }

  /** Torque a spring puts on its member b (what it passes on), N·m. */
  springTorque(j: number): number {
    const { springs } = this.core;
    return springs.stiffness[j]! * this.springTwist(j) + springs.damping[j]! * this.dotRow(springs.rows, j, this.phiDot);
  }

  /** Kinetic energy of the whole drivetrain, J. */
  kineticEnergy(): number {
    const { n, mass } = this.core;
    let e = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) e += this.phiDot[r]! * mass[r * n + c]! * this.phiDot[c]!;
    return e / 2;
  }

  private dotRow(m: Float64Array, row: number, x: Float64Array): number {
    const n = this.core.n;
    let s = 0;
    for (let k = 0; k < n; k++) s += m[row * n + k]! * x[k]!;
    return s;
  }

  step(h: number): void {
    const { core } = this;
    const E = core.elements;
    const ne = E.ids.length;
    const { cls, crossed } = this;

    // 1. Which elements hold, slip, or are offered the lock this step.
    for (let e = 0; e < ne; e++) {
      const cmd = this.command[e]!;
      const dw = this.dotRow(E.rows, e, this.phiDot);
      const was = this.state[e]!;
      let c: number;
      switch (E.kind[e]) {
        case FRICTION:
          c = cmd <= 0 ? OPEN : was === LOCKED || Math.abs(dw) < LOCK_SLIP || crossed[e] ? LOCKED : SLIP;
          break;
        case SYNCHRO:
          c = cmd <= 0 ? OPEN : was === LOCKED || Math.abs(dw) < SYNC_WINDOW || crossed[e] ? LOCKED : SLIP;
          break;
        case DOG:
          c = cmd <= 0 ? OPEN : LOCKED;
          break;
        default:
          // One-way: free while a overruns b, offered the lock when it would fall behind.
          c = was === LOCKED || dw < LOCK_SLIP || crossed[e] ? LOCKED : OPEN;
      }
      cls[e] = c;
      crossed[e] = 0;
      this.released[e] = 0;
      this.heat[e] = 0;
      if (c === SLIP && Math.abs(dw) > 1e-9) this.slipDir[e] = Math.sign(dw);
    }

    // 2. Solve; let go the most overloaded lock and solve again, up to MAX_PASSES times.
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      this.assemble(h);
      this.solve();
      if (pass === MAX_PASSES - 1) break;
      let worst = -1;
      let worstRow = -1;
      let worstRatio = 1;
      for (let j = 0; j < this.rows; j++) {
        const e = this.rowElement[j]!;
        if (e < 0) continue;
        const mu = this.mu[j]!;
        let ratio = 0;
        if (E.kind[e] === FRICTION) ratio = Math.abs(mu) / (E.muStatic[e]! * E.scale[e]! * this.command[e]!);
        else if (E.kind[e] === ONEWAY && mu < 0) ratio = Number.POSITIVE_INFINITY;
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worst = e;
          worstRow = j;
        }
      }
      if (worst < 0) break;
      // It slips the way the hold was keeping it from going, and its friction opposes that from the start.
      cls[worst] = E.kind[worst] === ONEWAY ? OPEN : SLIP;
      this.slipDir[worst] = this.mu[worstRow]! > 0 ? -1 : 1;
      this.released[worst] = 1;
    }

    // 3. Newly locked elements: project the speeds onto the locks (an inelastic impact for a dog).
    let fresh = false;
    for (let e = 0; e < ne; e++) if (cls[e] === LOCKED && this.state[e] !== LOCKED) fresh = true;
    if (fresh) this.project();

    // 4. Integrate.
    const { n } = core;
    for (let e = 0; e < ne; e++) this.slip[e] = this.dotRow(E.rows, e, this.phiDot);
    for (let k = 0; k < n; k++) {
      this.phiDot[k]! += h * this.acc[k]!;
      this.phi[k]! += h * this.phiDot[k]!;
    }
    this.time += h;

    // 5. Element readouts, slip work, sign changes, heat.
    let row = 0;
    for (let e = 0; e < ne; e++) {
      const before = this.slip[e]!;
      const after = this.dotRow(E.rows, e, this.phiDot);
      const c = cls[e]!;
      if (c === LOCKED) {
        while (this.rowElement[row] !== e) row++;
        this.torque[e] = this.mu[row]!;
        this.slip[e] = after;
      } else {
        this.torque[e] = c === SLIP ? this.applied[e]! : 0;
        this.slip[e] = after;
        if (c === SLIP) {
          this.heat[e]! += (-this.torque[e]! * (before + after) * h) / 2;
          if (before * after < 0) crossed[e] = 1;
        }
        if (E.kind[e] === ONEWAY && after < 0) crossed[e] = 1;
      }
      this.state[e] = c;
      this.energy[e]! += this.heat[e]!;
      const cap = E.heatCapacity[e]!;
      if (cap > 0) {
        const t = this.temperature[e]!;
        this.temperature[e] = t + this.heat[e]! / cap - (h * (t - BELL_HOUSING_C)) / DISC_COOLING_S;
      }
    }
    this.driveTorque.fill(0);
    for (let j = 0; j < this.rows; j++) {
      const m = this.rowMember[j]!;
      if (m >= 0) this.driveTorque[m] = this.mu[j]!;
    }
  }

  /** Kinetic torque of a slipping element on member a, N·m: it opposes the slip. */
  private slipTorque(e: number): number {
    const E = this.core.elements;
    const dw = this.dotRow(E.rows, e, this.phiDot);
    const dir = this.released[e] || Math.abs(dw) <= 1e-9 ? this.slipDir[e]! : Math.sign(dw);
    const cmd = this.command[e]!;
    if (E.kind[e] === SYNCHRO) return -dir * E.scale[e]! * cmd;
    const mu = E.muKinetic[e]! + (E.muStatic[e]! - E.muKinetic[e]!) * Math.exp(-Math.abs(dw) / E.stribeck[e]!);
    return -dir * mu * E.scale[e]! * cmd;
  }

  /** Builds M + h·C, the force vector and the constraint rows for the present classification. */
  private assemble(h: number): void {
    const { core, A, f, G, rhs, cls } = this;
    const { n, P, mass } = core;
    const nm = core.members.length;
    const E = core.elements;
    const ne = E.ids.length;
    A.set(mass);
    f.fill(0);
    const v = this.phiDot;

    // External torques on the members.
    for (let i = 0; i < nm; i++) {
      const t = this.memberTorque[i]!;
      if (t !== 0) for (let k = 0; k < n; k++) f[k]! += P[i * n + k]! * t;
    }
    // Springs: explicit stiffness, implicit damping.
    const S = core.springs;
    for (let j = 0; j < S.ids.length; j++) {
      const t = -(S.stiffness[j]! * this.dotRow(S.rows, j, this.phi) + S.damping[j]! * this.dotRow(S.rows, j, v));
      this.addRank1(S.rows, j, t, h * S.damping[j]!);
    }
    // Spin loss at the input: a·sat(ω/ω₀) + b·ω against the rotation.
    const d = core.drag;
    if (d.member >= 0) {
      const w = this.dotRow(P, d.member, v);
      const fade = Math.abs(w) < SPIN_LOSS_FADE;
      const t = -((fade ? w / SPIN_LOSS_FADE : Math.sign(w)) * d.a + d.b * w);
      this.addRank1(P, d.member, t, h * (d.b + (fade ? d.a / SPIN_LOSS_FADE : 0)));
    }
    // Slipping elements: their kinetic torque, and the Stribeck slope (a falling one capped, see above).
    let falling = 0;
    for (let e = 0; e < ne; e++) {
      this.slope[e] = 0;
      if (cls[e] !== SLIP || E.kind[e] !== FRICTION) continue;
      const dw = this.dotRow(E.rows, e, v);
      const excess = E.muStatic[e]! - E.muKinetic[e]!;
      this.slope[e] = ((-excess * E.scale[e]! * this.command[e]!) / E.stribeck[e]!) * Math.exp(-Math.abs(dw) / E.stribeck[e]!);
      if (this.slope[e]! < 0) falling++;
    }
    for (let e = 0; e < ne; e++) {
      if (cls[e] !== SLIP) continue;
      let c = this.slope[e]!;
      if (c < 0) c = Math.max(c, (-NEGATIVE_SLOPE_SHARE / falling) * (E.slipInertia[e]! / h));
      this.applied[e] = this.slipTorque(e);
      this.addRank1(E.rows, e, this.applied[e]!, h * c);
    }

    // Constraint rows. A lock that held last step keeps Δω = 0 and corrects its rounding drift; a new one holds
    // Δω̇ = 0, which is the torque Karnopp weighs, and the projection then brings its Δω to zero. Held members reach
    // their speed in one step.
    let m = 0;
    for (let e = 0; e < ne; e++) {
      if (cls[e] !== LOCKED) continue;
      for (let k = 0; k < n; k++) G[m * n + k] = E.rows[e * n + k]!;
      rhs[m] = this.state[e] === LOCKED ? -this.dotRow(E.rows, e, v) / h : 0;
      this.rowElement[m] = e;
      this.rowMember[m] = -1;
      m++;
    }
    for (let i = 0; i < nm; i++) {
      const target = this.drive[i]!;
      if (Number.isNaN(target)) continue;
      for (let k = 0; k < n; k++) G[m * n + k] = P[i * n + k]!;
      rhs[m] = (target - this.dotRow(P, i, v)) / h;
      this.rowElement[m] = -1;
      this.rowMember[m] = i;
      m++;
    }
    this.rows = m;
  }

  /** f += t·rowᵀ, A += c·rowᵀ·row for one row of `m`. */
  private addRank1(m: Float64Array, row: number, t: number, c: number): void {
    const { A, f } = this;
    const n = this.core.n;
    const o = row * n;
    for (let r = 0; r < n; r++) {
      const br = m[o + r]!;
      if (br === 0) continue;
      f[r]! += t * br;
      if (c !== 0) for (let k = 0; k < n; k++) A[r * n + k]! += c * br * m[o + k]!;
    }
  }

  /** Solves the KKT system by its Schur complement: A·a = f + Gᵀμ, G·a = rhs. */
  private solve(): void {
    const { A, f, z, G, Y, S, rhs, mu, acc } = this;
    const n = this.core.n;
    const m = this.rows;
    if (!cholesky(A, n)) throw new Error('drivetrain: M + h·C lost positive definiteness');
    z.set(f);
    cholSolve(A, n, z, 0);
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < n; k++) Y[j * n + k] = G[j * n + k]!;
      cholSolve(A, n, Y, j * n);
    }
    schur(G, Y, S, m, n);
    for (let j = 0; j < m; j++) {
      let s = rhs[j]!;
      for (let k = 0; k < n; k++) s -= G[j * n + k]! * z[k]!;
      mu[j] = s;
    }
    solveSchur(S, m, mu);
    for (let k = 0; k < n; k++) {
      let s = z[k]!;
      for (let j = 0; j < m; j++) s += Y[j * n + k]! * mu[j]!;
      acc[k] = s;
    }
  }

  /**
   * Projects the speeds onto every lock (and keeps held members at their speed): the smallest change in the mass
   * metric. Its kinetic energy ½·δφ̇ᵀMδφ̇ is what the impact turned into heat (Carnot); the newly locked elements
   * share it by their own ½·J_slip·Δω².
   */
  private project(): void {
    const { core, G, Yp, Sp, impulse, impact, dv, cls } = this;
    const { n, massInverse, mass } = core;
    const E = core.elements;
    const ne = E.ids.length;
    const m = this.rows;
    // Yp = M⁻¹Gᵀ, Sp = G·M⁻¹·Gᵀ, impulse = Sp⁻¹(−G·φ̇) for the locks and 0 for the held members.
    for (let j = 0; j < m; j++) {
      for (let r = 0; r < n; r++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += massInverse[r * n + k]! * G[j * n + k]!;
        Yp[j * n + r] = s;
      }
    }
    schur(G, Yp, Sp, m, n);
    for (let e = 0; e < ne; e++) impact[e] = 0;
    let share = 0;
    for (let j = 0; j < m; j++) {
      const e = this.rowElement[j]!;
      let s = 0;
      if (e >= 0) for (let k = 0; k < n; k++) s -= G[j * n + k]! * this.phiDot[k]!;
      impulse[j] = s;
      if (e >= 0 && this.state[e] !== LOCKED) {
        impact[e] = (E.slipInertia[e]! * s * s) / 2;
        share += impact[e]!;
      }
    }
    solveSchur(Sp, m, impulse);
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let j = 0; j < m; j++) s += Yp[j * n + k]! * impulse[j]!;
      dv[k] = s;
    }
    let loss = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) loss += dv[r]! * mass[r * n + c]! * dv[c]!;
    loss /= 2;
    for (let k = 0; k < n; k++) this.phiDot[k]! += dv[k]!;
    for (let e = 0; e < ne; e++) {
      if (cls[e] !== LOCKED || this.state[e] === LOCKED) continue;
      const part = share > 0 ? (loss * impact[e]!) / share : 0;
      this.heat[e]! += part;
      if (E.kind[e] === DOG && Math.sqrt((2 * impact[e]!) / E.slipInertia[e]!) > KNOCK_SLIP) this.events.push({ kind: 'knock', element: e, energyJ: part });
    }
  }
}

/** In-place Cholesky of an n × n symmetric positive definite matrix (lower triangle). False when it is not one. */
function cholesky(a: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j]!;
    for (let k = 0; k < j; k++) d -= a[j * n + k]! * a[j * n + k]!;
    if (!(d > 0)) return false;
    const root = Math.sqrt(d);
    a[j * n + j] = root;
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j]!;
      for (let k = 0; k < j; k++) s -= a[i * n + k]! * a[j * n + k]!;
      a[i * n + j] = s / root;
    }
  }
  return true;
}

/** Solves L·Lᵀ·x = b in place, b at `offset` in `x`. */
function cholSolve(l: Float64Array, n: number, x: Float64Array, offset: number): void {
  for (let i = 0; i < n; i++) {
    let s = x[offset + i]!;
    for (let k = 0; k < i; k++) s -= l[i * n + k]! * x[offset + k]!;
    x[offset + i] = s / l[i * n + i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[offset + i]!;
    for (let k = i + 1; k < n; k++) s -= l[k * n + i]! * x[offset + k]!;
    x[offset + i] = s / l[i * n + i]!;
  }
}

/** S = G·Yᵀ (m × m), with Y holding A⁻¹Gᵀ row by row, regularised on the diagonal. */
function schur(G: Float64Array, Y: Float64Array, S: Float64Array, m: number, n: number): void {
  let top = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += G[i * n + k]! * Y[j * n + k]!;
      S[i * m + j] = s;
      S[j * m + i] = s;
    }
    top = Math.max(top, S[i * m + i]!);
  }
  const eps = REGULARISE * Math.max(top, 1e-300);
  for (let i = 0; i < m; i++) S[i * m + i]! += eps;
}

/** Solves S·x = b in place (S symmetric positive definite after regularisation, factorised in place). */
function solveSchur(S: Float64Array, m: number, x: Float64Array): void {
  if (m === 0) return;
  if (!cholesky(S, m)) {
    // A jammed set of locks can leave S indefinite by rounding: fall back to its diagonal.
    for (let i = 0; i < m; i++) x[i] = 0;
    return;
  }
  cholSolve(S, m, x, 0);
}
