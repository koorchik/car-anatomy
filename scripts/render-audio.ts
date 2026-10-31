// Offline render of the engine synth for analysis: `npm run render-audio [ids...]`.
// Writes WAV files and a loudness table to .tmp/audio.

import { mkdirSync, writeFileSync } from 'node:fs';
import { ENGINES, engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { EngineSynth, synthConfig } from '../src/audio/synth.ts';

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

export interface Step {
  seconds: number;
  pedal: number;
  /** Hold at an exact speed, for measurements. */
  rpm?: number;
}

export function render(id: string, steps: Step[], trim?: number): { l: Float32Array; r: Float32Array; rpm: Float32Array } {
  const spec = engineById(id);
  if (!spec) throw new Error(`Unknown engine ${id}`);
  const synth = new EngineSynth(synthConfig(buildEngine(spec), trim), FS);
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
  return { l, r, rpm };
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

if (process.argv[1]?.endsWith('render-audio.ts')) {
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
