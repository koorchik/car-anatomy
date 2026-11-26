// The settings panel of a layshaft gearbox page (owner decision A3 of the build order): the same box with other
// ratios, 4, 5 or 6 speeds and another final drive, seen at once in 3D and in the figures.
//
// The setup holds only what the visitor changed; the description the core and the 3D build from is derived from the
// factory one each time (setupDesc), so «Заводські» is the empty setup and gives the factory box back exactly.
//
// Every pair keeps the box's centre distance, its own module and its pressure angle: only the teeth change, and the
// helix angle is what closes the centre distance with them, within SETUP_HELIX. A ratio asked on the slider is
// re-toothed by gear-pick; a tooth stepped by hand stays as it is when the centre distance still takes the tooth sum,
// and otherwise gear-pick re-teeth the pair for the ratio the step asked for. Either way both gears must still sit on
// their shafts as the 3D draws them (gearbox-model.ts: a loose gear turns on the output shaft, 0.2 of the centre
// distance across), so a slider never leaves the box undrawable.

import { gearGeometry, helixForCentre } from '../gear-geometry.ts';
import { pairCandidates } from '../gear-pick.ts';
import type { LayshaftDesc, PairDesc } from './layshaft.ts';
import { withSpeedCount } from './layshaft-speeds.ts';

/** Speed counts the panel offers. */
export const SETUP_SPEEDS: readonly number[] = [4, 5, 6];
/** Final drive range of the panel. */
export const FINAL_DRIVE_RANGE: readonly [number, number] = [2, 5.5];
/** Overall ratio range of a speed's slider. */
export const RATIO_RANGE: readonly [number, number] = [0.6, 5];
/** Helix angles a re-toothed pair may take, degrees: the range layshaft-speeds.ts adds speeds with. */
export const SETUP_HELIX: [number, number] = [15, 35];
/** Fewest teeth on a gear of the panel. */
const MIN_TEETH = 12;
/** A gear's root circle clears the shaft it sits on (or turns on) by at least this, mm. */
const SHAFT_CLEAR = 1;
/** Shaft radii of gearbox-model.ts as shares of the centre distance: output shaft and countershaft. */
const OUTPUT_SHAFT = 0.2;
const COUNTER_SHAFT = 0.19;

export interface LayshaftSetup {
  /** Forward speeds. */
  speeds: number;
  /** Teeth set on the panel, by speed index from 0 (first gear is 0). Speeds left out keep their pair. */
  teeth: Readonly<Record<number, readonly [number, number]>>;
  finalDrive: number;
}

/** The setup that changes nothing: the factory box and its final drive. */
export const factorySetup = (factory: LayshaftDesc, finalDrive: number): LayshaftSetup => ({ speeds: factory.speeds.length, teeth: {}, finalDrive });

/** Whether a setup changes nothing. */
export const isFactory = (factory: LayshaftDesc, finalDrive: number, setup: LayshaftSetup): boolean =>
  setup.speeds === factory.speeds.length && Object.keys(setup.teeth).length === 0 && setup.finalDrive === finalDrive;

const withTeeth = (setup: LayshaftSetup, speed: PairDesc | 'direct', index: number): PairDesc | 'direct' => {
  const teeth = setup.teeth[index];
  return speed === 'direct' || !teeth ? speed : { ...speed, teeth: [teeth[0], teeth[1]] };
};

/**
 * The description of the box as set: the factory pairs with the panel's teeth, then the speed count (a speed taken off
 * the top, or added geometrically by layshaft-speeds.ts), then the panel's teeth of the added speeds.
 */
export function setupDesc(factory: LayshaftDesc, setup: LayshaftSetup): LayshaftDesc {
  const own = factory.speeds.length;
  const edited: LayshaftDesc = { ...factory, speeds: factory.speeds.map((s, i) => withTeeth(setup, s, i)) };
  const counted = withSpeedCount(edited, setup.speeds);
  return { ...counted, speeds: counted.speeds.map((s, i) => (i >= own ? withTeeth(setup, s, i) : s)) };
}

/** Overall ratio of each forward speed: the main pair times the speed's pair, 1 for the direct speed. */
export function speedRatios(desc: LayshaftDesc): number[] {
  const main = desc.main.teeth[1] / desc.main.teeth[0];
  return desc.speeds.map((s) => (s === 'direct' ? 1 : main * (s.teeth[1] / s.teeth[0])));
}

/** The helix angle that closes the centre distance with these teeth, degrees; NaN when none does. */
export function pairHelix(desc: LayshaftDesc, pair: PairDesc, teeth: readonly [number, number]): number {
  const shift = pair.shift ?? [0, 0];
  return helixForCentre(desc.centreMm, pair.module, teeth[0], teeth[1], desc.pressureAngle, shift[0] + shift[1]);
}

/**
 * Whether a speed pair with these teeth can be built and drawn: a helix within SETUP_HELIX closes the centre
 * distance, and each gear's root circle clears its shaft (the countershaft gear, and the loose gear on the output
 * shaft).
 */
export function pairFits(desc: LayshaftDesc, pair: PairDesc, teeth: readonly [number, number]): boolean {
  if (teeth[0] < MIN_TEETH || teeth[1] < MIN_TEETH) return false;
  const helix = pairHelix(desc, pair, teeth);
  if (!Number.isFinite(helix) || helix < SETUP_HELIX[0] - 1e-9 || helix > SETUP_HELIX[1] + 1e-9) return false;
  const shift = pair.shift ?? [0, 0];
  const rf = (z: number, x: number) => gearGeometry({ teeth: z, module: pair.module, helix, pressureAngle: desc.pressureAngle, shift: x, faceWidth: pair.faceWidth }).rf;
  return rf(teeth[0], shift[0]) >= COUNTER_SHAFT * desc.centreMm + SHAFT_CLEAR && rf(teeth[1], shift[1]) >= OUTPUT_SHAFT * desc.centreMm + SHAFT_CLEAR;
}

/** Pairs that fit, nearest the wanted pair ratio first (gear-pick.ts order). */
function fittingPairs(desc: LayshaftDesc, pair: PairDesc, pairRatio: number, coprime: boolean) {
  const shift = pair.shift ?? [0, 0];
  return pairCandidates({
    ratio: pairRatio,
    centreMm: desc.centreMm,
    module: pair.module,
    helixRange: SETUP_HELIX,
    pressureAngle: desc.pressureAngle,
    shiftSum: shift[0] + shift[1],
    minTeeth: MIN_TEETH,
    coprime,
  }).filter((p) => pairFits(desc, pair, p.teeth));
}

/**
 * Teeth for a speed's overall ratio: gear-pick's nearest coprime pair at the shared centre distance and the pair's
 * module, among those that fit; the nearest of any pair when no coprime one fits. Null for the direct speed or when
 * nothing fits at all.
 */
export function teethForRatio(desc: LayshaftDesc, index: number, overall: number): [number, number] | null {
  const pair = desc.speeds[index];
  if (!pair || pair === 'direct') return null;
  const pairRatio = overall / (desc.main.teeth[1] / desc.main.teeth[0]);
  const pick = fittingPairs(desc, pair, pairRatio, true)[0] ?? fittingPairs(desc, pair, pairRatio, false)[0];
  return pick ? [pick.teeth[0], pick.teeth[1]] : null;
}

/**
 * One tooth more or less on one gear of a speed's pair (which: 0 the countershaft gear, 1 the gear of the speed).
 * The pair keeps that tooth count when the centre distance takes it; otherwise gear-pick gives the pair nearest the
 * ratio the step asked for, on the side it moved the ratio to. Null when no pair moves the ratio that way.
 */
export function stepTeeth(desc: LayshaftDesc, index: number, which: 0 | 1, delta: 1 | -1): [number, number] | null {
  const pair = desc.speeds[index];
  if (!pair || pair === 'direct') return null;
  const next: [number, number] = [pair.teeth[0], pair.teeth[1]];
  next[which] += delta;
  if (pairFits(desc, pair, next)) return next;
  const now = pair.teeth[1] / pair.teeth[0];
  const wanted = next[1] / next[0];
  const up = wanted > now;
  const pick = fittingPairs(desc, pair, wanted, false).find((p) => (up ? p.ratio > now + 1e-9 : p.ratio < now - 1e-9));
  return pick ? [pick.teeth[0], pick.teeth[1]] : null;
}

/** The setup with a speed's teeth set; teeth equal to the factory pair's drop the entry. */
export function setTeeth(factory: LayshaftDesc, setup: LayshaftSetup, index: number, teeth: readonly [number, number]): LayshaftSetup {
  const own = factory.speeds[index];
  const same = own && own !== 'direct' && own.teeth[0] === teeth[0] && own.teeth[1] === teeth[1];
  const next: Record<number, readonly [number, number]> = { ...setup.teeth };
  if (same) delete next[index];
  else next[index] = [teeth[0], teeth[1]];
  return { ...setup, teeth: next };
}

/** The setup with another speed count. Teeth set on speeds above it are kept for when they come back. */
export const setSpeeds = (setup: LayshaftSetup, speeds: number): LayshaftSetup => ({ ...setup, speeds });

/** The setup with another final drive, held to the panel's range. */
export const setFinalDrive = (setup: LayshaftSetup, ratio: number): LayshaftSetup => ({
  ...setup,
  finalDrive: Math.min(FINAL_DRIVE_RANGE[1], Math.max(FINAL_DRIVE_RANGE[0], ratio)),
});
