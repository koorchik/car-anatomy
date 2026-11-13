// The engine box packaging.ts fits into a car's bay against what the 3D model actually draws, so that a bonnet built
// from the bay never cuts the engine the overview shows. The box copies the model's proportions; this test is what
// keeps the two from drifting apart.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CAR_LIST } from '../src/data/cars.ts';
import { ENGINES, engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { MM } from '../src/scene/geometry.ts';
import { PistonEngineModel } from '../src/scene/piston-engine.ts';
import { crankFrontZMm, engineCoreBox } from '../src/vehicle/packaging.ts';

// The model only draws its glow and spark sprites on a canvas, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

/** The core's parts: crank with pulley and flywheel, timing cover, block, heads, cam covers, coil packs and pan. */
const CORE = new Set(['crank', 'pulley', 'flywheel', 'chain', 'block', 'head', 'cover', 'coil', 'cam', 'sump']);
/** Extrusions carry a bevel of up to 2 mm beyond their outline (geometry.ts), which the box leaves out. */
const BEVEL_M = 0.005;
/** Metres per scene unit (MM is scene units per millimetre). */
const M_PER_UNIT = 1 / (MM * 1000);

const ids = [...new Set([...ENGINES.map((e) => e.id), ...CAR_LIST.filter((c) => c.packaging).map((c) => c.engine)])].filter(
  (id) => !buildEngine(engineById(id)!).isRotary,
);

describe.each(ids)('%s', (id) => {
  it('draws every part of its core inside the box the bay check uses', () => {
    const engine = buildEngine(engineById(id)!);
    const model = new PistonEngineModel(engine);
    model.group.updateMatrixWorld(true);
    // The model sits on the floor; the mounted group's offset takes it back to the engine frame (scene units).
    const offset = model.mounted.position.clone().negate();
    const drawn = new THREE.Box3();
    let parts = 0;
    model.mounted.traverse((o) => {
      const key = o.userData.part as string | undefined;
      if (!(o as THREE.Mesh).isMesh || !key || !CORE.has(key)) return;
      // The oil filter on the crankcase's side is a bolt-on part, though tagged as the block for its card.
      if (key === 'block' && (o as THREE.Mesh).geometry instanceof THREE.CylinderGeometry) return;
      drawn.union(new THREE.Box3().setFromObject(o).translate(offset));
      parts++;
    });
    expect(parts).toBeGreaterThan(5);
    const box = engineCoreBox(engine);
    const front = crankFrontZMm(engine) / 1000;
    const lo = [drawn.min.x * M_PER_UNIT, drawn.min.y * M_PER_UNIT, drawn.min.z * M_PER_UNIT - front];
    const hi = [drawn.max.x * M_PER_UNIT, drawn.max.y * M_PER_UNIT, drawn.max.z * M_PER_UNIT - front];
    for (let k = 0; k < 3; k++) {
      expect(lo[k]!, `min ${'xyz'[k]}`).toBeGreaterThanOrEqual(box.min[k]! - BEVEL_M);
      expect(hi[k]!, `max ${'xyz'[k]}`).toBeLessThanOrEqual(box.max[k]! + BEVEL_M);
    }
    // The pulley's face is the crank's front end: nothing of the core reaches further forward.
    expect(hi[2]!).toBeGreaterThan(-BEVEL_M);
  });
});
