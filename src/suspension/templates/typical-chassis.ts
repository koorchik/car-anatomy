// Whole chassis of typical cars from the axle templates, for the roll scene and the tests until the designer (stage
// P8a) gives the catalogue's cars as designs. Nothing here is a real car: the masses are the research's worked examples
// (docs/research/suspensions.md, 3.3 and 13.2), the axles the templates' typical geometry, the springs set for a ride
// frequency and the dampers for a damping ratio, and the anti-roll bars typical sizes. The inertias come from the NHTSA
// regression (src/vehicle/body-estimate.ts). The brake balance is the research's working 0.7 in front, the road load
// the generic car's of src/vehicle/constants.ts, the final drive and the drag's height estimates. Every number is an
// estimate (docs/suspension-model.md).

import type { AnyAxleLinkage, AxleSpec, ChassisLongitudinal, ChassisSpec, SwayBarSpec, Vec3 } from '../spec.ts';
import { Axle, newCornerSample } from '../kinematics.ts';
import { TwistBeamAxle, newBeamSample } from '../beam-kinematics.ts';
import { SolidAxle, newSolidSample } from '../solid-kinematics.ts';
import { dampingFromZeta, G } from '../forces.ts';
import { macphersonJtekt } from './macpherson.ts';
import { doubleWishbone, wishboneDefaults } from './double-wishbone.ts';
import { multilink, multilinkDefaults } from './multilink.ts';
import { pivotAxle, PIVOT_TYPICAL } from './pivot.ts';
import { TWIST_BEAM_TYPICAL, twistBeamAxle } from './twist-beam.ts';
import { SOLID_TYPICAL, solidAxle } from './solid-axle.ts';
import { add, scale, sub, unit } from '../vec.ts';
import { tyreVertical, type TyreChoice } from '../../vehicle/tyre-data.ts';
import { estimateInertia } from '../../vehicle/body-estimate.ts';
import { coeffsFromDrag } from '../../vehicle/road-load.ts';
import { GENERIC_CAR } from '../../vehicle/constants.ts';
import { AERO_HEIGHT_ESTIMATE_M } from '../wheel-forces.ts';

export type TypicalFront = 'macpherson' | 'double-wishbone';
export type TypicalRear = 'double-wishbone' | 'multilink' | 'semi-trailing' | 'swing-axle' | 'twist-beam' | 'live-axle';

/** Bar sizes of a typical car: the twisting section between bushes 0.5 m inside the track, the arms 0.2 m long. */
const BAR_ARM_M = 0.2;
const BAR_INSIDE_TRACK_M = 0.5;

/** Damping ratio of the typical cars: the «comfort» preset of the bump scene (OptimumG). */
const TYPICAL_ZETA = 0.25;

/** Brake balance of a typical road car, share on the front axle: the working figure of docs/research/suspensions.md
 *  (2.2, β_f ≈ 0.7), an estimate. */
export const TYPICAL_BRAKE_FRONT = 0.7;
/** Final drive of a typical car: an estimate, it only scales a live axle's propshaft torque. */
export const TYPICAL_FINAL_DRIVE = 3.5;

export interface ChassisIntent {
  id: string;
  massKg: number;
  frontShare: number;
  cgHeightM: number;
  wheelbaseM: number;
  front: AxleSpec<AnyAxleLinkage>;
  rear: AxleSpec<AnyAxleLinkage>;
  frontBar: SwayBarSpec | null;
  rearBar: SwayBarSpec | null;
  /** Unsprung mass of one corner, front and rear, kg. */
  unsprungKg: readonly [number, number];
  /** Body ride frequency over each axle, Hz, with the tyre in series. */
  rideHz: readonly [number, number];
  zeta: number;
  tyre: TyreChoice;
  geometry: 'measured' | 'typical';
  /** Brakes, drive and road load where they differ from the typical car's (typicalLongitudinal). */
  longitudinal?: Partial<ChassisLongitudinal>;
}

/** A typical car's brakes, drive and road load: outboard brakes at the typical balance, the drive split evenly when both
 *  axles are driven, the generic car's drag and rolling resistance, the drag at the estimated height. */
export function typicalLongitudinal(massKg: number): ChassisLongitudinal {
  return {
    brakeFront: TYPICAL_BRAKE_FRONT,
    brakeInboard: [false, false],
    driveFront: 0.5,
    finalDrive: TYPICAL_FINAL_DRIVE,
    roadLoad: coeffsFromDrag(massKg, GENERIC_CAR.cdA, GENERIC_CAR.crr),
    aeroHeightM: AERO_HEIGHT_ESTIMATE_M,
  };
}

/** Spring and damper motion ratios of an axle at design, in heave of both wheels (on a corner just its own). */
function heaveRatios(spec: AxleSpec<AnyAxleLinkage>): { spring: number; damper: number } {
  const link = spec.linkage;
  if (link.kind === 'twist-beam') {
    const s = newBeamSample();
    new TwistBeamAxle(spec as AxleSpec<typeof link>).measureAt(0, 0, 'left', s);
    return { spring: s.mrSpring + s.mrSpringCross, damper: s.mrDamper + s.mrDamperCross };
  }
  if (link.kind === 'solid') {
    const s = newSolidSample();
    new SolidAxle(spec as AxleSpec<typeof link>).measureAt(0, 0, 'left', s);
    return { spring: s.mrSpring + s.mrSpringCross, damper: s.mrDamper + s.mrDamperCross };
  }
  const s = newCornerSample();
  new Axle(spec as AxleSpec<typeof link>, { table: false }).measureAt(0, s);
  return { spring: s.mrSpring, damper: s.mrDamper };
}

/** The axle with its spring set for the ride frequency over its corners and its damper for the damping ratio. */
function tuned(spec: AxleSpec<AnyAxleLinkage>, sprungKg: number, kt: number, rideHz: number, zeta: number): AxleSpec<AnyAxleLinkage> {
  const mr = heaveRatios(spec);
  const ride = sprungKg * (2 * Math.PI * rideHz) ** 2;
  const wheel = (ride * kt) / (kt - ride);
  const c = dampingFromZeta(zeta, rideHz, sprungKg, mr.damper);
  return {
    ...spec,
    spring: { ...spec.spring, rate: wheel / (mr.spring * mr.spring) },
    damper: { ...spec.damper, compression: c.compression, rebound: c.rebound, highRatio: c.highRatio },
  };
}

/** A chassis from axles, bars and masses: springs for the ride frequencies, dampers for ζ, inertias estimated. */
export function chassisOf(it: ChassisIntent): ChassisSpec {
  const kt = tyreVertical(it.tyre).ktNm;
  const corner = (share: number, mu: number): number => (it.massKg * share) / 2 - mu;
  const trackF = it.front.track;
  const trackR = it.rear.track;
  return {
    id: it.id,
    body: {
      massKg: it.massKg,
      frontShare: it.frontShare,
      cgHeightM: it.cgHeightM,
      wheelbaseM: it.wheelbaseM,
      trackFrontM: trackF,
      trackRearM: trackR,
      inertia: estimateInertia(it.massKg, it.wheelbaseM, (trackF + trackR) / 2),
      seat: null,
    },
    front: {
      axle: tuned(it.front, corner(it.frontShare, it.unsprungKg[0]), kt, it.rideHz[0], it.zeta),
      swayBar: it.frontBar,
      unsprungKg: it.unsprungKg[0],
      tyreRadiusM: null,
    },
    rear: {
      axle: tuned(it.rear, corner(1 - it.frontShare, it.unsprungKg[1]), kt, it.rideHz[1], it.zeta),
      swayBar: it.rearBar,
      unsprungKg: it.unsprungKg[1],
      tyreRadiusM: null,
    },
    tyre: it.tyre,
    longitudinal: { ...typicalLongitudinal(it.massKg), ...it.longitudinal },
    geometry: it.geometry,
  };
}

/**
 * Where a typical bar's left drop link meets the wheel side: on the strut tube 0.15 m above its lower point; on a
 * double wishbone's lower arm three quarters of the way out; below the wheel centre on a five-link knuckle; beside the
 * wheel on a pivot arm, a twist beam's arm or a solid axle. Estimates.
 */
export function barLinkOf(spec: AxleSpec<AnyAxleLinkage>): { link: Vec3; on?: string } {
  const W = spec.wheelCentre;
  const link = spec.linkage;
  if (link.kind === 'links' && link.strut) {
    const { lower, top } = link.strut;
    return { link: add(lower, scale(unit(sub(top, lower)), 0.15)) };
  }
  if (link.kind === 'links' && spec.layout === 'double-wishbone') {
    const arm = link.wishbones.find((w) => w.id === 'lower-arm')!;
    const inner = scale(add(arm.front, arm.rear), 0.5);
    return { link: add(inner, scale(sub(arm.ball, inner), 0.75)), on: 'lower-arm' };
  }
  if (link.kind === 'links') return { link: [W[0] - 0.05, W[1] - 0.06, W[2] - 0.12] };
  if (link.kind === 'solid') return { link: [W[0] + 0.05, W[1] - 0.15, W[2]] };
  return { link: [W[0] + 0.05, W[1] - 0.1, W[2]] };
}

/** A solid bar of `diameterMm` on the typical arms, its twisting section 0.5 m inside the axle's track. */
export function typicalBar(spec: AxleSpec<AnyAxleLinkage>, diameterMm: number): SwayBarSpec {
  return { diameterM: diameterMm / 1000, wallM: null, armM: BAR_ARM_M, spanM: spec.track - BAR_INSIDE_TRACK_M, ...barLinkOf(spec) };
}

/** Wheel centre height at rest on the tyre for a corner carrying `cornerKg` (sprung and unsprung), m. */
export function restWheelCentreZM(tyre: TyreChoice, cornerKg: number): number {
  const t = tyreVertical(tyre);
  return t.freeRadiusM - (cornerKg * G) / t.ktNm;
}

/** A typical front axle on the given track, its wheel centre at the loaded radius. */
export function typicalFront(layout: TypicalFront, trackM: number, wheelCentreZM: number, driven: boolean): AxleSpec<AnyAxleLinkage> {
  if (layout === 'macpherson') {
    // The JTEKT corner is a driven one; on a rear-drive car its half-shaft goes.
    const strut = macphersonJtekt({ wheelCentreZM });
    return driven ? strut : { ...strut, driven: false, diff: 'none', halfshaft: null };
  }
  return doubleWishbone({ ...wishboneDefaults('front'), trackM, wheelCentreZM, driven });
}

/** A typical rear axle on the given track, its wheel centre at the loaded radius. */
export function typicalRear(layout: TypicalRear, trackM: number, wheelCentreZM: number, driven: boolean): AxleSpec<AnyAxleLinkage> {
  switch (layout) {
    case 'double-wishbone':
      return doubleWishbone({ ...wishboneDefaults('rear'), trackM, wheelCentreZM, driven });
    case 'multilink':
      return multilink({ ...multilinkDefaults('rear'), trackM, wheelCentreZM, driven });
    case 'semi-trailing':
    case 'swing-axle':
      return pivotAxle({ ...PIVOT_TYPICAL[layout], trackM, wheelCentreZM, driven });
    case 'twist-beam':
      return twistBeamAxle({ ...TWIST_BEAM_TYPICAL, trackM, wheelCentreZM, pivotZM: wheelCentreZM });
    case 'live-axle':
      return solidAxle({ ...SOLID_TYPICAL.panhard, trackM, wheelCentreZM, driven });
  }
}

/** What a typical car is: masses and sizes from the research's examples, the bars by diameter (null: none). */
export interface TypicalCar {
  id: string;
  massKg: number;
  frontShare: number;
  cgHeightM: number;
  wheelbaseM: number;
  trackM: readonly [number, number];
  front: TypicalFront;
  rear: TypicalRear;
  drive: 'fwd' | 'rwd';
  barsMm: readonly [number | null, number | null];
  unsprungKg: readonly [number, number];
  rideHz: readonly [number, number];
  longitudinal?: Partial<ChassisLongitudinal>;
}

export function typicalChassis(car: TypicalCar): ChassisSpec {
  const tyre: TyreChoice = 'street';
  const zf = restWheelCentreZM(tyre, (car.massKg * car.frontShare) / 2);
  const zr = restWheelCentreZM(tyre, (car.massKg * (1 - car.frontShare)) / 2);
  const front = typicalFront(car.front, car.trackM[0], zf, car.drive === 'fwd');
  const rear = typicalRear(car.rear, car.trackM[1], zr, car.drive === 'rwd');
  return chassisOf({
    id: car.id,
    massKg: car.massKg,
    frontShare: car.frontShare,
    cgHeightM: car.cgHeightM,
    wheelbaseM: car.wheelbaseM,
    front,
    rear,
    frontBar: car.barsMm[0] === null ? null : typicalBar(front, car.barsMm[0]),
    rearBar: car.barsMm[1] === null ? null : typicalBar(rear, car.barsMm[1]),
    unsprungKg: car.unsprungKg,
    rideHz: car.rideHz,
    zeta: TYPICAL_ZETA,
    tyre,
    geometry: 'typical',
    longitudinal: car.longitudinal,
  });
}
