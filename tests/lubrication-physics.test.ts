import { describe, expect, it } from 'vitest';
import { engineById } from '../src/data/engines.ts';
import { sumpCarFor } from '../src/data/sump-cars.ts';
import { starvationLoad, wearRateAt } from '../src/designer/reliability.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { systemsOf, type SumpKind } from '../src/engine/systems-spec.ts';
import { Accumulator } from '../src/lubrication/accumulator.ts';
import { FilmReserve, mainJournalRadius, pressureNeed } from '../src/lubrication/bearings.ts';
import { DT, FILM_BAR, HEAD_FLOW_SHARE, HEAD_TAU_S, T_OIL_TRACK, WALL_TAU_S } from '../src/lubrication/constants.ts';
import { capacity, newLevelSolve, solveLevel, volumeUnder, type PanRegion } from '../src/lubrication/pan.ts';
import { runLubrication } from '../src/lubrication/run.ts';
import { setupFor, testTrack } from '../src/lubrication/scenario.ts';
import { SloshAxis, sloshOmega, stepOvershoot } from '../src/lubrication/slosh.ts';
import { DelayLine } from '../src/lubrication/supply.ts';
import { newOilState, oilParams, oilStep } from '../src/systems/oil.ts';
import type { WellPlace } from '../src/systems/sump.ts';
import { simulateLap, type LapTrace } from '../src/vehicle/lap.ts';
import { idealGearbox } from '../src/vehicle/powertrain.ts';
import { G, TYRES, type VehicleSpec } from '../src/vehicle/vehicle.ts';

/** A lap that holds one speed and one acceleration throughout, for the steady-state checks. */
function steadyTrace(rpm: number, ax: number, ay: number, av = 0): LapTrace {
  const track = testTrack();
  const pt = idealGearbox({ torqueAt: () => 400, idleRpm: 800, redlineRpm: 6600, gears: 6, spread: 4.3, topSpeedMs: 70, tyreRadiusM: 0.33, efficiency: 0.85 });
  const car: VehicleSpec = { name: 'x', massKg: 1500, cdA: 0.7, clA: 0, crr: 0.015, drive: 'rwd', drivenShare: 0.5, tyreRadiusM: 0.33, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } };
  const lap = simulateLap(track, car, TYRES.street, pt);
  for (const [arr, v] of [[lap.axF, ax], [lap.ax, ax], [lap.ayF, ay], [lap.ay, ay], [lap.avF, av], [lap.av, av], [lap.rpm, rpm], [lap.throttle, 1]] as const) arr.fill(v);
  return lap;
}

const engineOf = (id: string) => {
  const spec = engineById(id)!;
  return { engine: buildEngine(spec), systems: systemsOf(spec), car: sumpCarFor(id)!.vehicle };
};
const choice = (kind: SumpKind, place: WellPlace = 'middle', oilDeltaL = 0) => ({ kind, oilDeltaL, accumulator: false, place });

/** A flat-floored box, for checking the pan's volume against geometry. */
function box(W: number, L: number, floor: number, ceil: number, n = 10): PanRegion {
  const count = n * n;
  const r: PanRegion = { count, x: new Float64Array(count), z: new Float64Array(count), floor: new Float64Array(count).fill(floor), ceil: new Float64Array(count).fill(ceil), area: (W / n) * (L / n) };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    r.x[i * n + j] = -W / 2 + (i + 0.5) * (W / n);
    r.z[i * n + j] = -L / 2 + (j + 0.5) * (L / n);
  }
  return r;
}

describe('pan volume', () => {
  const r = box(2, 4, -1, 0);
  it('matches the box for a level and for a tilted surface that does not reach the floor', () => {
    expect(volumeUnder(r, -0.5, 0, 0)).toBeCloseTo(2 * 4 * 0.5, 9);
    // A tilt about the centre keeps the mean depth while the surface stays clear of floor and lid.
    expect(volumeUnder(r, -0.5, 0.1, 0.05)).toBeCloseTo(2 * 4 * 0.5, 9);
    expect(capacity(r)).toBeCloseTo(8, 9);
  });

  it('solves the level back to within 0.1 mm, and never loses volume as the level rises', () => {
    const out = newLevelSolve();
    for (const [h, sx, sz] of [[-0.7, 0, 0], [-0.4, 0.3, -0.1], [-0.95, 0.5, 0.2], [-0.05, -0.2, 0.15]] as const) {
      const v = volumeUnder(r, h, sx, sz);
      solveLevel(r, v, sx, sz, -0.5, out);
      expect(Math.abs(volumeUnder(r, out.h, sx, sz) - v)).toBeLessThan(1e-6);
      if (v > 1e-6 && v < capacity(r) - 1e-6) expect(Math.abs(out.h - h)).toBeLessThan(0.001);
      expect(out.iterations).toBeLessThan(20);
    }
    let last = -1;
    for (let h = -1.2; h < 0.2; h += 0.01) {
      const v = volumeUnder(r, h, 0.4, 0.1);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});

describe('slosh', () => {
  it('has the first-mode frequency of a rectangular tank: 0.854 Hz for 0.4 m and 50 mm', () => {
    const f = sloshOmega(0.4, 0.05, 9.81) / (2 * Math.PI);
    expect(Math.abs(f / 0.854 - 1)).toBeLessThan(0.01);
    // Deep liquid tends to √(g k): 0.4 m long, 1 m deep.
    expect(sloshOmega(0.4, 1, 9.81)).toBeCloseTo(Math.sqrt((Math.PI * 9.81) / 0.4), 3);
  });

  it('overshoots a step by exp(-ζπ/√(1-ζ²))', () => {
    for (const zeta of [0.35, 0.5]) {
      const axis = new SloshAxis();
      let peak = 0;
      for (let i = 0; i < 1000; i++) {
        axis.step(1, 6, zeta, 0.001);
        peak = Math.max(peak, axis.slope);
      }
      expect(Math.abs((peak - 1) / stepOvershoot(zeta) - 1)).toBeLessThan(0.02);
    }
  });
});

describe('oil in circulation', () => {
  const { engine, systems, car } = engineOf('v8-cross/camaro-ss-lt1');
  const hung = (rpm: number, kind: SumpKind = 'wet') => {
    const run = runLubrication(setupFor(engine, systems, car, choice(kind)), steadyTrace(rpm, 0, 0));
    const i = run.count - 1;
    return { heads: run.headL.reduce((s, h) => s + h[i]!, 0), walls: run.wallsL[i]!, q: run.delivered[i]! };
  };

  it('settles at Q·(β·τ_head + (1-β)·τ_walls) on a level road and grows with speed', () => {
    const at = hung(4000);
    expect(Math.abs((at.heads + at.walls) / (at.q * (HEAD_FLOW_SHARE * HEAD_TAU_S + (1 - HEAD_FLOW_SHARE) * WALL_TAU_S)) - 1)).toBeLessThan(0.01);
    expect(hung(6000).heads + hung(6000).walls).toBeGreaterThan(at.heads + at.walls);
  });

  it('fills the outer head of a boxer in a long corner and empties the inner one, unless the heads are scavenged', () => {
    const b4 = engineOf('b4');
    const heads = (kind: SumpKind, ay: number) => {
      const run = runLubrication(setupFor(b4.engine, b4.systems, b4.car, choice(kind)), steadyTrace(2500, 0, ay));
      return run.headL.map((h) => h[run.count - 1]!);
    };
    const straight = heads('wet', 0);
    const corner = heads('wet', G);
    const [outer, inner] = corner[0]! > corner[1]! ? [0, 1] : [1, 0];
    // The outer head fills up to what it holds; the inner one drains faster than on the straight.
    expect(corner[outer]!).toBeGreaterThan(straight[outer]! * 1.1);
    expect(corner[inner]!).toBeLessThan(straight[inner]! * 0.8);
    const scavenged = heads('integrated-dry', G);
    const scavengedStraight = heads('integrated-dry', 0);
    for (let i = 0; i < 2; i++) expect(scavenged[i]).toBeCloseTo(scavengedStraight[i]!, 6);
  });

  it('keeps every litre: pan, tank, heads, walls, accumulator and what stays in the galleries add up to the oil put in', () => {
    const trace = (() => {
      const car = sumpCarFor('v8-cross/camaro-ss-lt1')!.vehicle;
      const pt = idealGearbox({ torqueAt: () => 600, idleRpm: 700, redlineRpm: 6600, gears: 6, spread: 4.3, topSpeedMs: 75, tyreRadiusM: 0.33, efficiency: 0.85 });
      return simulateLap(testTrack(), car, TYRES.slick, pt);
    })();
    for (const kind of ['wet', 'baffled', 'integrated-dry', 'dry'] as const) {
      for (const accumulator of [false, true]) {
        const setup = setupFor(engine, systems, car, { ...choice(kind, 'middle', -1), accumulator });
        const run = runLubrication(setup, trace, accumulator);
        const charge = run.accOilL[0]! > 0 ? null : 0;
        for (let i = 0; i < run.count; i += 37) {
          const heads = run.headL.reduce((s, h) => s + h[i]!, 0);
          const sum = run.panL[i]! + run.tankL[i]! + run.dryPanL[i]! + heads + run.wallsL[i]! + run.accOilL[i]! + setup.fixedL;
          // With an accumulator its charge is oil added on top, so only the change is checked.
          if (charge === 0) expect(Math.abs(sum - setup.totalL)).toBeLessThan(1e-4);
        }
      }
    }
  });
});

describe('what the pump gets', () => {
  it('delivers through the tube what entered it a tube volume ago', () => {
    const line = new DelayLine(0.06);
    line.fill(1);
    const step = 0.002;
    let switched = -1;
    for (let i = 0; i < 100; i++) {
      const out = line.push(0, step);
      if (switched < 0 && out < 0.5) switched = i;
    }
    expect(Math.abs(switched + 1 - 0.06 / step)).toBeLessThanOrEqual(1);
  });

  it('a pressure model fed half the oil gives half the pressure below the relief valve', () => {
    const { engine, systems } = engineOf('v8-cross/camaro-ss-lt1');
    const p = oilParams(engine, systems);
    const full = newOilState();
    const half = newOilState();
    oilStep(p, { rpm: 2000, tempC: T_OIL_TRACK, supply: 1, running: true, live: false }, full);
    oilStep(p, { rpm: 2000, tempC: T_OIL_TRACK, supply: 0.5, running: true, live: false }, half);
    expect(full.reliefOpen).toBe(false);
    expect(half.pressure / full.pressure).toBeCloseTo(0.5, 2);
    // Aeration of 8 % lowers it by 8 %.
    oilStep(p, { rpm: 2000, tempC: T_OIL_TRACK, supply: 0.92, running: true, live: false }, half);
    expect(half.pressure / full.pressure).toBeCloseTo(0.92, 2);
  });

  it('a rear well uncovers under braking before a middle one, a front well under acceleration', () => {
    const { engine, systems, car } = engineOf('v8-cross/camaro-ss-lt1');
    const least = (place: WellPlace, ax: number): number => {
      const run = runLubrication(setupFor(engine, systems, car, choice('wet', place, -1)), steadyTrace(4000, ax, 0));
      return run.immersion[run.count - 1]!;
    };
    expect(least('rear', -1.1 * G)).toBeLessThan(least('middle', -1.1 * G));
    expect(least('front', 0.7 * G)).toBeLessThan(least('middle', 0.7 * G));
  });
});

describe('the accumulator', () => {
  it('gives 0.76 L between 5 and 2 bar with a 0.6 bar precharge (3-quart Accusump)', () => {
    const acc = new Accumulator();
    expect(Math.abs((acc.oilAt(5) - acc.oilAt(2)) / 0.76 - 1)).toBeLessThan(0.01);
  });
});

describe('the bearings', () => {
  it('need the centrifugal head of the crank drilling: rising with the square of speed and with the journal size', () => {
    const r = mainJournalRadius(103.25);
    const at = (n: number): number => pressureNeed(n, r) - FILM_BAR;
    expect(at(6000) / at(3000)).toBeCloseTo(4, 6);
    expect(pressureNeed(6000, mainJournalRadius(110))).toBeGreaterThan(pressureNeed(6000, r));
    // About 1.7 bar at 6000 rpm on an LS's 65 mm journals (½ρω²R²).
    expect(at(6000)).toBeGreaterThan(1.5);
    expect(at(6000)).toBeLessThan(1.9);
  });

  it('survive a one-second dip: full starvation for 1 s at 6000 rpm costs under 3 % of their life', () => {
    const film = new FilmReserve();
    let wear = 0;
    for (let t = 0; t < 1; t += DT) {
      film.step(0, 2, DT);
      wear += wearRateAt(starvationLoad(6000, 1, { margin: 0, reserveLeft: film.left })) * DT;
    }
    expect(wear).toBeGreaterThan(0);
    expect(wear).toBeLessThan(0.03);
  });
});
