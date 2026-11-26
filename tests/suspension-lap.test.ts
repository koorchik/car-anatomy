// The lap with weight transfer (src/suspension/lap.ts, level L2): the point lap stays the oil page's, the L2 lap keeps
// every axle inside its friction ellipse, and at rest the friction circles are the lap's μ.

import { describe, expect, it } from 'vitest';
import { CARS } from '../src/data/cars.ts';
import { engineById, engineFacts } from '../src/data/engines.ts';
import { SUMP_CARS, type SumpCar } from '../src/data/sump-cars.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { lapFor, lapPowertrain, testTrack } from '../src/lubrication/scenario.ts';
import { buildChassis } from '../src/suspension/chassis.ts';
import {
  axleGripLimit, axleUsage, ESTIMATED_FRONT_TRANSFER_EXTRA, gripChassisFor, gripChassisOf, gripModel, traceUsage, transferLap,
  wheelLoads, type GripChassis,
} from '../src/suspension/lap.ts';
import { settle } from '../src/suspension/statics.ts';
import { typicalChassis, type TypicalCar } from '../src/suspension/templates/typical-chassis.ts';
import { G } from '../src/vehicle/constants.ts';
import { CANONICAL_LAP_LEVEL, newLapSample, sampleLap, simulateLap, timeAtDistance, type LapTrace } from '../src/vehicle/lap.ts';
import { roadLoadN } from '../src/vehicle/road-load.ts';
import { buildTrack, TEST_CIRCUIT, type TrackDef } from '../src/vehicle/track.ts';
import { lateralPeakN } from '../src/vehicle/tyre.ts';
import { TYRE_IDS, TYRES, type TyreId } from '../src/vehicle/vehicle.ts';

const recordOf = (c: SumpCar) => {
  const r = CARS[c.car!];
  if (!r) throw new Error(`${c.engineId} has no car record`);
  return r;
};
const designOf = (c: SumpCar) => designFromSpec(engineById(c.engineId)!);
const hpOf = (c: SumpCar) => engineFacts(c.engineId)?.powerHp ?? null;

const laps = new Map<string, { point: LapTrace; l2: LapTrace; gc: GripChassis }>();
/** The oil page's lap and the L2 lap of the same car, engine and tyres. */
function pair(c: SumpCar, tyre: TyreId): { point: LapTrace; l2: LapTrace; gc: GripChassis } {
  const key = `${c.car}/${tyre}`;
  let p = laps.get(key);
  if (!p) {
    const point = lapFor(designOf(c), hpOf(c), c.vehicle, tyre);
    const gc = gripChassisFor(recordOf(c), TYRES[tyre]);
    const l2 = transferLap(testTrack(), c.vehicle, TYRES[tyre], lapPowertrain(designOf(c), hpOf(c), c.vehicle), gc);
    p = { point, l2, gc };
    laps.set(key, p);
  }
  return p;
}

const maxOf = (a: ArrayLike<number>): number => {
  let m = -Infinity;
  for (let i = 0; i < a.length; i++) m = Math.max(m, a[i]!);
  return m;
};

/** A rear-drive sedan on double wishbones, as in the chassis tests (every number typical). */
const SEDAN: TypicalCar = {
  id: 'sedan', massKg: 1500, frontShare: 0.55, cgHeightM: 0.55, wheelbaseM: 2.7, trackM: [1.52, 1.54],
  front: 'double-wishbone', rear: 'double-wishbone', drive: 'rwd', barsMm: [22, 14], unsprungKg: [45, 45], rideHz: [1.3, 1.45],
};

describe('the point lap', () => {
  it('is the oil page lap: same time, the trace bit for bit without a grip model', () => {
    for (const c of SUMP_CARS) {
      const page = lapFor(designOf(c), hpOf(c), c.vehicle, 'street');
      const pt = lapPowertrain(designOf(c), hpOf(c), c.vehicle);
      const plain = simulateLap(testTrack(), c.vehicle, TYRES.street, pt, { grip: undefined });
      expect(plain.lapTime).toBe(page.lapTime);
      expect(plain.v).toEqual(page.v);
      expect(plain.axF).toEqual(page.axF);
      expect(pair(c, 'street').point.lapTime).toBe(page.lapTime);
    }
  });

  it('is still the canonical lap: L2 becomes canonical only at stage C3a', () => {
    expect(CANONICAL_LAP_LEVEL).toBe('L1');
  });

  it('asks more than the tyres have in the limit corners', () => {
    for (const c of SUMP_CARS) {
      const { point, gc } = pair(c, 'street');
      expect(maxOf(traceUsage(gc, point)), c.car).toBeGreaterThan(1.05);
    }
  });
});

describe('the lap with weight transfer', () => {
  it('never overfills the limiting axle\'s friction ellipse', () => {
    for (const c of SUMP_CARS) {
      for (const tyre of TYRE_IDS) {
        const { l2, gc } = pair(c, tyre);
        expect(maxOf(traceUsage(gc, l2)), `${c.car} ${tyre}`).toBeLessThanOrEqual(1.01);
      }
    }
  });

  it('is slower than the point lap, and the same car on better tyres is still faster', () => {
    for (const c of SUMP_CARS) {
      const times = TYRE_IDS.map((tyre) => pair(c, tyre).l2.lapTime);
      TYRE_IDS.forEach((tyre, k) => expect(times[k]!, `${c.car} ${tyre}`).toBeGreaterThan(pair(c, tyre).point.lapTime));
      expect(times[1]!).toBeLessThan(times[0]!);
      expect(times[2]!).toBeLessThan(times[1]!);
    }
  });

  it('runs at the limit: somewhere the limiting axle is on its ellipse', () => {
    for (const c of SUMP_CARS) {
      const { l2, gc } = pair(c, 'street');
      expect(maxOf(traceUsage(gc, l2)), c.car).toBeGreaterThan(0.995);
    }
  });

  it('carries the weight it loads: the four wheel loads sum to m·(g + a_v) at every sample', () => {
    const { l2, gc } = pair(SUMP_CARS[0]!, 'street');
    const fz = [0, 0, 0, 0];
    for (let i = 0; i < l2.t.length; i++) {
      wheelLoads(gc, l2.v[i]!, l2.ax[i]!, l2.ay[i]!, G + l2.av[i]!, fz);
      const sum = fz[0]! + fz[1]! + fz[2]! + fz[3]!;
      expect(Math.abs(sum / (gc.massKg * (G + l2.av[i]!)) - 1)).toBeLessThan(0.01);
    }
  });

  it('loads the front axle beyond its static load braking into the hairpin', () => {
    const { l2, gc } = pair(SUMP_CARS[0]!, 'street');
    const track = l2.track;
    const hairpin = track.sectors.findIndex((s) => s.id === 'hairpin');
    const start = track.sector.indexOf(hairpin);
    const fz = [0, 0, 0, 0];
    let most = 0;
    for (let i = Math.max(0, start - 150); i < start; i++) {
      if (!(l2.brake[i]! > 0.5)) continue;
      wheelLoads(gc, l2.v[i]!, l2.ax[i]!, l2.ay[i]!, G + l2.av[i]!, fz);
      most = Math.max(most, (fz[0]! + fz[1]!) / (gc.massKg * G * gc.frontShare));
    }
    expect(most).toBeGreaterThan(1.15);
  });

  it('keeps the tyres on the road over a crest, as the point lap does', () => {
    // The test circuit's crest, sharpened to R_v 100 m: the car leaves the road above √(g·R) ≈ 31 m/s.
    const radius = 100;
    const def: TrackDef = {
      ...TEST_CIRCUIT,
      id: 'sharp-crest',
      pieces: TEST_CIRCUIT.pieces.map((p) => (p.kind === 'straight' && p.crest ? { ...p, crest: { ...p.crest, radius } } : p)),
    };
    const track = buildTrack(def, 1);
    const c = SUMP_CARS[0]!;
    const pt = lapPowertrain(designOf(c), hpOf(c), c.vehicle);
    const l2 = transferLap(track, c.vehicle, TYRES.street, pt, gripChassisFor(recordOf(c)));
    let crest = 0;
    for (let i = 0; i < track.n; i++) {
      expect(G + l2.av[i]!, `sample ${i}`).toBeGreaterThan(0);
      if (track.kappaV[i]! < 0) crest = Math.max(crest, l2.v[i]!);
    }
    expect(crest).toBeLessThanOrEqual(Math.sqrt(G * radius) + 1e-6);
  });

  it('is computed in a fraction of a second', () => {
    const c = SUMP_CARS[0]!;
    const pt = lapPowertrain(designOf(c), hpOf(c), c.vehicle);
    const gc = gripChassisFor(recordOf(c));
    const t0 = performance.now();
    transferLap(testTrack(), c.vehicle, TYRES.street, pt, gc);
    expect(performance.now() - t0).toBeLessThan(600);
  });
});

describe('friction circles and axle limits', () => {
  it('match the lap\'s μ at rest: each wheel within its convexity, the four together 0–2 % under μ·m·g', () => {
    for (const c of SUMP_CARS) {
      for (const tyre of TYRE_IDS) {
        const gc = gripChassisFor(recordOf(c), TYRES[tyre]);
        const mu = TYRES[tyre].mu;
        const fz = [0, 0, 0, 0];
        wheelLoads(gc, 0, 0, 0, G, fz);
        // A wheel at the mean static load is the tyre's fit exactly.
        expect(lateralPeakN(gc.tyre.set, (gc.massKg * G) / 4) / ((gc.massKg * G) / 4)).toBeCloseTo(mu, 9);
        for (const f of fz) expect(Math.abs(lateralPeakN(gc.tyre.set, f) / f / mu - 1), `${c.car} ${tyre}`).toBeLessThan(tyre === 'slick' ? 0.09 : 0.05);
        const rest = axleGripLimit(gc, 0, 0, 0);
        const ratio = (rest.lateralN[0] + rest.lateralN[1]) / (mu * gc.massKg * G);
        expect(ratio, `${c.car} ${tyre}`).toBeLessThanOrEqual(1 + 1e-12);
        expect(ratio, `${c.car} ${tyre}`).toBeGreaterThan(tyre === 'street' ? 0.989 : 0.979);
      }
    }
  });

  it('shrink with lateral acceleration: weight transfer costs the axle grip', () => {
    for (const c of SUMP_CARS) {
      const gc = gripChassisFor(recordOf(c));
      const rest = axleGripLimit(gc, 0, 0, 0);
      const turning = axleGripLimit(gc, 0, 0, 0.8 * G);
      for (const k of [0, 1] as const) expect(turning.lateralN[k]).toBeLessThan(rest.lateralN[k]);
      const model = gripModel(gc);
      const lim = { ayMax: 0, brakeMax: 0, driveMax: 0 };
      model.limit(0, 0, 0, G, lim);
      const atRest = lim.ayMax;
      model.limit(0, 0, 0.9 * G, G, lim);
      expect(lim.ayMax).toBeLessThan(atRest);
    }
  });

  it('read the same at rest whether the transfer comes from a record or a chassis', () => {
    const chassis = buildChassis(typicalChassis(SEDAN));
    const gc = gripChassisOf(chassis);
    expect(gc.transferFrom).toBe('roll-model');
    const rest = axleGripLimit(gc, 0, 0, 0);
    expect((rest.lateralN[0] + rest.lateralN[1]) / (TYRES.street.mu * gc.massKg * G)).toBeGreaterThan(0.99);
  });

  it('take a chassis\' transfer from its roll model: the steady wheel loads of ChassisSim', () => {
    const chassis = buildChassis(typicalChassis(SEDAN));
    const gc = gripChassisOf(chassis);
    // The whole car's overturning moment m·a_y·h, plus the body's weight swung out by its roll (a few per cent).
    const moment = gc.transferPerAy[0] * gc.tracks[0] + gc.transferPerAy[1] * gc.tracks[1];
    expect(moment / (gc.massKg * gc.cgHeightM)).toBeGreaterThan(1);
    expect(moment / (gc.massKg * gc.cgHeightM)).toBeLessThan(1.1);
    const ay = 0.3 * G;
    const steady = settle(chassis, ay);
    const fz = [0, 0, 0, 0];
    wheelLoads(gc, 0, 0, ay, G, fz);
    for (let i = 0; i < 4; i++) expect(Math.abs(fz[i]! - steady.fz[i]!) / steady.fz[i]!).toBeLessThan(0.03);
  });

  it('estimate a record\'s split by the baseline: the front takes its weight share plus 5 %', () => {
    const c = SUMP_CARS[0]!;
    const gc = gripChassisFor(recordOf(c));
    expect(gc.transferFrom).toBe('estimate');
    const front = gc.transferPerAy[0] * gc.tracks[0];
    const total = front + gc.transferPerAy[1] * gc.tracks[1];
    expect(total).toBeCloseTo(gc.massKg * gc.cgHeightM, 6);
    expect(front / total).toBeCloseTo(gc.frontShare + ESTIMATED_FRONT_TRANSFER_EXTRA, 9);
  });

  it('share braking between the axles and driving on the driven ones', () => {
    const c = SUMP_CARS[0]!; // Camaro: rear drive
    const gc = gripChassisFor(recordOf(c));
    const braking = axleUsage(gc, 30, -8, 0);
    expect(braking.fx[0]).toBeLessThan(0);
    expect(braking.fx[1]).toBeLessThan(0);
    expect(braking.usage[0]).toBeCloseTo(braking.usage[1], 6);
    const driving = axleUsage(gc, 30, 3, 0);
    expect(driving.fx[0]).toBe(0);
    expect(driving.fx[1]).toBeGreaterThan(0);
    expect(driving.fx[1] / (gc.massKg * 3 + roadLoadN(gc.roadLoad, 30, 0))).toBeCloseTo(1, 9);
  });
});

describe('time at distance', () => {
  it('gives the time each sample starts at and lands where it says on the track', () => {
    const { point, l2 } = pair(SUMP_CARS[0]!, 'street');
    const ds = point.track.ds;
    const length = point.t.length * ds;
    const s = newLapSample();
    for (const trace of [point, l2]) {
      expect(timeAtDistance(trace, 0)).toBe(0);
      expect(timeAtDistance(trace, 100 * ds)).toBeCloseTo(trace.t[100]!, 9);
      expect(timeAtDistance(trace, length + 100 * ds)).toBeCloseTo(trace.t[100]!, 9);
      expect(timeAtDistance(trace, length - 1e-6)).toBeCloseTo(trace.lapTime, 4);
      let last = -1;
      for (let d = 0; d < length; d += 37.3) {
        const t = timeAtDistance(trace, d);
        expect(t).toBeGreaterThan(last);
        last = t;
        sampleLap(trace, t, s);
        expect(s.s).toBeCloseTo(d, 6);
      }
    }
    // The two levels reach the same point of the track at different times: that is why pages pass ls=, not a time.
    expect(timeAtDistance(l2, length / 2)).toBeGreaterThan(timeAtDistance(point, length / 2));
  });
});
