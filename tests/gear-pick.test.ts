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

  it('picks the nearest of every coprime pair whose helix closes the centre distance, within half the grid step', () => {
    // The grid built here independently: a pair without profile shift spans a = m·(z1 + z2)/(2 cos β).
    const a = 76;
    const cosLimits = [Math.cos((35 * Math.PI) / 180), Math.cos((15 * Math.PI) / 180)];
    for (const ratio of [0.62, 0.81, 1, 1.27, 1.9, 2.4, 3.1]) {
      for (const module of [1.75, 2, 2.5, 3]) {
        const grid: number[] = [];
        for (let z1 = 12; z1 <= 120; z1++) {
          for (let z2 = 12; z2 <= 120; z2++) {
            const c = (module * (z1 + z2)) / (2 * a);
            if (c >= cosLimits[0]! && c <= cosLimits[1]! && gcd(z1, z2) === 1) grid.push(z2 / z1);
          }
        }
        const pick = pickPair({ ratio, centreMm: a, module, helixRange: [15, 35] });
        if (!grid.length) {
          expect(pick, `${ratio} m${module}`).toBeNull();
          continue;
        }
        const nearest = Math.min(...grid.map((r) => Math.abs(r - ratio)));
        expect(Math.abs(pick!.error), `${ratio} m${module}`).toBeCloseTo(nearest, 12);
        const below = Math.max(...grid.filter((r) => r < ratio));
        const above = Math.min(...grid.filter((r) => r > ratio));
        if (Number.isFinite(below) && Number.isFinite(above)) expect(Math.abs(pick!.error)).toBeLessThanOrEqual((above - below) / 2 + 1e-12);
        expect(gcd(pick!.teeth[0], pick!.teeth[1])).toBe(1);
        expect(pick!.helix).toBeGreaterThanOrEqual(15);
        expect(pick!.helix).toBeLessThanOrEqual(35);
        expect(centreDistance(module, pick!.teeth[0], pick!.teeth[1], pick!.helix, 20)).toBeCloseTo(a, 9);
      }
    }
  });

  it('a ratio the teeth give exactly keeps the step of the grid around it, not zero', () => {
    // The panel asks with the ratio of the teeth it already has.
    const [z1, z2] = desc.main.teeth;
    const pick = pickPair({ ratio: z2 / z1, centreMm: desc.centreMm, module: desc.main.module, helixRange: [15, 35] })!;
    expect(pick.teeth).toEqual([z1, z2]);
    expect(pick.error).toBe(0);
    const others = pairCandidates({ ratio: z2 / z1, centreMm: desc.centreMm, module: desc.main.module, helixRange: [15, 35] }).map((p) => p.ratio);
    const below = Math.max(...others.filter((r) => r < z2 / z1));
    const above = Math.min(...others.filter((r) => r > z2 / z1));
    expect(pick.step).toBeCloseTo((above - below) / 2, 12);
    expect(pick.step).toBeGreaterThan(0);
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
