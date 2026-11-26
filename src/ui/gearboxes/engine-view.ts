// The view with the engine of the car mode (stage K3b), fetched the first time a visitor turns it on: the engine model
// and its cards are the engine pages' and too heavy for the gearbox page's own chunk.

import type { GearboxFrame } from '../../scene/gearbox/gearbox-model.ts';
import { EngineWithGearbox } from '../../scene/gearbox/engine-with-gearbox.ts';
import type { Engine } from '../../engine/kinematics.ts';
import type { SceneModel } from '../../scene/model-types.ts';
import { PARTS } from '../../scene/parts-info.ts';
import { registerParts } from '../../scene/parts-registry.ts';
import { PistonEngineModel } from '../../scene/piston-engine.ts';

// A click on the engine names its part, as on the engine pages.
registerParts(PARTS);

/** The page's gearbox model with the car's engine in front of it. */
export function withEngine(engine: Engine, gearbox: SceneModel<GearboxFrame>): EngineWithGearbox {
  return new EngineWithGearbox(new PistonEngineModel(engine), gearbox);
}
