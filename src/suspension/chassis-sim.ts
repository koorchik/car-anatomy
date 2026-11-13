// The car as a body and four wheels in the prescribed mode (suspensions plan, the car on four wheels): the
// lateral acceleration is given, and the tyres make exactly the side force it takes. Seven degrees of freedom: heave z
// of the sprung centre of mass (from design), roll φ (left side up positive) and pitch θ (nose down positive) of the
// body, small angles, and the heights w_i of the four wheel centres above the road. Corners FL, FR, RL, RR.
//
//   body over corner i:  z_ci = z + y_i·φ − (x_i − x_s)·θ,      travel q_i = w_i − W_i − z_ci
//   m_s·z̈  = Σ S_i − m_s·g
//   I_xx·φ̈ = Σ S_i·(C_y,i + φ·h) + h·Σ F_y,i − Σ m_u,i·a_y·(h − w_i)
//   I_yy·θ̈ = −Σ S_i·(C_x,i − x_s − θ·h)
//   m_u,i·ẅ_i = F_z,i − S_i − m_u,i·g,      F_z,i = max(0, k_t·δ_i + c_t·δ̇_i)
//
// with h = h_s + z the sprung centre of mass above the road, x_s its distance ahead of the whole car's, W_i the wheel
// centre's height at design and C_y,i, C_x,i the contact point in the CG frame at the corner's travel. m_s, h_s, x_s,
// I_xx and I_yy are the sprung body's (chassis.ts).
//
// S_i is everything corner i pushes the body up with: the elastic part (springs, dampers, stops, the anti-roll bar and
// a twist beam's torsion, each through its own motion ratio, on a beam also through the other wheel's travel), and the
// part the links make from the side forces, which needs no travel:
//   S_i = S_el,i − Σ_j F_y,j·∂C_y,j/∂q_i + Σ_j m_u,j·a_y·∂W_y,j/∂q_i      (j over the wheels of the axle)
// That is virtual work: a side force at the contact point and the unsprung mass's own inertia at the wheel centre
// push on the travel coordinate with the slopes of the points they act at (tanβ and tanβ_WC); the wheel takes the same
// with the other sign. With all of it on the body, the roll moment of the side forces is h′·m_s·a_y, as Milliken's
// three-term split has it.
//
// The vertical forces act on the body along lines through the contact patches, which the tyres hold on the road: so
// their arm about the sprung centre of mass is the contact point's lateral offset at the corner's travel plus h·φ.
// When the body rolls, its centre of mass moves out over the contact patches by h′·φ, and the weight's moment about
// them grows (the pendulum term of the roll gradient m_s·h′/(ΣK_φ − m_s·g·h′)). The side force acts at the road, the
// unsprung mass's inertia at its wheel centre.
//
// The prescribed side forces: each axle takes its share of m·a_y (the front b/L, so the car does not yaw), shared
// between its two wheels in proportion to their loads. A wheel off the road takes none. Longitudinal forces come with
// stage P9-core.
//
// Fixed step 1 ms, semi-implicit Euler as in quarter.ts; a step makes no objects (chassis-axle.ts writes its samples by
// name for that).
//
// The tyres here make whatever side force a_y asks, so a car pushed past what it can hold goes over: with both wheels
// of one side off the road, gravity's moment about the outer contact patches falls as the body tips while the side
// force's grows, and the roll runs away (a 1.1 g step does it to the typical hot hatch, whose rigid limit t/2h is
// 1.3 g). Past ROLLOVER_RAD the small-angle model no longer holds, so the simulation stops there and says so
// (`rolledOver`) instead of rolling through 90° into nonsense and NaN. Whether real tyres would let go first is for the
// wheel's force limit (stage P9-core) and the designer's rollover diagnosis.

import type { Chassis } from './chassis.ts';
import { newWheelSample, type WheelSample } from './chassis-axle.ts';
import { bumpStopForce, coilForce, damperForce, G, tyreNormalForce } from './forces.ts';

/** Fixed physics step, s. */
export const CHASSIS_STEP_S = 0.001;

/** Positions: z, φ, θ, w_FL, w_FR, w_RL, w_RR. */
export const CHASSIS_DOF = 7;

/** Body roll over the road past which the car is on two wheels and going over, rad (20°): the typical cars that
 *  recover from lifting both inner wheels after a 1 g step roll 13° at most, and none comes back from here. */
export const ROLLOVER_RAD = 0.35;

/** What one evaluation leaves behind, per corner in the order FL, FR, RL, RR. Forces in N. */
export interface ChassisOut {
  t: number;
  ay: number;
  /** Heave of the sprung centre of mass from design, m; roll and pitch, rad; and their accelerations. */
  z: number;
  roll: number;
  pitch: number;
  zAcc: number;
  rollAcc: number;
  pitchAcc: number;
  /** Travel and its rate, wheel centre height and its acceleration. */
  travel: Float64Array;
  travelRate: Float64Array;
  wheelZ: Float64Array;
  wheelAcc: Float64Array;
  /** Tyre: vertical and side force. */
  fz: Float64Array;
  fy: Float64Array;
  /** Camber relative to the body and to the road, rad (positive top out). */
  camber: Float64Array;
  camberRoad: Float64Array;
  /** Along their own axes: spring, damper, bump or top-out stop (negative). */
  springN: Float64Array;
  damperN: Float64Array;
  stopN: Float64Array;
  /** Pushing the body up at the corner: the bar, a twist beam's torsion, everything elastic together, and what the
   *  links make from the side forces (S_i = elastic + links). */
  barN: Float64Array;
  beamN: Float64Array;
  elasticN: Float64Array;
  linksN: Float64Array;
  supportN: Float64Array;
  /** The links' part split as Milliken does: carrying the sprung mass's side force, and the unsprung mass's (its
   *  inertia at the wheel centre and its share of the tyre's side force). */
  geometricN: Float64Array;
  unsprungN: Float64Array;
  /** Twist of each axle's bar, rad (left link up positive). */
  barTwist: Float64Array;
  inAir: Uint8Array;
}

const f4 = (): Float64Array => new Float64Array(4);

export const newChassisOut = (): ChassisOut => ({
  t: 0, ay: 0, z: 0, roll: 0, pitch: 0, zAcc: 0, rollAcc: 0, pitchAcc: 0,
  travel: f4(), travelRate: f4(), wheelZ: f4(), wheelAcc: f4(), fz: f4(), fy: f4(), camber: f4(), camberRoad: f4(),
  springN: f4(), damperN: f4(), stopN: f4(), barN: f4(), beamN: f4(), elasticN: f4(), linksN: f4(), supportN: f4(),
  geometricN: f4(), unsprungN: f4(), barTwist: new Float64Array(2), inAir: new Uint8Array(4),
});

export class ChassisSim {
  readonly chassis: Chassis;
  /** Lateral acceleration of the car, m/s² (positive to the left: a left turn). */
  ay = 0;
  t = 0;
  /** The body rolled past ROLLOVER_RAD (or its state stopped being finite): step() stands still until reset(). */
  rolledOver = false;
  /** Positions and velocities: z, φ, θ, w_FL, w_FR, w_RL, w_RR. */
  readonly pos = new Float64Array(CHASSIS_DOF);
  readonly vel = new Float64Array(CHASSIS_DOF);
  /** Road height under each wheel and its rate, m and m/s, set by the caller (0 on a flat road). */
  readonly road = f4();
  readonly roadRate = f4();
  readonly out: ChassisOut = newChassisOut();
  private readonly acc = new Float64Array(CHASSIS_DOF);
  private readonly samples: readonly WheelSample[] = [newWheelSample(), newWheelSample(), newWheelSample(), newWheelSample()];
  private readonly q = f4();
  private readonly qd = f4();
  private readonly fs = f4();
  private readonly fd = f4();
  private readonly fst = f4();
  private readonly sEl = f4();
  private readonly sJ = f4();
  private readonly sG = f4();
  private readonly sU = f4();

  constructor(chassis: Chassis) {
    this.chassis = chassis;
    this.reset();
  }

  /** Puts the car at rest on a flat road with no side force. */
  reset(): void {
    const r = this.chassis.rest;
    this.t = 0;
    this.ay = 0;
    this.rolledOver = false;
    this.road.fill(0);
    this.roadRate.fill(0);
    this.vel.fill(0);
    this.pos[0] = r.z;
    this.pos[1] = 0;
    this.pos[2] = r.pitch;
    for (let i = 0; i < 4; i++) this.pos[3 + i] = r.wheelZ[i];
    this.accelerations(this.pos, this.vel, this.acc, true);
  }

  /**
   * Accelerations of positions `p` and velocities `v` into `a` (the same layout). With `record`, also fills `out`.
   * Makes no objects.
   */
  accelerations(p: Float64Array, v: Float64Array, a: Float64Array, record: boolean): void {
    const c = this.chassis;
    const sb = c.sprung;
    const xs = sb.cgX;
    const z = p[0];
    const phi = p[1];
    const theta = p[2];
    const ay = this.ay;
    const { q, qd, fs, fd, fst, sEl, sJ, sG, sU, samples } = this;
    const o = this.out;
    const fz = o.fz;
    const fy = o.fy;
    // Travels and tyres.
    for (let i = 0; i < 4; i++) {
      const k = c.corners[i];
      const dx = k.x - xs;
      const zc = z + k.y * phi - dx * theta;
      const zcd = v[0] + k.y * v[1] - dx * v[2];
      q[i] = p[3 + i] - k.designWheelZM - zc;
      qd[i] = v[3 + i] - zcd;
      const defl = k.tyre.freeRadiusM - (p[3 + i] - this.road[i]);
      fz[i] = tyreNormalForce(defl, this.roadRate[i] - v[3 + i], k.tyre.kt, k.tyre.ct);
    }
    // Elastic support and the links' share, axle by axle.
    for (let ax = 0; ax < 2; ax++) {
      const iL = 2 * ax;
      const iR = iL + 1;
      const L = samples[iL];
      const R = samples[iR];
      c.axles[ax].sample(q[iL], q[iR], L, R);
      this.springAndStop(iL, L);
      this.springAndStop(iR, R);
      // Damper speeds dL/dt = −(mr·q̇_own + mrX·q̇_other).
      fd[iL] = damperForce(-(L.mrDamper * qd[iL] + L.mrDamperCross * qd[iR]), c.corners[iL].damper);
      fd[iR] = damperForce(-(R.mrDamper * qd[iR] + R.mrDamperCross * qd[iL]), c.corners[iR].damper);
      const eL = fd[iL] + fst[iL];
      const eR = fd[iR] + fst[iR];
      // Bar: twist (z_L − z_R)/arm, torque K·twist; on travel i it pushes the body up with T·∂twist/∂q_i.
      const bar = c.bars[ax];
      const twist = (L.barZ - R.barZ) / bar.armM;
      const torque = bar.rate * twist;
      const barL = (torque * (L.mrBar - R.mrBarCross)) / bar.armM;
      const barR = (torque * (L.mrBarCross - R.mrBar)) / bar.armM;
      // Twist beam: k·τ·∂τ/∂q_i.
      const kb = c.beamTorsion[ax];
      const beamL = kb * L.beamTwist * L.twistRate;
      const beamR = kb * R.beamTwist * R.twistRate;
      sEl[iL] = fs[iL] * L.mrSpring + fs[iR] * R.mrSpringCross + eL * L.mrDamper + eR * R.mrDamperCross + barL + beamL;
      sEl[iR] = fs[iR] * R.mrSpring + fs[iL] * L.mrSpringCross + eR * R.mrDamper + eL * L.mrDamperCross + barR + beamR;
      // Side forces: the axle's share of m·a_y, by load.
      const fyAxle = c.massKg * ay * c.lateralShare[ax];
      const load = fz[iL] + fz[iR];
      fy[iL] = load > 0 ? (fyAxle * fz[iL]) / load : 0;
      fy[iR] = load > 0 ? (fyAxle * fz[iR]) / load : 0;
      const mu = c.corners[iL].unsprungKg;
      // Of each wheel's side force, the unsprung mass takes m_u·a_y; the rest carries the body.
      const sprungShare = fyAxle !== 0 ? 1 - (2 * mu * ay) / fyAxle : 1;
      const tyreL = -(fy[iL] * L.tanBeta + fy[iR] * R.tanBetaCross);
      const tyreR = -(fy[iR] * R.tanBeta + fy[iL] * L.tanBetaCross);
      const wcL = mu * ay * (L.tanBetaWC + R.tanBetaWCCross);
      const wcR = mu * ay * (R.tanBetaWC + L.tanBetaWCCross);
      sJ[iL] = tyreL + wcL;
      sJ[iR] = tyreR + wcR;
      sG[iL] = tyreL * sprungShare;
      sG[iR] = tyreR * sprungShare;
      sU[iL] = sJ[iL] - sG[iL];
      sU[iR] = sJ[iR] - sG[iR];
      if (record) {
        o.barN[iL] = barL;
        o.barN[iR] = barR;
        o.beamN[iL] = beamL;
        o.beamN[iR] = beamR;
        o.barTwist[ax] = twist;
      }
    }
    // Body and wheels.
    const h = sb.cgHeightM + z;
    let sumS = 0;
    let roll = 0;
    let pitch = 0;
    let sumFy = 0;
    let unsprungRoll = 0;
    for (let i = 0; i < 4; i++) {
      const k = c.corners[i];
      const s = samples[i];
      const S = sEl[i] + sJ[i];
      sumS += S;
      roll += S * (s.contactY + phi * h);
      pitch -= S * (c.axleX[k.axle] + s.contactX - xs - theta * h);
      sumFy += fy[i];
      unsprungRoll += k.unsprungKg * ay * (h - p[3 + i]);
      a[3 + i] = (fz[i] - S) / k.unsprungKg - G;
    }
    roll += h * sumFy - unsprungRoll;
    a[0] = sumS / sb.massKg - G;
    a[1] = roll / sb.ixx;
    a[2] = pitch / sb.iyy;
    if (record) {
      o.t = this.t;
      o.ay = ay;
      o.z = z;
      o.roll = phi;
      o.pitch = theta;
      o.zAcc = a[0];
      o.rollAcc = a[1];
      o.pitchAcc = a[2];
      for (let i = 0; i < 4; i++) {
        const s = samples[i];
        const left = c.corners[i].side === 'left';
        o.travel[i] = q[i];
        o.travelRate[i] = qd[i];
        o.wheelZ[i] = p[3 + i];
        o.wheelAcc[i] = a[3 + i];
        o.camber[i] = s.camber;
        // Roll tilts the body's vertical toward −y: in on the left wheel, out on the right one.
        o.camberRoad[i] = left ? s.camber - phi : s.camber + phi;
        o.springN[i] = fs[i];
        o.damperN[i] = fd[i];
        o.stopN[i] = fst[i];
        o.elasticN[i] = sEl[i];
        o.linksN[i] = sJ[i];
        o.geometricN[i] = sG[i];
        o.unsprungN[i] = sU[i];
        o.supportN[i] = sEl[i] + sJ[i];
        o.inAir[i] = fz[i] === 0 ? 1 : 0;
      }
    }
  }

  /** Spring force and stop force of corner i at its sample, into this.fs and this.fst. */
  private springAndStop(i: number, s: WheelSample): void {
    const k = this.chassis.corners[i];
    this.fs[i] = coilForce(k.spring.rate, k.spring.freeM, s.springLen, k.spring.rate2, k.spring.fromM);
    const b = k.bumpStop;
    this.fst[i] =
      s.damperLen < b.contactM
        ? bumpStopForce(b.contactM - s.damperLen, b.rate, b.lengthM)
        : s.damperLen > k.topOutM
          ? -bumpStopForce(s.damperLen - k.topOutM, b.rate, b.lengthM)
          : 0;
  }

  /**
   * One semi-implicit Euler step of `h` seconds. `out` describes the state the step started from (the forces that
   * moved it). Does nothing once the car has rolled over.
   */
  step(h = CHASSIS_STEP_S): void {
    if (this.rolledOver) return;
    const { pos, vel, acc } = this;
    this.accelerations(pos, vel, acc, true);
    for (let i = 0; i < CHASSIS_DOF; i++) {
      vel[i] += h * acc[i];
      pos[i] += h * vel[i];
    }
    this.t += h;
    // Written so that NaN counts as rolled over too.
    if (!(Math.abs(pos[1]) <= ROLLOVER_RAD)) this.rolledOver = true;
  }

  /** Fills `out` for the current state without stepping. */
  observe(): ChassisOut {
    this.accelerations(this.pos, this.vel, this.acc, true);
    return this.out;
  }
}
