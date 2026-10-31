import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RotaryEngineModel, flankPoint, housingPoint } from '../src/scene/rotary-engine.ts';
import { engineById } from '../src/data/engines.ts';
import { buildEngine, cyclePhase, strokeAt } from '../src/engine/kinematics.ts';

const R = 105;
const e = 15;

const rotorPoint = (own: number, face: number, t: number): [number, number] => {
  const [fx, fy] = flankPoint(face, t, R * 0.995);
  const rot = (-own / 3) * (Math.PI / 180);
  const a = own * (Math.PI / 180);
  return [fx * Math.cos(rot) - fy * Math.sin(rot) + e * Math.sin(a), fx * Math.sin(rot) + fy * Math.cos(rot) + e * Math.cos(a)];
};

/** Signed distance from a point to the inside of the trochoid, positive when inside. Sampled. */
const housing = Array.from({ length: 720 }, (_, i) => housingPoint(i / 2, R, e));
const inside = (x: number, y: number): boolean => {
  let hit = false;
  for (let i = 0, j = housing.length - 1; i < housing.length; j = i++) {
    const [xi, yi] = housing[i]!;
    const [xj, yj] = housing[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

describe('Wankel geometry', () => {
  it('rotor stays inside the housing for a full rotor turn', () => {
    for (let own = 0; own < 1080; own += 3) {
      for (let face = 0; face < 3; face++) {
        for (let t = 0.02; t < 1; t += 0.06) {
          const [x, y] = rotorPoint(own, face, t);
          expect(inside(x, y)).toBe(true);
        }
      }
    }
  });

  it('apexes run on the housing surface', () => {
    for (let own = 0; own < 1080; own += 7) {
      const psi = own / 3;
      const [hx, hy] = housingPoint(psi, R, e);
      const [x, y] = rotorPoint(own, 0, 0);
      expect(Math.hypot(hx - x, hy - y)).toBeLessThan(R * 0.01);
    }
  });

  it('chamber is smallest on the plug side at ignition', () => {
    // Own angle for the chamber on flank 0 at TDC: its middle points along +X, the short axis.
    const own = 90;
    const [mx] = rotorPoint(own, 0, 0.5);
    const [hx] = housingPoint(own / 3 + 60, R, e);
    expect(hx - mx).toBeGreaterThan(0);
    expect(hx - mx).toBeLessThan(R * 0.2);
    expect(mx).toBeGreaterThan(R * 0.6);
  });

  it('each chamber goes through its four strokes in order over three shaft turns', () => {
    const eng = buildEngine(engineById('r2')!);
    const c = eng.cylinders[0]!;
    const strokes = [0, 270, 540, 810].map((d) => strokeAt(cyclePhase(eng, c, c.fire + d + 1)));
    expect(strokes).toEqual(['power', 'exhaust', 'intake', 'compression']);
  });

  it('a rotor fires once per shaft turn', () => {
    const eng = buildEngine(engineById('r2')!);
    expect(eng.cylinders.length).toBe(6);
    expect(eng.intervals.every((v) => v === 180)).toBe(true);
    expect(buildEngine(engineById('r4')!).intervals.every((v) => v === 90)).toBe(true);
  });
});

describe('a broken rotary shows what broke', () => {
  // The model only draws its spark sprites on a canvas, which nothing here looks at.
  const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

  const glowing = (model: RotaryEngineModel): Set<string> => {
    const keys = new Set<string>();
    model.group.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material?.emissive && material.emissive.getHexString() === 'ff2a10') keys.add(object.userData.part);
    });
    return keys;
  };

  it.each([
    ['rotor', 'rotor'],
    ['piston', 'rotor'],
    ['exhaust', 'header'],
    ['turbo', 'header'],
  ])('%s lights up the %s', (part, key) => {
    const model = new RotaryEngineModel(buildEngine(engineById('r2')!));
    model.setFailure(part);
    expect([...glowing(model)]).toEqual([key]);
    model.setFailure(null);
    expect([...glowing(model)]).toEqual([]);
  });
});
