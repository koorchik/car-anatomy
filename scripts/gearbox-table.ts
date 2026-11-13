// What the gearbox data gives: `node scripts/gearbox-table.ts [car or gearbox id...]` (all records without an id).
// Ratios from the teeth against the published ones, the kind of every state of the shift matrix, the meshes that
// carry torque, and the geometry of every pair (module, helix from the shared centre distance, contact ratios).
import { DRIVE_CARS, driveCarById } from '../src/data/drive-cars.ts';
import { ALL_GEARBOXES, gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec, type GearboxRecord } from '../src/drivetrain/catalogue.ts';
import type { DriveCar } from '../src/drivetrain/drive-car.ts';
import { undercut } from '../src/drivetrain/gear-geometry.ts';
import { stackLength } from '../src/drivetrain/layouts/layshaft.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';

const DEG = 180 / Math.PI;

function print(record: GearboxRecord, car: DriveCar | null): void {
  const spec = gearboxSpec(record);
  const box = buildGearbox(spec);
  const teeth = (id: string) => spec.gears.find((g) => g.id === id)!.teeth;
  const mesh = (j: number) => `${box.meshes[j]!.a} ${teeth(box.meshes[j]!.a)}→${teeth(box.meshes[j]!.b)}`;
  const diff = car ? `, final drive ${car.finalDrive.ratio}, differential ${car.differential.kind}` : '';
  console.log(`\n${record.name} (${record.id})${record.car ? `, car ${record.car}` : ''}: centre ${record.published.centreMm ?? '?'} mm${diff}`);
  console.log('state  kind           ratio      published  overall  loaded meshes');
  for (const s of box.states) {
    const k = Number(s.name);
    const published = s.name === 'R' ? record.published.reverse : Number.isInteger(k) ? record.published.ratios[k - 1] : undefined;
    const ratio = s.ratio === null ? '' : s.ratio.toFixed(5);
    const overall = s.ratio !== null && car ? (s.ratio * car.finalDrive.ratio).toFixed(3) : '';
    console.log(
      s.name.padEnd(6), s.kind.padEnd(14), ratio.padStart(9), (published === undefined || published === null ? '' : published.toFixed(3)).padStart(10),
      overall.padStart(8), ' ', s.loaded.map(mesh).join(', ') || (s.kind === 'gear' ? 'none: direct' : ''),
    );
  }
  console.log('mesh                      teeth   m_n    helix  shift        a mm   eps_a  eps_b  undercut');
  for (const m of box.meshes) {
    const a = spec.gears.find((g) => g.id === m.a)!;
    const b = spec.gears.find((g) => g.id === m.b)!;
    const cut = [a, b].filter((g) => undercut(g.teeth, g.shift, Math.abs(g.helix), g.pressureAngle).undercut).map((g) => g.id);
    console.log(
      `${m.a}/${m.b}`.padEnd(24), `${a.teeth}/${b.teeth}`.padStart(7), a.module.toFixed(2).padStart(5), `${(m.geometry.a.beta * DEG).toFixed(2)}°`.padStart(8),
      `${a.shift}/${b.shift}`.padStart(6), m.geometry.centre.toFixed(3).padStart(11), m.geometry.epsAlpha.toFixed(2).padStart(7), m.geometry.epsBeta.toFixed(2).padStart(6),
      ` ${cut.join(', ') || '—'}`,
    );
  }
  if (spec.kind === 'layshaft') console.log(`gear stack ${stackLength(spec).toFixed(0)} mm long`);
  if (record.unverified.length) console.log(`unverified: ${record.unverified.join(', ')}`);
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
