// Twist beam (compound crank): two trailing arms joined by a cross member stiff in bending and soft in torsion. The
// layout sits between independent trailing arms and a solid axle, and where along the arms the beam joins them decides
// which it resembles: `beamPos` runs from 0 (beam at the bushes: trailing arms) to 1 (beam at the wheels: a solid axle
// whose roll centre is the beam's shear centre). The kinematics are a closed form of two angles (solve-twist-beam.ts).
//
// The arm runs from its bush B, `armM` ahead of the wheel centre, `pivotYM` from the car's centre line, `pivotZM` above
// the road, to the wheel centre W. The shear centre S sits on the centre line where the beam meets the arm line,
// `beamPos` of the way from B to W, raised by `shearCentreDzM`. In roll each arm turns about the line from B to S, so
// the front-view instant centre is where that line pierces the wheel's transverse plane and the roll centre is
//   h_RC = z_IC·y_C / (y_C − y_IC),  y_IC = −pivotYM·(1 − beamPos)/beamPos,  z_IC = W_z + shearCentreDzM/beamPos,
// zero at the bushes and the shear centre's height at the wheels (research's analogy table). The road-relative roll
// camber factor follows from the same centre: RCF = 1 − y_C/(y_C − y_IC) = 1 − h_RC/z_IC. With S on the arm line
// z_IC = W_z, so a higher roll centre always means less camber kept against the road.
//
// No drawing of a real car is behind these numbers: every point here is typical geometry, an estimate
// (docs/suspension-model.md has the table).

import type { AxleSpec, TwistBeamLinkage, Vec3 } from '../spec.ts';
import { dist } from '../vec.ts';
import { BEAM_STATE_SIZE, TwistBeamSolver } from '../solve-twist-beam.ts';
import { POSE_SIZE } from '../solve.ts';

export interface TwistBeamIntent {
  /** Where the beam joins the arms: 0 at the bushes, 1 at the wheels. */
  beamPos: number;
  /** Height of the beam's shear centre above the line from the bush to the wheel centre, m. */
  shearCentreDzM: number;
  /** The bush: how far ahead of the wheel centre, how far from the car's centre line, how high above the road at
   *  design, m. */
  armM: number;
  pivotYM: number;
  pivotZM: number;
  /** Track and wheel centre height above the road at design, m. */
  trackM: number;
  wheelCentreZM: number;
  /** Static camber and toe built into the stub axle, degrees: a twist beam has no adjuster. */
  camberDeg: number;
  toeDeg: number;
  /** Torque per radian of twist of one arm relative to the other, N·m/rad. */
  torsionNmPerRad: number;
}

/**
 * Typical intent, estimates. The bush 0.45 m ahead of the wheel and 0.1 m inboard of it, at wheel-centre height (the
 * spacing that reproduces the research's analogy table); the beam at 0.35 of the arm puts the roll centre at 116 mm,
 * inside the research's 90–120 mm for a rear axle. The torsional stiffness is illustrative, as no maker figure was
 * found: the beam twists 2.94 rad per radian of axle roll here, so it adds 2000·2.94² ≈ 1.7·10⁴ N·m/rad (300 N·m/°)
 * of roll stiffness, about 70 % of what the template's 30 kN/m springs give in roll (2.5·10⁴ N·m/rad).
 */
export const TWIST_BEAM_TYPICAL: TwistBeamIntent = {
  beamPos: 0.35,
  shearCentreDzM: 0,
  armM: 0.45,
  pivotYM: 0.6,
  pivotZM: 0.3,
  trackM: 1.4,
  wheelCentreZM: 0.3,
  camberDeg: 0,
  toeDeg: 0,
  torsionNmPerRad: 2000,
};

/** Wheel travel from design to the bump stop, m, as on the other templates. */
export const TWIST_BEAM_BUMP_STOP_TRAVEL_M = 0.08;
/** Travel range of each wheel, m: to a pressed bump stop and to damper top-out. Typical, an estimate. */
export const TWIST_BEAM_TRAVEL = { bumpM: 0.12, droopM: 0.1 } as const;
/** Spring on a pad on the arm beside the stub axle (de.wikipedia, Verbundlenkerachse), this far inboard of the wheel
 *  centre, and its length at design; the damper beside it. Typical, estimates. */
const SPRING_INBOARD_M = 0.15;
const SPRING_LENGTH_M = 0.3;
const DAMPER_INBOARD_M = 0.07;
const DAMPER_LENGTH_M = 0.4;

const DEG = Math.PI / 180;

/** Where the template puts the shear centre for an intent. */
export function shearCentreOf(intent: TwistBeamIntent): Vec3 {
  const { beamPos, armM, pivotZM, wheelCentreZM, shearCentreDzM } = intent;
  return [armM * (1 - beamPos), 0, pivotZM + beamPos * (wheelCentreZM - pivotZM) + shearCentreDzM];
}

/** A twist-beam axle from its intent. Spring and damper coefficients are left for the axle, as on the corners. */
export function twistBeamAxle(intent: TwistBeamIntent): AxleSpec<TwistBeamLinkage> {
  const keys = [
    'beamPos', 'shearCentreDzM', 'armM', 'pivotYM', 'pivotZM', 'trackM', 'wheelCentreZM', 'camberDeg', 'toeDeg',
    'torsionNmPerRad',
  ] as const;
  for (const key of keys) {
    if (!Number.isFinite(intent[key])) throw new Error(`The twist beam's ${key} is not a number: ${intent[key]}`);
  }
  const { beamPos, armM, pivotYM, pivotZM, trackM, wheelCentreZM, camberDeg, toeDeg } = intent;
  if (!(beamPos >= 0 && beamPos <= 1)) {
    throw new Error(`The beam joins the arms between bushes and wheels, not at ${beamPos}`);
  }
  if (!(armM > 0)) throw new Error(`The bushes of a twist beam sit ahead of the wheels, not ${armM} m`);
  if (!(pivotYM > 0)) throw new Error(`The bush must sit off the centre line, not at ${pivotYM} m`);
  if (!(trackM > 0 && wheelCentreZM > 0 && pivotZM > 0)) {
    throw new Error('The track, the wheel centre height and the bush height must be positive');
  }
  if (!(Math.abs(camberDeg) < 10 && Math.abs(toeDeg) < 5)) throw new Error('The stub axle alignment is out of reach');
  if (!(intent.torsionNmPerRad >= 0)) throw new Error('The beam cannot be softer than nothing in torsion');

  const W: Vec3 = [0, trackM / 2, wheelCentreZM];
  const bush: Vec3 = [armM, pivotYM, pivotZM];
  const linkage: TwistBeamLinkage = {
    kind: 'twist-beam',
    bush,
    shearCentre: shearCentreOf(intent),
    torsionNmPerRad: intent.torsionNmPerRad,
    armPart: 'susp.twist-beam-arm',
    beamPart: 'susp.twist-beam',
  };
  const g = camberDeg * DEG;
  const t = toeDeg * DEG;
  const spinAxis: Vec3 = [Math.cos(g) * Math.sin(t), Math.cos(g) * Math.cos(t), -Math.sin(g)];

  const seat: Vec3 = [W[0], W[1] - SPRING_INBOARD_M, W[2]];
  const top: Vec3 = [seat[0], seat[1], seat[2] + SPRING_LENGTH_M];
  const damperLow: Vec3 = [W[0], W[1] - DAMPER_INBOARD_M, W[2]];
  const damperTop: Vec3 = [damperLow[0], damperLow[1], damperLow[2] + DAMPER_LENGTH_M];

  const spec: AxleSpec<TwistBeamLinkage> = {
    layout: 'twist-beam',
    track: trackM,
    linkage,
    wheelCentre: W,
    spinAxis,
    spring: { kind: 'coil', rate: 30000, progressive: null, body: top, wheel: seat },
    damper: {
      kind: 'passive',
      body: damperTop,
      wheel: damperLow,
      compression: 0,
      rebound: 0,
      // As on the other corners: knee at 0.1 m/s, an estimate.
      kneeMs: 0.1,
      highRatio: 0.5,
      strokeM: 0.25,
    },
    // The macpherson corner's illustrative stop; the gap is set below.
    bumpStop: { gapM: 0, lengthM: 0.06, rate: 81000 },
    driven: false,
    diff: 'none',
    halfshaft: null,
    travel: { ...TWIST_BEAM_TRAVEL },
  };

  // Every pair of wheel travels inside the range must solve on the branch of the design: an arm too short or too
  // steep would pass the vertical at an end stop, as a pivot arm does.
  const solver = new TwistBeamSolver(spec);
  const state = TwistBeamSolver.rest(new Float64Array(BEAM_STATE_SIZE));
  const design = solver.solve(state, 0, 0);
  const { bumpM, droopM } = TWIST_BEAM_TRAVEL;
  const n = 6;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const zL = -droopM + ((bumpM + droopM) * i) / n;
      const zR = -droopM + ((bumpM + droopM) * j) / n;
      // Warm from the solved neighbour along the row, as a sweep would.
      if (j === 0) TwistBeamSolver.rest(state);
      const res = solver.solve(state, zL, zR, 30);
      if (!res.ok || res.detSign !== design.detSign) {
        throw new Error('The arm is too short or too steep for the wheel travel: it would pass the vertical');
      }
    }
  }

  spec.bumpStop.gapM = DAMPER_LENGTH_M - damperLengthAt(spec, TWIST_BEAM_BUMP_STOP_TRAVEL_M);
  return spec;
}

/** Length of the damper of a twist beam with both wheels at `travel`. */
export function damperLengthAt(spec: AxleSpec<TwistBeamLinkage>, travel: number): number {
  const d = spec.damper;
  if (d.wheel === 'strut') throw new Error('A twist beam has no strut');
  const solver = new TwistBeamSolver(spec);
  const state = TwistBeamSolver.rest();
  if (!solver.solve(state, travel, travel, 30).ok) throw new Error(`The arms do not reach ${travel} m of travel`);
  const pose = new Float64Array(POSE_SIZE);
  solver.pose(state, 'left', pose);
  const p = [0, 0, 0];
  solver.point(pose, d.wheel, p);
  return dist(d.body, [p[0], p[1], p[2]]);
}
