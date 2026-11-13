// A quasi-steady-state lap of a point-mass car, the method of OpenLAP and of the TUM lap time simulation
// (Heilmeier et al., EVER 2019): the speed each corner allows, a forward pass that accelerates out of every limit
// and a backward pass that brakes into it, then the lower of the two. Tyres share their grip between braking or
// driving and cornering on a friction ellipse whose size grows with the normal load (crests take it away).
// The result is deterministic and periodic: the lap ends at the speed it started with.

import type { Powertrain, DriveSample } from './powertrain.ts';
import type { Track } from './track.ts';
import { AIR_DENSITY, dragForce, G, type TyreSpec, type VehicleSpec } from './vehicle.ts';

export interface LapTrace {
  lapTime: number;
  track: Track;
  tyre: TyreSpec;
  /** Per track sample (same index as Track): time at the sample, s. */
  t: Float64Array;
  /** Speed, m/s. */
  v: Float32Array;
  /** Accelerations in the car frame, m/s²: forward, left, up (negative over a crest). */
  ax: Float32Array;
  ay: Float32Array;
  av: Float32Array;
  /** The same after the chassis lag: what the oil and the g-g meter see. */
  axF: Float32Array;
  ayF: Float32Array;
  avF: Float32Array;
  rpm: Float32Array;
  gear: Uint8Array;
  /** Pedals, 0..1. */
  throttle: Float32Array;
  brake: Float32Array;
}

export interface LapSample {
  /** Distance along the lap, m. */
  s: number;
  x: number;
  y: number;
  heading: number;
  v: number;
  ax: number;
  ay: number;
  av: number;
  axF: number;
  ayF: number;
  avF: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  /** Index into track.sectors, or -1. */
  sector: number;
  /** Track sample just before this moment. */
  index: number;
}

export const newLapSample = (): LapSample => ({ s: 0, x: 0, y: 0, heading: 0, v: 0, ax: 0, ay: 0, av: 0, axF: 0, ayF: 0, avF: 0, rpm: 0, gear: 1, throttle: 0, brake: 0, sector: -1, index: 0 });

/**
 * Levels of the lap model (docs/vehicle-model.md): L0 a point mass on the oil page's stand-ins, L1 the car's record
 * (mass with the driver, tyres, roadLoadN) and a real gearbox where one exists, L2 weight transfer, L3 the live drive.
 */
export type LapLevel = 'L0' | 'L1' | 'L2' | 'L3';

/** The one lap every page shows on factory settings, and labels. Stage C3a moves every page to L2 at once. */
export const CANONICAL_LAP_LEVEL: LapLevel = 'L1';

/** Real tyres and suspension build their forces over 0.1-0.3 s; QSS steps at once (estimate). */
export const CHASSIS_LAG_S = 0.15;
/** Speed limit where nothing else limits, m/s. */
const V_CAP = 150;

export interface LapOptions {
  chassisLagS?: number;
}

/** Share of the car's weight the driven wheels can push with: the static share, all four on four-wheel drive. */
const driveShare = (car: VehicleSpec): number => (car.drive === 'awd' ? 1 : car.drivenShare);

/** First-order lag over a periodic series sampled at uneven times. `dt[i]` is the time from sample i to i+1. */
export function lagFilter(x: ArrayLike<number>, dt: ArrayLike<number>, tau: number, out: Float32Array): void {
  const n = x.length;
  let y = x[0]!;
  // Two laps, so that the lap's end leads smoothly into its start.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      if (pass === 0 && i === 0) {
        out[0] = y;
        continue;
      }
      const prev = (i - 1 + n) % n;
      const a = tau > 0 ? 1 - Math.exp(-dt[prev]! / tau) : 1;
      y += (x[i]! - y) * a;
      out[i] = y;
    }
  }
}

export function simulateLap(track: Track, car: VehicleSpec, tyre: TyreSpec, pt: Powertrain, o: LapOptions = {}): LapTrace {
  const n = track.n;
  const ds = track.ds;
  const m = car.massKg;
  const mu = tyre.mu;
  const aero = (0.5 * AIR_DENSITY * car.clA) / m;
  const share = driveShare(car);
  const drive: DriveSample = { forceN: 0, rpm: 0, gear: 1 };
  const kappa = track.kappa;
  const kappaV = track.kappaV;

  const normal = (v: number, i: number): number => G + v * v * kappaV[i]! + aero * v * v;
  const vLim = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const den = Math.abs(kappa[i]!) - mu * kappaV[i]! - mu * aero;
    vLim[i] = den > 1e-9 ? Math.min(V_CAP, Math.sqrt((mu * G) / den)) : V_CAP;
  }
  /** What is left of the grip after cornering, as a share of the full ellipse. */
  const leftOver = (v: number, i: number): number => {
    const grip = mu * normal(v, i);
    if (grip <= 0) return 0;
    const lat = (v * v * Math.abs(kappa[i]!)) / grip;
    return grip * Math.sqrt(Math.max(0, 1 - lat * lat));
  };
  const accel = (v: number, i: number): number => {
    pt.maxDrive(v, drive);
    return Math.min(drive.forceN / m, share * leftOver(v, i)) - dragForce(car, v) / m;
  };
  const decel = (v: number, i: number): number => leftOver(v, i) + dragForce(car, v) / m;

  // Forward: accelerate out of every limit. Three laps, so the start carries the end's speed.
  const vf = new Float64Array(n);
  let carry = Math.min(vLim[0]!, 20);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      vf[i] = Math.min(carry, vLim[i]!);
      carry = Math.sqrt(Math.max(0, vf[i]! * vf[i]! + 2 * accel(vf[i]!, i) * ds));
    }
  }
  // Backward: brake into every limit, on the forward profile.
  const v = new Float64Array(vf);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      v[i] = Math.min(vf[i]!, Math.sqrt(v[j]! * v[j]! + 2 * decel(v[j]!, j) * ds));
    }
  }

  const trace: LapTrace = {
    lapTime: 0,
    track,
    tyre,
    t: new Float64Array(n),
    v: new Float32Array(n),
    ax: new Float32Array(n),
    ay: new Float32Array(n),
    av: new Float32Array(n),
    axF: new Float32Array(n),
    ayF: new Float32Array(n),
    avF: new Float32Array(n),
    rpm: new Float32Array(n),
    gear: new Uint8Array(n),
    throttle: new Float32Array(n),
    brake: new Float32Array(n),
  };
  const dt = new Float64Array(n);
  let time = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vi = v[i]!;
    const vj = v[j]!;
    trace.t[i] = time;
    dt[i] = (2 * ds) / Math.max(vi + vj, 1e-3);
    time += dt[i]!;
    const ax = (vj * vj - vi * vi) / (2 * ds);
    trace.v[i] = vi;
    trace.ax[i] = ax;
    trace.ay[i] = vi * vi * kappa[i]!;
    trace.av[i] = vi * vi * kappaV[i]!;
    pt.maxDrive(vi, drive);
    trace.rpm[i] = Math.max(pt.idleRpm, drive.rpm);
    trace.gear[i] = drive.gear;
    const needed = m * ax + dragForce(car, vi);
    if (needed >= 0) {
      trace.throttle[i] = drive.forceN > 0 ? Math.min(1, needed / drive.forceN) : 0;
      trace.brake[i] = 0;
    } else {
      trace.throttle[i] = 0;
      trace.brake[i] = Math.min(1, -needed / Math.max(1, m * mu * normal(vi, i)));
    }
  }
  trace.lapTime = time;
  const tau = o.chassisLagS ?? CHASSIS_LAG_S;
  lagFilter(trace.ax, dt, tau, trace.axF);
  lagFilter(trace.ay, dt, tau, trace.ayF);
  lagFilter(trace.av, dt, tau, trace.avF);
  return trace;
}

/** Time from sample i to the next. */
export const sampleDt = (trace: LapTrace, i: number): number => (i + 1 < trace.t.length ? trace.t[i + 1]! : trace.lapTime) - trace.t[i]!;

/** The car at a moment of the lap: time wraps into the lap and values are interpolated linearly. Allocates nothing. */
export function sampleLap(trace: LapTrace, time: number, out: LapSample): void {
  const T = trace.lapTime;
  const tt = ((time % T) + T) % T;
  const t = trace.t;
  const n = t.length;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid]! <= tt) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const j = (i + 1) % n;
  const span = sampleDt(trace, i);
  const f = span > 0 ? Math.min(1, Math.max(0, (tt - t[i]!) / span)) : 0;
  const mix = (a: ArrayLike<number>): number => a[i]! + (a[j]! - a[i]!) * f;
  const track = trace.track;
  out.index = i;
  out.s = (i + f) * track.ds;
  out.x = mix(track.x);
  out.y = mix(track.y);
  let dh = track.heading[j]! - track.heading[i]!;
  dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
  out.heading = track.heading[i]! + dh * f;
  out.v = mix(trace.v);
  out.ax = mix(trace.ax);
  out.ay = mix(trace.ay);
  out.av = mix(trace.av);
  out.axF = mix(trace.axF);
  out.ayF = mix(trace.ayF);
  out.avF = mix(trace.avF);
  out.rpm = mix(trace.rpm);
  out.gear = trace.gear[i]!;
  out.throttle = mix(trace.throttle);
  out.brake = mix(trace.brake);
  out.sector = track.sector[i]!;
}
