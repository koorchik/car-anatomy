// What the page manual-rwd shows of its gearbox, pinned: the gears the 3D draws, the states the buttons select, the
// power path, and the figures of the settings panel (road speed in each gear, the revs after each shift). If this
// fails, visitors get another gearbox. Update the snapshot only for an intended change (vitest -u), and list it in the
// commit. Each gearbox page has its own snapshot file, so pages built in parallel do not touch one file.

import { describe, expect, it } from 'vitest';
import { carById } from '../src/data/cars.ts';
import { driveCarById } from '../src/data/drive-cars.ts';
import { engineById } from '../src/data/engines.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { layshaftSpec, type LayshaftDesc, type PairDesc } from '../src/drivetrain/layouts/layshaft.ts';
import { factorySetup, setFinalDrive, setSpeeds, setTeeth, setupDesc, speedRatios, teethForRatio, type LayshaftSetup } from '../src/drivetrain/layouts/layshaft-setup.ts';
import { roadSpeedKmh, shiftDrops } from '../src/drivetrain/table-figures.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';
import { parseTyreSize, rollingRadiusM } from '../src/vehicle/tyre-size.ts';

const record = gearboxById('manual-rwd')!;
const factory = record.layout.desc as LayshaftDesc;
const car = carById(record.car!)!;
const finalDrive = driveCarById(car.id)!.finalDrive.ratio;
const redline = engineById(car.engine)!.redlineRpm;
const radius = rollingRadiusM(parseTyreSize(car.tyre.size));
const round = (v: number, digits = 4): number => Math.round(v * 10 ** digits) / 10 ** digits;

/** Everything the page reads of a box as set on the panel. */
function shown(setup: LayshaftSetup) {
  const desc = setupDesc(factory, setup);
  const box = buildGearbox(layshaftSpec(desc));
  const ratios = speedRatios(desc);
  return {
    gears: box.spec.gears.map((g) => ({ id: g.id, member: g.member, teeth: g.teeth, module: g.module, helix: round(g.helix, 3), z: round(g.z, 2), faceWidth: g.faceWidth })),
    sleeves: box.spec.sleeves,
    states: box.states.map((s) => ({ name: s.name, ratio: s.ratio === null ? null : round(s.ratio), closed: s.closed, meshPower: s.meshLoads?.map((m) => round(m.power, 3)) ?? null })),
    table: ratios.map((r) => ({ ratio: round(r), per1000: round(roadSpeedKmh(1000, r, setup.finalDrive, radius), 2), atRedline: round(roadSpeedKmh(redline, r, setup.finalDrive, radius), 1) })),
    drops: shiftDrops(ratios, redline).map((d) => round(d.after, 1)),
    finalDrive: setup.finalDrive,
  };
}

describe('the gearbox page manual-rwd', () => {
  it('shows the BMW M3 E30 Getrag 265/5 as pinned', () => {
    const factoryShown = shown(factorySetup(factory, finalDrive));
    expect(factoryShown.table[0]!.ratio).toBe(3.7174);
    expect({ car: car.id, tyre: car.tyre.size, redline, radius: round(radius, 4), ...factoryShown }).toMatchSnapshot();
  });

  it('gives the pinned box back on «Заводські» after any change', () => {
    let setup = factorySetup(factory, finalDrive);
    setup = setTeeth(factory, setup, 1, teethForRatio(setupDesc(factory, setup), 1, 2.75)!);
    setup = setFinalDrive(setSpeeds(setup, 6), 4.4);
    const pinned = shown(factorySetup(factory, finalDrive));
    expect(shown(setup)).not.toEqual(pinned);
    // The button: the factory setup, whose box is the record's own.
    expect(setupDesc(factory, factorySetup(factory, finalDrive))).toEqual(factory);
    // Each change undone by hand leaves nothing behind either.
    let back = setTeeth(factory, setup, 1, (factory.speeds[1] as PairDesc).teeth);
    back = setFinalDrive(setSpeeds(back, 5), finalDrive);
    expect(back).toEqual(factorySetup(factory, finalDrive));
    expect(shown(back)).toEqual(pinned);
  });
});
