// The layers as the scene draws them, without WebGL: few draw calls, every part explainable, and each pipe picked
// as itself through the merged geometry.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ENGINES, engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import type { EngineModel } from '../src/scene/model-types.ts';
import { PARTS } from '../src/scene/parts-info.ts';
import { PistonEngineModel } from '../src/scene/piston-engine.ts';
import { RotaryEngineModel } from '../src/scene/rotary-engine.ts';
import { fitBox, partKeyOf } from '../src/scene/stage.ts';
import { LAYER_IDS, layerPlan, SystemsLayers, type LayerId } from '../src/scene/systems/index.ts';
import { pointAlong, tightPath } from '../src/scene/systems/route.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const modelOf = (id: string): { model: EngineModel; engine: ReturnType<typeof buildEngine> } => {
  const engine = buildEngine(engineById(id)!);
  const model = engine.isRotary ? new RotaryEngineModel(engine) : new PistonEngineModel(engine);
  return { model, engine };
};

/** Objects of a layer that cost a draw call. */
const drawn = (roots: THREE.Object3D[]): THREE.Object3D[] => {
  const out: THREE.Object3D[] = [];
  for (const root of roots) root.traverse((o) => ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints ? out.push(o) : undefined));
  return out;
};

const layerObjects = (_model: EngineModel, layers: SystemsLayers, id: LayerId): THREE.Object3D[] => layers.layer(id)?.roots ?? [];

describe.each(ENGINES.map((e) => e.id))('layers of %s', (id) => {
  it('cost at most 8 draw calls each, and every part has its card', () => {
    const { model, engine } = modelOf(id);
    const layers = new SystemsLayers(engine, model);
    for (const layer of LAYER_IDS) {
      layers.set(layer, true);
      if (!layers.layer(layer)) continue;
      const objects = drawn(layerObjects(model, layers, layer));
      expect(objects.length, `${id} ${layer}`).toBeLessThanOrEqual(8);
      for (const o of objects) {
        // Spark and glow points are light, not parts: clicks pass through them.
        if ((o as THREE.Points).isPoints) continue;
        const keys = [o.userData.part, ...((o.userData.partOf as string[] | undefined) ?? []), ...((o.userData.instanceParts as string[] | undefined) ?? [])].filter(Boolean) as string[];
        expect(keys.length, `${id} ${layer} unnamed mesh`).toBeGreaterThan(0);
        for (const key of keys) expect(PARTS[key], key).toBeDefined();
      }
    }
    layers.dispose();
  });
});

describe('picking a pipe', () => {
  it.each(['v8-cross', 'i4d', 'b4', 'r2', 'w16'])('returns the pipe under the pointer in %s', (id) => {
    const { model, engine } = modelOf(id);
    const layers = new SystemsLayers(engine, model);
    layers.set('oil', true);
    const anchors = model.systemsAnchors!();
    const plan = layerPlan('oil', engine, anchors)!;
    model.group.updateMatrixWorld(true);
    const layer = layers.layer('oil')!;
    const raycaster = new THREE.Raycaster();
    let checked = 0;
    for (const route of plan.routes) {
      if ((route.space ?? 'mounted') !== 'mounted') continue;
      const path = tightPath(route.points);
      const mid = pointAlong(path, 0.5);
      const ahead = pointAlong(path, 0.52).sub(pointAlong(path, 0.48));
      if (ahead.lengthSq() < 1e-10) continue;
      const side = new THREE.Vector3(0, 1, 0).cross(ahead).normalize();
      if (side.lengthSq() < 0.5) side.set(1, 0, 0);
      // From just outside the pipe wall, straight at its axis.
      const origin = mid.clone().addScaledVector(side, route.radius * 2.5).applyMatrix4(model.mounted.matrixWorld);
      const target = mid.clone().applyMatrix4(model.mounted.matrixWorld);
      raycaster.set(origin, target.sub(origin).normalize());
      raycaster.far = route.radius * 6;
      const hits = raycaster.intersectObject(layer.root, true);
      if (!hits.length) continue;
      // Another pipe or a part may sit in front, but the merged mesh must still name this one where it is hit.
      expect(hits.map(partKeyOf), `${id} ${route.part} ${route.channel}`).toContain(route.part);
      checked++;
    }
    expect(checked).toBeGreaterThan(plan.routes.length / 2);
    layers.dispose();
  });
});

describe('the oil layer in the scene', () => {
  it('turns its crank drillings with the crank and draws them over everything', () => {
    const { model, engine } = modelOf('i4');
    const layers = new SystemsLayers(engine, model);
    layers.set('oil', true);
    const crank = (model.systemsAnchors!() as { crank: THREE.Object3D }).crank;
    const overlay = crank.children.find((c) => c.userData.overlay);
    expect(overlay).toBeDefined();
    expect(((overlay as THREE.Mesh).material as THREE.Material).depthTest).toBe(false);
  });

  it('hides outside the X-ray and on a pulled-apart engine, shaft parts included', () => {
    const { model, engine } = modelOf('i4');
    const layers = new SystemsLayers(engine, model);
    layers.set('oil', true);
    const crank = (model.systemsAnchors!() as { crank: THREE.Object3D }).crank;
    const onCrank = crank.children.filter((c) => c.userData.noFit);
    expect(layers.layer('oil')!.root.visible).toBe(true);
    layers.setView('solid');
    expect(layers.layer('oil')!.root.visible).toBe(false);
    expect(onCrank.every((c) => !c.visible)).toBe(true);
    layers.setView('xray');
    layers.setExplode(0.5);
    expect(layers.layer('oil')!.root.visible).toBe(false);
    layers.setExplode(0);
    expect(onCrank.every((c) => c.visible)).toBe(true);
  });

  it('is built only when first switched on in the X-ray', () => {
    const { model, engine } = modelOf('v12');
    const layers = new SystemsLayers(engine, model);
    layers.setView('solid');
    layers.set('oil', true);
    expect(layers.layer('oil')).toBeNull();
    layers.setView('xray');
    expect(layers.layer('oil')).not.toBeNull();
  });

  it('leaves the camera framing alone', () => {
    for (const id of ['i6', 'r2']) {
      const { model, engine } = modelOf(id);
      model.group.updateMatrixWorld(true);
      const before = fitBox(model.group);
      const layers = new SystemsLayers(engine, model);
      for (const l of LAYER_IDS) layers.set(l, true);
      model.group.updateMatrixWorld(true);
      const after = fitBox(model.group);
      expect(after.min.distanceTo(before.min)).toBeLessThan(1e-9);
      expect(after.max.distanceTo(before.max)).toBeLessThan(1e-9);
    }
  });

  it('turns the intake to glass only while the air or fuel layer shows', () => {
    const { model, engine } = modelOf('v8-cross');
    const layers = new SystemsLayers(engine, model);
    const intake = (): THREE.Material[] => {
      const found: THREE.Material[] = [];
      model.group.traverse((o) => (o.userData.part === 'intake' ? found.push((o as THREE.Mesh).material as THREE.Material) : undefined));
      return found;
    };
    layers.set('oil', true);
    expect(intake().every((m) => !m.transparent)).toBe(true);
  });
});
