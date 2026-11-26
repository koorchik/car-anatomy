// The gearbox designer's links in and out (gearbox plan, stage 10): the panel "Set up" of a catalogue page carries its
// box to the designer, and a design's link gives the same design back.
import { describe, expect, it } from 'vitest';
import { GEARBOX_PAGES } from '../src/data/gearboxes.ts';
import type { LayshaftDesc } from '../src/drivetrain/layouts/layshaft.ts';
import type { TransaxleDesc } from '../src/drivetrain/layouts/transaxle.ts';
import { decodeGearboxDesign, encodeGearboxDesign } from '../src/gearbox-designer/codec.ts';
import { editGearboxDesign } from '../src/gearbox-designer/edit.ts';
import { evaluateGearbox } from '../src/gearbox-designer/evaluate.ts';
import { designFromTable, designTableRecord } from '../src/gearbox-designer/from-table.ts';
import { designFromRecord } from '../src/gearbox-designer/presets.ts';

const e30 = GEARBOX_PAGES.find((p) => p.id === 'manual-rwd')!.base;
const civic = GEARBOX_PAGES.find((p) => p.id === 'manual-transaxle')!.base;
const e30Desc = e30.layout.desc as LayshaftDesc;
const civicDesc = civic.layout.desc as TransaxleDesc;

describe('the panel "Set up" carries its box to the designer', () => {
  it('as the catalogue copy, published figures and all, when nothing was changed', () => {
    const d = designFromTable('manual-rwd', e30Desc, designFromRecord(e30).finalDrive)!;
    expect(d).toEqual(designFromRecord(e30));
    expect(d.factory).toEqual({ gearbox: 'manual-rwd' });
  });

  it('as a design of its own with the panel\'s teeth and final drive when they were changed', () => {
    const first = e30Desc.speeds[0] as Exclude<LayshaftDesc['speeds'][number], 'direct'>;
    const desc: LayshaftDesc = { ...e30Desc, speeds: [{ ...first, teeth: [first.teeth[0], first.teeth[1] + 1] }, ...e30Desc.speeds.slice(1)] };
    const d = designFromTable('manual-rwd', desc, 3.46)!;
    expect(d.factory).toBeNull();
    expect(d.finalDrive).toBe(3.46);
    const perf = evaluateGearbox(d);
    const main = e30Desc.main.teeth[1] / e30Desc.main.teeth[0];
    expect(perf.gears[0]!.ratio).toBeCloseTo((main * (first.teeth[1] + 1)) / first.teeth[0], 6);
    expect(perf.gears[0]!.pair!.teeth).toEqual([first.teeth[0], first.teeth[1] + 1]);
  });

  it('carries a transaxle\'s final drive with its teeth', () => {
    const final = civicDesc.final;
    const desc: TransaxleDesc = { ...civicDesc, final: { ...final, teeth: [final.teeth[0] + 1, final.teeth[1]] } as TransaxleDesc['final'] };
    const d = designFromTable('manual-transaxle', desc, 0)!;
    expect(d.factory).toBeNull();
    expect(d.finalDrive).toBeCloseTo(final.teeth[1] / (final.teeth[0] + 1), 9);
    expect(evaluateGearbox(d).finalDrive).toBeCloseTo(final.teeth[1] / (final.teeth[0] + 1), 6);
  });

  it('hands the design back to the table as a record of its layout', () => {
    const d = designFromRecord(civic);
    const record = designTableRecord(d);
    expect(record.layout.kind).toBe('transaxle');
    expect(record.car).toBe(civic.car);
  });
});

describe('a design\'s link', () => {
  it('gives the same design back, for a copy, an edited copy and an odd box', () => {
    const copy = designFromRecord(e30);
    const edited = editGearboxDesign(copy, { firstRatio: 4.2 });
    const transaxle = editGearboxDesign(designFromRecord(civic), { faceWidth: 20, cones: [3, 2, 1, 1, 1, 1] });
    for (const d of [copy, edited, transaxle]) expect(decodeGearboxDesign(encodeGearboxDesign(d))).toEqual(d);
  });
});

describe('an engine from the engine designer in the car', () => {
  it('drives the design with its own torque map, survives the link, and a broken one falls back to the catalogue', async () => {
    const { designFromSpec, editDesign } = await import('../src/designer/presets.ts');
    const { engineById } = await import('../src/data/engines.ts');
    const { designEngineId, engineSource } = await import('../src/gearbox-designer/engine-source.ts');
    const { resolveGearboxDesign } = await import('../src/gearbox-designer/constraints.ts');
    const s14 = designFromSpec(engineById('i4/bmw-m3-e30-s14')!);
    const bigger = editDesign(s14, { bore: s14.bore + 6 });
    const id = designEngineId(bigger);
    const source = engineSource(id)!;
    expect(source.own).toBe(true);
    const base = designFromRecord(e30);
    const own = editGearboxDesign(base, { engine: id });
    expect(own.engine).toBe(id);
    expect(decodeGearboxDesign(encodeGearboxDesign(own))).toEqual(own);
    // A bigger bore: more torque at the input, more bending on the teeth.
    expect(evaluateGearbox(own).peakTorqueNm).toBeGreaterThan(evaluateGearbox(base).peakTorqueNm);
    expect(resolveGearboxDesign({ ...own, engine: 'design:not-a-design' }).engine).toBe(resolveGearboxDesign({ ...own, engine: 'nothing' }).engine);
  });
});
