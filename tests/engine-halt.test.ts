// A section without an engine silences it at once (ShellAudio.suspend → Drive.halt → the worklet's 'halt'): the audio
// thread is suspended right after, and whatever the engine still had to do would play on when it resumes. A stop runs
// the engine down over a second or two, so on coming back the visitor would hear the rest of it; a halt leaves nothing.

import { describe, expect, it } from 'vitest';
import { EngineSynth, synthConfig } from '../src/audio/synth.ts';
import { engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';

const RATE = 48000;
const BLOCK = 128;

/** RMS of `seconds` of sound, rendered in the worklet's blocks. */
function rms(synth: EngineSynth, seconds: number): number {
  const left = new Float32Array(BLOCK);
  const right = new Float32Array(BLOCK);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < Math.round((seconds * RATE) / BLOCK); i++) {
    synth.process(left, right);
    for (let k = 0; k < BLOCK; k++) sum += left[k]! * left[k]! + right[k]! * right[k]!;
    n += 2 * BLOCK;
  }
  return Math.sqrt(sum / n);
}

/** An engine at full throttle near its redline, as a visitor may leave it. */
function revving(): EngineSynth {
  const synth = new EngineSynth(synthConfig(buildEngine(engineById('v8-cross')!)), RATE);
  synth.sim.startImmediately();
  synth.sim.pedal = 1;
  rms(synth, 1.5);
  synth.sim.pedal = 0;
  return synth;
}

describe('an engine silenced by a section', () => {
  it('is quiet at once after a halt, while a stopped one is still running down', () => {
    const loud = rms(revving(), 0.1);
    const stopped = revving();
    stopped.sim.stop();
    rms(stopped, 0.2);
    const halted = revving();
    halted.sim.adopt('off', 0);
    rms(halted, 0.2);
    // What would be heard on coming back, after the first fifth of a second the pipes take to ring out.
    expect(rms(stopped, 0.3) / loud).toBeGreaterThan(0.05);
    expect(rms(halted, 0.3) / loud).toBeLessThan(0.01);
    expect([halted.sim.state, halted.sim.rpm]).toEqual(['off', 0]);
  });
});
