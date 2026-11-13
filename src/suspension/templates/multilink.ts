// Five-link corner from engineering intents: each wishbone of the double wishbone template is split into two links with
// their own ball joints on the knuckle, and a fifth link (tie rod or toe link) sets the steer. Typical geometry, like
// the double wishbone, with the research's own warning in mind (docs/suspension-research/kinematics_geometry.md,
// «5-link warning»): invented five-links easily jump to another branch. This one is built so that it cannot be far
// from its double wishbone parent: every link points at the parent's ball joint, its knuckle end `gapM` short of it, so
// the two links of a pair meet at a virtual ball joint outside the knuckle, as on the real thing. The virtual pivots
// carry the steering axis and move as the links swing.

import type { AxleSpec, Rod, Vec3, Wishbone } from '../spec.ts';
import { add, scale, sub, unit } from '../vec.ts';
import {
  finishElements,
  halfshaftFor,
  wishboneDefaults,
  wishboneFrame,
  zeroBumpSteerInner,
  type WishboneIntent,
} from './double-wishbone.ts';

export interface MultilinkIntent extends WishboneIntent {
  /** How far short of its virtual ball joint each link ends on the knuckle, along the link, m. */
  lowerGapM: number;
  upperGapM: number;
  /** Where the coilover sits on the rear lower link (the spring link), as a share of its length from the body. */
  springAlong: number;
}

/**
 * Defaults of a road car: the double wishbone's, with the instant centre 3.27 m inboard (camber gain 17.5°/m, inside
 * the research's 15–20°/m for this type) and the roll centre where the double wishbone has it. The lower links end
 * 0.10 m short of their virtual ball joint and the upper ones 0.04 m: with the upper pair split wider the camber gain
 * changes sign in droop as the virtual pivot runs away, which a production five-link avoids. Typical geometry [О].
 */
export function multilinkDefaults(axle: 'front' | 'rear'): MultilinkIntent {
  const front = axle === 'front';
  return {
    ...wishboneDefaults(axle),
    upperAngleDeg: front ? 3.79 : 0.42,
    lowerPivotZM: front ? 0.145 : 0.1669,
    lowerGapM: 0.1,
    upperGapM: 0.04,
    springAlong: 0.65,
  };
}

/** The two links a wishbone splits into: from each body pivot toward the ball joint, ending `gap` short of it. */
function splitArm(arm: Wishbone, gap: number, upper: boolean): [Rod, Rod] {
  const leg = (body: Vec3, which: 'front' | 'rear'): Rod => {
    const towards = unit(sub(arm.ball, body));
    const level = upper ? 'upper' : 'lower';
    return { id: `${level}-${which}`, body, knuckle: add(arm.ball, scale(towards, -gap)), part: `susp.${level}-link` };
  };
  return [leg(arm.front, 'front'), leg(arm.rear, 'rear')];
}

/** A five-link corner from its intent. */
export function multilink(it: MultilinkIntent): AxleSpec {
  const f = wishboneFrame(it);
  const lower = splitArm(f.lower, it.lowerGapM, false);
  const upper = splitArm(f.upper, it.upperGapM, true);
  const springLink = lower[1];
  const wheel = add(springLink.body, scale(sub(springLink.knuckle, springLink.body), it.springAlong));
  const lean = (12 * Math.PI) / 180;
  const body: Vec3 = [wheel[0], wheel[1] - 0.38 * Math.sin(lean), wheel[2] + 0.38 * Math.cos(lean)];
  const lowerInner = scale(add(f.lower.front, f.lower.rear), 0.5);
  const upperInner = scale(add(f.upper.front, f.upper.rear), 0.5);
  const build = (inner: Vec3): AxleSpec => ({
    layout: 'multilink',
    track: it.trackM,
    linkage: {
      kind: 'links',
      wishbones: [],
      rods: [
        ...lower,
        ...upper,
        {
          id: it.steered ? 'tie-rod' : 'toe-link',
          body: inner,
          knuckle: f.tieRodKnuckle,
          part: it.steered ? 'susp.tie-rod' : 'susp.toe-link',
          steer: it.steered,
        },
      ],
      virtualAxis: { lower: ['lower-front', 'lower-rear'], upper: ['upper-front', 'upper-rear'] },
    },
    wheelCentre: f.wheelCentre,
    spinAxis: [0, 1, 0],
    spring: { kind: 'coil', rate: 60000, progressive: null, body, wheel, on: springLink.id },
    damper: {
      kind: 'passive',
      body,
      wheel,
      on: springLink.id,
      compression: 0,
      rebound: 0,
      kneeMs: 0.1,
      highRatio: 0.5,
      strokeM: 0.16,
    },
    bumpStop: { gapM: 0, lengthM: 0.05, rate: 81000 },
    driven: it.driven,
    diff: it.driven ? 'body' : 'none',
    halfshaft: it.driven ? halfshaftFor(f.wheelCentre, f.axisGround, f.axisDir, it.diffOutputYM) : null,
    travel: { bumpM: 0.11, droopM: 0.1 },
  });
  const inner = zeroBumpSteerInner(f, lowerInner, upperInner, build);
  return finishElements(build([inner[0], inner[1], inner[2] + it.tieRodDzM]), it.wheelRateNm);
}
