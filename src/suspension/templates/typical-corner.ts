// A corner of any template with the typical compact car over it, as the macpherson page's jtektCorner has: the
// reference quarter car of the research (400 and 40 kg, docs/research/suspensions.md) on the street tyre, the wheel
// centre at the tyre's loaded radius, and the «comfort» damper (ζ = 0.25, OptimumG) at the corner's own ride frequency.
// For the 3D and the model viewer until the pages give each layout its real car.

import type { AxleSpec, CornerSpec } from '../spec.ts';
import { Axle, newCornerSample } from '../kinematics.ts';
import { dampingFromZeta, G } from '../forces.ts';
import { TYRE_FILES, TYRE_VERTICAL } from '../../vehicle/tyre-data.ts';

const SPRUNG_KG = 400;
const UNSPRUNG_KG = 40;

/** Wheel centre height of the typical corner at rest on the street tyre, m: the template intents take it. */
export function typicalWheelCentreZM(): number {
  const tyre = TYRE_FILES[TYRE_VERTICAL.street];
  return tyre.freeRadiusM - ((SPRUNG_KG + UNSPRUNG_KG) * G) / tyre.ktNm;
}

/** The typical corner on `axle`: its spring as the template made it, the damper set for ζ = 0.25. */
export function typicalCorner(axle: AxleSpec): CornerSpec {
  const tyre = TYRE_FILES[TYRE_VERTICAL.street];
  const a = new Axle(axle, { table: false });
  const s = newCornerSample();
  const h = 0.001;
  a.measureAt(0, s);
  const mr = s.mrSpring;
  const mrDamper = s.mrDamper;
  a.measureAt(h, s);
  const up = s.mrSpring;
  a.measureAt(-h, s);
  const dmr = (up - s.mrSpring) / (2 * h);
  // The wheel rate counts the preload through the changing motion ratio (F·dmr/dq), as resolveCorner does.
  const wheelRate = axle.spring.rate * mr * mr + ((SPRUNG_KG * G) / mr) * dmr;
  const rideRate = (wheelRate * tyre.ktNm) / (wheelRate + tyre.ktNm);
  const c = dampingFromZeta(0.25, Math.sqrt(rideRate / SPRUNG_KG) / (2 * Math.PI), SPRUNG_KG, mrDamper);
  return {
    axle: { ...axle, damper: { ...axle.damper, compression: c.compression, rebound: c.rebound, highRatio: c.highRatio } },
    sprungKg: SPRUNG_KG,
    unsprungKg: UNSPRUNG_KG,
    tyre: 'street',
    tyreRadiusM: null,
  };
}
