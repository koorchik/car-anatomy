import { describe, expect, it } from 'vitest';
import { engineById, engineFacts } from '../src/data/engines.ts';
import { synthConfig } from '../src/audio/synth.ts';
import { DynoLoad, sizeAbsorber, sweepEndRpm, sweepStartRpm } from '../src/engine/dyno-load.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { LoadedCrank, type CrankReadings } from '../src/engine/loaded-crank.ts';
import { EngineSim } from '../src/engine/sim.ts';
import { HP_PER_KW, mapValue, peakTorque } from '../src/engine/torque-map.ts';
import { catalogueTorqueMap } from '../src/ui/dyno/maps.ts';
import { RunRecorder, StepTest, peaksOf, shownPoint, type RunPoint } from '../src/ui/dyno/runs.ts';

const DT = 1 / 3000;

function rig(id: string) {
  const spec = engineById(id)!;
  const map = catalogueTorqueMap(spec);
  const sim = new EngineSim(synthConfig(buildEngine(spec)).sim);
  const load = new DynoLoad(sizeAbsorber(map, 'eddy'));
  const crank = new LoadedCrank(map, load);
  sim.start();
  for (let i = 0; i < 2 / DT; i++) sim.step(DT);
  sim.attach(crank);
  crank.readings();
  /** Steps the sim for a frame and hands back the reading, as the panel gets it. */
  const frame = (seconds = 1 / 60): CrankReadings => {
    for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT);
    return crank.readings();
  };
  return { spec, map, sim, load, crank, frame };
}

function sweepRun(id: string, rate: number) {
  const r = rig(id);
  const from = sweepStartRpm(r.map, r.load.spec);
  const to = sweepEndRpm(r.load.spec);
  const recorder = new RunRecorder();
  recorder.begin('sweep', { engine: id, absorber: 'eddy', rate, throttle: 1 }, r.map.inertia, from + Math.max(200, 0.4 * rate));
  r.load.command({ kind: 'dyno', action: 'sweep', fromRpm: from, toRpm: to, rate, throttle: 1 });
  for (let t = 0; t < 6 + (to - from) / rate; t += 1 / 60) recorder.push(r.frame());
  return { ...r, run: recorder.finish()! };
}

describe('the numbers on the sheet', () => {
  it('power is torque times speed: P[kW] = M[N·m] · n[rpm] / 9549, and 1 hp is 0.7355 kW', () => {
    const { run } = sweepRun('v8-cross', 300);
    expect(run.points.length).toBeGreaterThan(100);
    for (const p of run.points) {
      for (const correction of [false, true]) {
        const s = shownPoint(p, correction);
        expect(s.kw).toBeCloseTo((s.nm * s.rpm * Math.PI) / 30000, 9);
        expect(Math.abs(s.kw / ((s.nm * s.rpm) / 9549) - 1)).toBeLessThan(1e-4);
        expect(s.hp).toBeCloseTo(s.kw * HP_PER_KW, 9);
      }
    }
  });

  it('peak power always comes at a higher speed than peak torque', () => {
    const peaks = peaksOf(sweepRun('v8-cross', 300).run, true)!;
    expect(peaks.power.rpm).toBeGreaterThan(peaks.torque.rpm);
  });

  it('averages readings by the steps each covers', () => {
    const recorder = new RunRecorder();
    recorder.begin('points', { engine: 'x', absorber: 'eddy', rate: null, throttle: null }, 0.1);
    const reading = (samples: number, nm: number): CrankReadings => ({
      samples,
      coupled: true,
      engineNm: nm,
      manifoldBar: 0,
      spool: 1,
      spoolS: 0,
      load: { kind: 'dyno', samples, seconds: samples / 3000, rpm: 3000, alpha: 0, measuredNm: nm, absorberNm: nm, absorberShare: 0.5, setpointRpm: 3000, phase: 'hold', tracking: 'ok', throttle: 1, automatic: false, gaveUp: false },
    });
    const point = recorder.addPoint([reading(3, 100), reading(1, 200)])!;
    expect(point.nm).toBeCloseTo(125, 9);
  });
});

describe('the step test', () => {
  it('walks i4 through its speeds and each point lies on the steady full-load curve', () => {
    const r = rig('i4');
    const from = sweepStartRpm(r.map, r.load.spec);
    const test = new StepTest(r.map, from, sweepEndRpm(r.load.spec), 1);
    const recorder = new RunRecorder();
    recorder.begin('steps', { engine: 'i4', absorber: 'eddy', rate: null, throttle: 1 }, r.map.inertia);
    r.load.command(test.start());
    let last = '';
    for (let t = 0; t < 120 && !test.done; t += 1 / 60) {
      const out = test.push(r.frame());
      if (out.point) recorder.addPoint(out.point.readings, out.point.settled);
      if (out.command) {
        r.load.command(out.command);
        last = out.command.action;
      }
    }
    const run = recorder.finish()!;
    expect(test.done).toBe(true);
    expect(last).toBe('off');
    expect(run.points.length).toBe(test.speeds.length);
    for (const p of run.points) {
      expect(p.settled).toBe(true);
      expect(Math.abs(p.nm / mapValue(r.map, r.map.wotNm, p.rpm) - 1)).toBeLessThan(0.005);
    }
  });

  it('a held point at the torque peak reads the article figure', () => {
    for (const id of ['i4', 'v8-cross', 'i3']) {
      const r = rig(id);
      const peak = peakTorque(r.map);
      r.load.command({ kind: 'dyno', action: 'hold', rpm: peak.rpm, throttle: 1, keep: true });
      for (let t = 0; t < 8; t += 1 / 60) r.frame();
      const recorder = new RunRecorder();
      recorder.begin('points', { engine: id, absorber: 'eddy', rate: null, throttle: null }, r.map.inertia);
      const window: CrankReadings[] = [];
      for (let t = 0; t < 1; t += 1 / 60) window.push(r.frame());
      const point = recorder.addPoint(window)!;
      expect(Math.abs(point.nm / engineFacts(id)!.torqueNm! - 1), id).toBeLessThan(0.005);
    }
  });
});

describe('a sweep reconciled with the article', () => {
  it.each(['i4', 'v8-cross'])('%s at 300 rpm/s: corrected for inertia, the peak is the article torque; the shortfall is J·ε', (id) => {
    const { run, map } = sweepRun(id, 300);
    const corrected = peaksOf(run, true)!;
    const raw = peaksOf(run, false)!;
    expect(Math.abs(corrected.torque.nm / engineFacts(id)!.torqueNm! - 1)).toBeLessThan(0.01);
    const expected = (map.inertia * 300 * Math.PI) / 30;
    expect(Math.abs(corrected.inertiaNm / expected - 1)).toBeLessThan(0.1);
    expect(raw.torque.nm).toBeLessThan(corrected.torque.nm);
    const points: RunPoint[] = run.points;
    expect(points.every((p) => p.settled)).toBe(true);
  });
});
