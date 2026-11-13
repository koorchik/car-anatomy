// A gearbox on the table (src/drivetrain/table-drive.ts) and boxes with more or fewer speeds (layshaft-speeds.ts).

import { describe, expect, it } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { pairGeometry } from '../src/drivetrain/gear-geometry.ts';
import { layshaftSpec, type LayshaftDesc } from '../src/drivetrain/layouts/layshaft.ts';
import { withSpeedCount } from '../src/drivetrain/layouts/layshaft-speeds.ts';
import { memberAngles, poseAt, SLEEVE_TRAVEL_S, TableDrive } from '../src/drivetrain/table-drive.ts';
import { buildGearbox, stateByName } from '../src/drivetrain/topology.ts';

const e30Record = gearboxById('manual-rwd')!;
const e30Desc = e30Record.layout.desc as LayshaftDesc;
const e30 = buildGearbox(gearboxSpec(e30Record));

describe('sleeve places', () => {
  it('every element a sleeve engages sits on one side of one sleeve, between its gear and the hub', () => {
    const spec = e30.spec;
    const sides = spec.sleeves!.flatMap((s) => [s.front, s.back]).filter((id): id is string => id !== null);
    expect(sides.sort()).toEqual(spec.elements.map((e) => e.id).sort());
    for (const s of spec.sleeves!) {
      for (const [side, id] of [[-1, s.front], [1, s.back]] as const) {
        if (!id) continue;
        const member = spec.elements.find((e) => e.id === id)!.a;
        const gear = spec.gears.find((g) => g.member === member)!;
        // The gear face is a gap away from the hub on that side.
        const face = gear.z - side * (gear.faceWidth / 2);
        expect(face, `${s.id} ${id}`).toBeCloseTo(s.z + side * (s.width / 2 + s.gap), 9);
      }
    }
  });
});

describe('on the table', () => {
  const ratio = (name: string) => stateByName(e30, name).ratio!;

  it('the output follows the input through the ratio of the gear that is home', () => {
    const drive = new TableDrive(e30, '1');
    const before = drive.frame().angles[e30.members.indexOf('output')]!;
    const inBefore = drive.frame().angles[e30.members.indexOf('input')]!;
    for (let i = 0; i < 60; i++) drive.step(1 / 60, 600);
    const out = drive.frame().angles[e30.members.indexOf('output')]! - before;
    const inp = drive.frame().angles[e30.members.indexOf('input')]! - inBefore;
    expect(inp).toBeCloseTo((600 / 60) * 2 * Math.PI, 9);
    expect(out).toBeCloseTo(inp / ratio('1'), 9);
  });

  it('shifting 2 → 3 takes the sleeve through neutral in two travels, and only then the third glows', () => {
    const drive = new TableDrive(e30, '2');
    drive.select('3');
    const third = e30.meshes.findIndex((m) => m.a === 'counter-3');
    const second = e30.meshes.findIndex((m) => m.a === 'counter-2');
    let t = 0;
    while (drive.engaged !== '3' && t < 1) {
      drive.step(1 / 240, 900);
      t += 1 / 240;
      // Never both: the sleeve that holds second must let go before third can come in.
      expect(drive.frame().meshPower[second]! > 0 && drive.frame().meshPower[third]! > 0).toBe(false);
    }
    expect(t).toBeCloseTo(2 * SLEEVE_TRAVEL_S, 1);
    expect(drive.frame().meshPower[third]).toBeCloseTo(1, 9);
  });

  it('in neutral the free output coasts down and the box turns on', () => {
    const drive = new TableDrive(e30, '4');
    drive.select('N');
    for (let i = 0; i < 600; i++) drive.step(1 / 60, 900);
    const out = e30.members.indexOf('output');
    const a0 = drive.frame().angles[out]!;
    drive.step(1 / 60, 900);
    expect(Math.abs(drive.frame().angles[out]! - a0)).toBeLessThan(1e-3);
    expect(drive.frame().meshPower.every((p) => p === 0)).toBe(true);
    expect(Object.values(drive.frame().sleeves).every((p) => p === 0)).toBe(true);
  });

  it('reverse turns the output backward', () => {
    const drive = new TableDrive(e30, 'R');
    const out = e30.members.indexOf('output');
    const a0 = drive.frame().angles[out]!;
    drive.step(0.1, 600);
    expect(drive.frame().angles[out]! - a0).toBeLessThan(0);
  });
});

describe('poses', () => {
  it('member angles come from the input and output angles alone', () => {
    const angles = memberAngles(e30, 2, 0.5);
    expect(angles[e30.members.indexOf('input')]).toBeCloseTo(2, 12);
    expect(angles[e30.members.indexOf('output')]).toBeCloseTo(0.5, 12);
    expect(angles[e30.members.indexOf('counter')]).toBeCloseTo((-2 * 23) / 45, 12);
  });

  it('a pose in a gear has its sleeve home and that gear\'s power path', () => {
    const pose = poseAt(e30, '3', 1);
    expect(pose.sleeves['2-3']).toBe(-1);
    expect(pose.sleeves['4-5']).toBe(0);
    expect(pose.meshPower.filter((p) => p > 0.99)).toHaveLength(2);
  });
});

describe('speed count', () => {
  const ratios = (desc: LayshaftDesc) => buildGearbox(layshaftSpec(desc)).states.filter((s) => s.kind === 'gear' && s.ratio! > 0).map((s) => s.ratio!);

  it('five stays as it is', () => {
    expect(withSpeedCount(e30Desc, 5)).toEqual(e30Desc);
  });

  it('four takes the direct fifth off and keeps the rest', () => {
    const four = withSpeedCount(e30Desc, 4);
    ratios(e30Desc).slice(0, 4).forEach((r, i) => expect(ratios(four)[i]).toBeCloseTo(r, 12));
    expect(ratios(four)).toHaveLength(4);
    expect(four.sleeves.find((s) => s.id === '4-5')).toEqual({ id: '4-5', front: null, back: 4 });
  });

  it('six adds an overdrive pair at the back, continuing the top step', () => {
    const six = withSpeedCount(e30Desc, 6);
    const r = ratios(six);
    ratios(e30Desc).forEach((ratio, i) => expect(r[i]).toBeCloseTo(ratio, 12));
    // Teeth come in whole numbers: within a few per cent of 1.000²/1.264.
    expect(r[5]! / (1 / 1.26359)).toBeGreaterThan(0.97);
    expect(r[5]! / (1 / 1.26359)).toBeLessThan(1.03);
    expect(six.sleeves[six.sleeves.length - 1]).toEqual({ id: '6', front: 6, back: null });
    const pair = six.speeds[5] as { teeth: [number, number]; module: number; faceWidth: number };
    const shape = { module: pair.module, pressureAngle: 20, shift: 0, faceWidth: pair.faceWidth };
    const spec = layshaftSpec(six);
    const helix = Math.abs(spec.gears.find((g) => g.id === 'counter-6')!.helix);
    expect(helix).toBeGreaterThanOrEqual(15);
    expect(helix).toBeLessThanOrEqual(35);
    expect(pairGeometry({ ...shape, teeth: pair.teeth[0], helix }, { ...shape, teeth: pair.teeth[1], helix: -helix }).centre).toBeCloseTo(76, 6);
  });

  it('refuses a count out of range', () => {
    expect(() => withSpeedCount(e30Desc, 1)).toThrow(/speeds/);
    expect(() => withSpeedCount(e30Desc, 9)).toThrow(/speeds/);
  });
});
