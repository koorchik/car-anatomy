import { describe, expect, it } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { centreDistance } from '../src/drivetrain/gear-geometry.ts';
import { gcd, pairCandidates, pickPair } from '../src/drivetrain/gear-pick.ts';
import type { LayshaftDesc } from '../src/drivetrain/layouts/layshaft.ts';

const e30 = gearboxById('manual-rwd')!;
const desc = e30.layout.desc as LayshaftDesc;
const mainRatio = desc.main.teeth[1] / desc.main.teeth[0];

describe('pickPair', () => {
  it('reconstructs every BMW M3 E30 pair from its published ratio, module and the shared centre distance', () => {
    desc.speeds.forEach((pair, k) => {
      if (pair === 'direct') return;
      const pick = pickPair({ ratio: e30.published.ratios[k]! / mainRatio, centreMm: desc.centreMm, module: pair.module, helixRange: [15, 35], coprime: false })!;
      expect(pick.teeth, `gear ${k + 1}`).toEqual(pair.teeth);
      expect(Math.abs(mainRatio * pick.ratio - e30.published.ratios[k]!)).toBeLessThanOrEqual(0.0005);
    });
  });

  it('finds the real first pair of the TR-6060 MZ6, coprime', () => {
    const pick = pickPair({ ratio: 2.966 / (38 / 29), centreMm: 85, module: 2.5, helixRange: [15, 35] })!;
    expect(pick.teeth).toEqual([19, 43]);
    expect(pick.coprime).toBe(true);
  });

  it('lands within half a step of the grid, with coprime teeth and the helix in range', () => {
    for (const ratio of [0.62, 0.81, 1, 1.27, 1.9, 2.4, 3.1]) {
      for (const module of [1.75, 2, 2.5, 3]) {
        const pick = pickPair({ ratio, centreMm: 76, module, helixRange: [15, 35] });
        if (!pick) continue;
        expect(Math.abs(pick.error), `${ratio} m${module}`).toBeLessThanOrEqual(pick.step / 2 + 1e-12);
        expect(gcd(pick.teeth[0], pick.teeth[1])).toBe(1);
        expect(pick.helix).toBeGreaterThanOrEqual(15);
        expect(pick.helix).toBeLessThanOrEqual(35);
        expect(centreDistance(module, pick.teeth[0], pick.teeth[1], pick.helix, 20)).toBeCloseTo(76, 9);
      }
    }
  });

  it('a finer module makes the grid finer', () => {
    const step = (module: number) => pickPair({ ratio: 1.5, centreMm: 76, module, helixRange: [15, 35] })!.step;
    expect(step(1.5)).toBeLessThan(step(3));
  });

  it('a spur pair must span the centre distance with its tooth sum as it is', () => {
    const pick = pickPair({ ratio: 2, centreMm: 60, module: 2, helixRange: [0, 0] })!;
    expect(pick.teeth[0] + pick.teeth[1]).toBe(60);
    expect(pick.helix).toBe(0);
  });

  it('gives nothing when no tooth sum fits', () => {
    expect(pickPair({ ratio: 1.5, centreMm: 10, module: 3, helixRange: [15, 35] })).toBeNull();
    expect(pairCandidates({ ratio: 1.5, centreMm: 10, module: 3, helixRange: [15, 35] })).toEqual([]);
  });
});
