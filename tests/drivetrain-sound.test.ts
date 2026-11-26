// The gearbox plan's tests of the drivetrain's sound. Test 7 for now (stage K3a): the engine on its drivetrain sounds
// sane through a whole drive, pull-away, every upshift, braking with downshifts and idle, as the worklet renders it,
// at the usual step and at the coarse one the audio thread falls back to when it runs short of time.

import { describe, expect, it } from 'vitest';
import { peak, renderDrive, type DriveRender } from '../scripts/render-audio.ts';

const FS = 48000;

function finite(x: Float32Array): boolean {
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i]!)) return false;
  return true;
}

describe('7. the sound is sound', () => {
  const drives = new Map<number, DriveRender>();
  const drive = (step: number): DriveRender => {
    let d = drives.get(step);
    if (!d) drives.set(step, (d = renderDrive('bmw-m3-e30', { downshift: true, idleS: 1.5, topS: 2, endIdleS: 1 }, step)));
    return d;
  };

  it('BMW M3 E30: pull-away, 1→5, braking with 5→2, idle: no NaN, peak at most 1, heard all the way', () => {
    const d = drive(16);
    expect(d.story.done).toBe(true);
    expect(d.story.shifts.map((s) => `${s.from}→${s.to}`)).toEqual(['1→2', '2→3', '3→4', '4→5']);
    expect(finite(d.l) && finite(d.r)).toBe(true);
    expect(Math.max(peak(d.l), peak(d.r))).toBeLessThanOrEqual(1);
    // Every second of it is heard: the engine never fell silent or stalled on the way.
    for (let s = 0; s + FS <= d.l.length; s += FS) expect(peak(d.l.subarray(s, s + FS)), `second ${s / FS}`).toBeGreaterThan(0.01);
    // The downshifts happened while the car slowed, and after each the clutch locked the engine to the lower gear: before
    // the next one was asked for, the engine turned as the driven wheels turn it through that gear (to 3 %; under the
    // brakes the wheels turn slower than the road runs).
    const downs = d.story.downshifts;
    expect(downs.map((s) => s.shift)).toEqual(['5→4', '4→3', '3→2']);
    const { cd } = d.story;
    const rpmIn = (gear: string, wheel: number): number => (wheel * cd.axle.ratio * cd.gears.find((g) => g.name === gear)!.ratio * 30) / Math.PI;
    const block = 128 / FS;
    downs.forEach(({ shift, t }, k) => {
      const to = shift.split('→')[1]!;
      const from = Math.round(t / block);
      const until = k + 1 < downs.length ? Math.round(downs[k + 1]!.t / block) : d.rpm.length;
      let best = Infinity;
      for (let i = from; i < until; i++) if (d.wheel[i]! > 5) best = Math.min(best, Math.abs(d.rpm[i]! / rpmIn(to, d.wheel[i]!) - 1));
      expect(best, shift).toBeLessThan(0.03);
      expect(d.speed[until - 1]!, shift).toBeLessThan(d.speed[from]!);
    });
  }, 120_000);

  it('the coarse step (32 samples) drives the same car: as sound, and to the same top speed within 2 %', () => {
    const fine = drive(16);
    const coarse = drive(32);
    expect(coarse.story.done).toBe(true);
    expect(finite(coarse.l) && finite(coarse.r)).toBe(true);
    expect(Math.max(peak(coarse.l), peak(coarse.r))).toBeLessThanOrEqual(1);
    expect(coarse.story.topSpeed).toBeGreaterThan(fine.story.topSpeed * 0.98);
    expect(coarse.story.topSpeed).toBeLessThan(fine.story.topSpeed * 1.02);
  }, 120_000);
});
