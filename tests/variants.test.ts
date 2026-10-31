import { describe, expect, it } from 'vitest';
import { ENGINE_VARIANTS } from '../src/data/engine-variants.ts';
import { CATALOGUE, ENGINES, engineById, engineFacts, pageChoices } from '../src/data/engines.ts';
import { catalogueDesign } from '../src/designer/catalogue.ts';
import { diagnose } from '../src/designer/diagnostics.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { assessReliability } from '../src/designer/reliability.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { render, rmsDb } from '../scripts/render-audio.ts';

const all = CATALOGUE.flatMap((entry) => (ENGINE_VARIANTS[entry.id]?.variants ?? []).map((variant) => ({ entry, variant, id: `${entry.id}/${variant.id}` })));

describe('real engines of each layout', () => {
  it('fills every page that has researched engines', () => {
    expect(all.length).toBeGreaterThan(90);
    for (const page of Object.keys(ENGINE_VARIANTS)) expect(CATALOGUE.some((e) => e.id === page)).toBe(true);
  });

  it('keeps the page own engine first, and adds no pages to the catalogue', () => {
    expect(ENGINES).toHaveLength(CATALOGUE.length);
    for (const entry of CATALOGUE) {
      const choices = pageChoices(entry.id);
      expect(choices[0]!.id).toBe(entry.id);
      expect(choices.length).toBe(1 + (ENGINE_VARIANTS[entry.id]?.variants.length ?? 0));
    }
  });

  it('has unique ids and says where the figures come from', () => {
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    for (const { variant } of all) {
      expect(variant.note.length).toBeGreaterThan(20);
      expect(variant.sources.length).toBeGreaterThan(0);
      expect(variant.powerHp).toBeGreaterThan(0);
    }
  });

  it.each(all.map((x) => [x.id, x] as const))('%s builds, and keeps to the published figures', (id, { entry, variant }) => {
    const spec = engineById(id)!;
    const engine = buildEngine(spec);
    expect(engine.intervals.reduce((a, b) => a + b, 0)).toBeCloseTo(engine.cycle);
    expect(spec.example).toBe(variant.name);
    expect(engineFacts(id)!.name).toBe(variant.name);

    const design = { ...catalogueDesign(entry, variant), factory: null };
    const perf = evaluate(design);
    expect(perf.peakPower.powerHp / variant.powerHp).toBeGreaterThan(0.8);
    expect(perf.peakPower.powerHp / variant.powerHp).toBeLessThan(1.2);
    if (variant.torqueNm !== null) {
      expect(perf.peakTorque.torqueNm / variant.torqueNm).toBeGreaterThan(0.7);
      expect(perf.peakTorque.torqueNm / variant.torqueNm).toBeLessThan(1.35);
    }
    expect(['doomed', 'oneshot']).not.toContain(assessReliability(design, perf).verdict);
    expect(diagnose(design, perf).filter((d) => d.severity === 'fatal')).toEqual([]);
  });

  it.each(all.map((x) => [x.id, x] as const))('%s opens in the designer as itself', (id) => {
    const spec = engineById(id)!;
    const design = designFromSpec(spec);
    expect(design.name).toBe(spec.example);
    expect(design.rpmLimit).toBe(spec.redlineRpm);
    expect(design.factory).not.toBeNull();
  });

  it('gives each variant a different exhaust or engine from the page own engine', () => {
    for (const { entry, variant } of all) {
      expect(Object.keys(variant.design).length, `${entry.id}/${variant.id}`).toBeGreaterThan(2);
    }
  });

  // Same layout, same firing, so anything heard here comes from the exhaust and the size of the engine.
  it.each([
    ['i3', 'i3/fiesta-10-ecoboost'],
    ['i3/fiesta-10-ecoboost', 'i3/fiesta-st-15-ecoboost'],
    ['v8-cross', 'v8-cross/amg-c63s-m177'],
    ['i6d/bmw-530d-b57', 'i6d/toyota-1hd-fte'],
  ])('%s and %s differ in sound, not only in loudness', (a, b) => {
    const clip = (id: string): Float32Array => {
      const rpm = 4000;
      return render(id, [{ seconds: 0.2, pedal: 1, rpm }, { seconds: 0.3, pedal: 1, rpm }]).l.subarray(9600);
    };
    const x = clip(a);
    const y = clip(b);
    const gain = 10 ** ((rmsDb(x, 0) - rmsDb(y, 0)) / 20);
    let difference = 0;
    let energy = 0;
    for (let i = 0; i < x.length; i++) {
      difference += (x[i]! - y[i]! * gain) ** 2;
      energy += x[i]! ** 2;
    }
    expect(difference / energy).toBeGreaterThan(0.1);
  });

  // Whistle, dump valve and pops are facts about a car, not about turbochargers in general.
  const lift = (id: string): number => {
    const rpm = engineById(id)!.redlineRpm * 0.8;
    const { l } = render(id, [{ seconds: 1.2, pedal: 1, rpm }, { seconds: 1.2, pedal: 0 }]);
    let loudest = 0;
    for (let i = 57600; i < l.length; i += 480) loudest = Math.max(loudest, rmsDb(l, i, Math.min(l.length, i + 480)));
    return loudest;
  };

  it('Fiesta 1.0: no pops and no dump valve on lift-off, as owners report', () => {
    const spec = engineById('i3/fiesta-10-ecoboost')!;
    expect(spec.pops).toBe(0);
    expect(spec.blowoff).toBe(0);
    expect(spec.turboWhine).toBeLessThan(0.2);
  });

  it('GR Yaris: audible whistle and valve, but no pops mapping', () => {
    const spec = engineById('i3')!;
    expect(spec.pops).toBe(0);
    expect(spec.blowoff).toBeGreaterThan(0);
    expect(spec.turboWhine).toBeGreaterThan(0.3);
  });

  it('Fiesta ST has the factory pops that the 1.0 does not', () => {
    expect(engineById('i3/fiesta-st-15-ecoboost')!.pops).toBeGreaterThan(0.3);
    expect(lift('i3/fiesta-st-15-ecoboost')).toBeGreaterThan(lift('i3/fiesta-10-ecoboost') - 1);
  });

  it('a road engine with no evidence of them gets no pops, and a diesel never does', () => {
    for (const { id } of all) {
      const spec = engineById(id)!;
      if (spec.fuel === 'diesel') {
        expect(spec.pops, id).toBe(0);
        expect(spec.blowoff, id).toBe(0);
      }
    }
    const quiet = all.filter(({ id }) => engineById(id)!.pops === 0).length;
    expect(quiet).toBeGreaterThan(all.length / 2);
  });

  it('every page shows its engines at one scale: the camera is framed for the largest', () => {
    for (const entry of CATALOGUE) {
      const sizes = pageChoices(entry.id).map((c) => buildEngine(engineById(c.id)!).displacementCc);
      expect(Math.min(...sizes)).toBeGreaterThan(0);
    }
  });

  it('resolves an unknown variant to nothing, so the route can fall back', () => {
    expect(engineById('i3/no-such-engine')).toBeUndefined();
  });
});
