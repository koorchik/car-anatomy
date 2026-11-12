import { describe, expect, it } from 'vitest';
import { ENGINE_VARIANTS } from '../src/data/engine-variants.ts';
import { CATALOGUE } from '../src/data/engines.ts';
import { catalogueDesign, type CatalogueEntry } from '../src/designer/catalogue.ts';
import { decodeDesign, encodeDesign } from '../src/designer/codec.ts';
import { paramRange, resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { diagnose } from '../src/designer/diagnostics.ts';
import { evaluate, lastEvaluateCalls, Model } from '../src/designer/physics.ts';
import { editDesign, randomDesign } from '../src/designer/presets.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { camAt, deactivationSets, effectiveCompression, hasVariableValves, mechanismFrictionBar, phaserRanges, remainingIntervals } from '../src/designer/valvetrain.ts';
import { REAL_VALVETRAIN } from './real-engines.ts';

const base = (over: Partial<Design> = {}): Design => resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });

/** A catalogue engine or variant, freed from its factory figures so the model speaks. */
const real = (id: string, over: Partial<Design> = {}): Design => {
  const [page, vid] = id.split('/');
  const entry = CATALOGUE.find((e) => e.id === page)!;
  const variant = vid ? ENGINE_VARIANTS[page!]!.variants.find((v) => v.id === vid)! : undefined;
  return resolveDesign({ ...catalogueDesign(entry, variant), factory: null, ...over });
};

/** A design with a given firing order, built the way the catalogue builds one. */
const withFiring = (order: number[], design: Partial<Design>): Design =>
  catalogueDesign({ id: 'test', title: '', example: 'test', firing: { order }, factory: { idleRpm: 800, revTimeS: 1, rough: 0.3 }, design, article: { lead: '', how: '', sound: '', pros: [], cons: [], cars: [] } } as CatalogueEntry);

const seeded = (seed: number): (() => number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

describe('the mechanisms a design may have', () => {
  it('resolving twice changes nothing, whatever arrives in a link', () => {
    const random = seeded(7);
    const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!;
    const junk = [Number.NaN, 'x', 1e9, -5, null, 'evil', true];
    for (let i = 0; i < 300; i++) {
      const d = randomDesign(random) as unknown as Record<string, unknown>;
      d.camPhaser = pick(['none', 'intake', 'dual', 'coupled', ...junk]);
      d.camSwitch = pick(['none', 'intake', 'exhaust', 'both', ...junk]);
      d.liftControl = pick(['cam', 'continuous', 'multiair', ...junk]);
      d.deactivation = pick(['none', 'valves', 'fuel', ...junk]);
      d.deactivateGroup = pick(['first', 'second', 'alternate', ...junk]);
      d.switchKind = pick(['pin', 'slide', ...junk]);
      for (const key of ['intakePhaseRange', 'exhaustPhaseRange', 'switchRpm', 'lowLift', 'lowDuration']) d[key] = pick([random() * 9000, ...junk]);
      const once = resolveDesign(d as unknown as Design);
      expect(resolveDesign(once)).toEqual(once);
      expect(['none', 'intake', 'dual', 'coupled']).toContain(once.camPhaser);
      expect(['none', 'intake', 'exhaust', 'both']).toContain(once.camSwitch);
      expect(['cam', 'continuous', 'multiair']).toContain(once.liftControl);
      expect(['none', 'valves', 'fuel']).toContain(once.deactivation);
      for (const key of ['intakePhaseRange', 'exhaustPhaseRange', 'switchRpm', 'lowLift', 'lowDuration'] as const) {
        const range = paramRange(once, key);
        expect(once[key]).toBeGreaterThanOrEqual(range.min);
        expect(once[key]).toBeLessThanOrEqual(range.max);
      }
      expect(once.lowLift).toBeLessThan(once.lift);
      expect(once.switchRpm).toBeLessThanOrEqual(Math.max(1500, once.rpmLimit - 300));
    }
  });

  it('only allows what the hardware can carry', () => {
    expect(base({ valvetrain: 'ohv', valvesPerCyl: 2, camPhaser: 'dual' }).camPhaser).toBe('coupled');
    expect(base({ valvetrain: 'sohc', camPhaser: 'intake' }).camPhaser).toBe('coupled');
    expect(base({ valvetrain: 'dohc', camPhaser: 'coupled' }).camPhaser).toBe('dual');
    const rotary = base({ layout: 'rotary', cylinders: 2, camPhaser: 'dual', camSwitch: 'both', liftControl: 'continuous', deactivation: 'valves' });
    expect([rotary.camPhaser, rotary.camSwitch, rotary.liftControl, rotary.deactivation]).toEqual(['none', 'none', 'cam', 'none']);
    expect(base({ fuel: 'diesel', lambda: 1.5, compression: 18, liftControl: 'multiair' }).liftControl).toBe('cam');
    expect(base({ cylinders: 5, deactivation: 'valves' }).deactivation).toBe('none');
    expect(base({ cylinders: 2, deactivation: 'valves' }).deactivation).toBe('none');
    expect(base({ valvetrain: 'sohc', liftControl: 'continuous' }).liftControl).toBe('cam');
    expect(base({ valvetrain: 'ohv', valvesPerCyl: 2, camSwitch: 'intake' }).camSwitch).toBe('none');
    expect(base({ liftControl: 'continuous', camSwitch: 'intake' }).camSwitch).toBe('none');
    expect(base({ liftControl: 'continuous', camSwitch: 'both' }).camSwitch).toBe('exhaust');
  });

  it('turns a hostile link into a plain engine', () => {
    const text = btoa(JSON.stringify({ camPhaser: 'evil', switchRpm: 'x', deactivation: 'valves', cylinders: 3, liftControl: 7 })).replace(/=+$/, '');
    const d = decodeDesign(text)!;
    expect(d.camPhaser).toBe('none');
    expect(d.deactivation).toBe('none');
    expect(d.liftControl).toBe('cam');
    expect(Number.isFinite(d.switchRpm)).toBe(true);
    const own = base({ camPhaser: 'dual', camSwitch: 'exhaust', deactivation: 'valves', cylinders: 6, layout: 'vee', veeAngle: 90 });
    expect(decodeDesign(encodeDesign(own))).toEqual(own);
  });

  it('keeps the factory figures for a change that is only drawn or heard', () => {
    const d = { ...real('i4'), factory: { idleRpm: 800, revTimeS: 1, rough: 0.3, trim: 0.5 } };
    expect(editDesign(d, { switchKind: 'slide' }).factory).not.toBeNull();
    expect(editDesign(d, { deactivateGroup: 'second' }).factory).not.toBeNull();
    expect(editDesign(d, { camPhaser: 'none' }).factory).toBeNull();
  });
});

describe('cylinders that rest', () => {
  it('rests every other cylinder in the firing order, as the manufacturers do', () => {
    // GM TSB 20-NA-038: the LT1 rests 1, 7, 6 and 4.
    expect(deactivationSets(real('v8-cross/camaro-ss-lt1'))).toEqual([[1, 7, 6, 4]]);
    // Chrysler rests four of eight: from 1-8-4-3-6-5-7-2 that is 1, 4, 6, 7.
    expect(deactivationSets(real('v8-cross/challenger-srt-392'))[0]!.sort()).toEqual([1, 4, 6, 7]);
    // Honda VCM rests the rear bank of the V6: 1, 2, 3.
    const honda = withFiring([1, 4, 2, 5, 3, 6], { layout: 'vee', cylinders: 6, veeAngle: 60, numbering: 'sequential', deactivation: 'valves' });
    expect(deactivationSets(honda)[0]!.sort()).toEqual([1, 2, 3]);
    // VW ACT rests cylinders 2 and 3.
    const vw = withFiring([1, 3, 4, 2], { cylinders: 4, deactivation: 'valves', deactivateGroup: 'second' });
    expect(deactivationSets(vw)[0]!.sort()).toEqual([2, 3]);
    // Porsche's flat six rests one bank and swaps.
    const gt4 = real('b6/porsche-718-gt4-4-0');
    expect(deactivationSets(gt4).map((s) => [...s].sort())).toEqual([[1, 2, 3], [4, 5, 6]]);
    // Lamborghini's V10 rests one bank.
    expect(deactivationSets(real('v10/huracan-lp610-4'))[0]!.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('leaves an even rhythm when the firing was even', () => {
    for (const d of [real('v8-cross/camaro-ss-lt1'), real('b6/porsche-718-gt4-4-0'), withFiring([1, 3, 4, 2], { cylinders: 4, deactivation: 'valves' })]) {
      for (const set of deactivationSets(d)) for (const gap of remainingIntervals(d, set)) expect(gap).toBeCloseTo((2 * 720) / d.cylinders, 6);
    }
  });

  it('saves fuel at cruise on a big V8 within what GM reports, and less with only the fuel cut', () => {
    const afm = real('v8-cross/camaro-ss-lt1');
    const all = evaluate({ ...afm, deactivation: 'none' }).cruise;
    const rest = evaluate(afm).cruise;
    const fuelOnly = evaluate({ ...afm, deactivation: 'fuel' }).cruise;
    expect(rest.activeCylinders).toBe(4);
    const saving = 1 - rest.fuelLh / all.fuelLh;
    expect(saving).toBeGreaterThan(REAL_VALVETRAIN.savings.afm[0]);
    expect(saving).toBeLessThan(REAL_VALVETRAIN.savings.afm[1]);
    // The resting cylinders still pump air: less is saved.
    expect(fuelOnly.fuelLh).toBeGreaterThan(rest.fuelLh);
    expect(fuelOnly.fuelLh).toBeLessThan(all.fuelLh);
    expect(rest.pumpingBar).toBeLessThan(all.pumpingBar / 2);
  });

  it('a resting cylinder with only its fuel cut still moves air', () => {
    const d = real('v8-cross/camaro-ss-lt1');
    const model = new Model(d);
    const op = { throttle: 0.5, lambda: 1, noBoost: true, cam: camAt(d, { high: true }) };
    const all = model.at(2000, op).fillRatio;
    // Half the air with the valves shut: only the back pressure, and so the residual gas, moves a little.
    expect(model.at(2000, { ...op, active: 0.5 }).fillRatio / all).toBeCloseTo(0.5, 2);
    const fuel = new Model({ ...d, deactivation: 'fuel' });
    expect(fuel.at(2000, { ...op, active: 0.5 }).fillRatio / all).toBeCloseTo(1, 2);
  });
});

describe('cam phasers', () => {
  it('park is half the travel to the side of least overlap', () => {
    const plain = real('i4', { camPhaser: 'none', camSwitch: 'none' });
    const phased = real('i4', { camSwitch: 'none' });
    const r = phaserRanges(phased).intake;
    const mid = camAt(plain, { high: true }).events;
    const park = camAt(phased, { high: true }).events;
    expect(park.intakeOpen - mid.intakeOpen).toBeCloseTo(r / 2, 6);
    expect(camAt(phased, { high: true, intakeShift: -r }).events.intakeOpen - mid.intakeOpen).toBeCloseTo(-r / 2, 6);
  });

  it('keeps the BMW S54 and S85 inside the spreads BMW publishes', () => {
    // BMW ST505 M Engines: intake spread 70–130 and exhaust 83–128 on the S54, 79–145 and 91–128 on the S85.
    for (const [id, intake, exhaust] of [
      ['i6/bmw-m3-e46-s54', [70, 130], [83, 128]],
      ['v10/bmw-m5-e60-s85', [79, 145], [91, 128]],
    ] as const) {
      const d = real(id);
      const r = phaserRanges(d);
      const centreIn = (shift: number): number => {
        const e = camAt(d, { high: true, intakeShift: shift }).events;
        return (e.intakeOpen + e.intakeClose) / 2 - 360;
      };
      const centreEx = (shift: number): number => {
        const e = camAt(d, { high: true, exhaustShift: shift }).events;
        return 360 - (e.exhaustOpen + e.exhaustClose) / 2;
      };
      expect(r.intake).toBe(intake[1] - intake[0]);
      expect(r.exhaust).toBe(exhaust[1] - exhaust[0]);
      // The data hold the middle of the spread to within the 4 degree convention of the cam fields.
      expect(Math.abs(centreIn(0) - intake[1])).toBeLessThan(6);
      expect(Math.abs(centreIn(-r.intake) - intake[0])).toBeLessThan(6);
      expect(Math.abs(centreEx(0) - exhaust[1])).toBeLessThan(6);
      expect(Math.abs(centreEx(r.exhaust) - exhaust[0])).toBeLessThan(6);
    }
  });

  it('never makes full-load torque worse at its schedule speeds, beyond its own friction', () => {
    for (const d of [base({ camPhaser: 'intake' }), base({ camPhaser: 'dual' }), base({ valvetrain: 'ohv', valvesPerCyl: 2, layout: 'vee', cylinders: 8, camPhaser: 'coupled' }), real('w12')]) {
      const perf = evaluate(d);
      const plain = new Model({ ...d, camPhaser: 'none' });
      const friction = (mechanismFrictionBar(d) * 1e5 * plain.vdM3) / (4 * Math.PI);
      perf.valvetrain!.nodeRpm.forEach((rpm, i) => {
        const without = plain.at(rpm, { throttle: 1, lambda: d.lambda, noBoost: false }).torqueNm;
        expect(perf.valvetrain!.highTorque[i]!).toBeGreaterThan(without - friction - 1e-3);
      });
    }
  });

  it('closes the intake early at low speed and late at the top', () => {
    // Heywood, and Toyota's VVT-i strategy: the charge isn't pushed back at low speed, the inertia is used up top.
    const vt = evaluate(real('i4', { camSwitch: 'none' })).valvetrain!;
    expect(vt.wotIntake[0]!).toBeLessThanOrEqual(vt.wotIntake[5]!);
    expect(vt.wotIntake[0]!).toBeLessThan(0);
  });

  it('saves a little fuel at cruise, never more than the pumping it can remove', () => {
    for (const id of ['v8-cross/mustang-gt-coyote-50', 'b4/subaru-fb25']) {
      const d = real(id);
      const without = evaluate({ ...d, camPhaser: 'none' }).cruise;
      const withPhaser = evaluate(d).cruise;
      const saving = 1 - withPhaser.fuelLh / without.fuelLh;
      expect(saving, id).toBeGreaterThan(0);
      // Ford claims up to 4.5 % over a whole cycle for twin independent phasers.
      expect(saving, id).toBeLessThan(REAL_VALVETRAIN.savings.phasers[1]);
    }
  });

  it('cuts reliefs into the crown, and a range that cannot fit them bends a valve', () => {
    const k20 = evaluate(real('i4'));
    expect(k20.valveClearance).toBeGreaterThan(0);
    expect(k20.valvetrain!.reliefMm).toBeGreaterThan(0);
    const wild = base({ camPhaser: 'dual', intakePhaseRange: 80, exhaustPhaseRange: 60, compression: 13.5, lift: 13, intakeDuration: 300, exhaustDuration: 300, lobeSeparation: 100 });
    expect(diagnose(wild, evaluate(wild)).map((x) => x.id)).toContain('valve-hit');
  });
});

describe('compression from the moment the intake closes', () => {
  it('is Heywood’s ratio, and an early close traps the same as a late one', () => {
    const d = base({ compression: 13, stroke: 88, rodLength: 140 });
    const a = 44;
    const travel = (deg: number): number => a + 140 - (a * Math.cos((deg * Math.PI) / 180) + Math.sqrt(140 ** 2 - (a * Math.sin((deg * Math.PI) / 180)) ** 2));
    const late = effectiveCompression(d, { ...camAt(d).events, ivcAbdc: 70 });
    expect(late).toBeCloseTo(1 + (12 * travel(110)) / 88, 9);
    expect(effectiveCompression(d, { ...camAt(d).events, ivcAbdc: -70 })).toBeCloseTo(late, 9);
  });

  it('lets a hybrid’s Atkinson engine run 13 : 1 on regular, where a short cam knocks', () => {
    const ref = REAL_VALVETRAIN.atkinson;
    const atkinson = base({ ...ref.design, intakeDuration: 290, camPhaser: 'intake', intakePhaseRange: 50 });
    const short = base({ ...ref.design, intakeDuration: 220 });
    const retard = (d: Design): number => Math.max(...evaluate(d).points.map((p) => p.knockRetard));
    expect(retard(atkinson)).toBeLessThan(ref.maxRetard);
    expect(retard(short)).toBeGreaterThan(retard(atkinson) + 4);
    expect(evaluate(atkinson).effectiveCompression).toBeLessThan(evaluate(short).effectiveCompression);
    expect(diagnose(atkinson, evaluate(atkinson)).map((x) => x.id)).toContain('atkinson');
  });

  it('keeps Mazda’s 13 : 1 on regular out of heavy knock', () => {
    const ref = REAL_VALVETRAIN.skyactiv;
    const d = base({ ...ref.design, camPhaser: 'dual' });
    expect(Math.max(...evaluate(d).points.map((p) => p.knockRetard))).toBeLessThan(ref.maxRetard);
  });

  it('gives a Miller engine its knock margin from an early close', () => {
    const ref = REAL_VALVETRAIN.miller;
    const d = base({ ...ref.design, camPhaser: 'intake', intakePhaseRange: 80 });
    const model = new Model(d);
    const at = (shift: number) => model.at(3000, { throttle: 1, lambda: d.lambda, noBoost: false, cam: camAt(d, { high: true, intakeShift: shift }) });
    const early = camAt(d, { high: true, intakeShift: -80 }).events;
    expect(early.ivcAbdc).toBeLessThan(-25);
    const atBdc = -camAt(d, { high: true }).events.ivcAbdc;
    const miller = at(-80);
    const plain = at(atBdc);
    expect(effectiveCompression(d, early)).toBeLessThan(effectiveCompression(d, camAt(d, { high: true, intakeShift: atBdc }).events));
    expect(miller.knockRetard).toBeLessThan(plain.knockRetard);
    expect(miller.peakPressureBar).toBeLessThan(plain.peakPressureBar);
  });

  it('a late close lowers the peak pressure at the same geometric compression', () => {
    const d = base({ compression: 12, camPhaser: 'intake', intakePhaseRange: 60 });
    const model = new Model(d);
    const op = (shift: number) => ({ throttle: 1, lambda: d.lambda, noBoost: false, cam: camAt(d, { high: true, intakeShift: shift }) });
    expect(model.at(3000, op(0)).peakPressureBar).toBeLessThan(model.at(3000, op(-60)).peakPressureBar);
  });
});

describe('residual gas', () => {
  it('stays a few percent at full load, and grows with overlap at cruise', () => {
    for (const id of ['i4', 'v8-cross', 'b6', 'v10']) {
      for (const p of evaluate(real(id)).points.filter((_, i) => i % 12 === 6)) {
        expect(p.residual, id).toBeGreaterThan(0.015);
        expect(p.residual, id).toBeLessThan(0.1);
      }
    }
    // Heywood gives 20-30 % at light load for engines with generous overlap.
    const v8 = real('v8-cross');
    const model = new Model(v8);
    const light = model.at(2500, { throttle: 0.4, lambda: 1, noBoost: true });
    expect(light.residual).toBeGreaterThan(0.08);
    expect(light.residual).toBeLessThan(0.35);
  });
});

describe('a second cam profile', () => {
  it('Honda’s K20A: the two curves cross near where Honda switches', () => {
    const vt = evaluate(real('i4')).valvetrain!;
    // Honda switches the JDM Integra Type R at 6000 rpm.
    expect(vt.crossoverRpm).not.toBeNull();
    expect(Math.abs(vt.crossoverRpm! - 6000)).toBeLessThan(800);
  });

  it('switching at the crossover leaves no dip, switching early does', () => {
    const at = real('i4');
    const cross = evaluate(at).valvetrain!.crossoverRpm!;
    const right = evaluate({ ...at, switchRpm: Math.round(cross) });
    const near = right.points.filter((p) => Math.abs(p.rpm - cross) < 300);
    for (let i = 1; i < near.length; i++) expect(near[i]!.torqueNm / near[i - 1]!.torqueNm).toBeGreaterThan(0.98);
    const early = { ...at, switchRpm: 4000 };
    const perf = evaluate(early);
    expect(perf.valvetrain!.switchDeficitNm).toBeGreaterThan(2);
    expect(diagnose(early, perf).map((x) => x.id)).toContain('switch-early');
  });
});

describe('the valve setting the load', () => {
  it('Valvetronic halves the pumping of a big engine at cruise, within what BMW reports', () => {
    const d = real('v8-cross', { valvetrain: 'dohc', valvesPerCyl: 4 });
    const throttled = evaluate(d).cruise;
    const lever = evaluate(resolveDesign({ ...d, liftControl: 'continuous' })).cruise;
    expect(lever.pumpingBar).toBeLessThan(throttled.pumpingBar / 2);
    const saving = 1 - lever.fuelLh / throttled.fuelLh;
    expect(saving).toBeGreaterThan(REAL_VALVETRAIN.savings.liftControl[0]);
    expect(saving).toBeLessThan(REAL_VALVETRAIN.savings.liftControl[1]);
    expect(lever.liftMm).toBeLessThan(d.lift / 2);
  });

  it('MultiAir saves fuel on an engine that cruises throttled, within what Fiat reports', () => {
    const d = base({ cylinders: 6, bore: 89, stroke: 93, rodLength: 150 });
    const saving = 1 - evaluate(resolveDesign({ ...d, liftControl: 'multiair' })).cruise.fuelLh / evaluate(d).cruise.fuelLh;
    expect(saving).toBeGreaterThan(REAL_VALVETRAIN.savings.liftControl[0]);
    expect(saving).toBeLessThan(REAL_VALVETRAIN.savings.liftControl[1]);
  });
});

describe('cost and the catalogue', () => {
  it('a design with every mechanism stays cheap enough for a slider', () => {
    evaluate(base({ name: 'cost', layout: 'vee', cylinders: 8, veeAngle: 90, camPhaser: 'dual', camSwitch: 'exhaust', switchRpm: 4500, liftControl: 'continuous', deactivation: 'valves' }));
    expect(lastEvaluateCalls).toBeLessThanOrEqual(400);
  });

  it('engines without the mechanisms get none in their spec', () => {
    const d = real('i1');
    expect(hasVariableValves(d)).toBe(false);
    expect(designToSpec(d, evaluate(d)).vvt).toBeUndefined();
    expect(evaluate(d).valvetrain).toBeNull();
  });

  const all = CATALOGUE.flatMap((entry) => [entry.id, ...(ENGINE_VARIANTS[entry.id]?.variants ?? []).map((v) => `${entry.id}/${v.id}`)]);
  it.each(all.filter((id) => hasVariableValves(real(id))))('%s: its valve gear raises no complaint', (id) => {
    const d = real(id);
    const ids = diagnose(d, evaluate(d)).map((x) => x.id);
    for (const bad of ['relief-deep', 'phaser-idle', 'switch-early', 'switch-late', 'switch-useless', 'deact-uneven', 'valve-hit', 'valve-close']) expect(ids, id).not.toContain(bad);
  });
});
