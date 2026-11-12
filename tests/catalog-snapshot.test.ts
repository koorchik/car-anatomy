import { expect, it } from 'vitest';
import { synthConfig } from '../src/audio/synth.ts';
import { ENGINES } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import type { EngineSpec } from '../src/engine/spec.ts';

/** Everything rendering and sound read, rounded so that it only moves when the engine really changes. */
const round = (value: unknown): unknown => {
  if (typeof value === 'number') {
    const r = Math.round(value * 1e4) / 1e4;
    return r === 0 ? 0 : r;
  }
  if (Array.isArray(value)) return value.map(round);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, round(v)]));
  }
  return value;
};

/** Short fingerprint of a text, so a changed article shows without storing all of it twice. */
const fingerprint = (text: string): string => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(h >>> 0).toString(16)}`;
};

const describeEngine = (spec: EngineSpec): unknown => {
  const e = buildEngine(spec);
  const sound = synthConfig(e);
  return round({
    id: spec.id,
    family: spec.family,
    badge: spec.badge,
    title: spec.title,
    example: spec.example,
    cylinders: spec.cylinders,
    fuel: spec.fuel,
    aspiration: spec.aspiration,
    bore: spec.bore,
    stroke: spec.stroke,
    rodRatio: spec.rodRatio,
    compression: spec.compression,
    firingOrder: spec.firingOrder,
    valvetrain: spec.valvetrain,
    valvesPerCyl: spec.valvesPerCyl,
    coverColor: spec.coverColor,
    blockMaterial: spec.blockMaterial,
    idle: spec.idleRpm,
    redline: spec.redlineRpm,
    revTime: spec.revTimeS,
    rough: spec.rough,
    pops: spec.pops,
    turboWhine: spec.turboWhine,
    turboHp: spec.turboHp,
    blowoff: spec.blowoff,
    exhaust: spec.exhaust,
    timing: spec.timing,
    valves: spec.valves,
    vvt: spec.vvt,
    verifyNote: spec.verifyNote,
    flywheel: spec.tuning?.flywheelKg,
    counterweight: spec.tuning?.counterweightMm,
    article: fingerprint(JSON.stringify(spec.article)),
    engine: { r: e.r, l: e.l, deck: e.deck, cycle: e.cycle, zMin: e.zMin, zMax: e.zMax, cc: e.displacementCc, intervals: e.intervals, cylinders: e.cylinders, banks: e.banks, throws: e.throws, rotary: e.isRotary },
    // The valve gear is spec.vvt itself: stored once, above.
    sound: { ...sound, sim: { ...sound.sim, valves: sound.sim.valves ? 'spec.vvt' : undefined } },
  });
};

// Rendering, sound and the panels all read this data. A difference here means visitors would get another engine.
it.each(ENGINES.map((e) => [e.id, e] as const))('catalogue engine %s has not changed', (_id, spec) => {
  expect(describeEngine(spec)).toMatchSnapshot();
});

it('the catalogue keeps its order', () => {
  expect(ENGINES.map((e) => e.id)).toMatchSnapshot();
});
