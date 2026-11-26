// The gearbox designer's model (gearbox plan, tests/gearbox-designer): stage K9a's tests 1, 2 and 7 with the catalogue
// copies and the link; stage K9b's 3 (the bending calibration), 4 (no factory box is fatal), 6 (directions) and "no
// control is dead" for both types, with the factory record's hand-over and the computed causes.
import { describe, expect, it } from 'vitest';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { ALL_GEARBOXES, gearboxById } from '../src/data/gearboxes.ts';
import { buildCarDrive } from '../src/data/car-drive.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { centreDistance, gearGeometry, helixForCentre, shiftSumForCentre, undercut } from '../src/drivetrain/gear-geometry.ts';
import { gcd } from '../src/drivetrain/gear-pick.ts';
import { quasiStaticRun } from '../src/drivetrain/runs.ts';
import { decodeGearboxDesign, encodeGearboxDesign } from '../src/gearbox-designer/codec.ts';
import { paramRange, resolveGearboxDesign, type NumericKey } from '../src/gearbox-designer/constraints.ts';
import {
  CLUTCH_KINDS, DAMPER_CHOICES, DEFAULT_GEARBOX_DESIGN, DIFF_CHOICES, MAX_GEARS, MIN_GEARS, MIN_STEP, SYNCHRO_MATERIALS, type GearboxDesign,
} from '../src/gearbox-designer/design.ts';
import { evaluateGearbox, type GearFigures } from '../src/gearbox-designer/evaluate.ts';
import { engineById } from '../src/data/engines.ts';
import { catalogueTorqueMap } from '../src/designer/torque-map.ts';
import { mapValue } from '../src/engine/torque-map.ts';
import { catalogueGearboxPresets, designFromRecord, oddGearboxPresets, withGearboxType } from '../src/gearbox-designer/presets.ts';
import { designBuild } from '../src/gearbox-designer/to-spec.ts';
import { TR6060_MZ6 } from '../src/data/gearboxes/tr6060-mz6.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';
import { CONE_TEST_LIMITS } from '../src/drivetrain/synchro-math.ts';
import { gearboxControls } from '../src/gearbox-designer/controls.ts';
import { diagnoseGearbox } from '../src/gearbox-designer/diagnostics.ts';
import { editGearboxDesign } from '../src/gearbox-designer/edit.ts';
import { gearboxMass, TR6060_MASS_KG, tr6060Design } from '../src/gearbox-designer/mass.ts';
import { assessGearbox } from '../src/gearbox-designer/reliability.ts';
import { controlTries, gearboxCausesOf, gearboxSnapshot, previewGearboxEffects } from '../src/gearbox-designer/sensitivity.ts';
import {
  BENDING_LIMIT_MPA, CALIBRATION_CONTACT_LOAD, CALIBRATION_TORQUE_NM, gearboxStrength, startsAt, stateStrength,
} from '../src/gearbox-designer/strength.ts';
import { designDifferential } from '../src/gearbox-designer/vehicle.ts';

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
type Random = () => number;
const pick = <T>(r: Random, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
const between = (r: Random, lo: number, hi: number): number => lo + r() * (hi - lo);

/** Anything a link might carry: mostly sensible numbers, now and then rubbish, hand-set teeth that may not fit. */
function randomDesign(r: Random): GearboxDesign {
  const gears = Math.floor(between(r, 2, 12));
  const junk = (good: unknown): unknown => (r() < 0.05 ? pick(r, [NaN, Infinity, -1e9, 'x', null, {}, [], undefined]) : good);
  const pair = () =>
    r() < 0.25
      ? { teeth: [Math.floor(between(r, 8, 60)), Math.floor(between(r, 8, 80))], module: between(r, 1, 4), faceWidth: between(r, 5, 40), shift: [between(r, -0.5, 0.6), between(r, -0.5, 0.6)] }
      : null;
  const raw: Record<string, unknown> = {
    name: junk('random'),
    type: junk(pick(r, ['layshaft', 'transaxle', 'planetary'])),
    gears: junk(gears),
    firstRatio: junk(between(r, 1, 8)),
    topRatio: junk(between(r, 0.3, 1.5)),
    progression: junk(between(r, -0.2, 1.2)),
    directGear: junk(Math.floor(between(r, 0, gears + 2))),
    ratios: Array.from({ length: gears }, () => (r() < 0.2 ? junk(between(r, 0.3, 6)) : null)),
    pairs: Array.from({ length: gears }, pair),
    mainPair: junk(pair()),
    reverseRatio: junk(between(r, 2, 6)),
    reverse: r() < 0.2 ? { teeth: Array.from({ length: pick(r, [2, 3, 4]) }, () => Math.floor(between(r, 10, 60))), module: between(r, 1.5, 3), helix: 0, faceWidth: 18 } : null,
    finalDrive: junk(between(r, 1.5, 6)),
    finalPair: r() < 0.2 ? { teeth: [Math.floor(between(r, 8, 20)), Math.floor(between(r, 25, 80))], module: between(r, 2, 7), faceWidth: between(r, 15, 35), helix: between(r, 0, 30), shift: 0.3 } : null,
    module: junk(between(r, 1, 5)),
    lowModule: junk(between(r, 1, 5)),
    mainModule: junk(between(r, 1, 9)),
    pressureAngle: junk(between(r, 15, 27)),
    helix: junk(r() < 0.25 ? 0 : between(r, 0, 40)),
    faceWidth: junk(between(r, 5, 60)),
    centreMm: junk(between(r, 40, 130)),
    cones: Array.from({ length: gears }, () => junk(pick(r, [1, 2, 3, 4]))),
    synchroMaterial: junk(pick(r, SYNCHRO_MATERIALS)),
    coneAngle: junk(between(r, 3, 20)),
    roofAngle: junk(between(r, 80, 150)),
    shiftForceN: junk(between(r, 100, 2000)),
    clutch: junk(pick(r, CLUTCH_KINDS)),
    clutchMm: junk(between(r, 100, 400)),
    clampN: junk(between(r, 500, 25000)),
    facing: junk(pick(r, ['organic', 'ceramic'])),
    damper: junk(pick(r, DAMPER_CHOICES)),
    diff: junk(pick(r, DIFF_CHOICES)),
    lockDrive: junk(between(r, -0.1, 1)),
    lockCoast: junk(between(r, -0.1, 1)),
    preloadNm: junk(between(r, -10, 400)),
    tbr: junk(between(r, 0.5, 7)),
    car: junk(pick(r, Object.keys(DRIVE_CARS))),
    engine: junk(pick(r, ['i4/bmw-m3-e30-s14', 'i4/civic-type-r-k20c1', 'b6/porsche-992-carrera-3-0', 'nope'])),
    massKg: junk(between(r, 300, 3500)),
    drive: junk(pick(r, ['fwd', 'rwd', 'awd'])),
    frontShare: junk(between(r, 0.2, 0.8)),
    tyreSize: junk(pick(r, ['225/45 R16', '245/30 R20', 'P225/75R15', 'size'])),
    tyre: junk(pick(r, ['classic', 'street', 'semi', 'slick', 'ice'])),
    cdA: junk(between(r, 0.1, 2)),
    crr: junk(between(r, 0, 0.05)),
    factory: r() < 0.2 ? { gearbox: pick(r, ['manual-rwd', 'tr6060-mz6', 'nope']) } : null,
  };
  return raw as unknown as GearboxDesign;
}

const NUMERIC: NumericKey[] = [
  'gears', 'firstRatio', 'topRatio', 'progression', 'reverseRatio', 'finalDrive', 'module', 'lowModule', 'mainModule', 'pressureAngle', 'helix',
  'faceWidth', 'centreMm', 'coneAngle', 'roofAngle', 'shiftForceN', 'clutchMm', 'clampN', 'lockDrive', 'lockCoast', 'preloadNm', 'tbr', 'massKg',
  'frontShare', 'cdA', 'crr',
];

describe('1. resolveGearboxDesign', () => {
  const random = seeded(2026);
  const designs = Array.from({ length: 120 }, () => resolveGearboxDesign(randomDesign(random)));

  it('is idempotent on random designs', () => {
    for (const d of designs) expect(resolveGearboxDesign(d)).toEqual(d);
  });

  it('turns anything a link carries into a design inside every limit, that builds', () => {
    for (const d of designs) {
      for (const key of NUMERIC) {
        const range = paramRange(d, key);
        expect(d[key], key).toBeGreaterThanOrEqual(range.min - 1e-9);
        expect(d[key], key).toBeLessThanOrEqual(range.max + 1e-9);
      }
      expect(d.gears).toBeGreaterThanOrEqual(MIN_GEARS);
      expect(d.gears).toBeLessThanOrEqual(MAX_GEARS);
      for (const list of [d.ratios, d.pairs, d.cones]) expect(list).toHaveLength(d.gears);
      if (d.type === 'transaxle') expect(d.directGear).toBe(0);
      const { box } = designBuild(d);
      const forward = box.states.filter((s) => s.kind === 'gear' && s.ratio! > 0);
      expect(forward).toHaveLength(d.gears);
      expect(box.states.find((s) => s.name === 'R')!.ratio).toBeLessThan(0);
    }
  });

  it('keeps hostile values out', () => {
    const hostile = {
      ...DEFAULT_GEARBOX_DESIGN, type: 'cvt', gears: 1e9, firstRatio: NaN, topRatio: -Infinity, module: 'big', centreMm: 1e6, cones: [9, 'x'],
      pairs: [{ teeth: [1, 2], module: 0, faceWidth: -1, shift: [9, 9] }], car: 'constructor', engine: '__proto__', tyreSize: 'R', factory: { gearbox: 'nope' },
    } as unknown as GearboxDesign;
    const d = resolveGearboxDesign(hostile);
    expect(d.type).toBe('layshaft');
    expect(d.car).toBe(DEFAULT_GEARBOX_DESIGN.car);
    expect(d.engine).toBe(DEFAULT_GEARBOX_DESIGN.engine);
    expect(d.factory).toBeNull();
    expect(() => evaluateGearbox(d)).not.toThrow();
  });

  it('keeps the forward ratios in order, each at least MIN_STEP below the one before, a direct gear at 1', () => {
    for (const d of designs) {
      const { box } = designBuild(d);
      const own = (name: string) => evaluateRatio(d, name, box);
      const t = designBuild(d).teeth.targets;
      for (let i = 1; i < t.length; i++) expect(t[i - 1]! / t[i]!).toBeGreaterThanOrEqual(MIN_STEP - 1e-9);
      if (d.directGear) expect(own(String(d.directGear))).toBeCloseTo(1, 12);
    }
  });

  it('a link holds the design, and a broken or old link gives a valid one', () => {
    for (const d of designs.slice(0, 30)) expect(decodeGearboxDesign(encodeGearboxDesign(d))).toEqual(d);
    expect(decodeGearboxDesign('not base64 !!')).toBeNull();
    expect(decodeGearboxDesign(btoa('[1,2,3]'))).toBeNull();
    const old = decodeGearboxDesign(btoa(JSON.stringify({ gears: 6, type: 'transaxle', unknownField: 3, cones: 'many' })))!;
    expect(old.gears).toBe(6);
    expect(old.cones).toHaveLength(6);
    expect(resolveGearboxDesign(old)).toEqual(old);
    expect(encodeGearboxDesign(DEFAULT_GEARBOX_DESIGN)).toBe(btoa('{}').replace(/=+$/, ''));
  });
});

/** A forward gear's own ratio, input over output shaft. */
function evaluateRatio(d: GearboxDesign, name: string, box = designBuild(d).box): number {
  const s = box.states.find((x) => x.name === name)!;
  if (!box.spec.finalDrive) return s.ratio!;
  const shaft = box.members.indexOf(box.spec.finalDrive.shaft);
  return Math.abs(1 / s.speeds![shaft]!);
}

describe('2. ratios from the teeth', () => {
  const random = seeded(77);
  const designs = Array.from({ length: 80 }, () => resolveGearboxDesign(randomDesign(random)));

  it('every picked pair is within half the step of the grid of whole teeth at its centre distance and module', () => {
    let checked = 0;
    for (const d of designs) {
      const { teeth } = designBuild(d);
      for (const p of [...teeth.speeds, teeth.main]) {
        if (!p || p.hand) continue;
        expect(Number.isFinite(p.step), `${d.type} ${p.teeth}`).toBe(true);
        expect(Math.abs(p.ratio - p.target!)).toBeLessThanOrEqual(p.step / 2 + 1e-12);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('no coprime pair that spans the centre distance without undercut is nearer the target than the pick (counted apart from the picker)', () => {
    // The grid counted here from gear-geometry.ts alone: a helical pair's tooth sum Z spans the centre at
    // β = acos(m·Z/2a) within ±8° of the nominal helix; a spur pair's sum is closed by a shift sum S of at most ±1. A pair
    // is cut without undercut when its shift sum reaches the two gears' limits.
    let checked = 0;
    const DEG = 180 / Math.PI;
    for (const d of designs) {
      const { teeth } = designBuild(d);
      const a = d.centreMm;
      const alpha = d.pressureAngle;
      for (const p of [...teeth.speeds, teeth.main]) {
        if (!p || p.hand || !p.coprime) continue;
        const m = p.module;
        const beta = helixForCentre(a, m, p.teeth[0], p.teeth[1], alpha, p.shift[0] + p.shift[1]);
        const spur = d.helix === 0;
        if (!spur && !(beta > 0)) continue;
        const sums: Array<{ sum: number; shiftSum: number; helix: number }> = [];
        if (spur) {
          for (let sum = Math.floor((2 * a) / m) - 3; sum <= Math.ceil((2 * a) / m) + 3; sum++) {
            const shiftSum = Math.abs((m * sum) / 2 - a) < 1e-9 ? 0 : shiftSumForCentre(a, m, 1, sum - 1, 0, alpha);
            if (Math.abs(shiftSum) <= 1) sums.push({ sum, shiftSum, helix: 0 });
          }
        } else {
          for (let sum = 24; sum <= 240; sum++) {
            const c = (m * sum) / (2 * a);
            const helix = Math.acos(c) * DEG;
            if (c <= 1 && helix >= Math.max(0, d.helix - 8) && helix <= Math.min(40, d.helix + 8)) sums.push({ sum, shiftSum: 0, helix });
          }
        }
        let nearest = Infinity;
        for (const { sum, shiftSum, helix } of sums) {
          for (let z1 = Math.max(12, sum - 120); z1 <= Math.min(120, sum - 12); z1++) {
            const z2 = sum - z1;
            if (gcd(z1, z2) !== 1) continue;
            const limits = undercut(z1, 0, helix, alpha).minShift + undercut(z2, 0, helix, alpha).minShift;
            if (shiftSum < limits + 0.002) continue;
            nearest = Math.min(nearest, Math.abs(z2 / z1 - p.target!));
          }
        }
        expect(Math.abs(p.ratio - p.target!), `${d.type} ${p.teeth} for ${p.target}`).toBeLessThanOrEqual(nearest + 1e-12);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('a forward gear is the product of its pairs: the target within the grid, through the constant-mesh pair', () => {
    for (const d of designs) {
      const { teeth } = designBuild(d);
      teeth.speeds.forEach((p, i) => {
        const ratio = evaluateRatio(d, String(i + 1));
        if (!p) return expect(ratio).toBeCloseTo(1, 12);
        expect(ratio).toBeCloseTo(teeth.mainRatio * p.ratio, 10);
        if (!p.hand) expect(Math.abs(ratio - teeth.targets[i]!)).toBeLessThanOrEqual((teeth.mainRatio * p.step) / 2 + 1e-9);
      });
    }
  });

  it('a spur pair spans the centre distance with its teeth and a profile shift sum of at most one', () => {
    const spur = designs.filter((d) => d.helix === 0);
    expect(spur.length).toBeGreaterThan(5);
    for (const d of spur) {
      const { teeth } = designBuild(d);
      for (const p of teeth.speeds) {
        if (!p || p.hand) continue;
        const sum = p.shift[0] + p.shift[1];
        expect(Math.abs(sum)).toBeLessThanOrEqual(1 + 1e-12);
        expect(centreDistance(p.module, p.teeth[0], p.teeth[1], 0, d.pressureAngle, sum)).toBeCloseTo(d.centreMm, 6);
      }
    }
  });

  it('every gear the picker makes has at least twelve teeth and is clear of undercut by the generating rack', () => {
    // As every gear of the catalogue (gear-geometry.test.ts): pressure angles of 17.5–25°, spur and helical, the
    // reverse with its idler and a transaxle's final drive. Hand-set parts are the link's and are left out.
    let shifted = 0;
    for (const raw of designs) {
      const d = resolveGearboxDesign({ ...raw, pairs: raw.pairs.map(() => null), mainPair: null, reverse: null, finalPair: null });
      for (const g of designBuild(d).spec.gears) {
        // A crown wheel's pinion may have fewer, with its shift (the 911's has nine).
        if (g.id !== 'final-pinion') expect(g.teeth, `${d.type} ${g.id}`).toBeGreaterThanOrEqual(12);
        // A bevel gear by Tredgold's virtual teeth z/cos δ, a spur or helical one by its own.
        const z = g.cone === undefined ? g.teeth : g.teeth / Math.cos((g.cone * Math.PI) / 180);
        expect(undercut(z, g.shift, Math.abs(g.helix), g.pressureAngle).undercut, `${d.type} α ${d.pressureAngle} ${g.id} z ${g.teeth} x ${g.shift}`).toBe(false);
        if (g.shift > 0) shifted++;
      }
    }
    expect(shifted).toBeGreaterThan(20);
  });
});

describe('2b. reverse clear of the shafts', () => {
  it('a compound reverse keeps every gear clear of the shaft that passes through its plane, picked or set by hand', () => {
    // From the spec alone: the gear's tip radius (gear-geometry.ts) plus the 3D's thickest shaft, 0.2·a, must fit
    // between its own axis and the other shaft's. The input gear and the first idler gear share a plane the output
    // shaft runs through; the second idler gear and the output gear one the input shaft runs through.
    const random = seeded(4242);
    let compound = 0;
    for (let i = 0; i < 120; i++) {
      const raw = randomDesign(random);
      const d = resolveGearboxDesign({ ...raw, type: 'transaxle', reverse: null, reverseRatio: between(random, 2.5, 5.5), lowModule: between(random, 1.5, 4.5) } as GearboxDesign);
      const spec = designBuild(d).spec;
      const gear = (id: string) => spec.gears.find((g) => g.id === id);
      if (!gear('idler-R2')) continue;
      compound++;
      const axis = (id: string) => spec.axes.find((a) => a.id === id)!;
      const axisOf = (g: { member: string }) => axis(spec.members.find((m) => m.id === g.member)!.axis);
      const a = d.centreMm;
      for (const [id, other] of [['in-R', 'output'], ['idler-R', 'output'], ['idler-R2', 'input'], ['out-R', 'input']] as const) {
        const g = gear(id)!;
        const from = axisOf(g);
        const to = axis(other);
        expect(gearGeometry(g).ra + 0.2 * a, `${id} ${spec.gears.filter((x) => /R/.test(x.id)).map((x) => x.teeth)} at ${a} mm`).toBeLessThanOrEqual(Math.hypot(from.x - to.x, from.y - to.y) + 1e-6);
      }
    }
    expect(compound).toBeGreaterThan(20);
    // A hand-set compound reverse whose output gear would cut into the input shaft goes back to the picker.
    const civic = catalogueGearboxPresets().find((c) => c.id === 'manual-transaxle')!.design;
    expect(resolveGearboxDesign({ ...civic, reverse: { teeth: [19, 34, 20, 52], module: 2.75, helix: 0, faceWidth: 18 } }).reverse).toBeNull();
    expect(resolveGearboxDesign(civic).reverse).toEqual(civic.reverse);
  });
});

describe('catalogue copies and presets', () => {
  const copies = catalogueGearboxPresets();

  it('copies every gearbox that sits in a car of the site', () => {
    expect(copies.map((c) => c.id).sort()).toEqual(ALL_GEARBOXES.filter((g) => g.car && DRIVE_CARS[g.car]).map((g) => g.id).sort());
    expect(copies.map((c) => c.id)).toEqual(expect.arrayContaining(['manual-rwd', 'manual-transaxle', 'manual-transaxle/porsche-911-carrera-t-992']));
  });

  it.each(copies.map((c) => [c.id, c] as const))('%s: the copy is the catalogue box tooth for tooth and resolves to itself', (id, c) => {
    const record = gearboxById(id)!;
    const ours = designBuild(c.design).spec;
    const theirs = gearboxSpec(record);
    const gears = (s: typeof ours) => s.gears.map((g) => ({ id: g.id, teeth: g.teeth, module: g.module, helix: g.helix, shift: g.shift, faceWidth: g.faceWidth })).sort((a, b) => a.id.localeCompare(b.id));
    const strip = (gs: ReturnType<typeof gears>) => gs.map((g) => ({ ...g, helix: Math.round(g.helix * 1e9) / 1e9 }));
    expect(strip(gears(ours))).toEqual(strip(gears(theirs)));
    expect(resolveGearboxDesign(c.design)).toEqual(c.design);
    expect(c.design.factory).toEqual({ gearbox: id });
    // A link that keeps the record but changes the type or the number of gears loses it: its figures would not match.
    const other = c.design.type === 'layshaft' ? 'transaxle' : 'layshaft';
    expect(resolveGearboxDesign({ ...c.design, type: other }).factory).toBeNull();
    expect(resolveGearboxDesign({ ...c.design, gears: c.design.gears + 1 }).factory).toBeNull();
    const e = evaluateGearbox(c.design);
    e.gears.forEach((g, i) => expect(Math.abs(g.ratio - record.published.ratios[i]!)).toBeLessThan(0.0051));
    if (record.published.finalDrive) expect(e.finalDrive).toBeCloseTo(record.published.finalDrive, 2);
  });

  it('the copy of a car that drives gives the standing start of the quasi-static run of runs.ts to half a per cent', () => {
    for (const id of Object.values(DRIVE_CARS).filter((c) => c.dynamics).map((c) => c.car)) {
      const ours = evaluateGearbox(designFromRecord(gearboxById(DRIVE_CARS[id]!.gearbox)!));
      const theirs = quasiStaticRun(buildCarDrive(id));
      expect(Math.abs(ours.zeroTo100S! / theirs.zeroTo100S! - 1)).toBeLessThan(0.005);
      expect(Math.abs(ours.zeroTo400mS! / theirs.zeroTo400mS! - 1)).toBeLessThan(0.005);
    }
  });

  it('the odd presets are what they say', () => {
    const odd = Object.fromEntries(oddGearboxPresets().map((p) => [p.id, p.design]));
    expect(odd['spur-race']!.helix).toBe(0);
    expect(designBuild(odd['spur-race']!).spec.gears.filter((g) => g.helix !== 0)).toHaveLength(0);
    expect(odd['ten-speed']!.gears).toBe(10);
    expect(odd['single-cone-first']!.cones[0]).toBe(1);
    expect(Math.max(...odd['single-cone-first']!.cones)).toBe(3);
    for (const d of Object.values(odd)) expect(resolveGearboxDesign(d)).toEqual(d);
  });

  it('a type change keeps the car and gives the new type its usual parts', () => {
    const e30 = copies.find((c) => c.id === 'manual-rwd')!.design;
    const t = withGearboxType(e30, 'transaxle');
    expect(t.type).toBe('transaxle');
    expect(t.directGear).toBe(0);
    expect(t.factory).toBeNull();
    expect(t.car).toBe(e30.car);
    expect(designBuild(t).spec.finalDrive?.kind).toBe('bevel');
    expect(withGearboxType(t, 'layshaft').drive).toBe('rwd');
  });
});

describe('figures', () => {
  const e30 = evaluateGearbox(catalogueGearboxPresets().find((c) => c.id === 'manual-rwd')!.design);

  it('are finite and in order for every preset', () => {
    for (const p of [...catalogueGearboxPresets(), ...oddGearboxPresets()]) {
      const e = evaluateGearbox(p.design);
      for (const x of [e.vmaxKmh, e.zeroTo100S!, e.zeroTo400mS!, e.startGradePct, e.topRpmAt100, e.range]) expect(Number.isFinite(x), p.id).toBe(true);
      expect(e.shifts).toHaveLength(p.design.gears - 1);
      for (const s of e.shifts) expect(s.pauseS).toBeGreaterThanOrEqual(Math.max(0.25, s.syncS) - 1e-12);
      expect(e.zeroTo400mS!).toBeGreaterThan(e.zeroTo100S!);
    }
  });

  it('a box geared short stops at the rev limiter: v_max, the speed at 400 m and the flag say so', () => {
    expect(e30.vmaxAtLimiter).toBe(false);
    const short = evaluateGearbox(resolveGearboxDesign({ ...DEFAULT_GEARBOX_DESIGN, firstRatio: 7, finalDrive: 5.5 }));
    const top = short.gears[short.gears.length - 1]!;
    expect(short.vmaxAtLimiter).toBe(true);
    // At the limit the tyres pull only the road load: the slip of that force, a few per cent at most.
    expect(short.vmaxKmh).toBeLessThan(top.kmhAtLimit);
    expect(short.vmaxKmh).toBeGreaterThan(0.97 * top.kmhAtLimit);
    expect(short.at400mKmh!).toBeLessThanOrEqual(short.vmaxKmh + 1e-9);
    expect(short.at400mKmh!).toBeGreaterThan(0.99 * short.vmaxKmh);
  });

  it('the driver shifts up where the next gear pulls as hard, or at the rev limit', () => {
    // Gearbox plan: the driver shifts where the next gear's force is no less than the present one's. Counted here
    // from the torque map and each gear's overall ratio and efficiency alone (the spin loss, a fraction of a per cent,
    // left out). A diesel's power falls away before its limit, so it shifts early; the E30's holds, so it shifts at it.
    const d = resolveGearboxDesign({ ...DEFAULT_GEARBOX_DESIGN, engine: 'i4d' });
    const e = evaluateGearbox(d);
    const map = catalogueTorqueMap(engineById('i4d')!);
    const force = (g: GearFigures, rpm: number) => g.overall * g.efficiency * mapValue(map, map.wotNm, Math.min(rpm, map.limitRpm));
    let early = 0;
    for (const s of e.shifts) {
      const from = e.gears[s.from - 1]!;
      const to = e.gears[s.to - 1]!;
      const after = (rpm: number) => (rpm * to.overall) / from.overall;
      if (s.rpmBefore < map.limitRpm - 1) {
        early++;
        expect(Math.abs(force(to, s.rpmAfter) / force(from, s.rpmBefore) - 1)).toBeLessThan(0.005);
        expect(force(to, after(s.rpmBefore - 100))).toBeLessThan(force(from, s.rpmBefore - 100));
      } else expect(force(to, s.rpmAfter)).toBeLessThan(force(from, s.rpmBefore));
    }
    expect(early).toBeGreaterThanOrEqual(3);
    const limit = catalogueTorqueMap(engineById(DEFAULT_GEARBOX_DESIGN.engine)!).limitRpm;
    for (const s of e30.shifts) expect(s.rpmBefore).toBeCloseTo(limit, 9);
  });

  it('rev drop on an upshift at the limit is the ratio step', () => {
    for (const s of e30.shifts) expect(s.rpmAfter / s.rpmBefore).toBeCloseTo(e30.gears[s.to - 1]!.ratio / e30.gears[s.from - 1]!.ratio, 12);
  });

  it('more cones synchronise faster, a longer final drive turns slower at 120 km/h, a longer first pulls up a gentler grade', () => {
    const base = catalogueGearboxPresets().find((c) => c.id === 'manual-rwd')!.design;
    const three = evaluateGearbox(resolveGearboxDesign({ ...base, cones: base.cones.map(() => 3) }));
    three.shifts.forEach((s, i) => expect(s.syncS).toBeLessThan(e30.shifts[i]!.syncS));
    const tall = evaluateGearbox(resolveGearboxDesign({ ...base, finalDrive: 2.8 }));
    expect(tall.topRpmAt120).toBeLessThan(e30.topRpmAt120);
    // At 3000 kg the engine, not the grip, sets the grade.
    const heavy = { ...base, massKg: 3000 };
    const long = evaluateGearbox(resolveGearboxDesign({ ...heavy, ratios: [2.6, null, null, null, null], pairs: base.pairs.map((p, i) => (i === 0 ? null : p)) }));
    expect(long.startGradePct).toBeLessThan(evaluateGearbox(resolveGearboxDesign(heavy)).startGradePct);
  });
});

describe('7. speed', () => {
  // The heaviest boxes of the two types: ten speeds. Each run changes the first ratio, so the teeth, the spec and the
  // gearbox are derived anew every time, as a slider does. The machine is shared with other test files, so the best of
  // three batches of 20 counts: a batch the scheduler took the processor away from says nothing about the code.
  it.each(['layshaft', 'transaxle'] as const)('evaluate of a ten-speed %s takes under 15 ms on average', (type) => {
    const ten = oddGearboxPresets().find((p) => p.id === 'ten-speed')!.design;
    const d = type === 'layshaft' ? ten : withGearboxType(ten, 'transaxle');
    expect(d.gears).toBe(10);
    evaluateGearbox(d);
    let best = Infinity;
    for (let batch = 0; batch < 3; batch++) {
      const start = performance.now();
      for (let i = 0; i < 20; i++) evaluateGearbox(resolveGearboxDesign({ ...d, firstRatio: d.firstRatio + 0.01 * (20 * batch + i + 1) }));
      best = Math.min(best, (performance.now() - start) / 20);
    }
    expect(best).toBeLessThan(15);
  });
});

describe('3. bending calibration', () => {
  it('the TR-6060 MZ6 first pair 19/43 loads 1.0 in bending at its 580 N·m rating, about 1170 MPa (research §2.5)', () => {
    const box = buildGearbox(gearboxSpec(TR6060_MZ6));
    const first = stateStrength(box, '1', CALIBRATION_TORQUE_NM).find((m) => m.teeth[0] === 19 && m.teeth[1] === 43)!;
    expect(first.bending).toBeCloseTo(1, 12);
    expect(Math.abs(BENDING_LIMIT_MPA / 1170 - 1)).toBeLessThan(0.03);
    // The same constant reaches the contact limit: the plan expects the pair's contact load in 0.7–1.3.
    expect(CALIBRATION_CONTACT_LOAD).toBeGreaterThan(0.7);
    expect(CALIBRATION_CONTACT_LOAD).toBeLessThan(1.3);
    // GM validated the box at this torque, so its flanks are not told they pit there.
    expect(first.contact).toBeLessThanOrEqual(1 + 1e-12);
  });

  it('the designer, given the MZ6 teeth at 85 mm, loads its first pair 1.0 at 580 N·m and weighs the 66.3 kg of the TR-6060', () => {
    const d = tr6060Design();
    const { box } = designBuild(d);
    const first = gearboxStrength(box, d.gears, CALIBRATION_TORQUE_NM)[0]!;
    expect(first.weakest!.teeth).toEqual([19, 43]);
    expect(first.bending).toBeCloseTo(1, 9);
    expect(gearboxMass(d).totalKg).toBeCloseTo(TR6060_MASS_KG, 9);
  });

  it('the bending load is linear in torque, and past 1 the life falls with the curve anchored on TTAC (12 000 starts at 450 lb-ft)', () => {
    const box = buildGearbox(gearboxSpec(TR6060_MZ6));
    const at = (nm: number) => stateStrength(box, '1', nm).find((m) => m.teeth[0] === 19)!.bending;
    expect(at(2 * CALIBRATION_TORQUE_NM)).toBeCloseTo(2, 12);
    expect(startsAt(at(450 * 1.3558179483))).toBeCloseTo(12000, 6);
    expect(startsAt(1)).toBe(Infinity);
    expect(startsAt(1.2)).toBeGreaterThan(startsAt(1.3));
  });
});

describe('4. verdicts on the catalogue', () => {
  it.each(catalogueGearboxPresets().map((c) => [c.id, c.design] as const))('%s: no fatal diagnosis, and its figures say what they judge', (_id, d) => {
    const e = evaluateGearbox(d);
    const rel = assessGearbox(e);
    const diagnoses = diagnoseGearbox(d, e, rel);
    expect(diagnoses.filter((x) => x.severity === 'fatal')).toEqual([]);
    expect(rel.verdict).not.toBe('doomed');
    for (const item of rel.items) expect(Number.isFinite(item.load), item.id).toBe(true);
    expect(e.clutch.margin).toBeGreaterThanOrEqual(1.2);
    // The plan's hard shifts: 1→2 and 2→3 up, and back down from them.
    expect(e.synchro.shifts.map((s) => `${s.from}${s.to}`)).toEqual(['12', '21', '23', '32']);
    for (const s of e.synchro.shifts) expect(s.load).toBeCloseTo(Math.max(s.energyJPerMm2 / CONE_TEST_LIMITS.energyJPerMm2, s.powerWPerMm2 / CONE_TEST_LIMITS.powerWPerMm2), 12);
    // A direct gear meshes nothing under load: no strength to judge and no whine.
    if (d.directGear) {
      expect(e.strength[d.directGear - 1]!.meshes).toEqual([]);
      expect(e.tones[d.directGear - 1]!.db).toBeNull();
    }
  });

  it('a clutch that slips at the peak torque and teeth that break within a hundred starts are fatal', () => {
    const e30 = catalogueGearboxPresets().find((c) => c.id === 'manual-rwd')!.design;
    const weak = resolveGearboxDesign({ ...e30, clampN: 2500 });
    const e = evaluateGearbox(weak);
    expect(e.clutch.margin).toBeLessThan(1);
    const rel = assessGearbox(e);
    expect(rel.verdict).toBe('doomed');
    expect(diagnoseGearbox(weak, e, rel).map((x) => [x.id, x.severity])).toContainEqual(['clutch-slips', 'fatal']);
    const thin = resolveGearboxDesign({ ...DEFAULT_GEARBOX_DESIGN, engine: 'b6/porsche-992-carrera-3-0', clampN: 20000, module: 1.5, lowModule: 1.5, faceWidth: 9 });
    const te = evaluateGearbox(thin);
    const tr = assessGearbox(te);
    expect(startsAt(Math.max(...te.strength.map((g) => g.bending)))).toBeLessThan(100);
    expect(diagnoseGearbox(thin, te, tr).find((x) => x.id === 'teeth-break')?.severity).toBe('fatal');
  });
});

describe('6. directions', () => {
  const own = editGearboxDesign(catalogueGearboxPresets().find((c) => c.id === 'manual-rwd')!.design, { synchroMaterial: 'brass' });
  const base = evaluateGearbox(own);
  const bending = (d: GearboxDesign, gear = 1) => evaluateGearbox(d).strength[gear - 1]!.bending;

  it('a wider tooth lowers bending in every gear', () => {
    const wide = evaluateGearbox(editGearboxDesign(own, { faceWidth: own.faceWidth + 4 }));
    base.strength.forEach((g, i) => g.weakest && expect(wide.strength[i]!.bending).toBeLessThan(g.bending));
  });

  it('a larger centre distance lowers first gear\'s bending at the same ratios', () => {
    const wide = editGearboxDesign(own, { centreMm: own.centreMm + 8 });
    const e = evaluateGearbox(wide);
    e.gears.forEach((g, i) => expect(Math.abs(g.ratio / base.gears[i]!.ratio - 1)).toBeLessThan(0.03));
    expect(bending(wide)).toBeLessThan(base.strength[0]!.bending);
  });

  it('a coarser module on first lowers its bending', () => {
    expect(bending(editGearboxDesign(own, { lowModule: own.lowModule + 0.25 }))).toBeLessThan(base.strength[0]!.bending);
  });

  it('more cones synchronise faster', () => {
    const three = evaluateGearbox(editGearboxDesign(own, { cones: own.cones.map(() => 3) }));
    three.synchro.shifts.forEach((s, i) => expect(s.timeS).toBeLessThan(base.synchro.shifts[i]!.timeS));
  });

  it('a longer final drive turns slower at 120 km/h', () => {
    expect(evaluateGearbox(editGearboxDesign(own, { finalDrive: own.finalDrive - 0.4 })).topRpmAt120).toBeLessThan(base.topRpmAt120);
  });

  it('straight-cut teeth whine louder', () => {
    const spur = evaluateGearbox(editGearboxDesign(own, { helix: 0 }));
    const loudest = (e: typeof base) => Math.max(...e.tones.flatMap((g) => g.meshes.map((m) => m.db)));
    expect(loudest(spur)).toBeGreaterThan(loudest(base) + 6);
  });

  it('a dual-mass flywheel moves the damper\'s mode below the firing frequency at idle; a disc damper has it above', () => {
    const dmf = evaluateGearbox(editGearboxDesign(own, { damper: 'dmf' })).clutch;
    expect(dmf.damperHz).toBeLessThan(dmf.idleFiringHz);
    expect(base.clutch.damperHz).toBeGreaterThan(base.clutch.idleFiringHz);
  });

  it('a blunter chamfer roof blocks better: the sleeve turns the ring aside with less torque (UTS, eq. 5)', () => {
    const blocking = (roofAngle: number) => evaluateGearbox(editGearboxDesign(own, { roofAngle })).synchro.blocking;
    expect(blocking(130)).toBeGreaterThan(blocking(100));
  });

  it('a downshift whose spin loss beats the cone fails, is told so, and does not count as the ring\'s heat', () => {
    // A weak push on a single shallow-wedged cone against the spin loss of a wet clutch.
    const weak = editGearboxDesign(own, { shiftForceN: 200, coneAngle: 15, clutch: 'wet', cones: own.cones.map(() => 1) });
    const e = evaluateGearbox(weak);
    const failing = e.synchro.shifts.filter((s) => s.fails);
    expect(failing.length).toBeGreaterThan(0);
    for (const s of failing) expect(s.direction).toBe('down');
    expect(Number.isFinite(e.synchro.load)).toBe(true);
    const rel = assessGearbox(e);
    expect(rel.items.find((i) => i.id === 'synchro')!.detail).not.toMatch(/∞|Infinity|NaN/);
    const diagnoses = diagnoseGearbox(weak, e, rel);
    expect(diagnoses.map((x) => x.id)).toContain('sync-drag');
    expect(diagnoses.map((x) => x.text).join(' ')).not.toMatch(/∞|Infinity|NaN/);
  });

  it('a bigger clutch holds more, and a harder launch heats the plate more', () => {
    const big = evaluateGearbox(editGearboxDesign(own, { clutchMm: own.clutchMm + 20 })).clutch;
    expect(big.margin).toBeGreaterThan(base.clutch.margin);
    const heavy = evaluateGearbox(editGearboxDesign(own, { massKg: own.massKg + 400 })).clutch;
    expect(heavy.launchJ).toBeGreaterThan(base.clutch.launchJ);
    expect(heavy.plateRiseK!).toBeGreaterThan(base.clutch.plateRiseK!);
  });
});

describe('the factory record and edits', () => {
  const e30 = catalogueGearboxPresets().find((c) => c.id === 'manual-rwd')!.design;

  it('a renamed copy keeps its record; the first engineering change drops it', () => {
    expect(editGearboxDesign(e30, { name: 'mine' }).factory).toEqual({ gearbox: 'manual-rwd' });
    // A panel echoing a value the design already has changes nothing.
    expect(editGearboxDesign(e30, { clampN: e30.clampN, cones: [...e30.cones] }).factory).toEqual({ gearbox: 'manual-rwd' });
    expect(editGearboxDesign(e30, { clampN: e30.clampN + 100 }).factory).toBeNull();
    expect(editGearboxDesign(e30, { cones: e30.cones.map(() => 2) }).factory).toBeNull();
  });

  it('a change of module, helix or centre hands the copy\'s teeth back to the picker with their ratios', () => {
    for (const patch of [{ module: e30.module + 0.25 }, { helix: e30.helix - 4 }, { centreMm: e30.centreMm + 6 }] as Array<Partial<GearboxDesign>>) {
      const d = editGearboxDesign(e30, patch);
      const before = evaluateGearbox(e30).gears;
      evaluateGearbox(d).gears.forEach((g, i) => expect(Math.abs(g.ratio / before[i]!.ratio - 1), JSON.stringify(patch)).toBeLessThan(0.03));
    }
    // A wider face keeps the teeth and widens them.
    const wide = editGearboxDesign(e30, { faceWidth: e30.faceWidth + 2 });
    wide.pairs.forEach((p, i) => p && expect(p.teeth).toEqual(e30.pairs[i]!.teeth));
    expect(wide.pairs[1]!.faceWidth).toBeGreaterThan(e30.pairs[1]!.faceWidth);
  });

  it('a new number of gears gives every gear its synchroniser, and edits stay resolved', () => {
    const six = editGearboxDesign(e30, { gears: 6 });
    expect(six.gears).toBe(6);
    expect(six.cones).toHaveLength(6);
    expect(six.directGear).toBe(6);
    expect(resolveGearboxDesign(six)).toEqual(six);
  });
});

describe('no control is dead', () => {
  const copies = catalogueGearboxPresets();
  const e30 = copies.find((c) => c.id === 'manual-rwd')!.design;
  const civic = copies.find((c) => c.id === 'manual-transaxle')!.design;
  const boxes: Array<[string, GearboxDesign]> = [
    ['layshaft copy', e30],
    ['layshaft of its own', resolveGearboxDesign({ ...DEFAULT_GEARBOX_DESIGN, diff: 'helical' })],
    ['transaxle copy', civic],
    ['transaxle of its own, rear drive', resolveGearboxDesign({ ...withGearboxType(e30, 'transaxle'), diff: 'plate' })],
  ];
  const figures = (d: GearboxDesign): string => JSON.stringify(gearboxSnapshot(d).map((m) => [m.id, Math.round(m.value * 1e4)]));
  const drive = (d: GearboxDesign): string => JSON.stringify(designDifferential(d));

  for (const [label, d] of boxes) {
    for (const control of gearboxControls(d)) {
      it(`${label}: ${control.id} changes something`, () => {
        const tries = controlTries(d, control, 0.15);
        if (!tries.length) return; // A single available option leaves nothing to move.
        const read = control.only === 'drive' ? drive : figures;
        expect(tries.some((x) => read(editGearboxDesign(d, x.patch)) !== read(d))).toBe(true);
      });
    }
  }

  it('every choice tells its options apart by label', () => {
    for (const [, d] of boxes) {
      for (const c of gearboxControls(d)) {
        if (c.kind !== 'choice') continue;
        const labels = c.options(d).map(([, label]) => label);
        expect(new Set(labels).size, c.id).toBe(labels.length);
      }
    }
  });

  it('both types are covered, with every group of controls', () => {
    const types = new Set(boxes.map(([, d]) => d.type));
    expect([...types].sort()).toEqual(['layshaft', 'transaxle']);
    const groups = new Set(boxes.flatMap(([, d]) => gearboxControls(d).map((c) => c.group)));
    expect(groups.size).toBe(7);
  });
});

describe('computed causes', () => {
  const e30 = catalogueGearboxPresets().find((c) => c.id === 'manual-rwd')!.design;

  it('name what moves a figure, from two runs of the model', () => {
    const teeth = gearboxCausesOf(e30, 'teeth', gearboxControls(e30), 20);
    expect(teeth.length).toBeGreaterThan(0);
    expect(teeth.every((c) => c.effect.size >= 1)).toBe(true);
    expect(teeth.map((c) => c.control)).toEqual(expect.arrayContaining(['faceWidth']));
    const sync = gearboxCausesOf(e30, 'sync12', gearboxControls(e30), 10);
    expect(sync.map((c) => c.control)).toEqual(expect.arrayContaining(['shiftForceN', 'cones.2']));
  });

  it('do not change the design they look at', () => {
    const copy = JSON.stringify(e30);
    gearboxCausesOf(e30, 'zeroTo100', gearboxControls(e30));
    previewGearboxEffects(e30, { firstRatio: 4 });
    expect(JSON.stringify(e30)).toBe(copy);
  });
});
