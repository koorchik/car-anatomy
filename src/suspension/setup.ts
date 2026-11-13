// What a visitor may change on a corner without opening the designer (the Setup panel of a scene): spring, damper, ride
// height, static camber and toe, tyre pressure. resolveCorner turns a corner and a setup into everything the quarter
// car and the 3D read, the way a workshop would do it:
//   - ride height moves the spring perch, so the static point slides along the kinematic curves (travel −Δh);
//   - static camber is set at that static point by sliding the strut top mount (camber plates), static toe by the
//     tie-rod length; both are solved to 1e-9 rad, so the numbers the visitor typed are what the corner has;
//   - the spring is one of the chosen rate made for this car, and the perch carries it to the chosen height;
//   - a damper preset or ζ becomes coefficients by the OptimumG baseline at the corner's ride frequency;
//   - pressure changes only the tyre's vertical stiffness.

import type { CornerLinkage, CornerSpec, DamperSpec, Vec3 } from './spec.ts';
import { Axle, newCornerSample, type CornerSample } from './kinematics.ts';
import { CornerSolver } from './solve.ts';
import { dist } from './vec.ts';
import { coilCompression, coilForce, bumpStopForce, dampingFromZeta, G } from './forces.ts';
import { patchLengthM, tyreVertical, verticalStiffness } from '../vehicle/tyre-data.ts';

export type DamperPreset = 'worn' | 'comfort' | 'sport' | 'track';

/** Damping ratio at the wheel of each preset (suspensions plan, the bump scene, step 4). */
export const DAMPER_PRESETS: Record<DamperPreset, number> = { worn: 0.08, comfort: 0.25, sport: 0.4, track: 0.65 };

export interface CornerSetup {
  /** Spring rate along the spring, N/mm. */
  springNmm: number;
  /** The corner's own damper, a preset, or a damping ratio ζ at the wheel. */
  damper: 'factory' | DamperPreset | number;
  /** Body height over the corner relative to design, m, positive up. */
  rideHeightM: number;
  /** Static camber relative to the body, degrees, negative when the top leans in. */
  camberDeg: number;
  /** Static toe of this wheel, degrees, positive toe-in. */
  toeDeg: number;
  /** Cold gauge tyre pressure, bar. */
  pressureBar: number;
}

/** Limits of the panel controls (choices of the page, not facts about cars). */
export const SETUP_RANGES = {
  springNmm: [10, 100],
  zeta: [0.05, 1],
  rideHeightM: [-0.04, 0.04],
  camberDeg: [-3, 1],
  toeDeg: [-0.5, 0.5],
  pressureBar: [1.2, 3.5],
} as const satisfies Record<string, readonly [number, number]>;

const clamp = (v: number, [lo, hi]: readonly [number, number], fallback: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** The corner as it left the factory: its spring and damper, design height, design camber and toe, nominal pressure. */
export function factorySetup(corner: CornerSpec): CornerSetup {
  const axle = corner.axle;
  const s = axle.spinAxis;
  return {
    springNmm: axle.spring.rate / 1000,
    damper: 'factory',
    rideHeightM: 0,
    camberDeg: (-Math.atan2(s[2], Math.hypot(s[0], s[1])) * 180) / Math.PI,
    toeDeg: (Math.atan2(s[0], s[1]) * 180) / Math.PI,
    pressureBar: tyreVertical(corner.tyre).nominalBar,
  };
}

/** A setup with every field finite and inside SETUP_RANGES (a link from elsewhere may carry anything). */
export function clampSetup(setup: CornerSetup, factory: CornerSetup): CornerSetup {
  const d = setup.damper;
  const damper: CornerSetup['damper'] =
    d === 'factory' || (typeof d === 'string' && Object.hasOwn(DAMPER_PRESETS, d))
      ? d
      : typeof d === 'number' && Number.isFinite(d)
        ? clamp(d, SETUP_RANGES.zeta, 0.25)
        : factory.damper;
  return {
    springNmm: clamp(setup.springNmm, SETUP_RANGES.springNmm, factory.springNmm),
    damper,
    rideHeightM: clamp(setup.rideHeightM, SETUP_RANGES.rideHeightM, 0),
    camberDeg: clamp(setup.camberDeg, SETUP_RANGES.camberDeg, factory.camberDeg),
    toeDeg: clamp(setup.toeDeg, SETUP_RANGES.toeDeg, factory.toeDeg),
    pressureBar: clamp(setup.pressureBar, SETUP_RANGES.pressureBar, factory.pressureBar),
  };
}

export interface ResolvedCorner {
  corner: CornerSpec;
  setup: CornerSetup;
  /** Tables of the corner with the alignment of the setup. Its spec carries the top shift and the tie-rod length. */
  axle: Axle;
  /** Lateral shift of the strut top mount, m (negative inboard, which gives negative camber). */
  topShiftM: number;
  /** Tie-rod length that gives the toe, m, and its change from the drawing. */
  tieRodM: number;
  tieRodChangeM: number;
  /** Whether the layout could take the camber and toe asked for (a strut, a steered rod). */
  camberSet: boolean;
  toeSet: boolean;
  /** Travel at rest, m: −rideHeight. */
  staticTravelM: number;
  /** The table at rest. */
  atRest: CornerSample;
  sprungKg: number;
  unsprungKg: number;
  spring: {
    rate: number;
    rate2: number;
    fromM: number;
    /** Free length that holds the car at the chosen height, perch included, m. */
    freeM: number;
    /** How far the lower seat moved up from where it holds the car at design height, m. */
    perchM: number;
    /** Force along the spring at rest, N. */
    staticN: number;
  };
  damper: DamperSpec;
  /** Damping ratio at the wheel this damper gives (the preset's, or the factory one's by the same baseline). */
  zeta: number;
  bumpStop: {
    /** Damper length where the stop touches, m (fixed on the damper rod, so lowering eats into it). */
    contactM: number;
    lengthM: number;
    rate: number;
  };
  /** Damper length where it tops out (full droop), m. A stop of the bump-stop law catches the wheel there. */
  topOutM: number;
  tyre: {
    kt: number;
    ct: number;
    freeRadiusM: number;
    widthM: number;
    /** Deflection and contact patch length at rest, m. */
    staticDeflM: number;
    patchM: number;
  };
  /** Wheel centre height above the road at rest, and the body's height relative to design, m. */
  wheelCentreZM: number;
  bodyStaticM: number;
  /** Stiffness at the wheel at rest (spring through the varying motion ratio, preload term included), N/m. */
  wheelRate: number;
  /** In series with the tyre, N/m. */
  rideRate: number;
  bodyHz: number;
  hopHz: number;
  /** Damping at the wheel below the knee, compression and rebound, N·s/m. */
  wheelDamping: { compression: number; rebound: number };
}

const DEG = Math.PI / 180;

/** Turns a corner and a setup into the corner the simulation runs. Pure; throws only if the linkage cannot assemble. */
export function resolveCorner(corner: CornerSpec, raw: CornerSetup): ResolvedCorner {
  const factory = factorySetup(corner);
  const setup = clampSetup(raw, factory);
  const spec = corner.axle;
  const q0 = -setup.rideHeightM;

  // Alignment: strut top shift (y) and tie-rod length so that camber and toe at rest are the ones asked for.
  const solver = new CornerSolver(spec);
  const strut = spec.linkage.strut;
  const tieRow = solver.steerRow();
  const tieRodDesign = tieRow >= 0 ? solver.lengthOf(tieRow) : 0;
  const camberSet = !!strut;
  const toeSet = tieRow >= 0;
  let shiftY = 0;
  let tie = tieRodDesign;
  const pose = CornerSolver.identity();
  const spin = new Float64Array(3);
  const angles = (sy: number, lt: number): [number, number] => {
    if (strut) solver.setTopShift(strut.top, [0, sy, 0]);
    if (tieRow >= 0) solver.setLength(tieRow, lt);
    const res = solver.solve(pose, q0, 0, 40);
    if (!res.ok) throw new Error(`The corner does not assemble with this setup: ${res.worst}`);
    solver.direction(pose, spec.spinAxis, spin);
    return [-Math.atan2(spin[2], Math.hypot(spin[0], spin[1])), Math.atan2(spin[0], spin[1])];
  };
  const want: [number, number] = [setup.camberDeg * DEG, setup.toeDeg * DEG];
  let err = Infinity;
  for (let it = 0; it <= 12; it++) {
    const [c, t] = angles(shiftY, tie);
    const ec = camberSet ? c - want[0] : 0;
    const et = toeSet ? t - want[1] : 0;
    err = Math.max(Math.abs(ec), Math.abs(et));
    if (err < 1e-10 || it === 12) break;
    // Finite-difference Jacobian of (camber, toe) on (shift, length). An unknown the layout lacks keeps its row and
    // column of the identity, so the other one's coupling cannot move it.
    const h = 1e-6;
    const [c1, t1] = camberSet ? angles(shiftY + h, tie) : [c, t];
    const [c2, t2] = toeSet ? angles(shiftY, tie + h) : [c, t];
    const a = camberSet ? (c1 - c) / h : 1;
    const b = camberSet && toeSet ? (c2 - c) / h : 0;
    const cc = camberSet && toeSet ? (t1 - t) / h : 0;
    const d = toeSet ? (t2 - t) / h : 1;
    const det = a * d - b * cc;
    shiftY -= (d * ec - b * et) / det;
    tie -= (a * et - cc * ec) / det;
  }
  if (err > 1e-8) throw new Error(`The corner cannot reach this camber and toe: off by ${(err / DEG).toFixed(4)}°`);
  const topShift: Vec3 = [0, shiftY, 0];
  const tieIndex = tieRow - 2 * spec.linkage.wishbones.length;
  const linkage: CornerLinkage = {
    ...spec.linkage,
    rods: spec.linkage.rods.map((r, i) => (toeSet && i === tieIndex ? { ...r, lengthM: tie } : r)),
  };
  if (strut) linkage.strut = { ...strut, topShift };
  const axle = new Axle({ ...spec, linkage });

  const atRest = newCornerSample();
  axle.sample('left', q0, 0, atRest);
  const design = newCornerSample();
  axle.sample('left', 0, 0, design);

  // Tyre at rest.
  const tyreData = tyreVertical(corner.tyre);
  const freeRadiusM = corner.tyreRadiusM ?? tyreData.freeRadiusM;
  const kt = verticalStiffness(tyreData, setup.pressureBar);
  const ms = corner.sprungKg;
  const mu = corner.unsprungKg;
  const staticDeflM = ((ms + mu) * G) / kt;
  const wheelCentreZM = freeRadiusM - staticDeflM;
  const bodyStaticM = wheelCentreZM - spec.wheelCentre[2] - q0;

  // Stops on the damper.
  const top = spec.linkage.strut?.top;
  const lower = spec.linkage.strut?.lower;
  const designDamper = top && lower ? dist(top, lower) : design.damperLen;
  const contactM = designDamper - spec.bumpStop.gapM;
  const bumpAtRest = bumpStopForce(contactM - atRest.damperLen, spec.bumpStop.rate, spec.bumpStop.lengthM);
  const topOutM = axle.value('damperLen', -spec.travel.droopM);

  // Spring: whatever the stop does not carry at rest.
  const rate = setup.springNmm * 1000;
  const prog = spec.spring.progressive;
  const rate2 = prog ? rate * (prog.rate / spec.spring.rate) : rate;
  const fromM = prog ? prog.fromM : Infinity;
  const staticN = Math.max(0, (ms * G - bumpAtRest * atRest.mrDamper) / atRest.mrSpring);
  const freeM = atRest.springLen + coilCompression(staticN, rate, rate2, fromM);
  const designN = (ms * G) / design.mrSpring;
  const perchM = freeM - (design.springLen + coilCompression(designN, rate, rate2, fromM));

  // Stiffness at the wheel by a central difference of the support force (spring only, at rest).
  const eps = 0.0005;
  const support = (q: number): number =>
    coilForce(rate, freeM, axle.value('springLen', q), rate2, fromM) * axle.value('mrSpring', q);
  const wheelRate = (support(q0 + eps) - support(q0 - eps)) / (2 * eps);
  const rideRate = (wheelRate * kt) / (wheelRate + kt);
  const bodyHz = Math.sqrt(rideRate / ms) / (2 * Math.PI);
  const hopHz = Math.sqrt((wheelRate + kt) / mu) / (2 * Math.PI);

  // Damper.
  const mrD = atRest.mrDamper;
  let damper: DamperSpec;
  let zeta: number;
  if (setup.damper === 'factory') {
    damper = spec.damper;
    // Inverse of the baseline: the mean of compression·3/2 and rebound·2/3 is the initial slope.
    const slope = ((spec.damper.compression * 1.5 + spec.damper.rebound / 1.5) / 2) * mrD * mrD;
    zeta = slope / (4 * Math.PI * bodyHz * ms);
  } else {
    zeta = typeof setup.damper === 'number' ? setup.damper : DAMPER_PRESETS[setup.damper];
    damper = { ...spec.damper, ...dampingFromZeta(zeta, bodyHz, ms, mrD) };
  }

  return {
    corner,
    setup,
    axle,
    topShiftM: shiftY,
    tieRodM: tie,
    tieRodChangeM: tie - tieRodDesign,
    camberSet,
    toeSet,
    staticTravelM: q0,
    atRest,
    sprungKg: ms,
    unsprungKg: mu,
    spring: { rate, rate2, fromM, freeM, perchM, staticN },
    damper,
    zeta,
    bumpStop: { contactM, lengthM: spec.bumpStop.lengthM, rate: spec.bumpStop.rate },
    topOutM,
    tyre: {
      kt,
      ct: tyreData.ctNsm,
      freeRadiusM,
      widthM: tyreData.widthM,
      staticDeflM,
      patchM: patchLengthM(freeRadiusM, staticDeflM),
    },
    wheelCentreZM,
    bodyStaticM,
    wheelRate,
    rideRate,
    bodyHz,
    hopHz,
    wheelDamping: { compression: damper.compression * mrD * mrD, rebound: damper.rebound * mrD * mrD },
  };
}
