// Static numbers and kinematic curves of every independent suspension template, for checking intents by measurement.
// node scripts/suspension-templates.ts [key=value …]
//   Each key=value overrides that intent of the double wishbone and five-link templates (wishboneDefaults,
//   multilinkDefaults), e.g. upperAngleDeg=3 tieRodDzM=0.01; numbers only. Prints a table at design and writes the
//   curves over the travel as CSV to .tmp/suspension-templates/.

import { mkdirSync, writeFileSync } from 'node:fs';
import type { AxleSpec } from '../src/suspension/spec.ts';
import { macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { multilink, multilinkDefaults } from '../src/suspension/templates/multilink.ts';
import { buildAxle, newCornerSample } from '../src/suspension/kinematics.ts';
import { buildAxleLite } from '../src/suspension/axle-lite.ts';

const overrides = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k, Number(v)];
  }),
);
const D = 180 / Math.PI;
const templates: Array<[string, AxleSpec]> = [
  ['macpherson-jtekt', macphersonJtekt({ wheelCentreZM: 0.3 })],
  ['macpherson-dual-axis', macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'dual-axis' })],
  ['macpherson-revoknuckle', macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'revoknuckle' })],
  ['double-wishbone-front', doubleWishbone({ ...wishboneDefaults('front'), ...overrides })],
  ['double-wishbone-rear', doubleWishbone({ ...wishboneDefaults('rear'), ...overrides })],
  ['multilink-front', multilink({ ...multilinkDefaults('front'), ...overrides })],
  ['multilink-rear', multilink({ ...multilinkDefaults('rear'), ...overrides })],
];

const dir = '.tmp/suspension-templates';
mkdirSync(dir, { recursive: true });
const rows: string[][] = [
  ['template', 'RC mm', 'gain °/m', 'RCF', 'steer °/m', 'tanθ CP', 'KPI °', 'caster °', 'scrub mm', 'offset mm', 'mr spring', 'rolled RC mm'],
];
for (const [name, spec] of templates) {
  const lite = buildAxleLite(spec);
  const c = lite.design;
  rows.push([
    name,
    (c.rcHeight * 1000).toFixed(1),
    (c.camberGain * D).toFixed(1),
    lite.rcf.toFixed(2),
    (c.bumpSteer * D).toFixed(2),
    c.tanThetaCP.toFixed(3),
    (c.kpi * D).toFixed(2),
    (c.caster * D).toFixed(2),
    (c.scrub * 1000).toFixed(1),
    (c.kingpinOffset * 1000).toFixed(1),
    c.mrSpring.toFixed(3),
    (lite.rolled.heightM * 1000).toFixed(0),
  ]);
  const axle = buildAxle(spec);
  const s = newCornerSample();
  const csv = ['travel_mm,camber_deg,toe_deg,camber_gain_deg_m,bump_steer_deg_m,roll_centre_mm,ic_front_y_mm,ic_front_z_mm,kpi_deg,caster_deg,scrub_mm,kingpin_offset_mm,mr_spring,plunge_mm,cv_inner_deg,cv_outer_deg'];
  for (let i = 0; i < axle.table.n; i++) {
    const z = axle.table.travel0 + i * axle.table.step;
    axle.sample('left', z, 0, s);
    csv.push(
      [z * 1000, s.camber * D, s.toe * D, s.camberGain * D, s.bumpSteer * D, s.rcHeight * 1000, s.icFrontY * 1000, s.icFrontZ * 1000, s.kpi * D, s.caster * D, s.scrub * 1000, s.kingpinOffset * 1000, s.mrSpring, s.plunge * 1000, s.cvInner * D, s.cvOuter * D]
        .map((x) => (Number.isFinite(x) ? x.toFixed(4) : ''))
        .join(','),
    );
  }
  writeFileSync(`${dir}/${name}.csv`, csv.join('\n') + '\n');
}
const widths = rows[0].map((_, j) => Math.max(...rows.map((r) => r[j].length)));
for (const r of rows) console.log(r.map((x, j) => x.padStart(widths[j])).join('  '));
console.log(`\ncurves: ${dir}/<template>.csv`);
