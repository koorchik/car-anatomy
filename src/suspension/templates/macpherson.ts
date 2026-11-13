// MacPherson strut corner on the measured hardpoints of a compact front-wheel-drive car.
//
// Source: Iwatsuki, «Kinematic Analysis and Design of Suspension-steering Mechanisms for Vehicles», JTEKT Engineering
// Journal 1019E (2023), Table 1, https://www.jtekt.co.jp/e/engineering-journal/assets/1019/1019e_02.pdf. «The values
// shown are actual measurement values for a mechanism in a given compact FF vehicle»; the car is not named. Right
// front wheel, mm, +x to the right, +y forward, z up, origin midway between the front wheel centres at straight-line
// travel. Camber and toe are zero at straight-line travel (same page). P_SA is the revolute pair at the base of the
// arm and K_SA its axis; L_S = |P_KP − P_SA| = 387.86 is the arm length, L_T = 414.38 the tie-rod length.
//
// Not in the paper, so typical geometry here, marked as such where the page shows it: the wheel centre height, the
// second bush of the arm (any point on the published axis gives the same motion), the spring seats, the bump stop,
// the end stops, and the halfshaft.

import type { AxleSpec, CornerSpec, Vec3 } from '../spec.ts';
import { add, dist, dot, scale, sub, unit } from '../vec.ts';
import { TYRE_VERTICAL, TYRE_FILES } from '../../vehicle/tyre-data.ts';
import { dampingFromZeta, G } from '../forces.ts';
import { CornerSolver } from '../solve.ts';

type Mm = readonly [number, number, number];

/** Table 1 as printed. */
export const JTEKT_TABLE1 = {
  wheelCentre: [730.0, 0.0, 0.0] as Mm,
  armPivot: [350.0, 220.0, -68.0] as Mm,
  armAxis: [0.0324, 0.9947, -0.0972] as Mm,
  strutUpper: [560.0, -57.0, 470.0] as Mm,
  strutBottom: [590.0, -5.0, 54.0] as Mm,
  kingpinLower: [680.0, 17.0, -86.0] as Mm,
  rackCentre: [0.0, 77.0, 48.0] as Mm,
  tieRodInner: [280.0, 77.0, 48.0] as Mm,
  tieRodOuter: [690.0, 120.0, 6.0] as Mm,
  trackMm: 1460.0,
  wheelbaseMm: 2500.0,
  tieRodMm: 414.38,
  armMm: 387.86,
} as const;

/** The paper's right-front point (mm) as an ISO 8855 left-corner point (m), the wheel centre `h` above the road. */
export const fromJtekt = (p: Mm, h: number): Vec3 => [p[1] / 1000, p[0] / 1000, p[2] / 1000 + h];

export interface MacphersonIntent {
  /** Wheel centre height above the road at design ride height, m: the loaded radius of the tyre. */
  wheelCentreZM: number;
}

/** Wheel travel from design to the bump stop, m: the plan's figure for the bump scene, typical. */
export const BUMP_STOP_TRAVEL_M = 0.08;

/** The JTEKT corner as an axle of the site. Coefficients of the spring and damper are filled by the corner below. */
export function macphersonJtekt(intent: MacphersonIntent): AxleSpec {
  const h = intent.wheelCentreZM;
  const J = JTEKT_TABLE1;
  const wc = fromJtekt(J.wheelCentre, h);
  const pivot = fromJtekt(J.armPivot, h);
  const axis = unit([J.armAxis[1], J.armAxis[0], J.armAxis[2]]);
  const top = fromJtekt(J.strutUpper, h);
  const lower = fromJtekt(J.strutBottom, h);
  const ball = fromJtekt(J.kingpinLower, h);
  // The second bush: 0.35 m back along the published axis. Drawing only; the motion is the same for any point on it.
  const rearBush = add(pivot, scale(axis, -0.35));
  // Outer CV joint: the point of the hub axis nearest the steering axis, where designers put it to keep the plunge
  // small while steering. The inner joint 0.25 m from the car's centre line, level with it: an estimate.
  const outer = nearestOnLine(wc, [0, 1, 0], ball, unit(sub(top, ball)));
  const diffOutput: Vec3 = [outer[0], 0.25, outer[2]];
  const spec: AxleSpec = {
    layout: 'macpherson',
    track: J.trackMm / 1000,
    linkage: {
      kind: 'links',
      wishbones: [{ id: 'lower-arm', front: pivot, rear: rearBush, ball, part: 'susp.lower-arm' }],
      rods: [
        {
          id: 'tie-rod',
          body: fromJtekt(J.tieRodInner, h),
          knuckle: fromJtekt(J.tieRodOuter, h),
          part: 'susp.tie-rod',
          steer: true,
        },
      ],
      strut: { top, lower },
    },
    wheelCentre: wc,
    spinAxis: [0, 1, 0],
    spring: {
      kind: 'coil',
      rate: 25000,
      progressive: null,
      body: top,
      wheel: 'strut',
      // Upper seat under the top mount bearing, lower seat on the strut tube: typical, for the drawing and the perch.
      strutSeats: { upperM: 0.03, lowerM: 0.15 },
    },
    damper: {
      kind: 'passive',
      body: top,
      wheel: 'strut',
      compression: 0,
      rebound: 0,
      // Knee at 0.1 m/s: between the body-control and the bump bands of rod speed (NT Tyres guide), an estimate.
      kneeMs: 0.1,
      highRatio: 0.5,
      strokeM: 0.2,
    },
    bumpStop: {
      // Set below: the strut's shortening over the first BUMP_STOP_TRAVEL_M of wheel travel.
      gapM: 0,
      lengthM: 0.06,
      // Ten times the 25 N/mm spring in stiffness after 20 mm of squeeze: k·(1 + 3·(20/24)²) = 250 N/mm. Illustrative,
      // as the plan has it (Chalmers: bump stops sized for 3.5–4 g).
      rate: 81000,
    },
    driven: true,
    diff: 'body',
    halfshaft: {
      diffOutput,
      outerJoint: outer,
      inner: 'tripod',
      outer: 'fixed-ball',
      // GKN, by a search excerpt of the «Spidan» brochure: tripod GI up to 23° and 50 mm of plunge, fixed AC 47°.
      innerMaxDeg: 23,
      outerMaxDeg: 47,
      plungeM: [-0.025, 0.025],
      diameterM: 0.024,
    },
    travel: { bumpM: 0.14, droopM: 0.1 },
  };
  spec.bumpStop.gapM = dist(top, lower) - strutLengthAt(spec, BUMP_STOP_TRAVEL_M);
  return spec;
}

/** Length of the strut (top mount to the strut's lower point) at `travel`, by a direct solve. */
export function strutLengthAt(spec: AxleSpec, travel: number): number {
  const strut = spec.linkage.strut!;
  const solver = new CornerSolver(spec);
  const pose = CornerSolver.identity();
  const res = solver.solve(pose, travel, 0, 40);
  if (!res.ok) throw new Error(`The strut does not reach ${travel} m of travel: ${res.worst}`);
  const p = [0, 0, 0];
  solver.point(pose, strut.lower, p);
  const shift = strut.topShift ?? [0, 0, 0];
  return dist(add(strut.top, shift), [p[0], p[1], p[2]]);
}

/** The point on line (p, d) nearest to line (q, e). */
function nearestOnLine(p: Vec3, d: Vec3, q: Vec3, e: Vec3): Vec3 {
  const w = sub(p, q);
  const a = dot(d, d);
  const b = dot(d, e);
  const c = dot(e, e);
  const den = a * c - b * b;
  const s = (b * dot(e, w) - c * dot(d, w)) / den;
  return add(p, scale(d, s));
}

/**
 * The corner of the macpherson page: the JTEKT linkage on the street tyre with a typical compact car over it. The
 * masses and the spring are the reference quarter car of the research (400 and 40 kg, about 22 kN/m at the wheel,
 * docs/research/suspensions.md), not the JTEKT car's, which the paper does not give. The damper is the «comfort»
 * preset, ζ = 0.25 (OptimumG).
 */
export function jtektCorner(): CornerSpec {
  const sprungKg = 400;
  const unsprungKg = 40;
  const tyre = TYRE_FILES[TYRE_VERTICAL.street];
  const loadedRadius = tyre.freeRadiusM - ((sprungKg + unsprungKg) * G) / tyre.ktNm;
  const axle = macphersonJtekt({ wheelCentreZM: loadedRadius });
  // The «comfort» preset at the corner's ride frequency. The wheel rate counts the preload through the rising motion
  // ratio (F·dmr/dq), as resolveCorner does.
  const h = 0.001;
  const [up, mid, down] = [strutLengthAt(axle, h), strutLengthAt(axle, 0), strutLengthAt(axle, -h)];
  const mr = (down - up) / (2 * h);
  const dmr = -(up - 2 * mid + down) / (h * h);
  const wheelRate = axle.spring.rate * mr * mr + ((sprungKg * G) / mr) * dmr;
  const rideRate = (wheelRate * tyre.ktNm) / (wheelRate + tyre.ktNm);
  const c = dampingFromZeta(0.25, Math.sqrt(rideRate / sprungKg) / (2 * Math.PI), sprungKg, mr);
  axle.damper = { ...axle.damper, compression: c.compression, rebound: c.rebound, highRatio: c.highRatio };
  return { axle, sprungKg, unsprungKg, tyre: 'street', tyreRadiusM: null };
}
