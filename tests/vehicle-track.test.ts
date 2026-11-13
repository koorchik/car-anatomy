import { describe, expect, it } from 'vitest';
import { buildTrack, TEST_CIRCUIT, type TrackDef } from '../src/vehicle/track.ts';

describe('test circuit', () => {
  const track = buildTrack(TEST_CIRCUIT);

  it('closes: the step from the last sample lands on the first, and the heading turns exactly 360°', () => {
    const i = track.n - 1;
    const h = track.heading[i]!;
    const k = track.kappa[i]!;
    // One more step along the last piece.
    const dh = k * track.ds;
    const x = track.x[i]! + (Math.abs(k) > 0 ? (Math.sin(h + dh) - Math.sin(h)) / k : track.ds * Math.cos(h));
    const y = track.y[i]! + (Math.abs(k) > 0 ? (Math.cos(h) - Math.cos(h + dh)) / k : track.ds * Math.sin(h));
    expect(Math.hypot(x - track.x[0]!, y - track.y[0]!)).toBeLessThan(0.01);
    const turned = TEST_CIRCUIT.pieces.reduce((sum, p) => sum + (p.kind === 'arc' ? (p.angle * Math.PI) / 180 : 0), 0);
    expect(turned).toBeCloseTo(2 * Math.PI, 9);
    expect(h + dh - track.heading[0]!).toBeCloseTo(2 * Math.PI, 6);
  });

  it('solves positive closers within 10 % of their nominal lengths', () => {
    const nominal = TEST_CIRCUIT.pieces.filter((p) => p.kind === 'straight' && p.closer).map((p) => (p.kind === 'straight' ? p.length : 0));
    for (const [solved, nom] of [[track.closers.a, nominal[0]!], [track.closers.b, nominal[1]!]] as const) {
      expect(solved).toBeGreaterThan(0);
      expect(Math.abs(solved / nom - 1)).toBeLessThan(0.1);
    }
  });

  it('never crosses itself: points more than 80 m apart along the lap stay 25 m apart', () => {
    let least = Infinity;
    for (let i = 0; i < track.n; i += 2) {
      for (let j = i + 1; j < track.n; j += 2) {
        const along = Math.min(j - i, track.n - (j - i)) * track.ds;
        if (along < 80) continue;
        least = Math.min(least, Math.hypot(track.x[i]! - track.x[j]!, track.y[i]! - track.y[j]!));
      }
    }
    expect(least).toBeGreaterThanOrEqual(25);
  });

  it('has its crest only on the 60 m it names', () => {
    let crest = 0;
    for (let i = 0; i < track.n; i++) if (track.kappaV[i]! < 0) crest += track.ds;
    expect(crest).toBeGreaterThan(58);
    expect(crest).toBeLessThan(62);
    const back = track.sectors.find((s) => s.name === TEST_CIRCUIT.pieces.find((p) => p.kind === 'straight' && p.crest)!.name)!;
    for (let i = 0; i < track.n; i++) if (track.kappaV[i]! < 0) expect(i * track.ds).toBeGreaterThan(back.s0);
  });

  it('refuses a lap that does not turn 360°', () => {
    const bad: TrackDef = { id: 'bad', name: 'bad', pieces: [{ kind: 'straight', length: 100, closer: 'a' }, { kind: 'arc', radius: 10, angle: 90 }, { kind: 'straight', length: 100, closer: 'b' }] };
    expect(() => buildTrack(bad)).toThrow();
  });
});
