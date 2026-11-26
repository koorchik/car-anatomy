// What the page manual-transaxle shows of its two gearboxes, pinned: the gears the 3D draws, the states the buttons
// select, the power path, and the figures of the settings panel (road speed in each gear, the revs after each shift).
// If this fails, visitors get another gearbox. Update the snapshot only for an intended change (vitest -u), and list
// it in the commit. Each gearbox page has its own snapshot file, so pages built in parallel do not touch one file.

import { describe, expect, it } from 'vitest';
import { carById } from '../src/data/cars.ts';
import { engineById } from '../src/data/engines.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { transaxleSetupModel } from '../src/drivetrain/layouts/setup-model.ts';
import type { TransaxleSetup } from '../src/drivetrain/layouts/transaxle-setup.ts';
import { transaxleSpec, type TransaxleDesc } from '../src/drivetrain/layouts/transaxle.ts';
import { roadSpeedKmh, shiftDrops } from '../src/drivetrain/table-figures.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';
import { drivenTyreRadiusM } from '../src/vehicle/car.ts';

const round = (v: number, digits = 4): number => Math.round(v * 10 ** digits) / 10 ** digits;

const RECORDS = [
  { id: 'manual-transaxle', first: 3.625 },
  { id: 'manual-transaxle/porsche-911-carrera-t-992', first: 3.9091 },
] as const;

function page(id: string) {
  const record = gearboxById(id)!;
  const factory = record.layout.desc as TransaxleDesc;
  const car = carById(record.car!)!;
  const model = transaxleSetupModel(factory);
  const redline = engineById(car.engine)!.redlineRpm;
  const radius = drivenTyreRadiusM(car);
  /** Everything the page reads of a box as set on the panel. */
  const shown = (setup: TransaxleSetup) => {
    const desc = model.desc(setup);
    const box = buildGearbox(transaxleSpec(desc));
    const ratios = model.ratios(desc);
    const finalDrive = model.finalDrive(setup, desc);
    return {
      gears: box.spec.gears.map((g) => ({ id: g.id, member: g.member, teeth: g.teeth, module: g.module, helix: round(g.helix, 3), z: round(g.z, 2), faceWidth: g.faceWidth })),
      sleeves: box.spec.sleeves,
      states: box.states.map((s) => ({ name: s.name, ratio: s.ratio === null ? null : round(s.ratio), closed: s.closed, meshPower: s.meshLoads?.map((m) => round(m.power, 3)) ?? null })),
      table: ratios.map((r) => ({ ratio: round(r), per1000: round(roadSpeedKmh(1000, r, finalDrive, radius), 2), atRedline: round(roadSpeedKmh(redline, r, finalDrive, radius), 1) })),
      drops: shiftDrops(ratios, redline).map((d) => round(d.after, 1)),
      finalDrive: round(finalDrive),
    };
  };
  return { record, factory, car, model, redline, radius, shown };
}

describe('the gearbox page manual-transaxle', () => {
  it.each(RECORDS)('shows $id as pinned', ({ id, first }) => {
    const p = page(id);
    const factoryShown = p.shown(p.model.factory);
    expect(factoryShown.table[0]!.ratio).toBe(first);
    expect({ car: p.car.id, redline: p.redline, radius: round(p.radius, 4), ...factoryShown }).toMatchSnapshot();
  });

  it.each(RECORDS)('$id: each gear lights its own pair and the final drive, nothing else', ({ id }) => {
    const { factory } = page(id);
    const box = buildGearbox(transaxleSpec(factory));
    const lit = (name: string) =>
      box.states
        .find((s) => s.name === name)!
        .meshLoads!.flatMap((m, j) => (m.power > 1e-9 ? [[box.meshes[j]!.a, box.meshes[j]!.b].join('|')] : []))
        .sort();
    for (let n = 1; n <= factory.speeds.length; n++) expect(lit(String(n)), String(n)).toEqual([`final-pinion|final-ring`, `in-${n}|out-${n}`].sort());
  });

  it.each(RECORDS)('$id: «Заводські» gives the pinned box back after any change', ({ id }) => {
    const { model, shown } = page(id);
    let setup = model.factory;
    setup = model.setTeeth(setup, 1, model.teethForRatio(model.desc(setup), 1, 2.6)!);
    setup = model.setFinalDrive(model.setSpeeds(setup, 5), 4.6);
    const pinned = shown(model.factory);
    expect(shown(setup)).not.toEqual(pinned);
    expect(model.isFactory(setup)).toBe(false);
    // The button: the factory setup, whose box is the record's own.
    expect(model.desc(model.factory)).toBe(page(id).factory);
    expect(shown(model.factory)).toEqual(pinned);
  });
});
