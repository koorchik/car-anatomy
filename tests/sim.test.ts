import { describe, expect, it } from 'vitest';
import { ENGINES, engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { EngineSim } from '../src/engine/sim.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { synthConfig } from '../src/audio/synth.ts';

const DT = 1 / 3000;

const simFor = (id: string): EngineSim => new EngineSim(synthConfig(buildEngine(ENGINES.find((e) => e.id === id)!)).sim);

const run = (sim: EngineSim, seconds: number, onStep?: (t: number) => void): void => {
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT);
    onStep?.(t);
  }
};

describe.each(ENGINES.map((e) => [e.id, e] as const))('%s', (id, spec) => {
  it('cranks, catches and settles at idle', () => {
    const sim = simFor(id);
    sim.start();
    expect(sim.state).toBe('cranking');
    run(sim, 4);
    expect(sim.state).toBe('running');
    expect(Math.abs(sim.rpm - spec.idleRpm)).toBeLessThan(spec.idleRpm * 0.12);
  });

  it('reaches the limiter at full throttle and bounces off it', () => {
    const sim = simFor(id);
    sim.start();
    run(sim, 3);
    sim.pedal = 1;
    let reached = Infinity;
    let peak = 0;
    let cuts = 0;
    let wasCut = false;
    run(sim, spec.revTimeS * 4, (t) => {
      peak = Math.max(peak, sim.rpm);
      if (sim.rpm >= spec.redlineRpm && reached === Infinity) reached = t;
      if (sim.fuelCut && !wasCut) cuts++;
      wasCut = sim.fuelCut;
    });
    expect(reached).toBeLessThan(spec.revTimeS * 1.7);
    expect(reached).toBeGreaterThan(spec.revTimeS * 0.55);
    expect(peak).toBeLessThan(spec.redlineRpm * 1.02);
    expect(cuts).toBeGreaterThan(1);
  });

  it('falls back to idle within a few seconds when the pedal is released', () => {
    const sim = simFor(id);
    sim.start();
    run(sim, 3);
    sim.pedal = 1;
    run(sim, spec.revTimeS * 2);
    sim.pedal = 0;
    run(sim, 2.5 + spec.revTimeS * 2);
    expect(Math.abs(sim.rpm - spec.idleRpm)).toBeLessThan(spec.idleRpm * 0.2);
  });

  it('stops when switched off', () => {
    const sim = simFor(id);
    sim.start();
    run(sim, 3);
    sim.stop();
    run(sim, 6);
    expect(sim.state).toBe('off');
    expect(sim.rpm).toBe(0);
  });

  it('keeps the crank angle inside the cycle', () => {
    const sim = simFor(id);
    sim.start();
    sim.pedal = 0.6;
    let ok = true;
    run(sim, 2, () => {
      if (!(sim.angle >= 0 && sim.angle < sim.params.cycle)) ok = false;
    });
    expect(ok).toBe(true);
  });
});

describe('with a torque table from the designer', () => {
  const designed = (over: Partial<Design>): EngineSim => {
    const d = resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
    return new EngineSim(synthConfig(buildEngine(designToSpec(d, evaluate(d)))).sim);
  };

  it('pulls all the way to the rev limit at full throttle', () => {
    const sim = designed({ rpmLimit: 7000 });
    sim.start();
    run(sim, 3);
    sim.pedal = 1;
    let peak = 0;
    run(sim, 8, () => {
      peak = Math.max(peak, sim.rpm);
    });
    expect(peak).toBeGreaterThan(sim.params.redlineRpm * 0.98);
  });

  it('settles at idle, holds part throttle, and falls back', () => {
    const sim = designed({});
    sim.start();
    run(sim, 4);
    expect(Math.abs(sim.rpm - sim.params.idleRpm)).toBeLessThan(sim.params.idleRpm * 0.15);
    sim.pedal = 0.35;
    run(sim, 6);
    const held = sim.rpm;
    expect(held).toBeGreaterThan(sim.params.idleRpm * 1.3);
    expect(held).toBeLessThan(sim.params.redlineRpm * 0.98);
    sim.pedal = 0;
    run(sim, 8);
    expect(Math.abs(sim.rpm - sim.params.idleRpm)).toBeLessThan(sim.params.idleRpm * 0.25);
  });

  it('an over-revving design can really reach its failure speed', () => {
    const d = resolveDesign({ ...DEFAULT_DESIGN, throws: [], rpmLimit: 21000, springForce: 2200, intakeValve: 36, lift: 11 });
    const perf = evaluate(d);
    expect(perf.topRpm).toBeGreaterThan(perf.failureRpm);
    const sim = new EngineSim(synthConfig(buildEngine(designToSpec(d, perf))).sim);
    sim.start();
    run(sim, 3);
    sim.pedal = 1;
    let peak = 0;
    run(sim, 10, () => {
      peak = Math.max(peak, sim.rpm);
    });
    expect(peak).toBeGreaterThan(perf.failureRpm);
  });

  it('a design that cannot run cranks and then gives up', () => {
    const sim = designed({ fuel: 'diesel', lambda: 1.5, compression: 9 });
    expect(sim.params.catches).toBe(false);
    sim.start();
    run(sim, 1.5);
    expect(sim.state).toBe('cranking');
    run(sim, 5);
    expect(sim.state).not.toBe('running');
  });
});

it('pedal position maps to a usable range of steady speeds', () => {
  const sim = simFor('v8-cross');
  sim.start();
  run(sim, 3);
  const speeds = [0.2, 0.4, 0.6].map((pedal) => {
    sim.pedal = pedal;
    run(sim, 4);
    return sim.rpm;
  });
  expect(speeds[0]!).toBeLessThan(speeds[1]!);
  expect(speeds[1]!).toBeLessThan(speeds[2]!);
  expect(speeds[0]!).toBeLessThan(3000);
});

describe('part throttle', () => {
  const variantSim = (id: string): EngineSim => new EngineSim(synthConfig(buildEngine(engineById(id)!)).sim);
  const designedSim = (): EngineSim => {
    const d = resolveDesign({ ...DEFAULT_DESIGN, throws: [] });
    return new EngineSim(synthConfig(buildEngine(designToSpec(d, evaluate(d)))).sim);
  };
  const cases: Array<[string, () => EngineSim]> = [
    ...['b4/subaru-ej253', 'i4', 'i4d', 'i1', 'v8-cross', 'v12', 'r2'].map((id): [string, () => EngineSim] => [id, () => variantSim(id)]),
    ['designer', designedSim],
  ];

  it.each(cases)('%s: every speed from idle upward has its own pedal position', (_name, make) => {
    const sim = make();
    sim.start();
    run(sim, 3);
    const { idleRpm, redlineRpm } = sim.params;
    const steps = 8;
    let previous = sim.rpm;
    for (let i = 1; i <= steps; i++) {
      sim.pedal = (i / steps) * 0.8;
      run(sim, 2.5);
      const gain = sim.rpm - previous;
      // No cliff: each equal step of the pedal moves the speed by a similar amount.
      const even = (0.8 * (redlineRpm - idleRpm)) / steps;
      expect(gain).toBeGreaterThan(even * 0.5);
      expect(gain).toBeLessThan(even * 1.6);
      previous = sim.rpm;
    }
  });

  it('an Outback can be held at 2000 rpm, and gets there without a long wait', () => {
    // A fifth of the travel: well above the bottom edge, so a mouse can find it.
    const sim = variantSim('b4/subaru-ej253');
    sim.start();
    run(sim, 3);
    sim.pedal = 0.2;
    run(sim, 1.5);
    expect(sim.rpm).toBeGreaterThan(1800);
    expect(sim.rpm).toBeLessThan(2300);
  });

  it('settles down to a lower pedal position from high speed', () => {
    const sim = variantSim('b4/subaru-ej253');
    sim.start();
    run(sim, 3);
    sim.pedal = 1;
    run(sim, 2);
    sim.pedal = 0.2;
    run(sim, 4);
    expect(sim.rpm).toBeGreaterThan(1500);
    expect(sim.rpm).toBeLessThan(2500);
    expect(sim.fuelCut).toBe(false);
  });
});

it('slow motion holds the requested speed regardless of the pedal', () => {
  const sim = simFor('i4');
  sim.startImmediately();
  sim.lockedRpm = 40;
  sim.pedal = 1;
  run(sim, 3);
  expect(sim.rpm).toBeCloseTo(40, 0);
});

it('a turbo spools up under load and back down', () => {
  const sim = simFor('i6');
  sim.start();
  run(sim, 3);
  sim.pedal = 1;
  run(sim, 3);
  const spooled = sim.boost;
  expect(spooled).toBeGreaterThan(0.5);
  sim.pedal = 0;
  run(sim, 5);
  expect(sim.boost).toBeLessThan(spooled * 0.3);
});

it('the start is short: the engine catches within half a second', () => {
  const sim = simFor('i4');
  sim.start();
  run(sim, 0.5);
  expect(sim.state).toBe('running');
});
