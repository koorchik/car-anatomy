// What a visitor may change on a corner without opening the designer (the Setup panel of a scene): spring, damper, ride
// height, static camber and toe, tyre pressure. resolveCorner turns a corner and a setup into everything the quarter
// car and the 3D read, the way a workshop would do it:
//   - ride height moves the spring perch, so the static point slides along the kinematic curves (travel −Δh): with
//     the factory alignment a lowered strut leans its wheel in and toes it out, as on the real car;
//   - a static camber the visitor types is set at that static point by sliding the strut top mount (camber plates), a
//     static toe by the tie-rod length; both are solved to 1e-10 rad, so the numbers typed are what the corner has.
//     Moving the top mount turns the knuckle against the tie rod (−1.5° of camber drags the JTEKT toe by −1.45°), so a
//     camber change re-sets the toe the way a shop does after camber plates: to the value asked, or to the factory
//     toe at this ride height;
//   - the spring is one of the chosen rate made for this car, and the perch carries it to the chosen height;
//   - a damper preset or ζ becomes coefficients by the OptimumG baseline at the corner's ride frequency;
//   - pressure changes only the tyre's vertical stiffness.

import type { CornerLinkage, CornerSpec, DamperSpec, Vec3 } from './spec.ts';
import { Axle, newCornerSample, type CornerSample } from './kinematics.ts';
import { CornerSolver } from './solve.ts';
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
  /**
   * Static camber at rest relative to the body, degrees, negative when the top leans in, set with the strut top mount;
   * or 'factory': the top mount stays where the drawing has it, so the camber at rest is the curve's at the static point.
   */
  camberDeg: 'factory' | number;
  /**
   * Static toe of this wheel at rest, degrees, positive toe-in, set with the tie rod; or 'factory': the toe the drawn
   * hardware gives at this ride height (the rod as drawn, re-set only when a camber change would drag the toe along).
   */
  toeDeg: 'factory' | number;
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

/** The corner as it left the factory: its spring and damper, design height, the alignment as drawn, nominal pressure. */
export function factorySetup(corner: CornerSpec): CornerSetup {
  return {
    springNmm: corner.axle.spring.rate / 1000,
    damper: 'factory',
    rideHeightM: 0,
    camberDeg: 'factory',
    toeDeg: 'factory',
    pressureBar: tyreVertical(corner.tyre).nominalBar,
  };
}

/** An alignment angle from a link: a finite number inside the range, or the factory alignment. */
const angle = (v: unknown, range: readonly [number, number]): 'factory' | number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(range[1], Math.max(range[0], v)) : 'factory';

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
    camberDeg: angle(setup.camberDeg, SETUP_RANGES.camberDeg),
    toeDeg: angle(setup.toeDeg, SETUP_RANGES.toeDeg),
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
  /** Whether the strut top mount was moved for a camber asked for, and the tie rod for a toe (asked for, or held while
   *  the camber changes). A layout without the adjuster (no strut, no steered rod) keeps its hardware as drawn. */
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
    /** Wheel travel from rest to where the stop touches, on the table the quarter car reads, m. */
    travelM: number;
    lengthM: number;
    rate: number;
  };
  /** Damper length where it tops out (full droop of the corner as drawn), m. A stop of the bump-stop law catches the
   *  wheel there. Like the bump stop it is hardware: lowering and camber plates do not move it. */
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

/** Length of the damper of the corner as drawn at `travel`, by an exact solve (wherever the damper sits). */
function drawnDamperLength(axle: Axle, travel: number): number {
  const s = newCornerSample();
  axle.measureAt(travel, s);
  return s.damperLen;
}

/** Travel in [from, to] where the damper is `len` long (it shortens in bump), by bisection on the table; the nearer
 *  end when it never gets there. */
function travelAtDamperLength(axle: Axle, len: number, from: number, to: number): number {
  if (axle.value('damperLen', from) <= len) return from;
  if (axle.value('damperLen', to) >= len) return to;
  let lo = from;
  let hi = to;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (axle.value('damperLen', mid) > len) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

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
  // The damper's end stops are hardware, so their lengths come from the corner as drawn, before any alignment.
  const drawn = new Axle(spec);
  const contactM = drawnDamperLength(drawn, 0) - spec.bumpStop.gapM;
  const topOutM = drawnDamperLength(drawn, -spec.travel.droopM);
  const camberSet = !!strut && setup.camberDeg !== 'factory';
  const toeSet = tieRow >= 0 && (setup.toeDeg !== 'factory' || camberSet);
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
  // The factory alignment at this ride height: the angles the hardware as drawn gives at rest.
  const [camber0, toe0] = camberSet || toeSet ? angles(0, tieRodDesign) : [0, 0];
  const want: [number, number] = [
    setup.camberDeg === 'factory' ? camber0 : setup.camberDeg * DEG,
    setup.toeDeg === 'factory' ? toe0 : setup.toeDeg * DEG,
  ];
  let err = 0;
  for (let it = 0; it <= 12 && (camberSet || toeSet); it++) {
    const [c, t] = angles(shiftY, tie);
    const ec = camberSet ? c - want[0] : 0;
    const et = toeSet ? t - want[1] : 0;
    err = Math.max(Math.abs(ec), Math.abs(et));
    if (err < 1e-10 || it === 12) break;
    // Finite-difference Jacobian of (camber, toe) on (shift, length). An adjuster that stays put (not asked for, or
    // missing from the layout) keeps its row and column of the identity, so the other one's coupling cannot move it.
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
  const bumpAtRest = bumpStopForce(contactM - atRest.damperLen, spec.bumpStop.rate, spec.bumpStop.lengthM);
  const bumpEnd = axle.table.travel0 + (axle.table.n - 1) * axle.table.step;
  const travelToStop = travelAtDamperLength(axle, contactM, q0, bumpEnd) - q0;

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
    bumpStop: { contactM, travelM: travelToStop, lengthM: spec.bumpStop.lengthM, rate: spec.bumpStop.rate },
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
