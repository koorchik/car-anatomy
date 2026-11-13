// Calibrates the road load of the cars without an EPA coast-down row and rewrites src/vehicle/road-load-trim.ts:
// `node scripts/calibrate-road-load.ts`. The rule is decision 13 of the gearbox plan (docs/vehicle-model.md):
// - k_EPA is the mean C_EPA / (½ρ·Cd·A) over cars that have both an EPA row and the maker's Cd and frontal area;
//   outside 1.0-1.4 the script stops, because then something is wrong with the list, not with the rule;
// - a car whose top speed no limiter holds and whose v_max is checked gets the C_dA at which the force at the wheels
//   just matches the road load at v_max: from the gearbox model in the best gear if the car can drive (its DriveCar
//   has dynamics, stage K2b), else from the lap's peak power;
// - any other car gets the maker's Cd·A times k_EPA.
// Rows are copied from the EPA test car lists as printed (lbf, lbf/mph, lbf/mph²); the cold CO rows, whose road load
// EPA raises by 10 %, are never used.

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CAR_LIST } from '../src/data/cars.ts';
import { driveCarById } from '../src/data/drive-cars.ts';
import { engineById, engineFacts } from '../src/data/engines.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { buildCarDrive } from '../src/drivetrain/car-model.ts';
import { bestWheelForce, steadyTopSpeed } from '../src/drivetrain/runs.ts';
import { DRIVELINE } from '../src/lubrication/scenario.ts';
import { lapTorqueCurve } from '../src/lubrication/torque.ts';
import type { CarRecord } from '../src/vehicle/car.ts';
import { AIR_DENSITY, G } from '../src/vehicle/constants.ts';
import { drivingMassKg } from '../src/vehicle/mass.ts';
import { topSpeed } from '../src/vehicle/powertrain.ts';
import { nonEpaRule, roadLoadCoeffs, roadLoadN, type RoadLoadTrim } from '../src/vehicle/road-load.ts';

/** An EPA target road load as the test car list prints it. */
export interface EpaRow {
  /** The list file and the test vehicle id. */
  list: string;
  vehicle: string;
  /** Equivalent test weight, lb. */
  etwLb: number;
  /** lbf, lbf/mph, lbf/mph². */
  A: number;
  B: number;
  C: number;
}

const LBF = 4.4482216;
const MPH = 0.44704;
const LB = 0.45359237;

/** An EPA row in SI: N, N/(m/s), N/(m/s)². */
export const epaSi = (row: EpaRow): { a: number; b: number; c: number } => ({ a: row.A * LBF, b: (row.B * LBF) / MPH, c: (row.C * LBF) / (MPH * MPH) });

/** The EPA row's force at a speed, N, computed in the list's own units. */
export const epaForceN = (row: EpaRow, v: number): number => {
  const mph = v / MPH;
  return (row.A + row.B * mph + row.C * mph * mph) * LBF;
};

interface KEpaCar {
  name: string;
  epa: EpaRow;
  /** The maker's drag coefficient and frontal area, m²; null where no maker's figure was found. */
  cd: number | null;
  areaM2: number | null;
  /** The maker's width without mirrors and height, m, for an area nobody published. */
  widthM: number | null;
  heightM: number | null;
  sources: string[];
  note: string;
}

const EPA_LISTS = {
  13: 'https://www.epa.gov/sites/default/files/2016-07/13tstcar.csv',
  14: 'https://www.epa.gov/sites/default/files/2016-07/14tstcar.csv',
  16: 'https://www.epa.gov/sites/default/files/2016-07/16tstcar.csv',
  18: 'https://www.epa.gov/sites/default/files/2018-10/18tstcar-2018-10-24.xlsx',
  25: 'https://www.epa.gov/system/files/documents/2026-01/25-testcar-2026-01-21.xlsx',
};

const IN = 0.0254;

/** Cars with an EPA row and the maker's aerodynamic figures: what k_EPA is fitted on. */
export const K_EPA_LIST: readonly KEpaCar[] = [
  {
    name: 'Porsche 911 Carrera (991.1), 7MT',
    epa: { list: '13tstcar.csv', vehicle: 'FE991-MT-12', etwLb: 3500, A: 31.473, B: 0.10999, C: 0.01764 },
    cd: 0.29,
    areaM2: null,
    widthM: 71.18 * IN,
    heightM: 51.3 * IN,
    sources: [EPA_LISTS[13], 'https://newsroom.porsche.com/dam/jcr:e1638451-d7dc-4f0e-a00d-b169cf342b86/2013_911_Technical_Specifications.pdf.PDF'],
    note: 'Porsche gives Cd, width and height; the area is estimated with areaShare',
  },
  {
    name: 'Porsche 911 Carrera T (992.2), 6MT',
    epa: { list: '25-testcar-2026-01-21.xlsx', vehicle: 'FE-992T-25', etwLb: 3875, A: 39.59, B: 0.4218, C: 0.01729 },
    cd: 0.3,
    areaM2: 2.07,
    widthM: 1.852,
    heightM: 1.302,
    sources: [EPA_LISTS[25], 'https://newsroom.porsche.com/dam/jcr:11fe5f1d-78a9-4b2f-8fe5-590255ba2379/pag-911-carrera-es.pdf'],
    note: "the figures are the 911 Carrera's (EU data sheet, 05/2024); the Carrera T shares its body, and EPA lists no Carrera coupe for 2025",
  },
  {
    name: 'Mercedes-Benz CLA 250 (C117), 7DCT',
    epa: { list: '14tstcar.csv', vehicle: 'C117E20DETC-Z4022', etwLb: 3625, A: 19.017, B: 0.38544, C: 0.014399 },
    cd: 0.22,
    areaM2: 2.19,
    widthM: null,
    heightM: null,
    sources: [EPA_LISTS[14], 'https://media.mercedes-benz.fr/download/a3710190-135f-4412-9cd3-7fd11375063d/pm_aerodynamics_en.pdf'],
    note: "Mercedes quotes the CLA's best Cd of 2013, not necessarily the US CLA 250's",
  },
  {
    name: 'Porsche 911 GT3 (991.2), 6MT',
    epa: { list: '18tstcar-2018-10-24.xlsx', vehicle: 'FE-991IIGT3-MT-18', etwLb: 3625, A: 34.396, B: 0.43415, C: 0.016303 },
    cd: 0.33,
    areaM2: null,
    widthM: 72.9 * IN,
    heightM: 50 * IN,
    sources: [EPA_LISTS[18], 'https://www.stuttcars.com/wp-content/uploads/2021/05/Porsche_US-911GT3_2018.pdf'],
    note: 'Porsche gives Cd, width and height; the area is estimated with areaShare; the wing makes downforce, which the coast-down sees and Cd may not',
  },
  {
    name: 'Mazda MX-5 (ND), 6MT',
    epa: { list: '16tstcar.csv', vehicle: '6ECPE31-034', etwLb: 2625, A: 26.252, B: 0.2757, C: 0.017475 },
    cd: null,
    areaM2: null,
    widthM: null,
    heightM: null,
    sources: [EPA_LISTS[16]],
    note: "Mazda's Cd and frontal area not found (Mazda press kits, Mazda Technical Review 2015); the row counts for the rolling part only",
  },
];

/** A k_EPA car's frontal area: the maker's, else areaShare × width × height; null when there is neither. */
const areaOf = (car: KEpaCar, areaShare: number): number | null =>
  car.areaM2 ?? (car.widthM !== null && car.heightM !== null ? areaShare * car.widthM * car.heightM : null);

export interface KEpaResult {
  name: string;
  areaM2: number | null;
  estimatedArea: boolean;
  k: number | null;
}

export interface Calibration {
  trim: RoadLoadTrim;
  list: KEpaResult[];
  /** Where each car without an EPA row got its C_dA. */
  solved: { id: string; rule: 'vmax' | 'brochure'; cdA: number; detail: string }[];
  source: string;
}

const round = (x: number, digits: number): number => Number(x.toFixed(digits));

/** A car the gearbox model can drive: its DriveCar has the dynamics of stage K2b. */
export const drives = (car: CarRecord): boolean => !!driveCarById(car.id)?.dynamics;

/** The lap's peak engine power, W: the engine model scaled to the published figure, so it follows engineFacts. */
function lapPeakPowerW(car: CarRecord): number {
  const spec = engineById(car.engine);
  if (!spec) throw new Error(`${car.id}: no engine ${car.engine}`);
  const design = designFromSpec(spec);
  return lapTorqueCurve(evaluate({ ...design, factory: null }).points, engineFacts(car.engine)?.powerHp ?? null).peakPowerW;
}

export function calibrateRoadLoad(cars: readonly CarRecord[] = CAR_LIST): Calibration {
  const withArea = K_EPA_LIST.filter((c) => c.areaM2 !== null && c.widthM !== null && c.heightM !== null);
  if (withArea.length === 0) throw new Error('k_EPA list: no car with the maker\'s area, width and height to set areaShare');
  const areaShare = withArea.reduce((s, c) => s + c.areaM2! / (c.widthM! * c.heightM!), 0) / withArea.length;

  const list: KEpaResult[] = K_EPA_LIST.map((car) => {
    const area = areaOf(car, areaShare);
    const k = car.cd !== null && area !== null ? epaSi(car.epa).c / (0.5 * AIR_DENSITY * car.cd * area) : null;
    return { name: car.name, areaM2: area, estimatedArea: car.areaM2 === null && area !== null, k };
  });
  const used = list.filter((r) => r.k !== null);
  if (used.length < 4) throw new Error(`k_EPA list: ${used.length} usable cars, the rule asks for at least four`);
  // The gearbox research names the 911 and the MX-5. A 911 must count towards k_EPA, not merely sit on the list; the
  // MX-5 stays on it for the rolling part until Mazda's Cd and area are found (docs/vehicle-model.md).
  if (!used.some((r) => r.name.includes('911'))) throw new Error('k_EPA list: no 911 of the gearbox research counts towards k_EPA');
  if (!K_EPA_LIST.some((c) => c.name.includes('MX-5'))) throw new Error('k_EPA list: the MX-5 of the gearbox research must stay on it');
  const kEpa = used.reduce((s, r) => s + r.k!, 0) / used.length;
  if (kEpa < 1 || kEpa > 1.4) {
    throw new Error(`k_EPA = ${kEpa.toFixed(3)} is outside 1.0-1.4: look for the reason in the list (a wrong row, a best-case Cd) instead of fitting`);
  }

  // Every row of the list counts for the rolling part, per kg of the test weight.
  const perKg = K_EPA_LIST.map((c) => ({ ...epaSi(c.epa), m: c.epa.etwLb * LB }));
  const rolling = {
    aPerKg: perKg.reduce((s, r) => s + r.a / r.m, 0) / perKg.length,
    bPerKg: perKg.reduce((s, r) => s + r.b / r.m, 0) / perKg.length,
  };

  const trim: RoadLoadTrim = { kEpa: round(kEpa, 4), rolling: { aPerKg: round(rolling.aPerKg, 5), bPerKg: round(rolling.bPerKg, 7) }, areaShare: round(areaShare, 4), cars: {} };
  const own: Record<string, { rule: 'vmax' | 'brochure'; cdA: number }> = {};
  const solved: Calibration['solved'] = [];
  for (const car of [...cars].sort((a, b) => a.id.localeCompare(b.id))) {
    if (car.roadLoad) continue;
    const rule = nonEpaRule(car);
    if (rule === null) throw new Error(`${car.id}: no EPA row, no checked unlimited v_max and no maker's Cd and area`);
    let cdA: number;
    let detail: string;
    if (rule === 'vmax') {
      const v = car.published.vmaxKmh / 3.6;
      const m = drivingMassKg(car);
      const rollingN = trim.rolling.aPerKg * m + trim.rolling.bPerKg * m * v;
      const geared = drives(car) ? bestWheelForce(buildCarDrive(car.id), v) : null;
      if (drives(car) && !geared) throw new Error(`${car.id}: the gearbox model cannot reach ${car.published.vmaxKmh} km/h below the rev limit`);
      if (geared) {
        cdA = (geared.force - rollingN) / (0.5 * AIR_DENSITY * v * v);
        detail = `the gearbox model pulls ${geared.force.toFixed(0)} N in gear ${geared.gear.name} at ${car.published.vmaxKmh} km/h`;
      } else {
        const power = lapPeakPowerW(car) * DRIVELINE.efficiency;
        cdA = (power / v - rollingN) / (0.5 * AIR_DENSITY * v * v);
        detail = `${(power / 1000).toFixed(1)} kW at the wheels holds ${car.published.vmaxKmh} km/h`;
      }
    } else {
      cdA = car.aero!.cd * car.aero!.areaM2 * trim.kEpa;
      detail = `Cd ${car.aero!.cd} x ${car.aero!.areaM2} m² x k_EPA`;
    }
    if (!(cdA > 0.3 && cdA < 1.5)) throw new Error(`${car.id}: C_dA ${cdA.toFixed(3)} m² is not a car's`);
    own[car.id] = { rule, cdA: round(cdA, 4) };
    solved.push({ id: car.id, rule, cdA: round(cdA, 4), detail });
  }
  trim.cars = own;

  const lines = Object.entries(own).map(([id, o]) => `    '${id}': { rule: '${o.rule}', cdA: ${o.cdA} },`);
  const source = [
    '// Generated by scripts/calibrate-road-load.ts: do not edit, run `node scripts/calibrate-road-load.ts` after changing',
    "// a car's record, its engine's published power, DRIVELINE or the k_EPA list. The rule and the list are in",
    '// docs/vehicle-model.md.',
    "import type { RoadLoadTrim } from './road-load.ts';",
    '',
    'export const ROAD_LOAD_TRIM: RoadLoadTrim = {',
    `  kEpa: ${trim.kEpa},`,
    `  rolling: { aPerKg: ${trim.rolling.aPerKg}, bPerKg: ${trim.rolling.bPerKg} },`,
    `  areaShare: ${trim.areaShare},`,
    '  cars: {',
    ...lines,
    '  },',
    '};',
    '',
  ].join('\n');
  return { trim, list, solved, source };
}

/**
 * Rows like the gearbox research's table: the road load each car of the site gets, and the lap's top speed with it
 * at peak power against the published one. For a v_max car that is the calibration itself; for the others it is the
 * independent check of the gearbox plan (EPA cars without a limiter within 7 %).
 */
function report(cal: Calibration): void {
  console.log('k_EPA list: C_EPA / (½ρ·Cd·A)');
  for (const r of cal.list) {
    const area = r.areaM2 === null ? '—' : `${r.areaM2.toFixed(3)} m²${r.estimatedArea ? ' (est.)' : ''}`;
    console.log(`  ${r.name.padEnd(38)} A ${area.padEnd(18)} k ${r.k === null ? '— (no maker Cd and area)' : r.k.toFixed(3)}`);
  }
  console.log(`k_EPA ${cal.trim.kEpa}, areaShare ${cal.trim.areaShare}, rolling a/m ${cal.trim.rolling.aPerKg} N/kg, b/m ${cal.trim.rolling.bPerKg} N·s/(m·kg)`);
  for (const s of cal.solved) console.log(`  ${s.id}: ${s.rule}, C_dA ${s.cdA} m² (${s.detail})`);
  console.log('\ncar                          rule      mass kg   a N    b N·s/m  c N·s²/m²  C_dA m²  F 100 km/h  F 200 km/h  v_max model/published km/h');
  for (const car of CAR_LIST) {
    const rl = roadLoadCoeffs(car, cal.trim);
    const rule = car.roadLoad ? 'epa' : cal.trim.cars[car.id]!.rule;
    const f = (kmh: number): string => roadLoadN(rl, kmh / 3.6, 0).toFixed(0).padStart(10);
    const lap = topSpeed({ roadLoad: rl }, lapPeakPowerW(car), DRIVELINE.efficiency) * 3.6;
    // A car the gearbox model drives reaches its top speed there; the lap's ideal gearbox comes after it (K7).
    const vmax = drives(car) ? steadyTopSpeed(buildCarDrive(car.id), rl).v * 3.6 : lap;
    const off = `${vmax >= car.published.vmaxKmh ? '+' : ''}${((vmax / car.published.vmaxKmh - 1) * 100).toFixed(1)} %${drives(car) ? ` (gearbox; lap ${lap.toFixed(0)})` : ''}`;
    console.log(
      `${car.id.padEnd(28)} ${rule.padEnd(8)} ${rl.massKg.toFixed(0).padStart(7)} ${rl.a.toFixed(0).padStart(6)} ${rl.b.toFixed(2).padStart(8)} ${rl.c.toFixed(4).padStart(10)} ${((2 * rl.c) / AIR_DENSITY).toFixed(3).padStart(8)} ${f(100)} ${f(200)}  ${vmax.toFixed(0)}/${car.published.vmaxKmh} (${off})  (C_rr equiv. ${(rl.a / (rl.massKg * G)).toFixed(4)})`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const cal = calibrateRoadLoad();
  writeFileSync('src/vehicle/road-load-trim.ts', cal.source);
  report(cal);
}
