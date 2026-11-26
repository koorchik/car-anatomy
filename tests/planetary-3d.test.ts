// The ZF 8HP51 in 3D (stage K11): every planet copy stands where the derivation says it meshes, and keeps standing
// there as the box turns; the closed elements' packs close; the parts have cards; the budget holds.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { PlanetaryTable } from '../src/drivetrain/planetary-table.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';
import { PLANETARY_PARTS } from '../src/scene/gearbox/planetary-parts.ts';
import { PlanetaryModel } from '../src/scene/gearbox/planetary-model.ts';
import { buildRingGeometry } from '../src/scene/gearbox/ring-mesh.ts';

// The cast aluminium's bump map is drawn on a canvas, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const box = buildGearbox(gearboxSpec(gearboxById('automatic')!));
const MM = 0.01;

describe('the planetary model', () => {
  const model = new PlanetaryModel(box);
  const table = new PlanetaryTable(box);

  it('puts every planet copy on its circle round the axis, and keeps it there in every gear', () => {
    for (const name of ['1', '4', 'R', '8']) {
      table.select(name);
      for (let i = 0; i < 5; i++) {
        table.step(0.037, 300);
        model.update(table.frame());
        for (const [member, copies] of Object.entries(box.planets)) {
          const k = Number(member.slice(1));
          const centres = model.planetCentres(k);
          expect(centres).toHaveLength(copies.angles.length);
          const axis = new THREE.Vector3().setFromMatrixPosition(model.mounted.matrixWorld);
          for (const c of centres) expect(Math.hypot(c.x - axis.x, c.y - axis.y) / MM, `${name} ${member}`).toBeCloseTo(copies.radius, 4);
          // Copies stay evenly spaced: neighbours one n-th of a turn apart.
          const angles = centres.map((c) => Math.atan2(c.x - axis.x, c.y - axis.y));
          const step = (2 * Math.PI) / angles.length;
          for (let j = 1; j < angles.length; j++) {
            const d = (((angles[j]! - angles[j - 1]!) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            expect(d, `${name} ${member}`).toBeCloseTo(step, 6);
          }
        }
      }
    }
  });

  it('turns a planet copy by the planet’s own angle: the drawn planet keeps its phase against the sun', () => {
    table.select('1');
    table.step(0.5, 300);
    model.update(table.frame());
    const pose = table.frame();
    const mesh = model.gearMesh('p1') as unknown as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const local = new THREE.Euler().setFromRotationMatrix(m).z;
    const carrier = pose.angles[box.members.indexOf('C1')]!;
    const planet = pose.angles[box.members.indexOf('P1')]!;
    const expected = -(box.planets.P1!.phases.p1![0]! + planet - carrier);
    const diff = Math.atan2(Math.sin(local - expected), Math.cos(local - expected));
    expect(Math.abs(diff)).toBeLessThan(1e-6);
  });

  it('closes the packs of the closed elements and opens the rest', () => {
    table.set(['A', 'C', 'E']);
    for (let i = 0; i < 30; i++) model.update(table.frame());
    expect(model.packOpenness()).toEqual({ A: 0, B: 1, C: 0, D: 1, E: 0 });
  });

  it('gives every part a card and keeps within the budget', () => {
    const keys = new Set<string>();
    model.group.traverse((o) => {
      if (o.userData.part) keys.add(o.userData.part as string);
    });
    for (const key of keys) expect(PLANETARY_PARTS[key], key).toBeDefined();
    for (const key of ['gbx-pl-sun', 'gbx-pl-planet', 'gbx-pl-carrier', 'gbx-pl-ring', 'gbx-pl-brake', 'gbx-pl-clutch', 'gbx-pl-drum', 'gbx-pl-case']) expect(keys.has(key), key).toBe(true);
    model.setView('xray');
    const { draws, triangles } = model.drawStats();
    expect(draws).toBeLessThan(90);
    expect(triangles).toBeLessThan(400_000);
  });

  it('a ring gear rim inside its root circle is refused', () => {
    expect(() => buildRingGeometry({ teeth: 96, module: 1.75, helix: 0, pressureAngle: 20, shift: 0, faceWidth: 20, outerRadius: 80 })).toThrow(/inside the root/);
  });

  it('gives its geometry back on dispose', () => {
    const other = new PlanetaryModel(box, { quality: 'low' });
    expect(() => other.dispose()).not.toThrow();
  });
});
