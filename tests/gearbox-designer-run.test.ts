// The gearbox designer's "Drive" (gearbox plan, stage 10): the whole core drives the design, and its standing start
// lands within 3 % of the panel's quasi-static figure. The rear-engined 911 is left out: in first gear it is held by
// its tyres, and the scripted driver of runs.ts lets the rear wheels hop there (open issue of stage K10).
import { describe, expect, it } from 'vitest';
import { resolveGearboxDesign } from '../src/gearbox-designer/constraints.ts';
import { DEFAULT_GEARBOX_DESIGN } from '../src/gearbox-designer/design.ts';
import { designCarDrive, designRun, runDifferential } from '../src/gearbox-designer/drive-run.ts';
import { editGearboxDesign } from '../src/gearbox-designer/edit.ts';
import { evaluateGearbox } from '../src/gearbox-designer/evaluate.ts';
import { catalogueGearboxPresets } from '../src/gearbox-designer/presets.ts';

const own = resolveGearboxDesign(DEFAULT_GEARBOX_DESIGN);
const copies = catalogueGearboxPresets();
const cases = [
  ['the starting design', own],
  ['the starting design with a shorter first', editGearboxDesign(own, { firstRatio: 4.2 })],
  ['the starting design with a longer first', editGearboxDesign(own, { firstRatio: 3 })],
  ['the E30 copy', copies.find((c) => c.id === 'manual-rwd')!.design],
  ['the Civic copy (a front-wheel-drive transaxle)', copies.find((c) => c.id === 'manual-transaxle')!.design],
] as const;

describe('«Проїхати»: the whole core against the panel', () => {
  it.each(cases)('%s: 0–100 km/h and 0–400 m agree to 3 per cent', (_name, d) => {
    const q = evaluateGearbox(d);
    const run = designRun(d);
    expect(Math.abs(run.zeroTo100S! / q.zeroTo100S! - 1)).toBeLessThan(0.03);
    expect(Math.abs(run.zeroTo400mS! / q.zeroTo400mS! - 1)).toBeLessThan(0.03);
  });

  it('samples the run for the chart and the sound: time goes on, the speed reaches 100 km/h, the gears go up', () => {
    const run = designRun(own);
    expect(run.samples.length).toBeGreaterThan(100);
    for (let i = 1; i < run.samples.length; i++) {
      expect(run.samples[i]!.t).toBeGreaterThan(run.samples[i - 1]!.t);
      expect(run.samples[i]!.gear).toBeGreaterThanOrEqual(run.samples[i - 1]!.gear);
    }
    expect(Math.max(...run.samples.map((s) => s.kmh))).toBeGreaterThan(100);
    expect(run.samples.some((s) => s.throttle === 0)).toBe(true);
    expect(run.gearNames).toHaveLength(own.gears);
  });

  it('drives a transaxle with its final drive in the box, not twice', () => {
    const civic = copies.find((c) => c.id === 'manual-transaxle')!.design;
    const cd = designCarDrive(civic);
    expect(cd.axle.ratio).toBe(1);
    expect(cd.gears[0]!.ratio).toBeCloseTo(evaluateGearbox(civic).gears[0]!.overall, 2);
  });

  it('pulls with a turbo\'s steady boost: full load reaches each engine\'s published peak torque', async () => {
    const { fullLoadTorque } = await import('../src/drivetrain/engine-stub.ts');
    const { engineSource } = await import('../src/gearbox-designer/engine-source.ts');
    const { engineFacts } = await import('../src/data/engines.ts');
    // The catalogue's sourced figures: two turbocharged engines and one without.
    for (const id of ['i4/civic-type-r-k20c1', 'b6/porsche-992-carrera-3-0', 'i4/bmw-m3-e30-s14']) {
      const nm = engineFacts(id)!.torqueNm!;
      const map = engineSource(id)!.map;
      let peak = 0;
      for (let rpm = 1000; rpm < map.limitRpm; rpm += 50) peak = Math.max(peak, fullLoadTorque(map, (rpm * Math.PI) / 30));
      expect(Math.abs(peak / nm - 1)).toBeLessThan(0.03);
    }
  });

  it('drives a helical differential as the plate one of the same torque split', () => {
    expect(runDifferential({ ...own, diff: 'helical', tbr: 3 })).toEqual({ kind: 'plate', lockDrive: 0.5, lockCoast: 0.5, preloadNm: 0 });
  });
});
