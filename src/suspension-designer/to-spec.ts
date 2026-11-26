// A resolved design as the ChassisSpec that buildChassis, ChassisSim, statics and the 3D read (suspensions plan,
// the designer's chain). The geometry comes from geometry.ts; here go the spring rate (the design's, or the typical
// one for TYPICAL_RIDE_HZ), the damper (a preset's ζ at the corner's ride frequency, as setup.ts makes it, or the
// design's own coefficients, knee and slope), the anti-roll bar on the typical arms and drop links (templates/typical-chassis.ts), the
// masses, the tyre, the brakes and drive, and the road load.
//
// The road load is the generic car's (src/vehicle/constants.ts) unless the design came from a real car (`car`): then it
// is that car's roadLoadCoeffs, its rolling part scaled to the design's mass (rolling resistance is a share of the
// weight); its drag stays the car's, the body being the same. The inertias are estimated from the mass and sizes
// (src/vehicle/body-estimate.ts), or the car's measured ones scaled to the design's mass.

import type { AxleSpec, ChassisAxleSpec, ChassisLongitudinal, ChassisSpec, ChassisSteering, SolidAxleLinkage, SwayBarSpec } from '../suspension/spec.ts';
import { ackermannArmShare } from '../suspension/steering.ts';
import { STEERED_BEAM_TYPICAL, steeredBeam } from '../suspension/templates/steered-beam.ts';
import { barLinkOf, typicalLongitudinal } from '../suspension/templates/typical-chassis.ts';
import { dampingFromZeta } from '../suspension/forces.ts';
import { DAMPER_PRESETS } from '../suspension/setup.ts';
import { tyreVertical } from '../vehicle/tyre-data.ts';
import { estimateInertia } from '../vehicle/body-estimate.ts';
import { roadLoadCoeffs } from '../vehicle/road-load.ts';
import { drivingMassKg } from '../vehicle/mass.ts';
import { CARS } from '../data/cars.ts';
import { axleOf, isDriven, TYPICAL_RIDE_HZ, type AxleEnd, type ChassisDesign } from './design.ts';
import { axleGeometry, freeRadiusM, type AxleGeometry } from './geometry.ts';
import { cornerSprungKg, springForRideHz } from './constraints.ts';

/** Twisting section of a bar: the track less 0.5 m for the bushes and the frame rails (typical-chassis.ts). */
const BAR_INSIDE_TRACK_M = 0.5;
/** Damper knee of a preset: the templates' 0.1 m/s (the preset's slope past it comes from dampingFromZeta). An own
 *  damper takes the design's knee and slope. */
const PRESET_KNEE_MS = 0.1;

/** The inner wheel's steer at full lock, degrees: a typical figure for a road car, an estimate (the knuckle's stops). */
export const LOCK_INNER_DEG = 38;
/** Pitman arm of a box on an independent axle (with a centre link and an idler arm), m: an estimate. */
export const IDLER_PITMAN_ARM_M = 0.14;

/** The steering of a design's front axle. A solid one gets the typical linkage with the design's drag link and arms. */
export function designSteering(d: ChassisDesign, front: ChassisAxleSpec['axle']): ChassisSteering {
  const a = axleOf(d, 'F');
  const link = front.linkage;
  const beam =
    link.kind === 'solid'
      ? steeredBeam(front as AxleSpec<SolidAxleLinkage>, { dragLinkDeg: a.dragLinkDeg, ackermann: a.ackermann, wheelbaseM: d.wheelbaseMm / 1000 })
      : null;
  return {
    gear: {
      kind: a.steeringGear,
      rackPerRevM: a.rackMmPerRev / 1000,
      boxRatio: a.boxRatio,
      pitmanArmM: beam ? STEERED_BEAM_TYPICAL.pitmanArmM : IDLER_PITMAN_ARM_M,
      variable: a.variableRatio,
    },
    assist: a.assist,
    lockInnerRad: (LOCK_INNER_DEG * Math.PI) / 180,
    beam,
  };
}

/** The Ackermann share the design's steering arms have: its own, or the template's when it keeps them (null). */
export function ackermannShown(d: ChassisDesign): number {
  const own = axleOf(d, 'F').ackermann;
  if (own !== null) return own;
  const spec = axleGeometry(d, 'F').spec;
  return spec.linkage.kind === 'links' ? ackermannArmShare(spec as AxleSpec, d.wheelbaseMm / 1000) : STEERED_BEAM_TYPICAL.ackermann;
}

/** Spring rate along the spring, N/m: the design's, or the typical one for the axle's ride frequency. */
export function springRateNm(d: ChassisDesign, end: AxleEnd, g: AxleGeometry = axleGeometry(d, end)): number {
  const own = axleOf(d, end).springNmm;
  if (own !== null) return own * 1000;
  return springForRideHz(cornerSprungKg(d, end), tyreVertical(d.tyre).ktNm, g.mrSpring, TYPICAL_RIDE_HZ[end]);
}

/** Body ride frequency over the axle at design, Hz, from the spring at the wheel in series with the tyre. */
export function rideHz(d: ChassisDesign, end: AxleEnd, g: AxleGeometry = axleGeometry(d, end)): number {
  const wheel = springRateNm(d, end, g) * g.mrSpring * g.mrSpring;
  const kt = tyreVertical(d.tyre).ktNm;
  return Math.sqrt((wheel * kt) / (wheel + kt) / cornerSprungKg(d, end)) / (2 * Math.PI);
}

function axleSpec(d: ChassisDesign, end: AxleEnd): ChassisAxleSpec {
  const a = axleOf(d, end);
  const g = axleGeometry(d, end);
  const rate = springRateNm(d, end, g);
  const preset = (zeta: number) => ({ ...dampingFromZeta(zeta, rideHz(d, end, g), cornerSprungKg(d, end), g.mrDamper), kneeMs: PRESET_KNEE_MS });
  const coeffs =
    a.damper === 'custom'
      ? { compression: a.damperCompression, rebound: a.damperRebound, kneeMs: a.damperKneeMs, highRatio: a.damperHighRatio }
      : preset(DAMPER_PRESETS[a.damper]);
  const base = g.spec;
  let linkage = base.linkage;
  // A leaf is its own spring: the solver's leaf takes the same rate.
  if (linkage.kind === 'solid' && linkage.lateral.kind === 'leaf') {
    const solid: SolidAxleLinkage = { ...linkage, lateral: { kind: 'leaf', spec: { ...linkage.lateral.spec, rateNmm: rate / 1000 } } };
    linkage = solid;
  }
  const axle = {
    ...base,
    linkage,
    spring: { ...base.spring, rate },
    damper: { ...base.damper, compression: coeffs.compression, rebound: coeffs.rebound, kneeMs: coeffs.kneeMs, highRatio: coeffs.highRatio },
  };
  const swayBar: SwayBarSpec | null =
    a.barMm > 0
      ? {
          diameterM: a.barMm / 1000,
          wallM: a.barWallMm > 0 ? a.barWallMm / 1000 : null,
          armM: a.barArmMm / 1000,
          spanM: base.track - BAR_INSIDE_TRACK_M,
          ...barLinkOf(base),
        }
      : null;
  return { axle, swayBar, unsprungKg: a.unsprungKg, tyreRadiusM: freeRadiusM(a) };
}

/** Brakes, drive and road load of a design. */
export function designLongitudinal(d: ChassisDesign): ChassisLongitudinal {
  const typical = typicalLongitudinal(d.massKg);
  const car = d.car !== null && Object.hasOwn(CARS, d.car) ? CARS[d.car]! : null;
  let roadLoad = typical.roadLoad;
  if (car) {
    const own = roadLoadCoeffs(car);
    const k = d.massKg / drivingMassKg(car);
    roadLoad = { ...own, a: own.a * k, b: own.b * k, massKg: d.massKg };
  }
  return {
    ...typical,
    brakeFront: d.brakeFront,
    // Inboard brakes send their torque to the wheel through the half-shafts (or sit on a live axle's differential), so
    // only a driven axle can have them; on an undriven one the design's choice waits, as a layout's unread fields do.
    brakeInboard: [d.brakeInboardF && isDriven(d.drive, 'F'), d.brakeInboardR && isDriven(d.drive, 'R')],
    driveFront: d.driveFront,
    finalDrive: d.finalDrive,
    roadLoad,
  };
}

/** The ChassisSpec of a resolved design (resolveChassis); throws on one that is not. */
export function chassisToSpec(d: ChassisDesign): ChassisSpec {
  const front = axleSpec(d, 'F');
  const rear = axleSpec(d, 'R');
  const trackF = front.axle.track;
  const trackR = rear.axle.track;
  const L = d.wheelbaseMm / 1000;
  const car = d.car !== null && Object.hasOwn(CARS, d.car) ? CARS[d.car]! : null;
  const measured = car?.body.inertia ?? null;
  const k = car ? d.massKg / drivingMassKg(car) : 1;
  const inertia = measured
    ? { ixx: measured.ixx * k, iyy: measured.iyy * k, izz: measured.izz * k, source: measured.source }
    : estimateInertia(d.massKg, L, (trackF + trackR) / 2);
  return {
    id: d.car ?? 'designer',
    body: {
      massKg: d.massKg,
      frontShare: d.frontShare,
      cgHeightM: d.cgHeightMm / 1000,
      wheelbaseM: L,
      trackFrontM: trackF,
      trackRearM: trackR,
      inertia,
      seat: null,
    },
    front,
    rear,
    tyre: d.tyre,
    longitudinal: designLongitudinal(d),
    geometry: 'typical',
    steering: designSteering(d, front.axle),
  };
}
