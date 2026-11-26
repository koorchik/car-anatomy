// The rough-road scene (suspensions plan, scenes, the rough road, stage P3): one corner drives along an ISO 8608 road
// at a steady speed. Two things answer the same question in two ways:
//   - a run in time on the road of a fixed seed (RoughRun): the bars of the ride triangle and what the page plays back.
//     The same corner, road and seed give the same numbers, so the visitor's 'remember as A' compares fairly;
//   - the frequency-domain estimate swept over the damping (roughSweep): the curves «ζ against comfort and grip», with
//     the minimum of each read off the model, not taken from the plan's «about 0.2».
// A run is a few tens of thousands of quarter-car steps and the road segments under them (about 0.1 s), so the page
// computes it ahead in portions (advance), like the shaker's points; portions give the numbers of one go.
// Pure: no DOM, no text.

import { comfortBands, RideMeter, type ComfortBand, type RideResult } from './comfort.ts';
import { lineariseQuarter, roughRoadEstimate, type QuarterLinear, type RoughRoadEstimate } from './evaluate.ts';
import { G } from './forces.ts';
import { QUARTER_STEP_S, QuarterSim } from './quarter.ts';
import { Iso8608Road, RoadBuffer, type RoadClass } from './road.ts';
import { resolveCorner, type CornerSetup, type ResolvedCorner } from './setup.ts';
import type { CornerSpec } from './spec.ts';
import { tyreAt, type Tyre } from '../vehicle/tyre.ts';

export const ROAD_CLASSES: readonly RoadClass[] = ['A', 'B', 'C', 'D'];
/** Unsprung masses of step 4, kg (the plan's choice; the page corner's own is 40). */
export const ROUGH_UNSPRUNG_KG: readonly number[] = [30, 40, 50, 60];
/** Limits of the speed control, km/h: the plan's 90 (step 1) and 140 (step 3) inside them. */
export const ROUGH_SPEED_KMH: readonly [number, number] = [20, 140];
/** The road's seed: fixed, so a change of the setup is compared on the same road. */
export const ROUGH_SEED = 1;
/** Seconds the run measures, after ROUGH_SETTLE_S from rest that it does not. */
export const ROUGH_RUN_S = 20;
export const ROUGH_SETTLE_S = 2;

export interface RoughScene {
  roadClass: RoadClass;
  speedKmh: number;
  unsprungKg: number;
}

/** What the page opens with (step 1): class B at 90 km/h on the corner's own 40 kg wheel. */
export const ROUGH_DEFAULT: RoughScene = { roadClass: 'B', speedKmh: 90, unsprungKg: 40 };
/** Step 3: a broken road at 140 km/h, where the wheel starts leaving it. */
export const ROUGH_BROKEN: Pick<RoughScene, 'roadClass' | 'speedKmh'> = { roadClass: 'C', speedKmh: 140 };

/** A scene with every field valid (a link may carry anything). */
export function clampRough(s: Partial<RoughScene>): RoughScene {
  const speed = Number(s.speedKmh);
  const mass = Number(s.unsprungKg);
  return {
    roadClass: ROAD_CLASSES.includes(s.roadClass as RoadClass) ? (s.roadClass as RoadClass) : ROUGH_DEFAULT.roadClass,
    speedKmh: Number.isFinite(speed) ? Math.min(ROUGH_SPEED_KMH[1], Math.max(ROUGH_SPEED_KMH[0], speed)) : ROUGH_DEFAULT.speedKmh,
    unsprungKg: ROUGH_UNSPRUNG_KG.includes(mass) ? mass : ROUGH_DEFAULT.unsprungKg,
  };
}

/** The corner on the scene's wheel, resolved with the setup. */
export function resolveRoughCorner(corner: CornerSpec, setup: CornerSetup, scene: RoughScene): ResolvedCorner {
  return resolveCorner({ ...corner, unsprungKg: scene.unsprungKg }, setup);
}

/** The road of a scene: the left wheel track of the class and the seed. */
export const roughProfile = (scene: RoughScene): Iso8608Road => new Iso8608Road({ roadClass: scene.roadClass, seed: ROUGH_SEED });

/** The tyre that judges grip, fitted to the corner's static load. */
export const roughTyre = (rc: ResolvedCorner): Tyre => tyreAt(rc.corner.tyre, (rc.sprungKg + rc.unsprungKg) * G);

/** The ride triangle of one run, with the words ISO 2631-1 gives its comfort. */
export interface RoughResult extends RideResult {
  bands: ComfortBand[];
  /** Travel from rest to the bump stop, m. */
  toStopM: number;
}

/** One run sampled every QUARTER_STEP_S, as BumpTrace (sampleTrace reads both). */
export interface RoughTrace {
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
}

/** A run in time on the scene's road, computed in portions. */
export class RoughRun {
  readonly corner: ResolvedCorner;
  readonly scene: RoughScene;
  readonly trace: RoughTrace;
  /** The raw road for the 3D: the profile on the 5 mm grid, without the tyre's envelope. */
  readonly road: RoadBuffer;
  private readonly sim: QuarterSim;
  private readonly meter: RideMeter;
  private readonly settleSteps: number;
  private i = 0;
  private finished: RoughResult | null = null;

  constructor(corner: ResolvedCorner, raw: RoughScene, seconds = ROUGH_RUN_S) {
    const scene = clampRough(raw);
    this.corner = corner;
    this.scene = scene;
    const profile = roughProfile(scene);
    this.road = new RoadBuffer(profile, 0, 0);
    const v = scene.speedKmh / 3.6;
    this.sim = new QuarterSim(corner, new RoadBuffer(profile, corner.tyre.freeRadiusM, corner.tyre.patchM), v);
    this.sim.reset(0);
    const staticN = (corner.sprungKg + corner.unsprungKg) * G;
    this.meter = new RideMeter({
      sampleHz: 1 / QUARTER_STEP_S, staticN, tyre: roughTyre(corner), staticTravelM: corner.staticTravelM,
      bumpStopTravelM: corner.bumpStop.travelM,
    });
    this.settleSteps = Math.round(ROUGH_SETTLE_S / QUARTER_STEP_S);
    const n = this.settleSteps + Math.round(seconds / QUARTER_STEP_S);
    const f32 = (): Float32Array => new Float32Array(n);
    this.trace = {
      n, dt: QUARTER_STEP_S, x: f32(), roadZ: f32(), bodyZ: f32(), wheelZ: f32(), travel: f32(), bodyAcc: f32(), tyreN: f32(),
      springN: f32(), damperN: f32(), stopN: f32(),
    };
  }

  get done(): boolean {
    return this.finished !== null;
  }

  /** Share of the run computed, 0…1. */
  get progress(): number {
    return this.i / this.trace.n;
  }

  /** The triangle of the measured part; null until the run is done. */
  get result(): RoughResult | null {
    return this.finished;
  }

  /** Runs up to `maxSteps` steps. Returns true when the run is done. */
  advance(maxSteps: number): boolean {
    const { sim, trace, meter } = this;
    const out = sim.out;
    const end = Math.min(trace.n, this.i + maxSteps);
    for (let i = this.i; i < end; i++) {
      // Sample i is the state at i·h with the forces on it: step() fills `out` for the state it starts from.
      sim.step(QUARTER_STEP_S);
      trace.x[i] = out.x;
      trace.roadZ[i] = out.roadZ;
      trace.bodyZ[i] = out.bodyZ;
      trace.wheelZ[i] = out.wheelZ;
      trace.travel[i] = out.travel;
      trace.bodyAcc[i] = out.bodyAcc;
      trace.tyreN[i] = out.tyreN;
      trace.springN[i] = out.springN;
      trace.damperN[i] = out.damperN;
      trace.stopN[i] = out.stopN;
      if (i >= this.settleSteps) meter.push(out);
    }
    this.i = end;
    if (end >= trace.n && !this.finished) {
      const r = meter.result();
      this.finished = { ...r, bands: comfortBands(r.comfortAw), toStopM: this.corner.bumpStop.travelM };
    }
    return this.done;
  }

  /** Runs to the end (tests and scripts). */
  run(): RoughResult {
    this.advance(Infinity);
    return this.finished!;
  }
}

// ---------------------------------------------------------------------------------------------------------------------

/** Damping ratios of the sweep: 0.05 to 1 by 0.025 (the chart's axis). */
export const SWEEP_ZETAS: readonly number[] = Array.from({ length: 39 }, (_, i) => 0.05 + i * 0.025);

/** The frequency-domain triangle over the damping, for one corner, road and speed. */
export interface RoughSweep {
  zetas: readonly number[];
  comfortAw: Float64Array;
  dlc: Float64Array;
  airShare: Float64Array;
  /** The corner's own damping and its estimate (a point on both curves). */
  zeta: number;
  current: RoughRoadEstimate;
  /** Where each curve is lowest, refined between grid points by a parabola. */
  bestComfortZeta: number;
  bestGripZeta: number;
}

/**
 * The linear corner with its damper scaled to the damping ratio `zeta`: the presets and ζ of the setup all give the
 * OptimumG coefficients at the ride frequency, which are proportional to ζ (dampingFromZeta), knee and split included.
 */
export function withZeta(lin: QuarterLinear, rcZeta: number, zeta: number): QuarterLinear {
  const s = zeta / rcZeta;
  return { ...lin, c: lin.c * s, damper: { ...lin.damper, compression: lin.damper.compression * s, rebound: lin.damper.rebound * s } };
}

/** Minimum of samples y over x by the parabola through the lowest grid point and its neighbours. */
function argMin(x: readonly number[], y: Float64Array): number {
  let k = 0;
  for (let i = 1; i < y.length; i++) if (y[i] < y[k]) k = i;
  if (k === 0 || k === y.length - 1) return x[k];
  const [a, b, c] = [y[k - 1], y[k], y[k + 1]];
  const den = a - 2 * b + c;
  const h = x[k + 1] - x[k];
  return den > 0 ? x[k] + (h * (a - c)) / (2 * den) : x[k];
}

export function roughSweep(rc: ResolvedCorner, raw: RoughScene): RoughSweep {
  const scene = clampRough(raw);
  const lin = lineariseQuarter(rc);
  const road = { roadClass: scene.roadClass, speedMs: scene.speedKmh / 3.6 };
  const opts = { patchM: rc.tyre.patchM, tyre: roughTyre(rc) };
  const n = SWEEP_ZETAS.length;
  const comfortAw = new Float64Array(n);
  const dlc = new Float64Array(n);
  const airShare = new Float64Array(n);
  SWEEP_ZETAS.forEach((zeta, i) => {
    const e = roughRoadEstimate(withZeta(lin, rc.zeta, zeta), road, opts);
    comfortAw[i] = e.comfortAw;
    dlc[i] = e.dlc;
    airShare[i] = e.airShare;
  });
  return {
    zetas: SWEEP_ZETAS,
    comfortAw,
    dlc,
    airShare,
    zeta: rc.zeta,
    current: roughRoadEstimate(lin, road, opts),
    bestComfortZeta: argMin(SWEEP_ZETAS, comfortAw),
    bestGripZeta: argMin(SWEEP_ZETAS, dlc),
  };
}
