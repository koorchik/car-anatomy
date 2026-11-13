// Variable valve gear as the engine computer runs it: cam phasers, a second cam profile, intake valves that
// set the load themselves, and cylinders that rest at light load. Runs inside EngineSim, so on the audio
// thread, on the main thread and in Node alike. No DOM, no Web Audio.
//
// Every shift is in crank degrees later than the park position, the one a phaser returns to without oil
// pressure. Park is what spec.timing describes, so an engine at rest looks and sounds as it always did.

import type { ValveTiming } from './spec.ts';

export type PhaserKind = 'none' | 'intake' | 'dual' | 'coupled';
export type SwitchedCams = 'intake' | 'exhaust' | 'both';
export type LiftKind = 'continuous' | 'multiair';
export type DeactivationKind = 'valves' | 'fuel';

export interface CamSwitching {
  cams: SwitchedCams;
  rpm: number;
  /** Third lobe and locking pin, or a cam block sliding along the shaft. Only drawn. */
  kind: 'pin' | 'slide';
  /** The low cam's events at park. */
  low: ValveTiming;
  /** The low cam's lift as a share of the main cam's, the same on every switched valve. */
  lowShare: number;
  /** Charge trapped on the high cam over the low one at wotRpm, from the performance model. */
  highGain: number[];
}

export interface VariableValves {
  phaser: PhaserKind;
  /** Crank degrees a phaser travels from park. A coupled phaser moves the whole shaft by intakeRange. */
  intakeRange: number;
  exhaustRange: number;
  /** Full-load schedule: crank degrees later than park, by engine speed. */
  wotRpm: number[];
  wotIntake: number[];
  wotExhaust: number[];
  /** Medium load: internal exhaust gas recirculation instead of throttling. */
  partIntake: number;
  partExhaust: number;
  switching: CamSwitching | null;
  /** Intake valves that set the load: an intermediate lever, or MultiAir's oil column. */
  lift: { kind: LiftKind; maxLift: number } | null;
  /** Cylinder numbers that rest: one set, or two that take turns. The window is the manufacturer's when documented. */
  deactivation: { kind: DeactivationKind; sets: number[][]; rpmMin: number; rpmMax: number; documented: boolean; loadMax: number } | null;
}

export interface ValveState {
  intakeShift: number;
  exhaustShift: number;
  highCam: boolean;
  /** Share of full intake lift the lever lets through, 1 with plain cams. */
  liftShare: number;
  /** MultiAir at idle: the valve opens late instead of closing early. */
  lateOpen: boolean;
  /** Cylinders resting now. */
  off: number[];
  /** Share of cylinders firing. */
  active: number;
}

/** No cylinder resting. Shared, so the controller allocates nothing while it runs; never mutated. */
const ALL_FIRING: number[] = [];

export const restingState = (): ValveState => ({ intakeShift: 0, exhaustShift: 0, highCam: false, liftShare: 1, lateOpen: false, off: [], active: 1 });

/** What the controller reads from the crank simulation. */
export interface ValveInputs {
  rpm: number;
  load: number;
  state: string;
  fuelCut: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smooth = (x: number, a: number, b: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Linear in a table, held flat past its ends. */
export function interpolate(xs: number[], ys: number[], x: number): number {
  if (!xs.length) return 0;
  if (x <= xs[0]!) return ys[0]!;
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]!) {
      const t = (x - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
      return ys[i - 1]! + (ys[i]! - ys[i - 1]!) * t;
    }
  }
  return ys[ys.length - 1]!;
}

/** Degrees per second a phaser turns. Oil-pressure phasers manage roughly this; my estimate. */
export const PHASER_RATE = 200;
/** Seconds the light-load conditions must hold before cylinders rest. */
const DEACTIVATE_AFTER = 1.5;
/** Porsche swaps the resting bank every 20 s to keep both catalytic converters warm. */
const ALTERNATE_EVERY = 20;
/** MultiAir runs late opening only at light load and low speed (Schaeffler 2010). */
const LIVO_LOAD = 0.2;
const LIVO_RPM = 3000;

/** Lift share the computer asks for at this load: small at idle, full at full throttle. */
export const liftShareFor = (load: number): number => 0.02 + 0.98 * clamp((load - 0.12) / 0.73, 0, 1) ** 1.3;

export class ValveControl {
  vvt: VariableValves | null = null;
  readonly state: ValveState = restingState();
  private idleRpm = 800;
  private cylinders = 1;
  private holdTime = 0;
  private alternateTime = 0;
  private setIndex = 0;

  configure(vvt: VariableValves | null | undefined, idleRpm: number, cylinders: number): void {
    this.vvt = vvt ?? null;
    this.idleRpm = idleRpm;
    this.cylinders = Math.max(1, cylinders);
    Object.assign(this.state, restingState());
    this.holdTime = 0;
    this.alternateTime = 0;
    this.setIndex = 0;
  }

  /** Where the phasers are asked to be. */
  private target(input: ValveInputs): { intake: number; exhaust: number } {
    const v = this.vvt!;
    if (v.phaser === 'none' || input.state !== 'running') return { intake: 0, exhaust: 0 };
    const { rpm, load } = input;
    // Idle and light load stay at park: no overlap, no charge pushed back, a steady idle.
    if (rpm < this.idleRpm * 1.3 && load < 0.3) return { intake: 0, exhaust: 0 };
    const part = smooth(load, 0.25, 0.4);
    const full = smooth(load, 0.6, 0.85);
    const wotIntake = interpolate(v.wotRpm, v.wotIntake, rpm);
    const wotExhaust = interpolate(v.wotRpm, v.wotExhaust, rpm);
    const midIntake = v.partIntake * part;
    const midExhaust = v.partExhaust * part;
    return { intake: midIntake + (wotIntake - midIntake) * full, exhaust: midExhaust + (wotExhaust - midExhaust) * full };
  }

  step(dt: number, input: ValveInputs): void {
    const v = this.vvt;
    const s = this.state;
    if (!v) return;
    const running = input.state === 'running';
    const { rpm, load } = input;

    const target = this.target(input);
    const move = PHASER_RATE * dt;
    s.intakeShift += clamp(target.intake - s.intakeShift, -move, move);
    s.exhaustShift += clamp(target.exhaust - s.exhaustShift, -move, move);

    if (v.switching) {
      const sw = v.switching.rpm;
      if (!running) s.highCam = false;
      else if (s.highCam) s.highCam = !(rpm < sw - 150 || load < 0.18);
      else s.highCam = rpm >= sw && load >= 0.25;
    }

    if (v.lift) {
      s.liftShare = running ? liftShareFor(load) : liftShareFor(0);
      s.lateOpen = v.lift.kind === 'multiair' && load < LIVO_LOAD && rpm < LIVO_RPM;
    }

    const d = v.deactivation;
    if (d) {
      const fits = running && !input.fuelCut && rpm >= d.rpmMin && rpm <= d.rpmMax && load < d.loadMax;
      if (!fits) {
        // Every cylinder comes back at once the moment power is wanted.
        this.holdTime = 0;
        s.off = ALL_FIRING;
      } else {
        this.holdTime += dt;
        if (this.holdTime >= DEACTIVATE_AFTER) {
          if (d.sets.length > 1) {
            this.alternateTime += dt;
            if (this.alternateTime >= ALTERNATE_EVERY) {
              this.alternateTime = 0;
              this.setIndex = (this.setIndex + 1) % d.sets.length;
            }
          }
          s.off = d.sets[this.setIndex % d.sets.length]!;
        }
      }
      s.active = 1 - s.off.length / this.cylinders;
    }
  }
}

/** Valve events and lifts as they are right now, from the park events and the controller's state. */
export interface LiveTiming {
  timing: ValveTiming;
  /** Lifts relative to the main cam's full lift. */
  intakeLift: number;
  exhaustLift: number;
}

/** MultiAir's late opening: the oil column is held only after the cam has done this share of its event. */
export const LIVO_START = 0.3;

/** Live events for this moment. Pass `out` to have them written there instead of into a new object. */
export function liveTiming(timing: ValveTiming, vvt: VariableValves | undefined | null, state: ValveState | undefined | null, out?: LiveTiming): LiveTiming {
  if (!vvt || !state) return written(out, timing.intakeOpen, timing.intakeClose, timing.exhaustOpen, timing.exhaustClose, 1, 1);
  const sw = vvt.switching;
  const low = sw && !state.highCam;
  const lowShare = sw ? clamp(sw.lowShare, 0, 1) : 1;
  const intakeLow = low && sw!.cams !== 'exhaust';
  const exhaustLow = low && sw!.cams !== 'intake';
  let intakeOpen = (intakeLow ? sw!.low.intakeOpen : timing.intakeOpen) + state.intakeShift;
  let intakeClose = (intakeLow ? sw!.low.intakeClose : timing.intakeClose) + state.intakeShift;
  let intakeLift = intakeLow ? lowShare : 1;
  const exhaustOpen = (exhaustLow ? sw!.low.exhaustOpen : timing.exhaustOpen) + state.exhaustShift;
  const exhaustClose = (exhaustLow ? sw!.low.exhaustClose : timing.exhaustClose) + state.exhaustShift;
  const exhaustLift = exhaustLow ? lowShare : 1;

  if (vvt.lift) {
    const span = intakeClose - intakeOpen;
    const s = clamp(state.liftShare, 0.005, 1);
    if (vvt.lift.kind === 'continuous') {
      // Lost motion: the lever takes a constant bite out of the lobe, so lift and opening shrink together.
      const centre = (intakeOpen + intakeClose) / 2;
      const kept = span * (2 / Math.PI) * Math.asin(Math.sqrt(s));
      intakeOpen = centre - kept / 2;
      intakeClose = centre + kept / 2;
      intakeLift *= s;
    } else if (state.lateOpen) {
      // The valve picks up the lobe late and rides only its top.
      const held = Math.sin(Math.PI * LIVO_START) ** 2;
      intakeOpen += span * LIVO_START;
      intakeClose -= span * LIVO_START;
      intakeLift *= 1 - held;
    } else {
      // Early closing: the solenoid lets the oil out and the valve drops before the lobe ends.
      const share = multiairClose(s);
      intakeClose = intakeOpen + Math.min(span, span * share + 10);
      intakeLift *= Math.sin(Math.PI * Math.min(share, 0.5)) ** 2;
    }
  }
  return written(out, intakeOpen, intakeClose, exhaustOpen, exhaustClose, intakeLift, exhaustLift);
}

function written(out: LiveTiming | undefined, intakeOpen: number, intakeClose: number, exhaustOpen: number, exhaustClose: number, intakeLift: number, exhaustLift: number): LiveTiming {
  if (!out) return { timing: { intakeOpen, intakeClose, exhaustOpen, exhaustClose }, intakeLift, exhaustLift };
  const t = out.timing;
  t.intakeOpen = intakeOpen;
  t.intakeClose = intakeClose;
  t.exhaustOpen = exhaustOpen;
  t.exhaustClose = exhaustClose;
  out.intakeLift = intakeLift;
  out.exhaustLift = exhaustLift;
  return out;
}

/** An object for liveTiming to write into, so a caller that runs every frame allocates nothing. */
export const liveScratch = (): LiveTiming => ({ timing: { intakeOpen: 0, intakeClose: 0, exhaustOpen: 0, exhaustClose: 0 }, intakeLift: 1, exhaustLift: 1 });

/** Share of the cam event MultiAir keeps the valve open for, from the lift share asked for. */
export const multiairClose = (share: number): number => 0.08 + 0.92 * clamp(share, 0, 1);

/**
 * Phase schedule for an engine on factory calibration, without running the performance model. After Toyota's
 * VVT-i strategy: park at idle and light load, internal recirculation at medium load, an early intake close for
 * low-speed torque at full load and a later one toward the top, where the charge keeps flowing in.
 */
export function ruleSchedule(phaser: PhaserKind, intakeRange: number, exhaustRange: number, redlineRpm: number): Pick<VariableValves, 'wotRpm' | 'wotIntake' | 'wotExhaust' | 'partIntake' | 'partExhaust'> {
  const wotRpm = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05].map((n) => Math.round(n * redlineRpm));
  if (phaser === 'none') return { wotRpm, wotIntake: wotRpm.map(() => 0), wotExhaust: wotRpm.map(() => 0), partIntake: 0, partExhaust: 0 };
  if (phaser === 'coupled') {
    // One shaft: retarding it closes the intake later for the top end, at the cost of the bottom.
    const shift = wotRpm.map((rpm) => intakeRange * clamp((rpm / redlineRpm - 0.45) / 0.45, 0, 1) * 0.6);
    return { wotRpm, wotIntake: shift, wotExhaust: shift, partIntake: intakeRange * 0.6, partExhaust: intakeRange * 0.6 };
  }
  const advance = (n: number): number => (n <= 0.45 ? 1 : n >= 0.9 ? 0.2 : 1 - (0.8 * (n - 0.45)) / 0.45);
  const wotIntake = wotRpm.map((rpm) => -intakeRange * advance(rpm / redlineRpm));
  const dual = phaser === 'dual';
  const wotExhaust = wotRpm.map((rpm) => (dual ? exhaustRange * 0.5 * clamp((0.9 - rpm / redlineRpm) / 0.45, 0, 1) : 0));
  return { wotRpm, wotIntake, wotExhaust, partIntake: -intakeRange * 0.6, partExhaust: dual ? exhaustRange * 0.6 : 0 };
}
