// The suspension designer's graphs as numbers (suspensions plan, the designer's results): camber and toe over the
// wheel's travel, the roll centre as the body rolls, the frequency response of each axle, the steering-wheel angle and
// the wheel loads over the lateral acceleration of a steady turn, and the parts of the understeer. Pure, without the
// DOM, so the tests check them in Node and the page only draws them.
//
// The chassis in ChassisPerformance has its axle tables only a few millimetres around rest (evaluate-chassis.ts), so the
// curves over the travel and the roll are exact solves of their own, each warm-started from the one before it, from
// rest outward. A point the linkage cannot reach is NaN and the graph leaves a gap there. The turn reads turnAt, the
// same models as the understeer gradient and the skidpad limit, so a graph and its number never disagree.

import { Axle, newCornerSample } from '../suspension/kinematics.ts';
import { CornerSolver, POSE_SIZE } from '../suspension/solve.ts';
import { rolledRollCentre } from '../suspension/axle-lite.ts';
import { TwistBeamAxle, newBeamSample } from '../suspension/beam-kinematics.ts';
import { TwistBeamSolver } from '../suspension/solve-twist-beam.ts';
import { SolidAxle, newSolidSample } from '../suspension/solid-kinematics.ts';
import { frequencyResponse, type ChassisPerformance } from '../suspension/evaluate-chassis.ts';
import type { SteeringPerformance } from '../suspension/evaluate-steering.ts';
import { G } from '../suspension/forces.ts';
import type { AnyAxleLinkage, AxleSpec, SolidAxleLinkage, TwistBeamLinkage } from '../suspension/spec.ts';

/** Points of a curve over the travel. */
const TRAVEL_POINTS = 25;
/** Body roll the roll-centre curve goes to, rad, and its points. */
export const ROLL_MAX_RAD = (5 * Math.PI) / 180;
const ROLL_POINTS = 11;
/** How far from the road the roll centre graph follows the point, m. Past it the two wheels' force lines are nearly
 *  parallel and their crossing runs off toward infinity (a trailing arm, some multilinks in roll): no car's centre of
 *  mass is that high, and a point metres away would only squash the graph flat, so the graph leaves a gap there. */
export const ROLL_CENTRE_SHOWN_M = 1;
/** Radius of the steady turn whose steering-wheel angle the graph shows, m: a constant-radius test (ISO 4138 names
 *  40 m among its radii); a choice of the page. */
export const TURN_RADIUS_M = 40;
const TURN_POINTS = 24;

/** Camber, toe and roll-centre height of the left wheel over the travel of both wheels together (heave). */
export interface TravelCurves {
  /** Travel from full droop to full bump, m. */
  travelM: number[];
  /** Camber and toe relative to the body, rad (negative camber: top in; positive toe: in). */
  camber: number[];
  toe: number[];
  /** Height of the geometric roll centre above the road, m. */
  rcHeight: number[];
}

/** The roll centre as the body rolls in a left turn (the right wheel into bump). */
export interface RollCentreCurve {
  rollRad: number[];
  /** Height above the road under the rolled body, m, and the shift toward the outer wheel, m (NaN on a beam). */
  heightM: number[];
  lateralM: number[];
}

/** Travels from −droop to +bump, rest included, in order. */
function travels(spec: AxleSpec<AnyAxleLinkage>, n = TRAVEL_POINTS): number[] {
  const lo = -spec.travel.droopM;
  const hi = spec.travel.bumpM;
  const out = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  // Rest itself is a point, so the curve goes through the numbers the page shows.
  const near = out.reduce((best, q, i) => (Math.abs(q) < Math.abs(out[best]!) ? i : best), 0);
  out[near] = 0;
  return out;
}

/** Walks out from rest each way, so every solve starts from its neighbour: `solve(q)` gets the travels in that order. */
function fromRest<T>(qs: readonly number[], start: () => void, solve: (q: number) => T): T[] {
  const out = new Array<T>(qs.length);
  const rest = qs.findIndex((q) => q === 0);
  const zero = rest < 0 ? 0 : rest;
  for (const dir of [1, -1]) {
    start();
    for (let i = dir === 1 ? zero : zero - 1; i >= 0 && i < qs.length; i += dir) out[i] = solve(qs[i]!);
  }
  return out;
}

/** A corner on links or on a pivot: exact solves of the left corner. */
class CornerWalk {
  private readonly axle: Axle;
  private readonly rest = CornerSolver.identity();
  private readonly pose = new Float64Array(POSE_SIZE);
  readonly sample = newCornerSample();

  constructor(spec: AxleSpec<AnyAxleLinkage>) {
    this.axle = new Axle(spec as AxleSpec, { table: false });
    if (!this.axle.solver.solve(this.rest, 0, 0, 40).ok) throw new Error('The corner does not assemble at design');
    this.start();
  }

  start(): void {
    this.pose.set(this.rest);
  }

  /** The left corner at `q` from the last pose, or null where it does not solve (the walk then goes on from the last
   *  pose that did). */
  at(q: number): ReturnType<typeof newCornerSample> | null {
    const trial = this.pose.slice();
    if (!this.axle.solver.solve(trial, q, 0, 30).ok) return null;
    this.pose.set(trial);
    const s = newCornerSample();
    this.axle.measure(trial, q, 0, s);
    return s;
  }
}

/** A twist beam or a solid axle: both wheels at their own travels. */
class BeamWalk {
  private readonly beam: TwistBeamAxle | null;
  private readonly solid: SolidAxle | null;
  private state: Float64Array;
  private readonly bs = newBeamSample();
  private readonly ss = newSolidSample();

  constructor(spec: AxleSpec<AnyAxleLinkage>) {
    const twist = spec.linkage.kind === 'twist-beam';
    this.beam = twist ? new TwistBeamAxle(spec as AxleSpec<TwistBeamLinkage>) : null;
    this.solid = twist ? null : new SolidAxle(spec as AxleSpec<SolidAxleLinkage>);
    this.state = this.restState();
  }

  private restState(): Float64Array {
    return this.beam ? TwistBeamSolver.rest() : this.solid!.rest();
  }

  start(): void {
    this.state = this.restState();
  }

  /** Camber, toe and roll-centre height of the left wheel at travels zL, zR; null where the axle does not solve. */
  at(zL: number, zR: number): { camber: number; toe: number; rc: number } | null {
    const trial = this.state.slice();
    try {
      if (this.beam) this.beam.solve(trial, zL, zR);
      else this.solid!.solve(trial, zL, zR);
    } catch {
      return null;
    }
    this.state = trial;
    if (this.beam) {
      this.beam.measure(trial, 'left', this.bs);
      return { camber: this.bs.camber, toe: this.bs.toe, rc: this.bs.rcHeight };
    }
    this.solid!.measure(trial, 'left', this.ss);
    return { camber: this.ss.camber, toe: this.ss.toe, rc: this.ss.rcHeight };
  }
}

const isBeam = (spec: AxleSpec<AnyAxleLinkage>): boolean => spec.linkage.kind === 'twist-beam' || spec.linkage.kind === 'solid';

/** Camber, toe and roll-centre height over the travel, both wheels moving together. */
export function travelCurves(spec: AxleSpec<AnyAxleLinkage>, n = TRAVEL_POINTS): TravelCurves {
  const qs = travels(spec, n);
  const out: TravelCurves = { travelM: qs, camber: [], toe: [], rcHeight: [] };
  let points: Array<{ camber: number; toe: number; rc: number } | null>;
  if (isBeam(spec)) {
    const walk = new BeamWalk(spec);
    points = fromRest(qs, () => walk.start(), (q) => walk.at(q, q));
  } else {
    const walk = new CornerWalk(spec);
    points = fromRest(qs, () => walk.start(), (q) => {
      const s = walk.at(q);
      return s && { camber: s.camber, toe: s.toe, rc: s.rcHeight };
    });
  }
  for (const p of points) {
    out.camber.push(p ? p.camber : NaN);
    out.toe.push(p ? p.toe : NaN);
    out.rcHeight.push(p ? p.rc : NaN);
  }
  return out;
}

/** The roll centre with the body rolled from 0 to ROLL_MAX_RAD: the outer wheel (t/2)·sin φ into bump, the inner as far
 *  into droop, each wheel held inside its travel. */
export function rollCentreCurve(spec: AxleSpec<AnyAxleLinkage>, n = ROLL_POINTS): RollCentreCurve {
  const out: RollCentreCurve = { rollRad: [], heightM: [], lateralM: [] };
  const clamp = (q: number): number => Math.min(spec.travel.bumpM, Math.max(-spec.travel.droopM, q));
  const beam = isBeam(spec) ? new BeamWalk(spec) : null;
  const corner = beam ? null : new CornerWalk(spec);
  // The corner walks twice, the outer wheel up and the inner down, each from its last point.
  const down = corner ? new CornerWalk(spec) : null;
  for (let i = 0; i < n; i++) {
    const phi = (ROLL_MAX_RAD * i) / (n - 1);
    const dz = (spec.track / 2) * Math.sin(phi);
    out.rollRad.push(phi);
    if (beam) {
      const p = beam.at(clamp(-dz), clamp(dz));
      out.heightM.push(p && Math.abs(p.rc) <= ROLL_CENTRE_SHOWN_M ? p.rc : NaN);
      out.lateralM.push(NaN);
      continue;
    }
    const outer = corner!.at(clamp(dz));
    const inner = down!.at(clamp(-dz));
    if (!outer || !inner) {
      out.heightM.push(NaN);
      out.lateralM.push(NaN);
      continue;
    }
    const rc = rolledRollCentre(outer, inner);
    const shown = Math.abs(rc.heightM) <= ROLL_CENTRE_SHOWN_M;
    out.heightM.push(shown ? rc.heightM : NaN);
    out.lateralM.push(shown ? rc.lateralM : NaN);
  }
  return out;
}

/** Gains of each axle's quarter car (evaluate-chassis.ts frequencyResponse). */
export function responseCurves(perf: ChassisPerformance): Array<ReturnType<typeof frequencyResponse>> {
  return perf.axles.map((a) => frequencyResponse(a.linear, 0.5, 25, 90));
}

/** A steady turn of TURN_RADIUS_M from rest to the skidpad limit. */
export interface TurnCurves {
  /** Lateral acceleration, m/s². */
  ay: number[];
  /** Steering-wheel angle, rad (the road wheels' angle times the steering ratio on centre), and what it would be
   *  with no understeer at all (the geometric L/R). NaN past an axle's peak. */
  steeringWheel: number[];
  neutral: number;
  /** Ratio the steering-wheel angle was taken with; 1 (road-wheel angle) when the steering did not evaluate. */
  ratio: number;
  /** Wheel loads FL, FR, RL, RR at each point, N. */
  loads: Array<[number, number, number, number]>;
}

export function turnCurves(perf: ChassisPerformance, steering: SteeringPerformance | null, n = TURN_POINTS): TurnCurves {
  const L = perf.chassis.wheelbaseM;
  const ratio = steering && Number.isFinite(steering.ratioCentre) && steering.ratioCentre > 0 ? steering.ratioCentre : 1;
  const top = Math.min(perf.skidpadAcc, 1.6 * G);
  const out: TurnCurves = { ay: [], steeringWheel: [], neutral: (L / TURN_RADIUS_M) * ratio, ratio, loads: [] };
  for (let i = 0; i < n; i++) {
    // The last point just inside the limit, where the tyres still make the force.
    const ay = (top * 0.97 * i) / (n - 1);
    const turn = perf.turnAt(ay);
    out.ay.push(ay);
    out.steeringWheel.push((L / TURN_RADIUS_M + turn.slipDiff + turn.rollSteerDiff) * ratio);
    out.loads.push(turn.loads);
  }
  return out;
}

/** The understeer gradient's parts, rad per g, in the order the page lists them (UndersteerTerms). */
export function understeerParts(perf: ChassisPerformance): Array<{ id: 'tyres' | 'transfer' | 'camber' | 'rollSteer'; value: number }> {
  const t = perf.understeerTerms;
  return [
    { id: 'tyres', value: t.tyres },
    { id: 'transfer', value: t.transfer },
    { id: 'camber', value: t.camber },
    { id: 'rollSteer', value: t.rollSteer },
  ];
}
