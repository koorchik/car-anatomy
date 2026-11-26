// The bump scene (suspensions plan, scenes, «Перешкода»): one corner rolls at a steady speed over one obstacle, and
// the run is written down whole before it is shown. A run costs a few thousand quarter-car steps and a road segment
// or two (a few milliseconds), so every change of the setup, the speed, the obstacle or the wheel gives its numbers
// and its response curve at once, and the page plays the written run back at whatever slow-down the visitor chose:
// the physics never depends on the frame rate or the factor, so what the visitor sees at ×0.1 is the run at ×1.
//
// The trace is the quarter car's own step output (QuarterSim.out, semi-implicit Euler at 1 ms), so its peaks are
// the ones the tests hold against RK4. Pure: no DOM, no text.

import { G } from './forces.ts';
import { QUARTER_STEP_S, QuarterSim } from './quarter.ts';
import { EventRoad, RoadBuffer, type RoadEvent } from './road.ts';
import { resolveCorner, type CornerSetup, type ResolvedCorner } from './setup.ts';
import type { CornerSpec } from './spec.ts';

/** The obstacles of the scene (suspensions plan, the bump scene, steps 1, 6 and 8). Sizes are the plan's choices. */
export type ObstacleId = 'bump' | 'hump' | 'pothole' | 'kerb' | 'kerb-hard';
export const OBSTACLE_IDS: readonly ObstacleId[] = ['bump', 'hump', 'pothole', 'kerb', 'kerb-hard'];

export interface Obstacle {
  kind: RoadEvent['kind'];
  /** Height (a pothole's depth), m. */
  heightM: number;
  /** Length along the road, m; 0 for a kerb's edge, which stays up. */
  lengthM: number;
}

export const OBSTACLES: Record<ObstacleId, Obstacle> = {
  bump: { kind: 'bump', heightM: 0.05, lengthM: 0.5 },
  hump: { kind: 'bump', heightM: 0.07, lengthM: 1 },
  pothole: { kind: 'pothole', heightM: 0.06, lengthM: 0.4 },
  kerb: { kind: 'step', heightM: 0.1, lengthM: 0 },
  'kerb-hard': { kind: 'step', heightM: 0.12, lengthM: 0 },
};

/**
 * The wheels of step 7 as a change of the corner's unsprung mass, kg. The corner's own 40 kg are taken as cast alloy
 * wheels. Steel: about 5 lb (2.3 kg) heavier than aluminium in the same 16-inch size (a wheel retailer's figure);
 * forged: up to a quarter lighter than a comparable cast wheel (MotorTrend, as Motor1 quotes it) on a cast wheel of
 * about 8 kg. Both are estimates (docs/suspension-model.md, the bump scene).
 */
export type WheelId = 'steel' | 'cast' | 'forged';
export const WHEEL_IDS: readonly WheelId[] = ['steel', 'cast', 'forged'];
export const WHEEL_UNSPRUNG_KG: Record<WheelId, number> = { steel: 2.3, cast: 0, forged: -2 };

/** Limits of the speed control, km/h (suspensions plan, the bump scene, step 5). */
export const BUMP_SPEED_KMH: readonly [number, number] = [10, 120];

export interface BumpScene {
  obstacle: ObstacleId;
  speedKmh: number;
  wheel: WheelId;
}

/** What the page opens with (step 1): the 50 mm × 0.5 m bump at 30 km/h on the corner's own wheels. */
export const BUMP_DEFAULT: BumpScene = { obstacle: 'bump', speedKmh: 30, wheel: 'cast' };
/** «Пробити» (step 8): a 120 mm kerb at 40 km/h reaches the bump stop. */
export const BUMP_PUNCH: BumpScene = { obstacle: 'kerb-hard', speedKmh: 40, wheel: 'cast' };

/** A scene with every field valid (a link may carry anything). */
export function clampScene(s: Partial<BumpScene>): BumpScene {
  const speed = Number(s.speedKmh);
  return {
    obstacle: OBSTACLE_IDS.includes(s.obstacle as ObstacleId) ? (s.obstacle as ObstacleId) : BUMP_DEFAULT.obstacle,
    speedKmh: Number.isFinite(speed) ? Math.min(BUMP_SPEED_KMH[1], Math.max(BUMP_SPEED_KMH[0], speed)) : BUMP_DEFAULT.speedKmh,
    wheel: WHEEL_IDS.includes(s.wheel as WheelId) ? (s.wheel as WheelId) : BUMP_DEFAULT.wheel,
  };
}

/** The corner on the chosen wheels, resolved with the setup. */
export function resolveBumpCorner(corner: CornerSpec, setup: CornerSetup, wheel: WheelId): ResolvedCorner {
  return resolveCorner({ ...corner, unsprungKg: corner.unsprungKg + WHEEL_UNSPRUNG_KG[wheel] }, setup);
}

/** The road event of an obstacle that starts `atM` along the road. */
export function obstacleEvent(id: ObstacleId, atM: number): RoadEvent {
  const o = OBSTACLES[id];
  if (o.kind === 'bump') return { kind: 'bump', atM, lengthM: o.lengthM, heightM: o.heightM };
  if (o.kind === 'pothole') return { kind: 'pothole', atM, lengthM: o.lengthM, depthM: o.heightM };
  return { kind: 'step', atM, heightM: o.heightM };
}

/** The road strip in 3D shows ±1.6 m round the wheel: an obstacle starts further ahead, so a new run never pops one in. */
const MIN_LEAD_M = 2;
/** Time the wheel rolls before it reaches the obstacle, s, when the speed asks for more than MIN_LEAD_M. */
const LEAD_S = 0.4;
/** Longest the run goes on after the obstacle, and the least, s. */
const MAX_AFTER_S = 3;
const MIN_AFTER_S = 0.8;
/** Kept after the corner has settled, s. */
const TAIL_S = 0.5;
/** Settled: the travel within 1.5 mm of rest and the body within 2 mm of where it ends. */
const SETTLE_TRAVEL_M = 0.0015;
const SETTLE_BODY_M = 0.002;
/** An airborne stretch shorter than this is the integrator touching zero, not a hop, s. */
const MIN_HOP_S = 0.002;

/** One run sampled every QUARTER_STEP_S. Forces in N, lengths in m, as QuarterOut. */
export interface BumpTrace {
  readonly n: number;
  readonly dt: number;
  readonly x: Float32Array;
  readonly roadZ: Float32Array;
  readonly bodyZ: Float32Array;
  readonly wheelZ: Float32Array;
  readonly travel: Float32Array;
  readonly bodyAcc: Float32Array;
  readonly tyreN: Float32Array;
  readonly springN: Float32Array;
  readonly damperN: Float32Array;
  readonly stopN: Float32Array;
  /** Where the obstacle starts along the road, m, and when the wheel reaches it and leaves it, s. */
  readonly obstacleAtM: number;
  readonly reachS: number;
  readonly leaveS: number;
  /** The road under the run (enveloped, as the tyre feels it) and its profile. */
  readonly road: RoadBuffer;
  readonly events: readonly RoadEvent[];
}

export interface BumpStats {
  /** Largest body acceleration, in g. */
  bodyPeakG: number;
  /** Highest the body rose above its height at rest, m (a kerb's edge counts: the road stays up). */
  bodyRiseM: number;
  /** Tyre load, least and most, as shares of the static load. */
  tyreMin: number;
  tyreMax: number;
  /** Time the wheel spent off the road, s, and how many times it left it. */
  airS: number;
  hops: number;
  /** Most bump travel from rest, m, and the travel from rest to the bump stop. */
  travelMaxM: number;
  toStopM: number;
  /** Whether the bump stop was hit, and the largest body acceleration while it was, g. */
  stopHit: boolean;
  stopPeakG: number;
  /** Time from leaving the obstacle until the corner stays settled, s; null when it has not settled within the run. */
  settleS: number | null;
  /** How long the obstacle takes to pass under the wheel, s, and its frequency V/ℓ, Hz (null for a kerb's edge). */
  hitS: number | null;
  hitHz: number | null;
  bodyHz: number;
  hopHz: number;
  /** Static tyre load, N. */
  staticN: number;
}

export interface BumpRun {
  scene: BumpScene;
  corner: ResolvedCorner;
  trace: BumpTrace;
  stats: BumpStats;
}

/** Runs the corner over the scene's obstacle from rest and writes the run down. */
export function runBump(corner: ResolvedCorner, raw: BumpScene): BumpRun {
  const scene = clampScene(raw);
  const v = scene.speedKmh / 3.6;
  const atM = Math.max(MIN_LEAD_M, v * LEAD_S);
  const o = OBSTACLES[scene.obstacle];
  const events = [obstacleEvent(scene.obstacle, atM)];
  const road = new RoadBuffer(new EventRoad(events), corner.tyre.freeRadiusM, corner.tyre.patchM);
  const reachS = atM / v;
  const leaveS = (atM + o.lengthM) / v;
  const h = QUARTER_STEP_S;
  const cap = Math.ceil((leaveS + MAX_AFTER_S) / h) + 1;
  const arrays = {
    x: new Float32Array(cap),
    roadZ: new Float32Array(cap),
    bodyZ: new Float32Array(cap),
    wheelZ: new Float32Array(cap),
    travel: new Float32Array(cap),
    bodyAcc: new Float32Array(cap),
    tyreN: new Float32Array(cap),
    springN: new Float32Array(cap),
    damperN: new Float32Array(cap),
    stopN: new Float32Array(cap),
  };
  const sim = new QuarterSim(corner, road, v);
  sim.reset(0);
  const out = sim.out;
  const record = (i: number): void => {
    arrays.x[i] = out.x;
    arrays.roadZ[i] = out.roadZ;
    arrays.bodyZ[i] = out.bodyZ;
    arrays.wheelZ[i] = out.wheelZ;
    arrays.travel[i] = out.travel;
    arrays.bodyAcc[i] = out.bodyAcc;
    arrays.tyreN[i] = out.tyreN;
    arrays.springN[i] = out.springN;
    arrays.damperN[i] = out.damperN;
    arrays.stopN[i] = out.stopN;
  };
  // Sample i is the state at i·h with the forces that act on it: step() fills `out` for the state it starts from.
  for (let i = 0; i < cap; i++) {
    sim.step(h);
    record(i);
  }

  // Where the run is cut: settled and a little after, but never before MIN_AFTER_S past the obstacle.
  const restTravel = corner.staticTravelM;
  const finalRoad = o.kind === 'step' ? o.heightM : 0;
  const bodyEnd = corner.bodyStaticM + finalRoad;
  const leaveI = Math.min(cap - 1, Math.ceil(leaveS / h));
  let lastUnsettled = leaveI;
  for (let i = leaveI; i < cap; i++) {
    if (Math.abs(arrays.travel[i]! - restTravel) > SETTLE_TRAVEL_M || Math.abs(arrays.bodyZ[i]! - bodyEnd) > SETTLE_BODY_M) lastUnsettled = i;
  }
  const settled = lastUnsettled < cap - 1;
  const endI = settled ? Math.min(cap, Math.max(lastUnsettled + Math.round(TAIL_S / h), leaveI + Math.round(MIN_AFTER_S / h))) : cap;
  const n = endI;
  const cut = (a: Float32Array): Float32Array => a.subarray(0, n);
  const trace: BumpTrace = {
    n,
    dt: h,
    x: cut(arrays.x),
    roadZ: cut(arrays.roadZ),
    bodyZ: cut(arrays.bodyZ),
    wheelZ: cut(arrays.wheelZ),
    travel: cut(arrays.travel),
    bodyAcc: cut(arrays.bodyAcc),
    tyreN: cut(arrays.tyreN),
    springN: cut(arrays.springN),
    damperN: cut(arrays.damperN),
    stopN: cut(arrays.stopN),
    obstacleAtM: atM,
    reachS,
    leaveS,
    road,
    events,
  };

  const staticN = (corner.sprungKg + corner.unsprungKg) * G;
  let bodyPeak = 0;
  let stopPeak = 0;
  let stopHit = false;
  let tyreMin = Infinity;
  let tyreMax = 0;
  let air = 0;
  let hops = 0;
  let stretch = 0;
  let travelMax = 0;
  let rise = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(trace.bodyAcc[i]!);
    if (a > bodyPeak) bodyPeak = a;
    if (trace.stopN[i]! > 0) {
      stopHit = true;
      if (a > stopPeak) stopPeak = a;
    }
    const fz = trace.tyreN[i]!;
    if (fz < tyreMin) tyreMin = fz;
    if (fz > tyreMax) tyreMax = fz;
    if (fz === 0) {
      air += h;
      stretch += h;
    } else {
      if (stretch >= MIN_HOP_S) hops++;
      stretch = 0;
    }
    const q = trace.travel[i]! - restTravel;
    if (q > travelMax) travelMax = q;
    const up = trace.bodyZ[i]! - corner.bodyStaticM;
    if (up > rise) rise = up;
  }
  if (stretch >= MIN_HOP_S) hops++;
  const hitS = o.lengthM > 0 ? o.lengthM / v : null;
  return {
    scene,
    corner,
    trace,
    stats: {
      bodyPeakG: bodyPeak / G,
      bodyRiseM: rise,
      tyreMin: tyreMin / staticN,
      tyreMax: tyreMax / staticN,
      airS: air,
      hops,
      travelMaxM: travelMax,
      toStopM: corner.bumpStop.travelM,
      stopHit,
      stopPeakG: stopPeak / G,
      settleS: settled ? Math.max(0, (lastUnsettled + 1) * h - leaveS) : null,
      hitS,
      hitHz: hitS ? 1 / hitS : null,
      bodyHz: corner.bodyHz,
      hopHz: corner.hopHz,
      staticN,
    },
  };
}

/** The trace at time `t` (s from the start), linear between samples, into `out`; past the end it holds the last. */
export interface BumpSample {
  x: number;
  roadZ: number;
  bodyZ: number;
  wheelZ: number;
  travel: number;
  bodyAcc: number;
  tyreN: number;
  springN: number;
  damperN: number;
  stopN: number;
}

export const newBumpSample = (): BumpSample => ({ x: 0, roadZ: 0, bodyZ: 0, wheelZ: 0, travel: 0, bodyAcc: 0, tyreN: 0, springN: 0, damperN: 0, stopN: 0 });

export function sampleTrace(trace: BumpTrace, t: number, out: BumpSample): BumpSample {
  const u = Math.min(trace.n - 1, Math.max(0, t / trace.dt));
  const i = Math.min(trace.n - 2, Math.floor(u));
  const f = u - i;
  const lerp = (a: Float32Array): number => a[i]! + (a[i + 1]! - a[i]!) * f;
  out.x = lerp(trace.x);
  out.roadZ = lerp(trace.roadZ);
  out.bodyZ = lerp(trace.bodyZ);
  out.wheelZ = lerp(trace.wheelZ);
  out.travel = lerp(trace.travel);
  out.bodyAcc = lerp(trace.bodyAcc);
  out.tyreN = lerp(trace.tyreN);
  out.springN = lerp(trace.springN);
  out.damperN = lerp(trace.damperN);
  out.stopN = lerp(trace.stopN);
  return out;
}

/** Duration of a run, s. */
export const traceSeconds = (trace: BumpTrace): number => (trace.n - 1) * trace.dt;
