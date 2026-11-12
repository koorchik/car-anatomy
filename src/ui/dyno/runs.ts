// What the dyno's software does with its readings: bins a sweep, averages a held point, finds the peaks, and runs the
// step test point after point. No DOM, so it is tested in Node.

import type { DynoCommand, DynoSpec } from '../../engine/dyno-load.ts';
import type { CrankReadings } from '../../engine/loaded-crank.ts';
import { HP_PER_KW, mapValue, powerKw, type EngineTorqueMap } from '../../engine/torque-map.ts';

export type RunKind = 'sweep' | 'steps' | 'points';

export interface RunPoint {
  rpm: number;
  /** What the dyno measured: load cell plus its own rotor's inertia, N·m. */
  nm: number;
  /** What went into speeding up the engine's own rotating parts, J·ε, N·m. */
  inertiaNm: number;
  manifoldBar: number;
  /** False when a held point ran out of time before everything had settled. */
  settled: boolean;
}

export interface Run {
  kind: RunKind;
  /** Engine name, for the legend when runs of two engines are compared. */
  engine: string;
  absorber: DynoSpec['absorber'];
  /** Sweep rate, rpm/s. */
  rate: number | null;
  /** Throttle of a step test. */
  throttle: number | null;
  points: RunPoint[];
  /** Why it stopped before its end, if it did. */
  stopped: 'broken' | 'stopped' | 'engine' | 'source' | 'gave-up' | null;
  stoppedAt: number | null;
}

/** One point as shown: torque with or without the inertia correction, and the power from it. */
export interface ShownPoint {
  rpm: number;
  nm: number;
  kw: number;
  hp: number;
  settled: boolean;
}

export const shownPoint = (p: RunPoint, correction: boolean): ShownPoint => {
  const nm = p.nm + (correction ? p.inertiaNm : 0);
  const kw = powerKw(nm, p.rpm);
  return { rpm: p.rpm, nm, kw, hp: kw * HP_PER_KW, settled: p.settled };
};

const BIN_RPM = 25;

/** Averages readings weighted by the steps each one covers. */
function average(readings: CrankReadings[], inertia: number): RunPoint | null {
  let n = 0;
  const sum = { rpm: 0, nm: 0, inertiaNm: 0, manifold: 0 };
  for (const r of readings) {
    const w = r.load.samples;
    if (w <= 0) continue;
    n += w;
    sum.rpm += r.load.rpm * w;
    sum.nm += r.load.measuredNm * w;
    sum.inertiaNm += inertia * r.load.alpha * w;
    sum.manifold += r.manifoldBar * w;
  }
  if (n === 0) return null;
  return { rpm: sum.rpm / n, nm: sum.nm / n, inertiaNm: sum.inertiaNm / n, manifoldBar: sum.manifold / n, settled: true };
}

export class RunRecorder {
  run: Run | null = null;
  private bins = new Map<number, CrankReadings[]>();
  private inertia = 0;
  /** Sweeps record above this speed: the first moments of a ramp are a transient. */
  private recordFrom = 0;

  begin(kind: RunKind, meta: Pick<Run, 'engine' | 'absorber' | 'rate' | 'throttle'>, inertia: number, recordFrom = 0): void {
    this.run = { kind, ...meta, points: [], stopped: null, stoppedAt: null };
    this.bins.clear();
    this.inertia = inertia;
    this.recordFrom = recordFrom;
  }

  /** Takes a reading during a sweep. Only the ramp counts, in bins of 25 rpm. */
  push(reading: CrankReadings): void {
    const run = this.run;
    if (!run || run.kind !== 'sweep' || reading.load.phase !== 'ramp' || reading.load.samples <= 0) return;
    if (reading.load.rpm < this.recordFrom) return;
    const key = Math.floor(reading.load.rpm / BIN_RPM);
    const list = this.bins.get(key) ?? [];
    list.push(reading);
    this.bins.set(key, list);
    run.points = [...this.bins.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, readings]) => average(readings, this.inertia)!)
      .filter(Boolean);
  }

  /** Adds a held point, averaged from the readings given (the last second). */
  addPoint(readings: CrankReadings[], settled = true): RunPoint | null {
    const point = average(readings, this.inertia);
    if (!point || !this.run) return null;
    point.settled = settled;
    this.run.points = [...this.run.points, point].sort((a, b) => a.rpm - b.rpm);
    return point;
  }

  stop(reason: NonNullable<Run['stopped']>, rpm: number): void {
    if (!this.run || this.run.stopped) return;
    this.run.stopped = reason;
    this.run.stoppedAt = rpm;
  }

  finish(): Run | null {
    const run = this.run;
    this.run = null;
    this.bins.clear();
    return run;
  }
}

export interface Peaks {
  torque: ShownPoint;
  power: ShownPoint;
  /** J·ε at the torque peak, N·m. */
  inertiaNm: number;
}

export function peaksOf(run: Run, correction: boolean): Peaks | null {
  if (!run.points.length) return null;
  const shown = run.points.map((p) => shownPoint(p, correction));
  let t = 0;
  let p = 0;
  shown.forEach((s, i) => {
    if (s.nm > shown[t]!.nm) t = i;
    if (s.kw > shown[p]!.kw) p = i;
  });
  return { torque: shown[t]!, power: shown[p]!, inertiaNm: run.points[t]!.inertiaNm };
}

/** How far below the steady full-load curve a run's peak sits, as a share. Positive when lower. */
export function shortfall(run: Run, map: EngineTorqueMap): number {
  const peaks = peaksOf(run, true);
  if (!peaks) return 0;
  const steady = Math.max(...map.wotNm);
  return 1 - peaks.torque.nm / steady;
}

interface StepState {
  rpm: number;
  started: number;
  window: CrankReadings[];
  history: Array<{ t: number; nm: number; manifold: number }>;
}

/**
 * The steady-state protocol: hold each speed at a fixed throttle, wait until speed, torque and boost stop moving,
 * then average a second and move on. A point whose time ran out before that is kept but marked.
 */
export class StepTest {
  readonly speeds: number[];
  private index = -1;
  private state: StepState | null = null;
  private time = 0;
  private readonly throttle: number;
  private readonly turbo: boolean;
  private readonly map: EngineTorqueMap;
  private averaging: CrankReadings[] | null = null;
  private averagingTime = 0;
  private settledFlag = true;
  done = false;

  constructor(map: EngineTorqueMap, from: number, to: number, throttle: number) {
    this.map = map;
    this.throttle = throttle;
    this.turbo = map.boostKind === 'turbo';
    const step = map.limitRpm <= 5000 ? 500 : 1000;
    const speeds: number[] = [];
    for (let rpm = Math.ceil(from / step) * step; rpm < to; rpm += step) speeds.push(rpm);
    speeds.push(Math.floor(to / 50) * 50);
    this.speeds = speeds;
  }

  /** Command for the next step, or the release at the end. */
  private advance(): DynoCommand {
    this.index++;
    if (this.index >= this.speeds.length) {
      this.done = true;
      return { kind: 'dyno', action: 'off' };
    }
    const rpm = this.speeds[this.index]!;
    this.state = { rpm, started: this.time, window: [], history: [] };
    this.averaging = null;
    return { kind: 'dyno', action: 'hold', rpm, throttle: this.throttle, keep: true };
  }

  start(): DynoCommand {
    return this.advance();
  }

  /** Longest wait at one speed: five turbo time constants and a second, at least four seconds. */
  private maxWait(reading: CrankReadings): number {
    return Math.max(4, this.turbo ? 5 * reading.spoolS + 1 : 0);
  }

  /** Feeds one reading. Returns a finished point to record and the next command to send, if any. */
  push(reading: CrankReadings): { point?: { readings: CrankReadings[]; settled: boolean }; command?: DynoCommand } {
    if (this.done || !this.state || reading.load.samples <= 0) return {};
    this.time += reading.load.seconds;
    const s = this.state;
    if (this.averaging) {
      this.averaging.push(reading);
      this.averagingTime += reading.load.seconds;
      if (this.averagingTime < 1) return {};
      const point = { readings: this.averaging, settled: this.settledFlag };
      return { point, command: this.advance() };
    }
    s.history.push({ t: this.time, nm: reading.load.measuredNm, manifold: reading.manifoldBar });
    while (s.history.length && s.history[0]!.t < this.time - 0.5) s.history.shift();
    const waited = this.time - s.started;
    const nms = s.history.map((h) => h.nm);
    const manifolds = s.history.map((h) => h.manifold);
    const top = Math.max(...nms.map(Math.abs), 1e-6);
    const still =
      Math.abs(reading.load.rpm - s.rpm) < 15 &&
      (Math.max(...nms) - Math.min(...nms)) / top < 0.005 &&
      (!this.turbo || Math.max(...manifolds) - Math.min(...manifolds) < 0.01);
    const timedOut = waited > this.maxWait(reading);
    if ((waited >= 1.5 && still) || timedOut) {
      this.settledFlag = !timedOut || still;
      this.averaging = [];
      this.averagingTime = 0;
    }
    return {};
  }

  /** Speed held now, and the steady full-load torque the model expects there, for the readout. */
  get target(): { rpm: number; nm: number } | null {
    if (!this.state) return null;
    return { rpm: this.state.rpm, nm: mapValue(this.map, this.map.wotNm, this.state.rpm) };
  }

  get progress(): { index: number; count: number } {
    return { index: Math.max(0, this.index), count: this.speeds.length };
  }
}
