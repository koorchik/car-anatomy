import { ENGINES } from '../src/data/engines.ts';
import { render } from './render-audio.ts';

const FS = 48000;

/** Goertzel magnitude of one frequency. */
const goertzel = (x: Float32Array, hz: number): number => {
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
  db: number;
  amp: number;
}

/** Level of each half engine order at a fixed crank speed, in dB relative to the strongest. */
export function engineOrders(id: string, rpmArg?: number, pedal = 0.8, channel: 'l' | 'r' = 'l', maxOrder = 16): OrderRow[] {
  const spec = ENGINES.find((e) => e.id === id)!;
  const rpm = rpmArg ?? spec.redlineRpm * 0.5;
  const settle = 0.8;
  const out = render(id, [
    { seconds: settle, pedal, rpm },
    { seconds: 3, pedal, rpm },
  ]);
  const signal = out[channel].subarray(Math.floor(settle * FS));
  const base = rpm / 60;
  const rows: OrderRow[] = [];
  for (let k = 1; k <= maxOrder * 2; k++) {
    const order = k / 2;
    const hz = base * order;
    if (hz > FS / 2.5) break;
    rows.push({ order, db: 0, amp: goertzel(signal, hz) });
  }
  const top = Math.max(...rows.map((r) => r.amp));
  rows.forEach((r) => {
    r.db = 20 * Math.log10(r.amp / top + 1e-9);
  });
  return rows;
}
