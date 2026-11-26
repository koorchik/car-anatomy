// The settings panel of a two-shaft transaxle page (owner decision A3 of the build order, stage K6a-geom): the same
// box with other ratios, 4 to 7 speeds and another final drive, seen at once in 3D and in the figures. The layshaft
// page's model of the same panel is layshaft-setup.ts; this one differs where the layout does:
// - every speed is one pair, so a speed's ratio is its pair's, with no constant-mesh pair in front of it;
// - the final drive is a pair inside the case, so another final drive is other teeth on it: the helical pair keeps
//   its centre distance and module (the helix closes the distance), the crown wheel and pinion keep their module and
//   stay near the factory pair's size;
// - a loose gear may turn on either shaft (its sleeve's shaft), and it turns on a needle bearing, so under its teeth
//   there must be room for the bearing and a rim;
// - an added speed takes a free side of a sleeve already there (the 911's seventh shares the reverse sleeve on the
//   output shaft), and only without one a new sleeve on the input shaft.
//
// The setup holds only what the visitor changed, and the description is derived from the factory one each time
// (setupDesc), so the factory setup gives the factory box back exactly.

import { gearGeometry, helixForCentre } from '../gear-geometry.ts';
import { pairCandidates } from '../gear-pick.ts';
import { bevelSizes, TRANSAXLE_SHAFTS, type TransaxleDesc, type TransaxleFinalDesc, type TransaxlePairDesc, type TransaxleSleeveDesc } from './transaxle.ts';

/** Speed counts the panel offers: the 911's seven at most (the brief of K6a-geom). */
export const TRANSAXLE_SPEEDS: readonly number[] = [4, 5, 6, 7];
/** Final drive range of the panel, as on the layshaft page. */
export const TRANSAXLE_FINAL_RANGE: readonly [number, number] = [2, 5.5];
/** A speed's ratio range on its slider: the 911's seventh is 0.62. */
export const TRANSAXLE_RATIO_RANGE: readonly [number, number] = [0.5, 5];
/** Helix angles a re-toothed speed pair or helical final drive may take, degrees (as layshaft-setup.ts). */
export const TRANSAXLE_HELIX: [number, number] = [15, 35];
/** Fewest teeth on a speed gear and on a helical final drive's pinion. */
const MIN_TEETH = 12;
/** Fewest teeth on a crown wheel's pinion: the 911's has 9, with a long addendum. */
const MIN_BEVEL_PINION = 8;
/** How far a re-toothed crown wheel and pinion's cone distance may stray from the factory pair's, in teeth (hypot). */
const BEVEL_SIZE_SPAN = 12;
/**
 * The rim a loose gear keeps between its root circle and the needle bearing in its bore, in modules: half the tooth
 * height of 2.25 modules, the thinnest rim AGMA 2001's rim thickness factor still admits (backup ratio 0.5) [to verify].
 */
const RIM_MODULES = 0.5 * 2.25;

export interface TransaxleSetup {
  /** Forward speeds. */
  speeds: number;
  /** Teeth set on the panel, by speed index from 0. Speeds left out keep their pair. */
  teeth: Readonly<Record<number, readonly [number, number]>>;
  /** The final drive's teeth (pinion, ring gear) when changed; null keeps the factory pair. */
  final: readonly [number, number] | null;
}

export const factoryTransaxleSetup = (factory: TransaxleDesc): TransaxleSetup => ({ speeds: factory.speeds.length, teeth: {}, final: null });

/** Teeth set for a speed the box has now: an added speed's teeth wait in the setup after the count drops again. */
const editsShown = (setup: TransaxleSetup): number => Object.keys(setup.teeth).filter((i) => Number(i) < setup.speeds).length;

export const isFactoryTransaxle = (factory: TransaxleDesc, setup: TransaxleSetup): boolean =>
  setup.speeds === factory.speeds.length && editsShown(setup) === 0 && setup.final === null;

/** A speed's own ratio: output gear over input gear. */
export const transaxleRatios = (desc: TransaxleDesc): number[] => desc.speeds.map((s) => s.teeth[1] / s.teeth[0]);

/** The final drive's ratio from its teeth. */
export const transaxleFinal = (desc: TransaxleDesc): number => desc.final.teeth[1] / desc.final.teeth[0];

/** The helix that closes the centre distance with these teeth, degrees; NaN when none does. */
export function transaxleHelix(desc: TransaxleDesc, pair: TransaxlePairDesc, teeth: readonly [number, number]): number {
  const shift = pair.shift ?? [0, 0];
  return helixForCentre(desc.centreMm, pair.module, teeth[0], teeth[1], desc.pressureAngle, shift[0] + shift[1]);
}

/** The shaft a speed's gear turns loose on, from its sleeve. */
const looseShaft = (desc: TransaxleDesc, index: number): 'input' | 'output' =>
  desc.sleeves.find((s) => s.front === index + 1 || s.back === index + 1)?.shaft ?? 'input';

/**
 * Whether speed `index` with these teeth can be built and drawn: a helix within TRANSAXLE_HELIX closes the centre
 * distance, and the loose gear's root circle leaves room for its shaft and needle bearing as transaxle-model.ts draws
 * them (TRANSAXLE_SHAFTS) plus a rim of RIM_MODULES. The fixed gear may be cut on its shaft, which the model then
 * draws thinner.
 */
export function transaxlePairFits(desc: TransaxleDesc, index: number, pair: TransaxlePairDesc, teeth: readonly [number, number]): boolean {
  if (teeth[0] < MIN_TEETH || teeth[1] < MIN_TEETH) return false;
  const helix = transaxleHelix(desc, pair, teeth);
  if (!Number.isFinite(helix) || helix < TRANSAXLE_HELIX[0] - 1e-9 || helix > TRANSAXLE_HELIX[1] + 1e-9) return false;
  const shift = pair.shift ?? [0, 0];
  const onInput = looseShaft(desc, index) === 'input';
  const which = onInput ? 0 : 1;
  const rf = gearGeometry({ teeth: teeth[which], module: pair.module, helix, pressureAngle: desc.pressureAngle, shift: shift[which], faceWidth: pair.faceWidth }).rf;
  const bore = ((onInput ? TRANSAXLE_SHAFTS.input : TRANSAXLE_SHAFTS.output) + TRANSAXLE_SHAFTS.needle) * desc.centreMm;
  return rf >= bore + RIM_MODULES * pair.module;
}

function fittingPairs(desc: TransaxleDesc, index: number, pair: TransaxlePairDesc, ratio: number, coprime: boolean) {
  const shift = pair.shift ?? [0, 0];
  return pairCandidates({
    ratio,
    centreMm: desc.centreMm,
    module: pair.module,
    helixRange: TRANSAXLE_HELIX,
    pressureAngle: desc.pressureAngle,
    shiftSum: shift[0] + shift[1],
    minTeeth: MIN_TEETH,
    coprime,
  }).filter((p) => transaxlePairFits(desc, index, pair, p.teeth));
}

/**
 * Teeth for a speed's ratio: the nearest coprime pair that fits, else the nearest of any; null when none fits. The
 * factory pair of that speed (`factory`) is a candidate too, so the slider finds it again even where the factory
 * gears are finer than the panel's rules (the 911's first has an 11-tooth gear with a long addendum).
 */
export function transaxleTeethForRatio(desc: TransaxleDesc, index: number, ratio: number, factory?: TransaxleDesc): [number, number] | null {
  const pair = desc.speeds[index];
  if (!pair) return null;
  const pick = fittingPairs(desc, index, pair, ratio, true)[0] ?? fittingPairs(desc, index, pair, ratio, false)[0];
  const own = factory?.speeds[index];
  const ownFits = own !== undefined && own.module === pair.module && own.faceWidth === pair.faceWidth;
  if (ownFits && (!pick || Math.abs(own.teeth[1] / own.teeth[0] - ratio) <= Math.abs(pick.ratio - ratio))) return [own.teeth[0], own.teeth[1]];
  return pick ? [pick.teeth[0], pick.teeth[1]] : null;
}

/**
 * One tooth more or less on one gear of a speed (which: 0 the input-shaft gear, 1 the output-shaft gear): kept when
 * the centre distance takes it, otherwise the nearest pair that moves the ratio the same way. Null when none does.
 */
export function transaxleStepTeeth(desc: TransaxleDesc, index: number, which: 0 | 1, delta: 1 | -1): [number, number] | null {
  const pair = desc.speeds[index];
  if (!pair) return null;
  const next: [number, number] = [pair.teeth[0], pair.teeth[1]];
  next[which] += delta;
  if (transaxlePairFits(desc, index, pair, next)) return next;
  const now = pair.teeth[1] / pair.teeth[0];
  const wanted = next[1] / next[0];
  const up = wanted > now;
  const pick = fittingPairs(desc, index, pair, wanted, false).find((p) => (up ? p.ratio > now + 1e-9 : p.ratio < now - 1e-9));
  return pick ? [pick.teeth[0], pick.teeth[1]] : null;
}

/**
 * Teeth of the final drive nearest a ratio. A helical pair keeps its centre distance and module, so its tooth sum is
 * what a helix of 15–35° allows. A crown wheel and pinion keep their module and a cone distance near the factory
 * pair's, and the face must stay within a third of the cone distance (transaxleSpec checks the same).
 */
export function finalTeethForRatio(factory: TransaxleFinalDesc, ratio: number): [number, number] | null {
  if (factory.kind === 'helical') {
    const pick = pairCandidates({ ratio, centreMm: factory.centreMm, module: factory.module, helixRange: TRANSAXLE_HELIX, minTeeth: MIN_TEETH, coprime: false })[0];
    return pick ? [pick.teeth[0], pick.teeth[1]] : null;
  }
  const size0 = Math.hypot(factory.teeth[0], factory.teeth[1]);
  let best: { teeth: [number, number]; cost: number } | null = null;
  for (let zp = MIN_BEVEL_PINION; zp <= 30; zp++) {
    const zc = Math.round(ratio * zp);
    const size = Math.hypot(zp, zc);
    if (Math.abs(size - size0) > BEVEL_SIZE_SPAN) continue;
    if (factory.faceWidth > bevelSizes(factory.module, zp, zc).cone / 3) continue;
    // The ratio first; among equals the size nearest the factory pair's.
    const cost = Math.abs(zc / zp - ratio) + 1e-4 * Math.abs(size - size0);
    if (!best || cost < best.cost - 1e-12) best = { teeth: [zp, zc], cost };
  }
  return best?.teeth ?? null;
}

/**
 * The same box with another speed count: a speed taken off the top (its sleeve side freed, an empty sleeve dropped),
 * or a speed added from the top step continued geometrically (i_new = i_top²/i_below) at the finest pair's module
 * and the narrowest face, on a free side of a sleeve already there (input shaft first, then output), or on a new
 * input-shaft sleeve at the back. A shared sleeve also keeps the 3D within its draw budget: the Civic's seventh
 * shares the reverse sleeve, as the 911's does.
 */
export function withTransaxleSpeedCount(desc: TransaxleDesc, count: number): TransaxleDesc {
  const [lo, hi] = [TRANSAXLE_SPEEDS[0]!, TRANSAXLE_SPEEDS[TRANSAXLE_SPEEDS.length - 1]!];
  if (!Number.isInteger(count) || count < lo || count > hi) throw new Error(`${desc.id}: ${count} speeds; the panel gives ${lo}–${hi}`);
  let speeds = [...desc.speeds];
  let sleeves: TransaxleSleeveDesc[] = desc.sleeves.map((s) => ({ ...s }));
  while (speeds.length > count) {
    const top = speeds.length;
    speeds = speeds.slice(0, -1);
    sleeves = sleeves
      .map((s) => ({ ...s, front: s.front === top ? null : s.front, back: s.back === top ? null : s.back }))
      .filter((s) => s.front !== null || s.back !== null);
  }
  while (speeds.length < count) {
    const n = speeds.length;
    const ratios = speeds.map((s) => s.teeth[1] / s.teeth[0]);
    const wanted = ratios[n - 1]! ** 2 / ratios[n - 2]!;
    const finest = speeds.reduce((p, q) => (q.module < p.module ? q : p));
    const face = Math.min(...speeds.map((s) => s.faceWidth));
    sleeves = placeSpeed(sleeves, n + 1);
    const grown: TransaxleDesc = { ...desc, speeds: [...speeds, { teeth: finest.teeth, module: finest.module, faceWidth: face }], sleeves };
    const teeth = transaxleTeethForRatio(grown, n, wanted);
    if (!teeth) throw new Error(`${desc.id}: no pair for speed ${n + 1} at ${desc.centreMm} mm with module ${finest.module}`);
    speeds = [...speeds, { teeth, module: finest.module, faceWidth: face }];
  }
  return { ...desc, speeds, sleeves };
}

function placeSpeed(sleeves: TransaxleSleeveDesc[], speed: number): TransaxleSleeveDesc[] {
  const freeOn = (shaft: 'input' | 'output') => sleeves.findIndex((s) => s.shaft === shaft && (s.front === null || s.back === null));
  const free = freeOn('input') >= 0 ? freeOn('input') : freeOn('output');
  if (free < 0) return [...sleeves, { id: String(speed), shaft: 'input', front: speed, back: null }];
  return sleeves.map((s, i) => (i !== free ? s : s.back === null ? { ...s, back: speed } : { ...s, front: speed }));
}

const withTeeth = (setup: TransaxleSetup, speed: TransaxlePairDesc, index: number): TransaxlePairDesc => {
  const teeth = setup.teeth[index];
  return teeth ? { ...speed, teeth: [teeth[0], teeth[1]] } : speed;
};

/** The description as set: the factory pairs with the panel's teeth, then the speed count, then the final drive. */
export function transaxleSetupDesc(factory: TransaxleDesc, setup: TransaxleSetup): TransaxleDesc {
  const own = factory.speeds.length;
  const edited: TransaxleDesc = { ...factory, speeds: factory.speeds.map((s, i) => withTeeth(setup, s, i)) };
  const counted = setup.speeds === own ? edited : withTransaxleSpeedCount(edited, setup.speeds);
  const speeds = counted.speeds.map((s, i) => (i >= own ? withTeeth(setup, s, i) : s));
  const final = setup.final ? { ...factory.final, teeth: [setup.final[0], setup.final[1]] as [number, number] } : factory.final;
  return isFactoryTransaxle(factory, setup) ? factory : { ...counted, speeds, final };
}

/** The setup with a speed's teeth set; the factory pair's teeth drop the entry, and no change gives the same setup back. */
export function setTransaxleTeeth(factory: TransaxleDesc, setup: TransaxleSetup, index: number, teeth: readonly [number, number]): TransaxleSetup {
  const own = factory.speeds[index];
  const same = own !== undefined && own.teeth[0] === teeth[0] && own.teeth[1] === teeth[1];
  const was = setup.teeth[index];
  if (same ? was === undefined : was !== undefined && was[0] === teeth[0] && was[1] === teeth[1]) return setup;
  const next: Record<number, readonly [number, number]> = { ...setup.teeth };
  if (same) delete next[index];
  else next[index] = [teeth[0], teeth[1]];
  return { ...setup, teeth: next };
}

export const setTransaxleSpeeds = (setup: TransaxleSetup, speeds: number): TransaxleSetup => (speeds === setup.speeds ? setup : { ...setup, speeds });

/** The setup with the final drive's teeth nearest a ratio, held to the panel's range; the same setup when they do not change. */
export function setTransaxleFinal(factory: TransaxleDesc, setup: TransaxleSetup, ratio: number): TransaxleSetup {
  const held = Math.min(TRANSAXLE_FINAL_RANGE[1], Math.max(TRANSAXLE_FINAL_RANGE[0], ratio));
  const teeth = finalTeethForRatio(factory.final, held);
  if (!teeth) return setup;
  const own = factory.final.teeth;
  const final = teeth[0] === own[0] && teeth[1] === own[1] ? null : teeth;
  const was = setup.final;
  if (final === was || (final && was && final[0] === was[0] && final[1] === was[1])) return setup;
  return { ...setup, final };
}

/** Whether two setups give the same box. */
export const sameTransaxle = (a: TransaxleSetup, b: TransaxleSetup): boolean => a.speeds === b.speeds && a.teeth === b.teeth && a.final === b.final;
