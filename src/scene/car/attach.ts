// A gearbox bolted to its engine (the whole-car plan, how the car goes together in 3D): the gearbox's bellhousing face
// meets the engine's flywheel plane, the block's back face. Both models keep the crank axis on Z with the engine's
// front at +Z (kinematics.ts and layouts/transaxle.ts), and the gearbox's input shaft is on that axis, so the join is a
// translation alone. The car overview uses it, and so will the gearbox page's view with the engine.

import * as THREE from 'three';
import type { SceneModel } from '../model-types.ts';

/**
 * The gearbox group's matrix in the engine group's frame, from the engine's `flywheel` anchor and the gearbox's
 * `bellhousing` one. The engine shakes its own group, so the caller hangs the gearbox beside it, not inside it.
 */
export function attachGearbox(engine: SceneModel<unknown>, gearbox: SceneModel<unknown>): THREE.Matrix4 {
  const flywheel = engine.anchors?.().flywheel;
  const bellhousing = gearbox.anchors?.().bellhousing;
  if (!flywheel) throw new Error('The engine model has no flywheel anchor');
  if (!bellhousing) throw new Error('The gearbox model has no bellhousing anchor');
  return new THREE.Matrix4().makeTranslation(flywheel.clone().sub(bellhousing));
}
