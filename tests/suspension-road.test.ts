import { describe, expect, it } from 'vitest';
import { envelopeAtNode, EventRoad, ROAD_STEP_M, RoadBuffer, SEGMENT_M, SEGMENT_NODES, type RoadProfile } from '../src/suspension/road.ts';

const R = 0.344;
const PATCH = 0.2;

/** Fastest of a few runs, so a busy machine does not fail a budget the code meets. */
function bestMs(runs: number, fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('road events', () => {
  const road = new EventRoad([
    { kind: 'bump', atM: 2, lengthM: 0.5, heightM: 0.05 },
    { kind: 'pothole', atM: 6, lengthM: 0.2, depthM: 0.06 },
    { kind: 'step', atM: 10, heightM: 0.1 },
  ]);

  it('draws a half-cosine bump, a sharp pothole and a kerb edge', () => {
    expect(road.heightAt(1.9)).toBe(0);
    expect(road.heightAt(2.25)).toBeCloseTo(0.05, 12);
    expect(road.heightAt(2.125)).toBeCloseTo(0.025, 12);
    expect(road.heightAt(6.1)).toBe(-0.06);
    expect(road.heightAt(6.2)).toBe(0);
    expect(road.heightAt(9.999)).toBe(0);
    expect(road.heightAt(10)).toBe(0.1);
    expect(road.heightAt(50)).toBe(0.1);
  });
});

describe('enveloping', () => {
  it('does not let the tyre into a 0.2 m pothole: a smooth dip shallower than 60 mm', () => {
    const road = new RoadBuffer(new EventRoad([{ kind: 'pothole', atM: 6, lengthM: 0.2, depthM: 0.06 }]), R, PATCH);
    let deepest = 0;
    let steepest = 0;
    for (let x = 5; x < 7; x += ROAD_STEP_M) {
      deepest = Math.min(deepest, road.heightAt(x));
      steepest = Math.max(steepest, Math.abs(road.heightAt(x + ROAD_STEP_M) - road.heightAt(x)));
    }
    // Sagitta of the free circle over the gap is r − √(r² − 0.1²) = 15 mm; the patch average smooths it further.
    expect(deepest).toBeLessThan(-0.003);
    expect(deepest).toBeGreaterThan(-0.016);
    // No step anywhere: the steepest 5 mm change is far below the pothole's 60 mm edge.
    expect(steepest).toBeLessThan(0.001);
    // Without the patch average the dip is the circle's sagitta over the gap, and the average only makes it shallower.
    const circle = new RoadBuffer(new EventRoad([{ kind: 'pothole', atM: 6, lengthM: 0.2, depthM: 0.06 }]), R, 0);
    let bare = 0;
    for (let x = 5; x < 7; x += ROAD_STEP_M) bare = Math.min(bare, circle.heightAt(x));
    expect(Math.abs(-bare - (R - Math.sqrt(R * R - 0.1 * 0.1)))).toBeLessThan(1e-4);
    expect(deepest).toBeGreaterThan(bare);
  });

  it('stretches a kerb edge over more than the patch length', () => {
    const road = new RoadBuffer(new EventRoad([{ kind: 'step', atM: 10, heightM: 0.1 }]), R, PATCH);
    let start = NaN;
    let end = NaN;
    for (let x = 9; x < 11; x += ROAD_STEP_M) {
      const y = road.heightAt(x);
      if (Number.isNaN(start) && y > 0.001) start = x;
      if (Number.isNaN(end) && y > 0.099) end = x;
    }
    expect(end - start).toBeGreaterThan(PATCH);
    // The circle meets the edge √(2rH − H²) = 0.24 m before it, the patch adds half its length before that.
    expect(start).toBeGreaterThan(10 - 0.25 - PATCH / 2 - 0.01);
    expect(road.heightAt(11)).toBeCloseTo(0.1, 6);
  });

  it('follows a smooth bump longer than the patch closely', () => {
    const road = new RoadBuffer(new EventRoad([{ kind: 'bump', atM: 3, lengthM: 2, heightM: 0.05 }]), R, PATCH);
    expect(road.heightAt(4)).toBeLessThan(0.05);
    expect(road.heightAt(4)).toBeGreaterThan(0.045);
  });
});

describe('segment buffer', () => {
  const profile = new EventRoad([
    { kind: 'bump', atM: 3, lengthM: 0.5, heightM: 0.05 },
    { kind: 'pothole', atM: SEGMENT_M - 0.1, lengthM: 0.2, depthM: 0.06 },
    { kind: 'bump', atM: 2 * SEGMENT_M - 0.3, lengthM: 0.7, heightM: 0.07 },
    { kind: 'step', atM: 47, heightM: 0.1 },
  ]);

  it('matches the direct envelope at the grid nodes to 1e-6 m, across segment joins', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    const nodes = [0, 1, 590, 600, 650, 3999, 4000, 4001, 3990, 4010, 7950, 8000, 8050, 9399, 9400, 9420];
    for (const i of nodes) {
      const x = i * ROAD_STEP_M;
      expect(Math.abs(road.heightAt(x) - envelopeAtNode(profile, i, R, PATCH)), `node ${i}`).toBeLessThan(1e-6);
    }
  });

  it('closes each segment on the first node of the next', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    for (const seg of [0, 1, 2]) {
      const x = (seg + 1) * SEGMENT_M;
      const before = road.heightAt(x - 1e-9);
      const after = road.heightAt(x);
      expect(Math.abs(after - before)).toBeLessThan(1e-7);
    }
  });

  it('interpolates linearly between 5 mm nodes', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    const i = 640;
    const a = road.heightAt(i * ROAD_STEP_M);
    const b = road.heightAt((i + 1) * ROAD_STEP_M);
    expect(road.heightAt((i + 0.25) * ROAD_STEP_M)).toBeCloseTo(a + 0.25 * (b - a), 7);
    expect(road.slopeAt((i + 0.5) * ROAD_STEP_M)).toBeCloseTo((b - a) / ROAD_STEP_M, 4);
  });

  it('prepares at most one segment per call, ahead of the wheel', () => {
    const road = new RoadBuffer(profile, R, PATCH);
    expect(road.prepare(5)).toBe(false);
    expect(road.built).toBe(1);
    expect(road.prepare(5)).toBe(true);
    expect(road.built).toBe(2);
    expect(road.prepare(19)).toBe(true);
    expect(road.built).toBe(2);
    expect(road.has(0) && road.has(1)).toBe(true);
  });

  it('reads in under 0.1 µs and builds a 20 m segment in under 2 ms', () => {
    // Worst case for the build: a road that is never flat, so every node runs the full circle window.
    const wavy: RoadProfile = { heightAt: (x) => 0.01 * Math.sin(3 * x) + 0.004 * Math.sin(17 * x) };
    const road = new RoadBuffer(wavy, R, PATCH);
    let seg = 0;
    const build = bestMs(7, () => road.build(seg++));
    expect(build).toBeLessThan(2);
    const n = 1_000_000;
    let sink = 0;
    road.build(0);
    road.build(1);
    const read = bestMs(5, () => {
      for (let i = 0; i < n; i++) sink += road.heightAt(((i * 37) % (2 * SEGMENT_NODES)) * ROAD_STEP_M * 0.999);
    });
    expect(Number.isFinite(sink)).toBe(true);
    expect((read * 1000) / n).toBeLessThan(0.1);
  });
});
