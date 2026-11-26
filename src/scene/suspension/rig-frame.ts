// A corner held on a rig at a chosen travel: what the travel slider of the suspension page and the model viewer show.
// The body stands at its height for the setup and a pad under the tyre follows the wheel, so the road never moves the
// wheel. Nothing moves in time, so the damper pushes nothing; the spring and the stops hold the corner where it is and
// the tyre carries that plus the unsprung weight. Pure: no DOM, no renderer, no text.

import { bumpStopForce, coilForce, G } from '../../suspension/forces.ts';
import type { ResolvedCorner } from '../../suspension/setup.ts';
import type { CornerFrame } from './corner-model.ts';

/** The travel a rig may hold the wheel at, m: from full droop to a fully pressed bump stop, as the corner's table. */
export function rigTravelRange(resolved: ResolvedCorner): { min: number; max: number } {
  const { droopM, bumpM } = resolved.corner.axle.travel;
  return { min: -droopM, max: bumpM };
}

/** Fills `frame` for the wheel held at `travel` (m, bump positive). Rack and spin are the caller's. */
export function rigFrame(resolved: ResolvedCorner, travel: number, frame: CornerFrame): CornerFrame {
  const axle = resolved.axle;
  const springLen = axle.value('springLen', travel);
  const damperLen = axle.value('damperLen', travel);
  const sp = resolved.spring;
  const springN = coilForce(sp.rate, sp.freeM, springLen, sp.rate2, sp.fromM);
  const bs = resolved.bumpStop;
  const stopN =
    damperLen < bs.contactM ? bumpStopForce(bs.contactM - damperLen, bs.rate, bs.lengthM) : damperLen > resolved.topOutM ? -bumpStopForce(damperLen - resolved.topOutM, bs.rate, bs.lengthM) : 0;
  const support = springN * axle.value('mrSpring', travel) + stopN * axle.value('mrDamper', travel);
  frame.travel = travel;
  frame.bodyZ = resolved.bodyStaticM;
  frame.roadX = 0;
  frame.roadLift = travel - resolved.staticTravelM;
  frame.springN = springN;
  frame.damperN = 0;
  frame.stopN = stopN;
  frame.tyreN = support + resolved.unsprungKg * G;
  return frame;
}
