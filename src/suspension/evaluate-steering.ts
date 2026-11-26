// The steering's figures for the designer (suspensions plan, stage 13 and the designer's results): the overall ratio,
// the turns from lock to lock, the turning circle and the Ackermann share at the lock, the nose lift, the outer wheel's
// camber at the lock, the torque at the steering wheel in a bend and standing still, what the brakes put into the
// steering on a split-μ road, the tug of the drive on the kingpin offset, and a steered solid axle's bump steer from its
// drag link. Everything comes from steering.ts and steering-forces.ts; no text.
//
// The ratio is derived from the mechanism, never given: the gear's output per steering-wheel angle times the road
// wheels' steer per output, which the linkage's exact solves give. Loads are static (the car's weight on its front
// axle, shared equally by the two wheels): the load transfer in a bend and on the brakes is left out of these moments.

import type { AxleSpec, ChassisSpec, SolidAxleLinkage } from './spec.ts';
import {
  ackermannShare, CornerSteering, GEAR_EFFICIENCY, gearInputFor, gearOutput, gearOutputRate, linkTravel, linkTravelRate,
  SteeredBeam, turningCircleM, type SteerSample,
} from './steering.ts';
import {
  driverTorque, manualTorque, sideForceMoment, spindleMoment, splitMuSteer, standstillMoment, tyreAligning,
} from './steering-forces.ts';
import { G } from './forces.ts';
import { tyreAt } from '../vehicle/tyre.ts';
import { TYRE_MU } from '../vehicle/tyre-data.ts';

/** Lateral acceleration of the bend whose steering-wheel torque is reported, and longitudinal acceleration of the drive
 *  tug, m/s² (0.3 g, as the understeer gradient's). */
export const STEER_LEVEL_G = 0.3;
/** Friction of the low side of the split-μ road: ice, an estimate. */
export const ICE_MU = 0.1;
/** Heave of a steered solid axle at which its bump steer is reported, m (the plan's diagnosis: 0.5° per 50 mm). */
export const AXLE_STEER_HEAVE_M = 0.05;
/** Step of the finite differences at the lock: rack or centre link, m; pitman arm, rad. */
const LOCK_STEP = 1e-3;

export interface SteeringPerformance {
  /** Steering-wheel angle per mean road-wheel angle on centre and at the lock (the local ratio there). */
  ratioCentre: number;
  ratioLock: number;
  /** Turns of the steering wheel from lock to lock. */
  turnsLockToLock: number;
  /** Both wheels at the lock of a left turn (the inner one, the left, at the chassis' lock angle). */
  lock: SteerSample;
  /** Diameter of the outer front wheel's circle at the lock, m. */
  turningCircleM: number;
  /** Share of full Ackermann at the lock. */
  ackermann: number;
  /** How far the steer lifts the front of the body at the lock, m (the mean of the two wheels' drops). */
  noseLiftM: number;
  /** Camber of the outer wheel at the lock, rad. */
  outerCamberLock: number;
  /** Torque at the steering wheel in a steady bend of STEER_LEVEL_G: without assist and as the driver feels it, N·m. */
  manualTorqueNm: number;
  torqueNm: number;
  /** Torque at the steering wheel turning at the lock on the spot: without assist and as the driver feels it, N·m. */
  parkingManualNm: number;
  parkingTorqueNm: number;
  /** Braking on ice under the left wheels: the moment the brakes put on the steering (positive toward the grippy side)
   *  and the torque the driver holds against it, N·m. */
  splitMuKingpinNm: number;
  splitMuTorqueNm: number;
  /** Moment about one steering axis from the drive force at STEER_LEVEL_G on the kingpin offset at the hub, N·m; NaN on
   *  an undriven front. */
  spindleNm: number;
  /** A steered solid axle's turn of the wheels from its drag link when the axle rises AXLE_STEER_HEAVE_M with the
   *  steering wheel held, rad, positive left; NaN on an independent axle. */
  axleSteer: number;
}

/** The steering's kinematics, kept for the next evaluation of the same front axle. */
interface Kinematics {
  steering: CornerSteering | SteeredBeam;
  /** Steer of each wheel per unit of the linkage's input (rack m, pitman rad) on centre. */
  rate: number;
  /** Caster, mechanical trail, scrub radius and kingpin offset at the hub of the left wheel at design. */
  caster: number;
  trail: number;
  scrub: number;
  kingpinOffset: number;
  axisTrackM: number;
  locks: Map<number, { lock: SteerSample; rateAtLock: number; liftRate: number }>;
  axleSteer: number;
}

const CACHE_SIZE = 32;
const cache = new Map<string, Kinematics | Error>();

function remember(key: string, make: () => Kinematics): Kinematics {
  let hit = cache.get(key);
  if (hit) {
    cache.delete(key);
  } else {
    try {
      hit = make();
    } catch (e) {
      hit = e instanceof Error ? e : new Error(String(e));
    }
  }
  cache.set(key, hit);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  if (hit instanceof Error) throw hit;
  return hit;
}

function kinematicsOf(spec: ChassisSpec): Kinematics {
  const axle = spec.front.axle;
  const beam = spec.steering?.beam ?? null;
  const spring = { ...axle.spring, rate: 0, progressive: null };
  const damper = { ...axle.damper, compression: 0, rebound: 0, kneeMs: 0, highRatio: 0 };
  const key = JSON.stringify([{ ...axle, spring, damper }, beam]);
  return remember(key, () => {
    const link = axle.linkage;
    if (link.kind === 'solid') {
      if (!beam) throw new Error('A solid front axle needs its steering linkage');
      const steering = new SteeredBeam(axle as AxleSpec<SolidAxleLinkage>, beam);
      const a = steering.axis();
      return {
        steering,
        rate: steering.ratePerPitman(),
        ...a,
        axisTrackM: 2 * (axle.wheelCentre[1] - a.scrub),
        locks: new Map(),
        axleSteer: steering.heaveSteer(AXLE_STEER_HEAVE_M),
      };
    }
    if (link.kind !== 'links') throw new Error(`A ${axle.layout} front axle is not steered`);
    const steering = new CornerSteering(axle as AxleSpec);
    const d = steering.design;
    return {
      steering,
      rate: steering.ratePerM,
      caster: d.caster,
      trail: d.trail,
      scrub: d.scrub,
      kingpinOffset: d.kingpinOffset,
      axisTrackM: steering.axisTrackM,
      locks: new Map(),
      axleSteer: NaN,
    };
  });
}

function lockOf(k: Kinematics, innerRad: number): { lock: SteerSample; rateAtLock: number; liftRate: number } {
  let hit = k.locks.get(innerRad);
  if (hit) return hit;
  const lock = k.steering.lock(innerRad);
  // One-sided, toward the centre: past the lock the linkage may not reach.
  const h = LOCK_STEP;
  const a = lock;
  const b = k.steering.at(lock.travel - h);
  const steer = (s: SteerSample): number => (s.left + s.right) / 2;
  const lift = (s: SteerSample): number => (s.dropLeft + s.dropRight) / 2;
  const dSteer = steer(a) - steer(b);
  hit = { lock, rateAtLock: dSteer / h, liftRate: (lift(a) - lift(b)) / dSteer };
  k.locks.set(innerRad, hit);
  return hit;
}

/** The steering's figures of a chassis; null when it says nothing about its steering. Throws where the linkage cannot
 *  steer. */
export function evaluateSteering(spec: ChassisSpec): SteeringPerformance | null {
  const st = spec.steering;
  if (!st) return null;
  const k = kinematicsOf(spec);
  const gear = st.gear;
  const beam = k.steering instanceof SteeredBeam;
  // The linkage's input for a steering-wheel angle: the pitman angle on a solid axle, the rack or centre link otherwise.
  const input = (theta: number): number => (beam ? gearOutput(gear, theta) : linkTravel(gear, theta));
  const inputRate = (theta: number): number => (beam ? gearOutputRate(gear, theta) : linkTravelRate(gear, theta));
  const { lock, rateAtLock, liftRate } = lockOf(k, st.lockInnerRad);
  const thetaLock = gearInputFor(input, lock.travel);
  const ratioCentre = 1 / (k.rate * inputRate(0));
  const ratioLock = 1 / (rateAtLock * inputRate(thetaLock));
  const L = spec.body.wheelbaseM;
  const eta = GEAR_EFFICIENCY[gear.kind];

  const m = spec.body.massKg;
  const frontN = m * G * spec.body.frontShare;
  const fz = frontN / 2;
  const tyre = tyreAt(spec.tyre, (m * G) / 4);
  const fy = (m * STEER_LEVEL_G * G * spec.body.frontShare) / 2;
  const aligning = tyreAligning(tyre, fz, fy);
  const bendNm = 2 * sideForceMoment(fy, aligning.mz, k.trail, k.caster);
  const manualTorqueNm = manualTorque(bendNm, ratioCentre, eta);
  const mu = TYRE_MU[spec.tyre];
  const parkingNm = 2 * standstillMoment(mu, fz) + frontN * Math.abs(liftRate);
  const parkingManualNm = manualTorque(parkingNm, ratioLock, eta);

  const inboard = spec.longitudinal.brakeInboard[0];
  const split = splitMuSteer({ fz, muLow: ICE_MU, muHigh: mu, leverM: inboard ? k.kingpinOffset : k.scrub });
  const splitManual = manualTorque(split.kingpinNm, ratioCentre, eta);

  const front = spec.front.axle;
  let spindleNm = NaN;
  if (front.driven) {
    const share = spec.rear.axle.driven ? spec.longitudinal.driveFront : 1;
    spindleNm = spindleMoment((m * STEER_LEVEL_G * G * share) / 2, k.kingpinOffset);
  }

  return {
    ratioCentre,
    ratioLock,
    turnsLockToLock: (2 * Math.abs(thetaLock)) / (2 * Math.PI),
    lock,
    turningCircleM: turningCircleM(lock.right, L),
    ackermann: ackermannShare(lock.left, lock.right, L, k.axisTrackM),
    noseLiftM: (lock.dropLeft + lock.dropRight) / 2,
    outerCamberLock: lock.camberRight,
    manualTorqueNm,
    torqueNm: driverTorque(st.assist, manualTorqueNm),
    parkingManualNm,
    parkingTorqueNm: driverTorque(st.assist, parkingManualNm),
    splitMuKingpinNm: split.kingpinNm,
    splitMuTorqueNm: driverTorque(st.assist, splitManual),
    spindleNm,
    axleSteer: k.axleSteer,
  };
}
