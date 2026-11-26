// A scripted drive of a catalogue car with the real engine on its drivetrain (stage K2c): start and idle, pull away in
// first, full throttle with an upshift near the power peak into every gear up to the top one, then lift, brake to a
// stop, neutral and idle again. scripts/render-audio.ts renders it (`--drive`), the tests drive it without sound.
//
// The driver is a quick, clean one [our protocol, estimates]: before each upshift the foot comes off in LIFT_S, then
// the lever moves and the auto clutch does the rest (control/manual.ts); the throttle comes back over the clutch's
// closing time. In the low gears the driver knows the car: the pedal gives no more engine torque than the driven tyres
// take at GRIP_SHARE of their peak (the map's torque inverted at the present speed), so the pull-away does not end in
// smoke. A driver who answered the wheels' slip instead would chase the first gear's shunt (3 Hz). The slip still
// counts, slowly, as the dynamic run's driver feels it (runs.ts), for a road the feed-forward does not know.
//
// Each shift is recorded with the engine speed the drop should reach: the speed at the lever times the ratio of the
// new gear to the old (the classic shift drop), and the same scaled by the road speed the car gained or lost while the
// clutch was open. Scripts and tests only: it reads the car records.

import type { EngineSim } from '../engine/sim.ts';
import { brakeTorque, mapValue } from '../engine/torque-map.ts';
import { drivingMassKg } from '../vehicle/car.ts';
import { G } from '../vehicle/constants.ts';
import { longitudinalOf } from '../vehicle/tyre.ts';
import type { VehicleLoad } from '../vehicle/vehicle-load.ts';
import type { CarDrive } from './car-model.ts';
import { CLOSE_S } from './control/manual.ts';
import { inputForForce, slipFor } from './runs.ts';
import { LOCKED } from './solver.ts';

export interface StoryOptions {
  /** Idle before the first gear, s. */
  idleS: number;
  /** Upshift at this engine speed, rpm. */
  shiftRpm: number;
  /** Full throttle in the top gear, s. */
  topS: number;
  /** Brake pedal, 0…1, from TOP to the stop. */
  brake: number;
  /** Idle in neutral at the end, s. */
  endIdleS: number;
}

/** About the S14's power peak (6750 rpm) and 750 rpm under its limiter; a rule of thumb for any engine below. */
export const defaultStory = (cd: CarDrive): StoryOptions => ({
  idleS: 2.5,
  shiftRpm: Math.round((cd.map.limitRpm * 0.9) / 100) * 100,
  topS: 3,
  brake: 0.55,
  endIdleS: 2,
});

/** The foot comes off before an upshift in this time, s [estimate]. */
export const LIFT_S = 0.1;
/** The lever waits this long in first before the pull-away, s [estimate]. */
const SETTLE_S = 0.4;
/** The driver's foot follows what they want with this time constant, s [estimate]. */
const FOOT_S = 0.08;
/** Below this road speed the driver allows the slip of this speed, m/s: the tyre's low-speed range (runs.ts). */
const SLIP_SPEED = 3;
const RPM = 30 / Math.PI;
/** Share of the driven tyres' peak force the driver's foot asks for [estimate]. */
const GRIP_SHARE = 0.95;
/** The driver feels the wheels' slip over this time, s [estimate]: slower than the shunt, so it does not chase it. */
const FEEL_S = 0.3;

export type StoryPhase = 'start' | 'idle' | 'select' | 'pull' | 'lift' | 'shift' | 'brake' | 'stopped' | 'done';

export interface ShiftRecord {
  from: string;
  to: string;
  /** When the lever moved, s, the engine speed then, rpm, and the road speed, m/s. */
  t: number;
  rpmBefore: number;
  speedBefore: number;
  /** rpmBefore · i_new / i_old. */
  rpmDrop: number;
  /** When the clutch locked in the new gear, s, the engine speed then, rpm, and the road speed, m/s; null until then. */
  tLocked: number | null;
  rpmLocked: number | null;
  speedLocked: number | null;
  /** rpmDrop · speedLocked / speedBefore: the drop with the road speed the car gained or lost while the clutch was open. */
  rpmAtLock: number | null;
  /** The driven wheels' speed through the final drive and the new gear at the lock, rpm: the tyres' slip included. */
  rpmWheels: number | null;
}

export class DriveStory {
  readonly cd: CarDrive;
  readonly load: VehicleLoad;
  readonly sim: EngineSim;
  readonly o: StoryOptions;
  phase: StoryPhase = 'start';
  time = 0;
  readonly shifts: ShiftRecord[] = [];
  /** Highest road speed, m/s. */
  topSpeed = 0;
  private phaseTime = 0;
  private gear = 0;
  private want = 0;
  /** The wheels' slip as the driver feels it, over the allowed slip. */
  private felt = 0;
  private readonly peakSlip: number;
  private readonly tyre;

  constructor(cd: CarDrive, load: VehicleLoad, sim: EngineSim, o: StoryOptions = defaultStory(cd)) {
    this.cd = cd;
    this.load = load;
    this.sim = sim;
    this.o = o;
    const share = cd.car.drive === 'fwd' ? cd.car.body.frontShare : 1 - cd.car.body.frontShare;
    this.peakSlip = slipFor(cd, Number.POSITIVE_INFINITY, (drivingMassKg(cd.car) * G * share) / 2);
    this.tyre = longitudinalOf(cd.tyre);
  }

  get done(): boolean {
    return this.phase === 'done';
  }

  private to(phase: StoryPhase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  private gearName(i: number): string {
    return this.cd.gears[i]!.name;
  }

  /**
   * The most pedal the driver gives: what makes the engine torque the driven tyres take at GRIP_SHARE of their peak
   * in this gear, eased while the felt slip is past the peak slip (runs.ts easing).
   */
  private grip(): number {
    const { load, cd, sim } = this;
    const bus = load.vehicle.bus;
    let force = 0;
    for (const i of cd.driven) force += GRIP_SHARE * this.tyre.peakMu(bus.fz[i]!) * bus.fz[i]! * bus.surfaceMu[i]!;
    const gear = cd.gears[this.gear]!;
    const wheel = cd.driven.reduce((s, i) => s + bus.omega[i]!, 0) / cd.driven.length;
    const torque = inputForForce(cd, gear, force, wheel * cd.axle.ratio * gear.ratio);
    // The pedal that gives that torque at the present speed (LoadedCrank: charge = pedal × the steady boost ratio);
    // brakeTorque rises with the charge, so bisect.
    const ratio = mapValue(cd.map, cd.map.pressureRatio, sim.rpm);
    const at = (pedal: number) => brakeTorque(cd.map, sim.rpm, pedal * ratio);
    let lo = 0;
    let hi = 1;
    if (at(1) <= torque) lo = 1;
    else {
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < torque) lo = mid;
        else hi = mid;
      }
    }
    return lo * Math.max(0, Math.min(1, 2 - this.felt));
  }

  private feel(dt: number): void {
    const { load, cd } = this;
    const bus = load.vehicle.bus;
    const v = load.chassis.v;
    const slip = cd.driven.reduce((s, i) => s + bus.omega[i]! * cd.radius[i]!, 0) / cd.driven.length - v;
    this.felt += (slip / (this.peakSlip * Math.max(v, SLIP_SPEED)) - this.felt) * Math.min(1, dt / FEEL_S);
  }

  /** Acts for the coming step of dt: the pedal, the lever and the brake. */
  drive(dt: number): void {
    const { load, sim, o, cd } = this;
    const control = load.control;
    const solver = load.vehicle.solver;
    const v = load.chassis.v;
    this.topSpeed = Math.max(this.topSpeed, v);
    const command = (gear: string) => load.command({ kind: 'vehicle', action: 'gear', gear });
    switch (this.phase) {
      case 'start':
        sim.start();
        this.to('idle');
        break;
      case 'idle':
        this.want = 0;
        if (this.phaseTime >= o.idleS) {
          command(this.gearName(0));
          this.gear = 0;
          this.to('select');
        }
        break;
      case 'select':
        if (control.gearIn(solver) === this.gearName(0) && this.phaseTime >= SETTLE_S) this.to('pull');
        break;
      case 'pull': {
        const top = this.gear === cd.gears.length - 1;
        this.want = Math.min(this.grip(), this.want + dt / CLOSE_S);
        if (!top && sim.rpm >= o.shiftRpm) this.to('lift');
        else if (top && this.phaseTime >= o.topS) this.to('brake');
        break;
      }
      case 'lift':
        this.want = 0;
        if (this.phaseTime >= LIFT_S) {
          const from = cd.gears[this.gear]!;
          const to = cd.gears[this.gear + 1]!;
          this.shifts.push({
            from: from.name, to: to.name, t: this.time, rpmBefore: sim.rpm, speedBefore: v, rpmDrop: (sim.rpm * to.ratio) / from.ratio,
            tLocked: null, rpmLocked: null, speedLocked: null, rpmAtLock: null, rpmWheels: null,
          });
          this.gear++;
          command(to.name);
          this.to('shift');
        }
        break;
      case 'shift': {
        // The foot comes back as the clutch comes up, over its closing time.
        if (control.phase === 'closing' || control.phase === 'engaged') this.want = Math.min(this.grip(), this.want + dt / CLOSE_S);
        const rec = this.shifts.at(-1)!;
        if (solver.state[control.spec.clutch] === LOCKED && control.phase !== 'shifting' && control.phase !== 'opening') {
          rec.tLocked = this.time;
          rec.rpmLocked = sim.rpm;
          rec.speedLocked = v;
          rec.rpmAtLock = (rec.rpmDrop * v) / rec.speedBefore;
          const bus = load.vehicle.bus;
          const wheel = cd.driven.reduce((sum, i) => sum + bus.omega[i]!, 0) / cd.driven.length;
          rec.rpmWheels = wheel * cd.axle.ratio * cd.gears[this.gear]!.ratio * RPM;
          this.to('pull');
        }
        break;
      }
      case 'brake':
        this.want = 0;
        if (this.phaseTime >= 0.3) load.command({ kind: 'vehicle', action: 'brake', value: o.brake });
        if (this.phaseTime > 0.3 && v < 0.01) {
          command('N');
          load.command({ kind: 'vehicle', action: 'brake', value: 0.2 });
          this.to('stopped');
        }
        break;
      case 'stopped':
        this.want = 0;
        if (this.phaseTime >= o.endIdleS) this.to('done');
        break;
      case 'done':
        break;
    }
    sim.pedal += (this.want - sim.pedal) * Math.min(1, dt / FOOT_S);
    this.feel(dt);
    this.phaseTime += dt;
    this.time += dt;
  }
}

/** Steps engine and car through the story at dt without sound; `each` sees every step. */
export function runStory(story: DriveStory, dt: number, maxS = 90, each?: () => void): void {
  while (!story.done && story.time < maxS) {
    story.drive(dt);
    story.sim.step(dt);
    each?.();
  }
}
