// Solid axles: a live axle (the differential in the axle housing) and a de Dion tube (the differential on the body,
// half-shafts to the hubs on the tube). Both wheels hang on one part, held along the car by trailing links and across
// it by a Panhard rod, Watt's linkage or upper links angled in plan, or held every way by two leaf springs. The pose is
// solved by weighted least squares (solve-axle.ts).
//
// No drawing of a real car is behind these numbers: every point here is typical geometry, an estimate
// (docs/suspension-model.md has the table). The half-shaft joint limits of the de Dion are the GKN figures of the
// macpherson corner.
//
// Points: the axle centre sits on the centre line at wheel-centre height, x = 0. Trailing links run forward from
// brackets under (lower) and over (upper) the axle tube. Four links are parallel in plan; `upperAngleDeg` equal to
// `linkAngleDeg` makes them parallel in the side view too, as a "parallel four-link" is. A Panhard rod runs across the
// car behind the axle, level at design, from the body on the right to the axle on the left; Watt's linkage puts its
// rocker behind the axle on the centre line, rods out to both sides.

import type { AxleSpec, HalfshaftSpec, LeafSpec, Rod, SolidAxleLinkage, SolidLateral, Vec3 } from '../spec.ts';
import { dist, mirrorY } from '../vec.ts';
import { SolidAxleSolver } from '../solve-axle.ts';

export type SolidLayout = 'live-axle' | 'de-dion';

export interface SolidAxleIntent {
  layout: SolidLayout;
  /** What holds the axle across: a Panhard rod, Watt's linkage, upper links angled in plan ('triangulated'), or the
   *  leaf springs, which hold it along the car as well (no links then). */
  lateral: 'panhard' | 'watt' | 'triangulated' | 'leaf';
  /** With a Panhard rod or Watt's linkage: four links, or two lower links and one upper link on the centre line. */
  links: 'four' | 'three';
  trackM: number;
  wheelCentreZM: number;
  /** Lengths of the lower and upper trailing links, m. */
  lowerLinkM: number;
  upperLinkM: number;
  /** Side-view slope of the lower and upper links, degrees, positive when the link rises toward the front (exact in
   *  the side view also for a link angled in plan). */
  linkAngleDeg: number;
  upperAngleDeg: number;
  /** Height of the Panhard rod (level at design) or of the Watt pivot, m above the road. */
  lateralZM: number;
  /** Leaf springs, when `lateral` is 'leaf'. */
  leaf: {
    /** Eye to eye, m, and the share of it ahead of the seat. */
    lengthM: number;
    frontShare: number;
    /** Seat height relative to the wheel centre, m: negative for a spring under the axle. */
    seatDzM: number;
    /** How far the line through the eyes sits above the seat at design, m (the spring's arch). */
    archM: number;
    /** Slope of the line through the eyes, degrees, positive when the front eye is higher. */
    slopeDeg: number;
    shackleM: number;
    /** Spring spacing: lateral position of each leaf, m from the centre line. */
    yM: number;
    rateNmm: number;
  };
  /** Stiffness of each rod along its axis, N/m. */
  rodStiffness: number;
  driven: boolean;
  /** De Dion: lateral position of each differential output (the inner joint), m from the centre line. */
  diffOutputYM: number;
}

/** Typical leaf spring: an estimate, not a drawing. */
const LEAF_TYPICAL: SolidAxleIntent['leaf'] = {
  lengthM: 1.3,
  frontShare: 0.5,
  seatDzM: -0.07,
  archM: 0.03,
  slopeDeg: 0,
  shackleM: 0.1,
  yM: 0.5,
  rateNmm: 25,
};

const COMMON: SolidAxleIntent = {
  layout: 'live-axle',
  lateral: 'panhard',
  links: 'four',
  trackM: 1.5,
  wheelCentreZM: 0.32,
  lowerLinkM: 0.55,
  upperLinkM: 0.4,
  linkAngleDeg: 4,
  upperAngleDeg: 4,
  lateralZM: 0.4,
  leaf: LEAF_TYPICAL,
  rodStiffness: 1e7,
  driven: true,
  diffOutputYM: 0.15,
};

/**
 * Typical intents, estimates. A live axle on four parallel links and a Panhard rod; the same on Watt's linkage; on
 * four links with the upper pair angled in plan; on leaf springs; and a de Dion tube on Watt's linkage.
 */
export const SOLID_TYPICAL = {
  panhard: COMMON,
  watt: { ...COMMON, lateral: 'watt' },
  triangulated: { ...COMMON, lateral: 'triangulated', upperAngleDeg: 0 },
  leaf: { ...COMMON, lateral: 'leaf' },
  deDion: { ...COMMON, layout: 'de-dion', lateral: 'watt' },
} as const satisfies Record<string, SolidAxleIntent>;

/** Wheel travel from design to the bump stop, m, as on the other templates. */
export const SOLID_BUMP_STOP_TRAVEL_M = 0.08;
/** Travel range, m: to a pressed bump stop and to damper top-out. Typical, an estimate. */
export const SOLID_TRAVEL = { bumpM: 0.12, droopM: 0.1 } as const;

/** Link brackets on the axle: lower under the tube, upper over it, m from the wheel centre height; lateral positions
 *  of the brackets as a distance in from the wheel centre. Typical, an estimate. */
const LOWER_DZ_M = -0.1;
const UPPER_DZ_M = 0.12;
const LOWER_IN_M = 0.2;
const UPPER_IN_M = 0.3;
/** Triangulated upper links: axle end and body end from the centre line, m. About 35° in plan; an estimate. */
const TRI_AXLE_Y_M = 0.35;
const TRI_BODY_Y_M = 0.12;
/** Panhard rod and Watt's linkage sit this far behind the axle, m; the Panhard body end this far past the far wheel's
 *  bracket; the Watt rocker this long and its rods this long. Estimates. */
const LATERAL_X_M = -0.1;
const PANHARD_AXLE_Y_M = 0.55;
const PANHARD_BODY_Y_M = -0.58;
const WATT_ROCKER_M = 0.2;
const WATT_ROD_M = 0.5;
/** Coil spring over the axle and damper behind it: positions on the axle and length at design. Estimates. */
const SPRING_IN_M = 0.25;
const SPRING_DZ_M = 0.05;
const SPRING_LENGTH_M = 0.3;
const DAMPER_X_M = -0.1;
const DAMPER_IN_M = 0.2;
const DAMPER_DZ_M = -0.08;
const DAMPER_TOP: Vec3 = [-0.15, 0, 0.3];
/** De Dion outer joint: on the hub axis this far inboard of the wheel centre, m. An estimate. */
const OUTER_JOINT_INBOARD_M = 0.1;

const DEG = Math.PI / 180;

/** A solid axle from its intent. Damper coefficients are left for the axle, as on the other templates. */
export function solidAxle(intent: SolidAxleIntent): AxleSpec<SolidAxleLinkage> {
  const { trackM, wheelCentreZM: zW, lowerLinkM, upperLinkM } = intent;
  const numbers = ['trackM', 'wheelCentreZM', 'lowerLinkM', 'upperLinkM', 'linkAngleDeg', 'upperAngleDeg', 'lateralZM', 'rodStiffness', 'diffOutputYM'] as const;
  for (const key of numbers) {
    if (!Number.isFinite(intent[key])) throw new Error(`The solid axle's ${key} is not a number: ${intent[key]}`);
  }
  for (const [key, v] of Object.entries(intent.leaf)) {
    if (!Number.isFinite(v)) throw new Error(`The solid axle's leaf.${key} is not a number: ${v}`);
  }
  if (!(trackM > 1 && zW > 0)) throw new Error('The track and the wheel centre height must be those of a car');
  if (!(lowerLinkM > 0.1 && upperLinkM > 0.1)) throw new Error('The trailing links must be at least 0.1 m long');
  if (!(Math.abs(intent.linkAngleDeg) < 30 && Math.abs(intent.upperAngleDeg) < 30)) {
    throw new Error('A trailing link steeper than 30° does not hold an axle along the car');
  }
  if (!(intent.lateralZM > 0.1 && intent.lateralZM < 0.8)) throw new Error(`The lateral locator at ${intent.lateralZM} m is not under the body`);
  if (!(intent.rodStiffness > 0)) throw new Error('The rods need a stiffness');
  const half = trackM / 2;
  const W: Vec3 = [0, half, zW];

  const link = (id: string, part: string, axle: Vec3, length: number, angleDeg: number, bodyY = axle[1]): Rod => {
    const a = angleDeg * DEG;
    const dy = bodyY - axle[1];
    // length² = run² + dy² + (run·tan a)²: the side view shows the slope a whatever the link's angle in plan.
    const run = Math.cos(a) * Math.sqrt(length * length - dy * dy);
    if (!(run > 0)) throw new Error(`The ${id} link is too short for its run across the car`);
    return { id, body: [run, bodyY, axle[2] + run * Math.tan(a)], knuckle: axle, part };
  };
  const rods: Rod[] = [];
  let lateral: SolidLateral;
  if (intent.lateral === 'leaf') {
    const leaf = leafOf(intent);
    lateral = { kind: 'leaf', spec: leaf };
  } else {
    const lowerY = half - LOWER_IN_M;
    const lower: Vec3 = [0, lowerY, zW + LOWER_DZ_M];
    rods.push(link('lower-left', 'susp.lower-link', lower, lowerLinkM, intent.linkAngleDeg));
    rods.push(link('lower-right', 'susp.lower-link', mirrorY(lower), lowerLinkM, intent.linkAngleDeg));
    if (intent.lateral === 'triangulated') {
      const upper: Vec3 = [0, TRI_AXLE_Y_M, zW + UPPER_DZ_M];
      rods.push(link('upper-left', 'susp.upper-link', upper, upperLinkM, intent.upperAngleDeg, TRI_BODY_Y_M));
      rods.push(link('upper-right', 'susp.upper-link', mirrorY(upper), upperLinkM, intent.upperAngleDeg, -TRI_BODY_Y_M));
      lateral = { kind: 'rods' };
    } else {
      if (intent.links === 'four') {
        const upper: Vec3 = [0, half - UPPER_IN_M, zW + UPPER_DZ_M];
        rods.push(link('upper-left', 'susp.upper-link', upper, upperLinkM, intent.upperAngleDeg));
        rods.push(link('upper-right', 'susp.upper-link', mirrorY(upper), upperLinkM, intent.upperAngleDeg));
      } else {
        rods.push(link('upper', 'susp.upper-link', [0, 0, zW + UPPER_DZ_M], upperLinkM, intent.upperAngleDeg));
      }
      const z = intent.lateralZM;
      if (intent.lateral === 'panhard') {
        lateral = { kind: 'panhard', body: [LATERAL_X_M, PANHARD_BODY_Y_M, z], axle: [LATERAL_X_M, PANHARD_AXLE_Y_M, z] };
      } else {
        const h = WATT_ROCKER_M / 2;
        lateral = {
          kind: 'watt',
          spec: {
            pivotOnAxle: [LATERAL_X_M, 0, z],
            upperBody: [LATERAL_X_M, WATT_ROD_M, z + h],
            lowerBody: [LATERAL_X_M, -WATT_ROD_M, z - h],
            centreLinkM: WATT_ROCKER_M,
          },
        };
      }
    }
  }

  const deDion = intent.layout === 'de-dion';
  let halfshaft: HalfshaftSpec | null = null;
  if (deDion && intent.driven) {
    const outerY = half - OUTER_JOINT_INBOARD_M;
    if (!(intent.diffOutputYM >= 0 && intent.diffOutputYM < outerY)) {
      throw new Error(`The differential output at ${intent.diffOutputYM} m is not between the centre line and the hub`);
    }
    halfshaft = {
      diffOutput: [0, intent.diffOutputYM, zW],
      outerJoint: [0, outerY, zW],
      inner: 'tripod',
      outer: 'fixed-ball',
      // GKN, by a search excerpt of the «Spidan» brochure: tripod GI up to 23° and 50 mm of plunge, fixed AC 47°.
      innerMaxDeg: 23,
      outerMaxDeg: 47,
      plungeM: [-0.025, 0.025],
      diameterM: 0.024,
    };
  }

  const leaf = intent.lateral === 'leaf' ? leafOf(intent) : null;
  // A leaf is its own spring: a vertical element over the seat. A coil sits on the axle tube.
  const seat: Vec3 = leaf ? leaf.axleSeat : [0, half - SPRING_IN_M, zW + SPRING_DZ_M];
  const top: Vec3 = [seat[0], seat[1], seat[2] + SPRING_LENGTH_M];
  const damperAxle: Vec3 = [DAMPER_X_M, half - DAMPER_IN_M, zW + DAMPER_DZ_M];
  const damperBody: Vec3 = [DAMPER_TOP[0], half - SPRING_IN_M, zW + DAMPER_TOP[2]];

  const spec: AxleSpec<SolidAxleLinkage> = {
    layout: intent.layout,
    track: trackM,
    linkage: {
      kind: 'solid',
      rods,
      lateral,
      rodStiffness: intent.rodStiffness,
      axlePart: deDion ? 'susp.de-dion-tube' : 'susp.axle-housing',
    },
    wheelCentre: W,
    spinAxis: [0, 1, 0],
    spring: leaf
      ? { kind: 'leaf', rate: leaf.rateNmm * 1000, progressive: null, body: top, wheel: seat }
      : { kind: 'coil', rate: 30000, progressive: null, body: top, wheel: seat },
    damper: {
      kind: 'passive',
      body: damperBody,
      wheel: damperAxle,
      compression: 0,
      rebound: 0,
      // As on the macpherson corner: knee at 0.1 m/s, an estimate.
      kneeMs: 0.1,
      highRatio: 0.5,
      strokeM: 0.2,
    },
    // The macpherson corner's illustrative stop; the gap is set below.
    bumpStop: { gapM: 0, lengthM: 0.06, rate: 81000 },
    driven: intent.driven,
    diff: !intent.driven ? 'none' : deDion ? 'body' : 'axle',
    halfshaft,
    travel: { ...SOLID_TRAVEL },
  };
  const solver = new SolidAxleSolver(spec);
  const state = SolidAxleSolver.rest();
  const res = solver.solve(state, 0, 0);
  if (!res.ok || res.bind > 1e-12) throw new Error(`The solid axle does not assemble at design: ${res.worst}`);
  spec.bumpStop.gapM = dist(damperBody, damperAxle) - damperLengthAt(spec, SOLID_BUMP_STOP_TRAVEL_M);
  return spec;
}

/** The left leaf of an intent. */
function leafOf(intent: SolidAxleIntent): LeafSpec {
  const l = intent.leaf;
  if (!(l.lengthM > 0.4 && l.frontShare > 0.2 && l.frontShare < 0.8)) throw new Error('The leaf must be long and its seat between the eyes');
  if (!(l.shackleM > 0 && l.yM > 0 && l.yM < intent.trackM / 2)) throw new Error('The leaf needs a shackle and a place inside the wheels');
  if (!(Math.abs(l.slopeDeg) < 20)) throw new Error(`A leaf sloped ${l.slopeDeg}° does not hold the axle`);
  const seat: Vec3 = [0, l.yM, intent.wheelCentreZM + l.seatDzM];
  const xf = l.lengthM * l.frontShare;
  const xr = -l.lengthM * (1 - l.frontShare);
  const t = Math.tan(l.slopeDeg * DEG);
  const mid = seat[2] + l.archM;
  return {
    frontEye: [xf, l.yM, mid + xf * t],
    rearEye: [xr, l.yM, mid + xr * t],
    shackleM: l.shackleM,
    axleSeat: seat,
    rateNmm: l.rateNmm,
  };
}

/** Length of the left damper of a solid axle when both wheels are at `travel`. */
export function damperLengthAt(spec: AxleSpec<SolidAxleLinkage>, travel: number): number {
  const d = spec.damper;
  if (d.wheel === 'strut') throw new Error('A solid axle has no strut');
  const solver = new SolidAxleSolver(spec);
  const state = SolidAxleSolver.rest();
  const steps = Math.max(1, Math.ceil(Math.abs(travel) / 0.01));
  for (let k = 1; k <= steps; k++) {
    const z = (travel * k) / steps;
    if (!solver.solve(state, z, z).ok) throw new Error(`The solid axle does not reach ${travel} m of travel`);
  }
  const p = [0, 0, 0];
  solver.point(state, d.wheel, p);
  return dist(d.body, [p[0], p[1], p[2]]);
}
