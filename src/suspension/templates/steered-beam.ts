// The steering of a solid front axle (steering.ts, SteeredBeam): kingpins in the axle ends, steering arms behind the
// axle joined by a tie rod, a pitman arm hanging from a steering box on the left frame rail, and a drag link from it
// across the car to the right knuckle (a cross-steer linkage, as on Jeep's leaf-sprung and coil-sprung front axles).
// Typical geometry, not a drawing of any car: every number below is an estimate (docs/suspension-model.md).
//
// The drag link is as long as the Panhard rod (templates/solid-axle.ts with `front`), and at `dragLinkDeg` 0 it is level
// at design like the rod and has its body end on the same side, so in heave both swing on the same arc and the wheels do
// not steer. `dragLinkDeg` tilts it in the front view about its knuckle end, positive with the pitman end higher.

import type { AxleSpec, SolidAxleLinkage, Vec3 } from '../spec.ts';
import type { SteeredBeamSpec } from '../steering.ts';
import { dist, mirrorY } from '../vec.ts';

const DEG = Math.PI / 180;

/** Typical steered axle, estimates: kingpin inclination and caster, scrub radius at the road, kingpin ball joints
 *  above and below the hub, steering arm behind the kingpin and its height relative to the hub, the drag link's end
 *  on the right knuckle above the hub, and the pitman arm. */
export const STEERED_BEAM_TYPICAL = {
  kpiDeg: 8,
  casterDeg: 4,
  scrubM: 0.03,
  ballDzM: 0.12,
  armM: 0.15,
  armDzM: -0.03,
  dragDzM: 0.1,
  pitmanArmM: 0.18,
  /** A drag link this long when the axle has no Panhard rod to match, m. */
  dragLinkM: 1.1,
  /** The template's steering arms point at this share of the Jeantaud angle (the textbook layout). */
  ackermann: 1,
} as const;

export interface SteeredBeamIntent {
  /** Front-view angle of the drag link to the road at design, degrees, positive with the pitman end higher. */
  dragLinkDeg: number;
  /** Share of the Jeantaud angle the steering arms point at; null keeps the template's. */
  ackermann: number | null;
  wheelbaseM: number;
}

/** The steering of a solid front axle (a spec from solidAxle with `front`). */
export function steeredBeam(spec: AxleSpec<SolidAxleLinkage>, intent: SteeredBeamIntent): SteeredBeamSpec {
  const it = STEERED_BEAM_TYPICAL;
  if (!(Math.abs(intent.dragLinkDeg) <= 45)) throw new Error(`A drag link at ${intent.dragLinkDeg}° does not steer the axle`);
  if (!(intent.wheelbaseM > 1)) throw new Error('The wheelbase must be a car\'s');
  const W = spec.wheelCentre;
  const zW = W[2];
  const groundY = W[1] - it.scrubM;
  // The axis through the scrub point and, in the side view, the hub, leaning in by the KPI and back by the caster.
  const tk = Math.tan(it.kpiDeg * DEG);
  const tc = Math.tan(it.casterDeg * DEG);
  const onAxis = (z: number): Vec3 => [W[0] - tc * (z - zW), groundY - tk * z, z];
  const kingpinLower = onAxis(zW - it.ballDzM);
  const kingpinUpper = onAxis(zW + it.ballDzM);
  const share = intent.ackermann ?? it.ackermann;
  const K = onAxis(zW + it.armDzM);
  const armBall: Vec3 = [K[0] - it.armM, K[1] - (it.armM * K[1] * share) / intent.wheelbaseM, K[2]];
  const Kd = mirrorY(onAxis(zW + it.dragDzM));
  const dragKnuckle: Vec3 = [Kd[0] - it.armM, Kd[1], Kd[2]];
  const lateral = spec.linkage.lateral;
  const length = lateral.kind === 'panhard' ? dist(lateral.body, lateral.axle) : it.dragLinkM;
  const a = intent.dragLinkDeg * DEG;
  const pitmanBall: Vec3 = [dragKnuckle[0], dragKnuckle[1] + length * Math.cos(a), dragKnuckle[2] + length * Math.sin(a)];
  return {
    kingpinLower,
    kingpinUpper,
    armBall,
    dragKnuckle,
    pitmanBall,
    pitmanShaft: [pitmanBall[0], pitmanBall[1], pitmanBall[2] + it.pitmanArmM],
    shaftAxis: [1, 0, 0],
  };
}
