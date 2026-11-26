// Pushrod corner from engineering intents (stage P14-core): the double wishbone locates the wheel (double-wishbone.ts),
// and a rod from the lower arm near its ball joint pushes a rocker on the body that works the spring and damper lying
// inboard. Typical geometry, not a car's: racing cars publish no hardpoints (docs/suspension-research/suspension_types.md).
//
// Construction, left corner, ISO 8855: the rod starts 85 % of the way out along the lower arm, 20 mm above it, and
// runs inboard and up at `rodLeanDeg` from the vertical for `rodM`. The rocker turns about an axis along x; at design its
// rod arm is square to the rod, `rodArmM` long, and its element arm `rockerRatio` times as long, turned
// `progressionDeg` short of square to the coilover, which runs `coiloverM` from the rocker toward the centre line. A rocker
// square to both ends would give a motion ratio flat at design; turning the element arm makes it rise (or fall) with
// bump, which is how a designer sets a rising rate. The third spring joins a point of each rocker across the car
// (ThirdSpringSpec): it adds stiffness in heave, almost none in roll.

import type { AxleSpec, RockerSpec, Vec3 } from '../spec.ts';
import { add, scale, sub } from '../vec.ts';
import { finishElements, wishboneDefaults, type WishboneIntent, doubleWishbone } from './double-wishbone.ts';
import { buildAxleLite } from '../axle-lite.ts';
import { thirdSpringRatio } from '../rocker.ts';

const DEG = Math.PI / 180;

export interface PushrodIntent extends WishboneIntent {
  /** Rocker's element arm over its rod arm (the rocker ratio). */
  rockerRatio: number;
  /** Rocker's rod arm, m. */
  rodArmM: number;
  /** Rod's lean from the vertical toward the centre line, degrees, and its length, m. */
  rodLeanDeg: number;
  rodM: number;
  /** How far short of square to the coilover the element arm sits at design, degrees (positive: rising rate). */
  progressionDeg: number;
  /** Length of the coilover at design, m. */
  coiloverM: number;
  /** Rate the third spring adds at each wheel in heave, N/m (0: none). */
  thirdWheelRateNm: number;
}

/** Defaults: the double wishbone's, with a rocker of ratio 1 and no third spring. Typical, not a car's. */
export function pushrodDefaults(axle: 'front' | 'rear'): PushrodIntent {
  return {
    ...wishboneDefaults(axle),
    rockerRatio: 1,
    rodArmM: 0.1,
    rodLeanDeg: 40,
    rodM: 0.35,
    progressionDeg: 15,
    coiloverM: 0.25,
    thirdWheelRateNm: 0,
  };
}

/** Rocker, rod and coilover of a pushrod corner on the double wishbone `base` (its lower arm carries the rod). */
export function pushrodRocker(base: AxleSpec, it: PushrodIntent): { rocker: RockerSpec; rodOuter: Vec3; body: Vec3; third: Vec3 } {
  const lower = base.linkage.wishbones.find((w) => w.id === 'lower-arm');
  if (!lower) throw new Error('A pushrod needs the lower arm of a double wishbone');
  const centre = scale(add(lower.front, lower.rear), 0.5);
  const rodOuter = add(add(centre, scale(sub(lower.ball, centre), 0.85)), [0, 0, 0.02]);
  const s = Math.sin(it.rodLeanDeg * DEG);
  const c = Math.cos(it.rodLeanDeg * DEG);
  const along: Vec3 = [0, -s, c];
  const rodEnd = add(rodOuter, scale(along, it.rodM));
  // The rod arm runs from the pivot outboard and up, square to the rod; the rod pushes it about +x.
  const pivot = add(rodEnd, scale([0, -c, -s], it.rodArmM));
  // The element arm: the rod arm turned +90° about x (along the rod), less `progressionDeg`.
  const a = (90 - it.progressionDeg) * DEG;
  const armDir: Vec3 = [0, c * Math.cos(a) - s * Math.sin(a), c * Math.sin(a) + s * Math.cos(a)];
  const elementEnd = add(pivot, scale(armDir, it.rodArmM * it.rockerRatio));
  // The coilover runs from the element end along the way it moves at design (square to its arm at progression 0).
  const moves: Vec3 = [0, -c, -s];
  const body = add(elementEnd, scale(moves, it.coiloverM));
  // Third-spring point: beside the rod end, 50 mm along the axis, at 60 % of the rod arm.
  const third = add(add(pivot, [-0.05, 0, 0]), scale([0, c, s], 0.6 * it.rodArmM));
  return { rocker: { pivot, axis: [1, 0, 0], rodEnd, elementEnd }, rodOuter, body, third };
}

/** A pushrod corner from its intent. */
export function pushrod(it: PushrodIntent): AxleSpec {
  const base = doubleWishbone(it);
  const { rocker, rodOuter, body, third } = pushrodRocker(base, it);
  const spec: AxleSpec = {
    ...base,
    layout: 'pushrod',
    spring: { ...base.spring, body, wheel: rodOuter, on: 'lower-arm', rocker },
    damper: { ...base.damper, body, wheel: rodOuter, on: 'lower-arm', rocker },
  };
  const finished = finishElements(spec, it.wheelRateNm);
  return { ...finished, thirdSpring: { rockerPoint: third, rate: thirdSpringRate(finished, third, it.thirdWheelRateNm) } };
}

/** Rate along the third spring that adds `wheelRateNm` at each wheel in heave: each wheel gets k₃·mr₃²·(q_L + q_R). */
export function thirdSpringRate(spec: AxleSpec, rockerPoint: Vec3, wheelRateNm: number): number {
  if (!(wheelRateNm > 0)) return 0;
  const mr3 = thirdSpringRatio(spec, rockerPoint) * buildAxleLite(spec).design.mrSpring;
  return wheelRateNm / (2 * mr3 * mr3);
}
