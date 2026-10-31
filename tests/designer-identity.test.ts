import { describe, expect, it } from 'vitest';
import { EngineSynth, synthConfig } from '../src/audio/synth.ts';
import { ENGINES } from '../src/data/engines.ts';
import { decodeDesign, encodeDesign } from '../src/designer/codec.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { effectiveOpen, effectiveRasp } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec, editDesign } from '../src/designer/presets.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import type { EngineSpec } from '../src/engine/spec.ts';

const copyOf = (spec: EngineSpec): EngineSpec => {
  const d = designFromSpec(spec);
  return designToSpec(d, evaluate(d));
};

/** Compares two values to within rounding noise, walking through arrays and objects. */
const expectSame = (actual: unknown, wanted: unknown, path: string): void => {
  if (typeof wanted === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - wanted), path).toBeLessThan(1e-6);
  } else if (Array.isArray(wanted)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(wanted.length);
    wanted.forEach((v, i) => expectSame((actual as unknown[])[i], v, `${path}[${i}]`));
  } else if (wanted && typeof wanted === 'object') {
    for (const [k, v] of Object.entries(wanted)) expectSame((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
  } else {
    expect(actual, path).toBe(wanted);
  }
};

const drive = (spec: EngineSpec): Float32Array => {
  const synth = new EngineSynth(synthConfig(buildEngine(spec)), 48000);
  synth.sim.start();
  const out = new Float32Array(48000 * 4);
  const block = 128;
  for (let i = 0; i < out.length; i += block) {
    const t = i / 48000;
    synth.sim.pedal = t > 3 ? 0 : t > 1.6 ? 1 : 0;
    const l = out.subarray(i, i + block);
    synth.process(l, new Float32Array(l.length));
  }
  return out;
};

describe.each(ENGINES.map((e) => [e.id, e] as const))('%s opened in the designer is the same engine', (_id, spec) => {
  it('same mechanism: every cylinder, crank throw and dimension', () => {
    const a = buildEngine(copyOf(spec));
    const b = buildEngine(spec);
    const pick = (e: typeof a) => ({ cycle: e.cycle, r: e.r, l: e.l, deck: e.deck, rodWidth: e.rodWidth, zMin: e.zMin, zMax: e.zMax, displacementCc: e.displacementCc, intervals: e.intervals, cylinders: e.cylinders, banks: e.banks, throws: e.throws, timing: e.timing, isRotary: e.isRotary });
    expectSame(pick(a), pick(b), 'engine');
  });

  it('same look: everything the 3D model reads', () => {
    const c = copyOf(spec);
    for (const key of ['badge', 'fuel', 'aspiration', 'valvetrain', 'valvesPerCyl', 'coverColor', 'blockMaterial', 'bore', 'stroke', 'compression'] as const) {
      expect(c[key], key).toBe(spec[key]);
    }
    expectSame(c.valves ?? null, spec.valves ?? null, 'valves');
    expect(c.tuning?.flywheelKg).toBe(spec.tuning?.flywheelKg);
    if (spec.tuning?.counterweightMm !== undefined) expect(c.tuning?.counterweightMm).toBeCloseTo(spec.tuning.counterweightMm, 6);
    expect(c.tuning?.vibrationGain ?? 1).toBe(spec.tuning?.vibrationGain ?? 1);
  });

  it('same sound settings', () => {
    expectSame(synthConfig(buildEngine(copyOf(spec))), synthConfig(buildEngine(spec)), 'config');
  });

  it('same sound: start, idle, a full-throttle run and a lift, sample against sample', () => {
    const a = drive(copyOf(spec));
    const b = drive(spec);
    let energy = 0;
    let error = 0;
    for (let i = 0; i < a.length; i++) {
      energy += b[i]! * b[i]!;
      error += (a[i]! - b[i]!) ** 2;
    }
    const db = 10 * Math.log10(error / Math.max(energy, 1e-12) + 1e-20);
    expect(energy).toBeGreaterThan(1);
    expect(db, 'difference relative to the signal, dB').toBeLessThan(-80);
  });

  it('survives a link and resolving', () => {
    const d = designFromSpec(spec);
    expect(resolveDesign(d)).toEqual(d);
    expect(decodeDesign(encodeDesign(d))).toEqual(d);
  });
});

describe('factory calibration lasts until the first real change', () => {
  const spec = ENGINES.find((e) => e.id === 'v8-flat')!;

  it('renaming or repainting keeps it', () => {
    const d = designFromSpec(spec);
    expect(d.factory).not.toBeNull();
    expect(editDesign(d, { name: 'Мій' }).factory).not.toBeNull();
    expect(editDesign(d, { coverColor: '#123456' }).factory).not.toBeNull();
    expect(editDesign(d, { coverColor: '#123456' }).coverColor).toBe('#123456');
  });

  it('any engineering change hands over to the model', () => {
    const d = editDesign(designFromSpec(spec), { bore: 96 });
    expect(d.factory).toBeNull();
    const out = designToSpec(d, evaluate(d));
    expect(out.tuning?.torqueTable).toHaveLength(25);
    expect(out.tuning?.trim).toBeUndefined();
  });

  it('keeps the exact exhaust through an unrelated change, and drops it when its own control moves', () => {
    const subaru = ENGINES.find((e) => e.id === 'b4')!;
    const d = designFromSpec(subaru);
    expect(d.headerLengths).toEqual([420, 740, 920, 580]);
    expect(editDesign(d, { bore: 100 }).headerLengths).toEqual([420, 740, 920, 580]);
    expect(editDesign(d, { headerLength: 700 }).headerLengths).toBeNull();
    const six = ENGINES.find((e) => e.id === 'i6')!;
    const i6 = designFromSpec(six);
    expect(i6.collectorOf).toEqual([0, 0, 0, 1, 1, 1]);
    expect(editDesign(i6, { collector: 'single' }).collectorOf).toBeNull();
    expect(editDesign(i6, { cylinders: 4 }).collectorOf).toBeNull();
  });
});

describe('new exhaust controls', () => {
  const base = () => designFromSpec(ENGINES.find((e) => e.id === 'i4')!);

  it('muffler openness is continuous and moves the back pressure smoothly', () => {
    const back = (mufflerOpen: number) => evaluate(editDesign(base(), { mufflerOpen, pipeDia: 45 })).peakPower.backpressureBar;
    expect(back(0.2)).toBeGreaterThan(back(0.5));
    expect(back(0.5)).toBeGreaterThan(back(0.9));
  });

  it('a muffler type sets its typical openness and clears a hand-set one', () => {
    const d = editDesign(base(), { mufflerOpen: 0.1, rasp: 0.9 });
    expect(effectiveOpen(d)).toBeCloseTo(0.1);
    expect(effectiveRasp(d)).toBeCloseTo(0.9);
    const road = editDesign(d, { muffler: 'open', catalyst: false });
    expect(road.mufflerOpen).toBeNull();
    expect(road.rasp).toBeNull();
    expect(effectiveOpen(road)).toBeGreaterThan(0.9);
  });

  it('each pipe can have its own length and collector, and the sound hears it', () => {
    const d = editDesign(base(), { headerLengths: [300, 900, 500, 1200], collectorOf: [0, 1, 1, 0], pans: [-0.8, 0.8] });
    const spec = designToSpec(d, evaluate(d));
    expect(spec.exhaust.headerM).toEqual([0.3, 0.9, 0.5, 1.2]);
    expect(spec.exhaust.groups).toEqual([[1, 4], [2, 3]]);
    expect(spec.exhaust.pans).toEqual([-0.8, 0.8]);
    expect(synthConfig(buildEngine(spec)).groupPans).toEqual([-0.8, 0.8]);
  });

  it('nonsense in these fields from a link cannot get through', () => {
    const fixed = resolveDesign({ ...base(), headerLengths: [1, 2], collectorOf: [9, 9, 9, 9, 9], pans: [50], coverColor: 'url(x)', rasp: Number.NaN, mufflerOpen: 7, rotorOrder: [1, 1], factory: { idleRpm: -5, revTimeS: 1e9, rough: 9, trim: 1e9 } });
    expect(fixed.headerLengths).toBeNull();
    expect(fixed.collectorOf).toBeNull();
    expect(fixed.pans).toBeNull();
    expect(fixed.coverColor).toBeNull();
    expect(fixed.mufflerOpen).toBeLessThanOrEqual(1);
    expect(Number.isFinite(effectiveRasp(fixed))).toBe(true);
    expect(fixed.rotorOrder).toBeNull();
    expect(fixed.factory!.idleRpm).toBeGreaterThan(0);
    expect(fixed.factory!.trim).toBeLessThan(10);
    expect(() => buildEngine(designToSpec(fixed, evaluate(fixed)))).not.toThrow();
  });

  it('numbering along each bank or across them leaves the crank maths right', () => {
    const d = designFromSpec(ENGINES.find((e) => e.id === 'v8-flat')!);
    expect(d.numbering).toBe('sequential');
    const flat = editDesign(d, { crankPreset: 'flat' });
    const engine = buildEngine(designToSpec(flat, evaluate(flat)));
    expect(engine.throws).toHaveLength(4);
    const even = editDesign(d, { crankPreset: 'even' });
    expect(buildEngine(designToSpec(even, evaluate(even))).intervals.every((v) => Math.abs(v - 90) < 1e-6)).toBe(true);
  });
});
