// A design as the core's gearbox: its teeth (teeth.ts), the layout description a catalogue record would hold
// (layouts/layshaft.ts, layouts/transaxle.ts) with the designer's layout rules, and the GearboxSpec with the
// synchronisers of the design. The 3D, the table drive and the solver read this spec like any catalogue spec.
//
// Layout rules [estimates, after the catalogue boxes]:
// - layshaft: the direct gear sits at the front of the first sleeve with the gear below it, the other gears pair off
//   from the top down and reverse shares the last sleeve or has its own (the E30's 4–5, 2–3, 1–R);
// - transaxle: gears pair off from first up, 1–2 loose on the output shaft (their input gears are cut on the shaft),
//   the higher pairs on the input shaft, reverse on the output shaft with the odd top gear or alone (the Civic's and the
//   911's arrangement); a front-wheel-drive car has a helical final drive beside the clutch, a rear-wheel-drive one a
//   crown wheel across the shafts, placed as in those two.

import type { GearboxLayout } from '../drivetrain/catalogue.ts';
import { centreDistance } from '../drivetrain/gear-geometry.ts';
import { layshaftSpec, type LayshaftDesc, type SleeveDesc } from '../drivetrain/layouts/layshaft.ts';
import { bevelSizes, transaxleSpec, type TransaxleDesc, type TransaxleSleeveDesc } from '../drivetrain/layouts/transaxle.ts';
import type { GearboxSpec, SynchroDef } from '../drivetrain/spec.ts';
import { buildGearbox, type Gearbox } from '../drivetrain/topology.ts';
import { mainTarget, targetRatios, type GearboxDesign, type SynchroMaterial } from './design.ts';
import {
  handFinal, handPair, handReverse, pickCylPair, pickFinal, pickReverse, type PickedFinal, type PickedPair, type PickedReverse,
} from './teeth.ts';

/** Every pair of a design, the targets they were picked for, and the constant-mesh ratio they were divided by. */
export interface DesignTeeth {
  /** Per forward gear; null for the direct gear. */
  speeds: Array<PickedPair | null>;
  /** Layshaft: the constant-mesh pair. */
  main: PickedPair | null;
  reverse: PickedReverse;
  /** Transaxle: the final drive in the case. */
  final: PickedFinal | null;
  /** Target of every forward gear's own ratio, first first. */
  targets: number[];
  /** Ratio of the constant-mesh pair (layshaft), else 1. */
  mainRatio: number;
}

/** A pair's face width: the design's width at its speed module, scaled with the pair's module. */
export const faceFor = (d: GearboxDesign, module: number): number => Math.round(((d.faceWidth * module) / d.module) * 10) / 10;

/** The ratio a pair set by hand gives a forward gear (a layshaft's through the constant-mesh pair), or null. */
export function handRatios(d: GearboxDesign): Array<number | null> {
  const main = d.type === 'layshaft' ? (d.mainPair ? d.mainPair.teeth[1] / d.mainPair.teeth[0] : null) : 1;
  return Array.from({ length: d.gears }, (_, i) => {
    const p = d.pairs[i];
    if (!p) return null;
    const own = p.teeth[1] / p.teeth[0];
    return main === null ? null : own * main;
  });
}

/**
 * Picks every pair the design leaves to the picker; throws when one cannot be picked (resolveGearboxDesign keeps a
 * resolved design clear of that).
 */
export function designTeeth(d: GearboxDesign): DesignTeeth {
  const layshaft = d.type === 'layshaft';
  const alpha = d.pressureAngle;
  const a = d.centreMm;
  const main = !layshaft
    ? null
    : d.mainPair
      ? handPair(d.mainPair)
      : pickCylPair({ ratio: mainTarget(targetRatios(d)[0]!), centreMm: a, module: d.mainModule, helix: d.helix, pressureAngle: alpha, faceWidth: faceFor(d, d.mainModule) });
  if (layshaft && !main) throw new Error(`designer: no constant-mesh pair at ${a} mm with module ${d.mainModule}`);
  const mainRatio = main ? main.ratio : 1;
  // Hand-set pairs fix their gears' ratios; the targets of the others step away from them.
  const fixed = Array.from({ length: d.gears }, (_, i) => (d.pairs[i] ? (d.pairs[i]!.teeth[1] / d.pairs[i]!.teeth[0]) * mainRatio : null));
  const targets = targetRatios(d, fixed);
  const speeds = targets.map((target, i) => {
    if (layshaft && d.directGear === i + 1) return null;
    const hand = d.pairs[i];
    if (hand) return handPair(hand);
    const module = i === 0 ? d.lowModule : d.module;
    const pick = pickCylPair({ ratio: target / mainRatio, centreMm: a, module, helix: d.helix, pressureAngle: alpha, faceWidth: faceFor(d, module) });
    if (!pick) throw new Error(`designer: no pair for gear ${i + 1} (${(target / mainRatio).toFixed(3)}) at ${a} mm with module ${module}`);
    return pick;
  });
  const reverse = d.reverse
    ? handReverse(d.reverse)
    : pickReverse(d.type, d.reverseRatio / mainRatio, a, d.lowModule, faceFor(d, d.lowModule), alpha);
  if (!reverse) throw new Error(`designer: no reverse for ${d.reverseRatio} at ${a} mm with module ${d.lowModule}`);
  const finalKind = d.drive === 'fwd' ? 'helical' : 'bevel';
  let final: PickedFinal | null = null;
  if (!layshaft) {
    final = d.finalPair ? handFinal(finalKind, d.finalPair) : pickFinal(finalKind, d.finalDrive, d.mainModule, d.helix, faceFor(d, d.mainModule), alpha);
    // A crown wheel's face is at most a third of its cone distance.
    if (finalKind === 'bevel') final = { ...final, faceWidth: Math.min(final.faceWidth, bevelMaxFace(final.module, final.teeth[0], final.teeth[1])) };
  }
  return { speeds, main, reverse, final, targets, mainRatio };
}

/** A crown wheel's widest face: a third of its outer cone distance (layouts/transaxle.ts throws past it). */
export const bevelMaxFace = (module: number, pinion: number, crown: number): number => Math.floor((bevelSizes(module, pinion, crown).cone / 3) * 10) / 10;

/** Sleeve and hub width, mm [layout estimate: the E30's 20 at module 1.75]. */
const sleeveWidth = (d: GearboxDesign): number => Math.max(14, Math.round(10 * d.module + 2));

function layshaftSleeves(n: number, direct: number): SleeveDesc[] {
  const sleeves: SleeveDesc[] = [];
  const id = (a: number | 'R', b: number | 'R' | null): string => (b === null ? String(a) : a === 'R' || (b !== 'R' && b < a) ? `${b}-${a}` : `${a}-${b}`);
  let rest = Array.from({ length: n }, (_, i) => n - i);
  if (direct) {
    const below = direct > 1 ? direct - 1 : null;
    sleeves.push({ id: id(direct, below), front: direct, back: below });
    rest = rest.filter((g) => g !== direct && g !== below);
  }
  for (let i = 0; i < rest.length; i += 2) {
    const front = rest[i]!;
    const back = rest[i + 1] ?? 'R';
    sleeves.push({ id: id(front, back), front, back });
  }
  if (rest.length % 2 === 0) sleeves.push({ id: 'R', front: 'R', back: null });
  return sleeves;
}

function transaxleSleeves(n: number): TransaxleSleeveDesc[] {
  const sleeves: TransaxleSleeveDesc[] = [];
  for (let g = 1; g <= n; g += 2) {
    const back = g + 1 <= n ? g + 1 : 'R';
    sleeves.push({ id: `${g}-${back}`, shaft: g <= 2 || back === 'R' ? 'output' : 'input', front: g, back });
  }
  if (n % 2 === 0) sleeves.push({ id: 'R', shaft: 'output', front: 'R', back: null });
  return sleeves;
}

/** The layout description of a design, as a catalogue record would hold it. */
export function designLayout(d: GearboxDesign, teeth = designTeeth(d)): GearboxLayout {
  const id = 'designer';
  const pair = (p: PickedPair) => ({ teeth: p.teeth, module: p.module, faceWidth: p.faceWidth, shift: p.shift });
  const r = teeth.reverse;
  if (d.type === 'layshaft') {
    const desc: LayshaftDesc = {
      id,
      centreMm: d.centreMm,
      pressureAngle: d.pressureAngle,
      counterHand: 'right',
      main: pair(teeth.main!),
      speeds: teeth.speeds.map((p) => (p ? pair(p) : 'direct')),
      reverse: {
        teeth: [r.teeth[0]!, r.teeth[1]!, r.teeth[2]!], module: r.module, helix: r.helix, faceWidth: r.faceWidth,
        shift: [r.shift[0] ?? 0, r.shift[1] ?? 0, r.shift[2] ?? 0], side: 1, engage: 'synchro',
      },
      sleeves: layshaftSleeves(d.gears, d.directGear),
      sleeveWidth: sleeveWidth(d),
      meshEfficiency: MESH_EFFICIENCY,
    };
    return { kind: 'layshaft', desc };
  }
  const f = teeth.final!;
  const desc: TransaxleDesc = {
    id,
    centreMm: d.centreMm,
    // The Civic's and the 911's places of the output shaft and the differential [layout estimates].
    outputDeg: d.drive === 'fwd' ? 216 : 180,
    pressureAngle: d.pressureAngle,
    inputHand: 'right',
    speeds: teeth.speeds.map((p) => ({ teeth: p!.teeth, module: p!.module, faceWidth: p!.faceWidth, shift: p!.shift })),
    reverse: {
      teeth: r.teeth.length === 4 ? [r.teeth[0]!, r.teeth[1]!, r.teeth[2]!, r.teeth[3]!] : [r.teeth[0]!, r.teeth[1]!, r.teeth[2]!],
      module: r.module, helix: r.helix, faceWidth: r.faceWidth, side: 1, engage: 'synchro',
    },
    sleeves: transaxleSleeves(d.gears),
    sleeveWidth: sleeveWidth(d),
    final:
      f.kind === 'helical'
        ? { kind: 'helical', teeth: f.teeth, module: f.module, faceWidth: f.faceWidth, centreMm: centreDistance(f.module, f.teeth[0], f.teeth[1], f.helix, d.pressureAngle), deg: 261 }
        : { kind: 'bevel', teeth: f.teeth, module: f.module, faceWidth: f.faceWidth, shift: f.shift, side: -1 },
    meshEfficiency: MESH_EFFICIENCY,
  };
  return { kind: 'transaxle', desc };
}

/** Rolling efficiency of every mesh, as in the catalogue records. */
export const MESH_EFFICIENCY = 0.99;

/** Friction of the cone by its lining [estimates: brass 0.10 is research §4.3; the coatings' "more friction" is unverified]. */
export const CONE_MU: Readonly<Record<SynchroMaterial, number>> = { brass: 0.1, molybdenum: 0.11, carbon: 0.13 };
/**
 * Synchroniser size follows the shafts [estimate]: the research example's 35 mm outer cone and 40 mm chamfers sit in
 * the E30's 76 mm box (elements.ts, ESTIMATED_SYNCHRO), so cone and chamfer radii scale with the centre distance.
 */
const CONE_SHARE = 35 / 76;
const CHAMFER_SHARE = 40 / 76;

/** The synchroniser of a gear with this many cones, everything else from the design. */
export function synchroOf(d: GearboxDesign, cones: 1 | 2 | 3): SynchroDef {
  return {
    cones,
    coneHalfAngle: d.coneAngle,
    coneRadius: CONE_SHARE * d.centreMm,
    coneWidth: 8,
    muCone: CONE_MU[d.synchroMaterial],
    chamfer: d.roofAngle / 2,
    chamferRadius: CHAMFER_SHARE * d.centreMm,
    muChamfer: 0.06,
    dogTeeth: 36,
    travel: 8,
  };
}

/** Everything in the design that changes what the 3D draws: the teeth, their places and the case. */
export function geometryKey(d: GearboxDesign): string {
  return JSON.stringify([
    d.type, d.gears, d.firstRatio, d.topRatio, d.progression, d.directGear, d.ratios, d.pairs, d.mainPair, d.reverseRatio, d.reverse,
    d.type === 'transaxle' ? [d.finalDrive, d.finalPair, d.drive] : null, d.module, d.lowModule, d.mainModule, d.pressureAngle, d.helix,
    d.faceWidth, d.centreMm,
  ]);
}

/** Everything the spec holds: the geometry and the synchronisers. */
const specKey = (d: GearboxDesign): string => JSON.stringify([geometryKey(d), d.cones, d.synchroMaterial, d.coneAngle, d.roofAngle]);

const specCache = new Map<string, { spec: GearboxSpec; teeth: DesignTeeth }>();

/** The design's spec and its teeth; the same object for the same design, so buildGearbox's cache holds. */
export function designBuild(d: GearboxDesign): { spec: GearboxSpec; teeth: DesignTeeth; box: Gearbox } {
  const key = specKey(d);
  let hit = specCache.get(key);
  if (!hit) {
    const teeth = designTeeth(d);
    const layout = designLayout(d, teeth);
    const base = layout.kind === 'layshaft' ? layshaftSpec(layout.desc) : transaxleSpec(layout.desc);
    const conesOf = (id: string): 1 | 2 | 3 => {
      const k = Number(id.slice('sync-'.length));
      return Number.isInteger(k) && k >= 1 ? (d.cones[k - 1] ?? 1) : 1;
    };
    const spec: GearboxSpec = { ...base, elements: base.elements.map((e) => (e.kind === 'synchro' ? { ...e, synchro: synchroOf(d, conesOf(e.id)) } : e)) };
    hit = { spec, teeth };
    if (specCache.size > 64) specCache.clear();
    specCache.set(key, hit);
  }
  return { ...hit, box: buildGearbox(hit.spec) };
}

/** The design as the core's GearboxSpec. */
export const designToSpec = (d: GearboxDesign): GearboxSpec => designBuild(d).spec;
