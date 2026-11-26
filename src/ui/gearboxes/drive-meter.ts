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
  /** Heat into the clutch since the car last stood with the clutch at rest (open, or not slipping), J. */
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
    if (still && (f.clutch <= 0 || Math.abs(f.clutchSlip) < NO_SLIP)) {
      // Standing with the clutch at rest (open, or closed on a stalled engine): the next pull-away counts from here.
      // An open clutch passes no heat however far apart its two sides turn: the engine idling with the pedal down.
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
  /** The values of the last frame, in STRIP_KEYS order, to fill the samples a long frame spans; null before one. */
  private readonly last = new Float64Array(STRIP_KEYS.length);
  private hasLast = false;
  private readonly now = new Float64Array(STRIP_KEYS.length);

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
    this.hasLast = false;
  }

  /**
   * Takes the frame shown now; a sample is kept every 1/STRIP_RATE s of the page's time. A frame longer than that (a
   * slow device draws 20 frames a second or fewer) fills every sample it spans, along the line from the last frame, so
   * the strip always spans STRIP_SECONDS. True when a sample was kept.
   */
  step(f: VehicleFrame, rpm: number, dt: number): boolean {
    if (!(dt > 0)) return false;
    const k = Math.min(1, dt / JERK_S);
    this.accel += (f.accel - this.accel) * k;
    const slope = (this.accel - this.lastAccel) / dt;
    this.lastAccel = this.accel;
    this.jerk += (slope - this.jerk) * k;
    const now = this.now;
    now[0] = rpm;
    now[1] = f.speed * 3.6;
    now[2] = this.accel;
    now[3] = this.jerk;
    now[4] = f.driveNm;
    const last = this.hasLast ? this.last : now;
    const period = 1 / STRIP_RATE;
    const before = this.due;
    this.due += dt;
    const n = Math.min(this.size, Math.floor(this.due / period));
    this.due -= Math.floor(this.due / period) * period;
    for (let j = 1; j <= n; j++) {
      // Where the j-th sample falls between the last frame (0) and this one (1).
      const at = Math.min(1, (j * period - before) / dt);
      const i = this.head;
      for (let q = 0; q < STRIP_KEYS.length; q++) this.series[STRIP_KEYS[q]!][i] = last[q]! + (now[q]! - last[q]!) * at;
      this.head = (i + 1) % this.size;
      this.count = Math.min(this.size, this.count + 1);
    }
    this.last.set(now);
    this.hasLast = true;
    return n > 0;
  }

  /** The i-th sample held, 0 the oldest. */
  at(key: StripKey, i: number): number {
    const start = (this.head - this.count + this.size) % this.size;
    return this.series[key][(start + i) % this.size]!;
  }
}
