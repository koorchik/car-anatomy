// What the gearbox data gives: `node scripts/gearbox-table.ts [car or gearbox id...]` (all records without an id).
// Ratios from the teeth against the published ones, the kind of every state of the shift matrix, the meshes that
// carry torque, and the geometry of every pair (module, helix from the shared centre distance, contact ratios). A
// transaxle's ratio column is the speed's own (input over output shaft, signed), its overall one includes the final
// drive in its case.
// For a gearbox in a car: the natural frequencies of the drivetrain with each damper, from the car's engine; for a car
// that drives (its DriveCar has dynamics, stage K2b), its road load, top speed, 0–100 km/h and 0–400 m by the
// quasi-static and the whole model, and the shunt in every gear.
import { carById } from '../src/data/cars.ts';
import { DRIVE_CARS, driveCarById } from '../src/data/drive-cars.ts';
import { engineById } from '../src/data/engines.ts';
import { ALL_GEARBOXES, gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec, type GearboxRecord } from '../src/drivetrain/catalogue.ts';
import { CLUTCH, drivetrainCore } from '../src/drivetrain/core.ts';
import type { DriveCar } from '../src/drivetrain/drive-car.ts';
import { DISC_DAMPER, DISC_HUB, DMF_DAMPER, dryClutch, stiffDisc } from '../src/drivetrain/elements.ts';
import { undercut } from '../src/drivetrain/gear-geometry.ts';
import { stackLength } from '../src/drivetrain/layouts/layshaft.ts';
import { finalRatio, speedRatio } from '../src/drivetrain/layouts/transaxle.ts';
import { naturalModes } from '../src/drivetrain/modes.ts';
import type { DamperDef } from '../src/drivetrain/spec.ts';
import { type Gearbox, buildGearbox } from '../src/drivetrain/topology.ts';
import { catalogueTorqueMap } from '../src/designer/torque-map.ts';
import { buildCarDrive, modalCore, type CarDrive } from '../src/drivetrain/car-model.ts';
import { dynamicRun, dynamicTopSpeed, quasiStaticRun, steadyTopSpeed } from '../src/drivetrain/runs.ts';
import { vehicleModes } from '../src/drivetrain/vehicle-modes.ts';
import { AIR_DENSITY } from '../src/vehicle/constants.ts';
import { roadLoadCoeffs, roadLoadN, roadLoadRule } from '../src/vehicle/road-load.ts';
import { staticWheelLoadN, tyreAt } from '../src/vehicle/tyre.ts';

const DEG = 180 / Math.PI;
const helix = (beta: number): string => (beta === 0 ? 'spur' : `${(Math.abs(beta) * DEG).toFixed(2)}° ${beta > 0 ? 'R' : 'L'}`);

function print(record: GearboxRecord, car: DriveCar | null): void {
  const spec = gearboxSpec(record);
  const box = buildGearbox(spec);
  const teeth = (id: string) => spec.gears.find((g) => g.id === id)!.teeth;
  const mesh = (j: number) => `${box.meshes[j]!.a} ${teeth(box.meshes[j]!.a)}→${teeth(box.meshes[j]!.b)}`;
  const inside = finalRatio(spec);
  const final = inside !== null ? `, final drive in the case ${inside.toFixed(4)} (published ${record.published.finalDrive ?? '?'})` : '';
  const diff = car ? `, final drive ${car.finalDrive.ratio}, differential ${car.differential.kind}` : '';
  console.log(`\n${record.name} (${record.id})${record.car ? `, car ${record.car}` : ''}: centre ${record.published.centreMm ?? '?'} mm${final}${diff}`);
  console.log('state  kind           ratio      published  overall  loaded meshes');
  for (const s of box.states) {
    const k = Number(s.name);
    const published = s.name === 'R' ? record.published.reverse : Number.isInteger(k) ? record.published.ratios[k - 1] : undefined;
    const own = speedRatio(box, s);
    const ratio = own === null ? '' : own.toFixed(5);
    const overall = s.ratio === null ? '' : inside !== null ? s.ratio.toFixed(3) : car ? (s.ratio * car.finalDrive.ratio).toFixed(3) : '';
    console.log(
      s.name.padEnd(6), s.kind.padEnd(14), ratio.padStart(9), (published === undefined || published === null ? '' : published.toFixed(3)).padStart(10),
      overall.padStart(8), ' ', s.loaded.map(mesh).join(', ') || (s.kind === 'gear' ? 'none: direct' : ''),
    );
  }
  // The helix as an angle and the hand of the first gear (its mate has the other hand).
  console.log('mesh                      teeth   m_n      helix  shift        a mm   eps_a  eps_b  undercut');
  for (const m of box.meshes) {
    const a = spec.gears.find((g) => g.id === m.a)!;
    const b = spec.gears.find((g) => g.id === m.b)!;
    const cut = [a, b].filter((g) => undercut(g.teeth, g.shift, Math.abs(g.helix), g.pressureAngle).undercut).map((g) => g.id);
    console.log(
      `${m.a}/${m.b}`.padEnd(24), `${a.teeth}/${b.teeth}`.padStart(7), a.module.toFixed(2).padStart(5), helix(m.geometry.a.beta).padStart(10),
      `${a.shift}/${b.shift}`.padStart(6), m.geometry.centre.toFixed(3).padStart(11), m.geometry.epsAlpha.toFixed(2).padStart(7), m.geometry.epsBeta.toFixed(2).padStart(6),
      ` ${cut.join(', ') || '—'}${m.bevel ? ' (bevel: outer module, axes cross)' : ''}`,
    );
  }
  if (spec.kind === 'layshaft') console.log(`gear stack ${stackLength(spec).toFixed(0)} mm long`);
  if (record.unverified.length) console.log(`unverified: ${record.unverified.join(', ')}`);
  if (car) printModes(box, car);
  if (car?.dynamics) printDrive(car);
}

/**
 * The car on the road: the road load it gets (the C_dA rule), top speed and standing starts by the quasi-static and
 * the whole model, and the shunt in each gear, on rigid tyres and on the linearised ones at 3000 rpm.
 */
function printDrive(drive: DriveCar): void {
  const cd = buildCarDrive(drive.car);
  const car = cd.car;
  const rl = roadLoadCoeffs(car);
  const kmh = (v: number) => (v * 3.6).toFixed(1);
  console.log(
    `\non the road (${car.id}, ${rl.massKg.toFixed(0)} kg with the driver, tyre ${car.tyre.size} ${car.tyre.id} μ ${cd.tyre.mu}, r ${cd.radius[cd.driven[0]]!.toFixed(4)} m): ` +
      `road load ${roadLoadRule(car)}, C_dA ${((2 * rl.c) / AIR_DENSITY).toFixed(3)} m², ${roadLoadN(rl, 100 / 3.6, 0).toFixed(0)} N at 100 km/h, ` +
      `${roadLoadN(rl, 200 / 3.6, 0).toFixed(0)} N at 200 km/h`,
  );
  const steady = steadyTopSpeed(cd, rl);
  const top = dynamicTopSpeed(cd, cd.gears.find((g) => g.name === steady.gear)!, 0.98 * steady.v, 60);
  console.log(`v_max: quasi-static ${kmh(steady.v)} km/h in ${steady.gear}, whole model ${kmh(top.v)} km/h, published ${car.published.vmaxKmh} km/h`);
  const q = quasiStaticRun(cd);
  const d = dynamicRun(cd);
  const published = car.published.zeroTo100S === null ? '' : `, published ${car.published.zeroTo100S} s`;
  console.log(`0–100 km/h: quasi-static ${q.zeroTo100S?.toFixed(2)} s, whole model ${d.zeroTo100S?.toFixed(2)} s${published}`);
  console.log(`0–400 m: quasi-static ${q.zeroTo400mS?.toFixed(2)} s at ${q.at400mKmh?.toFixed(0)} km/h, whole model ${d.zeroTo400mS?.toFixed(2)} s at ${d.at400mKmh?.toFixed(0)} km/h`);
  // What the tyre's μ, an estimate for the classic tyre, does to the standing start.
  for (const mu of [0.9, 1.0]) {
    const other: CarDrive = { ...cd, tyre: tyreAt(cd.tyre.id, staticWheelLoadN(car), mu) };
    console.log(`  with μ ${mu}: 0–100 km/h ${quasiStaticRun(other).zeroTo100S?.toFixed(2)} s (quasi-static)`);
  }
  const bolted = buildCarDrive(drive.car, { propshaft: false });
  console.log('shunt, Hz (damping ratio): gear, rigid tyres, tyres at 3000 rpm, without the propshaft (tyres at 3000 rpm)');
  const mc = modalCore(cd);
  for (const g of cd.gears) {
    const v = ((3000 * Math.PI) / 30 / (g.ratio * cd.axle.ratio)) * cd.radius[cd.driven[0]]!;
    const rigid = naturalModes(mc, { locked: [CLUTCH, g.element, ...(mc.elements.ids.includes('lsd') ? ['lsd'] : [])] })[0]!;
    const [tyred, unshafted] = [vehicleModes(cd, g, v)[0]!, vehicleModes(bolted, bolted.gears.find((x) => x.name === g.name)!, v)[0]!];
    console.log(
      `  ${g.name}  ${rigid.hz.toFixed(2).padStart(6)}  ${tyred.hz.toFixed(2).padStart(6)} (${tyred.zeta.toFixed(2)}) at ${(v * 3.6).toFixed(0).padStart(3)} km/h  ${unshafted.hz.toFixed(2).padStart(6)} (${unshafted.zeta.toFixed(2)})`,
    );
  }
  const estimates = drive.unverified.filter((p) => p.startsWith('dynamics.'));
  if (estimates.length) console.log(`estimates: ${estimates.join(', ')}`);
}

/**
 * Natural frequencies of the drivetrain from the car's engine to the gearbox output, without the car (stage K2b adds
 * it): with the clutch slipping only the ring behind the damper swings against the engine; with it locked, the
 * gearbox side joins in, in neutral or in each gear with the output free (a light car: the halfshafts are soft
 * against the damper) or held (the brake stub). Undamped frequencies, with the damping ratio of each mode.
 */
function printModes(box: Gearbox, car: DriveCar): void {
  const engineId = carById(car.car)?.engine;
  const engine = engineId ? engineById(engineId) : undefined;
  if (!engine) return;
  const map = catalogueTorqueMap(engine);
  const peak = Math.max(...map.wotNm);
  console.log(
    `\nnatural frequencies, Hz (damping ratio): engine ${engineId} ${map.inertia.toFixed(3)} kg·m², ${peak.toFixed(0)} N·m; ` +
      `disc hub ${DISC_HUB} kg·m²; estimated dry clutch, no car`,
  );
  const gears = box.states.filter((s) => s.kind === 'gear').map((s) => s.name);
  // Held output: the box is rigid to the case in any gear, so the first forward gear stands for all.
  const first = gears.find((g) => g !== 'R') ?? gears[0]!;
  const dampers: Array<[string, DamperDef]> = [['disc', DISC_DAMPER], ['dual-mass', DMF_DAMPER], ['stiff disc', stiffDisc(map.inertia)]];
  const cell = (hz: number | undefined, zeta?: number) => (hz === undefined ? '—' : zeta === undefined ? hz.toFixed(1) : `${hz.toFixed(1)} (${zeta.toFixed(2)})`);
  const columns = ['slipping', 'N, locked', ...gears.map((g) => `${g}, free`), `${first}, held`];
  console.log('damper'.padEnd(34) + columns.map((c) => c.padStart(14)).join(''));
  for (const [name, damper] of dampers) {
    const core = drivetrainCore(box, { engineInertia: map.inertia, damper, clutch: dryClutch(peak) });
    const mode = (locked: string[], held: string[] = []) => naturalModes(core, { locked, held })[0];
    const cells = [
      mode([]),
      mode([CLUTCH]),
      ...gears.map((g) => mode([CLUTCH, `sync-${g}`])),
      mode([CLUTCH, `sync-${first}`], [box.spec.output]),
    ].map((m) => cell(m?.hz, m?.zeta).padStart(14));
    console.log(`${name} ${damper.stiffness.toFixed(0)} N·m/rad, J ${damper.inertia}`.padEnd(34) + cells.join(''));
  }
}

const ids = process.argv.slice(2);
const targets: Array<[GearboxRecord, DriveCar | null]> = ids.length
  ? ids.map((id) => {
      const car = driveCarById(id);
      const record = gearboxById(car ? car.gearbox : id);
      if (!record) throw new Error(`no car or gearbox ${id}; cars: ${Object.keys(DRIVE_CARS).join(', ')}; gearboxes: ${ALL_GEARBOXES.map((g) => g.id).join(', ')}`);
      return [record, car ?? null];
    })
  : ALL_GEARBOXES.map((record) => [record, Object.values(DRIVE_CARS).find((c) => c.gearbox === record.id) ?? null]);
for (const [record, car] of targets) print(record, car);
