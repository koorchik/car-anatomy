// The suspensions section at its hidden address (stage P1b): the address opens it, and the corner on its rig holds the
// car with its spring and never stretches a link anywhere the travel slider can put it.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { factorySetup, resolveCorner } from '../src/suspension/setup.ts';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import { G } from '../src/suspension/forces.ts';
import { parseRoute } from '../src/shell/routes.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const { CornerModel, cornerFrame } = await import('../src/scene/suspension/corner-model.ts');
const { rigFrame, rigTravelRange } = await import('../src/scene/suspension/rig-frame.ts');

const corner = jtektCorner();
const resolved = resolveCorner(corner, factorySetup(corner));

describe('the hidden address', () => {
  it('belongs to the suspensions section, whatever follows it', async () => {
    const { sectionEntry } = await import('../src/shell/registry.ts');
    for (const hash of ['#/suspensions', '#/suspensions/macpherson', '#/suspensions?s=bump']) {
      expect(sectionEntry(parseRoute(hash)).id, hash).toBe('suspensions');
    }
    expect(sectionEntry(parseRoute('#/engines/v8-cross')).id).toBe('engines');
  });
});

describe('the corner on its rig', () => {
  it('lets the slider reach exactly the travel the corner has, end stop to end stop', () => {
    const range = rigTravelRange(resolved);
    const table = resolved.axle.table;
    expect(range.min).toBeCloseTo(table.travel0, 9);
    expect(range.max).toBeCloseTo(table.travel0 + (table.n - 1) * table.step, 9);
  });

  it('holds the car at rest with the spring alone, and the tyre carries the whole corner', () => {
    const frame = rigFrame(resolved, resolved.staticTravelM, cornerFrame());
    expect(frame.stopN).toBe(0);
    expect(frame.damperN).toBe(0);
    const atWheel = frame.springN * resolved.axle.value('mrSpring', resolved.staticTravelM);
    expect(atWheel / (resolved.sprungKg * G)).toBeCloseTo(1, 2);
    expect(frame.tyreN / ((resolved.sprungKg + resolved.unsprungKg) * G)).toBeCloseTo(1, 2);
  });

  it('presses the bump stop only at the top of the travel, and harder the further it goes', () => {
    const range = rigTravelRange(resolved);
    expect(rigFrame(resolved, 0, cornerFrame()).stopN).toBe(0);
    const near = rigFrame(resolved, range.max - 0.01, cornerFrame()).stopN;
    const full = rigFrame(resolved, range.max, cornerFrame()).stopN;
    expect(full).toBeGreaterThan(near);
    expect(full).toBeGreaterThan(0);
  });

  it('never stretches a link at any millimetre of the slider', () => {
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const range = rigTravelRange(resolved);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    // Each link's length as drawn at design, scene units.
    const lengths = new Map<string, number>();
    const measure = (): Map<string, number> => {
      model.group.updateMatrixWorld(true);
      const out = new Map<string, number>();
      for (const link of model.links) {
        a.copy(link.bodyEnd).applyMatrix4(link.object.matrixWorld);
        b.copy(link.knuckleEnd).applyMatrix4(link.object.matrixWorld);
        out.set(link.name, a.distanceTo(b));
      }
      return out;
    };
    model.update(rigFrame(resolved, 0, frame));
    for (const [name, length] of measure()) lengths.set(name, length);
    expect(lengths.size).toBeGreaterThanOrEqual(3);
    let checked = 0;
    for (let mm = Math.ceil(range.min * 1000); mm <= Math.floor(range.max * 1000); mm++) {
      model.update(rigFrame(resolved, mm / 1000, frame));
      for (const [name, length] of measure()) {
        expect(Math.abs(length - lengths.get(name)!), `${name} at ${mm} mm`).toBeLessThan(1e-5);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
    model.dispose();
  });
});

describe('the lasers', () => {
  it('show the static camber and toe of the setup, and follow a change of it at once', () => {
    const DEG = Math.PI / 180;
    const angles = (setup: Partial<ReturnType<typeof factorySetup>>): { camber: number; toe: number } => {
      const rc = resolveCorner(corner, { ...factorySetup(corner), ...setup });
      const model = new CornerModel(rc);
      model.update(rigFrame(rc, rc.staticTravelM, cornerFrame()));
      const p = (model.laser as unknown as { positions: Float32Array }).positions;
      const at = (p.length / 3 - 4) * 3;
      // The toe laser's second line, from behind the patch to ahead of it, in the road's plane (scene x across, z ahead).
      const dx = p[at + 9]! - p[at + 6]!;
      const dz = p[at + 11]! - p[at + 8]!;
      const plumb = [p[3]! - p[0]!, p[4]! - p[1]!, p[5]! - p[2]!];
      const laser = [p[9]! - p[6]!, p[10]! - p[7]!, p[11]! - p[8]!];
      const cos = (plumb[0]! * laser[0]! + plumb[1]! * laser[1]! + plumb[2]! * laser[2]!) / (Math.hypot(...plumb) * Math.hypot(...laser));
      model.dispose();
      // Toe-in turns the front of the left wheel inboard, to −x.
      return { camber: Math.acos(Math.min(1, cos)) / DEG, toe: Math.atan2(-dx, dz) / DEG };
    };
    const set = angles({ camberDeg: -2, toeDeg: 0.4 });
    expect(set.camber).toBeCloseTo(2, 2);
    expect(set.toe).toBeCloseTo(0.4, 2);
    const other = angles({ camberDeg: -0.5, toeDeg: -0.2 });
    expect(other.camber).toBeCloseTo(0.5, 2);
    expect(other.toe).toBeCloseTo(-0.2, 2);
  });
});
