import { describe, expect, it } from 'vitest';
import { ENGINES } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { EngineSim } from '../src/engine/sim.ts';
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
