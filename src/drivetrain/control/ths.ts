// The power-split control (stage K15a, research §12), after Toyota's THS: it sets MG1's and MG2's torques, the engine's
// throttle and whether the engine runs, every step, from the driver's pedal and brake. No DOM and no text: it runs on
// the audio thread inside HybridLoad, with plain data built on the main thread (power-split-car.ts).
//
// The strategy is ours [estimates, docs/gearbox-model.md], built on what the sources say the system does:
// - the pedal asks for a share of the torque the system can give at the output: MG2's torque through its reduction
//   plus the engine's share through the ring, and above that the system's power over the output speed;
// - the engine runs when the driver asks for more than MG2 alone should give, above the speed of electric driving,
//   or when the battery needs charge (Toyota: electric from start-up and below 70 km/h unless the driver asks hard);
//   it starts and stops with MG1 turning it, never a starter (EngineRequest.ignition);
// - when it runs it gives the power at the wheels plus what the battery needs, at the lowest speed at which that is
//   LINE_SHARE of its full-load torque (a petrol engine is most efficient near full load), never so slow that MG1
//   would pass its speed limit backward;
// - MG1 holds that engine speed: its torque is the engine's reaction, 30/108 of the engine torque at the sun, plus a
//   PI term on the speed error. Its torque also reaches the output through the ring;
// - MG2 makes up the rest of the asked output torque, within its torque and power and within what the battery can
//   give or take at its state of charge;
// - a road speed cap (the car's limited top speed) takes the asked torque away above the cap, and the brake pedal
//   recovers what MG2 and the battery can take before the friction brakes do the rest.
// Every motor torque is applied as a member torque of the solver; the core's members are the gearbox's (S1, S2).

import type { CrankInput } from '../../engine/load.ts';
import { brakeTorque, type EngineTorqueMap } from '../../engine/torque-map.ts';
import { WHEELS, type WheelBus } from '../../vehicle/wheel-bus.ts';
import { batteryEnergyJ, chargeLimitW, dischargeLimitW, electricPower, mechanicalPower, type BatteryDef } from '../battery.ts';
import type { SplitKinematics } from '../layouts/power-split.ts';
import type { DrivetrainSolver } from '../solver.ts';

const RPM = 30 / Math.PI;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A motor's limits, SI: N·m, W, rad/s. */
export interface MotorLimits {
  maxNm: number;
  maxW: number;
  maxOmega: number;
}

export interface ThsSpec {
  kind: 'ths';
  /** Core member indices of MG1's and MG2's rotors and of the output (the differential case). */
  mg1: number;
  mg2: number;
  output: number;
  kin: SplitKinematics;
  mg1Limits: MotorLimits;
  mg2Limits: MotorLimits;
  battery: BatteryDef;
  /** The engine's torque map: full load and the throttle that gives a torque. */
  map: EngineTorqueMap;
  /** Inertia the engine's speed sees with the output held: crank, damper, carrier and MG1 through the set, kg·m². */
  engineInertia: number;
  /** Engine speeds, rad/s: where MG1 lets it light (near idle), the lowest it runs at, the highest. */
  startOmega: number;
  minOmega: number;
  maxOmega: number;
  /** The engine's operating line: power, W, against the speed it runs at for it, rad/s, rising. */
  lineW: number[];
  lineOmega: number[];
  /** The system's power, W, and the most torque it gives at the output, N·m (MG2 and the engine's share). */
  systemW: number;
  maxOutputNm: number;
  /** Below this road speed it may drive on MG2 alone, m/s. */
  evMaxSpeed: number;
  /** The limited top speed, m/s; null for none. */
  vmaxCap: number | null;
  /** Driven tyres' rolling radius, m, and the car's mass with the driver, kg. */
  radius: number;
  massKg: number;
  /** Brake torque each wheel holds with the pedal floored, N·m (FL, FR, RL, RR). */
  brakeNm: number[];
}

/** The engine runs along a line at this share of its full-load torque [estimate]. */
export const LINE_SHARE = 0.85;
/** The driver's power request above which the engine joins [estimate: "under hard acceleration"], W. */
export const ENGINE_ON_W = 20000;
/** Below this request, for ENGINE_OFF_S, the engine stops again (where the car allows it), W and s. */
const ENGINE_OFF_W = 8000;
const ENGINE_OFF_S = 1;
/** Least power the engine gives while it runs, W [estimate]. */
const ENGINE_MIN_W = 4000;
/** Charge the engine adds per unit of state of charge below the target, W, and the target. */
const CHARGE_W_PER_SOC = 60000;
const SOC_TARGET = 0.6;
/** Below this state of charge the engine runs whatever the driver asks. */
const SOC_LOW = 0.45;
/** MG1's speed loop: bandwidth, rad/s, and damping [estimate]. */
const SPEED_W = 9;
const SPEED_ZETA = 0.9;
/** The engine's speed keeps MG1 within this share of its speed limit, so the speed loop's overshoot stays inside it. */
const MG1_SPEED_SHARE = 0.95;
/** Below this engine speed with the engine not wanted, MG1 lets it come to rest, rad/s. */
const REST_OMEGA = 5;
/** The cap takes this much output torque away per m/s over it, N·m·s/m [estimate: under 1 km/h of droop at 180 km/h]. */
const CAP_GAIN = 2000;
/**
 * Below this road speed recovery fades to nothing and the friction brakes take over, m/s [estimate: hybrids hand the
 * last few km/h to the friction brakes]. Without it the brake pedal asks MG2 for a negative torque at standstill.
 */
const REGEN_FADE_SPEED = 2;
/** Coasting with the foot off, the control recovers as an engine brake would: this share of the weight [estimate]. */
const COAST_G = 0.02;
const G = 9.81;

export type ThsMode = 'ev' | 'starting' | 'hybrid' | 'stopping' | 'standby';

/** What the control asks of the engine for the coming step. */
export interface ThsEngineRequest {
  ignition: boolean;
  throttle: number;
}

export class ThsControl {
  readonly spec: ThsSpec;
  /** The driver's pedal and brake, 0…1. */
  pedal = 0;
  brake = 0;
  /** State of charge, 0…1. */
  soc: number;
  /** The engine is wanted (starting, running or about to). */
  engineOn = false;
  /** False lifts the speed cap: the car's own top speed. */
  capOn = true;
  /** Holds the engine at this speed with this share of its full-load torque, whatever the driver asks (the nomogram, tests); NaN: off. */
  holdOmega = Number.NaN;
  holdShare = 0.4;
  readonly request: ThsEngineRequest = { ignition: false, throttle: 0 };
  /** What the last step set: torques, N·m, speeds, rad/s, battery power, W (positive out of it), the asked output torque, N·m. */
  mg1Nm = 0;
  mg2Nm = 0;
  mg1Omega = 0;
  mg2Omega = 0;
  batteryW = 0;
  outputNm = 0;
  engineTargetOmega = 0;
  mode: ThsMode = 'standby';
  private integral = 0;
  private offTime = 0;
  private readonly energy: number;
  private readonly kp: number;
  private readonly ki: number;
  /** All four brakes at a floored pedal, N·m: what the pedal asks of the motors first. */
  private readonly brakeTotal: number;

  constructor(spec: ThsSpec) {
    this.spec = spec;
    this.soc = spec.battery.socStart;
    this.energy = batteryEnergyJ(spec.battery);
    this.kp = 2 * SPEED_ZETA * SPEED_W * spec.engineInertia;
    this.ki = SPEED_W * SPEED_W * spec.engineInertia;
    this.brakeTotal = spec.brakeNm.reduce((a, b) => a + b, 0);
  }

  /** The speed on the operating line for this engine power, rad/s. */
  lineOmegaFor(powerW: number): number {
    const { lineW, lineOmega } = this.spec;
    if (powerW <= lineW[0]!) return lineOmega[0]!;
    for (let i = 1; i < lineW.length; i++) {
      if (powerW <= lineW[i]!) return lineOmega[i - 1]! + ((lineOmega[i]! - lineOmega[i - 1]!) * (powerW - lineW[i - 1]!)) / (lineW[i]! - lineW[i - 1]!);
    }
    return lineOmega[lineOmega.length - 1]!;
  }

  /** Sets both motors' member torques, the wheels' brakes and the engine request for the coming step. */
  step(s: DrivetrainSolver, bus: WheelBus, input: CrankInput, roadSpeed: number, dt: number): void {
    const sp = this.spec;
    const k = sp.kin;
    const wo = s.memberSpeed(sp.output);
    const w1 = s.memberSpeed(sp.mg1);
    const w2 = s.memberSpeed(sp.mg2);
    const we = input.omega;
    const running = input.state === 'running';
    this.mg1Omega = w1;
    this.mg2Omega = w2;

    // 1. The asked output torque: a share of what the system gives, power-limited above its corner.
    const available = Math.min(sp.maxOutputNm, sp.systemW / Math.max(wo, 1e-3));
    let demand = this.pedal * available;
    // Recovery only slows the car: it fades out towards standstill, so MG2 never pushes a stopping car backward.
    const recover = clamp(roadSpeed / REGEN_FADE_SPEED, 0, 1);
    if (this.pedal < 0.02) demand = -COAST_G * sp.massKg * G * sp.radius * recover;
    if (this.capOn && sp.vmaxCap !== null) demand = Math.min(demand, Math.max(0, CAP_GAIN * (sp.vmaxCap - roadSpeed)));
    // The brake pedal: MG2 recovers first, the friction brakes do the rest (blended below, once MG2's share is known).
    const brakeNm = this.brake * this.brakeTotal;
    const wanted = brakeNm > 0 ? Math.min(demand, 0) - brakeNm : demand;
    if (brakeNm > 0) demand = Math.min(demand, 0) - brakeNm * recover;
    const asked = this.pedal * sp.systemW;
    const wheelW = Math.max(0, demand * wo);

    // 2. Whether the engine runs. MG1 turns backward ever faster as the car goes with the engine stopped: near its
    // speed limit the engine must turn.
    const mg1Stopped = Math.abs(k.mg1[1] * wo);
    const hold = !Number.isNaN(this.holdOmega);
    const must = hold || roadSpeed > sp.evMaxSpeed || this.soc < SOC_LOW || mg1Stopped > 0.9 * sp.mg1Limits.maxOmega;
    if (!this.engineOn && (must || asked > ENGINE_ON_W)) {
      this.engineOn = true;
      this.integral = 0;
    }
    if (this.engineOn && !must && asked < ENGINE_OFF_W && this.soc > SOC_LOW + 0.05 && mg1Stopped < 0.8 * sp.mg1Limits.maxOmega) {
      this.offTime += dt;
      if (this.offTime > ENGINE_OFF_S) {
        this.engineOn = false;
        this.integral = 0;
      }
    } else {
      this.offTime = 0;
    }

    // 3. The engine's speed and torque. MG1's speed limit bounds the engine speed from both sides.
    const mg1Max = MG1_SPEED_SHARE * sp.mg1Limits.maxOmega;
    const floor = (-mg1Max - k.mg1[1] * wo) / k.mg1[0];
    const ceiling = (mg1Max - k.mg1[1] * wo) / k.mg1[0];
    let target = 0;
    let engineNm = 0;
    if (this.engineOn) {
      const charge = clamp(CHARGE_W_PER_SOC * (SOC_TARGET - this.soc), -0.5 * ENGINE_MIN_W, 1000 * sp.battery.maxChargeKw);
      const power = clamp(wheelW + charge, ENGINE_MIN_W, Number.POSITIVE_INFINITY);
      target = hold ? this.holdOmega : this.lineOmegaFor(power);
      target = clamp(Math.max(target, floor, sp.minOmega), sp.minOmega, Math.min(sp.maxOmega, ceiling));
      if (!running) target = Math.max(sp.startOmega, Math.min(target, sp.startOmega * 1.2));
      const full = brakeTorque(sp.map, we * RPM, 1);
      engineNm = hold ? this.holdShare * full : Math.min(full, power / Math.max(we, sp.minOmega));
    }
    this.engineTargetOmega = target;
    this.mode = this.engineOn ? (running ? 'hybrid' : 'starting') : we > REST_OMEGA ? 'stopping' : wo > 0.1 ? 'ev' : 'standby';
    this.request.ignition = this.engineOn;
    this.request.throttle = running && this.engineOn ? this.throttleFor(engineNm, we) : 0;

    // 4. MG1 holds the engine speed: the engine's reaction at the sun plus the speed loop.
    let t1 = 0;
    if (this.engineOn || we > REST_OMEGA) {
      // The speed MG1's resolver sees: the carrier's, from MG1 and the output. Holding the box side of the damper
      // rather than the crank keeps the loop off the damper's own mode, which the crank's speed would feed back.
      const err = target - (w1 - k.mg1[1] * wo) / k.mg1[0];
      this.integral = clamp(this.integral + err * dt, -50, 50);
      t1 = (this.kp * err + this.ki * this.integral - input.engineNm) / k.mg1[0];
    } else {
      this.integral = 0;
    }
    t1 = limitMotor(t1, w1, sp.mg1Limits);

    // 5. MG2 makes up the asked output torque, within its limits and the battery's.
    let t2 = limitMotor((demand - k.mg1[1] * t1) / k.mg2, w2, sp.mg2Limits);
    const p1 = electricPower(t1 * w1);
    const out = dischargeLimitW(sp.battery, this.soc);
    const into = chargeLimitW(sp.battery, this.soc);
    let pb = p1 + electricPower(t2 * w2);
    if ((pb > out || pb < -into) && Math.abs(w2) > 1e-3) {
      t2 = limitMotor(mechanicalPower(clamp(pb, -into, out) - p1) / w2, w2, sp.mg2Limits);
      pb = p1 + electricPower(t2 * w2);
    }
    s.memberTorque[sp.mg1] = t1;
    s.memberTorque[sp.mg2] = t2;
    this.mg1Nm = t1;
    this.mg2Nm = t2;
    this.batteryW = pb;
    this.soc = clamp(this.soc - (pb * dt) / this.energy, 0, 1);
    const delivered = k.mg1[1] * t1 + k.mg2 * t2;
    this.outputNm = delivered;

    // 6. Friction brakes for what the motors did not recover.
    const friction = brakeNm > 0 ? clamp((Math.max(0, -wanted) - Math.max(0, -delivered)) / brakeNm, 0, 1) * this.brake : 0;
    for (let i = 0; i < WHEELS; i++) bus.brakeNm[i] = friction * sp.brakeNm[i]!;
  }

  /** Throttle that gives this engine torque at this speed: the map's charge, linear between shut and full. */
  private throttleFor(nm: number, omega: number): number {
    const rpm = omega * RPM;
    const shut = brakeTorque(this.spec.map, rpm, 0);
    const full = brakeTorque(this.spec.map, rpm, 1);
    return clamp((nm - shut) / Math.max(full - shut, 1e-6), 0, 1);
  }

  /** Numbers in a snapshot. */
  snapshotSize(): number {
    return 10;
  }

  snapshot(out: Float64Array, o: number): void {
    out[o] = this.pedal;
    out[o + 1] = this.brake;
    out[o + 2] = this.soc;
    out[o + 3] = this.engineOn ? 1 : 0;
    out[o + 4] = this.capOn ? 1 : 0;
    out[o + 5] = this.holdOmega;
    out[o + 6] = this.holdShare;
    out[o + 7] = this.integral;
    out[o + 8] = this.offTime;
    out[o + 9] = this.request.throttle;
  }

  restore(from: Float64Array, o: number): void {
    this.pedal = from[o]!;
    this.brake = from[o + 1]!;
    this.soc = from[o + 2]!;
    this.engineOn = from[o + 3]! === 1;
    this.capOn = from[o + 4]! === 1;
    this.holdOmega = from[o + 5]!;
    this.holdShare = from[o + 6]!;
    this.integral = from[o + 7]!;
    this.offTime = from[o + 8]!;
    this.request.throttle = from[o + 9]!;
    this.request.ignition = this.engineOn;
  }
}

/** A motor torque within its torque and its power at this speed. */
export function limitMotor(nm: number, omega: number, m: MotorLimits): number {
  const byPower = m.maxW / Math.max(Math.abs(omega), 1e-6);
  const lim = Math.min(m.maxNm, byPower);
  return clamp(nm, -lim, lim);
}
