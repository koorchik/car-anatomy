// What the gearbox data gives: `node scripts/gearbox-table.ts [car or gearbox id...]` (all records without an id).
// Ratios from the teeth against the published ones, the kind of every state of the shift matrix, the meshes that
// carry torque, and the geometry of every pair (module, helix from the shared centre distance, contact ratios). A
// transaxle's ratio column is the speed's own (input over output shaft, signed), its overall one includes the final
// drive in its case.
// For a gearbox in a car: the natural frequencies of the drivetrain with each damper, from the car's engine; for a car
// that drives (its DriveCar has dynamics, stage K2b), its road load, top speed, 0–100 km/h and 0–400 m by the
// quasi-static and the whole model, and the shunt in every gear.
// `--designer` prints the gearbox designer's model instead (stage K9a): for each copy of a catalogue gearbox in its
// car (and the odd presets with `--designer all`), the teeth it picks, the ratios against their targets and the
// published ones, and the quasi-static figures: v_max, revs in top, the rev drops and synchronisers on the upshifts,
// the start grade, 0–100 km/h and 0–400 m; then (stage K9b) the teeth's bending and contact loads in every gear, the
// synchronisers' hard shifts, the clutch and damper, the mesh tones, the mass, the verdict and the diagnoses. It opens
// with the bending calibration on the TR-6060 MZ6 and the rough check of Tremec's sets A–F, whose teeth the designer
// reconstructs.
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
import { splitKinematics } from '../src/drivetrain/layouts/power-split.ts';
import { HYBRID_CARS } from '../src/data/hybrid-cars.ts';
import { buildPowerSplitDrive } from '../src/data/car-drive.ts';
import { mg1Crossing } from '../src/drivetrain/power-split-runs.ts';
import { drivenTyreRadiusM } from '../src/vehicle/car.ts';
import { naturalModes } from '../src/drivetrain/modes.ts';
import type { DamperDef } from '../src/drivetrain/spec.ts';
import { type Gearbox, buildGearbox } from '../src/drivetrain/topology.ts';
import { catalogueTorqueMap } from '../src/designer/torque-map.ts';
import { buildCarDrive } from '../src/data/car-drive.ts';
import { modalCore, type CarDrive } from '../src/drivetrain/car-model.ts';
import { dynamicRun, dynamicTopSpeed, quasiStaticRun, steadyTopSpeed } from '../src/drivetrain/runs.ts';
import { vehicleModes } from '../src/drivetrain/vehicle-modes.ts';
import { AIR_DENSITY } from '../src/vehicle/constants.ts';
import { roadLoadCoeffs, roadLoadN, roadLoadRule } from '../src/vehicle/road-load.ts';
import { staticWheelLoadN, tyreAt } from '../src/vehicle/tyre.ts';
import { evaluateGearbox } from '../src/gearbox-designer/evaluate.ts';
import { catalogueGearboxPresets, oddGearboxPresets, type GearboxPreset } from '../src/gearbox-designer/presets.ts';
import { designVehicle } from '../src/gearbox-designer/vehicle.ts';
import { diagnoseGearbox } from '../src/gearbox-designer/diagnostics.ts';
import { tr6060Design } from '../src/gearbox-designer/mass.ts';
import { assessGearbox } from '../src/gearbox-designer/reliability.ts';
import { resolveGearboxDesign } from '../src/gearbox-designer/constraints.ts';
import { designBuild } from '../src/gearbox-designer/to-spec.ts';
import {
  BENDING_LIMIT_MPA, CALIBRATION_CONTACT_LOAD, CALIBRATION_TORQUE_NM, CONTACT_LIMIT_MPA, FLANK_LIMIT_MPA, gearboxStrength,
} from '../src/gearbox-designer/strength.ts';

const DEG = 180 / Math.PI;
const helix = (beta: number): string => (beta === 0 ? 'spur' : `${(Math.abs(beta) * DEG).toFixed(2)}° ${beta > 0 ? 'R' : 'L'}`);

function print(record: GearboxRecord, car: DriveCar | null): void {
  const spec = gearboxSpec(record);
  const box = buildGearbox(spec);
  const teeth = (id: string) => spec.gears.find((g) => g.id === id)!.teeth;
  const mesh = (j: number) => `${box.meshes[j]!.a} ${teeth(box.meshes[j]!.a)}→${teeth(box.meshes[j]!.b)}`;
  const inside = finalRatio(spec);
  const final =
    spec.kind === 'power-split'
      ? `, ring to differential ${splitKinematics(box).ring.toFixed(4)} (published ${record.published.finalDrive ?? '?'})`
      : inside !== null ? `, final drive in the case ${inside.toFixed(4)} (published ${record.published.finalDrive ?? '?'})` : '';
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
      `${+a.shift.toFixed(3)}/${+b.shift.toFixed(3)}`.padStart(6), m.geometry.centre.toFixed(3).padStart(11), m.geometry.epsAlpha.toFixed(2).padStart(7), m.geometry.epsBeta.toFixed(2).padStart(6),
      ` ${cut.join(', ') || '—'}${m.bevel ? ' (bevel: outer module, axes cross)' : ''}`,
    );
  }
  if (spec.kind === 'layshaft') console.log(`gear stack ${stackLength(spec).toFixed(0)} mm long`);
  if (record.unverified.length) console.log(`unverified: ${record.unverified.join(', ')}`);
  if (spec.kind === 'power-split') printPowerSplit(record, box);
  if (car) printModes(box, car);
  if (car?.dynamics) printDrive(car);
}

/**
 * A power-split box (stage K15a): its kinematics from the derived gearbox, and where MG1 changes direction at a few
 * engine speeds, three ways: the closed form (z_s + z_r)/z_r of research §12, the derived gearbox's own speeds by
 * bisection, and the whole car on the road with the control holding the engine there (power-split-car.ts).
 */
function printPowerSplit(record: GearboxRecord, box: Gearbox): void {
  const k = splitKinematics(box);
  const desc = record.layout.kind === 'power-split' ? record.layout.desc : null;
  if (!desc) return;
  const { sun, ring } = desc.split;
  console.log(`kinematics from the derived box: ω_MG1 = ${k.mg1[0].toFixed(4)}·ω_engine ${k.mg1[1] < 0 ? '−' : '+'} ${Math.abs(k.mg1[1]).toFixed(4)}·ω_out, ω_MG2 = ${k.mg2.toFixed(4)}·ω_out, ω_ring = ${k.ring.toFixed(4)}·ω_out`);
  // Times z_s, the derived coefficients give the Willis relation back: z_s·ω_MG1 + z_r·ω_ring = (z_s + z_r)·ω_engine.
  const ringPart = (-k.mg1[1] / k.ring) * sun;
  console.log(`  that is ${sun}·ω_MG1 + ${ringPart.toFixed(4)}·ω_ring = ${(k.mg1[0] * sun).toFixed(4)}·ω_engine (teeth: ${sun}, ${ring}, ${sun + ring}); MG2 reduction ${Math.abs(k.mg2 / k.ring).toFixed(4)} (ORNL 2.636)`);
  const example = (k.mg1[0] * 2000 + k.mg1[1] * (3000 / k.ring));
  console.log(`  engine 2000 rpm, ring 3000 rpm: MG1 ${example.toFixed(1)} rpm (research §12: −600)`);
  const hybrid = HYBRID_CARS.find((h) => h.gearbox === record.id);
  const car = hybrid ? carById(hybrid.car) : undefined;
  const r = car ? drivenTyreRadiusM(car) : null;
  const kmh = (omegaOut: number) => (r === null ? '' : `${(omegaOut * r * 3.6).toFixed(2)} km/h`);
  console.log(`where MG1 stands and then turns backward${car ? ` (${car.name}, tyre radius ${r!.toFixed(4)} m)` : ''}:`);
  console.log('engine rpm   ring rpm: closed form   derived box   whole car     road speed: closed form   derived box    whole car');
  const cd = hybrid ? buildPowerSplitDrive(hybrid.car) : null;
  for (const rpm of [1000, 1500, 2000, 3000, 4000, 5200]) {
    const we = (rpm * Math.PI) / 30;
    const closed = ((sun + ring) / ring) * we;
    let lo = 0;
    let hi = 5 * we;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (k.mg1[0] * we + k.mg1[1] * mid > 0) lo = mid;
      else hi = mid;
    }
    const out = (lo + hi) / 2;
    const run = cd ? mg1Crossing(cd, rpm) : null;
    console.log(
      String(rpm).padStart(10), ((closed * 30) / Math.PI).toFixed(1).padStart(22), ((out * k.ring * 30) / Math.PI).toFixed(1).padStart(13),
      (run === null ? '—' : run.ringRpm.toFixed(1)).padStart(11),
      kmh(closed / k.ring).padStart(28), kmh(out).padStart(13), (run === null ? '—' : `${(run.speed * 3.6).toFixed(2)} km/h`).padStart(12),
    );
  }
  console.log('  the whole car\'s road speed is lower by the driving tyres\' slip; — : the car does not get there with the engine held');
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

/** The gearbox designer's figures for one preset. */
function printDesigner(preset: GearboxPreset): void {
  const d = preset.design;
  const e = evaluateGearbox(d);
  const record = d.factory ? gearboxById(d.factory.gearbox) : undefined;
  const car = carById(d.car)!;
  const kmh = (v: number | null) => (v === null ? '—' : v.toFixed(0));
  console.log(
    `\n${preset.name} [${preset.id}]: ${d.type}, ${d.gears} speeds, centre ${d.centreMm} mm, helix ${d.helix}°, modules ${d.module}/${d.lowModule}/${d.mainModule} mm, ` +
      `engine ${d.engine}, ${d.massKg.toFixed(0)} kg, ${d.tyreSize} ${d.tyre}, C_dA ${d.cdA.toFixed(3)} m², C_rr ${d.crr.toFixed(4)}`,
  );
  if (e.mainRatio !== null) console.log(`constant-mesh pair ${e.mainRatio.toFixed(4)}`);
  console.log('gear   teeth    m_n  shift          ratio    target  published   step  overall    eff  km/h/1000  km/h@limit  grid step');
  for (const g of e.gears) {
    const p = g.pair;
    const published = record?.published.ratios[g.gear - 1];
    console.log(
      String(g.gear).padEnd(5), (p ? `${p.teeth[0]}/${p.teeth[1]}` : 'direct').padStart(7), (p ? p.module.toFixed(2) : '').padStart(6),
      (p ? `${p.shift[0].toFixed(2)}/${p.shift[1].toFixed(2)}` : '').padStart(12), g.ratio.toFixed(4).padStart(9), g.target.toFixed(4).padStart(9),
      (published === undefined ? '' : published.toFixed(3)).padStart(10), (g.step === null ? '' : g.step.toFixed(3)).padStart(6), g.overall.toFixed(3).padStart(8),
      g.efficiency.toFixed(3).padStart(6), g.kmhPer1000.toFixed(1).padStart(10), g.kmhAtLimit.toFixed(0).padStart(11),
      (p && !p.hand ? p.step.toFixed(4) : p ? 'by hand' : '').padStart(10),
    );
  }
  console.log(
    `reverse ${e.reverse.teeth.join('/')} ${e.reverse.ratio.toFixed(3)} (published ${record?.published.reverse ?? '—'}), final drive ${e.finalDrive.toFixed(3)}, ` +
      `range ${e.range.toFixed(2)}, input side ${e.inputInertia.toFixed(4)} kg·m²`,
  );
  console.log(
    `v_max ${e.vmaxKmh.toFixed(1)} km/h in ${e.vmaxGear}${e.vmaxAtLimiter ? ' at the limiter' : ''} (published ${car.published.vmaxKmh}); top gear ${e.topRpmAt100.toFixed(0)} rpm at 100 km/h, ` +
      `${e.topRpmAt120.toFixed(0)} at 120; starts on ${e.startGradePct.toFixed(0)} % at most`,
  );
  console.log(
    `0–100 km/h ${e.zeroTo100S?.toFixed(2) ?? '—'} s (published ${car.published.zeroTo100S ?? '—'}), 0–400 m ${e.zeroTo400mS?.toFixed(2) ?? '—'} s at ${kmh(e.at400mKmh)} km/h; ` +
      `power band ${e.powerBand[0].toFixed(0)}–${e.powerBand[1].toFixed(0)} rpm`,
  );
  console.log(
    `upshifts (limit ${designVehicle(d).map.limitRpm} rpm): ` +
      e.shifts
        .map((x) => `${x.from}→${x.to} ${x.rpmBefore.toFixed(0)} to ${x.rpmAfter.toFixed(0)} rpm${x.inBand ? '' : ' (below the band)'}, sync ${(x.syncS * 1000).toFixed(0)} ms, break ${(x.pauseS * 1000).toFixed(0)} ms`)
        .join('; '),
  );
  console.log(`strength at ${e.peakTorqueNm.toFixed(0)} N·m (bending/contact load, weakest mesh):`);
  console.log(
    '  ' +
      e.strength
        .map((g) => (g.weakest ? `${g.gear}: ${g.bending.toFixed(2)}/${g.contact.toFixed(2)} ${g.weakest.teeth.join('/')} ${g.weakest.bendingMpa.toFixed(0)} MPa` : `${g.gear}: direct`))
        .join('; '),
  );
  console.log(
    `synchronisers (blocking margin ${e.synchro.blocking.toFixed(2)}${e.synchro.sticks ? ', ring sticks' : ''}): ` +
      e.synchro.shifts
        .map((x) => `${x.from}→${x.to} from ${x.rpm.toFixed(0)} rpm ${(x.timeS * 1000).toFixed(0)} ms, ${x.energyJPerMm2.toFixed(3)} J/mm², ${x.powerWPerMm2.toFixed(2)} W/mm², load ${x.load.toFixed(2)}`)
        .join('; '),
  );
  const c = e.clutch;
  console.log(
    `clutch ${c.staticNm.toFixed(0)} N·m, margin ${c.margin.toFixed(2)}; launch at 2000 rpm ${(c.launchJ / 1000).toFixed(1)} kJ in ${c.launchS.toFixed(2)} s, ` +
      `pressure plate +${c.plateRiseK === null ? '—' : c.plateRiseK.toFixed(1)} K; damper mode ${c.damperHz.toFixed(1)} Hz, firing at idle ${c.idleFiringHz.toFixed(1)} Hz`,
  );
  console.log(
    `mesh tones at 3000 rpm: ` +
      e.tones.map((g) => (g.db === null ? `${g.gear}: silent` : `${g.gear}: ${g.meshes.map((m) => `${m.hz.toFixed(0)} Hz`).join(' + ')} ${g.db.toFixed(1)} dB`)).join('; '),
  );
  console.log(`mass ${e.mass.totalKg.toFixed(1)} kg (gears ${e.mass.gearsKg.toFixed(1)}, shafts ${e.mass.shaftsKg.toFixed(1)}, case with oil ${e.mass.caseKg.toFixed(1)}; an estimate from the TR-6060)`);
  const rel = assessGearbox(e);
  console.log(`verdict: ${rel.verdictName}: ${rel.lifeText} (${rel.items.map((i) => `${i.id} ${i.load.toFixed(2)}`).join(', ')})`);
  for (const x of diagnoseGearbox(d, e, rel)) console.log(`  [${x.severity}] ${x.title}. ${x.text}`);
}

/**
 * Tremec TR-6060 sets A–F (Tremec, research §3.3): ratios and rated input torque. Their teeth are not published, so
 * the designer picks them at the MZ6's centre, modules and faces; the first pair's bending load at the rating is a
 * rough check within ±25 %, not a test.
 */
const TREMEC_SETS: Array<{ id: string; ratios: number[]; nm: number }> = [
  { id: 'A', ratios: [3.01, 2.07, 1.43, 1.0, 0.84, 0.57], nm: 580 },
  { id: 'B', ratios: [2.98, 1.78, 1.3, 1.0, 0.74, 0.5], nm: 680 },
  { id: 'C', ratios: [2.66, 1.78, 1.3, 1.0, 0.8, 0.63], nm: 760 },
  { id: 'D', ratios: [2.66, 1.82, 1.3, 1.0, 0.76, 0.5], nm: 810 },
  { id: 'E', ratios: [2.29, 1.61, 1.21, 1.0, 0.82, 0.68], nm: 880 },
  { id: 'F', ratios: [2.26, 1.58, 1.19, 1.0, 0.71, 0.5], nm: 880 },
];

function printCalibration(): void {
  const mz6 = tr6060Design();
  const first = gearboxStrength(designBuild(mz6).box, mz6.gears, CALIBRATION_TORQUE_NM)[0]!;
  console.log(
    `Bending calibration: TR-6060 MZ6 first pair ${first.weakest!.teeth.join('/')} at ${CALIBRATION_TORQUE_NM} N·m: ${first.weakest!.bendingMpa.toFixed(0)} MPa, ` +
      `load ${first.bending.toFixed(3)} (limit ${BENDING_LIMIT_MPA.toFixed(0)} MPa); contact load ${CALIBRATION_CONTACT_LOAD.toFixed(2)} ` +
      `(limit ${CONTACT_LIMIT_MPA.toFixed(0)} MPa, 0.7–1.3 expected; flanks judged against ${FLANK_LIMIT_MPA.toFixed(0)} MPa)`,
  );
  console.log('Tremec sets A–F, teeth reconstructed by the designer (rough check, ±25 %):');
  for (const set of TREMEC_SETS) {
    const d = resolveGearboxDesign({
      ...mz6, firstRatio: set.ratios[0]!, topRatio: set.ratios[5]!, ratios: set.ratios.map((r, i) => (r === 1 || i === 0 ? null : r)),
      pairs: set.ratios.map(() => null), mainPair: null, factory: null,
    });
    const g = gearboxStrength(designBuild(d).box, d.gears, set.nm)[0]!;
    const ok = Math.abs(g.bending - 1) <= 0.25 ? 'within' : 'OUTSIDE';
    console.log(`  ${set.id}: ${set.nm} N·m, first ${set.ratios[0]} with teeth ${g.weakest!.teeth.join('/')}: load ${g.bending.toFixed(2)} (${ok} ±25 %)`);
  }
}

const ids = process.argv.slice(2);
if (ids[0] === '--designer') {
  const presets = [...catalogueGearboxPresets(), ...(ids[1] === 'all' ? oddGearboxPresets() : [])];
  printCalibration();
  for (const p of presets) printDesigner(p);
  process.exit(0);
}
const targets: Array<[GearboxRecord, DriveCar | null]> = ids.length
  ? ids.map((id) => {
      const car = driveCarById(id);
      const record = gearboxById(car ? car.gearbox : id);
      if (!record) throw new Error(`no car or gearbox ${id}; cars: ${Object.keys(DRIVE_CARS).join(', ')}; gearboxes: ${ALL_GEARBOXES.map((g) => g.id).join(', ')}`);
      return [record, car ?? null];
    })
  : ALL_GEARBOXES.map((record) => [record, Object.values(DRIVE_CARS).find((c) => c.gearbox === record.id) ?? null]);
for (const [record, car] of targets) print(record, car);
