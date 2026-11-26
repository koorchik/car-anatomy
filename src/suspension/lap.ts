// The lap with weight transfer (level L2, stage P10-core). The point lap of the oil page (simulateLap without options)
// asks every wheel for the same μ·F_z; a real axle loses grip when its load moves to one wheel, because a tyre's peak
// force grows slower than its load (the Magic Formula's PDY2, PDX2). Here a chassis turns the lap's accelerations into
// four wheel loads, and the fitted tyre (tyreAt, the same fit as the friction circles: its nominal load the car's mean
// static load per wheel and its peak μ the lap's) turns those into each axle's peak forces. simulateLap takes the
// result as a GripModel, so the speed profile, the time and the accelerations the oil and the chassis see all come from
// the same limit.
//
// Wheel loads at a state (v, a_x, a_y, n), FL FR RL RR, a_y > 0 a left turn (the right wheels outer), n the normal
// acceleration (g, the road's vertical curvature and downforce per kilogram):
//   - each axle's static share of m·n (frontShare);
//   - longitudinal transfer (m·a_x·h + F_aero·h_a)/L taken off the front: inertia at the centre of mass, drag at the
//     height it acts at; anti-geometry changes how the load is carried, not how much;
//   - lateral transfer T_k = transferPerAy_k·a_y on axle k, half the difference of its wheel loads: from the chassis'
//     roll model (statics.ts, Milliken's three terms) when the car has one, otherwise the record's total m·h·a_y split
//     by the OptimumG baseline (front share of the roll stiffness = static front weight share + 5 %), an estimate.
// What each axle must make, by the rules of the chassis' prescribed mode (docs/suspension-model.md):
//   - side force m·a_y·share_k, share_k the axle's static weight share (a steady turn has no yaw acceleration);
//   - along the road the lap's tyre force m·a_x + road load: driving on the driven axles, braking on all, each shared
//     between axles and wheels by the grip they have (ABS and EBD on the brakes; on driven axles a differential that
//     sends torque where the grip is, so an open differential's inner-wheel limit is not modelled);
//   - each axle on its own friction ellipse, the sum of its wheels' peaks D_x and D_y.
// No DOM, no three.js, no text (src/suspension/ rules).

import type { Chassis } from './chassis.ts';
import { rollModel } from './statics.ts';
import { AERO_HEIGHT_ESTIMATE_M } from './wheel-forces.ts';
import { cgHeightM, type CarRecord } from '../vehicle/car.ts';
import { G } from '../vehicle/constants.ts';
import { simulateLap, type GripLimit, type GripModel, type LapLevel, type LapTrace } from '../vehicle/lap.ts';
import { drivingMassKg } from '../vehicle/mass.ts';
import type { Powertrain } from '../vehicle/powertrain.ts';
import { aeroDragN, roadLoadCoeffs, roadLoadN, type RoadLoadCoeffs } from '../vehicle/road-load.ts';
import type { Track } from '../vehicle/track.ts';
import { lateralPeakN, longitudinalPeakN, tyreAt, type Tyre } from '../vehicle/tyre.ts';
import { TYRES, type TyreSpec, type VehicleSpec } from '../vehicle/vehicle.ts';

/** The level of the lap this module computes (src/vehicle/lap.ts, LapLevel). It becomes canonical at stage C3a. */
export const TRANSFER_LAP_LEVEL: LapLevel = 'L2';

/**
 * How much more of the lateral load transfer the front takes than its share of the weight, when the car has no chassis
 * data: the OptimumG «magic number» baseline (static front weight share + 5 %), defined on roll stiffness and meant for
 * race cars (docs/suspension-research/tire_vehicle_dynamics.md, [V]). An estimate.
 */
export const ESTIMATED_FRONT_TRANSFER_EXTRA = 0.05;

/** What the lap needs of a chassis to load its wheels. Forces in N, lengths in m. */
export interface GripChassis {
  /** With the driver: the lap's mass. */
  massKg: number;
  /** Static share of the weight on the front axle; also its share of the side force in a steady turn. */
  frontShare: number;
  cgHeightM: number;
  wheelbaseM: number;
  /** Between the contact points, front and rear. */
  tracks: readonly [number, number];
  /** Each axle's lateral load transfer per m/s² of lateral acceleration, N: half the difference of its wheel loads. */
  transferPerAy: readonly [number, number];
  /** Where it comes from: the chassis' roll model, or the record and ESTIMATED_FRONT_TRANSFER_EXTRA. */
  transferFrom: 'roll-model' | 'estimate';
  /** Height the drag acts at. */
  aeroHeightM: number;
  roadLoad: RoadLoadCoeffs;
  /** Which axles drive, front and rear. */
  driven: readonly [boolean, boolean];
  /** The tyre on all four wheels, fitted to the mean static wheel load and the lap's μ. */
  tyre: Tyre;
}

/** The lap's tyre fitted to a car of mass `massKg`: nominal load m·g/4, peak μ the lap's (tyreAt). */
const fittedTyre = (tyre: TyreSpec, massKg: number): Tyre => tyreAt(tyre.id, (massKg * G) / 4, tyre.mu);

/**
 * A car from its shared record alone: mass, centre of mass, wheelbase and tracks from the record (the centre of mass
 * height its estimate where the record has none), the lateral transfer split by the estimated baseline, the drag at
 * the estimated height. The same mass and road load as vehicleSpec(car), so the lap's two levels drive one car.
 */
export function gripChassisFor(car: CarRecord, tyre: TyreSpec = TYRES[car.tyre.id]): GripChassis {
  const m = drivingMassKg(car);
  const h = cgHeightM(car);
  const fs = car.body.frontShare;
  const tracks = [car.body.trackFrontM, car.body.trackRearM] as const;
  const front = Math.min(0.95, fs + ESTIMATED_FRONT_TRANSFER_EXTRA);
  return {
    massKg: m,
    frontShare: fs,
    cgHeightM: h,
    wheelbaseM: car.body.wheelbaseM,
    tracks,
    // Σ T_k·t_k = m·h·a_y: the whole car's overturning moment, split between the axles.
    transferPerAy: [(front * m * h) / tracks[0], ((1 - front) * m * h) / tracks[1]],
    transferFrom: 'estimate',
    aeroHeightM: AERO_HEIGHT_ESTIMATE_M,
    roadLoad: roadLoadCoeffs(car),
    driven: [car.drive !== 'rwd', car.drive !== 'fwd'],
    tyre: fittedTyre(tyre, m),
  };
}

/** A chassis of the suspension section: its own roll model splits the transfer, its own drag height and road load. */
export function gripChassisOf(chassis: Chassis, tyre: TyreSpec = TYRES[chassis.spec.tyre]): GripChassis {
  const roll = rollModel(chassis);
  const lon = chassis.spec.longitudinal;
  return {
    massKg: chassis.massKg,
    frontShare: chassis.lateralShare[0],
    cgHeightM: chassis.cgHeightM,
    wheelbaseM: chassis.wheelbaseM,
    tracks: [chassis.tracks[0], chassis.tracks[1]],
    transferPerAy: [roll.transferPerAy[0].total, roll.transferPerAy[1].total],
    transferFrom: 'roll-model',
    aeroHeightM: lon.aeroHeightM,
    roadLoad: lon.roadLoad,
    driven: [chassis.spec.front.axle.driven, chassis.spec.rear.axle.driven],
    tyre: fittedTyre(tyre, chassis.massKg),
  };
}

/**
 * Wheel loads FL, FR, RL, RR at speed `v`, accelerations `ax`, `ay` and normal acceleration `n`, m/s² (see the header),
 * N. A wheel the transfer would pull below zero carries nothing and its axle's other wheel all of the axle's load; the
 * rest of that axle's share of the overturning moment goes to the other axle (the body is stiff in torsion), so the
 * whole car's moment holds until both inner wheels are off the ground.
 */
export function wheelLoads(gc: GripChassis, v: number, ax: number, ay: number, n: number, out: number[]): void {
  const m = gc.massKg;
  const off = (m * ax * gc.cgHeightM + aeroDragN(gc.roadLoad, v) * gc.aeroHeightM) / gc.wheelbaseM;
  const half0 = Math.max(0, m * n * gc.frontShare - off) / 2;
  const half1 = Math.max(0, m * n * (1 - gc.frontShare) + off) / 2;
  const t0 = gc.tracks[0];
  const t1 = gc.tracks[1];
  let tr0 = gc.transferPerAy[0] * ay;
  let tr1 = gc.transferPerAy[1] * ay;
  // Moment one axle cannot carry, N·m, handed to the other one.
  const spill0 = Math.max(0, Math.abs(tr0) - half0) * t0;
  const spill1 = Math.max(0, Math.abs(tr1) - half1) * t1;
  tr0 += (Math.sign(ay) * spill1) / t0;
  tr1 += (Math.sign(ay) * spill0) / t1;
  tr0 = Math.max(-half0, Math.min(half0, tr0));
  tr1 = Math.max(-half1, Math.min(half1, tr1));
  out[0] = half0 - tr0;
  out[1] = half0 + tr0;
  out[2] = half1 - tr1;
  out[3] = half1 + tr1;
}

/** Each axle's peak forces at one state, N, and the wheel loads they come from. */
export interface AxleGrip {
  fz: number[];
  /** Sum of the axle's two peak side forces D_y and peak forces along the road D_x, front and rear. */
  lateralN: [number, number];
  longitudinalN: [number, number];
}

export const newAxleGrip = (): AxleGrip => ({ fz: [0, 0, 0, 0], lateralN: [0, 0], longitudinalN: [0, 0] });

/**
 * The largest force each axle can make at speed `v` and accelerations `ax`, `ay` (normal acceleration `n`, g by
 * default), with the weight transfer of that state and the load sensitivity of the fitted tyre. At rest its sum is
 * μ·m·g less the tyre's convexity (the front and rear wheels carry other loads than the one the tyre is fitted to).
 */
export function axleGripLimit(gc: GripChassis, v: number, ax: number, ay: number, n = G, out: AxleGrip = newAxleGrip()): AxleGrip {
  wheelLoads(gc, v, ax, ay, n, out.fz);
  const p = gc.tyre.set;
  for (const k of [0, 1] as const) {
    const l = out.fz[2 * k]!;
    const r = out.fz[2 * k + 1]!;
    out.lateralN[k] = lateralPeakN(p, l) + lateralPeakN(p, r);
    out.longitudinalN[k] = longitudinalPeakN(p, l) + longitudinalPeakN(p, r);
  }
  return out;
}

/** The axles' static weight shares: their shares of the side force in a steady turn. */
const sideShare = (gc: GripChassis, k: 0 | 1): number => (k === 0 ? gc.frontShare : 1 - gc.frontShare);

/** The lap's grip limit from a chassis (src/vehicle/lap.ts, GripModel). */
export function gripModel(gc: GripChassis): GripModel {
  const g = newAxleGrip();
  const m = gc.massKg;
  return {
    limit(v: number, ax: number, ay: number, n: number, out: GripLimit): void {
      axleGripLimit(gc, v, ax, ay, n, g);
      let ayMax = Infinity;
      let brake = 0;
      let drive = 0;
      let overfull = false;
      for (const k of [0, 1] as const) {
        const share = sideShare(gc, k);
        const dy = g.lateralN[k];
        ayMax = Math.min(ayMax, dy / (m * share));
        const lat = dy > 0 ? (m * Math.abs(ay) * share) / dy : Infinity;
        if (lat > 1) {
          overfull = true;
          continue;
        }
        const left = g.longitudinalN[k] * Math.sqrt(1 - lat * lat);
        brake += left;
        if (gc.driven[k]) drive += left;
      }
      out.ayMax = ayMax;
      // An axle past its peak across has no state to brake or drive from: the lap must not get there.
      out.brakeMax = overfull ? 0 : brake / m;
      out.driveMax = overfull ? 0 : drive / m;
    },
  };
}

/** How much of its friction ellipse each axle uses at one state of a lap, and the force each must make. */
export interface AxleUsage {
  fz: number[];
  /** Side force and force along the road each axle makes, N (positive: left, forward). */
  fy: [number, number];
  fx: [number, number];
  /** √((F_x/D_x)² + (F_y/D_y)²) of each axle, front and rear: 1 on its friction ellipse. */
  usage: [number, number];
  /** The larger of the two: the limiting axle's. */
  worst: number;
}

export const newAxleUsage = (): AxleUsage => ({ fz: [0, 0, 0, 0], fy: [0, 0], fx: [0, 0], usage: [0, 0], worst: 0 });

/**
 * What a lap asks of each axle at speed `v`, accelerations `ax`, `ay` and normal acceleration `n`, by the rules of the
 * header: the side force by the axles' weight shares, the force along the road (m·a_x plus the road load) on the
 * driven axles or, braking, on all of them, shared so that the axles that take part use the same part of their
 * ellipses (the least that serves). A point lap asks more than the tyres have in its limit corners; an L2 lap never.
 */
export function axleUsage(gc: GripChassis, v: number, ax: number, ay: number, n = G, out: AxleUsage = newAxleUsage()): AxleUsage {
  const g = axleGripLimit(gc, v, ax, ay, n);
  const m = gc.massKg;
  out.fz = g.fz;
  const lat = [0, 0];
  for (const k of [0, 1] as const) {
    out.fy[k] = m * ay * sideShare(gc, k);
    lat[k] = g.lateralN[k] > 0 ? Math.abs(out.fy[k]) / g.lateralN[k] : Infinity;
  }
  const force = m * ax + roadLoadN(gc.roadLoad, v, 0);
  const takes = [force < 0 || gc.driven[0], force < 0 || gc.driven[1]];
  // Along the road at a common usage u: Σ D_x·√(u² − lat²) over the axles that take part.
  const along = (u: number): number => {
    let s = 0;
    for (const k of [0, 1] as const) if (takes[k] && u > lat[k]!) s += g.longitudinalN[k] * Math.sqrt(u * u - lat[k]! * lat[k]!);
    return s;
  };
  const need = Math.abs(force);
  let lo = Math.max(lat[0]!, lat[1]!);
  let u = lo;
  if (need > 0 && Number.isFinite(lo)) {
    let hi = Math.max(lo, 1e-3) * 2;
    for (let k = 0; k < 60 && along(hi) < need; k++) hi *= 2;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (along(mid) >= need) hi = mid;
      else lo = mid;
    }
    u = hi;
  }
  for (const k of [0, 1] as const) {
    const part = takes[k] && u > lat[k]! ? g.longitudinalN[k] * Math.sqrt(u * u - lat[k]! * lat[k]!) : 0;
    out.fx[k] = need > 0 ? (Math.sign(force) * part * need) / Math.max(need, along(u)) : 0;
    out.usage[k] = takes[k] && need > 0 && part > 0 ? u : lat[k]!;
  }
  out.worst = Math.max(out.usage[0], out.usage[1]);
  return out;
}

/** The limiting axle's usage at every sample of a trace (normal acceleration g plus the trace's vertical one). */
export function traceUsage(gc: GripChassis, trace: LapTrace): Float32Array {
  const n = trace.t.length;
  const out = new Float32Array(n);
  const u = newAxleUsage();
  for (let i = 0; i < n; i++) {
    axleUsage(gc, trace.v[i]!, trace.ax[i]!, trace.ay[i]!, G + trace.av[i]!, u);
    out[i] = u.worst;
  }
  return out;
}

/** The lap with weight transfer: simulateLap with this chassis' grip model, on the same car, tyre and powertrain. */
export function transferLap(track: Track, car: VehicleSpec, tyre: TyreSpec, pt: Powertrain, gc: GripChassis): LapTrace {
  return simulateLap(track, car, tyre, pt, { grip: gripModel(gc) });
}
