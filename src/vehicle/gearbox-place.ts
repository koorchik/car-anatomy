// Where a gearbox sits in a car (stage K6a-3d): bolted to the back of the engine's block with its input shaft on the
// crank axis, so the gearbox frame is the engine frame moved along the crank (gearboxes plan, «3D»: the whole car puts
// the gearbox behind the flywheel without any other transformation). From here the halfshafts of a transaxle start:
// DriveCar.diffOutputs holds the left inner joint this gives, and the suspension builds its halfshafts from it.
//
// Gearbox frame (layouts/transaxle.ts): x, y from the input axis as the engine frame's, z in mm behind the case's
// front face. Its bellhousing face, `bellhousing` in that z, meets the block's back face: the end of the crankcase in
// packaging.ts (CRANK_END_BORES past kinematics' zMin), where the flywheel starts. Car frame: front-axle frame, metres.
// This module reads packaging.ts, which brings three.js along, so the audio thread never imports it.

import type { Engine } from '../engine/kinematics.ts';
import { transaxleFrame, type GearboxPoint } from '../drivetrain/layouts/transaxle.ts';
import type { GearboxSpec } from '../drivetrain/spec.ts';
import type { CarRecord, Vec3 } from './car.ts';
import { carToEngine } from './mount.ts';
import { CRANK_END_BORES, crankFrontZMm, engineToCar } from './packaging.ts';

const MM_M = 0.001;

/** The block's back face on the crank axis, engine-frame Z in mm: where a bellhousing bolts on. */
export const blockBackZMm = (engine: Engine): number => engine.zMin - CRANK_END_BORES * engine.spec.bore;

/** Engine-frame Z (mm) of a gearbox z (mm behind its front face) whose bellhousing face is at `bellhousing`. */
const engineZ = (engine: Engine, bellhousing: number, z: number): number => blockBackZMm(engine) - (z - bellhousing);

/** A gearbox-frame point in the car frame. */
export function gearboxToCar(car: CarRecord, engine: Engine, bellhousing: number): (p: GearboxPoint) => Vec3 {
  if (!car.packaging) throw new Error(`${car.id} has no packaging yet`);
  const at = car.packaging.crankFront;
  const front = crankFrontZMm(engine);
  return ([x, y, z]) => {
    const q = engineToCar(car.mount, [x * MM_M, y * MM_M, (engineZ(engine, bellhousing, z) - front) * MM_M]);
    return [q[0] + at[0], q[1] + at[1], q[2] + at[2]];
  };
}

/** A car-frame point in the gearbox frame: the inverse of gearboxToCar. */
export function carToGearbox(car: CarRecord, engine: Engine, bellhousing: number): (p: Vec3) => GearboxPoint {
  if (!car.packaging) throw new Error(`${car.id} has no packaging yet`);
  const at = car.packaging.crankFront;
  const front = crankFrontZMm(engine);
  const v = { x: 0, y: 0, z: 0 };
  return (p) => {
    carToEngine(car.mount, p[0] - at[0], p[1] - at[1], p[2] - at[2], v);
    const zEngine = v.z / MM_M + front;
    return [v.x / MM_M, v.y / MM_M, blockBackZMm(engine) - zEngine + bellhousing];
  };
}

/**
 * The left halfshaft's inner joint of a transaxle in a car: the end of the differential's stub on the car's left
 * (y > 0), as the gearbox's layout places it. DriveCar.diffOutputs stores it; the right joint mirrors it in y, so the
 * right stub reaches across to there (the Civic's intermediate shaft).
 */
export function transaxleDiffOutput(car: CarRecord, engine: Engine, spec: GearboxSpec): Vec3 {
  const frame = transaxleFrame(spec);
  const toCar = gearboxToCar(car, engine, frame.bellhousing);
  const [a, b] = frame.stubs.map(toCar) as [Vec3, Vec3];
  return a[1] >= b[1] ? a : b;
}

/**
 * The stub ends a transaxle's 3D draws in a car: the left inner joint (DriveCar.diffOutputs) and its mirror in y, in
 * the gearbox frame and in the order of transaxleFrame().stubs, for TransaxleModel's `stubs`.
 */
export function transaxleStubs(car: CarRecord, engine: Engine, spec: GearboxSpec, left: Vec3): [GearboxPoint, GearboxPoint] {
  const frame = transaxleFrame(spec);
  const toCar = gearboxToCar(car, engine, frame.bellhousing);
  const toBox = carToGearbox(car, engine, frame.bellhousing);
  const right: Vec3 = [left[0], -left[1], left[2]];
  const leftFirst = toCar(frame.stubs[0])[1] >= toCar(frame.stubs[1])[1];
  return leftFirst ? [toBox(left), toBox(right)] : [toBox(right), toBox(left)];
}
