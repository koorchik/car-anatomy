// The driver's manual gearbox (gearbox plan, shift control, manual): the clutch pedal sets the clamp, the lever moves
// the sleeves, and the interlock never lets two sleeves hold at once (the lever first takes the old sleeve out to
// neutral). A shift without the clutch is allowed: the synchroniser copes if the driver matched the revs.
//
// The auto clutch of the gearbox pages works the pedal for the driver [estimates, gearbox plan]:
// - on a gear request it opens in OPEN_S, and the lever moves only once it is open;
// - with the new gear synchronised it closes in CLOSE_S on the move;
// - at a pull-away it slips so as to hold the engine at 1500–2000 rpm (more with more throttle) until the clutch
//   locks: the clutch torque is the engine's torque plus what brings the engine to that speed in about 1/LAUNCH_GAIN s;
// - near idle in a gear it lets go the same way, so the car brakes to a stop without stalling, as the auto clutches of
//   small cars did.
//
// Rev matching (the pages' rev-matching helper, stage K3b; Honda's Rev-Match on the Civic Type R): while the clutch is
// (nearly) open and the lever asks for a gear that needs the engine faster than it turns, the control asks for
// throttle (`blip`, read by VehicleLoad.engineRequest) until the engine meets the input speed that gear will have.
//
// It steps on the audio thread inside VehicleLoad: plain numbers, no allocation, no text.

import type { CrankInput } from '../../engine/load.ts';
import type { WheelBus } from '../../vehicle/wheel-bus.ts';
import { WHEELS } from '../../vehicle/wheel-bus.ts';
import { pedalClamp, stribeckMu } from '../elements.ts';
import { LOCKED, type DrivetrainSolver } from '../solver.ts';

export interface ManualGear {
  /** As in the gear matrix: 'R', '1' … */
  name: string;
  /** The shift element that selects it, an index into the core's elements. */
  element: number;
  /** Input over output speed, negative for reverse. */
  ratio: number;
}

/** Plain data, built on the main thread from the derived gearbox (car-load.ts). */
export interface ManualSpec {
  kind: 'manual';
  /** The driver's clutch, an element index. */
  clutch: number;
  /** The gearbox input shaft, a member index: the speed the clutch has to meet. */
  input: number;
  /** The gearbox output shaft, a member index: the rev matching reads the speed a gear will need from it. */
  output?: number;
  gears: ManualGear[];
  /** Sleeve force of a firm shift, N. */
  sleeveN: number;
  idleRpm: number;
  /** Brake torque each wheel holds with the pedal floored, N·m, FL, FR, RL, RR. */
  brakeNm: number[];
}

export const PHASES = ['engaged', 'opening', 'shifting', 'closing', 'launch'] as const;
/**
 * engaged: the clutch held (or the driver's own pedal); opening and shifting: on the way to a new gear; closing: the
 * clutch coming up on the move; launch: the clutch slipping to hold the engine's speed.
 */
export type ShiftPhase = (typeof PHASES)[number];

/** The auto clutch opens in this time, s [estimate, gearbox plan]. */
export const OPEN_S = 0.15;
/** And closes in this time on the move, s [estimate, gearbox plan]. */
export const CLOSE_S = 0.3;
/** The sleeve's way out of the dog teeth to neutral, s [estimate: half the table's 0.2 s from neutral to a gear]. */
export const SLEEVE_OUT_S = 0.1;
/** The engine speed a pull-away holds, rpm, from a shut to a floored throttle [estimate, gearbox plan]. */
export const LAUNCH_RPM: readonly [number, number] = [1500, 2000];
/** How fast the pull-away brings the engine to that speed, 1/s [estimate]. */
const LAUNCH_GAIN = 8;
/** In a gear the auto clutch lets go below this share of idle, and takes hold again above the second [estimates]. */
const LET_GO_SHARE = 1.1;
const HOLD_SHARE = 1.25;

/** The blip opens the throttle fully until the engine is within this share of the speed it is to meet [estimate]. */
const BLIP_BAND = 0.15;
/** No blip for a gap smaller than this share: the engine is close enough. */
const BLIP_DEADBAND = 0.02;
/**
 * The blip looks this far ahead, s, at the engine's present acceleration: the throttle closes about this slowly
 * (EngineSim), so a blip that waited for the engine to arrive would overshoot [estimate].
 */
const BLIP_LEAD_S = 0.12;
/** The blip waits for the clutch to open this far: a blip through a clamped clutch pushes the car [estimate]. */
const BLIP_CLAMP = 0.2;

const RAD = Math.PI / 30;
const CONTROL_SIZE = 9;

export class ManualControl {
  readonly spec: ManualSpec;
  /** The gear the lever asks for, an index into spec.gears; −1 neutral. */
  target = -1;
  /** The gear whose sleeve is pushed in, −1 none. */
  sleeve = -1;
  /** Seconds left of the sleeve's way out to neutral. */
  travel = 0;
  autoClutch = true;
  /** The driver's clutch pedal, 0 released … 1 floored; the auto clutch ignores it. */
  pedal = 0;
  /** Brake pedal, 0…1. */
  brake = 0;
  phase: ShiftPhase = 'engaged';
  /** Share of the full clamp the clutch has. */
  clamp = 1;
  /** Rev matching on: the control blips the throttle for a gear that needs the engine faster. */
  revMatch = false;
  /** The throttle the rev matching asks for on the coming step, 0 none. */
  blip = 0;
  /** Engine speed on the last step, rad/s, for its acceleration. */
  private lastOmega = 0;

  constructor(spec: ManualSpec) {
    this.spec = spec;
  }

  /** Index of a gear by its name ('N' is −1); undefined for a name the gearbox does not have. */
  gearIndex(name: string): number | undefined {
    if (name === 'N') return -1;
    const i = this.spec.gears.findIndex((g) => g.name === name);
    return i < 0 ? undefined : i;
  }

  /** The gear that holds: its sleeve in and locked. 'N' otherwise. */
  gearIn(s: DrivetrainSolver): string {
    return this.sleeve >= 0 && s.state[this.spec.gears[this.sleeve]!.element] === LOCKED ? this.spec.gears[this.sleeve]!.name : 'N';
  }

  /** Engine speed the pull-away holds at this throttle, rad/s. */
  launchOmega(throttle: number): number {
    const t = Math.min(1, Math.max(0, throttle));
    return (LAUNCH_RPM[0] + (LAUNCH_RPM[1] - LAUNCH_RPM[0]) * t) * RAD;
  }

  /** Sets the solver's clutch and sleeve commands and the wheels' brakes for the coming step. */
  step(s: DrivetrainSolver, bus: WheelBus, input: CrankInput, dt: number): void {
    const sp = this.spec;
    const E = s.core.elements;

    // The lever: out of the old gear first, then into the new one once the sleeve has reached neutral.
    const mayMove = !this.autoClutch || this.clamp <= 0;
    if (this.target !== this.sleeve && mayMove) {
      if (this.sleeve >= 0) {
        s.command[sp.gears[this.sleeve]!.element] = 0;
        this.sleeve = -1;
        this.travel = SLEEVE_OUT_S;
      } else if (this.travel <= 0) {
        this.sleeve = this.target;
        s.command[sp.gears[this.sleeve]!.element] = sp.sleeveN;
      }
    }
    this.travel = Math.max(0, this.travel - dt);

    if (!this.autoClutch) {
      this.clamp = pedalClamp(this.pedal);
      this.phase = 'engaged';
    } else if (this.target !== this.sleeve || (this.sleeve >= 0 && s.state[sp.gears[this.sleeve]!.element] !== LOCKED)) {
      // Open for the shift, and open while the synchroniser brings the gear round.
      this.phase = this.clamp > 0 ? 'opening' : 'shifting';
      this.clamp = Math.max(0, this.clamp - dt / OPEN_S);
    } else if (this.sleeve < 0) {
      this.close(dt);
    } else {
      const c = sp.clutch;
      const locked = s.state[c] === LOCKED;
      const engine = input.omega;
      const shaft = s.memberSpeed(sp.input);
      const hold = this.launchOmega(input.pedal);
      const idle = sp.idleRpm * RAD;
      if (this.phase === 'launch') {
        if ((locked && engine > HOLD_SHARE * idle) || (!locked && shaft >= hold)) this.phase = 'closing';
      } else if (locked ? engine < LET_GO_SHARE * idle : shaft < hold && this.phase !== 'closing') {
        this.phase = 'launch';
      }
      if (this.phase === 'launch') {
        // The torque that keeps the engine's own torque and turns its speed toward the hold, through the clamp the
        // facing's present friction needs; the actuator moves no faster than it opens.
        const want = input.engineNm + LAUNCH_GAIN * input.engineInertia * (engine - hold);
        const mu = stribeckMu(E.muStatic[c]!, E.muKinetic[c]!, E.stribeck[c]!, s.slip[c]!);
        const share = Math.min(1, Math.max(0, want / (mu * E.scale[c]!)));
        const rate = dt / OPEN_S;
        this.clamp += Math.min(rate, Math.max(-rate, share - this.clamp));
      } else {
        this.close(dt);
      }
    }
    s.command[sp.clutch] = this.clamp;
    this.blip = this.revMatch ? this.blipFor(s, input, dt) : 0;
    this.lastOmega = input.omega;

    for (let i = 0; i < WHEELS; i++) bus.brakeNm[i] = this.brake * sp.brakeNm[i]!;
  }

  /** The rev matching's throttle: open while the gear asked for needs the engine faster and the clutch can slip. */
  private blipFor(s: DrivetrainSolver, input: CrankInput, dt: number): number {
    const sp = this.spec;
    if (sp.output === undefined || this.target < 0 || this.clamp > BLIP_CLAMP || input.state !== 'running') return 0;
    const want = s.memberSpeed(sp.output) * sp.gears[this.target]!.ratio;
    const rising = Math.max(0, (input.omega - this.lastOmega) / dt);
    const gap = want - input.omega - rising * BLIP_LEAD_S;
    if (want <= sp.idleRpm * RAD || gap <= BLIP_DEADBAND * want) return 0;
    return Math.min(1, gap / (BLIP_BAND * want));
  }

  private close(dt: number): void {
    this.clamp = Math.min(1, this.clamp + dt / CLOSE_S);
    this.phase = this.clamp < 1 ? 'closing' : 'engaged';
  }

  /** Numbers in a snapshot. */
  snapshotSize(): number {
    return CONTROL_SIZE;
  }

  snapshot(out: Float64Array, o: number): void {
    out[o] = this.target;
    out[o + 1] = this.sleeve;
    out[o + 2] = this.travel;
    out[o + 3] = this.autoClutch ? 1 : 0;
    out[o + 4] = this.pedal;
    out[o + 5] = this.brake;
    out[o + 6] = PHASES.indexOf(this.phase);
    out[o + 7] = this.clamp;
    out[o + 8] = this.revMatch ? 1 : 0;
  }

  restore(from: Float64Array, o: number): void {
    this.target = from[o]!;
    this.sleeve = from[o + 1]!;
    this.travel = from[o + 2]!;
    this.autoClutch = from[o + 3]! !== 0;
    this.pedal = from[o + 4]!;
    this.brake = from[o + 5]!;
    this.phase = PHASES[from[o + 6]!] ?? 'engaged';
    this.clamp = from[o + 7]!;
    this.revMatch = from[o + 8]! !== 0;
  }
}
