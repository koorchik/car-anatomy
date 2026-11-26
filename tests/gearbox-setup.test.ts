// The settings panel of the gearbox page (owner decision A3): every change keeps the centre distance, the box still
// builds and draws, and «Заводські» gives the factory box back exactly.

import { describe, expect, it, vi } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { driveCarById } from '../src/data/drive-cars.ts';
import { centreDistance } from '../src/drivetrain/gear-geometry.ts';
import { layshaftSpec, type LayshaftDesc, type PairDesc } from '../src/drivetrain/layouts/layshaft.ts';
import {
  factorySetup,
  isFactory,
  pairFits,
  pairHelix,
  RATIO_RANGE,
  sameBox,
  setFinalDrive,
  setSpeeds,
  setTeeth,
  setupDesc,
  speedRatios,
  stepTeeth,
  teethForRatio,
} from '../src/drivetrain/layouts/layshaft-setup.ts';
import { roadSpeedKmh, shiftDrops } from '../src/drivetrain/table-figures.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';
import { GearboxModel } from '../src/scene/gearbox/gearbox-model.ts';

// The cast aluminium's bump map is drawn on a canvas, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const factory = gearboxById('manual-rwd')!.layout.desc as LayshaftDesc;
const finalDrive = driveCarById('bmw-m3-e30')!.finalDrive.ratio;
const start = factorySetup(factory, finalDrive);

/** Every pair of the box spans the centre distance with its own teeth, module and helix. */
function expectCentre(desc: LayshaftDesc): void {
  for (const pair of [desc.main, ...desc.speeds.filter((s): s is PairDesc => s !== 'direct')]) {
    const helix = pairHelix(desc, pair, pair.teeth);
    expect(centreDistance(pair.module, pair.teeth[0], pair.teeth[1], helix, desc.pressureAngle)).toBeCloseTo(desc.centreMm, 9);
  }
  const spec = layshaftSpec(desc);
  for (const gear of spec.gears.filter((g) => g.id.startsWith('counter-') && g.id !== 'counter-R')) {
    const mate = spec.gears.find((g) => g.id === (gear.id === 'counter-main' ? 'input-main' : `main-${gear.id.slice(8)}`))!;
    expect(centreDistance(gear.module, gear.teeth, mate.teeth, Math.abs(gear.helix), desc.pressureAngle), gear.id).toBeCloseTo(desc.centreMm, 9);
  }
}

describe('the gearbox settings', () => {
  it('start from the factory box, whose first gear is (45/23)·(38/20) = 3.717', () => {
    expect(setupDesc(factory, start)).toEqual(factory);
    expect(speedRatios(factory)[0]).toBeCloseTo(3.717, 3);
    expect(isFactory(factory, finalDrive, start)).toBe(true);
  });

  it('re-tooth second gear for a new ratio at the same centre distance', () => {
    for (const ratio of [2.0, 2.2, 2.6, 3.0]) {
      const teeth = teethForRatio(factory, 1, ratio)!;
      expect(teeth).not.toBeNull();
      const desc = setupDesc(factory, setTeeth(factory, start, 1, teeth));
      expectCentre(desc);
      expect(Math.abs(speedRatios(desc)[1]! - ratio)).toBeLessThan(0.05);
      // Only second gear changed.
      expect(desc.speeds.filter((_, i) => i !== 1)).toEqual(factory.speeds.filter((_, i) => i !== 1));
    }
  });

  it('step a tooth on either gear and keep the centre distance', () => {
    for (const index of [0, 1, 2, 3]) {
      for (const which of [0, 1] as const) {
        for (const delta of [1, -1] as const) {
          const teeth = stepTeeth(factory, index, which, delta);
          expect(teeth, `speed ${index + 1}, gear ${which}, ${delta}`).not.toBeNull();
          const before = speedRatios(factory)[index]!;
          const desc = setupDesc(factory, setTeeth(factory, start, index, teeth!));
          expectCentre(desc);
          // More teeth on the speed's gear lowers the gear (a higher ratio); more on the countershaft gear raises it.
          const after = speedRatios(desc)[index]!;
          expect(Math.sign(after - before)).toBe(which === 1 ? delta : -delta);
        }
      }
    }
  });

  it('keep every slider position buildable and drawable', () => {
    for (const index of [0, 1, 2, 3]) {
      for (let ratio = RATIO_RANGE[0]; ratio <= RATIO_RANGE[1]; ratio += 0.2) {
        const teeth = teethForRatio(factory, index, ratio)!;
        const pair = factory.speeds[index] as PairDesc;
        expect(pairFits(factory, pair, teeth)).toBe(true);
        expect(() => layshaftSpec(setupDesc(factory, setTeeth(factory, start, index, teeth)))).not.toThrow();
      }
    }
    // The ends of the range, drawn.
    for (const ratio of RATIO_RANGE) {
      const desc = setupDesc(factory, setTeeth(factory, start, 1, teethForRatio(factory, 1, ratio)!));
      expect(() => new GearboxModel(buildGearbox(layshaftSpec(desc)), { quality: 'low' }).dispose()).not.toThrow();
    }
  });

  it('build 4 and 6 speeds and keep the teeth of a speed taken off for when it comes back', () => {
    const edited = setTeeth(factory, start, 3, teethForRatio(factory, 3, 1.35)!);
    const four = setupDesc(factory, setSpeeds(edited, 4));
    expect(four.speeds).toHaveLength(4);
    expect(speedRatios(four)[3]).toBeCloseTo(speedRatios(setupDesc(factory, edited))[3]!, 9);
    const six = setSpeeds(start, 6);
    const sixth = teethForRatio(setupDesc(factory, six), 5, 0.84)!;
    const withSixth = setTeeth(factory, six, 5, sixth);
    expect(speedRatios(setupDesc(factory, withSixth))[5]).toBeCloseTo(0.84, 1);
    // Down to five and back to six: the sixth set on the panel is still there.
    expect(setupDesc(factory, setSpeeds(setSpeeds(withSixth, 5), 6))).toEqual(setupDesc(factory, withSixth));
    for (const speeds of [4, 5, 6]) {
      const desc = setupDesc(factory, setSpeeds(start, speeds));
      expectCentre(desc);
      expect(() => new GearboxModel(buildGearbox(layshaftSpec(desc)), { quality: 'low' }).dispose()).not.toThrow();
    }
  });

  it('give «Заводські» back as the factory box', () => {
    let setup = setTeeth(factory, start, 1, teethForRatio(factory, 1, 2.8)!);
    setup = setSpeeds(setFinalDrive(setup, 4.1), 6);
    expect(isFactory(factory, finalDrive, setup)).toBe(false);
    // Setting a pair back to its factory teeth drops the change.
    expect(setTeeth(factory, start, 1, (factory.speeds[1] as PairDesc).teeth).teeth).toEqual({});
    const reset = factorySetup(factory, finalDrive);
    expect(setupDesc(factory, reset)).toEqual(factory);
    expect(buildGearbox(layshaftSpec(setupDesc(factory, reset))).states.map((s) => s.ratio)).toEqual(buildGearbox(layshaftSpec(factory)).states.map((s) => s.ratio));
  });

  it('hold the final drive to 2.0–5.5', () => {
    expect(setFinalDrive(start, 1).finalDrive).toBe(2);
    expect(setFinalDrive(start, 9).finalDrive).toBe(5.5);
  });

  it('leave the box alone when a move changes no teeth: the page then rebuilds nothing', () => {
    // The final drive is behind the box.
    expect(sameBox(setFinalDrive(start, 4.1), start)).toBe(true);
    // A slider moved within the ratio of one tooth pair, a count already set, the factory teeth asked again.
    const second = teethForRatio(factory, 1, 2.6)!;
    const set = setTeeth(factory, start, 1, second);
    expect(setTeeth(factory, set, 1, [second[0], second[1]])).toBe(set);
    expect(setSpeeds(set, 5)).toBe(set);
    expect(setTeeth(factory, start, 1, (factory.speeds[1] as PairDesc).teeth)).toBe(start);
    expect(sameBox(setTeeth(factory, set, 1, (factory.speeds[1] as PairDesc).teeth), set)).toBe(false);
  });
});

describe('the figures of the table', () => {
  it('give the road speed from the ratios and the rolling radius', () => {
    // Fifth is direct: 1000 rpm over 3.25 at a 0.2953 m radius.
    expect(roadSpeedKmh(1000, 1, 3.25, 0.2953)).toBeCloseTo((1000 / 3.25) * 2 * Math.PI * 0.2953 * 0.06, 9);
    expect(roadSpeedKmh(1000, 1, 3.25, 0.2953)).toBeCloseTo(34.26, 1);
  });

  it('drop the revs by the step between gears', () => {
    const drops = shiftDrops(speedRatios(factory), 7250);
    expect(drops).toHaveLength(4);
    expect(drops[0]!.after).toBeCloseTo((7250 * 2.4037) / 3.7174, 0);
    expect(drops[3]!.after).toBeCloseTo(7250 / 1.2636, 0);
  });
});
