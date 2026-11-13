import { engineById } from '../src/data/engines.ts';
import { synthConfig } from '../src/audio/synth.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { EngineSim } from '../src/engine/sim.ts';
import { render, type Rendered, type Step } from './render-audio.ts';

const FS = 48000;

/** Goertzel magnitude of one frequency. */
export const goertzel = (x: Float32Array, hz: number): number => {
  const w = (2 * Math.PI * hz) / FS;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    // Hann window keeps neighbouring orders apart.
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    const s = x[i]! * win + c * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / n;
};

export interface OrderRow {
  order: number;
  /** Relative to the strongest order. */
  db: number;
  amp: number;
  /** Absolute level, dB on the Goertzel magnitude, so that one engine can be compared across modes. */
  level: number;
}

/**
 * How the speed is held while measuring.
 * - locked: slow-motion lock at the exact speed, load equal to the pedal (as the loudness calibration does).
 * - free: the free-revving engine on the pedal that holds this speed, as a driver blipping in neutral would.
 * - dyno: the engine on the dyno, the absorber holding the speed against the pedal.
 */
export type OrderMode = 'locked' | 'free' | 'dyno';

/** Pedal that holds a free-revving engine at a speed, found on the crank simulation alone. */
export function freePedal(id: string, rpm: number): number {
  const params = synthConfig(buildEngine(engineById(id)!)).sim;
  const steady = (pedal: number): number => {
    const sim = new EngineSim(params);
    sim.start();
    sim.pedal = pedal;
    for (let t = 0; t < 6; t += 1 / 3000) sim.step(1 / 3000);
    return sim.rpm;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (steady(mid) < rpm) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Measured {
  rows: OrderRow[];
  out: Rendered;
  /** Samples measured, at the end of the render. */
  signal: Float32Array;
}

/** Orders of a render held at one speed, over its last `seconds`. */
export function measureOrders(id: string, rpm: number, mode: OrderMode, pedal: number, channel: 'l' | 'r' = 'l', maxOrder = 16): Measured {
  let steps: Step[];
  const seconds = 3;
  if (mode === 'locked') {
    steps = [{ seconds: 0.8, pedal, rpm }, { seconds: 3, pedal, rpm }];
  } else if (mode === 'free') {
    const held = freePedal(id, rpm);
    steps = [{ seconds: 6, pedal: held }, { seconds: 3, pedal: held }];
  } else {
    steps = [{ seconds: 1, pedal: 0, dyno: 'off' }, { seconds: 6, pedal, dyno: { hold: rpm } }, { seconds: 3, pedal }];
  }
  const out = render(id, steps);
  const signal = out[channel].subarray(out[channel].length - Math.floor(seconds * FS));
  const base = rpm / 60;
  const rows: OrderRow[] = [];
  for (let k = 1; k <= maxOrder * 2; k++) {
    const order = k / 2;
    const hz = base * order;
    if (hz > FS / 2.5) break;
    const amp = goertzel(signal, hz);
    rows.push({ order, db: 0, amp, level: 20 * Math.log10(amp + 1e-12) });
  }
  const top = Math.max(...rows.map((r) => r.amp));
  rows.forEach((r) => {
    r.db = 20 * Math.log10(r.amp / top + 1e-9);
  });
  return { rows, out, signal };
}

/** Level of each half engine order at a fixed crank speed, in dB relative to the strongest. */
export function engineOrders(id: string, rpmArg?: number, pedal = 0.8, channel: 'l' | 'r' = 'l', maxOrder = 16, mode: OrderMode = 'locked'): OrderRow[] {
  const spec = engineById(id)!;
  const rpm = rpmArg ?? spec.redlineRpm * 0.5;
  return measureOrders(id, rpm, mode, pedal, channel, maxOrder).rows;
}
