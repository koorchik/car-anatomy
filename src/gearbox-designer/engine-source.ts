// The engine a gearbox design drives with (gearbox plan, stage 10: the engine designer's design as the car's engine).
// `GearboxDesign.engine` is a catalogue engine's id (page or page/variant), or `design:<code>` for an engine built in
// the engine designer, its code the engine designer's link code (src/designer/codec.ts). Everything that needs the
// engine's spec, torque map or name asks here, so both kinds go the same way: the model (vehicle.ts), the limits
// (constraints.ts), the list of engines (controls.ts) and the page's sound.
//
// No DOM.

import { engineById, pageChoices } from '../data/engines.ts';
import { decodeDesign, encodeDesign } from '../designer/codec.ts';
import type { Design } from '../designer/design.ts';
import { evaluate } from '../designer/physics.ts';
import { designToSpec } from '../designer/to-spec.ts';
import { catalogueTorqueMap, torqueMapFor } from '../designer/torque-map.ts';
import type { EngineSpec } from '../engine/spec.ts';
import type { EngineTorqueMap } from '../engine/torque-map.ts';
import { t } from '../i18n/t.ts';

export const DESIGN_ENGINE = 'design:';

export interface EngineSource {
  spec: EngineSpec;
  map: EngineTorqueMap;
  name: string;
  /** Built in the engine designer, not taken from the catalogue. */
  own: boolean;
}

const cache = new Map<string, EngineSource | null>();

/** The engine id of an engine designer's design. */
export const designEngineId = (d: Design): string => `${DESIGN_ENGINE}${encodeDesign(d)}`;

/** The engine behind an id, or null for an id nobody knows (a broken link). Cached: an own engine runs its model once. */
export function engineSource(id: string): EngineSource | null {
  if (cache.has(id)) return cache.get(id)!;
  let source: EngineSource | null = null;
  if (id.startsWith(DESIGN_ENGINE)) {
    const design = decodeDesign(id.slice(DESIGN_ENGINE.length));
    if (design) {
      // A factory copy of the catalogue runs on its own calibration (the dyno's torqueMapFor does the same).
      const perf = evaluate(design);
      source = { spec: designToSpec(design, perf), map: torqueMapFor(design, perf), name: design.name || t('Двигун з конструктора'), own: true };
    }
  } else {
    const spec = engineById(id);
    if (spec) source = { spec, map: catalogueTorqueMap(spec), name: pageChoices(id).find((c) => c.id === id)?.name ?? spec.title, own: false };
  }
  if (cache.size > 32) cache.clear();
  cache.set(id, source);
  return source;
}
