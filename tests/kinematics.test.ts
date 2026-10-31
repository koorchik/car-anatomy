import { describe, expect, it } from 'vitest';
import { ENGINES, engineById } from '../src/data/engines.ts';
import {
  balance,
  buildEngine,
  cyclePhase,
  groupIntervals,
  mod,
  pistonAcceleration,
  pistonPin,
  torqueCurve,
} from '../src/engine/kinematics.ts';

const engine = (id: string) => buildEngine(engineById(id)!);
const pinSet = (id: string): number[] =>
  [...new Set(engine(id).throws.map((t) => Math.round(mod(t.angle - engine(id).throws[0]!.angle, 360))))].sort((a, b) => a - b);

describe('catalogue', () => {
  it.each(ENGINES.map((e) => [e.id, e] as const))('%s has a complete, consistent definition', (_id, spec) => {
    const e = buildEngine(spec);
    const total = e.intervals.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(e.cycle);
    if (!e.isRotary) {
      expect(new Set(spec.firingOrder).size).toBe(spec.cylinders);
      expect(e.cylinders).toHaveLength(spec.cylinders);
      expect(spec.exhaust.groups.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: spec.cylinders }, (_, i) => i + 1));
    }
    expect(spec.article.pros.length).toBeGreaterThan(0);
    expect(spec.article.cons.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    expect(new Set(ENGINES.map((e) => e.id)).size).toBe(ENGINES.length);
  });

  it('computes real displacement figures', () => {
    expect(engine('v8-cross').displacementCc).toBeCloseTo(6162, -1);
    expect(engine('i4').displacementCc).toBeCloseTo(1998, -1);
    expect(engine('w16').displacementCc).toBeCloseTo(7993, -1);
    expect(engine('i6').displacementCc).toBeCloseTo(2997, -1);
    expect(engine('v10').displacementCc).toBeCloseTo(4806, -1);
  });
});

describe('firing order implies the known crank layout', () => {
  // Pin angles are derived from firing order plus bank angle, so these prove the data is self-consistent.
  it('crossplane V8 has four shared pins at 90 degrees', () => {
    const e = engine('v8-cross');
    expect(e.throws).toHaveLength(4);
    expect(e.throws.every((t) => t.cylinders.length === 2)).toBe(true);
    expect(pinSet('v8-cross')).toEqual([0, 90, 180, 270]);
  });

  it('flat-plane V8 has four shared pins in one plane', () => {
    const e = engine('v8-flat');
    expect(e.throws).toHaveLength(4);
    expect(e.throws.every((t) => t.cylinders.length === 2)).toBe(true);
    expect(pinSet('v8-flat')).toEqual([0, 180]);
  });

  it('V12 has six shared pins like an inline six', () => {
    const e = engine('v12');
    expect(e.throws).toHaveLength(6);
    expect(pinSet('v12')).toEqual([0, 120, 240]);
  });

  it('72-degree V10 shares five pins at 72 degrees', () => {
    const e = engine('v10');
    expect(e.throws).toHaveLength(5);
    expect(pinSet('v10')).toEqual([0, 72, 144, 216, 288]);
  });

  it('60-degree V6 needs six separate pins for even firing', () => {
    expect(engine('v6-60').throws).toHaveLength(6);
    expect(pinSet('v6-60')).toEqual([0, 60, 120, 180, 240, 300]);
  });

  it('odd-fire 90-degree V6 shares three pins at 120 degrees', () => {
    const e = engine('v6-90');
    expect(e.throws).toHaveLength(3);
    expect(pinSet('v6-90')).toEqual([0, 120, 240]);
  });

  it('180-degree V12 shares pins, boxer six does not', () => {
    expect(engine('f12').throws).toHaveLength(6);
    expect(engine('b6').throws).toHaveLength(6);
    const b6 = engine('b6');
    const c1 = b6.cylinders.find((c) => c.n === 1)!;
    const c4 = b6.cylinders.find((c) => c.n === 4)!;
    expect(mod(c1.pin - c4.pin, 360)).toBeCloseTo(180);
    const f = engine('f12');
    expect(f.cylinders.find((c) => c.n === 1)!.pin).toBeCloseTo(f.cylinders.find((c) => c.n === 7)!.pin);
  });

  it('inline engines have the textbook pin spacing', () => {
    expect(pinSet('i3')).toEqual([0, 120, 240]);
    expect(pinSet('i4')).toEqual([0, 180]);
    expect(pinSet('i5')).toEqual([0, 72, 144, 216, 288]);
    expect(pinSet('i6')).toEqual([0, 120, 240]);
    expect(pinSet('i8')).toEqual([0, 90, 180, 270]);
  });

  it('flat four has the 0-180-180-0 crank of a Subaru', () => {
    const e = engine('b4');
    const pins = [...e.throws].sort((a, b) => b.z - a.z).map((t) => Math.round(mod(t.angle - e.throws[0]!.angle, 360)));
    expect(pins).toEqual([0, 180, 180, 0]);
  });
});

describe('firing intervals', () => {
  it('V-twin is 315/405', () => {
    expect(engine('v2').intervals).toEqual([315, 405]);
  });

  it('crossplane bank sees the uneven 90-180-270-180 sequence, flat-plane bank an even 180', () => {
    const cross = engine('v8-cross');
    const uneven = groupIntervals(cross, [1, 3, 5, 7]);
    expect([...uneven].sort((a, b) => a - b)).toEqual([90, 180, 180, 270]);
    const flat = engine('v8-flat');
    expect(groupIntervals(flat, [1, 2, 3, 4])).toEqual([180, 180, 180, 180]);
  });

  it('every engine fires each chamber once per cycle', () => {
    for (const spec of ENGINES) {
      const e = buildEngine(spec);
      for (const c of e.cylinders) {
        expect(cyclePhase(e, c, c.fire)).toBeCloseTo(0);
      }
    }
  });
});

describe('piston motion', () => {
  it('is at the top of its stroke at TDC, for every cylinder of every engine', () => {
    for (const spec of ENGINES) {
      const e = buildEngine(spec);
      if (e.isRotary) continue;
      for (const c of e.cylinders) {
        expect(pistonPin(e, c, c.fire)).toBeCloseTo(e.r + e.l, 6);
        expect(pistonPin(e, c, c.fire + 180)).toBeCloseTo(e.l - e.r, 6);
      }
    }
  });

  it('acceleration matches a numerical second derivative', () => {
    const e = engine('i4');
    const c = e.cylinders[0]!;
    const h = 0.05;
    for (const theta of [0, 37, 90, 141, 233]) {
      const numeric =
        (pistonPin(e, c, theta + h) - 2 * pistonPin(e, c, theta) + pistonPin(e, c, theta - h)) / ((h * Math.PI) / 180) ** 2;
      expect(pistonAcceleration(e, c, theta)).toBeCloseTo(numeric, 2);
    }
  });
});

describe('balance from geometry alone reproduces engineering folklore', () => {
  const tiny = 0.01;

  it('single: half the first-order force remains, plus second order', () => {
    const b = balance(engine('i1'));
    expect(b.force1).toBeCloseTo(0.5, 2);
    expect(b.force2).toBeGreaterThan(0.2);
  });

  it('inline four: no first order, large second-order force', () => {
    const b = balance(engine('i4'));
    expect(b.force1).toBeLessThan(tiny);
    expect(b.couple1).toBeLessThan(tiny);
    expect(b.couple2).toBeLessThan(tiny);
    expect(b.force2).toBeGreaterThan(1);
  });

  it('inline three: forces cancel, rocking couple remains', () => {
    const b = balance(engine('i3'));
    expect(b.force1).toBeLessThan(tiny);
    expect(b.force2).toBeLessThan(tiny);
    expect(b.couple1).toBeGreaterThan(0.5);
  });

  it('inline five: forces cancel, couples remain', () => {
    const b = balance(engine('i5'));
    expect(b.force1).toBeLessThan(tiny);
    expect(b.force2).toBeLessThan(tiny);
    expect(b.couple2).toBeGreaterThan(0.5);
  });

  it('inline six: everything cancels', () => {
    const b = balance(engine('i6'));
    expect(b.force1).toBeLessThan(tiny);
    expect(b.force2).toBeLessThan(tiny);
    expect(b.couple1).toBeLessThan(tiny);
    expect(b.couple2).toBeLessThan(tiny);
  });

  it('crossplane V8: counterweights fix first order, second order cancels', () => {
    const b = balance(engine('v8-cross'));
    expect(b.force1).toBeLessThan(tiny);
    expect(b.couple1).toBeLessThan(tiny);
    expect(b.force2).toBeLessThan(tiny);
    expect(b.couple2).toBeLessThan(tiny);
  });

  it('flat-plane V8 keeps a sizeable horizontal second-order force', () => {
    expect(balance(engine('v8-flat')).force2).toBeGreaterThan(1);
  });

  it('V12 cancels everything', () => {
    const b = balance(engine('v12'));
    expect(b.force1).toBeLessThan(tiny);
    expect(b.force2).toBeLessThan(tiny);
    expect(b.couple1).toBeLessThan(tiny);
    expect(b.couple2).toBeLessThan(tiny);
  });

  it('flat four: forces cancel, second-order couple stays small', () => {
    const b = balance(engine('b4'));
    expect(b.force1).toBeLessThan(tiny);
    expect(b.force2).toBeLessThan(tiny);
    expect(b.couple2).toBeLessThan(balance(engine('i4')).force2);
  });
});

describe('torque smoothness', () => {
  const dip = (id: string) => Math.min(...torqueCurve(engine(id)));
  const peak = (id: string) => Math.max(...torqueCurve(engine(id)));

  it('more overlap gives a flatter curve', () => {
    expect(peak('i1')).toBeGreaterThan(peak('i4'));
    expect(peak('i4')).toBeGreaterThan(peak('i6'));
    expect(peak('i6')).toBeGreaterThan(peak('v12'));
  });

  it('a single goes negative during compression, a V12 never does', () => {
    expect(dip('i1')).toBeLessThan(-0.5);
    expect(dip('v12')).toBeGreaterThan(0);
  });

  it('mean is normalised to one', () => {
    const c = torqueCurve(engine('i6'));
    expect(c.reduce((a, b) => a + b, 0) / c.length).toBeCloseTo(1, 4);
  });
});
