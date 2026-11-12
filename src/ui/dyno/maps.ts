// The dyno's torque map for an engine on the page: a catalogue engine or variant brought to its article's figures,
// or the designer's own design as the model gives it.

import { engineFacts } from '../../data/engines.ts';
import type { Design } from '../../designer/design.ts';
import { evaluate, type Performance } from '../../designer/physics.ts';
import { designFromSpec } from '../../designer/presets.ts';
import { torqueMapFor } from '../../designer/torque-map.ts';
import type { EngineSpec } from '../../engine/spec.ts';
import type { EngineTorqueMap } from '../../engine/torque-map.ts';

const cache = new Map<string, EngineTorqueMap>();

/** A catalogue engine, its curve brought to the figures its article quotes. */
export function catalogueTorqueMap(spec: EngineSpec): EngineTorqueMap {
  const cached = cache.get(spec.id);
  if (cached) return cached;
  const design = designFromSpec(spec);
  const facts = engineFacts(spec.id);
  const map = torqueMapFor(design, evaluate(design), facts ? { powerHp: facts.powerHp, powerRpm: facts.powerRpm, torqueNm: facts.torqueNm, torqueRpm: facts.torqueRpm } : null);
  cache.set(spec.id, map);
  return map;
}

/** A design in the designer: the model as it is. */
export const designTorqueMap = (design: Design, perf: Performance): EngineTorqueMap => torqueMapFor(design, perf);
