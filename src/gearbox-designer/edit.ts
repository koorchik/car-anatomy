// One change from the designer's panel (gearbox plan, honesty and links; stage K9b), as editDesign is for the engine:
// it knows which derived and hand-set values a change makes stale. Every change from the panel goes through here.
//
// - Teeth set by hand (a catalogue copy's, or a gearbox page's panel) belong to the ratios, modules, helix and centre
//   distance they were cut for. A change of one of those hands the pairs it touches back to the picker, each keeping
//   its ratio as a typed-in one, so a copy of the E30's box with a coarser module still has the E30's ratios. A wider
//   face only widens the hand-set pairs.
// - The first engineering change (anything but the name) drops the factory record: from then on the model's figures
//   stand alone.

import { drivenSize, resolveGearboxDesign } from './constraints.ts';
import type { GearboxDesign, PairSetting } from './design.ts';
import { withGearboxType } from './presets.ts';
import { faceFor, handRatios } from './to-spec.ts';

/** Changes that do not touch the engineering. */
const COSMETIC: ReadonlySet<keyof GearboxDesign> = new Set(['name']);

const widen = (d: GearboxDesign, p: PairSetting): PairSetting => ({ ...p, faceWidth: Math.min(14 * p.module, Math.max(6 * p.module, faceFor(d, p.module))) });

export function editGearboxDesign(d: GearboxDesign, patch: Partial<GearboxDesign>): GearboxDesign {
  if (patch.type !== undefined && patch.type !== d.type) return withGearboxType({ ...d, ...patch }, patch.type);
  const next: GearboxDesign = { ...d, ...patch, ratios: [...(patch.ratios ?? d.ratios)], pairs: [...(patch.pairs ?? d.pairs)], cones: [...(patch.cones ?? d.cones)] };
  const has = (key: keyof GearboxDesign): boolean => key in patch && patch[key] !== d[key];
  const n = d.gears;
  // The ratio a hand-set pair gives its gear now, before anything changes.
  const kept = handRatios(d);
  const release = (i: number): void => {
    if (!next.pairs[i]) return;
    next.ratios[i] = kept[i] ?? next.ratios[i] ?? null;
    next.pairs[i] = null;
  };
  const releaseAll = (): void => {
    for (let i = 0; i < n; i++) release(i);
  };

  if (has('gears')) {
    // Whole gears; resolveGearboxDesign keeps the count within its range.
    const m = Math.max(1, Math.min(64, Math.round(Number.isFinite(next.gears) ? next.gears : n)));
    next.gears = m;
    next.ratios = Array(m).fill(null);
    next.pairs = Array(m).fill(null);
    next.cones = Array.from({ length: m }, (_, i) => d.cones[i] ?? 1);
    if (d.directGear === n) next.directGear = m;
    else if (next.directGear > m) next.directGear = 0;
  } else {
    if (has('firstRatio')) {
      next.pairs[0] = null;
      next.ratios[0] = null;
    }
    if (has('topRatio')) {
      next.pairs[n - 1] = null;
      next.ratios[n - 1] = null;
    }
    if (has('progression')) {
      for (let i = 1; i < n - 1; i++) {
        next.pairs[i] = null;
        next.ratios[i] = null;
      }
    }
    if (has('directGear')) releaseAll();
    if ('ratios' in patch) d.ratios.forEach((r, i) => r !== next.ratios[i] && (next.pairs[i] = null));
    if (has('module')) for (let i = 1; i < n; i++) release(i);
    if (has('lowModule')) {
      release(0);
      next.reverse = null;
    }
    if (has('mainModule')) {
      if (d.type === 'layshaft') {
        releaseAll();
        next.mainPair = null;
      } else next.finalPair = null;
    }
    if (has('helix') || has('pressureAngle') || has('centreMm')) {
      releaseAll();
      next.mainPair = null;
      next.reverse = null;
      if (!has('centreMm')) next.finalPair = null;
    }
    if (has('faceWidth')) {
      next.pairs = next.pairs.map((p) => (p ? widen(next, p) : null));
      if (next.mainPair) next.mainPair = widen(next, next.mainPair);
      if (next.reverse) next.reverse = { ...next.reverse, faceWidth: faceFor(next, next.reverse.module) };
      if (next.finalPair) next.finalPair = { ...next.finalPair, faceWidth: faceFor(next, next.finalPair.module) };
    }
  }
  if (has('reverseRatio')) next.reverse = null;
  if (has('finalDrive')) next.finalPair = null;
  if (has('drive') && next.type === 'transaxle') {
    next.finalPair = null;
    if (!('mainModule' in patch)) next.mainModule = next.drive === 'rwd' ? 6.5 : 2.5;
  }
  if ((has('car') || has('drive')) && !('tyreSize' in patch)) next.tyreSize = drivenSize(next.car, next.drive);
  // The first engineering change hands over from the factory record to the model's own figures. A patch that sets a
  // value it already has (a panel echoing its own state) changes nothing and keeps the record.
  const changed = (key: keyof GearboxDesign): boolean => JSON.stringify(patch[key]) !== JSON.stringify(d[key]);
  if ((Object.keys(patch) as Array<keyof GearboxDesign>).some((key) => !COSMETIC.has(key) && changed(key))) next.factory = null;
  return resolveGearboxDesign(next);
}
