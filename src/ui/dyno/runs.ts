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
  /** The torque map of the engine the run was made on: a run kept across engines is judged against its own. */
  map: EngineTorqueMap;
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

/** Sums of readings weighted by the steps each covers. */
interface Sums {
  n: number;
  rpm: number;
  nm: number;
  alpha: number;
  manifold: number;
}

const emptySums = (): Sums => ({ n: 0, rpm: 0, nm: 0, alpha: 0, manifold: 0 });

function addReading(sums: Sums, r: CrankReadings): void {
  const w = r.load.samples;
  if (w <= 0) return;
  sums.n += w;
  sums.rpm += r.load.rpm * w;
  sums.nm += r.load.measuredNm * w;
  sums.alpha += r.load.alpha * w;
  sums.manifold += r.manifoldBar * w;
}

const pointOf = (sums: Sums, inertia: number): RunPoint => ({
  rpm: sums.rpm / sums.n,
  nm: sums.nm / sums.n,
  inertiaNm: (inertia * sums.alpha) / sums.n,
  manifoldBar: sums.manifold / sums.n,
  settled: true,
});

/** Averages readings weighted by the steps each one covers. */
function average(readings: CrankReadings[], inertia: number): RunPoint | null {
  const sums = emptySums();
  for (const r of readings) addReading(sums, r);
  return sums.n > 0 ? pointOf(sums, inertia) : null;
}

export class RunRecorder {
  run: Run | null = null;
  /** Running sums of each 25 rpm bin of a sweep, and the bins' keys in the order of run.points. */
  private bins = new Map<number, Sums>();
  private keys: number[] = [];
  private inertia = 0;
  /** Sweeps record above this speed: the first moments of a ramp are a transient. */
  private recordFrom = 0;

  begin(kind: RunKind, meta: Pick<Run, 'engine' | 'absorber' | 'rate' | 'throttle'>, map: EngineTorqueMap, recordFrom = 0): void {
    this.run = { kind, ...meta, map, points: [], stopped: null, stoppedAt: null };
    this.bins.clear();
    this.keys = [];
    this.inertia = map.inertia;
    this.recordFrom = recordFrom;
  }

  /** Takes a reading during a sweep. Only the ramp counts, in bins of 25 rpm; only the bin it falls in changes. */
  push(reading: CrankReadings): void {
    const run = this.run;
    if (!run || run.kind !== 'sweep' || reading.load.phase !== 'ramp' || reading.load.samples <= 0) return;
    if (reading.load.rpm < this.recordFrom) return;
    const key = Math.floor(reading.load.rpm / BIN_RPM);
    // Keys come almost always in rising order, so the search starts from the end.
    let index = this.keys.length;
    while (index > 0 && this.keys[index - 1]! > key) index--;
    const known = this.bins.get(key);
    const sums = known ?? emptySums();
    addReading(sums, reading);
    const point = pointOf(sums, this.inertia);
    if (known) {
      run.points[index - 1] = point;
    } else {
      this.bins.set(key, sums);
      this.keys.splice(index, 0, key);
      run.points.splice(index, 0, point);
    }
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
    this.keys = [];
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

/** Where a sweep sits furthest below the steady full-load curve. */
export interface Sag {
  rpm: number;
  /** Share of the steady torque missing, positive when lower. */
  share: number;
}

/** Bins averaged on each side when looking for the sag, so one noisy bin cannot make it. */
const SAG_SMOOTH = 2;

/**
 * Where an inertia-corrected sweep of a turbo engine falls furthest below the steady full-load curve of its own
 * engine, from the start of the sweep to 1000 rpm past full boost: what is left once J·ε is put back is the turbo
 * that has not yet caught up. Null for any other run.
 */
export function turboSag(run: Run): Sag | null {
  const map = run.map;
  if (run.kind !== 'sweep' || map.boostKind !== 'turbo' || !run.points.length) return null;
  const top = map.spoolRpm + 1000;
  const shown = run.points.map((p) => shownPoint(p, true));
  let worst: Sag | null = null;
  for (let i = 0; i < shown.length && shown[i]!.rpm <= top; i++) {
    const near = shown.slice(Math.max(0, i - SAG_SMOOTH), i + SAG_SMOOTH + 1);
    const nm = near.reduce((sum, p) => sum + p.nm, 0) / near.length;
    const steady = mapValue(map, map.wotNm, shown[i]!.rpm);
    const share = 1 - nm / steady;
    if (!worst || share > worst.share) worst = { rpm: shown[i]!.rpm, share };
  }
  return worst;
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
