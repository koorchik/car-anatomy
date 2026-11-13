import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { restingState, type ValveState } from '../src/engine/valve-control.ts';
import { MM } from '../src/scene/geometry.ts';
import { PistonEngineModel } from '../src/scene/piston-engine.ts';

// The model only draws its glow and spark sprites on a canvas, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

/** Longest travel of each instance of a mesh over two crank turns, scene units. */
function travel(model: PistonEngineModel, mesh: THREE.InstancedMesh, valves: ValveState): number[] {
  const seen: THREE.Vector3[][] = Array.from({ length: mesh.count }, () => []);
  const m = new THREE.Matrix4();
  for (let theta = 0; theta < 720; theta += 2) {
    model.update({ theta, rpm: 3000, load: 0.5, fuelCut: false, running: true, boost: 0, dt: 1, shake: 0, valves });
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      seen[i]!.push(new THREE.Vector3().setFromMatrixPosition(m));
    }
  }
  // Every position lies on the valve's axis: the end farthest from any point is one end of the stroke.
  const farthest = (list: THREE.Vector3[], from: THREE.Vector3): THREE.Vector3 => list.reduce((a, b) => (b.distanceTo(from) > a.distanceTo(from) ? b : a));
  return seen.map((list) => {
    const end = farthest(list, list[0]!);
    return farthest(list, end).distanceTo(end);
  });
}

describe('the valves in 3D', () => {
  it.each(['i4', 'b6/porsche-cayman-981-3-4', 'i5', 'i6/toyota-supra-b58'])('%s: no valve or follower travels further than its cam lifts it', (id) => {
    const spec = engineById(id)!;
    const model = new PistonEngineModel(buildEngine(spec));
    const inner = model as unknown as { valveMeshIn: THREE.InstancedMesh; valveMeshEx: THREE.InstancedMesh; gear: { padMeshes: THREE.InstancedMesh[] } };
    const full = spec.valves!.lift * MM;
    const sw = spec.vvt!.switching;
    for (const highCam of [false, true]) {
      const state = { ...restingState(), highCam };
      const intake = travel(model, inner.valveMeshIn, state);
      const exhaust = travel(model, inner.valveMeshEx, state);
      for (const x of [...intake, ...exhaust]) expect(x, `${id} high ${highCam}`).toBeLessThanOrEqual(full * 1.001);
      for (const pads of inner.gear.padMeshes) for (const x of travel(model, pads, state)) expect(x, `${id} followers, high ${highCam}`).toBeLessThanOrEqual(full * 1.001);
      if (!sw || highCam) continue;
      // On the low cam the switched valves open by the low cam's share of the main lift.
      const switched = sw.cams === 'exhaust' ? exhaust : intake;
      expect(Math.max(...switched) / full).toBeCloseTo(sw.lowShare, 2);
    }
  });
});
