// The catalogue's loudness trims are measured offline. A designed engine doesn't exist until the visitor
// makes it, so it gets measured the same way, briefly, while nothing else is happening.

import { EngineSynth, synthConfig } from '../audio/synth.ts';
import { buildEngine } from '../engine/kinematics.ts';
import type { EngineSpec } from '../engine/spec.ts';

const FS = 24000;
const TARGET_DB = -13;
const POINTS: Array<[number, number]> = [
  [0.55, 0.7],
  [0.85, 1],
];

const levelDb = (spec: EngineSpec, trim: number, share: number, pedal: number): number => {
  const engine = buildEngine(spec);
  const synth = new EngineSynth(synthConfig(engine, trim), FS);
  const rpm = spec.redlineRpm * share;
  synth.sim.state = 'running';
  synth.sim.rpm = rpm;
  synth.sim.load = pedal;
  synth.sim.pedal = pedal;
  synth.sim.lockedRpm = rpm;
  const left = new Float32Array(256);
  const right = new Float32Array(256);
  const settle = Math.floor((FS * 0.15) / left.length);
  const measure = Math.floor((FS * 0.25) / left.length);
  let sum = 0;
  let count = 0;
  for (let block = 0; block < settle + measure; block++) {
    synth.process(left, right);
    if (block < settle) continue;
    for (let i = 0; i < left.length; i++) sum += left[i]! * left[i]! + right[i]! * right[i]!;
    count += left.length * 2;
  }
  return 10 * Math.log10(sum / Math.max(count, 1) + 1e-12);
};

/** Output trim that brings this engine to the same level as the catalogue. */
export function measureTrim(spec: EngineSpec): number {
  let trim = 0.45;
  const levels = POINTS.map(([share, pedal]) => levelDb(spec, trim, share, pedal));
  const level = levels.reduce((a, b) => a + b, 0) / levels.length;
  trim *= 10 ** ((TARGET_DB - level) / 20);
  return Math.min(2.5, Math.max(0.05, trim));
}
