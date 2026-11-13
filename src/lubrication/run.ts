// The oil over a lap, worked out ahead in 10 ms steps: felt gravity tilts and sloshes the oil in the pan, the
// compartment round the pickup fills and drains with its own time constants, oil hangs up in the heads and on the
// walls, the pump draws oil and air through its tube, the gallery pressure follows with a lag and the bearings run
// on their film reserve when it falls short. Two laps: the first settles the oil in circulation, the second is kept.
// The page only plays the result back, so the 3D, the table and the tests all see the same numbers.
// No DOM; LubeRunner works in slices so a page can spread it over idle time.

import { starvationLoad, wearRateAt } from '../designer/reliability.ts';
import { newOilState, oilStep, type OilInput } from '../systems/oil.ts';
import { newLapSample, sampleLap, type LapTrace } from '../vehicle/lap.ts';
import { surfaceSlope } from '../vehicle/mount.ts';
import { Accumulator } from './accumulator.ts';
import { FilmReserve, pressureNeed } from './bearings.ts';
import { CATCH_TURNS, DT, G, HEAD_FLOW_SHARE, REFILL_ABOVE, WELL_RAIN, HEAD_TAU_S, HEAD_TAU_SCAVENGED_S, PRESSURE_TAU_S, SCAVENGE_TAU_S, T_OIL_TRACK, TANK_LOW_L, TANK_SPAN_L, WALL_TAU_S } from './constants.ts';
import { capacity, newLevelSolve, solveLevel, volumeUnder, wettedSize } from './pan.ts';
import { SloshAxis, sloshOmega } from './slosh.ts';
import type { LubeSetup } from './setup.ts';
import { cavitationAeration, DelayLine, inletPressure, pickupOil, windageAeration } from './supply.ts';

export type RiskBand = 'none' | 'hundreds' | 'tens' | 'few' | 'lap';

export interface LubeSummary {
  minPressure: number;
  /** Seconds of the lap with the gallery below what the bearings need. */
  belowNeedS: number;
  /** Seconds with the film reserve used up: the bearings wear. */
  starvedS: number;
  /** Share of the bearings' life used per lap, 0..1. */
  wearPerLap: number;
  /** The model's order of magnitude, not a count: see `band`. */
  lapsToFailure: number | null;
  band: RiskBand;
  /** Longest single stretch below the need, s. */
  longestDipS: number;
}

export interface LubeRun {
  dt: number;
  /** Samples of the kept lap: sample k is at lap time k·dt. */
  count: number;
  lapTime: number;
  /** Gallery pressure and what the bearings need, bar gauge. */
  pressure: Float32Array;
  need: Float32Array;
  /** Share of oil at the screen, and at the pump after the tube, windage and inlet pressure. */
  pickupOil: Float32Array;
  pumpSupply: Float32Array;
  aeration: Float32Array;
  /** Litres: in the pan (wet kinds), in the compartment round the pickup, in each head, on the walls, in the tank and in a dry pan, in the accumulator. */
  panL: Float32Array;
  boxL: Float32Array;
  headL: Float32Array[];
  wallsL: Float32Array;
  tankL: Float32Array;
  dryPanL: Float32Array;
  accOilL: Float32Array;
  /** Levels (h of y = h + sx·x + sz·z, scene units) outside the compartment and in it, and the slopes the surface has. */
  levelOut: Float32Array;
  levelBox: Float32Array;
  slopeX: Float32Array;
  slopeZ: Float32Array;
  /** Litres per second into the compartment: positive while it fills (trap doors open). */
  boxFlow: Float32Array;
  /** Litres per second the counterweights strip off the oil that reaches their orbit. */
  crankCatch: Float32Array;
  /** Surface over the top of the screen's bell, mm. */
  immersion: Float32Array;
  /** Absolute pressure at the pump's inlet, bar. */
  inletBar: Float32Array;
  /** Film reserve left, s. */
  reserve: Float32Array;
  /** Share of the bearings' life used per second. */
  wearRate: Float32Array;
  /** Hydraulic lifters bleeding down (pushrod petrol engines). */
  lifters: Uint8Array;
  /** Oil delivered to the engine, L/s. */
  delivered: Float32Array;
  summary: LubeSummary;
}

export const bandOf = (wearPerLap: number): RiskBand => {
  if (wearPerLap <= 1e-6) return 'none';
  const laps = 1 / wearPerLap;
  return laps >= 100 ? 'hundreds' : laps >= 10 ? 'tens' : laps >= 1 ? 'few' : 'lap';
};

export class LubeRunner {
  readonly setup: LubeSetup;
  readonly trace: LapTrace;
  readonly run: LubeRun;
  private readonly accumulator: Accumulator | null;
  private readonly total: number;
  private step = 0;
  private readonly lapSteps: number;
  private readonly sample = newLapSample();
  private readonly slope = { x: 0, y: 0, z: 0 };
  private readonly sx = new SloshAxis();
  private readonly sz = new SloshAxis();
  private readonly size = { lengthX: 1, lengthZ: 1, depth: 0.5 };
  private readonly solve = newLevelSolve();
  private readonly oilIn: OilInput = { rpm: 0, tempC: T_OIL_TRACK, supply: 1, running: true, live: false };
  private readonly oilOut = newOilState();
  private readonly tube: DelayLine;
  private readonly gallery: DelayLine;
  private readonly reserve = new FilmReserve();
  private hEq = 0;
  private hBox = 0;
  private hOut = 0;
  private hDry = 0;
  private boxL = 0;
  private wallsL = 0;
  private readonly headL: Float64Array;
  private dryPanL = 0;
  private pressure = 0;
  private reliefShare = 0;
  private accumulatorCharge = 0;
  private wallReturn = 0;
  /** Where the returning oil comes from: the counterweights' orbit across, the crank's length along, how far drops fall, the pan's side walls. */
  private readonly crank: { x0: number; x1: number; z0: number; z1: number; drop: number; wallL: number; wallR: number };
  private readonly boxCap: number;
  private readonly outCap: number;
  /** Per column of the whole pan: the bottom of the counterweights' orbit over it, Infinity where they never reach. */
  private readonly orbitFloor: Float64Array;

  constructor(setup: LubeSetup, trace: LapTrace, accumulator: boolean) {
    this.setup = setup;
    this.trace = trace;
    this.lapSteps = Math.ceil(trace.lapTime / DT);
    this.total = 2 * this.lapSteps;
    this.accumulator = accumulator && setup.kind !== 'dry' ? new Accumulator() : null;
    this.headL = new Float64Array(setup.heads.length);
    this.tube = new DelayLine(Math.max(1e-4, setup.tube.litres));
    this.gallery = new DelayLine(Math.max(1e-3, setup.galleryL));
    this.boxCap = capacity(setup.grid.box);
    const e = setup.engine;
    const orbit = (e.r + 0.3 * e.spec.bore) * 0.01;
    const sh = setup.shape;
    this.crank = { x0: -orbit, x1: orbit, z0: e.zMin * 0.01, z1: e.zMax * 0.01, drop: Math.max(0, -sh.yFull), wallL: -sh.halfW, wallR: sh.halfW };
    this.outCap = capacity(setup.grid.outside);
    const all = setup.grid.all;
    this.orbitFloor = new Float64Array(all.count).fill(Infinity);
    for (let i = 0; i < all.count; i++) {
      const x = all.x[i]!;
      const z = all.z[i]!;
      if (Math.abs(x) < orbit && z >= this.crank.z0 && z <= this.crank.z1) this.orbitFloor[i] = -Math.sqrt(orbit * orbit - x * x);
    }
    const n = this.lapSteps;
    const f = (): Float32Array => new Float32Array(n);
    this.run = {
      dt: DT,
      count: n,
      lapTime: trace.lapTime,
      pressure: f(), need: f(), pickupOil: f(), pumpSupply: f(), aeration: f(),
      panL: f(), boxL: f(), headL: setup.heads.map(() => f()), wallsL: f(), tankL: f(), dryPanL: f(), accOilL: f(),
      levelOut: f(), levelBox: f(), slopeX: f(), slopeZ: f(), boxFlow: f(), crankCatch: f(), immersion: f(), inletBar: f(),
      reserve: f(), wearRate: f(), lifters: new Uint8Array(n), delivered: f(),
      summary: { minPressure: 0, belowNeedS: 0, starvedS: 0, wearPerLap: 0, lapsToFailure: null, band: 'none', longestDipS: 0 },
    };
    this.start();
  }

  get done(): boolean {
    return this.step >= this.total;
  }

  /** Share of the work done, 0..1. */
  get progress(): number {
    return this.step / this.total;
  }

  /** Settles everything at the lap's start: oil in circulation for the speed there, the surface at rest under the felt gravity. */
  private start(): void {
    const s = this.setup;
    sampleLap(this.trace, 0, this.sample);
    const rpm = this.sample.rpm;
    this.oilIn.rpm = rpm;
    this.oilIn.supply = 1;
    oilStep(s.oil, this.oilIn, this.oilOut);
    const q = this.deliveredOf(this.oilOut);
    this.wallsL = (1 - HEAD_FLOW_SHARE) * q * WALL_TAU_S;
    const tauH = s.k.headScavenge ? HEAD_TAU_SCAVENGED_S : HEAD_TAU_S;
    for (let i = 0; i < this.headL.length; i++) this.headL[i] = Math.min(s.heads[i]!.capacityL, ((HEAD_FLOW_SHARE * q) / s.heads.length) * tauH);
    this.pressure = this.oilOut.pressure;
    // Fitting an accumulator, one fills the engine with its charge on top of the usual capacity (Canton's instructions).
    if (this.accumulator) this.accumulator.oil = this.accumulatorCharge = this.accumulator.oilAt(this.pressure);
    this.feltSlope(this.sample.axF, this.sample.ayF, this.sample.avF);
    this.sx.reset(this.slope.x);
    this.sz.reset(this.slope.z);
    this.tube.fill(1);
    this.gallery.fill(0);
    this.reserve.reset();
    this.hEq = this.hBox = this.hOut = s.shape.yFull;
    this.hDry = s.shape.yFloor;
    const pan = this.panVolume();
    if (s.kind !== 'dry') {
      solveLevel(s.grid.all, pan, this.sx.slope, this.sz.slope, this.hEq, this.solve);
      this.hEq = this.solve.h;
      this.boxL = Math.min(pan, volumeUnder(s.grid.box, this.hEq, this.sx.slope, this.sz.slope));
      wettedSize(s.grid.all, this.hEq, this.sx.slope, this.sz.slope, this.size, s.grid.dx, s.grid.dz);
    }
  }

  /** Oil of the settled surface that stands inside the counterweights' orbit, litres. */
  private inOrbit(h: number, sx: number, sz: number): number {
    const r = this.setup.grid.all;
    let v = 0;
    for (let i = 0; i < r.count; i++) {
      const o = this.orbitFloor[i]!;
      if (o === Infinity) continue;
      const surface = Math.min(h + sx * r.x[i]! + sz * r.z[i]!, r.ceil[i]!);
      const d = surface - Math.max(o, r.floor[i]!);
      if (d > 0) v += d;
    }
    return v * r.area;
  }

  /**
   * Share of the oil coming back from the crankcase that lands in the compartment round the pickup. The main bearing
   * bulkheads keep it in the bays it was thrown in, so along the crank only the bays over the compartment count. Of
   * that, WELL_RAIN drips off the crank and falls along felt gravity, moving across by sx times the drop: in a long
   * corner it lands by the outer wall rather than in a track pan's box. The rest runs down the side walls and reaches
   * the pan at its edges, gathering on the outer wall under side load: inside a factory well that spans the pan, outside
   * a track pan's box, which only its doors can refill.
   */
  private returnShare(sx: number): number {
    const box = this.setup.shape.box;
    if (!box) return 0;
    const r = this.crank;
    const bays = Math.max(0, Math.min(r.z1, box.z1) - Math.max(r.z0, box.z0)) / (r.z1 - r.z0);
    const shift = sx * r.drop;
    const drops = Math.max(0, Math.min(r.x1 + shift, box.x1) - Math.max(r.x0 + shift, box.x0)) / (r.x1 - r.x0);
    const outer = Math.min(1, Math.max(-1, sx));
    const edge = (x: number): number => (x >= box.x0 - 1e-6 && x <= box.x1 + 1e-6 ? 1 : 0);
    const walls = 0.5 * (1 - outer) * edge(r.wallL) + 0.5 * (1 + outer) * edge(r.wallR);
    return bays * (WELL_RAIN * drops + (1 - WELL_RAIN) * walls);
  }

  private deliveredOf(o: { mains: number; head: number; chain: number; turbo: number; jets: number }): number {
    return (o.mains + o.head + o.chain + o.turbo + o.jets) / 60;
  }

  private feltSlope(ax: number, ay: number, av: number): void {
    surfaceSlope(this.setup.mount, ax, ay, av, G, this.slope);
  }

  /** Oil in the pan of a wet kind, or in the tank of a dry sump, litres. */
  private panVolume(): number {
    let hung = this.wallsL;
    for (let i = 0; i < this.headL.length; i++) hung += this.headL[i]!;
    return this.setup.totalL + this.accumulatorCharge - this.setup.fixedL - hung - (this.accumulator?.oil ?? 0) - this.dryPanL;
  }

  /** Runs up to `maxSteps` steps; true once both laps are done. Slicing gives exactly the result of one go. */
  advance(maxSteps: number): boolean {
    const end = Math.min(this.total, this.step + maxSteps);
    while (this.step < end) this.stepOnce();
    if (this.done) this.summarise();
    return this.done;
  }

  private stepOnce(): void {
    const s = this.setup;
    const shape = s.shape;
    const grid = s.grid;
    const k = s.k;
    const time = this.step * DT;
    const smp = this.sample;
    sampleLap(this.trace, time, smp);
    const rpm = smp.rpm;
    const gn = Math.max(0.5 * G, G + smp.avF);

    // The surface: felt gravity's slope, lagged by the first slosh mode of the oil as it now lies.
    this.feltSlope(smp.axF, smp.ayF, smp.avF);
    const wX = sloshOmega(this.size.lengthX * 0.1, this.size.depth * 0.1, gn);
    const wZ = sloshOmega(this.size.lengthZ * 0.1, this.size.depth * 0.1, gn);
    this.sx.step(this.slope.x, wX, k.zeta, DT);
    this.sz.step(this.slope.z, wZ, k.zeta, DT);
    const sx = this.sx.slope;
    const sz = this.sz.slope;

    let immersion = 0;
    let atScreen = 1;
    let level = shape.yFull;
    let boxFlow = 0;
    let caught = 0;
    let pan = this.panVolume();
    if (s.kind !== 'dry') {
      // Where the oil would settle given time, and how much of it that puts round the pickup.
      solveLevel(grid.all, pan, sx, sz, this.hEq, this.solve);
      this.hEq = this.solve.h;
      wettedSize(grid.all, this.hEq, sx, sz, this.size, grid.dx, grid.dz);
      // Oil a corner or a stop piles up into the counterweights' orbit is stripped off within a few turns and thrown
      // onto the crankcase walls, from where it comes back down like the rest: held up meanwhile, not in the pan.
      if (k.crankCatch > 0 && rpm > 0) {
        const tau = (CATCH_TURNS * 60) / rpm;
        caught = Math.min(1, DT / tau) * k.crankCatch * this.inOrbit(this.hEq, sx, sz);
        this.wallsL += caught;
        pan -= caught;
      }
      const eq = Math.min(pan, volumeUnder(grid.box, this.hEq, sx, sz));
      const period = (2 * Math.PI) / Math.max(1, Math.min(wX || Infinity, wZ || Infinity));
      const tau = Math.max(1e-3, (eq > this.boxL ? k.kIn : k.kOut) * Math.min(3, Math.max(0.2, period)));
      const before = this.boxL;
      this.boxL = eq + (this.boxL - eq) * Math.exp(-DT / tau);
      // What comes down from the crankcase into the compartment joins it at once; the rest joins the pan as a whole,
      // and so does the oil an integrated dry sump scavenges from its heads (where its pumps discharge is not known).
      this.boxL += this.wallReturn * this.returnShare(this.slope.x) * DT;
      this.boxL = Math.min(this.boxL, this.boxCap, pan);
      this.boxL = Math.max(this.boxL, pan - this.outCap, 0);
      boxFlow = (this.boxL - before) / DT;
      solveLevel(grid.box, this.boxL, sx, sz, this.hBox, this.solve);
      this.hBox = this.solve.h;
      solveLevel(grid.outside, Math.max(0, pan - this.boxL), sx, sz, this.hOut, this.solve);
      this.hOut = this.solve.h;
      const p = shape.pickup!;
      level = this.hBox + sx * p.x + sz * p.z;
      // The plane of a full or steeply tilted compartment can stand above its lid; over the pickup the oil cannot.
      if (shape.box) level = Math.min(level, shape.box.top);
      immersion = level - (p.y + p.bell) - p.radius * Math.hypot(sx, sz);
      atScreen = pickupOil(immersion, p.bell);
    } else {
      // A dry sump's pressure stage draws from the tank's bottom outlet, which tilting doesn't uncover.
      atScreen = Math.min(1, Math.max(0, (pan - TANK_LOW_L) / TANK_SPAN_L)) ** 2;
      immersion = (pan - TANK_LOW_L) * 10;
    }

    // Through the suction tube: what the pump gets is what entered the screen a tube's volume ago.
    const displaced = (s.oil.pumpLitresPerRev * rpm) / 60;
    const tubeFlow = displaced * (1 - this.reliefShare);
    const atPump = this.tube.push(atScreen, tubeFlow * DT);
    const lift = (s.tube.inletY - level) * 0.1;
    const inlet = inletPressure(lift, tubeFlow, s.tube.d, s.tube.length);
    const aeration = windageAeration(rpm, s.engine.spec.redlineRpm, k.aeration) + cavitationAeration(inlet);
    const supply = Math.max(0, atPump * (1 - aeration));

    // Gallery pressure with the accumulator's flow, lagged by the gallery's compliance. It refills only from the
    // pressure the bearings can spare, so refilling never starves them.
    const need = pressureNeed(rpm, s.journalR);
    const acc = this.accumulator;
    let accFlow = acc ? acc.flow(this.pressure) : 0;
    if (accFlow < 0) accFlow *= Math.min(1, Math.max(0, (this.pressure - REFILL_ABOVE * need) / (0.5 * need)));
    this.oilIn.rpm = rpm;
    this.oilIn.supply = supply;
    this.oilIn.extraFlow = accFlow * 60;
    this.oilIn.scavengeSupply = 1;
    oilStep(s.oil, this.oilIn, this.oilOut);
    this.pressure += (this.oilOut.pressure - this.pressure) * (1 - Math.exp(-DT / PRESSURE_TAU_S));
    this.reliefShare = this.oilOut.pumpFlow > 1e-9 ? this.oilOut.reliefFlow / this.oilOut.pumpFlow : 0;
    acc?.step(accFlow, DT);

    // Oil in circulation: up to the heads and off the bearings onto the walls, back down by gravity or scavenge.
    const q = this.deliveredOf(this.oilOut);
    const wallsOut = this.wallsL / WALL_TAU_S;
    this.wallsL += ((1 - HEAD_FLOW_SHARE) * q - wallsOut) * DT;
    const heads = s.heads;
    const tauH = k.headScavenge ? HEAD_TAU_SCAVENGED_S : HEAD_TAU_S;
    // Felt gravity in the engine's cross-section, (gX, -gn): which way each head drains. slope.x = -a_X / gn.
    const gX = this.slope.x * gn;
    const down = gn;
    let headsOut = 0;
    for (let i = 0; i < heads.length; i++) {
      const a = (heads[i]!.alpha * Math.PI) / 180;
      const dx = -Math.sin(a);
      const dy = -Math.cos(a) - 0.5;
      const norm = Math.hypot(dx, dy);
      const rest = (G * -dy) / norm;
      // Felt gravity is (gX, -down) in the X-Y plane, against the car's acceleration.
      const now = (gX * dx + -down * dy) / norm;
      const f = k.headScavenge ? 1 : Math.min(3, Math.max(0, now / rest));
      const out = (f * this.headL[i]!) / tauH;
      let next = this.headL[i]! + ((HEAD_FLOW_SHARE * q) / heads.length - out) * DT;
      if (next > heads[i]!.capacityL) {
        // A full head overflows down the other paths into the crankcase.
        this.wallsL += next - heads[i]!.capacityL;
        next = heads[i]!.capacityL;
      }
      this.headL[i] = Math.max(0, next);
      headsOut += out;
    }
    this.wallReturn = s.kind !== 'dry' ? wallsOut : 0;

    let tank = 0;
    if (s.kind === 'dry') {
      // The shallow pan collects what falls; the scavenge stages empty it while their pickups are covered.
      const ret = wallsOut + headsOut;
      solveLevel(grid.all, this.dryPanL, sx, sz, this.hDry, this.solve);
      this.hDry = this.solve.h;
      let covered = 0;
      for (const p of shape.scavenge) covered += pickupOil(this.hDry + sx * p.x + sz * p.z - (shape.yFloor + 0.06), 0.06);
      covered /= Math.max(1, shape.scavenge.length);
      const capacityLs = (s.oil.scavengeLitresPerRev * rpm) / 60;
      const scavenged = Math.min(this.dryPanL / SCAVENGE_TAU_S, capacityLs * Math.max(0.15, covered));
      this.dryPanL = Math.max(0, this.dryPanL + (ret - scavenged) * DT);
      tank = this.panVolume();
      wettedSize(grid.all, this.hDry, sx, sz, this.size, grid.dx, grid.dz);
      level = this.hDry;
    }

    // Bearings: the film reserve, then wear.
    this.reserve.step(this.pressure, need, DT);
    const load = starvationLoad(rpm, smp.throttle, { margin: this.pressure / need, reserveLeft: this.reserve.left });
    const wear = wearRateAt(load);
    // Lifters see the gallery's oil a gallery's volume later.
    const bad = supply < 0.85 || this.pressure < 0.5 * need ? 1 : 0;
    const atLifters = this.gallery.push(bad, q * DT);

    if (this.step >= this.lapSteps) {
      const i = this.step - this.lapSteps;
      const r = this.run;
      r.pressure[i] = this.pressure;
      r.need[i] = need;
      r.pickupOil[i] = atScreen;
      r.pumpSupply[i] = supply;
      r.aeration[i] = aeration;
      r.panL[i] = s.kind === 'dry' ? 0 : this.panVolume();
      r.boxL[i] = this.boxL;
      for (let h = 0; h < this.headL.length; h++) r.headL[h]![i] = this.headL[h]!;
      r.wallsL[i] = this.wallsL;
      r.tankL[i] = tank;
      r.dryPanL[i] = this.dryPanL;
      r.accOilL[i] = acc?.oil ?? 0;
      r.levelOut[i] = s.kind === 'dry' ? this.hDry : this.hOut;
      r.levelBox[i] = s.kind === 'dry' ? this.hDry : this.hBox;
      r.slopeX[i] = sx;
      r.slopeZ[i] = sz;
      r.boxFlow[i] = boxFlow;
      r.crankCatch[i] = caught / DT;
      r.immersion[i] = immersion * 100;
      r.inletBar[i] = inlet;
      r.reserve[i] = this.reserve.seconds;
      r.wearRate[i] = wear;
      r.lifters[i] = s.lifters && atLifters > 0.5 ? 1 : 0;
      r.delivered[i] = q;
    }
    this.step++;
  }

  private summarise(): void {
    const r = this.run;
    let min = Infinity;
    let below = 0;
    let starved = 0;
    let wear = 0;
    let dip = 0;
    let longest = 0;
    for (let i = 0; i < r.count; i++) {
      min = Math.min(min, r.pressure[i]!);
      if (r.pressure[i]! < r.need[i]!) {
        below += DT;
        dip += DT;
        longest = Math.max(longest, dip);
      } else dip = 0;
      if (r.reserve[i]! <= 0) starved += DT;
      wear += r.wearRate[i]! * DT;
    }
    r.summary = { minPressure: min, belowNeedS: below, starvedS: starved, wearPerLap: wear, lapsToFailure: wear > 1e-6 ? 1 / wear : null, band: bandOf(wear), longestDipS: longest };
  }
}

/** The whole run at once, for tests and scripts. */
export function runLubrication(setup: LubeSetup, trace: LapTrace, accumulator = false): LubeRun {
  const runner = new LubeRunner(setup, trace, accumulator);
  runner.advance(Number.MAX_SAFE_INTEGER);
  return runner.run;
}
