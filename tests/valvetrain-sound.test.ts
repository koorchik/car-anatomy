import { describe, expect, it } from 'vitest';
import { EngineSynth, synthConfig, type SynthConfig } from '../src/audio/synth.ts';
import { engineById } from '../src/data/engines.ts';
import { CATALOGUE } from '../src/data/engines.ts';
import { catalogueDesign } from '../src/designer/catalogue.ts';
import { Model } from '../src/designer/physics.ts';
import { camAt } from '../src/designer/valvetrain.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import type { VariableValves } from '../src/engine/valve-control.ts';

const FS = 48000;

const config = (id: string): SynthConfig => synthConfig(buildEngine(engineById(id)!));
const withValves = (cfg: SynthConfig, change: Partial<VariableValves>): SynthConfig => ({ ...cfg, sim: { ...cfg.sim, valves: { ...cfg.sim.valves!, ...change } } });

function render(cfg: SynthConfig, seconds: number, pedal: number, rpm: number): { l: Float32Array; r: Float32Array; synth: EngineSynth } {
  const synth = new EngineSynth(cfg, FS);
  synth.sim.start();
  synth.sim.pedal = pedal;
  synth.sim.lockedRpm = rpm;
  synth.sim.state = 'running';
  synth.sim.rpm = rpm;
  const n = Math.floor(seconds * FS);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i += 128) synth.process(l.subarray(i, Math.min(n, i + 128)), r.subarray(i, Math.min(n, i + 128)));
  return { l, r, synth };
}

const rmsDb = (x: Float32Array, from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return 10 * Math.log10(s / (to - from));
};

/** Level of one engine order over a whole number of crank turns, dB. */
const orderDb = (x: Float32Array, from: number, rpm: number, order: number, turns = 20): number => {
  const to = from + Math.round((FS * 60 * turns) / rpm);
  const hz = (order * rpm) / 60;
  let re = 0;
  let im = 0;
  for (let i = from; i < to; i++) {
    const w = (2 * Math.PI * hz * i) / FS;
    re += x[i]! * Math.cos(w);
    im += x[i]! * Math.sin(w);
  }
  return 20 * Math.log10(Math.hypot(re, im) / (to - from));
};

/** Cylinder volume over the chamber volume, from the crank geometry, independent of the synth's own. */
const volume = (compression: number, rodRatio: number, deg: number): number => {
  const a = 0.5;
  const l = rodRatio;
  const g = (deg * Math.PI) / 180;
  return 1 + (compression - 1) * (a + l - (a * Math.cos(g) + Math.sqrt(l * l - (a * Math.sin(g)) ** 2)));
};

describe('the sound of the valve gear', () => {
  it('VTEC: the high cam opens the exhaust earlier on a fuller cylinder, as the model says', () => {
    const k20 = config('i4');
    const sw = k20.sim.valves!.switching!;
    const low = render(withValves(k20, { switching: { ...sw, rpm: 9000 } }), 1, 1, 6500);
    const high = render(withValves(k20, { switching: { ...sw, rpm: 5000 } }), 1, 1, 6500);
    expect(low.synth.sim.valves.state.highCam).toBe(false);
    expect(high.synth.sim.valves.state.highCam).toBe(true);

    // Blowdown strength follows the cylinder pressure at the exhaust opening: charge trapped times expansion.
    const d = { ...catalogueDesign(CATALOGUE.find((e) => e.id === 'i4')!), factory: null };
    const model = new Model(d);
    const fill = (h: boolean): number => model.at(6500, { throttle: 1, lambda: d.lambda, noBoost: false, cam: camAt(d, { high: h }) }).fillRatio;
    const evoLow = camAt(d, { high: false }).events.exhaustOpen;
    const evoHigh = camAt(d, { high: true }).events.exhaustOpen;
    const r = d.compression;
    const rod = d.rodLength / d.stroke;
    const expected = (fill(true) / fill(false)) * (volume(r, rod, evoLow) / volume(r, rod, evoHigh)) ** 1.3;
    const gainOf = (x: { synth: EngineSynth }): number => (x.synth as unknown as { live: { exhaustGain: number } }).live.exhaustGain;
    // The model's trapped mass is sampled at the schedule speeds, so allow for the interpolation.
    expect(gainOf(high) / gainOf(low)).toBeCloseTo(expected, 1);
    expect(20 * Math.log10(expected)).toBeGreaterThan(1);

    // It is heard: louder, though the exhaust's own saturation takes some of it back.
    expect(rmsDb(high.l, FS / 2, FS) - rmsDb(low.l, FS / 2, FS)).toBeGreaterThan(0.4);
    // And the pulses move earlier by the change in exhaust opening, in time.
    const lagLimit = 80;
    let best = -Infinity;
    let at = 0;
    for (let lag = -lagLimit; lag <= lagLimit; lag++) {
      let s = 0;
      for (let i = 30000; i < 34800; i++) s += high.l[i]! * low.l[i + lag]!;
      if (s > best) {
        best = s;
        at = lag;
      }
    }
    const expectedMs = ((evoLow - evoHigh) / (6 * 6500)) * 1000;
    expect(Math.abs((at / FS) * 1000 - expectedMs)).toBeLessThan(0.3);
  });

  it('GM AFM: with four cylinders resting, each bank fires at 180° and 540°, and the firing tone halves', () => {
    const lt1 = config('v8-cross/camaro-ss-lt1');
    const resting = render(lt1, 3.5, 0.12, 1600);
    const all = render(withValves(lt1, { deactivation: null }), 3.5, 0.12, 1600);
    expect(resting.synth.sim.valves.state.off).toEqual([1, 7, 6, 4]);
    const from = 2 * FS;
    // Order 2: each bank's pulses cancel with all eight running and add up with four.
    expect(orderDb(resting.l, from, 1600, 2) - orderDb(all.l, from, 1600, 2)).toBeGreaterThan(15);
    // Order 4: half as many pulses, each from a cylinder doing double work (0.15 + 0.85 load, load doubled):
    // 20 log10((2 * 0.405) / (4 * 0.2775)) = -2.7 dB.
    const fourth = orderDb(resting.l, from, 1600, 4) - orderDb(all.l, from, 1600, 4);
    expect(fourth).toBeLessThan(-1);
    expect(fourth).toBeGreaterThan(-6);
  });

  it('Porsche’s fuel-only rest leaves the bank breathing, valves shut would silence it', () => {
    const gt4 = config('b6/porsche-718-gt4-4-0');
    const deact = gt4.sim.valves!.deactivation!;
    const balance = (kind: 'fuel' | 'valves' | null): number => {
      const cfg = withValves(gt4, { deactivation: kind ? { ...deact, kind, sets: [deact.sets[0]!] } : null });
      const x = render(cfg, 3, 0.1, 2000);
      return rmsDb(x.r, 2 * FS, 3 * FS) - rmsDb(x.l, 2 * FS, 3 * FS);
    };
    const plain = balance(null);
    const fuel = balance('fuel') - plain;
    const shut = balance('valves') - plain;
    // Each channel hears its own bank at 0.775 and the other at 0.225: a silent bank leaves 20 log10(0.775 / 0.225).
    expect(Math.abs(shut - 20 * Math.log10(0.775 / 0.225))).toBeLessThan(1.5);
    expect(fuel).toBeGreaterThan(3);
    expect(fuel).toBeLessThan(shut);
  });

  it('a moved event never fires twice in one cycle', () => {
    const k20 = config('i4');
    const synth = new EngineSynth(withValves(k20, { switching: { ...k20.sim.valves!.switching!, rpm: 5000 } }), FS);
    const fired: Array<{ voice: unknown; t: number }> = [];
    const target = synth as unknown as { triggerExhaust: (v: unknown, ...rest: unknown[]) => void };
    const original = target.triggerExhaust.bind(synth);
    let now = 0;
    target.triggerExhaust = (v, ...rest) => {
      fired.push({ voice: v, t: now });
      original(v, ...rest);
    };
    synth.sim.start();
    synth.sim.state = 'running';
    synth.sim.lockedRpm = 6500;
    synth.sim.rpm = 6500;
    const block = new Float32Array(128);
    for (let i = 0; i < FS; i += 128) {
      synth.sim.pedal = i < FS / 2 ? 0.1 : 1;
      now = i / FS;
      synth.process(block, new Float32Array(128));
    }
    expect(synth.sim.valves.state.highCam).toBe(true);
    const half = 360 / (6 * 6500);
    const byVoice = new Map<unknown, number[]>();
    for (const f of fired) byVoice.set(f.voice, [...(byVoice.get(f.voice) ?? []), f.t]);
    for (const times of byVoice.values()) for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThan(half - 128 / FS);
  });
});
