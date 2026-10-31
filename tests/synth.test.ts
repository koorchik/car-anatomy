import { describe, expect, it } from 'vitest';
import { ENGINES } from '../src/data/engines.ts';
import { engineOrders, type OrderRow } from '../scripts/analysis.ts';
import { peak, render, rmsDb } from '../scripts/render-audio.ts';

const energy = (rows: OrderRow[], test: (order: number) => boolean): number =>
  rows.filter((r) => test(r.order)).reduce((sum, r) => sum + r.amp * r.amp, 0);

/** Share of harmonic energy on multiples of `step` orders, up to maxOrder. */
const shareOn = (rows: OrderRow[], step: number): number => {
  const on = energy(rows, (o) => Math.abs(o / step - Math.round(o / step)) < 1e-6);
  return on / energy(rows, () => true);
};

describe('audio stays well behaved', () => {
  it.each(ENGINES.map((e) => [e.id, e] as const))('%s has no NaN or overload through a full start and rev', (id, spec) => {
    const out = render(id, [
      { seconds: 2, pedal: 0 },
      { seconds: Math.max(1, spec.revTimeS * 1.8), pedal: 1 },
      { seconds: 1, pedal: 0 },
    ]);
    let finite = true;
    for (let i = 0; i < out.l.length; i++) {
      if (!Number.isFinite(out.l[i]!) || !Number.isFinite(out.r[i]!)) finite = false;
    }
    expect(finite).toBe(true);
    expect(peak(out.l)).toBeLessThanOrEqual(1);
    expect(peak(out.l)).toBeGreaterThan(0.05);
  });
});

describe('the firing tone sits where physics puts it', () => {
  // Engine order of the firing frequency is cylinders / 2, for a four-stroke.
  const low = (id: string, pedal = 0.7) => engineOrders(id, 2000, pedal, 'l', 12).filter((r) => r.order <= 12);

  it.each([
    ['i4', 2],
    ['i6', 3],
    ['v12', 6],
  ])('%s concentrates its energy on multiples of order %d', (id, order) => {
    expect(shareOn(low(id), order)).toBeGreaterThan(0.7);
  });

  it('a three-cylinder has its tone on order 1.5', () => {
    expect(shareOn(low('i3'), 1.5)).toBeGreaterThan(0.7);
  });

  it('a five-cylinder has its tone on order 2.5', () => {
    expect(shareOn(low('i5'), 2.5)).toBeGreaterThan(0.7);
  });

  it('a Wankel with two rotors fires twice a shaft turn', () => {
    expect(shareOn(low('r2'), 2)).toBeGreaterThan(0.6);
  });
});

describe('what makes the famous sounds differ', () => {
  // Pulses in one crossplane bank fall at 0, 180, 450 and 630 degrees. Summing them as phasors gives
  // orders 1.5 and 2.5 about 4 dB under the firing order 4, and nothing on orders 1, 2 and 3.
  // A flat-plane bank is evenly spaced, so it only has orders 2, 4, 6...
  const level = (rows: OrderRow[], order: number): number => rows.find((r) => r.order === order)!.db - rows.find((r) => r.order === 4)!.db;

  it('crossplane bank has the off-beat orders 1.5 and 2.5 that make the burble', () => {
    const rows = engineOrders('v8-cross', 2400, 0.8, 'l', 12);
    expect(level(rows, 1.5)).toBeGreaterThan(-14);
    expect(level(rows, 2.5)).toBeGreaterThan(-14);
  });

  it('flat-plane bank has almost none of them', () => {
    const rows = engineOrders('v8-flat', 2400, 0.8, 'l', 12);
    expect(level(rows, 1.5)).toBeLessThan(-22);
    expect(level(rows, 2.5)).toBeLessThan(-22);
  });

  it('crossplane has several times more energy off the even orders than flat-plane', () => {
    const offEven = (id: string): number => 1 - shareOn(engineOrders(id, 2400, 0.8, 'l', 12), 2);
    expect(offEven('v8-cross')).toBeGreaterThan(offEven('v8-flat') * 5);
  });

  it('unequal headers make the Subaru rumble: more energy off the firing orders than an inline four', () => {
    const offFiring = (id: string): number => 1 - shareOn(engineOrders(id, 2400, 0.8, 'l', 12), 2);
    expect(offFiring('b4')).toBeGreaterThan(offFiring('i4') * 1.5);
  });

  it('a diesel knocks more at idle than a petrol engine, up in the 1-3 kHz band', () => {
    const knock = (id: string): number => {
      const spec = ENGINES.find((e) => e.id === id)!;
      const out = render(id, [{ seconds: 1, pedal: 0, rpm: spec.idleRpm }, { seconds: 2, pedal: 0, rpm: spec.idleRpm }]);
      // Crude band energy: difference of two heavily smoothed copies of the signal.
      const x = out.l.subarray(48000);
      let lp1 = 0;
      let lp2 = 0;
      let sum = 0;
      for (let i = 0; i < x.length; i++) {
        lp1 += 0.33 * (x[i]! - lp1); // about 3 kHz
        lp2 += 0.1 * (x[i]! - lp2); // about 800 Hz
        const band = lp1 - lp2;
        sum += band * band;
      }
      return sum / x.length;
    };
    expect(knock('i4d')).toBeGreaterThan(knock('i4'));
  });
});

describe('loudness behaves like an engine', () => {
  it.each(ENGINES.map((e) => [e.id, e] as const))('%s is louder under full throttle than at idle', (id, spec) => {
    const db = (pedal: number, rpm: number): number => rmsDb(render(id, [{ seconds: 0.5, pedal, rpm }, { seconds: 1, pedal, rpm }]).l, 24000);
    const idle = db(0, spec.idleRpm);
    const wot = db(1, spec.redlineRpm * 0.85);
    expect(wot).toBeGreaterThan(idle + 3);
  });

  it('engines stay within a comfortable range of each other at full throttle', () => {
    const levels = ENGINES.map((spec) => rmsDb(render(spec.id, [{ seconds: 0.5, pedal: 1, rpm: spec.redlineRpm * 0.85 }, { seconds: 1, pedal: 1, rpm: spec.redlineRpm * 0.85 }]).l, 24000));
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(9);
  });

  it('individual firing pulses are clearly audible in slow motion', () => {
    const out = render('v8-cross', [{ seconds: 0.5, pedal: 0.2, rpm: 40 }, { seconds: 3, pedal: 0.2, rpm: 40 }]);
    expect(peak(out.l.subarray(24000))).toBeGreaterThan(0.04);
  });
});
