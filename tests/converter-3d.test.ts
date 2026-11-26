// The torque converter in 3D (stage K12a): in front of the 8HP51's case on its axis, each wheel turned by its own
// angle, the vortex in the X-ray only while the oil circulates, the cover as glass, cards for its parts, the budget
// of the heaviest gearbox model with the converter (gearbox plan: 400 thousand triangles, 150 draws).

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { PlanetaryTable } from '../src/drivetrain/planetary-table.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';
import { PLANETARY_PARTS } from '../src/scene/gearbox/planetary-parts.ts';
import { PlanetaryModel } from '../src/scene/gearbox/planetary-model.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const box = buildGearbox(gearboxSpec(gearboxById('automatic')!));

describe('the converter model', () => {
  const model = new PlanetaryModel(box, { converter: true });
  const view = model.converter!;
  const table = new PlanetaryTable(box);
  table.select('1');

  it('stands in front of the case, on the axis', () => {
    model.group.updateMatrixWorld(true);
    const converter = new THREE.Box3().setFromObject(view.group);
    const sets = new THREE.Box3();
    model.mounted.children.filter((c) => c !== view.group).forEach((c) => sets.expandByObject(c));
    expect(converter.min.z).toBeGreaterThan(sets.min.z);
    expect(converter.max.z).toBeGreaterThan(sets.max.z - 1e-6);
    expect(Math.abs((converter.min.x + converter.max.x) / 2 - (sets.min.x + sets.max.x) / 2)).toBeLessThan(0.02);
  });

  it('turns the pump, the turbine and the stator by their own angles', () => {
    model.update({ ...table.frame(), converter: { pump: 1, turbine: 0.4, stator: 0.1, flow: 0.3, strength: 1 } });
    expect(view.pump.rotation.z).toBeCloseTo(-1, 9);
    expect(view.turbine.rotation.z).toBeCloseTo(-0.4, 9);
    expect(view.stator.rotation.z).toBeCloseTo(-0.1, 9);
    expect(view.vortex.visible).toBe(true);
  });

  it('shows no vortex when the oil does not circulate, and turns as one with the input without a frame of its own', () => {
    model.update({ ...table.frame(), converter: { pump: 1, turbine: 1, stator: 1, flow: 0, strength: 0 } });
    expect(view.vortex.visible).toBe(false);
    table.step(0.1, 600);
    model.update(table.frame());
    const input = table.frame().angles[box.members.indexOf(box.spec.input)]!;
    const wrapped = input - Math.floor(input / (2 * Math.PI)) * 2 * Math.PI;
    expect(view.pump.rotation.z).toBeCloseTo(-wrapped, 9);
    expect(view.turbine.rotation.z).toBeCloseTo(-wrapped, 9);
  });

  it('makes the cover glass in the X-ray and hides it in the mechanism view', () => {
    model.setView('xray');
    expect((view.cover.material as THREE.Material).transparent).toBe(true);
    model.setView('mechanism');
    expect(view.cover.visible).toBe(false);
    model.setView('solid');
    expect(view.cover.visible).toBe(true);
    expect((view.cover.material as THREE.Material).transparent).toBe(false);
  });

  it('gives its parts cards and keeps within the budget', () => {
    const keys = new Set<string>();
    view.group.traverse((o) => {
      if (o.userData.part) keys.add(o.userData.part as string);
    });
    for (const key of ['gbx-impeller', 'gbx-turbine', 'gbx-stator', 'gbx-lockup']) {
      expect(keys.has(key), key).toBe(true);
      expect(PLANETARY_PARTS[key], key).toBeDefined();
    }
    model.setView('xray');
    model.update({ ...table.frame(), converter: { pump: 1, turbine: 0.4, stator: 0, flow: 0.3, strength: 1 } });
    const { draws, triangles } = model.drawStats();
    expect(draws).toBeLessThan(150);
    expect(triangles).toBeLessThan(400_000);
  });

  it('gives its geometry back on dispose', () => {
    const other = new PlanetaryModel(box, { quality: 'low', converter: true });
    expect(() => other.dispose()).not.toThrow();
    model.dispose();
  });
});
