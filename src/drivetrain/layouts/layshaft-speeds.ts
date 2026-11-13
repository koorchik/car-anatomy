// The same layshaft box with more or fewer forward speeds (the settings panel's 4, 5 or 6; owner decision A3 of the
// build order): a speed is taken off the top, or an overdrive pair is added at the back end of the shaft. The case
// grows or shrinks with the gear stack, since the 3D sizes it from the gears.
//
// An added speed continues the top step geometrically (i_new = i_top²/i_below). Its teeth come from gear-pick at
// the module and face width of the finest pair, so it spans the shared centre distance with a helix of 15–35°.
// Reverse and every other pair stay as they are.

import { pickPair } from '../gear-pick.ts';
import type { LayshaftDesc, PairDesc, SleeveDesc } from './layshaft.ts';

/** Speeds a description can be given. */
export const SPEED_COUNT_RANGE: [number, number] = [2, 8];

const overall = (desc: LayshaftDesc, speed: PairDesc | 'direct'): number =>
  speed === 'direct' ? 1 : (desc.main.teeth[1] / desc.main.teeth[0]) * (speed.teeth[1] / speed.teeth[0]);

export function withSpeedCount(desc: LayshaftDesc, count: number): LayshaftDesc {
  const [lo, hi] = SPEED_COUNT_RANGE;
  if (!Number.isInteger(count) || count < lo || count > hi) throw new Error(`${desc.id}: ${count} speeds; a layshaft box here has ${lo}–${hi}`);
  let speeds = [...desc.speeds];
  let sleeves: SleeveDesc[] = desc.sleeves.map((s) => ({ ...s }));
  while (speeds.length > count) {
    const top = speeds.length;
    speeds = speeds.slice(0, -1);
    sleeves = sleeves
      .map((s) => ({ ...s, front: s.front === top ? null : s.front, back: s.back === top ? null : s.back }))
      .filter((s) => s.front !== null || s.back !== null);
  }
  while (speeds.length < count) {
    const n = speeds.length;
    if (n < 2) throw new Error(`${desc.id}: a speed is added from the step between the top two, and there is one speed`);
    const top = overall(desc, speeds[n - 1]!);
    const below = overall(desc, speeds[n - 2]!);
    const pairs = speeds.filter((s): s is PairDesc => s !== 'direct');
    const finest = pairs.reduce((p, q) => (q.module < p.module ? q : p));
    const pick = pickPair({
      ratio: (top * top) / below / (desc.main.teeth[1] / desc.main.teeth[0]),
      centreMm: desc.centreMm,
      module: finest.module,
      helixRange: [15, 35],
      pressureAngle: desc.pressureAngle,
    });
    if (!pick) throw new Error(`${desc.id}: no pair for speed ${n + 1} at ${desc.centreMm} mm with module ${finest.module}`);
    speeds = [...speeds, { teeth: pick.teeth, module: finest.module, faceWidth: Math.min(...pairs.map((p) => p.faceWidth)) }];
    // On a free side of the last sleeve if it has one, otherwise on a new sleeve at the back.
    const last = sleeves[sleeves.length - 1];
    if (last && last.back === null) sleeves = [...sleeves.slice(0, -1), { ...last, back: n + 1 }];
    else sleeves = [...sleeves, { id: String(n + 1), front: n + 1, back: null }];
  }
  return { ...desc, speeds, sleeves };
}
