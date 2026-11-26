// What the full dash of the car mode counts from one frame to the next (stage K3b): the heat the clutch took for the
// last pull-away, the time to 100 km/h and over 400 m from a standstill, and the last ten seconds for the strip chart.
// Everything comes from drive.snapshot()'s car frame (VehicleFrame); the times go by the simulation's own clock in the
// frame, so a slow or uneven frame rate does not stretch them. The meter keeps no physics of its own, so its energy is
// the core's (tests/gearbox-dash.test.ts). No DOM.

import type { VehicleFrame } from '../../vehicle/vehicle-frame.ts';

/** Below this road speed, m/s, the car stands [estimate: creeping slower than this is not a pull-away yet]. */
const STILL = 0.15;
/** A clutch slipping less than this, rad/s, is not slipping. */
const NO_SLIP = 0.5;
/** 100 km/h, m/s, and the quarter-mile-like 400 m. */
const HUNDRED = 100 / 3.6;
const SPRINT_M = 400;

export interface LaunchFigures {
  /** Heat into the clutch since the car last stood with the clutch at rest, J. */
  launchJ: number;
  /** Seconds from the last standstill to 100 km/h and to 400 m, null until reached. */
  to100: number | null;
  to400: number | null;
  /** The speed at 400 m, km/h. */
  kmhAt400: number | null;
}

export class DriveMeter {
  /** The clutch's heat counter when the car last stood with the clutch at rest, J. */
  private baseJ = 0;
  private started = false;
  private time = 0;
  private fromX = 0;
  /** The simulation's clock on the last frame, s; NaN before the first. */
  private lastClock = Number.NaN;
  readonly figures: LaunchFigures = { launchJ: 0, to100: null, to400: null, kmhAt400: null };

  /** A new car on the crank: nothing counted yet. */
  reset(frame: VehicleFrame | null = null): void {
    this.baseJ = frame?.clutchJ ?? 0;
    this.started = false;
    this.time = 0;
    this.lastClock = Number.NaN;
    Object.assign(this.figures, { launchJ: 0, to100: null, to400: null, kmhAt400: null });
  }

  /**
   * Takes the frame shown now, `dt` s of the page's time after the last one. The times go by the frame's own clock;
   * `dt` stands in only where that clock went back (another car, or the state handed between threads).
   */
  step(f: VehicleFrame, dt: number): LaunchFigures {
    const fig = this.figures;
    const clock = f.time - this.lastClock;
    this.lastClock = f.time;
    if (clock >= 0) dt = clock;
    const still = Math.abs(f.speed) < STILL;
    if (still && Math.abs(f.clutchSlip) < NO_SLIP) {
      // Standing with the clutch at rest (open, or closed on a stalled engine): the next pull-away counts from here.
      this.baseJ = f.clutchJ;
      this.started = false;
    }
    fig.launchJ = Math.max(0, f.clutchJ - this.baseJ);
    if (still) {
      if (this.started) this.started = false;
      return fig;
    }
    if (!this.started && f.speed > 0) {
      this.started = true;
      this.time = 0;
      this.fromX = f.distance;
      fig.to100 = null;
      fig.to400 = null;
      fig.kmhAt400 = null;
    }
    if (!this.started) return fig;
    this.time += dt;
    if (fig.to100 === null && f.speed >= HUNDRED) fig.to100 = this.time;
    if (fig.to400 === null && f.distance - this.fromX >= SPRINT_M) {
      fig.to400 = this.time;
      fig.kmhAt400 = f.speed * 3.6;
    }
    return fig;
  }
}

/** One sample of the strip chart. */
export interface StripSample {
  rpm: number;
  kmh: number;
  /** m/s². */
  accel: number;
  /** m/s³. */
  jerk: number;
  /** Drive torque on the driven hubs together, N·m. */
  driveNm: number;
}

export const STRIP_KEYS = ['rpm', 'kmh', 'accel', 'jerk', 'driveNm'] as const;
export type StripKey = (typeof STRIP_KEYS)[number];

/** Seconds the strip chart spans, and samples a second. */
export const STRIP_SECONDS = 10;
export const STRIP_RATE = 30;
/** The jerk is the slope of the acceleration smoothed over this time, s: the shunt shows, the solver's ripple does not. */
const JERK_S = 0.05;

/** The last STRIP_SECONDS of the drive at STRIP_RATE samples a second, oldest first. */
export class DriveStrip {
  readonly size = STRIP_SECONDS * STRIP_RATE;
  readonly series: Record<StripKey, Float32Array>;
  /** Samples held, up to size. */
  count = 0;
  /** Where the next sample goes. */
  private head = 0;
  private due = 0;
  private accel = 0;
  private lastAccel = 0;
  private jerk = 0;

  constructor() {
    this.series = Object.fromEntries(STRIP_KEYS.map((k) => [k, new Float32Array(this.size)])) as Record<StripKey, Float32Array>;
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.due = 0;
    this.accel = 0;
    this.lastAccel = 0;
    this.jerk = 0;
  }

  /** Takes the frame shown now; a sample is kept every 1/STRIP_RATE s. True when one was. */
  step(f: VehicleFrame, rpm: number, dt: number): boolean {
    if (!(dt > 0)) return false;
    const k = Math.min(1, dt / JERK_S);
    this.accel += (f.accel - this.accel) * k;
    const slope = (this.accel - this.lastAccel) / dt;
    this.lastAccel = this.accel;
    this.jerk += (slope - this.jerk) * k;
    this.due += dt;
    if (this.due < 1 / STRIP_RATE) return false;
    this.due = Math.min(this.due - 1 / STRIP_RATE, 1 / STRIP_RATE);
    const s = this.series;
    const i = this.head;
    s.rpm[i] = rpm;
    s.kmh[i] = f.speed * 3.6;
    s.accel[i] = this.accel;
    s.jerk[i] = this.jerk;
    s.driveNm[i] = f.driveNm;
    this.head = (i + 1) % this.size;
    this.count = Math.min(this.size, this.count + 1);
    return true;
  }

  /** The i-th sample held, 0 the oldest. */
  at(key: StripKey, i: number): number {
    const start = (this.head - this.count + this.size) % this.size;
    return this.series[key][(start + i) % this.size]!;
  }
}
