// The oil-on-track page's 3D without WebGL: the oil stays in the pan, each sump kind brings its own parts, the budget
// of draw calls holds and every part explains itself.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { engineById } from '../src/data/engines.ts';
import { SUMP_CARS } from '../src/data/sump-cars.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { systemsOf, type SumpKind } from '../src/engine/systems-spec.ts';
import { lubeSetup } from '../src/lubrication/setup.ts';
import { panGrid, volumeUnder } from '../src/lubrication/pan.ts';
import { PARTS } from '../src/scene/parts-info.ts';
import { SumpScene, type SumpSceneFrame } from '../src/scene/lubrication/sump-scene.ts';
import { partKeyOf } from '../src/scene/stage.ts';
import { panShape } from '../src/systems/sump.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const sceneFor = (id: string, kind: SumpKind, accumulator = false) => {
  const car = SUMP_CARS.find((c) => c.engineId === id)!;
  const engine = buildEngine(engineById(id)!);
  const systems = { ...systemsOf(engine.spec), sump: kind };
  const setup = lubeSetup(engine, systems, car.vehicle.mount, { oilDeltaL: 0, accumulator });
  const scene = new SumpScene(engine, systems, car.vehicle.mount, { accumulator, heads: setup.heads.map((h) => h.alpha), inlet: { y: setup.tube.inletY, z: engine.zMax * 0.01 } });
  return { scene, setup };
};

const frame = (over: Partial<SumpSceneFrame>, levelOut: number): SumpSceneFrame => ({ levelOut, levelBox: levelOut, slopeX: 0, slopeZ: 0, pickupOil: 1, pumpSupply: 1, boxFlow: 0, heads: [0.5, 0.5], tankShare: 0.6, accumulatorShare: 0.7, dt: 0.016, tubeSpeed: 1, ...over });

describe('the sump on the page', () => {
  it('keeps the oil inside the pan and between floor and ceiling, however it tilts', () => {
    for (const kind of ['wet', 'baffled'] as const) {
      const { scene } = sceneFor('v8-cross/camaro-ss-lt1', kind);
      const s = scene.shape;
      for (const [sx, sz] of [[0, 0], [1, 0], [0, -1.3], [0.7, 0.7]] as const) {
        scene.update(frame({ slopeX: sx, slopeZ: sz }, s.yFull));
        const pos = scene.oilBody.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(s.halfW + 1e-6);
          expect(pos.getZ(i)).toBeGreaterThanOrEqual(s.zMin - 1e-6);
          expect(pos.getZ(i)).toBeLessThanOrEqual(s.zMax + 1e-6);
          expect(pos.getY(i)).toBeGreaterThanOrEqual(s.yFloor - 1e-6);
          expect(pos.getY(i)).toBeLessThanOrEqual(s.top + 1e-6);
        }
      }
      scene.dispose();
    }
  });

  it('has four trap doors only in a track pan, a sight glass only on a dry sump and an accumulator only when fitted', () => {
    const doors = (kind: SumpKind) => sceneFor('v8-cross/camaro-ss-lt1', kind).scene.doors?.count ?? 0;
    expect(doors('wet')).toBe(0);
    expect(doors('baffled')).toBe(4);
    expect(doors('integrated-dry')).toBe(4);
    expect(doors('dry')).toBe(0);
    expect(sceneFor('b6', 'dry').scene.sightOil).not.toBeNull();
    expect(sceneFor('v8-cross/camaro-ss-lt1', 'wet').scene.sightOil).toBeNull();
    expect(sceneFor('v8-cross/camaro-ss-lt1', 'wet', true).scene.accumulatorOil).not.toBeNull();
    expect(sceneFor('v8-cross/camaro-ss-lt1', 'wet').scene.accumulatorOil).toBeNull();
  });

  it('makes the well hold a full engine’s oil below the full mark, and a dry sump’s pan shallow', () => {
    for (const car of SUMP_CARS) {
      const engine = buildEngine(engineById(car.engineId)!);
      const systems = systemsOf(engine.spec);
      const wet = panShape(engine, { ...systems, sump: 'wet' });
      const grid = panGrid(wet);
      const held = volumeUnder(grid.all, wet.yFull, 0, 0);
      // The well can't be shallower than 0.6 of a bore, so a small capacity leaves the level a little lower.
      expect(held / wet.panOilL).toBeGreaterThan(0.99);
      const dry = panShape(engine, { ...systems, sump: 'dry' });
      expect(dry.yFull - dry.yFloor).toBeLessThan(0.35);
      expect(dry.crankHeightMm).toBeLessThan(wet.crankHeightMm - 40);
    }
  });

  it('costs at most eight draw calls', () => {
    for (const kind of ['wet', 'baffled', 'integrated-dry', 'dry'] as const) {
      for (const acc of [false, true]) {
        const { scene } = sceneFor('v8-cross/camaro-ss-lt1', kind, acc);
        expect(scene.drawn.length, `${kind} ${acc}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('explains every part it draws', () => {
    for (const kind of ['wet', 'baffled', 'integrated-dry', 'dry'] as const) {
      const { scene } = sceneFor('b6/porsche-cayman-981-3-4', kind, kind !== 'dry');
      const ray = new THREE.Raycaster();
      for (const o of scene.drawn) {
        const keys = [o.userData.part, ...(o.userData.partOf ?? []), ...(o.userData.instanceParts ?? [])].filter(Boolean) as string[];
        expect(keys.length, o.type).toBeGreaterThan(0);
        for (const key of keys) expect(PARTS[key], key).toBeDefined();
      }
      void ray;
      void partKeyOf;
    }
  });
});
