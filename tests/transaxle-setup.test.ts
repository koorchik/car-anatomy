// The settings panel of the transaxle page (owner decision A3, stage K6a-geom): every change keeps each pair on the
// shared centre distance, the final drive's pair on its own, the box still builds, and «Заводські» gives the factory
// box back exactly.

import { describe, expect, it } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { centreDistance } from '../src/drivetrain/gear-geometry.ts';
import { transaxleSetupModel } from '../src/drivetrain/layouts/setup-model.ts';
import { finalTeethForRatio, transaxleHelix, transaxlePairFits, TRANSAXLE_SPEEDS } from '../src/drivetrain/layouts/transaxle-setup.ts';
import { bevelSizes, transaxleSpec, type TransaxleDesc } from '../src/drivetrain/layouts/transaxle.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';

const BOXES = ['manual-transaxle', 'manual-transaxle/porsche-911-carrera-t-992'] as const;
const factoryOf = (id: string): TransaxleDesc => gearboxById(id)!.layout.desc as TransaxleDesc;

/** Every speed pair spans the centre distance with its teeth, module and helix; the box builds. */
function expectBuildable(desc: TransaxleDesc): void {
  desc.speeds.forEach((pair, i) => {
    const helix = transaxleHelix(desc, pair, pair.teeth);
    expect(helix, `speed ${i + 1}`).toBeGreaterThan(0);
    const shift = pair.shift ?? [0, 0];
    expect(centreDistance(pair.module, pair.teeth[0], pair.teeth[1], helix, desc.pressureAngle, shift[0] + shift[1]), `speed ${i + 1}`).toBeCloseTo(desc.centreMm, 6);
  });
  const box = buildGearbox(transaxleSpec(desc));
  expect(box.states.filter((s) => s.kind === 'gear').length).toBe(desc.speeds.length + 1);
}

describe.each(BOXES)('the settings of %s', (id) => {
  const factory = factoryOf(id);
  const model = transaxleSetupModel(factory);

  it('start from the factory box and its final drive from the teeth', () => {
    expect(model.desc(model.factory)).toBe(factory);
    expect(model.isFactory(model.factory)).toBe(true);
    expect(model.finalDrive(model.factory, factory)).toBeCloseTo(factory.final.teeth[1] / factory.final.teeth[0], 12);
    expect(model.ratios(factory)).toEqual(factory.speeds.map((s) => s.teeth[1] / s.teeth[0]));
  });

  it('give 4 to 7 speeds, keep the teeth of the speeds left, and add a speed loose on the input shaft', () => {
    expect(model.speedCounts).toEqual(TRANSAXLE_SPEEDS);
    for (const n of TRANSAXLE_SPEEDS) {
      const desc = model.desc(model.setSpeeds(model.factory, n));
      expect(desc.speeds.length).toBe(n);
      expectBuildable(desc);
      for (let i = 0; i < Math.min(n, factory.speeds.length); i++) expect(desc.speeds[i]!.teeth).toEqual(factory.speeds[i]!.teeth);
      // Each speed on exactly one sleeve side.
      const sides = desc.sleeves.flatMap((s) => [s.front, s.back]).filter((x) => x !== null);
      expect(sides.sort()).toEqual([...desc.speeds.map((_, i) => i + 1), 'R'].sort());
      // Speeds stay in order: an added one is above the top.
      const r = model.ratios(desc);
      expect(r.every((v, i) => i === 0 || v < r[i - 1]!)).toBe(true);
    }
  });

  it('re-tooth a speed for its slider anywhere in the range, and find the factory pair again', () => {
    for (let i = 0; i < factory.speeds.length; i++) {
      for (let r = model.ratioRange[0]; r <= model.ratioRange[1]; r += 0.25) {
        const teeth = model.teethForRatio(factory, i, r);
        expect(teeth, `speed ${i + 1} at ${r}`).not.toBeNull();
        expectBuildable(model.desc(model.setTeeth(model.factory, i, teeth!)));
      }
      const own = factory.speeds[i]!;
      expect(model.teethForRatio(factory, i, own.teeth[1] / own.teeth[0])).toEqual(own.teeth);
    }
  });

  it('step a tooth on either gear and keep the centre distance', () => {
    for (let i = 0; i < factory.speeds.length; i++) {
      for (const which of [0, 1] as const) {
        for (const delta of [1, -1] as const) {
          const teeth = model.stepTeeth(factory, i, which, delta);
          if (!teeth) continue;
          const now = factory.speeds[i]!.teeth[1] / factory.speeds[i]!.teeth[0];
          const ratio = teeth[1] / teeth[0];
          // The ratio moves the way the step does: more teeth on the output gear, a lower gear.
          expect(Math.sign(ratio - now), `speed ${i + 1}, gear ${which}, ${delta}`).toBe(which === 1 ? delta : -delta);
          expect(transaxlePairFits(factory, i, factory.speeds[i]!, teeth)).toBe(true);
          expectBuildable(model.desc(model.setTeeth(model.factory, i, teeth)));
        }
      }
    }
  });

  it('give the final drive other teeth on the same pair, across 2.0–5.5', () => {
    const f = factory.final;
    for (let r = 2; r <= 5.5 + 1e-9; r += 0.1) {
      const setup = model.setFinalDrive(model.factory, r);
      const desc = model.desc(setup);
      const ratio = model.finalDrive(setup, desc);
      expect(Math.abs(ratio - r), `final ${r.toFixed(1)}`).toBeLessThan(0.12);
      expect(desc.final.module).toBe(f.module);
      if (f.kind === 'helical') {
        // The same centre distance, which the helix closes.
        const helix = Math.acos((f.module * (desc.final.teeth[0] + desc.final.teeth[1])) / (2 * f.centreMm)) * (180 / Math.PI);
        expect(helix).toBeGreaterThanOrEqual(15 - 1e-9);
        expect(helix).toBeLessThanOrEqual(35 + 1e-9);
      } else {
        expect(f.faceWidth).toBeLessThanOrEqual(bevelSizes(f.module, desc.final.teeth[0], desc.final.teeth[1]).cone / 3);
      }
      expectBuildable(desc);
    }
    // The ends hold.
    expect(model.finalDrive(model.setFinalDrive(model.factory, 9), factory)).toBeCloseTo(model.finalDrive(model.setFinalDrive(model.factory, 5.5), factory), 9);
    // The factory ratio gives the factory teeth: the setup is the factory's again.
    expect(model.setFinalDrive(model.setFinalDrive(model.factory, 3), f.teeth[1] / f.teeth[0])).toEqual(model.factory);
    expect(finalTeethForRatio(f, f.teeth[1] / f.teeth[0])).toEqual(f.teeth);
  });

  it('leave the setup alone when a move changes no teeth: the page then rebuilds nothing', () => {
    const own = factory.speeds[0]!;
    expect(model.setTeeth(model.factory, 0, own.teeth)).toBe(model.factory);
    expect(model.setFinalDrive(model.factory, factory.final.teeth[1] / factory.final.teeth[0] + 1e-4)).toBe(model.factory);
    expect(model.setSpeeds(model.factory, factory.speeds.length)).toBe(model.factory);
  });

  it('give «Заводські» back as the factory box after any change', () => {
    let setup = model.setSpeeds(model.factory, 7);
    setup = model.setTeeth(setup, 0, model.teethForRatio(factory, 0, 3)!);
    setup = model.setFinalDrive(setup, 2.8);
    expect(model.isFactory(setup)).toBe(false);
    let back = model.setSpeeds(setup, factory.speeds.length);
    back = model.setTeeth(back, 0, factory.speeds[0]!.teeth);
    back = model.setFinalDrive(back, factory.final.teeth[1] / factory.final.teeth[0]);
    expect(back).toEqual(model.factory);
    expect(model.desc(back)).toBe(factory);
  });
});
