// Starting points of the gearbox designer: a copy of every catalogue gearbox that sits in a car of the site, and a few
// deliberately odd boxes from the plan (a straight-cut racing box, ten speeds, a single cone on first).
//
// A copy keeps the record's teeth as pairs set by hand, so it is the catalogue box tooth for tooth, and the record's
// car as its car: the same engine, mass, tyre and road load (drivetrain-vehicle 7 drives both). Its ladder is fitted
// to its ratios, so taking a pair back to the picker changes little. What the records do not say (synchronisers,
// damper, the Civic's clutch, the differentials' missing values) is the core's estimate, as the whole model takes it.

import { CARS } from '../data/cars.ts';
import { driveCarById } from '../data/drive-cars.ts';
import { engineById } from '../data/engines.ts';
import { ALL_GEARBOXES } from '../data/gearboxes.ts';
import { catalogueTorqueMap } from '../designer/torque-map.ts';
import type { GearboxRecord } from '../drivetrain/catalogue.ts';
import { dryClutch } from '../drivetrain/elements.ts';
import { helixForCentre } from '../drivetrain/gear-geometry.ts';
import { peakTorque } from '../engine/torque-map.ts';
import { t } from '../i18n/t.ts';
import { drivingMassKg } from '../vehicle/car.ts';
import { AIR_DENSITY, G } from '../vehicle/constants.ts';
import { roadLoadCoeffs } from '../vehicle/road-load.ts';
import { drivenSize, resolveGearboxDesign } from './constraints.ts';
import { DEFAULT_GEARBOX_DESIGN, ladder, type GearboxDesign, type GearboxType, type PairSetting } from './design.ts';

/** Porsche's US specifications give the 911 Carrera T's manual a 9.0 in (229 mm) clutch; the others take the core's 228 mm. */
const PUBLISHED_CLUTCH_MM: Readonly<Record<string, number>> = { 'porsche-911-carrera-t-992': 229 };
const DEFAULT_CLUTCH_MM = 228;

/** Progression that brings the ladder nearest these ratios, in the logarithm, to a hundredth. */
function fitProgression(d: GearboxDesign, ratios: number[]): number {
  let best = { p: 0, err: Infinity };
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const l = ladder({ ...d, progression: p });
    const err = l.reduce((s, v, k) => s + (Math.log(v) - Math.log(ratios[k]!)) ** 2, 0);
    if (err < best.err) best = { p, err };
  }
  return best.p;
}

const mostCommon = (values: number[]): number => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
};

/** A catalogue gearbox in its car as a design. */
export function designFromRecord(record: GearboxRecord): GearboxDesign {
  if (!record.car) throw new Error(`${record.id} sits in no car`);
  const car = CARS[record.car]!;
  const drive = driveCarById(record.car);
  if (!drive) throw new Error(`no DriveCar for ${record.car}`);
  const layout = record.layout;
  const alpha = layout.desc.pressureAngle;
  const a = layout.desc.centreMm;
  const pair = (p: { teeth: [number, number]; module: number; faceWidth: number; shift?: [number, number] }): PairSetting => ({
    teeth: [p.teeth[0], p.teeth[1]], module: p.module, faceWidth: p.faceWidth, shift: p.shift ? [p.shift[0], p.shift[1]] : [0, 0],
  });
  const speeds = layout.kind === 'layshaft' ? layout.desc.speeds : layout.desc.speeds;
  const pairs = speeds.map((s) => (s === 'direct' ? null : pair(s)));
  const directGear = layout.kind === 'layshaft' ? layout.desc.speeds.indexOf('direct') + 1 : 0;
  const main = layout.kind === 'layshaft' ? pair(layout.desc.main) : null;
  const mainRatio = main ? main.teeth[1] / main.teeth[0] : 1;
  const ratios = pairs.map((p) => (p ? (p.teeth[1] / p.teeth[0]) * mainRatio : 1));
  const helices = pairs.flatMap((p) => (p ? [helixForCentre(a, p.module, p.teeth[0], p.teeth[1], alpha, p.shift[0] + p.shift[1])] : []));
  const modules = pairs.slice(1).flatMap((p) => (p ? [p.module] : []));
  const module = mostCommon(modules);
  const faceAtModule = pairs.find((p, i) => i > 0 && p && p.module === module)!.faceWidth;
  const r = layout.desc.reverse!;
  const rl = roadLoadCoeffs(car);
  const m = drivingMassKg(car);
  const engine = engineById(car.engine)!;
  const clutchMm = PUBLISHED_CLUTCH_MM[car.id] ?? drive.dynamics?.clutch.outerMm ?? DEFAULT_CLUTCH_MM;
  const clampN = drive.dynamics?.clutch.clampN ?? dryClutch(peakTorque(catalogueTorqueMap(engine)).nm, clutchMm, (2 * clutchMm) / 3).clampN;
  const diff = drive.differential;
  const final = layout.kind === 'transaxle' ? layout.desc.final : null;
  const d: GearboxDesign = {
    ...DEFAULT_GEARBOX_DESIGN,
    name: `${record.name} · ${car.name}`,
    type: layout.kind as GearboxType,
    gears: pairs.length,
    firstRatio: ratios[0]!,
    topRatio: ratios[ratios.length - 1]!,
    directGear,
    ratios: pairs.map(() => null),
    pairs,
    mainPair: main,
    reverseRatio: record.published.reverse ?? DEFAULT_GEARBOX_DESIGN.reverseRatio,
    reverse: { teeth: [...r.teeth], module: r.module, helix: r.helix, faceWidth: r.faceWidth },
    finalDrive: layout.kind === 'layshaft' ? drive.finalDrive.ratio : (record.published.finalDrive ?? final!.teeth[1] / final!.teeth[0]),
    finalPair: !final
      ? null
      : final.kind === 'helical'
        ? { teeth: [final.teeth[0], final.teeth[1]], module: final.module, faceWidth: final.faceWidth, helix: helixForCentre(final.centreMm, final.module, final.teeth[0], final.teeth[1], alpha), shift: 0 }
        : { teeth: [final.teeth[0], final.teeth[1]], module: final.module, faceWidth: final.faceWidth, helix: 0, shift: final.shift },
    module,
    lowModule: pairs[0]!.module,
    mainModule: main ? main.module : final!.module,
    pressureAngle: alpha,
    helix: Math.round(helices.reduce((s, h) => s + h, 0) / helices.length),
    faceWidth: faceAtModule,
    centreMm: a,
    cones: pairs.map(() => 1),
    clutchMm,
    clampN,
    diff: diff.kind === 'plate' || diff.kind === 'open' || diff.kind === 'locked' ? diff.kind : diff.kind === 'torsen' || diff.kind === 'helical' ? 'helical' : 'open',
    lockDrive: diff.kind === 'plate' ? (diff.lockDrive ?? DEFAULT_GEARBOX_DESIGN.lockDrive) : DEFAULT_GEARBOX_DESIGN.lockDrive,
    lockCoast: diff.kind === 'plate' ? (diff.lockCoast ?? DEFAULT_GEARBOX_DESIGN.lockCoast) : DEFAULT_GEARBOX_DESIGN.lockCoast,
    preloadNm: diff.kind === 'plate' || diff.kind === 'torsen' || diff.kind === 'helical' ? (diff.preloadNm ?? 0) : 0,
    tbr: diff.kind === 'torsen' || diff.kind === 'helical' ? (diff.tbr ?? DEFAULT_GEARBOX_DESIGN.tbr) : DEFAULT_GEARBOX_DESIGN.tbr,
    car: car.id,
    engine: car.engine,
    massKg: m,
    drive: car.drive === 'fwd' ? 'fwd' : 'rwd',
    frontShare: car.body.frontShare,
    tyreSize: drivenSize(car.id, car.drive === 'fwd' ? 'fwd' : 'rwd'),
    tyre: car.tyre.id,
    cdA: (2 * rl.c) / AIR_DENSITY,
    crr: rl.a / (m * G),
    factory: { gearbox: record.id },
  };
  d.progression = fitProgression(d, ratios);
  return resolveGearboxDesign(d);
}

export interface GearboxPreset {
  id: string;
  name: string;
  design: GearboxDesign;
}

/** Copies of the catalogue: every gearbox record that sits in a car of the site. */
export const catalogueGearboxPresets = (): GearboxPreset[] =>
  ALL_GEARBOXES.filter((g) => g.car && driveCarById(g.car)).map((g) => ({ id: g.id, name: designFromRecord(g).name, design: designFromRecord(g) }));

/**
 * Moves a design to another type with what that type usually has: a layshaft box drives the rear wheels through a
 * propshaft and may have a direct gear; a transaxle has neither, and its final drive's module is a crown wheel's on a
 * rear-wheel-drive car. Hand-set teeth belong to the old shafts and go back to the picker.
 */
export function withGearboxType(d: GearboxDesign, type: GearboxType): GearboxDesign {
  const drive = type === 'layshaft' ? 'rwd' : d.drive;
  return resolveGearboxDesign({
    ...d,
    type,
    drive,
    directGear: type === 'layshaft' ? (d.topRatio >= 0.999 ? d.gears : 0) : 0,
    pairs: d.pairs.map(() => null),
    mainPair: null,
    reverse: null,
    finalPair: null,
    mainModule: type === 'transaxle' && drive === 'rwd' ? 6.5 : type === 'transaxle' ? 2.5 : 2,
    tyreSize: drivenSize(d.car, drive),
    factory: null,
  });
}

/** The odd boxes of the plan. Their numbers are the designer's own, not a real car's. */
export function oddGearboxPresets(): GearboxPreset[] {
  const D = DEFAULT_GEARBOX_DESIGN;
  const civic = ALL_GEARBOXES.find((g) => g.car === 'civic-type-r-fk8')!;
  const civicCar = designFromRecord(civic);
  const generic = (over: Partial<GearboxDesign>, n: number): GearboxDesign =>
    resolveGearboxDesign({ ...D, ...over, gears: n, ratios: Array(n).fill(null), pairs: Array(n).fill(null), cones: over.cones ?? Array(n).fill(1) });
  return [
    {
      // Straight-cut teeth: no axial force and a little more efficiency, a coarse module for strength, close ratios,
      // and the whine. The ratios sit on the coarser grid spur pairs allow.
      id: 'spur-race',
      name: t('Прямозуба гоночна'),
      design: generic({ name: t('Прямозуба гоночна'), helix: 0, module: 2.25, lowModule: 2.5, mainModule: 2.5, faceWidth: 22, centreMm: 80, firstRatio: 2.5, topRatio: 1, directGear: 5, progression: 0.6 }, 5),
    },
    {
      id: 'ten-speed',
      name: t('Десять передач'),
      design: generic({ name: t('Десять передач'), firstRatio: 5, topRatio: 0.75, directGear: 0, progression: 0.3, centreMm: 84 }, 10),
    },
    {
      // Triple cones where the speed gaps are widest, as on the DQ250's 1–3 (research §4.1), but a single one on first:
      // the downshift into first is the slow one.
      id: 'single-cone-first',
      name: t('Один конус на першій'),
      design: resolveGearboxDesign({
        ...civicCar, name: t('Один конус на першій'), pairs: civicCar.pairs.map(() => null), reverse: null, finalPair: null, factory: null,
        cones: [1, 3, 3, 2, 1, 1],
      }),
    },
  ];
}
