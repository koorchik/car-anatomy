import { describe, expect, it } from 'vitest';
import { synthConfig } from '../src/audio/synth.ts';
import { engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { EngineSim, type SimParams } from '../src/engine/sim.ts';
import { interpolate, liveTiming, PHASER_RATE, ValveControl, type VariableValves } from '../src/engine/valve-control.ts';

const params = (id: string): SimParams => synthConfig(buildEngine(engineById(id)!)).sim;

/** Runs the crank simulation for a while, at a held speed or free. */
const run = (sim: EngineSim, seconds: number, pedal: number, rpm: number | null = null): void => {
  sim.pedal = pedal;
  sim.lockedRpm = rpm;
  if (rpm !== null) {
    sim.state = 'running';
    sim.rpm = rpm;
  }
  for (let t = 0; t < seconds; t += 0.002) sim.step(0.002);
};

const started = (id: string): EngineSim => {
  const sim = new EngineSim(params(id));
  sim.start();
  run(sim, 1.5, 0);
  return sim;
};

describe('the engine computer running the valve gear', () => {
  it('idles at park, on the low cam, with every cylinder', () => {
    for (const id of ['i4', 'v8-cross/camaro-ss-lt1', 'i6/toyota-supra-b58']) {
      const sim = started(id);
      run(sim, 2, 0);
      const s = sim.valves.state;
      expect(s.intakeShift, id).toBeCloseTo(0, 6);
      expect(s.exhaustShift, id).toBeCloseTo(0, 6);
      expect(s.highCam, id).toBe(false);
      expect(s.off, id).toEqual([]);
    }
  });

  it('engages the high cam at the switch speed under load, and drops it 150 rpm lower', () => {
    const sim = started('i4');
    const sw = sim.params.valves!.switching!.rpm;
    let engagedAt = 0;
    sim.pedal = 1;
    for (let t = 0; t < 6 && !engagedAt; t += 0.002) {
      sim.step(0.002);
      if (sim.valves.state.highCam) engagedAt = sim.rpm;
    }
    expect(engagedAt).toBeGreaterThanOrEqual(sw);
    expect(engagedAt).toBeLessThan(sw + 200);
    // Held just under the switch on full load it stays high until the hysteresis is passed.
    run(sim, 0.3, 1, sw - 100);
    expect(sim.valves.state.highCam).toBe(true);
    run(sim, 0.3, 1, sw - 200);
    expect(sim.valves.state.highCam).toBe(false);
  });

  it('stays on the low cam above the switch speed at light load, as Honda does when cruising', () => {
    const sim = started('i4');
    run(sim, 1, 0.1, 7000);
    expect(sim.valves.state.highCam).toBe(false);
    run(sim, 1, 1, 7000);
    expect(sim.valves.state.highCam).toBe(true);
  });

  it('follows the full-load schedule, at a phaser’s pace', () => {
    const sim = started('i4');
    const v = sim.params.valves!;
    run(sim, 1.5, 1, 2500);
    expect(sim.valves.state.intakeShift).toBeCloseTo(interpolate(v.wotRpm, v.wotIntake, 2500), 0);
    const ctrl = new ValveControl();
    const vvt: VariableValves = { ...v, wotIntake: v.wotRpm.map(() => -50) };
    ctrl.configure(vvt, 800, 4);
    ctrl.step(0.1, { rpm: 3000, load: 1, state: 'running', fuelCut: false });
    expect(Math.abs(ctrl.state.intakeShift)).toBeLessThanOrEqual(PHASER_RATE * 0.1 + 1e-9);
    expect(Math.abs(ctrl.state.intakeShift)).toBeLessThanOrEqual(20);
  });

  it('rests GM’s four cylinders after 1.5 s of light load and wakes them at once', () => {
    const sim = started('v8-cross/camaro-ss-lt1');
    run(sim, 1.2, 0.12, 1600);
    expect(sim.valves.state.off).toEqual([]);
    run(sim, 0.6, 0.12, 1600);
    expect(sim.valves.state.off).toEqual([1, 7, 6, 4]);
    expect(sim.valves.state.active).toBe(0.5);
    sim.pedal = 0.8;
    for (let t = 0; t < 0.05; t += 0.002) sim.step(0.002);
    expect(sim.valves.state.off).toEqual([]);
    // Not at idle speed.
    run(sim, 3, 0.12, 700);
    expect(sim.valves.state.off).toEqual([]);
  });

  it('swaps the resting bank every 20 s on the Porsche', () => {
    const sim = started('b6/porsche-718-gt4-4-0');
    run(sim, 2, 0.1, 2000);
    const first = [...sim.valves.state.off];
    expect(first.length).toBe(3);
    run(sim, 20, 0.1, 2000);
    expect(sim.valves.state.off.length).toBe(3);
    expect(sim.valves.state.off).not.toEqual(first);
  });

  it('opens the valves only a little at idle when they set the load', () => {
    const b58 = started('i6/toyota-supra-b58');
    run(b58, 1, 0);
    expect(b58.valves.state.liftShare).toBeLessThan(0.05);
    run(b58, 1, 1, 4000);
    expect(b58.valves.state.liftShare).toBe(1);
    // MultiAir opens late at idle (Schaeffler) and closes early at part load.
    const twin = started('i2');
    run(twin, 1, 0);
    expect(twin.valves.state.lateOpen).toBe(true);
    const idle = liveTiming(buildEngine(engineById("i2")!).timing, twin.params.valves, twin.valves.state);
    expect(idle.timing.intakeOpen).toBeGreaterThan(buildEngine(engineById('i2')!).timing.intakeOpen + 20);
    run(twin, 1, 1, 4000);
    expect(twin.valves.state.lateOpen).toBe(false);
  });

  it('engines without the gear carry no controller state', () => {
    const sim = started('i1');
    expect(sim.valves.vvt).toBeNull();
    expect(sim.valves.state.active).toBe(1);
  });
});
