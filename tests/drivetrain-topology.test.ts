import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_GEARBOXES, gearboxById } from '../src/data/gearboxes.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { centreDistance, shiftSumForCentre } from '../src/drivetrain/gear-geometry.ts';
import { layshaftSpec, type LayshaftDesc } from '../src/drivetrain/layouts/layshaft.ts';
import { finalRatio, speedRatio, transaxleSpec, type TransaxleDesc } from '../src/drivetrain/layouts/transaxle.ts';
import { analyseState, buildGearbox, stateByName } from '../src/drivetrain/topology.ts';
import type { GearboxSpec } from '../src/drivetrain/spec.ts';

const e30Record = gearboxById('manual-rwd')!;
const e30 = buildGearbox(gearboxSpec(e30Record));
const mz6 = buildGearbox(gearboxSpec(gearboxById('tr6060-mz6')!));
const civicRecord = gearboxById('manual-transaxle')!;
const civic = buildGearbox(gearboxSpec(civicRecord));
const p992Record = gearboxById('manual-transaxle/porsche-911-carrera-t-992')!;
const p992 = buildGearbox(gearboxSpec(p992Record));
const meshName = (box: typeof e30, j: number) => `${box.meshes[j]!.a}/${box.meshes[j]!.b}`;
const forward = ['1', '2', '3', '4', '5'];

describe('catalogue', () => {
  it.each(ALL_GEARBOXES.map((g) => [g.id, g] as const))('%s builds', (_id, record) => {
    expect(() => buildGearbox(gearboxSpec(record))).not.toThrow();
  });

  it('every drive car names a gearbox that exists and names the car back', () => {
    for (const [id, car] of Object.entries(DRIVE_CARS)) {
      expect(car.car, id).toBe(id);
      expect(gearboxById(car.gearbox)?.car, car.car).toBe(car.car);
    }
    for (const record of ALL_GEARBOXES.filter((g) => g.car !== null)) expect(DRIVE_CARS[record.car!]?.gearbox, record.id).toBe(record.id);
  });

  it('a spur gear has a plain zero helix, not −0', () => {
    for (const record of ALL_GEARBOXES) {
      for (const g of gearboxSpec(record).gears) if (g.helix === 0) expect(Object.is(g.helix, 0), `${record.id} ${g.id}`).toBe(true);
    }
  });
});

describe('descriptions that cannot be built are refused', () => {
  const desc = e30Record.layout.desc as LayshaftDesc;
  it('a sleeve engaging a speed the box does not have', () => {
    expect(() => layshaftSpec({ ...desc, sleeves: [...desc.sleeves, { id: '6', front: 6, back: null }] })).toThrow(/speeds 1–5/);
  });

  it('two direct speeds', () => {
    expect(() => layshaftSpec({ ...desc, speeds: [...desc.speeds.slice(0, 3), 'direct', 'direct'] })).toThrow(/only one speed/);
  });

  it('a gear with no teeth or a fraction of a tooth', () => {
    for (const teeth of [0, 20.5, -20]) {
      const spec = layshaftSpec(desc);
      const broken: GearboxSpec = { ...spec, gears: spec.gears.map((g) => (g.id === 'counter-1' ? { ...g, teeth } : g)) };
      expect(() => buildGearbox(broken), `${teeth}`).toThrow(/teeth/);
    }
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

  it("Honda Civic Type R FK8: every figure Honda publishes, as Honda gives it (the ratio cut after three places)", () => {
    // Honda Europe: 3.625 / 2.115 / 1.529 / 1.125 / 0.911 / 0.734, reverse 3.757, final drive 4.111. Sixth, 36/49 =
    // 0.73469, is 0.734 for Honda and 0.735 for DSPORT: Honda cuts, it does not round.
    const cut = (r: number) => Math.floor(Math.abs(r) * 1000 + 1e-9);
    const published = civicRecord.published;
    published.ratios.forEach((p, k) => expect(cut(speedRatio(civic, stateByName(civic, String(k + 1)))!), `gear ${k + 1}`).toBe(Math.round(p * 1000)));
    expect(cut(speedRatio(civic, stateByName(civic, 'R'))!)).toBe(Math.round(published.reverse! * 1000));
    expect(cut(finalRatio(civic.spec)!)).toBe(Math.round(published.finalDrive! * 1000));
    expect(finalRatio(civic.spec)).toBeCloseTo(74 / 18, 12);
  });

  it('Porsche 911 Carrera T (992): every figure Porsche publishes, to its two places', () => {
    const published = p992Record.published;
    expect(p992.states.filter((s) => s.kind === 'gear' && s.ratio! > 0)).toHaveLength(7);
    published.ratios.forEach((p, k) => expect(Math.abs(Math.abs(speedRatio(p992, stateByName(p992, String(k + 1)))!) - p), `gear ${k + 1}`).toBeLessThanOrEqual(0.005));
    expect(Math.abs(Math.abs(speedRatio(p992, stateByName(p992, 'R'))!) - published.reverse!)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(finalRatio(p992.spec)! - published.finalDrive!)).toBeLessThanOrEqual(0.005);
  });

  it("a transaxle's overall ratio is its speed times its final drive, and the drive car states the same final drive", () => {
    for (const box of [civic, p992]) {
      const final = finalRatio(box.spec)!;
      for (const s of box.states.filter((x) => x.kind === 'gear')) {
        // A two-shaft box turns its output shaft against the input in every forward speed; the final drive turns it back.
        expect(s.ratio!, `${box.spec.id} ${s.name}`).toBeCloseTo(-speedRatio(box, s)! * final, 9);
      }
      const car = Object.values(DRIVE_CARS).find((c) => c.gearbox === box.spec.id)!;
      expect(Math.abs(car.finalDrive.ratio - final), box.spec.id).toBeLessThanOrEqual(0.005);
    }
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
  it('in every box forward gears turn the output with the crank, reverse against it', () => {
    for (const record of ALL_GEARBOXES) {
      const box = buildGearbox(gearboxSpec(record));
      for (const s of box.states.filter((x) => x.kind === 'gear')) {
        if (s.name === 'R') expect(s.ratio!, `${record.id} R`).toBeLessThan(0);
        else expect(s.ratio!, `${record.id} ${s.name}`).toBeGreaterThan(0);
      }
    }
    expect(stateByName(e30, 'R').kind).toBe('gear');
  });

  it('the countershaft turns against the input, a loose gear and the reverse idler with it', () => {
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

  it("a transaxle loads its speed's pair and the final drive in every gear, reverse its idler too", () => {
    for (const box of [civic, p992]) {
      for (const k of box.states.filter((s) => s.kind === 'gear' && s.name !== 'R').map((s) => s.name)) {
        expect(stateByName(box, k).loaded.map((j) => meshName(box, j)), `${box.spec.id} ${k}`).toEqual(['final-pinion/final-ring', `in-${k}/out-${k}`]);
        expect(stateByName(box, k).efficiency!).toBeCloseTo(1 - 2 * (1 - box.spec.meshEfficiency), 9);
      }
    }
    expect(stateByName(civic, 'R').loaded.map((j) => meshName(civic, j))).toEqual(['final-pinion/final-ring', 'in-R/idler-R', 'idler-R2/out-R']);
    expect(stateByName(p992, 'R').loaded.map((j) => meshName(p992, j))).toEqual(['final-pinion/final-ring', 'in-R/idler-R', 'idler-R/out-R']);
    // The final drive carries the output shaft's torque: the speed's ratio times the input torque.
    for (const box of [civic, p992]) {
      const s = stateByName(box, '1');
      const j = box.meshes.findIndex((m) => m.a === 'final-pinion');
      const pinion = box.spec.gears.find((g) => g.id === 'final-pinion')!;
      expect(Math.abs(s.meshLoads![j]!.lambda * pinion.teeth)).toBeCloseTo(Math.abs(speedRatio(box, s)!), 9);
    }
  });

  it('every loaded mesh rolls the whole input power, so an indirect gear keeps η_mesh²', () => {
    const eta = e30.spec.meshEfficiency;
    expect(stateByName(e30, '5').efficiency).toBeCloseTo(1, 12);
    for (const name of ['1', '2', '3', '4']) expect(stateByName(e30, name).efficiency!).toBeCloseTo(1 - 2 * (1 - eta), 9);
    expect(stateByName(e30, 'R').efficiency!).toBeCloseTo(1 - 3 * (1 - eta), 9);
  });
});

describe('transaxle descriptions that cannot be built are refused', () => {
  const desc = civicRecord.layout.desc as TransaxleDesc;
  it('a reverse idler too short to reach both gears', () => {
    expect(() => transaxleSpec({ ...desc, reverse: { ...desc.reverse, teeth: [17, 17, 17] } })).toThrow(/idler/);
  });

  it('a bevel gear on parallel axes', () => {
    const spec = gearboxSpec(civicRecord);
    const broken: GearboxSpec = { ...spec, gears: spec.gears.map((g) => (g.id === 'final-ring' ? { ...g, cone: 70 } : g)) };
    expect(() => buildGearbox(broken)).toThrow(/bevel/);
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

/** Files a module loads at run time, following value imports and re-exports; `import type` is erased and skipped. */
function runtimeGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
      if (m[1] || !m[2]!.startsWith('.')) continue;
      visit(resolve(dirname(file), m[2]!));
    }
  };
  visit(resolve(entry));
  return seen;
}

describe('10. the audio thread never derives', () => {
  // What the worklet runs: the solver and the core it steps, and the load that will drive them (stage K2c), once it
  // exists. None of it may pull in the derivation or the gear geometry: a few milliseconds there is an audible gap.
  const entries = ['src/drivetrain/solver.ts', 'src/drivetrain/core.ts', 'src/drivetrain/driveline-load.ts', 'src/vehicle/vehicle-load.ts'].filter((f) => existsSync(f));

  it('checks at least the solver and the core it steps (paths from the repository root)', () => {
    expect(entries).toEqual(expect.arrayContaining(['src/drivetrain/solver.ts', 'src/drivetrain/core.ts']));
  });

  it.each(entries)('%s does not load topology.ts or gear-geometry.ts', (entry) => {
    const files = [...runtimeGraph(entry)].map((f) => f.replace(/\\/g, '/'));
    expect(files.some((f) => f.endsWith('/drivetrain/topology.ts'))).toBe(false);
    expect(files.some((f) => f.endsWith('/drivetrain/gear-geometry.ts'))).toBe(false);
  });

  it('the graph walker does see them where they are loaded', () => {
    const files = [...runtimeGraph('src/drivetrain/catalogue.ts')];
    expect(files.some((f) => f.endsWith('/drivetrain/gear-geometry.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('/drivetrain/topology.ts'))).toBe(false);
  });
});
