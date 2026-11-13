import { describe, expect, it } from 'vitest';
import { ALL_GEARBOXES, gearboxById } from '../src/data/gearboxes.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { centreDistance, shiftSumForCentre } from '../src/drivetrain/gear-geometry.ts';
import { analyseState, buildGearbox, stateByName } from '../src/drivetrain/topology.ts';
import type { GearboxSpec } from '../src/drivetrain/spec.ts';

const e30Record = gearboxById('manual-rwd')!;
const e30 = buildGearbox(gearboxSpec(e30Record));
const mz6 = buildGearbox(gearboxSpec(gearboxById('tr6060-mz6')!));
const meshName = (box: typeof e30, j: number) => `${box.meshes[j]!.a}/${box.meshes[j]!.b}`;
const forward = ['1', '2', '3', '4', '5'];

describe('catalogue', () => {
  it.each(ALL_GEARBOXES.map((g) => [g.id, g] as const))('%s builds', (_id, record) => {
    expect(() => buildGearbox(gearboxSpec(record))).not.toThrow();
  });

  it('every drive car names a gearbox that exists', () => {
    for (const car of Object.values(DRIVE_CARS)) expect(gearboxById(car.gearbox), car.car).toBeDefined();
  });
});

describe('ratios from teeth', () => {
  it('BMW M3 E30: the published ratios to the last published digit', () => {
    // Forward ratios are published to three places, reverse to two (auto motor und sport, m3-klassik.de).
    e30Record.published.ratios.forEach((published, k) => {
      expect(Math.abs(stateByName(e30, String(k + 1)).ratio! - published), `gear ${k + 1}`).toBeLessThanOrEqual(0.0005);
    });
    expect(stateByName(e30, '5').ratio).toBeCloseTo(1, 12);
    expect(Math.abs(Math.abs(stateByName(e30, 'R').ratio!) - e30Record.published.reverse!)).toBeLessThanOrEqual(0.005);
  });

  it('TR-6060 MZ6: first gear 2.9655 from the real teeth 29/38 and 19/43', () => {
    const first = stateByName(mz6, '1').ratio!;
    expect(first).toBeCloseTo((38 * 43) / (29 * 19), 12);
    expect(Math.abs(first - 2.9655)).toBeLessThan(5e-5);
    expect(Math.abs(first - 2.966)).toBeLessThanOrEqual(0.0005);
  });
});

describe('state kinds', () => {
  it('neutral leaves the output free, each gear leaves one motion', () => {
    const n = stateByName(e30, 'N');
    expect(n.kind).toBe('neutral');
    expect(n.dof).toBeGreaterThan(1);
    for (const name of [...forward, 'R']) {
      const s = stateByName(e30, name);
      expect(s.kind, name).toBe('gear');
      expect(s.dof, name).toBe(1);
    }
  });

  it('two gears of a manual at once jam it', () => {
    const elements = e30.spec.elements.map((e) => e.id);
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        expect(analyseState(e30, [elements[i]!, elements[j]!]).kind, `${elements[i]}+${elements[j]}`).toBe('locked');
      }
    }
  });

  it('a brake tells which shaft is held', () => {
    const base = gearboxSpec(e30Record);
    const spec: GearboxSpec = {
      ...base,
      elements: [
        ...base.elements,
        { id: 'hold-output', kind: 'brake', a: 'output', b: null },
        { id: 'hold-input', kind: 'brake', a: 'input', b: null },
      ],
    };
    const box = buildGearbox(spec);
    expect(analyseState(box, ['hold-output']).kind).toBe('output-locked');
    expect(analyseState(box, ['hold-input']).kind).toBe('input-locked');
    expect(analyseState(box, ['hold-input', 'sync-1']).kind).toBe('locked');
    expect(analyseState(box, ['hold-output', 'hold-input']).kind).toBe('locked');
  });
});

describe('sign', () => {
  it('forward gears turn the output with the crank, reverse against it', () => {
    for (const name of forward) expect(stateByName(e30, name).ratio!, name).toBeGreaterThan(0);
    expect(stateByName(e30, 'R').ratio!).toBeLessThan(0);
    expect(stateByName(mz6, '1').ratio!).toBeGreaterThan(0);
  });

  it('the countershaft turns against the input, a loose gear in neutral with it', () => {
    const speeds = stateByName(e30, '1').speeds!;
    const at = (m: string) => speeds[e30.members.indexOf(m)]!;
    expect(at('counter')).toBeCloseTo(-23 / 45, 12);
    expect(at('gear-2')).toBeCloseTo((23 / 45) * (35 / 43), 12);
    expect(at('idler')).toBeCloseTo((23 / 45) * (25 / 19), 12);
  });
});

describe('power path', () => {
  it('direct drive loads no mesh', () => {
    const s = stateByName(e30, '5');
    expect(s.loaded).toEqual([]);
    for (const [j, load] of s.meshLoads!.entries()) {
      const teeth = e30.spec.gears.find((g) => g.id === e30.meshes[j]!.a)!.teeth;
      expect(Math.abs(load.lambda * teeth)).toBeLessThan(1e-9);
    }
  });

  it('first loads exactly the main pair and the first pair, reverse three meshes', () => {
    expect(stateByName(e30, '1').loaded.map((j) => meshName(e30, j))).toEqual(['input-main/counter-main', 'counter-1/main-1']);
    expect(stateByName(e30, 'R').loaded.map((j) => meshName(e30, j))).toEqual(['input-main/counter-main', 'counter-R/idler-R', 'idler-R/main-R']);
    for (const name of ['2', '3', '4']) expect(stateByName(e30, name).loaded.map((j) => meshName(e30, j))).toEqual(['input-main/counter-main', `counter-${name}/main-${name}`]);
  });

  it('the output gives i times the input torque, and the engaged sleeve carries it', () => {
    for (const box of [e30, mz6]) {
      for (const s of box.states.filter((x) => x.kind === 'gear')) {
        expect(s.outputTorque!, `${box.spec.id} ${s.name}`).toBeCloseTo(s.ratio!, 9);
        expect(Math.abs(Object.values(s.elementTorques)[0]!)).toBeCloseTo(Math.abs(s.ratio!), 9);
      }
    }
  });

  it('the tangential force from λ equals T·i_main·(1 + u)/a', () => {
    // Two independent roads to one number: the equilibrium's multiplier, and the countershaft torque over the
    // driving gear's radius a/(1 + u) at the shared centre distance.
    for (const [box, a] of [[e30, 76], [mz6, 85]] as const) {
      const main = box.spec.gears.find((g) => g.id === 'input-main')!;
      const counter = box.spec.gears.find((g) => g.id === 'counter-main')!;
      const iMain = counter.teeth / main.teeth;
      const s = stateByName(box, '1');
      const j1 = box.meshes.findIndex((m) => m.a === 'counter-1');
      const driving = box.spec.gears.find((g) => g.id === 'counter-1')!;
      const driven = box.spec.gears.find((g) => g.id === 'main-1')!;
      const u = driven.teeth / driving.teeth;
      const expected = (iMain * (1 + u)) / (a / 1000);
      expect(Math.abs(s.meshLoads![j1]!.force) / expected - 1).toBeLessThan(1e-9);
      const jMain = box.meshes.findIndex((m) => m.a === 'input-main');
      expect(Math.abs(s.meshLoads![jMain]!.force) / ((1 + iMain) / (a / 1000)) - 1).toBeLessThan(1e-9);
    }
  });

  it('every loaded mesh rolls the whole input power, so an indirect gear keeps η_mesh²', () => {
    const eta = e30.spec.meshEfficiency;
    expect(stateByName(e30, '5').efficiency).toBeCloseTo(1, 12);
    for (const name of ['1', '2', '3', '4']) expect(stateByName(e30, name).efficiency!).toBeCloseTo(1 - 2 * (1 - eta), 9);
    expect(stateByName(e30, 'R').efficiency!).toBeCloseTo(1 - 3 * (1 - eta), 9);
  });
});

describe('shared gear', () => {
  it('the reverse idler has one module and one helix for both meshes, and both centres match the axes', () => {
    const idler = e30.spec.gears.find((g) => g.id === 'idler-R')!;
    const meshes = e30.meshes.filter((m) => m.a === idler.id || m.b === idler.id);
    expect(meshes).toHaveLength(2);
    for (const mesh of meshes) {
      const other = e30.spec.gears.find((g) => g.id === (mesh.a === idler.id ? mesh.b : mesh.a))!;
      expect(other.module).toBe(idler.module);
      expect(Math.abs(other.helix)).toBe(Math.abs(idler.helix));
      expect(Math.abs(idler.shift)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(other.shift)).toBeLessThanOrEqual(0.5);
      const shiftSum = idler.shift + other.shift;
      expect(centreDistance(idler.module, idler.teeth, other.teeth, Math.abs(idler.helix), idler.pressureAngle, shiftSum)).toBeCloseTo(mesh.axisDistance, 9);
      expect(shiftSumForCentre(mesh.axisDistance, idler.module, idler.teeth, other.teeth, Math.abs(idler.helix), idler.pressureAngle)).toBeCloseTo(shiftSum, 9);
    }
  });

  it('data whose axes do not fit the teeth is refused', () => {
    const base = gearboxSpec(e30Record);
    const spec: GearboxSpec = { ...base, axes: base.axes.map((a) => (a.id === 'idler' ? { ...a, x: a.x + 0.5 } : a)) };
    expect(() => buildGearbox(spec)).toThrow(/axes are/);
  });
});
