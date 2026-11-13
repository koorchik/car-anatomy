// Quarter car through the corner's real kinematics: the body over one corner and the wheel, joined by the spring,
// damper and stops through their motion ratios from the tables, on a vertical tyre that never pulls.
//
//   m_s·z̈_b = S − m_s·g
//   m_u·ẅ   = F_z − S − m_u·g,              q = w − w₀ − z_b
//   S = F_spring(L_s(q))·mr_s(q) + [F_damper(−mr_d·q̇) + F_stops(L_d(q))]·mr_d(q)
//   F_z = max(0, k_t·δ + c_t·δ̇),  δ = r − (w − y_road(x))
//
// z_b is the body's height relative to design, w the wheel centre's height above the road datum. Fixed step 1 ms,
// semi-implicit Euler (velocities from forces, then positions from the new velocities); RK4 is here as the reference
// the tests hold it to. Nothing is allocated in a step.

import type { ResolvedCorner } from './setup.ts';
import { bumpStopForce, coilForce, damperForce, G, tyreNormalForce } from './forces.ts';

/** The road as the quarter car reads it: enveloped height and its slope at x (RoadBuffer, or a plain function). */
export interface RoadInput {
  heightAt(x: number): number;
  slopeAt(x: number): number;
}

export const FLAT_ROAD: RoadInput = { heightAt: () => 0, slopeAt: () => 0 };

/** Fixed physics step, s. */
export const QUARTER_STEP_S = 0.001;

/** What one step leaves behind for the 3D, the arrows and the strip chart. Forces in N, along their own axes. */
export interface QuarterOut {
  t: number;
  /** Wheel position along the road, m. */
  x: number;
  roadZ: number;
  /** Body height relative to design, wheel centre above the road datum, travel; m. */
  bodyZ: number;
  wheelZ: number;
  travel: number;
  bodyAcc: number;
  wheelAcc: number;
  tyreN: number;
  springN: number;
  damperN: number;
  /** Bump stop (positive) or top-out stop (negative), along the damper. */
  stopN: number;
  /** Damper speed, m/s (positive in rebound). */
  damperV: number;
  /** Support force on the body: everything the corner pushes up with, N. */
  supportN: number;
  inAir: boolean;
}

const STATE = 4; // zb, vb, w, vw

export class QuarterSim {
  readonly corner: ResolvedCorner;
  road: RoadInput;
  /** Forward speed, m/s. */
  speed: number;
  t = 0;
  x = 0;
  /** [z_b, v_b, w, v_w] */
  readonly state = new Float64Array(STATE);
  readonly out: QuarterOut = {
    t: 0, x: 0, roadZ: 0, bodyZ: 0, wheelZ: 0, travel: 0, bodyAcc: 0, wheelAcc: 0, tyreN: 0, springN: 0, damperN: 0,
    stopN: 0, damperV: 0, supportN: 0, inAir: false,
  };
  private readonly w0: number;
  private readonly ms: number;
  private readonly mu: number;
  private readonly kt: number;
  private readonly ct: number;
  private readonly r: number;
  // Tables, read directly for speed.
  private readonly t0: number;
  private readonly dq: number;
  private readonly nMax: number;
  private readonly springLen: Float64Array;
  private readonly mrS: Float64Array;
  private readonly damperLen: Float64Array;
  private readonly mrD: Float64Array;
  // RK4 scratch
  private readonly k1 = new Float64Array(STATE);
  private readonly k2 = new Float64Array(STATE);
  private readonly k3 = new Float64Array(STATE);
  private readonly k4 = new Float64Array(STATE);
  private readonly tmp = new Float64Array(STATE);

  constructor(corner: ResolvedCorner, road: RoadInput = FLAT_ROAD, speedMs = 0) {
    this.corner = corner;
    this.road = road;
    this.speed = speedMs;
    this.w0 = corner.axle.spec.wheelCentre[2];
    this.ms = corner.sprungKg;
    this.mu = corner.unsprungKg;
    this.kt = corner.tyre.kt;
    this.ct = corner.tyre.ct;
    this.r = corner.tyre.freeRadiusM;
    const table = corner.axle.table;
    this.t0 = table.travel0;
    this.dq = table.step;
    this.nMax = table.n - 2;
    this.springLen = table.fields.springLen;
    this.mrS = table.fields.mrSpring;
    this.damperLen = table.fields.damperLen;
    this.mrD = table.fields.mrDamper;
    this.reset(0);
  }

  /** Puts the corner at rest at road position x (on whatever road is there). */
  reset(x: number): void {
    this.t = 0;
    this.x = x;
    const c = this.corner;
    const roadZ = this.road.heightAt(x);
    this.state[0] = c.bodyStaticM + roadZ;
    this.state[1] = 0;
    this.state[2] = c.wheelCentreZM + roadZ;
    this.state[3] = 0;
    this.derivs(this.state, x, this.tmp, true);
  }

  /**
   * Accelerations for state `s` at road position x into d = [v_b, a_b, v_w, a_w]. With `record`, also fills `out`.
   */
  derivs(s: Float64Array, x: number, d: Float64Array, record: boolean): void {
    const zb = s[0];
    const vb = s[1];
    const w = s[2];
    const vw = s[3];
    const q = w - this.w0 - zb;
    const qd = vw - vb;
    // Table read: linear, extrapolated past the ends.
    let u = (q - this.t0) / this.dq;
    let i = Math.floor(u);
    if (i < 0) i = 0;
    else if (i > this.nMax) i = this.nMax;
    u -= i;
    const Ls = this.springLen[i] + (this.springLen[i + 1] - this.springLen[i]) * u;
    const mrS = this.mrS[i] + (this.mrS[i + 1] - this.mrS[i]) * u;
    const Ld = this.damperLen[i] + (this.damperLen[i + 1] - this.damperLen[i]) * u;
    const mrD = this.mrD[i] + (this.mrD[i + 1] - this.mrD[i]) * u;
    const c = this.corner;
    const sp = c.spring;
    const Fs = coilForce(sp.rate, sp.freeM, Ls, sp.rate2, sp.fromM);
    const vd = -mrD * qd;
    const Fd = damperForce(vd, c.damper);
    const bs = c.bumpStop;
    const Fstop =
      Ld < bs.contactM
        ? bumpStopForce(bs.contactM - Ld, bs.rate, bs.lengthM)
        : Ld > c.topOutM
          ? -bumpStopForce(Ld - c.topOutM, bs.rate, bs.lengthM)
          : 0;
    const S = Fs * mrS + (Fd + Fstop) * mrD;
    const roadZ = this.road.heightAt(x);
    const defl = this.r - (w - roadZ);
    const deflRate = this.road.slopeAt(x) * this.speed - vw;
    const Fz = tyreNormalForce(defl, deflRate, this.kt, this.ct);
    const ab = S / this.ms - G;
    const aw = (Fz - S) / this.mu - G;
    d[0] = vb;
    d[1] = ab;
    d[2] = vw;
    d[3] = aw;
    if (record) {
      const o = this.out;
      o.t = this.t;
      o.x = x;
      o.roadZ = roadZ;
      o.bodyZ = zb;
      o.wheelZ = w;
      o.travel = q;
      o.bodyAcc = ab;
      o.wheelAcc = aw;
      o.tyreN = Fz;
      o.springN = Fs;
      o.damperN = Fd;
      o.stopN = Fstop;
      o.damperV = vd;
      o.supportN = S;
      o.inAir = Fz === 0;
    }
  }

  /**
   * One semi-implicit Euler step of `h` seconds. `out` describes the state the step started from (the forces that
   * moved it), so peaks read from it are the ones the integrator used.
   */
  step(h = QUARTER_STEP_S): void {
    const s = this.state;
    const d = this.tmp;
    this.derivs(s, this.x, d, true);
    s[1] += h * d[1];
    s[3] += h * d[3];
    s[0] += h * s[1];
    s[2] += h * s[3];
    this.x += h * this.speed;
    this.t += h;
  }

  /** One classic Runge-Kutta step: the reference for the tests, not for the page. `out` is left at the step's start. */
  stepRk4(h: number): void {
    const s = this.state;
    const tmp = this.tmp;
    const x = this.x;
    const v = this.speed;
    this.derivs(s, x, this.k1, true);
    for (let i = 0; i < STATE; i++) tmp[i] = s[i] + (h / 2) * this.k1[i];
    this.derivs(tmp, x + (h / 2) * v, this.k2, false);
    for (let i = 0; i < STATE; i++) tmp[i] = s[i] + (h / 2) * this.k2[i];
    this.derivs(tmp, x + (h / 2) * v, this.k3, false);
    for (let i = 0; i < STATE; i++) tmp[i] = s[i] + h * this.k3[i];
    this.derivs(tmp, x + h * v, this.k4, false);
    for (let i = 0; i < STATE; i++) s[i] += (h / 6) * (this.k1[i] + 2 * this.k2[i] + 2 * this.k3[i] + this.k4[i]);
    this.x += h * v;
    this.t += h;
  }

  /** Fills `out` for the current state without stepping. */
  observe(): QuarterOut {
    this.derivs(this.state, this.x, this.tmp, true);
    return this.out;
  }
}
