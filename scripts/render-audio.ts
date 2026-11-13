// Offline render of the engine synth for analysis: `npm run render-audio [ids...]`.
// Writes WAV files and a loudness table to .tmp/audio.

import { mkdirSync, writeFileSync } from 'node:fs';
import { ENGINES, engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { EngineSynth, synthConfig, type SynthConfig } from '../src/audio/synth.ts';
import { DynoLoad, freePedalFor, sizeAbsorber, sweepEndRpm, sweepStartRpm, type AbsorberKind, type DynoCommand } from '../src/engine/dyno-load.ts';
import { LoadedCrank } from '../src/engine/loaded-crank.ts';
import { PEDAL_TOP_SPEED } from '../src/engine/sim.ts';
import { catalogueTorqueMap } from '../src/designer/torque-map.ts';

const FS = 48000;
const OUT = '.tmp/audio';

export function floatToWav(left: Float32Array, right: Float32Array, fs: number): Buffer {
  const n = left.length;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.max(-1, Math.min(1, left[i]!)) * 32767, i * 4);
    data.writeInt16LE(Math.max(-1, Math.min(1, right[i]!)) * 32767, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(fs, 24);
  header.writeUInt32LE(fs * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** What the dyno does from the start of a step: let go, hold a speed on the pedal, run a sweep, or listen free. */
export type DynoStep = 'off' | { hold: number } | { sweep: { from: number; to: number; rate: number } } | { free: number };

export interface Step {
  seconds: number;
  pedal: number;
  /** Hold at an exact speed, for measurements. */
  rpm?: number;
  /** Puts the engine on the dyno, with its catalogue torque map. */
  dyno?: DynoStep;
}

export interface RenderOptions {
  absorber?: AbsorberKind;
  /** Changes to the synth's configuration, for experiments. */
  config?: (cfg: SynthConfig) => SynthConfig;
}

export interface Rendered {
  l: Float32Array;
  r: Float32Array;
  rpm: Float32Array;
  /** The crank under load, when a step put the engine on the dyno. */
  crank: LoadedCrank | null;
  synth: EngineSynth;
}

export function render(id: string, steps: Step[], trim?: number, options: RenderOptions = {}): Rendered {
  const spec = engineById(id);
  if (!spec) throw new Error(`Unknown engine ${id}`);
  const base = synthConfig(buildEngine(spec), trim);
  const synth = new EngineSynth(options.config ? options.config(base) : base, FS);
  let crank: LoadedCrank | null = null;
  let load: DynoLoad | null = null;
  if (steps.some((s) => s.dyno !== undefined)) {
    const map = catalogueTorqueMap(spec);
    load = new DynoLoad(sizeAbsorber(map, options.absorber ?? 'eddy'));
    crank = new LoadedCrank(map, load);
    synth.sim.attach(crank);
  }
  synth.sim.start();
  const total = steps.reduce((a, s) => a + s.seconds, 0);
  const samples = Math.floor(total * FS);
  const l = new Float32Array(samples);
  const r = new Float32Array(samples);
  const rpm = new Float32Array(Math.ceil(samples / 128));
  let offset = 0;
  for (const step of steps) {
    const end = Math.min(samples, offset + Math.floor(step.seconds * FS));
    synth.sim.pedal = step.pedal;
    synth.sim.lockedRpm = step.rpm ?? null;
    if (step.dyno !== undefined && load) load.command(dynoCommand(step.dyno, spec.idleRpm, spec.redlineRpm));
    if (step.rpm !== undefined) {
      synth.sim.state = 'running';
      synth.sim.rpm = step.rpm;
      synth.sim.load = step.pedal;
    }
    while (offset < end) {
      const n = Math.min(128, end - offset);
      synth.process(l.subarray(offset, offset + n), r.subarray(offset, offset + n));
      rpm[Math.floor(offset / 128)] = synth.sim.rpm;
      offset += n;
    }
  }
  return { l, r, rpm, crank, synth };
}

function dynoCommand(step: DynoStep, idleRpm: number, redlineRpm: number): DynoCommand {
  if (step === 'off') return { kind: 'dyno', action: 'off' };
  if ('hold' in step) return { kind: 'dyno', action: 'hold', rpm: step.hold, throttle: null, keep: true };
  if ('free' in step) return { kind: 'dyno', action: 'free', pedal: freePedalFor(step.free, idleRpm, redlineRpm, PEDAL_TOP_SPEED) };
  return { kind: 'dyno', action: 'sweep', fromRpm: step.sweep.from, toRpm: step.sweep.to, rate: step.sweep.rate, throttle: 1 };
}

/** Idle, a held full-load point at half the limit, a 300 rpm/s sweep, the ramp down and idle again. */
export function dynoStory(id: string, rate = 300): Step[] {
  const spec = engineById(id)!;
  const map = catalogueTorqueMap(spec);
  const dyno = sizeAbsorber(map, 'eddy');
  const from = sweepStartRpm(map, dyno);
  const to = sweepEndRpm(dyno);
  return [
    { seconds: 2, pedal: 0, dyno: 'off' },
    { seconds: 8, pedal: 1, dyno: { hold: Math.round((0.5 * map.limitRpm) / 50) * 50 } },
    { seconds: 3 + (to - from) / rate + (to - from) / 1000, pedal: 0, dyno: { sweep: { from, to, rate } } },
    { seconds: 2, pedal: 0, dyno: 'off' },
  ];
}

export const rmsDb = (x: Float32Array, from = 0, to = x.length): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i]! * x[i]!;
  return 10 * Math.log10(sum / Math.max(1, to - from) + 1e-12);
};

export const peak = (x: Float32Array): number => {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!));
  return m;
};

const STORY: Step[] = [
  { seconds: 3, pedal: 0 }, // start and idle
  { seconds: 1.2, pedal: 1 }, // blip to the limiter
  { seconds: 1.6, pedal: 0 }, // lift, pops
  { seconds: 1.5, pedal: 0.45 }, // part throttle
  { seconds: 2.2, pedal: 1 }, // full throttle and limiter
  { seconds: 2.5, pedal: 0 }, // back to idle
];

if (process.argv[1]?.endsWith('render-audio.ts') && process.argv.includes('--dyno')) {
  // The same engines under load: `npm run render-audio -- --dyno i3 v8-cross`.
  mkdirSync(OUT, { recursive: true });
  for (const id of process.argv.slice(2).filter((a) => a !== '--dyno')) {
    const { l, r } = render(id, dynoStory(id));
    writeFileSync(`${OUT}/${id.replace('/', '-')}-dyno.wav`, floatToWav(l, r, FS));
    console.log(`${OUT}/${id.replace('/', '-')}-dyno.wav`, (l.length / FS).toFixed(1), 's, peak', Math.max(peak(l), peak(r)).toFixed(2));
  }
} else if (process.argv[1]?.endsWith('render-audio.ts')) {
  mkdirSync(OUT, { recursive: true });
  const ids = process.argv.slice(2);
  const list = ids.length ? ids : ENGINES.map((e) => e.id);
  console.log('engine      idle   mid   wot  peak  crest  maxRpm');
  for (const id of list) {
    const spec = engineById(id)!;
    const { l, r, rpm } = render(id, STORY);
    writeFileSync(`${OUT}/${id}.wav`, floatToWav(l, r, FS));
    const hold = render(id, [
      { seconds: 0.6, pedal: 0, rpm: spec.idleRpm },
      { seconds: 1.5, pedal: 0, rpm: spec.idleRpm },
    ]);
    const mid = render(id, [
      { seconds: 0.6, pedal: 0.5, rpm: spec.redlineRpm * 0.5 },
      { seconds: 1, pedal: 0.5, rpm: spec.redlineRpm * 0.5 },
    ]);
    const wot = render(id, [
      { seconds: 0.6, pedal: 1, rpm: spec.redlineRpm * 0.85 },
      { seconds: 1, pedal: 1, rpm: spec.redlineRpm * 0.85 },
    ]);
    const skip = Math.floor(0.6 * FS);
    const idleDb = rmsDb(hold.l, skip);
    const midDb = rmsDb(mid.l, skip);
    const wotDb = rmsDb(wot.l, skip);
    const p = Math.max(peak(l), peak(r));
    console.log(
      id.padEnd(10),
      idleDb.toFixed(1).padStart(6),
      midDb.toFixed(1).padStart(5),
      wotDb.toFixed(1).padStart(5),
      p.toFixed(2).padStart(5),
      (20 * Math.log10(peak(hold.l) / Math.pow(10, idleDb / 20))).toFixed(1).padStart(6),
      Math.max(...rpm).toFixed(0).padStart(7),
    );
  }
}
