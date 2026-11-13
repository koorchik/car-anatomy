import { describe, expect, it } from 'vitest';
import { fromJtekt, jtektCorner, jtektKingpinOffsetM, JTEKT_TABLE1, macphersonJtekt, SPLIT_KNUCKLE_DEFAULTS } from '../src/suspension/templates/macpherson.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { multilink, multilinkDefaults } from '../src/suspension/templates/multilink.ts';
import { buildAxle, newCornerSample } from '../src/suspension/kinematics.ts';
import { buildAxleLite, rolledRollCentre } from '../src/suspension/axle-lite.ts';
import { POSE_SIZE } from '../src/suspension/solve.ts';
import type { AnyCornerLinkage, AxleSpec, PivotLinkage, Vec3 } from '../src/suspension/spec.ts';
import { cross, dot, rotateInto, sub, svd } from '../src/suspension/vec.ts';
import { clampSetup, factorySetup, resolveCorner, SETUP_RANGES, type CornerSetup } from '../src/suspension/setup.ts';
import { dist } from '../src/suspension/vec.ts';
import { CornerSolver } from '../src/suspension/solve.ts';
import { PRESSURE_KT_SLOPE, patchLengthM, TYRE_FILES, tyreVertical, verticalStiffness } from '../src/vehicle/tyre-data.ts';
import type { Axle } from '../src/suspension/kinematics.ts';
import {
  pivotAxisDirection,
  pivotAxle,
  pivotLayout,
  PIVOT_BUMP_STOP_TRAVEL_M,
  PIVOT_TRAVEL,
  PIVOT_TYPICAL,
  type PivotIntent,
} from '../src/suspension/templates/pivot.ts';
import { pivotAsLinks, pivotFrontViewCentre, PivotSolver } from '../src/suspension/solve-pivot.ts';
import {
  shearCentreOf,
  twistBeamAxle,
  TWIST_BEAM_BUMP_STOP_TRAVEL_M,
  TWIST_BEAM_TYPICAL,
  type TwistBeamIntent,
} from '../src/suspension/templates/twist-beam.ts';
import { buildTwistBeam, newBeamSample, type BeamSample, type TwistBeamAxle } from '../src/suspension/beam-kinematics.ts';
import { TwistBeamSolver } from '../src/suspension/solve-twist-beam.ts';
import { mirrorY } from '../src/suspension/vec.ts';
import { solidAxle, SOLID_BUMP_STOP_TRAVEL_M, SOLID_TYPICAL, type SolidAxleIntent } from '../src/suspension/templates/solid-axle.ts';
import { newSolidSample, SolidAxle, type SolidSample } from '../src/suspension/solid-kinematics.ts';
import { LEAF_LINK_SHARE } from '../src/suspension/solve-axle.ts';

const DEG = Math.PI / 180;

// The research's regression (docs/suspension-research/kinematics_geometry.md, «Real MacPherson computed by me»): wheel
// centre 300 mm above the road, which the paper does not give; zero camber and toe at straight-line travel, which it
// does. KPI, caster, tie-rod length and the camber curve do not depend on the radius; scrub and trail do.
const spec = macphersonJtekt({ wheelCentreZM: 0.3 });
const axle = buildAxle(spec);
const at = (travel: number) => {
  const s = newCornerSample();
  axle.measureAt(travel, s);
  return s;
};

describe('JTEKT MacPherson corner (Iwatsuki 2023, Table 1)', () => {
  it('reproduces the published tie-rod length, arm length and track', () => {
    const rod = spec.linkage.rods[0];
    expect(dist(rod.body, rod.knuckle) * 1000).toBeCloseTo(414.38, 1);
    expect(Math.abs(dist(rod.body, rod.knuckle) * 1000 - JTEKT_TABLE1.tieRodMm)).toBeLessThan(0.01);
    // L_S is the distance from the ball joint to the arm's revolute pair P_SA.
    const arm = spec.linkage.wishbones[0];
    expect(Math.abs(dist(arm.front, arm.ball) * 1000 - JTEKT_TABLE1.armMm)).toBeLessThan(0.01);
    expect(spec.wheelCentre[1] * 2 * 1000).toBeCloseTo(JTEKT_TABLE1.trackMm, 6);
    expect(fromJtekt(JTEKT_TABLE1.wheelCentre, 0.3)).toEqual([0, 0.73, 0.3]);
  });

  it('gives the steering axis of the paper: KPI 12.18°, caster 7.58°, at straight-line travel', () => {
    const s = at(0);
    expect(Math.abs(s.kpi / DEG - 12.18)).toBeLessThan(0.02);
    expect(Math.abs(s.caster / DEG - 7.58)).toBeLessThan(0.02);
    expect(Math.abs(s.camber)).toBeLessThan(1e-12);
    expect(Math.abs(s.toe)).toBeLessThan(1e-12);
    // Regression against the research with the same 300 mm radius.
    expect(s.scrub * 1000).toBeCloseTo(3.8, 1);
    expect(s.trail * 1000).toBeCloseTo(45.5, 1);
  });

  it('gains negative camber in bump and turns it back between +40 and +80 mm (regression: −0.48° at +40 mm)', () => {
    expect(Math.abs(at(0.04).camber / DEG + 0.48)).toBeLessThan(0.05);
    const gain = (z: number): number => (at(z + 0.001).camber - at(z - 0.001).camber) / 0.002;
    expect(gain(0)).toBeLessThan(0);
    expect(gain(0.04)).toBeLessThan(0);
    expect(gain(0.08)).toBeGreaterThan(0);
    expect(gain(0) / DEG).toBeCloseTo(-17.14, 1);
    // Toe-out in bump (bump steer about −9.2°/m) and the wheel moving forward (+0.05).
    expect((at(0.001).toe - at(-0.001).toe) / 0.002 / DEG).toBeCloseTo(-9.25, 1);
    expect(at(0).tanThetaWC).toBeCloseTo(0.0499, 3);
  });

  it('has a spring motion ratio near one, as published for struts', () => {
    for (const z of [-0.04, 0, 0.04]) {
      const s = at(z);
      expect(s.mrSpring).toBeGreaterThan(0.85);
      expect(s.mrSpring).toBeLessThan(1.0);
    }
  });
});

describe('the macpherson page corner', () => {
  const corner = jtektCorner();
  const page = buildAxle(corner.axle);

  it('keeps its CV joints inside the maker limits over the whole travel', () => {
    const shaft = corner.axle.halfshaft!;
    const s = newCornerSample();
    for (let z = -corner.axle.travel.droopM; z <= corner.axle.travel.bumpM + 1e-9; z += 0.002) {
      page.sample('left', z, 0, s);
      expect(s.cvInner / DEG).toBeLessThanOrEqual(shaft.innerMaxDeg);
      expect(s.cvOuter / DEG).toBeLessThanOrEqual(shaft.outerMaxDeg);
      expect(s.plunge).toBeGreaterThanOrEqual(shaft.plungeM[0]);
      expect(s.plunge).toBeLessThanOrEqual(shaft.plungeM[1]);
    }
  });

  it('touches the bump stop 80 mm into bump', () => {
    const contact = dist(corner.axle.linkage.strut!.top, corner.axle.linkage.strut!.lower) - corner.axle.bumpStop.gapM;
    expect(page.value('damperLen', 0.08)).toBeCloseTo(contact, 9);
  });

  it('sits on the street tyre at its loaded radius', () => {
    const tyre = TYRE_FILES['sedan-pac02'];
    const load = (corner.sprungKg + corner.unsprungKg) * 9.81;
    expect(corner.axle.wheelCentre[2]).toBeCloseTo(tyre.freeRadiusM - load / tyre.ktNm, 12);
  });
});

describe('corner setup', () => {
  const corner = jtektCorner();
  const factory = factorySetup(corner);
  const page = buildAxle(corner.axle);

  it('reproduces the factory corner unchanged', () => {
    const r = resolveCorner(corner, factory);
    expect(r.topShiftM).toBe(0);
    expect(Math.abs(r.tieRodChangeM)).toBeLessThan(1e-12);
    expect(r.spring.perchM).toBeCloseTo(0, 12);
    expect(r.bodyStaticM).toBeCloseTo(0, 12);
    expect(r.zeta).toBeCloseTo(0.25, 4);
    expect(r.damper).toEqual(corner.axle.damper);
  });

  it('sets static camber and toe to within 0.01°, at any ride height', () => {
    const cases: Array<{ camberDeg: number; toeDeg: number; rideHeightM?: number; springNmm?: number }> = [
      { camberDeg: -1.5, toeDeg: 0.1 },
      { camberDeg: -3, toeDeg: -0.3, rideHeightM: -0.04 },
      { camberDeg: 0.5, toeDeg: 0.4, rideHeightM: 0.03 },
      { camberDeg: -0.8, toeDeg: 0, rideHeightM: 0.04, springNmm: 60 },
    ];
    for (const c of cases) {
      const r = resolveCorner(corner, { ...factory, ...c });
      expect(r.camberSet && r.toeSet).toBe(true);
      expect(Math.abs(r.atRest.camber / DEG - c.camberDeg)).toBeLessThan(0.01);
      expect(Math.abs(r.atRest.toe / DEG - c.toeDeg)).toBeLessThan(0.01);
      // The exact solve agrees with the table at rest.
      const s = newCornerSample();
      r.axle.measureAt(r.staticTravelM, s);
      expect(Math.abs(s.camber / DEG - c.camberDeg)).toBeLessThan(1e-6);
      expect(Math.abs(s.toe / DEG - c.toeDeg)).toBeLessThan(1e-6);
    }
    // Negative camber comes from moving the top mount inboard, toe-in from a shorter tie rod (arm ahead of the axle).
    const neg = resolveCorner(corner, { ...factory, camberDeg: -2 });
    expect(neg.topShiftM).toBeLessThan(0);
    const toeIn = resolveCorner(corner, { ...factory, toeDeg: 0.3 });
    expect(toeIn.tieRodChangeM).not.toBe(0);
  });

  it('changes camber without dragging the toe, and toe without moving the top mount', () => {
    const D = 180 / Math.PI;
    for (const rh of [0, -0.04]) {
      // Camber alone: the toe stays what the factory hardware gives at this height (0° at design, −0.35° lowered).
      const camber = resolveCorner(corner, { ...factory, rideHeightM: rh, camberDeg: -1.5 });
      expect(camber.camberSet && camber.toeSet).toBe(true);
      expect(camber.atRest.camber * D).toBeCloseTo(-1.5, 6);
      expect(camber.atRest.toe).toBeCloseTo(page.value('toe', -rh), 9);
      // Toe alone: the top mount stays as drawn. Turning the wheel by δ about an axis with caster ν changes its camber
      // by about −δ·sin ν (toe-in on the left wheel steers it to the right, where it is the outer wheel).
      const toe = resolveCorner(corner, { ...factory, rideHeightM: rh, toeDeg: 0.2 });
      expect(toe.camberSet).toBe(false);
      expect(toe.topShiftM).toBe(0);
      expect(toe.atRest.toe * D).toBeCloseTo(0.2, 6);
      const steer = toe.atRest.toe - page.value('toe', -rh);
      const expected = -steer * Math.sin(page.value('caster', -rh));
      expect(Math.abs((toe.atRest.camber - page.value('camber', -rh)) / expected - 1)).toBeLessThan(0.05);
    }
    // Without the re-set the camber plate would drag the toe by well over a degree: that is why it is re-set.
    const plates = new CornerSolver(corner.axle);
    const shifted = CornerSolver.identity();
    plates.setTopShift(corner.axle.linkage.strut!.top, [0, resolveCorner(corner, { ...factory, camberDeg: -1.5 }).topShiftM, 0]);
    expect(plates.solve(shifted, 0, 0, 40).ok).toBe(true);
    const spin = [0, 0, 0];
    plates.direction(shifted, corner.axle.spinAxis, spin);
    expect(Math.abs(Math.atan2(spin[0], spin[1]) * D)).toBeGreaterThan(1);
  });

  it('leaves an adjuster the layout lacks alone: no steered rod, no toe change', () => {
    const fixed = jtektCorner();
    fixed.axle.linkage.rods = fixed.axle.linkage.rods.map((r) => ({ ...r, steer: false }));
    const r = resolveCorner(fixed, { ...factorySetup(fixed), camberDeg: -2, toeDeg: 0.3 });
    expect(r.toeSet).toBe(false);
    expect(r.tieRodChangeM).toBe(0);
    expect(Math.abs(r.atRest.camber / DEG + 2)).toBeLessThan(1e-6);
  });

  it('reaches every corner of the panel ranges', () => {
    for (const camberDeg of SETUP_RANGES.camberDeg) {
      for (const toeDeg of SETUP_RANGES.toeDeg) {
        for (const rideHeightM of SETUP_RANGES.rideHeightM) {
          const r = resolveCorner(corner, { ...factory, camberDeg, toeDeg, rideHeightM });
          expect(Math.abs(r.atRest.camber / DEG - camberDeg)).toBeLessThan(0.01);
          expect(Math.abs(r.atRest.toe / DEG - toeDeg)).toBeLessThan(0.01);
        }
      }
    }
  });

  it('moves the static point along the kinematic curves with ride height', () => {
    const D = 180 / Math.PI;
    const fields = ['camber', 'toe', 'mrSpring', 'tanBeta', 'kpi', 'caster', 'scrub', 'damperLen'] as const;
    for (const rh of [-0.04, -0.02, 0.02, 0.04]) {
      // The factory alignment leaves the hardware alone: the corner at rest is the factory one at travel −rh.
      const r = resolveCorner(corner, { ...factory, rideHeightM: rh });
      expect(r.staticTravelM).toBe(-rh);
      expect(r.camberSet || r.toeSet).toBe(false);
      expect(r.topShiftM).toBe(0);
      expect(r.tieRodChangeM).toBe(0);
      for (const f of fields) expect(r.atRest[f], f).toBeCloseTo(page.value(f, -rh), 9);
      // Asking for the angles the curve already has there needs no adjustment either.
      const same = resolveCorner(corner, { ...factory, rideHeightM: rh, camberDeg: page.value('camber', -rh) * D, toeDeg: page.value('toe', -rh) * D });
      expect(Math.abs(same.topShiftM)).toBeLessThan(1e-6);
      for (const f of fields) expect(same.atRest[f], f).toBeCloseTo(page.value(f, -rh), 6);
      // The body stands rh higher; the tyre is as pressed as before.
      expect(r.bodyStaticM).toBeCloseTo(rh, 9);
      expect(r.tyre.staticDeflM).toBeCloseTo(resolveCorner(corner, factory).tyre.staticDeflM, 12);
    }
    // Lowered 40 mm on factory hardware, the JTEKT strut sits at the −0.48° of the curve at +40 mm.
    expect(resolveCorner(corner, { ...factory, rideHeightM: -0.04 }).atRest.camber * D).toBeCloseTo(-0.48, 2);
    // Lowering a strut drops its roll centre (y_C·dy_C/dz) and eats into the travel left to the bump stop.
    const low = resolveCorner(corner, { ...factory, rideHeightM: -0.04 });
    const base = resolveCorner(corner, factory);
    const rc = (r: typeof base): number => r.atRest.contactY * r.atRest.tanBeta;
    expect(rc(low)).toBeLessThan(rc(base) - 0.05);
    expect(base.bumpStop.travelM).toBeCloseTo(0.08, 6);
    expect(low.bumpStop.travelM).toBeCloseTo(0.04, 6);
    // The perch moves down by about the height times the motion ratio.
    expect(low.spring.perchM).toBeLessThan(-0.035);
    expect(low.spring.perchM).toBeGreaterThan(-0.05);
  });

  it('keeps the damper stops where the hardware has them, whatever the alignment and height', () => {
    const base = resolveCorner(corner, factory);
    expect(base.topOutM).toBeCloseTo(page.value('damperLen', -corner.axle.travel.droopM), 9);
    for (const s of [{ camberDeg: -3, toeDeg: 0.5 }, { camberDeg: 1, rideHeightM: 0.04 }, { rideHeightM: -0.04, springNmm: 80 }]) {
      const r = resolveCorner(corner, { ...factory, ...s });
      expect(r.bumpStop.contactM).toBe(base.bumpStop.contactM);
      expect(r.topOutM).toBe(base.topOutM);
      // The travel left to the stop is where the table reaches the contact length.
      expect(r.axle.value('damperLen', r.staticTravelM + r.bumpStop.travelM)).toBeCloseTo(r.bumpStop.contactM, 9);
    }
  });

  it('holds the car with any spring: the static support equals the sprung weight', () => {
    for (const springNmm of [12, 25, 60, 100]) {
      const r = resolveCorner(corner, { ...factory, springNmm });
      expect(r.spring.staticN * r.atRest.mrSpring).toBeCloseTo(corner.sprungKg * 9.81, 6);
      expect(r.wheelRate).toBeGreaterThan(springNmm * 1000 * r.atRest.mrSpring ** 2);
    }
  });

  it('turns damper presets into the damping ratio asked for', () => {
    for (const [preset, zeta] of [['worn', 0.08], ['comfort', 0.25], ['sport', 0.4], ['track', 0.65], [0.5, 0.5]] as const) {
      const r = resolveCorner(corner, { ...factory, damper: preset });
      expect(r.zeta).toBe(zeta);
      const mr = r.atRest.mrDamper;
      const slope = 4 * Math.PI * zeta * r.bodyHz * corner.sprungKg;
      expect(r.damper.compression * mr * mr).toBeCloseTo((2 / 3) * slope, 6);
      expect(r.damper.rebound * mr * mr).toBeCloseTo((3 / 2) * slope, 6);
    }
  });

  it('survives hostile input from a link', () => {
    const r = resolveCorner(corner, { springNmm: NaN, damper: -3, rideHeightM: 9, camberDeg: -40, toeDeg: Infinity, pressureBar: -1 });
    expect(r.setup.springNmm).toBe(25);
    expect(r.setup.rideHeightM).toBe(0.04);
    expect(r.setup.camberDeg).toBe(-3);
    expect(r.setup.toeDeg).toBe('factory');
    expect(r.setup.pressureBar).toBe(1.2);
    expect(r.setup.damper).toBe(0.05);
    expect(Number.isFinite(r.bodyHz)).toBe(true);
    // Anything but a finite number is the factory alignment; clamping twice changes nothing.
    const odd = { ...factory, camberDeg: 'tilted', toeDeg: '0.2', damper: '__proto__' } as unknown as CornerSetup;
    const once = clampSetup(odd, factory);
    expect(once).toEqual(factory);
    expect(clampSetup(clampSetup(r.setup, factory), factory)).toEqual(r.setup);
  });
});

describe('tyre pressure', () => {
  const tyre = tyreVertical('street');

  it('stiffens the tyre linearly: +10 % pressure gives +8 % k_t', () => {
    const p0 = tyre.nominalBar;
    expect(verticalStiffness(tyre, p0)).toBe(tyre.ktNm);
    expect(verticalStiffness(tyre, p0 * 1.1) / tyre.ktNm).toBeCloseTo(1 + 0.1 * PRESSURE_KT_SLOPE, 12);
    // Linear: equal pressure steps give equal stiffness steps.
    const ps = [1.4, 1.9, 2.4, 2.9, 3.4];
    const ks = ps.map((p) => verticalStiffness(tyre, p));
    for (let i = 1; i < ks.length - 1; i++) expect(ks[i + 1] - 2 * ks[i] + ks[i - 1]).toBeCloseTo(0, 6);
    expect(ks[1] - ks[0]).toBeGreaterThan(0);
  });

  it('makes the corner sit higher on a shorter patch when pumped up', () => {
    const corner = jtektCorner();
    const factory = factorySetup(corner);
    const soft = resolveCorner(corner, { ...factory, pressureBar: 1.8 });
    const hard = resolveCorner(corner, { ...factory, pressureBar: 2.8 });
    expect(hard.tyre.kt).toBeGreaterThan(soft.tyre.kt);
    expect(hard.tyre.staticDeflM).toBeLessThan(soft.tyre.staticDeflM);
    expect(hard.tyre.patchM).toBeLessThan(soft.tyre.patchM);
    expect(hard.bodyStaticM - soft.bodyStaticM).toBeCloseTo(soft.tyre.staticDeflM - hard.tyre.staticDeflM, 12);
    // ℓ ≈ 2·√(2·r·F/k_t)
    const F = (corner.sprungKg + corner.unsprungKg) * 9.81;
    expect(hard.tyre.patchM).toBeCloseTo(patchLengthM(hard.tyre.freeRadiusM, F / hard.tyre.kt), 12);
    expect(Math.abs(hard.tyre.patchM / (2 * Math.sqrt((2 * hard.tyre.freeRadiusM * F) / hard.tyre.kt)) - 1)).toBeLessThan(0.02);
  });
});

// Single pivot axis (templates/pivot.ts, solve-pivot.ts). Expected values come from the geometry of a rotation about
// one axis: the front-view instant centre is where the axis pierces the transverse plane of the contact patch, the
// roll centre is where the line from the patch through it crosses the centre line, and the wheel's spin axis turns
// with the arm, so sin(camber) = sin θ·sin α on a level axis swept by α.
describe('single pivot axis: trailing arm, semi-trailing arm, swing axle', () => {
  // At design, where the patch rises with the wheel centre (dC_z/dq = 1), tanβ = dC_y/dq gives the roll centre.
  const rollCentre = (s: { contactY: number; tanBeta: number }): number => s.contactY * s.tanBeta;
  /** Roll centre height above the patch by the instant-centre construction. */
  const rollCentreByAxis = (link: PivotLinkage, s: { contactX: number; contactY: number; contactZ: number }): number => {
    const ic = pivotFrontViewCentre(link, s.contactX);
    if (!ic) return 0;
    return ((ic.z - s.contactZ) * s.contactY) / (s.contactY - ic.y);
  };
  const nodes = (a: { table: { n: number; travel0: number; step: number } }): number[] =>
    Array.from({ length: a.table.n }, (_, i) => a.table.travel0 + i * a.table.step);

  it('trailing arm on a level transverse axis: camber and toe stay as at design, roll centre on the road', () => {
    const spec = pivotAxle(PIVOT_TYPICAL['trailing-arm']);
    expect(spec.layout).toBe('trailing-arm');
    const axle = buildAxle(spec);
    const s = newCornerSample();
    for (const z of nodes(axle)) {
      axle.sample('left', z, 0, s);
      expect(Math.abs(s.camber)).toBeLessThan(1e-12);
      expect(Math.abs(s.toe)).toBeLessThan(1e-12);
      expect(Math.abs(rollCentre(s))).toBeLessThan(0.001);
    }
    // The wheel swings on an arc about the bushes ahead of it: the spring seat at 3/4 of the arm moves 3/4 as far.
    axle.measureAt(0, s);
    expect(s.mrSpring).toBeCloseTo(0.75, 9);
    expect(Number.isNaN(s.kpi)).toBe(true);
  });

  it('semi-trailing arm: camber ≈ θ·sin α within 2 % over ±20 mm, toe-in both ways, roll centre as the axis gives', () => {
    const intent = PIVOT_TYPICAL['semi-trailing'];
    const spec = pivotAxle(intent);
    expect(spec.layout).toBe('semi-trailing');
    const axle = buildAxle(spec);
    const solver = axle.solver as PivotSolver;
    const sinA = Math.sin(intent.sweepDeg * DEG);
    const s = newCornerSample();
    for (let mm = -20; mm <= 20; mm += 2) {
      if (mm === 0) continue;
      const pose = axle.measureAt(mm / 1000, s);
      const theta = solver.angleOf(pose);
      // Bump turns the arm up (θ > 0) and leans the wheel's top in.
      expect(Math.sign(theta)).toBe(Math.sign(mm));
      expect(Math.abs(s.camber / (-theta * sinA) - 1)).toBeLessThan(0.02);
    }
    for (const z of nodes(axle)) {
      if (Math.abs(z) < 1e-9) continue;
      axle.sample('left', z, 0, s);
      expect(s.toe).toBeGreaterThan(0);
    }
    // At design: camber gain −sin α / d, d the plan-view lever of the arm; roll centre by the instant centre to 1 mm
    // and inside the research's 90–120 mm for a rear axle.
    axle.measureAt(0, s);
    const e = pivotAxisDirection(intent.sweepDeg, intent.svAngleDeg);
    const r: Vec3 = [spec.wheelCentre[0] - intent.armM, spec.wheelCentre[1] - intent.pivotYM, 0];
    const lever = e[0] * r[1] - e[1] * r[0];
    const h = 1e-5;
    const camberAt = (z: number): number => {
      const c = newCornerSample();
      axle.measureAt(z, c);
      return c.camber;
    };
    const gain = (camberAt(h) - camberAt(-h)) / (2 * h);
    expect(Math.abs(gain / (-sinA / lever) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(rollCentre(s) - rollCentreByAxis(spec.linkage, s))).toBeLessThan(0.001);
    expect(rollCentre(s)).toBeGreaterThan(0.09);
    expect(rollCentre(s)).toBeLessThan(0.12);
  });

  it('swing axle: roll centre at the height the axis gives, and side force jacks the body up', () => {
    const intent = PIVOT_TYPICAL['swing-axle'];
    const spec = pivotAxle(intent);
    expect(spec.layout).toBe('swing-axle');
    const axle = buildAxle(spec);
    const s = newCornerSample();
    axle.measureAt(0, s);
    const yC = spec.wheelCentre[1];
    expect(Math.abs(rollCentre(s) - (intent.pivotZM * yC) / (yC - intent.pivotYM))).toBeLessThan(0.001);
    // Off design the wheel leans and the patch no longer rises with the centre, but it still moves square to the
    // line from the instant centre, which stays at the joint.
    const ic = pivotFrontViewCentre(spec.linkage, 0)!;
    expect([ic.y, ic.z]).toEqual([intent.pivotYM, intent.pivotZM]);
    for (const z of [-0.06, -0.03, 0.03, 0.06]) {
      const up = newCornerSample();
      const down = newCornerSample();
      const h = 1e-5;
      axle.measureAt(z + h, up);
      axle.measureAt(z - h, down);
      axle.measureAt(z, s);
      const riseZ = (up.contactZ - down.contactZ) / (2 * h);
      expect(Math.abs(riseZ - 1)).toBeGreaterThan(0.01);
      expect(Math.abs(s.tanBeta * (s.contactY - ic.y) + riseZ * (s.contactZ - ic.z))).toBeLessThan(1e-7);
    }
    // Virtual work: a side force F toward the turn centre at the outer patch pushes that wheel toward droop by F·tanβ
    // (the patch moves out in bump), lifting the body; at the inner patch it pulls the body down. With more grip on
    // the loaded outer wheel the sum lifts the body, most on the swing axle and not at all on the trailing arm.
    const lift = (a: Axle<PivotLinkage>, rollTravel: number): number => {
      const outer = newCornerSample();
      const inner = newCornerSample();
      a.sample('right', rollTravel, 0, outer);
      a.sample('left', -rollTravel, 0, inner);
      const fo = 3000;
      const fi = 2000;
      // tanβ of the right corner is mirrored in the sample; in its own side's terms it is −outer.tanBeta.
      return fo * -outer.tanBeta - fi * inner.tanBeta;
    };
    const semi = buildAxle(pivotAxle(PIVOT_TYPICAL['semi-trailing']));
    const trailing = buildAxle(pivotAxle(PIVOT_TYPICAL['trailing-arm']));
    for (const z of [0, 0.02, 0.04]) {
      expect(lift(axle, z)).toBeGreaterThan(0);
      expect(lift(axle, z)).toBeGreaterThan(lift(semi, z));
      expect(Math.abs(lift(trailing, z))).toBeLessThan(1e-9);
    }
    // At design, (F_o − F_i)·h_pivot/(y_C − y_pivot): the research's statics of a swing axle, its joint off the centre.
    expect(lift(axle, 0)).toBeCloseTo((1000 * intent.pivotZM) / (yC - intent.pivotYM), 9);
  });

  it('the roll centre rises from zero to the pivot height as the axis turns from 0° to 90°', () => {
    // A central pivot, so that at 90° the axis runs along the centre line, as on a swing axle with one joint.
    const base: PivotIntent = { ...PIVOT_TYPICAL['semi-trailing'], pivotYM: 0, driven: false };
    const s = newCornerSample();
    let last = -Infinity;
    for (let deg = 0; deg <= 90; deg++) {
      const spec = pivotAxle({ ...base, sweepDeg: deg });
      expect(spec.layout).toBe(pivotLayout(deg));
      buildAxle(spec).measureAt(0, s);
      const rc = rollCentre(s);
      expect(Math.abs(rc - rollCentreByAxis(spec.linkage, s))).toBeLessThan(0.001);
      if (deg > 0) expect(rc).toBeGreaterThan(last);
      // Smoothly: no degree of sweep moves it by more than 25 mm.
      if (deg > 1) expect(rc - last).toBeLessThan(0.025);
      last = rc;
      if (deg === 0) expect(Math.abs(rc)).toBeLessThan(0.001);
    }
    expect(Math.abs(last - base.pivotZM)).toBeLessThan(0.001);
    expect([pivotLayout(0), pivotLayout(15), pivotLayout(89.9), pivotLayout(90)]).toEqual([
      'trailing-arm',
      'semi-trailing',
      'semi-trailing',
      'swing-axle',
    ]);
  });

  it('the swing-axle half-shaft has no plunge and its wheel stays square to it; the semi-trailing one plunges', () => {
    const swing = pivotAxle(PIVOT_TYPICAL['swing-axle']);
    const shaft = swing.halfshaft!;
    expect([shaft.inner, shaft.outer]).toEqual(['cross', 'none']);
    const axle = buildAxle(swing);
    const s = newCornerSample();
    for (const z of nodes(axle)) {
      const pose = axle.measureAt(z, s);
      expect(Math.abs(s.plunge)).toBeLessThan(1e-12);
      expect(s.cvOuter).toBeLessThan(1e-6);
      // The shaft's angle at its joint is the wheel's camber.
      expect(Math.abs(s.cvInner - Math.abs(s.camber))).toBeLessThan(1e-7);
      const hub = [0, 0, 0];
      axle.knucklePoint(pose, shaft.outerJoint, hub);
      expect(Math.abs(dist(shaft.diffOutput, [hub[0], hub[1], hub[2]]) - dist(shaft.diffOutput, shaft.outerJoint))).toBeLessThan(1e-12);
    }

    const semi = pivotAxle(PIVOT_TYPICAL['semi-trailing']);
    const two = semi.halfshaft!;
    const semiAxle = buildAxle(semi);
    const len0 = dist(two.diffOutput, two.outerJoint);
    let most = 0;
    for (const z of nodes(semiAxle)) {
      const pose = semiAxle.measureAt(z, s);
      // The plunge and the joint angles are those of the two joint centres.
      const o = [0, 0, 0];
      semiAxle.knucklePoint(pose, two.outerJoint, o);
      const d: Vec3 = [o[0] - two.diffOutput[0], o[1] - two.diffOutput[1], o[2] - two.diffOutput[2]];
      const len = Math.hypot(d[0], d[1], d[2]);
      expect(s.plunge).toBeCloseTo(len0 - len, 12);
      expect(s.cvInner).toBeCloseTo(Math.acos(d[1] / len), 9);
      const spin = [0, 0, 0];
      semiAxle.solver.direction(pose, semi.spinAxis, spin);
      expect(s.cvOuter).toBeCloseTo(Math.acos((d[0] * spin[0] + d[1] * spin[1] + d[2] * spin[2]) / len), 9);
      expect(s.cvInner / DEG).toBeLessThanOrEqual(two.innerMaxDeg);
      expect(s.cvOuter / DEG).toBeLessThanOrEqual(two.outerMaxDeg);
      expect(s.plunge).toBeGreaterThanOrEqual(two.plungeM[0]);
      expect(s.plunge).toBeLessThanOrEqual(two.plungeM[1]);
      most = Math.max(most, Math.abs(s.plunge));
    }
    expect(most).toBeGreaterThan(0.005);
  });

  it('the closed form agrees with Newton on the same axis written as five distances', () => {
    const intents: PivotIntent[] = [
      PIVOT_TYPICAL['trailing-arm'],
      PIVOT_TYPICAL['semi-trailing'],
      PIVOT_TYPICAL['swing-axle'],
      { ...PIVOT_TYPICAL['semi-trailing'], sweepDeg: 22, svAngleDeg: 6, pivotZM: 0.26 },
    ];
    const far: Vec3 = [0.2, 0.5, 0.6];
    for (const intent of intents) {
      const spec = pivotAxle(intent);
      const axle = buildAxle(spec);
      const exact = axle.solver;
      const newton = new CornerSolver({ ...spec, linkage: pivotAsLinks(spec.linkage, spec.wheelCentre) });
      const pose = CornerSolver.identity();
      const dExact = new Float64Array(6);
      const dNewton = new Float64Array(6);
      for (const z of nodes(axle)) {
        expect(newton.solve(pose, z, 0, 20).ok).toBe(true);
        const table = new Float64Array(POSE_SIZE);
        const res = axle.solvePose(z, 0, null, table);
        expect(res.ok && res.iterations === 0).toBe(true);
        for (const k of [spec.wheelCentre, far]) {
          const a = [0, 0, 0];
          const b = [0, 0, 0];
          exact.point(table, k, a);
          newton.point(pose, k, b);
          expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-9);
        }
        exact.derivatives(table, z, 0, dExact, null);
        newton.derivatives(pose, z, 0, dNewton, null);
        for (let i = 0; i < 6; i++) expect(Math.abs(dExact[i] - dNewton[i])).toBeLessThan(1e-9);
      }
      // And with central differences of the closed form itself.
      const up = CornerSolver.identity();
      const down = CornerSolver.identity();
      const mid = CornerSolver.identity();
      const h = 1e-5;
      exact.solve(up, 0.03 + h, 0);
      exact.solve(down, 0.03 - h, 0);
      exact.solve(mid, 0.03, 0);
      exact.derivatives(mid, 0.03, 0, dExact, null);
      for (let k = 0; k < 3; k++) expect(Math.abs((up[k] - down[k]) / (2 * h) - dExact[k])).toBeLessThan(1e-6);
    }
  });

  it('refuses an axis swept the wrong way round or beyond the car', () => {
    // Swept back at the outer end the axis puts the roll centre below the road: the research's mistake to catch.
    expect(() => pivotAxle({ ...PIVOT_TYPICAL['semi-trailing'], sweepDeg: -15 })).toThrow();
    expect(() => pivotAxle({ ...PIVOT_TYPICAL['semi-trailing'], sweepDeg: 95 })).toThrow();
    expect(() => pivotAxle({ ...PIVOT_TYPICAL['semi-trailing'], sweepDeg: NaN })).toThrow();
    expect(() => pivotAxle({ ...PIVOT_TYPICAL['trailing-arm'], armM: 0 })).toThrow();
  });

  it('refuses an arm that cannot reach the end stops, and every arm it takes builds', () => {
    // A level trailing arm swings its wheel on a circle of radius armM: it reaches 120 mm of bump only if longer, and
    // at that length the arm would stand vertical. Shorter ones were taken and then failed inside the table.
    const bump = PIVOT_TRAVEL.bumpM;
    for (const arm of [0.05, 0.11, bump - 1e-6, bump]) {
      expect(() => pivotAxle({ ...PIVOT_TYPICAL['trailing-arm'], armM: arm })).toThrow(/too short/);
    }
    for (const arm of [bump + 0.001, 0.15, 0.4, -0.4]) {
      expect(() => buildAxle(pivotAxle({ ...PIVOT_TYPICAL['trailing-arm'], armM: arm }))).not.toThrow();
    }
    // An arm hanging steeply from a high pivot reaches bump but would pass the vertical in droop.
    expect(() => pivotAxle({ ...PIVOT_TYPICAL['trailing-arm'], armM: 0.03, pivotZM: 0.7 })).toThrow(/too short or too steep/);
  });

  it('refuses intents whose numbers are not numbers or put the joints in impossible places', () => {
    const semi = PIVOT_TYPICAL['semi-trailing'];
    const swing = PIVOT_TYPICAL['swing-axle'];
    for (const key of ['armM', 'pivotYM', 'pivotZM', 'bushSpanM', 'trackM', 'wheelCentreZM', 'diffOutputYM'] as const) {
      expect(() => pivotAxle({ ...semi, [key]: NaN })).toThrow(/not a number/);
    }
    expect(() => pivotAxle({ ...semi, bushSpanM: 0 })).toThrow(/second bush/);
    // The differential output beyond the outer joint, or across the centre line.
    expect(() => pivotAxle({ ...semi, diffOutputYM: 0.65 })).toThrow(/differential output/);
    expect(() => pivotAxle({ ...semi, diffOutputYM: -0.1 })).toThrow(/differential output/);
    // A swing axle whose joint is beyond the wheel would turn its shaft inward; one at the wheel has no arm at all.
    expect(() => pivotAxle({ ...swing, pivotYM: 1.4 })).toThrow(/not inboard/);
    expect(() => pivotAxle({ ...swing, pivotYM: 0.7 })).toThrow(/too short/);
  });

  it('keeps the swing axle’s cross joint inside its limit and touches every bump stop 80 mm into bump', () => {
    for (const layout of ['trailing-arm', 'semi-trailing', 'swing-axle'] as const) {
      const spec = pivotAxle(PIVOT_TYPICAL[layout]);
      const axle = buildAxle(spec);
      const d = spec.damper;
      if (d.wheel === 'strut') throw new Error('a pivot corner has no strut');
      const contact = dist(d.body, d.wheel) - spec.bumpStop.gapM;
      expect(axle.value('damperLen', PIVOT_BUMP_STOP_TRAVEL_M)).toBeCloseTo(contact, 9);
      const shaft = spec.halfshaft;
      if (!shaft) continue;
      const s = newCornerSample();
      for (const z of nodes(axle)) {
        axle.sample('left', z, 0, s);
        expect(s.cvInner / DEG).toBeLessThanOrEqual(shaft.innerMaxDeg);
      }
    }
  });

  it('refuses to adjust rods or a strut top that a pivot corner does not have', () => {
    const solver = buildAxle(pivotAxle(PIVOT_TYPICAL['semi-trailing'])).solver;
    expect(solver.steerRow()).toBe(-1);
    expect(() => solver.setLength(0, 0.5)).toThrow();
    expect(() => solver.setTopShift([0, 0, 0], [0, 0.01, 0])).toThrow();
  });
});

// ---- Stage P4-core: derived quantities, double wishbones, the five-link, knuckle variants, the light axle ----

const front = { dw: doubleWishbone(wishboneDefaults('front')), ml: multilink(multilinkDefaults('front')) };
const rear = { dw: doubleWishbone(wishboneDefaults('rear')), ml: multilink(multilinkDefaults('rear')) };
const sampleAt = (a: ReturnType<typeof buildAxle>, travel: number): ReturnType<typeof newCornerSample> => {
  const s = newCornerSample();
  a.measureAt(travel, s);
  return s;
};
const travelsOf = (a: ReturnType<typeof buildAxle>): number[] => Array.from({ length: a.table.n }, (_, i) => a.table.travel0 + i * a.table.step);

describe('derived quantities of the table', () => {
  it('take camber gain, bump steer and the roll centre from the Jacobian; they match differences of the curves', () => {
    for (const spec of [macphersonJtekt({ wheelCentreZM: 0.3 }), front.dw, rear.ml, macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'revoknuckle' })]) {
      const a = buildAxle(spec);
      const h = 1e-5;
      for (const z of [-0.06, 0, 0.05]) {
        const [u, d, c] = [sampleAt(a, z + h), sampleAt(a, z - h), sampleAt(a, z)];
        expect(Math.abs((u.camber - d.camber) / (2 * h) - c.camberGain)).toBeLessThan(1e-6);
        expect(Math.abs((u.toe - d.toe) / (2 * h) - c.bumpSteer)).toBeLessThan(1e-6);
        // The roll centre rests on tanβ, the contact point's sideways path; tanθ on its fore-aft path.
        expect(Math.abs((u.contactY - d.contactY) / (2 * h) - c.tanBeta)).toBeLessThan(1e-6);
        expect(Math.abs((u.contactX - d.contactX) / (2 * h) - c.tanThetaCP)).toBeLessThan(1e-6);
        expect(Math.abs((u.wheelX - d.wheelX) / (2 * h) - c.tanThetaWC)).toBeLessThan(1e-6);
        // The spring and damper motion ratios, wherever they sit (strut, lower arm, spring link).
        expect(Math.abs(-(u.springLen - d.springLen) / (2 * h) - c.mrSpring)).toBeLessThan(1e-6);
        expect(Math.abs(-(u.damperLen - d.damperLen) / (2 * h) - c.mrDamper)).toBeLessThan(1e-6);
      }
    }
  });

  it('take tanθ_KP from the knuckle’s own point at the contact patch, which turns with the knuckle', () => {
    // What outboard brakes react through. The wheel's lowest point (tanθ_CP) does not turn with the knuckle, so on a
    // semi-trailing arm, whose wheel centre swings level with the pivot, it says 0 where the knuckle's point says −0.6.
    const semi = pivotAxle(PIVOT_TYPICAL['semi-trailing']);
    const specs: AxleSpec<AnyCornerLinkage>[] = [
      macphersonJtekt({ wheelCentreZM: 0.3 }), front.dw, rear.ml, macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'revoknuckle' }), semi,
    ];
    for (const spec of specs) {
      const a = buildAxle(spec);
      const c = sampleAt(a, 0);
      const patch: Vec3 = [c.contactX, c.contactY, c.contactZ];
      const pose = new Float64Array(POSE_SIZE);
      const p = new Float64Array(3);
      const xAt = (z: number): number => {
        a.solvePose(z, 0, null, pose);
        a.solver.point(pose, patch, p);
        return p[0];
      };
      const h = 1e-5;
      expect(Math.abs((xAt(h) - xAt(-h)) / (2 * h) - c.tanThetaKP)).toBeLessThan(1e-6);
      // In the side view the point turns about the knuckle's instant centre.
      expect(c.tanThetaKP).toBeCloseTo((c.contactZ - c.icSideZ) / (c.icSideX - c.contactX), 3);
    }
    const s = sampleAt(buildAxle(semi), 0);
    expect(Math.abs(s.tanThetaCP)).toBeLessThan(1e-3);
    expect(s.tanThetaKP).toBeLessThan(-0.5);
  });

  it('JTEKT: camber gain −17.1°/m, bump steer −9.2°/m, roll centre 126 mm, kingpin offset 68.6 mm at design', () => {
    const s = sampleAt(axle, 0);
    expect(s.camberGain / DEG).toBeCloseTo(-17.14, 1);
    expect(s.bumpSteer / DEG).toBeCloseTo(-9.25, 1);
    expect(s.rcHeight * 1000).toBeCloseTo(126.1, 0);
    // Ford's RevoKnuckle slides put a plain Focus or Mondeo knuckle at 50–75 mm.
    expect(s.kingpinOffset * 1000).toBeCloseTo(68.6, 1);
    expect(s.kingpinOffset).toBeCloseTo(jtektKingpinOffsetM(), 12);
    // The front-view instant centre lies on the line from the contact patch through the roll centre.
    const slope = (s.icFrontZ - s.contactZ) / (s.contactY - s.icFrontY);
    expect(s.contactY * slope).toBeCloseTo(s.rcHeight, 9);
  });

  it('reverses the JTEKT camber gain within the travel, between +40 and +80 mm (acceptance)', () => {
    const gain = (z: number): number => axle.value('camberGain', z);
    expect(gain(0)).toBeLessThan(0);
    expect(gain(0.04)).toBeLessThan(0);
    expect(gain(0.08)).toBeGreaterThan(0);
    expect(0.08).toBeLessThan(spec.travel.bumpM);
    // On the way the front-view instant centre swings from inboard to outboard through infinity (NaN beyond a
    // kilometre). Its pole is not exactly where the camber gain is zero: the wheel is toed out there, so part of the
    // side-view turn shows as camber.
    const side = (z: number): number => {
      const c = sampleAt(axle, z);
      return Number.isNaN(c.icFrontY) ? 0 : Math.sign(c.icFrontY - c.wheelY);
    };
    expect(side(0.04)).toBe(-1);
    expect(side(0.08)).toBe(1);
    let lo = 0.04;
    let hi = 0.08;
    for (let i = 0; i < 60 && side((lo + hi) / 2) !== 0; i++) {
      if (side((lo + hi) / 2) < 0) lo = (lo + hi) / 2;
      else hi = (lo + hi) / 2;
    }
    const pole = sampleAt(axle, (lo + hi) / 2);
    expect(pole.icFrontY).toBeNaN();
    expect(pole.icFrontZ).toBeNaN();
    expect(pole.travel).toBeGreaterThan(0.05);
    expect(pole.travel).toBeLessThan(0.07);
    expect(Number.isFinite(sampleAt(axle, 0.04).icFrontY)).toBe(true);
  });
});

describe('double wishbone', () => {
  it('with equal and parallel arms keeps the camber within ±0.001° over ±80 mm', () => {
    const base = wishboneDefaults('front');
    const a = buildAxle(doubleWishbone({ ...base, lowerPivotZM: base.lowerBallZM, upperAngleDeg: 0, upperArmM: base.lowerArmM }));
    for (let z = -0.08; z <= 0.08 + 1e-9; z += 0.004) expect(Math.abs(sampleAt(a, z).camber / DEG)).toBeLessThan(0.001);
  });

  it('gains camber as 1/FVSA (0.1 %) and has its roll centre where the instant-centre drawing puts it (0.5 mm)', () => {
    // Arm axes level in the side view: the arms' planes meet in a line along x, so the knuckle turns about it alone.
    for (const which of ['front', 'rear'] as const) {
      const it0 = { ...wishboneDefaults(which), svAngleDeg: 0 };
      const s = doubleWishbone(it0);
      const c = sampleAt(buildAxle(s), 0);
      const [lo, up] = s.linkage.wishbones;
      const plane = (w: (typeof lo)): [Vec3, number] => {
        const n = cross(sub(w.rear, w.front), sub(w.ball, w.front));
        return [n, dot(n, w.front)];
      };
      // Line of the two arm planes cut by the plane x = W_x.
      const [nL, dL] = plane(lo);
      const [nU, dU] = plane(up);
      const x = s.wheelCentre[0];
      const r1 = dL - nL[0] * x;
      const r2 = dU - nU[0] * x;
      const det = nL[1] * nU[2] - nL[2] * nU[1];
      const icY = (r1 * nU[2] - r2 * nL[2]) / det;
      const icZ = (nL[1] * r2 - nU[1] * r1) / det;
      const fvsa = c.wheelY - icY;
      expect(Math.abs(Math.abs(c.camberGain) * fvsa - 1)).toBeLessThan(0.001);
      const rc = (c.contactY * (icZ - c.contactZ)) / (c.contactY - icY);
      expect(Math.abs(rc - c.rcHeight)).toBeLessThan(0.0005);
      expect(Math.abs(c.icFrontY - icY)).toBeLessThan(1e-6);
      expect(Math.abs(c.icFrontZ - icZ)).toBeLessThan(1e-6);
    }
  });

  it('gains negative camber over the whole bump travel, while the JTEKT strut turns it back within the travel', () => {
    for (const s of [front.dw, rear.dw]) {
      const a = buildAxle(s);
      for (const z of travelsOf(a).filter((t) => t >= 0)) expect(a.value('camberGain', z), `${z}`).toBeLessThan(0);
    }
    const gains = travelsOf(axle).filter((t) => t >= 0).map((z) => axle.value('camberGain', z));
    expect(Math.min(...gains)).toBeLessThan(0);
    expect(Math.max(...gains)).toBeGreaterThan(0);
  });

  it('lowered 40 mm: the strut loses more of its roll camber at 0.8 g than the double wishbone, by over 0.1', () => {
    // Body roll at 0.8 g with a sports car's roll gradient of 3°/g (a weak secondary figure,
    // docs/suspension-research/metrics_scenarios.md); the inequality holds from 2 to 6°/g.
    for (const gradient of [2, 3, 6]) {
      const phi = gradient * 0.8 * DEG;
      // Share of the body roll the outer wheel shows as camber to the road, with its static point at q0.
      const rcf = (a: ReturnType<typeof buildAxle>, half: number, q0: number): number => {
        const dz = half * Math.sin(phi);
        return 1 + (a.value('camber', q0 + dz) - a.value('camber', q0)) / phi;
      };
      const dw = buildAxle(front.dw);
      const strut = rcf(axle, spec.track / 2, 0.04) - rcf(axle, spec.track / 2, 0);
      const wish = rcf(dw, front.dw.track / 2, 0.04) - rcf(dw, front.dw.track / 2, 0);
      expect(strut, `${gradient}°/g`).toBeGreaterThan(0.1);
      expect(strut).toBeGreaterThan(wish);
    }
  });

  it('shifting the inner tie-rod joint by 10 mm tilts the toe curve visibly', () => {
    const base = wishboneDefaults('front');
    const flat = buildAxle(doubleWishbone(base));
    const raised = buildAxle(doubleWishbone({ ...base, tieRodDzM: 0.01 }));
    expect(Math.abs(flat.value('bumpSteer', 0))).toBeLessThan(1e-9);
    // Several degrees per metre: RACE Software saw 11.1°/m for 10 mm at the outer joint of a strut.
    expect(Math.abs(raised.value('bumpSteer', 0) / DEG)).toBeGreaterThan(3);
    expect(Math.abs(raised.value('toe', 0.08) - raised.value('toe', -0.08)) / DEG).toBeGreaterThan(0.3);
  });
});

describe('default templates land in the research ranges', () => {
  const ranges = (s: AxleSpec): { a: ReturnType<typeof buildAxle>; c: ReturnType<typeof newCornerSample>; rcf: number } => {
    const a = buildAxle(s);
    const c = sampleAt(a, 0);
    return { a, c, rcf: 1 - (s.track / 2) * Math.abs(c.camberGain) };
  };

  it('roll centre 30–90 mm in front and 90–120 mm at the rear; side-view slope 0.05–0.15 toward the anti effect', () => {
    for (const s of [front.dw, front.ml]) {
      const { c } = ranges(s);
      expect(c.rcHeight).toBeGreaterThanOrEqual(0.03);
      expect(c.rcHeight).toBeLessThanOrEqual(0.09);
      // Anti-dive with outboard brakes: the contact patch moves forward in bump.
      expect(c.tanThetaCP).toBeGreaterThanOrEqual(0.05);
      expect(c.tanThetaCP).toBeLessThanOrEqual(0.15);
    }
    for (const s of [rear.dw, rear.ml]) {
      const { c } = ranges(s);
      expect(c.rcHeight).toBeGreaterThanOrEqual(0.09);
      expect(c.rcHeight).toBeLessThanOrEqual(0.12);
      // Anti-squat with the differential on the body: the wheel centre moves back in bump.
      expect(-c.tanThetaWC).toBeGreaterThanOrEqual(0.05);
      expect(-c.tanThetaWC).toBeLessThanOrEqual(0.15);
    }
  });

  it('steering axis: KPI 8–11° and kingpin offset 45–60 mm on arms; 10–15° and 60–80 mm on the JTEKT strut', () => {
    for (const s of [front.dw, front.ml]) {
      const { c } = ranges(s);
      expect(c.kpi / DEG).toBeGreaterThanOrEqual(8);
      expect(c.kpi / DEG).toBeLessThanOrEqual(11);
      expect(c.kingpinOffset).toBeGreaterThanOrEqual(0.045);
      expect(c.kingpinOffset).toBeLessThanOrEqual(0.06);
    }
    const c = sampleAt(axle, 0);
    expect(c.kpi / DEG).toBeGreaterThanOrEqual(10);
    expect(c.kpi / DEG).toBeLessThanOrEqual(15);
    expect(c.kingpinOffset).toBeGreaterThanOrEqual(0.06);
    expect(c.kingpinOffset).toBeLessThanOrEqual(0.08);
  });

  it('camber gain and RCF: double wishbone 15–25°/m and 0.67–0.80, five-link 15–20°/m and 0.70–0.85', () => {
    for (const s of [front.dw, rear.dw]) {
      const { c, rcf } = ranges(s);
      expect(-c.camberGain / DEG).toBeGreaterThanOrEqual(15);
      expect(-c.camberGain / DEG).toBeLessThanOrEqual(25);
      expect(rcf).toBeGreaterThanOrEqual(0.67);
      expect(rcf).toBeLessThanOrEqual(0.8);
    }
    for (const s of [front.ml, rear.ml]) {
      const { c, rcf } = ranges(s);
      expect(-c.camberGain / DEG).toBeGreaterThanOrEqual(15);
      expect(-c.camberGain / DEG).toBeLessThanOrEqual(20);
      expect(rcf).toBeGreaterThanOrEqual(0.7);
      expect(rcf).toBeLessThanOrEqual(0.85);
    }
  });
});

describe('five-link', () => {
  it('passes its whole travel on one branch, far from a singular pose, with smooth curves (acceptance)', () => {
    for (const s of [front.ml, rear.ml]) {
      const a = buildAxle(s);
      expect(Math.max(...a.table.iterations)).toBeLessThanOrEqual(8);
      // The constraint Jacobian keeps its smallest singular value well clear of zero over the whole travel.
      for (let i = 0; i < a.table.n; i++) {
        const J = a.solver.constraintJacobian(a.table.pose.subarray(POSE_SIZE * i, POSE_SIZE * (i + 1)), 0);
        const { s: sv } = svd(J, 5, 6);
        expect(sv[4] / sv[0]).toBeGreaterThan(0.02);
      }
      // No jumps: camber and toe change smoothly from node to node.
      for (const f of ['camber', 'toe', 'camberGain'] as const) {
        const v = a.table.fields[f];
        for (let i = 1; i < a.table.n - 1; i++) expect(Math.abs(v[i + 1] - 2 * v[i] + v[i - 1]), `${f} at ${i}`).toBeLessThan(f === 'camberGain' ? 0.02 : 1e-4);
      }
      // The toe link set for a flat toe curve keeps the toe within ±0.1° over the travel.
      for (let i = 0; i < a.table.n; i++) expect(Math.abs(a.table.fields.toe[i] / DEG)).toBeLessThan(0.1);
    }
  });

  it('carries its steering axis on virtual pivots: at design those are its parent wishbone ball joints', () => {
    const intent = multilinkDefaults('front');
    const c = sampleAt(buildAxle(front.ml), 0);
    expect(c.kpi / DEG).toBeCloseTo(intent.kpiDeg, 9);
    expect(c.caster / DEG).toBeCloseTo(intent.casterDeg, 9);
    expect(c.scrub).toBeCloseTo(intent.scrubM, 9);
    // The pivots move with the links: in bump the axis is no longer the parent's.
    const parent = buildAxle(front.dw);
    expect(Math.abs(sampleAt(buildAxle(front.ml), 0.08).caster - sampleAt(parent, 0.08).caster)).toBeGreaterThan(0.001);
  });
});

describe('MacPherson knuckle variants', () => {
  const variants = (['plain', 'dual-axis', 'revoknuckle'] as const).map((knuckle) => {
    const s = macphersonJtekt({ wheelCentreZM: 0.3, knuckle });
    return { knuckle, s, a: buildAxle(s) };
  });

  it('bring the steering axis toward the wheel: RevoKnuckle 20–30 mm (Ford), dual-axis about half the plain strut', () => {
    const offset = Object.fromEntries(variants.map((v) => [v.knuckle, v.a.value('kingpinOffset', 0)]));
    expect(offset.plain).toBeGreaterThanOrEqual(0.05);
    expect(offset.plain).toBeLessThanOrEqual(0.075);
    expect(offset.revoknuckle).toBeGreaterThanOrEqual(0.02);
    expect(offset.revoknuckle).toBeLessThanOrEqual(0.03);
    expect(offset['dual-axis']).toBeCloseTo(offset.plain / 2, 9);
    for (const v of variants.slice(1)) {
      const c = sampleAt(v.a, 0);
      expect(c.kpi / DEG).toBeCloseTo(SPLIT_KNUCKLE_DEFAULTS[v.knuckle as 'revoknuckle'].kpiDeg, 9);
      // Scrub follows from offset and KPI: at the road the axis is r·tan(KPI) further out than at the hub.
      expect(c.scrub).toBeCloseTo(c.kingpinOffset - (c.wheelZ - c.contactZ) * Math.tan(c.kpi), 3);
      // The axis lives in the carrier with the wheel: its offset hardly moves over the travel (the plain one does).
      const range = (a: ReturnType<typeof buildAxle>): number => {
        const o = travelsOf(a).map((z) => a.value('kingpinOffset', z));
        return Math.max(...o) - Math.min(...o);
      };
      expect(range(v.a)).toBeLessThan(0.001);
      expect(range(variants[0].a)).toBeGreaterThan(0.004);
    }
  });

  it('keep the strut, so the camber curve (and its reversal) is the plain strut’s', () => {
    for (const v of variants.slice(1)) {
      for (const z of travelsOf(v.a)) expect(Math.abs(v.a.value('camber', z) - variants[0].a.value('camber', z)) / DEG).toBeLessThan(0.05);
      expect(v.a.value('camberGain', 0.08)).toBeGreaterThan(0);
      expect(v.a.value('mrDamper', 0)).toBeCloseTo(variants[0].a.value('mrDamper', 0), 2);
    }
  });

  it('turn the wheel knuckle in the carrier as the tie rod steers it in bump', () => {
    for (const v of variants.slice(1)) {
      const turn = (z: number): number => v.a.table.pose[POSE_SIZE * Math.round((z - v.a.table.travel0) / v.a.table.step) + 7];
      expect(turn(0)).toBeCloseTo(0, 12);
      expect(Math.abs(turn(0.08))).toBeGreaterThan(0.002);
    }
  });
});

describe('CV joints of the driven templates', () => {
  it('stay inside the joint limits over the whole travel, and over the steering of the driven fronts', () => {
    const driven = [
      rear.dw,
      rear.ml,
      doubleWishbone({ ...wishboneDefaults('front'), driven: true }),
      multilink({ ...multilinkDefaults('front'), driven: true }),
      macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'dual-axis' }),
      macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'revoknuckle' }),
    ];
    const s = newCornerSample();
    const pose = new Float64Array(POSE_SIZE);
    for (const spec of driven) {
      const a = buildAxle(spec);
      const shaft = spec.halfshaft!;
      const steered = spec.linkage.rods.some((r) => r.steer);
      for (const z of travelsOf(a).filter((_, i) => i % 5 === 0)) {
        // Up to 25° of road-wheel steer either way (rack found from the steer rate at design).
        const perRack = Math.abs(buildAxleLite(spec).steerPerRack);
        const racks = steered ? [-1, -0.5, 0, 0.5, 1].map((k) => (k * 25 * DEG) / perRack) : [0];
        for (const rack of racks) {
          a.solvePose(z, 0, null, pose);
          expect(a.solver.solve(pose, z, rack, 40).ok).toBe(true);
          a.measure(pose, z, rack, s);
          expect(s.cvInner / DEG, `${spec.layout} inner at ${z}, rack ${rack}`).toBeLessThanOrEqual(shaft.innerMaxDeg);
          expect(s.cvOuter / DEG, `${spec.layout} outer at ${z}, rack ${rack}`).toBeLessThanOrEqual(shaft.outerMaxDeg);
          expect(s.plunge).toBeGreaterThanOrEqual(shaft.plungeM[0]);
          expect(s.plunge).toBeLessThanOrEqual(shaft.plungeM[1]);
        }
      }
    }
  });
});

describe('buildAxleLite', () => {
  const all = [spec, front.dw, front.ml, rear.dw, rear.ml, macphersonJtekt({ wheelCentreZM: 0.3, knuckle: 'revoknuckle' })];

  it('gives the table’s numbers at design exactly, from about ten solves and no grid', () => {
    for (const s of all) {
      const lite = buildAxleLite(s);
      const full = sampleAt(buildAxle(s), 0);
      expect(lite.solves).toBeLessThanOrEqual(10);
      for (const [k, v] of Object.entries(full)) {
        const l = lite.design[k as keyof typeof full];
        if (Number.isNaN(v)) expect(l).toBeNaN();
        else expect(Math.abs(l - v), k).toBeLessThan(1e-9);
      }
      expect(lite.rcf).toBeCloseTo(1 - (s.track / 2) * Math.abs(full.camberGain), 12);
    }
  });

  it('measures the rising rate of the motion ratio', () => {
    for (const s of all) {
      const a = buildAxle(s);
      const h = 0.002;
      expect(buildAxleLite(s).mrSpringSlope).toBeCloseTo((sampleAt(a, h).mrSpring - sampleAt(a, -h).mrSpring) / (2 * h), 9);
    }
    // The strut's rising rate: its mr grows in bump.
    expect(buildAxleLite(spec).mrSpringSlope).toBeGreaterThan(0);
  });

  // The force line of a left corner at travel q, drawn without the solver's derivatives: through the contact point,
  // square to the velocity (central difference of exact solves) of the knuckle point that sits under the contact patch.
  const forceLine = (a: ReturnType<typeof buildAxle>, q: number): { y: number; z: number; slope: number } => {
    const pose = new Float64Array(POSE_SIZE);
    a.solvePose(q, 0, null, pose);
    const c = newCornerSample();
    a.measure(pose, q, 0, c);
    // The knuckle point at design that the pose carries to the contact point: c0 + R⁻¹·(C − c0 − t).
    const c0 = a.solver.c0;
    const back = [0, 0, 0];
    rotateInto([-pose[3], -pose[4], -pose[5], pose[6]], 0, c.contactX - c0[0] - pose[0], c.contactY - c0[1] - pose[1], c.contactZ - c0[2] - pose[2], back, 0);
    const k: Vec3 = [c0[0] + back[0], c0[1] + back[1], c0[2] + back[2]];
    const h = 1e-5;
    const [up, down] = [new Float64Array(POSE_SIZE), new Float64Array(POSE_SIZE)];
    const [pu, pd] = [[0, 0, 0], [0, 0, 0]];
    up.set(pose);
    down.set(pose);
    a.solver.solve(up, q + h, 0, 30);
    a.solver.solve(down, q - h, 0, 30);
    a.solver.point(up, k, pu);
    a.solver.point(down, k, pd);
    return { y: c.contactY, z: c.contactZ, slope: (pu[1] - pd[1]) / (pu[2] - pd[2]) };
  };

  it('finds the roll centre of a 3° roll where the force lines cross, measured from the rolled road', () => {
    // A swing axle built from two wishbones whose pivot axes share one line along x, 250 mm up on the centre line, and
    // a toe link from that line: the knuckle can only turn about it, so both force lines pass through the pivot at any
    // roll, and the roll centre is the pivot seen from the road through the two contact points.
    const pivotZ = 0.25;
    const arm = (id: string, ball: Vec3, spread: number) => ({ id, front: [spread, 0, pivotZ] as Vec3, rear: [-spread, 0, pivotZ] as Vec3, ball, part: 'susp.lower-arm' });
    const swing: AxleSpec = {
      ...front.dw,
      track: 1.5,
      wheelCentre: [0, 0.75, 0.3],
      linkage: {
        kind: 'links',
        wishbones: [arm('lower-arm', [0, 0.7, 0.12], 0.2), arm('upper-arm', [0, 0.68, 0.48], 0.15)],
        rods: [{ id: 'toe-link', body: [-0.15, 0, pivotZ], knuckle: [-0.15, 0.68, 0.3], part: 'susp.toe-link' }],
      },
    };
    const lite = buildAxleLite(swing);
    expect(lite.design.rcHeight).toBeCloseTo(pivotZ, 12);
    const a = buildAxle(swing);
    const dz = 0.75 * Math.sin(3 * DEG);
    const [o, i] = [sampleAt(a, dz), sampleAt(a, -dz)];
    const road = [o.contactY + i.contactY, o.contactZ - i.contactZ];
    const len = Math.hypot(road[0], road[1]);
    const my = 0 - (o.contactY - i.contactY) / 2;
    const mz = pivotZ - (o.contactZ + i.contactZ) / 2;
    expect(lite.rolled.heightM).toBeCloseTo((road[0] * mz - road[1] * my) / len, 9);
    expect(lite.rolled.lateralM).toBeCloseTo((road[0] * my + road[1] * mz) / len, 9);

    for (const s of all) {
      const a = buildAxle(s);
      const lite = buildAxleLite(s);
      const dz = (s.track / 2) * Math.sin(3 * DEG);
      // The same crossing from force lines drawn by finite differences, in the body frame, where the outer contact
      // point sits about dz higher and the inner one (the mirrored right corner) as much lower.
      const out = forceLine(a, dz);
      const inn = forceLine(a, -dz);
      const [yo, zo, bo] = [out.y, out.z, out.slope];
      const [yi, zi, bi] = [-inn.y, inn.z, inn.slope];
      const y = (zo - zi + bo * yo + bi * yi) / (bo + bi);
      const z = zo + bo * (yo - y);
      const [ry, rz] = [yo - yi, zo - zi];
      const len = Math.hypot(ry, rz);
      const [dy, dzz] = [y - (yo + yi) / 2, z - (zo + zi) / 2];
      expect(Math.abs(lite.rolled.heightM - (ry * dzz - rz * dy) / len), s.layout).toBeLessThan(2e-5);
      expect(Math.abs(lite.rolled.lateralM - (ry * dy + rz * dzz) / len), s.layout).toBeLessThan(2e-5);
      // With no roll the two lines meet on the centre line at y_C·tanβ.
      const still = rolledRollCentre(sampleAt(a, 1e-7), sampleAt(a, -1e-7));
      expect(Math.abs(still.heightM - lite.design.rcHeight)).toBeLessThan(1e-6);
      expect(Math.abs(still.lateralM)).toBeLessThan(1e-4);
      // On all these templates the centre drops in roll and runs off toward the inner wheel (typical geometry, not a
      // law: the swing axle above keeps it at its pivot).
      expect(lite.rolled.heightM).toBeLessThan(lite.design.rcHeight);
      expect(lite.rolled.lateralM).toBeLessThan(-0.15);
    }
  });

  it('is cheaper than the grid', () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) buildAxleLite(front.ml);
    const lite = (performance.now() - t0) / 20;
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) buildAxle(front.ml);
    const full = (performance.now() - t1) / 20;
    expect(lite).toBeLessThan(full / 3);
  });
});

// Twist beam (templates/twist-beam.ts, solve-twist-beam.ts, beam-kinematics.ts). Expected values come from the
// research's kinematic analogy (docs/suspension-research/kinematics_geometry.md §2): in heave both arms swing about the
// bushes' line, in roll each turns about the line from its bush to the shear centre, so the roll centre follows from
// where that line pierces the wheel's transverse plane, and the analogy's table of roll centre against beam position is
// the oracle. The limits are the layouts on either side: trailing arms with the beam at the bushes, a solid axle
// rolling about the beam with it at the wheels.
describe('twist beam: heave about the bushes, roll about the shear centre', () => {
  const beam = (intent: Partial<TwistBeamIntent> = {}): TwistBeamAxle =>
    buildTwistBeam(twistBeamAxle({ ...TWIST_BEAM_TYPICAL, ...intent }));
  const at = (a: TwistBeamAxle, zL: number, zR: number, side: 'left' | 'right' = 'left'): BeamSample => {
    const s = newBeamSample();
    a.measureAt(zL, zR, side, s);
    return s;
  };
  /** Road-relative roll camber factor at design: 1 − (t/2)·|dγ/dq| in roll (this wheel up, the other down). */
  const rcf = (a: TwistBeamAxle): number => {
    const s = at(a, 0, 0);
    return 1 - (a.spec.track / 2) * Math.abs(s.camberGain - s.camberGainCross);
  };
  /** Roll centre by the instant centre: where the line from the bush to the shear centre meets the patch's plane. */
  const rollCentreByAxis = (a: TwistBeamAxle): number => {
    const link = a.spec.linkage;
    const ic = pivotFrontViewCentre({ kind: 'pivot', axisA: link.bush, axisB: link.shearCentre, armPart: '' }, 0);
    if (!ic) return 0;
    const yC = a.spec.track / 2;
    return (ic.z * yC) / (yC - ic.y);
  };

  it('reproduces the research analogy: roll centre 34, 130, 219, 274 and 300 mm as the beam moves to the wheels', () => {
    // The analogy's layout: bushes 0.5 m ahead of the wheels, half track 0.75 m, everything 0.3 m high. The research
    // does not give the bushes' spacing; 0.1 m inboard of the wheels reproduces every row of its table.
    const research: Partial<TwistBeamIntent> = { armM: 0.5, pivotYM: 0.65, trackM: 1.5, pivotZM: 0.3, wheelCentreZM: 0.3 };
    const table: Array<[number, number]> = [
      [0.1, 0.034],
      [0.4, 0.13],
      [0.7, 0.219],
      [0.9, 0.274],
      [1, 0.3],
    ];
    for (const [beamPos, rc] of table) {
      const a = beam({ ...research, beamPos });
      const s = at(a, 0, 0);
      expect(Math.abs(s.rcHeight - rc)).toBeLessThan(0.0007);
      expect(Math.abs(s.rcHeight - rollCentreByAxis(a))).toBeLessThan(1e-9);
    }
  });

  it('the roll centre rises from the trailing arm’s zero to the shear centre’s height as beamPos goes from 0 to 1', () => {
    let last = -Infinity;
    let lastRcf = Infinity;
    for (let i = 0; i <= 50; i++) {
      const beamPos = i / 50;
      const a = beam({ beamPos });
      const rc = at(a, 0, 0).rcHeight;
      if (i > 0) expect(rc).toBeGreaterThan(last);
      // Smoothly: no step of 0.02 moves it more than 25 mm.
      if (i > 1) expect(rc - last).toBeLessThan(0.025);
      expect(Math.abs(rc - rollCentreByAxis(a))).toBeLessThan(1e-9);
      // The camber kept against the road falls as the roll centre rises: RCF = 1 − h_RC/z_IC, z_IC at wheel height.
      const f = rcf(a);
      expect(f).toBeLessThan(lastRcf + 1e-12);
      expect(Math.abs(f - (1 - rc / TWIST_BEAM_TYPICAL.wheelCentreZM))).toBeLessThan(1e-9);
      last = rc;
      lastRcf = f;
    }
    const ends = [beam({ beamPos: 0 }), beam({ beamPos: 1 })];
    expect(Math.abs(at(ends[0], 0, 0).rcHeight)).toBeLessThan(1e-12);
    expect(Math.abs(rcf(ends[0]) - 1)).toBeLessThan(1e-12);
    // At the wheels the beam rolls like a solid axle: about the shear centre, keeping its wheels' camber to the road.
    expect(Math.abs(last - TWIST_BEAM_TYPICAL.wheelCentreZM)).toBeLessThan(1e-9);
    expect(Math.abs(rcf(ends[1]))).toBeLessThan(1e-9);
    const raised = beam({ beamPos: 1, shearCentreDzM: 0.05 });
    expect(Math.abs(at(raised, 0, 0).rcHeight - raised.spec.linkage.shearCentre[2])).toBeLessThan(1e-9);
    expect(raised.spec.linkage.shearCentre[2]).toBeCloseTo(0.35, 12);
    // At the bushes an offset shear centre no longer gives the trailing arm's zero: the line from B to S then lies in
    // the bushes' transverse plane, never meets the wheel's, and its front-view slope dz/pivotYM sets the roll centre.
    for (const dz of [-0.03, 0.03]) {
      const offset = beam({ beamPos: 0, shearCentreDzM: dz });
      const rc = (TWIST_BEAM_TYPICAL.trackM / 2) * (dz / TWIST_BEAM_TYPICAL.pivotYM);
      expect(Math.abs(at(offset, 0, 0).rcHeight - rc)).toBeLessThan(1e-9);
    }
  });

  it('with the beam at the bushes each arm is a trailing arm: the other wheel changes nothing', () => {
    const a = beam({ beamPos: 0 });
    const { armM, pivotYM, pivotZM, trackM, wheelCentreZM } = TWIST_BEAM_TYPICAL;
    const trailing = buildAxle(
      pivotAxle({ ...PIVOT_TYPICAL['trailing-arm'], armM, pivotYM, pivotZM, trackM, wheelCentreZM }),
    );
    const c = newCornerSample();
    for (const zL of [-0.1, -0.04, 0, 0.05, 0.12]) {
      trailing.measureAt(zL, c);
      for (const zR of [-0.1, 0, 0.08, 0.12]) {
        const s = at(a, zL, zR);
        expect(Math.abs(s.wheelX - c.wheelX) + Math.abs(s.wheelY - c.wheelY) + Math.abs(s.wheelZ - c.wheelZ)).toBeLessThan(1e-12);
        expect(Math.abs(s.camber) + Math.abs(s.toe)).toBeLessThan(1e-12);
        expect(Math.abs(s.tanBeta - c.tanBeta)).toBeLessThan(1e-12);
        for (const k of ['tanBetaCross', 'tanThetaCPCross', 'tanThetaWCCross', 'camberGainCross', 'bumpSteerCross', 'mrSpringCross'] as const) {
          expect(Math.abs(s[k])).toBeLessThan(1e-12);
        }
      }
    }
  });

  it('heave turns both arms about the bushes: no camber, toe, patch drift or twist; a static alignment only turns with them', () => {
    const a = beam();
    // The typical arm is level at design, so heave h lifts the wheel by armM·sin h.
    expect(TWIST_BEAM_TYPICAL.pivotZM).toBe(TWIST_BEAM_TYPICAL.wheelCentreZM);
    for (let z = -0.1; z <= 0.12 + 1e-9; z += 0.01) {
      const state = TwistBeamSolver.rest();
      a.solve(state, z, z);
      expect(Math.abs(state[0] - Math.asin(z / TWIST_BEAM_TYPICAL.armM))).toBeLessThan(1e-12);
      expect(Math.abs(state[1])).toBeLessThan(1e-12);
      const s = newBeamSample();
      a.measure(state, 'left', s);
      expect(Math.abs(s.camber) + Math.abs(s.toe) + Math.abs(s.beamTwist)).toBeLessThan(1e-12);
      // The patch moves square to the road in heave: the two slopes cancel.
      expect(Math.abs(s.tanBeta + s.tanBetaCross)).toBeLessThan(1e-12);
      // The arms' own point at the patch turns about the bushes with them: the line outboard brakes react through.
      const bush = a.spec.linkage.bush;
      expect(Math.abs(s.tanThetaKP + s.tanThetaKPCross - (s.contactZ - bush[2]) / (bush[0] - s.wheelX))).toBeLessThan(1e-9);
    }
    // Golf Mk3's torsion-beam alignment (−1°30′ camber, +10′ toe per wheel; real_car_data.md, recheck pending): the stub
    // is fixed to the arm, so in heave the spin axis turns about y by exactly the arm's angle. That is the only change.
    const golf = beam({ camberDeg: -1.5, toeDeg: 10 / 60 });
    const s0 = golf.spec.spinAxis;
    for (const z of [-0.1, -0.03, 0, 0.06, 0.12]) {
      const state = TwistBeamSolver.rest();
      golf.solve(state, z, z);
      const h = Math.asin(z / TWIST_BEAM_TYPICAL.armM);
      const sx = s0[0] * Math.cos(h) + s0[2] * Math.sin(h);
      const sz = -s0[0] * Math.sin(h) + s0[2] * Math.cos(h);
      const s = newBeamSample();
      golf.measure(state, 'left', s);
      expect(Math.abs(s.camber + Math.atan2(sz, Math.hypot(sx, s0[1])))).toBeLessThan(1e-12);
      expect(Math.abs(s.toe - Math.atan2(sx, s0[1]))).toBeLessThan(1e-12);
    }
  });

  it('one wheel over a bump twists the beam and leans both wheels, more the closer the beam sits to the wheels', () => {
    // «The closer the cross beam to the axle stubs, the more the camber and toe change under deflection» (Wikipedia,
    // Twist-beam rear suspension; suspension_types.md).
    let lastCamber = -1;
    let lastToe = -1;
    for (const beamPos of [0, 0.2, 0.35, 0.6, 0.8, 1]) {
      const a = beam({ beamPos });
      const state = TwistBeamSolver.rest();
      a.solve(state, 0.04, 0);
      const left = newBeamSample();
      const right = newBeamSample();
      a.measure(state, 'left', left);
      a.measure(state, 'right', right);
      expect(Math.abs(right.travel)).toBeLessThan(1e-12);
      expect(left.otherTravel).toBeCloseTo(0, 12);
      expect(right.otherTravel).toBeCloseTo(0.04, 12);
      // The left arm turned up relative to the right one: at the bushes by exactly its own angle, as a lone trailing
      // arm; nearer the wheels part of the turn is about the arms' roll axis instead, and the beam twists less.
      expect(left.beamTwist).toBe(right.beamTwist);
      const armAngle = Math.asin(0.04 / TWIST_BEAM_TYPICAL.armM);
      if (beamPos === 0) expect(Math.abs(left.beamTwist - armAngle)).toBeLessThan(1e-12);
      expect(left.beamTwist).toBeLessThanOrEqual(armAngle + 1e-12);
      expect(left.beamTwist).toBeGreaterThan(0.8 * armAngle);
      if (beamPos === 0) {
        expect(Math.abs(left.camber) + Math.abs(right.camber)).toBeLessThan(1e-12);
      } else {
        // The bumped wheel leans its top in, the held one out, as a rolled axle would tilt them.
        expect(left.camber).toBeLessThan(0);
        expect(right.camber).toBeGreaterThan(0);
      }
      expect(Math.abs(left.camber)).toBeGreaterThan(lastCamber);
      expect(Math.abs(left.toe)).toBeGreaterThan(lastToe - 1e-15);
      lastCamber = Math.abs(left.camber);
      lastToe = Math.abs(left.toe);
    }
    expect(lastToe).toBeGreaterThan(0);
  });

  it('raising the shear centre turns the roll steer toward understeer; on a level arm there is none', () => {
    // Patent application US 2010/0301579: the shear centre's height drives the roll steer of a twist beam, and raising it
    // moves the axle toward roll understeer: here the rear wheel going up in roll (the outer one) toes in.
    const rollSteer = (shearCentreDzM: number): number => {
      const s = at(beam({ shearCentreDzM }), 0, 0);
      return s.bumpSteer - s.bumpSteerCross;
    };
    expect(Math.abs(rollSteer(0))).toBeLessThan(1e-12);
    let last = -Infinity;
    for (const dz of [-0.06, -0.03, -0.01, 0, 0.01, 0.03, 0.06]) {
      const steer = rollSteer(dz);
      expect(steer).toBeGreaterThan(last);
      if (dz !== 0) expect(Math.sign(steer)).toBe(Math.sign(dz));
      last = steer;
    }
  });

  it('keeps the arms rigid and joined at the shear centre, mirrors left and right, and its slopes match differences', () => {
    const a = beam({ shearCentreDzM: 0.02, camberDeg: -1, toeDeg: 0.2 });
    const solver = a.solver;
    const link = a.spec.linkage;
    const states: Array<[number, number]> = [
      [0.03, -0.02],
      [0.1, 0.05],
      [-0.08, 0.11],
      [0.12, -0.1],
    ];
    const pose = CornerSolver.identity();
    const p = [0, 0, 0];
    const q = [0, 0, 0];
    for (const [zL, zR] of states) {
      const state = TwistBeamSolver.rest();
      a.solve(state, zL, zR);
      // Each arm turns about its bush: distances from the bush stay; the arms' copies of the shear centre coincide.
      solver.pose(state, 'left', pose);
      for (const k of [a.spec.wheelCentre, a.spec.spring.wheel as Vec3, link.shearCentre]) {
        solver.point(pose, k, p);
        expect(Math.abs(dist(link.bush, [p[0], p[1], p[2]]) - dist(link.bush, k))).toBeLessThan(1e-12);
      }
      solver.point(pose, link.shearCentre, p);
      // The right arm, as the left corner sees it, mirrored back.
      solver.pose(state, 'right', pose);
      solver.point(pose, mirrorY(link.shearCentre), q);
      expect(Math.hypot(p[0] - q[0], p[1] + q[1], p[2] - q[2])).toBeLessThan(1e-12);

      // Swapping the travels mirrors the axle.
      const l = at(a, zL, zR, 'left');
      const r = at(a, zR, zL, 'right');
      for (const f of ['camber', 'toe', 'contactX', 'contactZ', 'springLen', 'mrSpring', 'bumpSteerCross', 'tanThetaKP', 'tanThetaKPCross'] as const) {
        expect(Math.abs(l[f] - r[f])).toBeLessThan(1e-12);
      }
      for (const f of ['contactY', 'wheelY', 'tanBeta', 'tanBetaCross', 'beamTwist', 'twistRate'] as const) {
        expect(Math.abs(l[f] + r[f])).toBeLessThan(1e-12);
      }

      // Exact slopes against central differences, per own and per other travel, for both wheels.
      const h = 1e-6;
      for (const side of ['left', 'right'] as const) {
        const s = at(a, zL, zR, side);
        const sign = side === 'left' ? 1 : -1;
        const diff = (dOwn: number, dOther: number, f: (b: BeamSample) => number): number => {
          const [uL, uR] = side === 'left' ? [dOwn, dOther] : [dOther, dOwn];
          return (f(at(a, zL + uL * h, zR + uR * h, side)) - f(at(a, zL - uL * h, zR - uR * h, side))) / (2 * h);
        };
        const checks: Array<[number, number, (b: BeamSample) => number, number]> = [
          [1, 0, (b) => b.contactY, s.tanBeta],
          [0, 1, (b) => b.contactY, s.tanBetaCross],
          [1, 0, (b) => b.contactX, s.tanThetaCP],
          [0, 1, (b) => b.contactX, s.tanThetaCPCross],
          [1, 0, (b) => b.wheelX, s.tanThetaWC],
          [0, 1, (b) => b.wheelX, s.tanThetaWCCross],
          [1, 0, (b) => b.camber, s.camberGain],
          [0, 1, (b) => b.camber, s.camberGainCross],
          [1, 0, (b) => b.toe, s.bumpSteer],
          [0, 1, (b) => b.toe, s.bumpSteerCross],
          [1, 0, (b) => -b.springLen, s.mrSpring],
          [0, 1, (b) => -b.springLen, s.mrSpringCross],
          [1, 0, (b) => -b.damperLen, s.mrDamper],
          [0, 1, (b) => -b.damperLen, s.mrDamperCross],
          [1, 0, (b) => b.beamTwist, s.twistRate],
          [1, 0, (b) => b.travel, 1],
          [0, 1, (b) => b.travel, 0],
        ];
        for (const [dOwn, dOther, f, exact] of checks) expect(Math.abs(diff(dOwn, dOther, f) - exact)).toBeLessThan(1e-6);
        expect(Math.sign(s.contactY)).toBe(sign);
      }
    }
  });

  it('meets both travels to 1e-13 m in at most four Newton steps from rest, three from a 2 mm neighbour', () => {
    for (const beamPos of [0, 0.35, 1]) {
      const solver = beam({ beamPos }).solver;
      for (let i = -100; i <= 120; i += 4) {
        for (let j = -100; j <= 120; j += 4) {
          const state = TwistBeamSolver.rest();
          const res = solver.solve(state, i / 1000, j / 1000);
          expect(res.ok && res.iterations <= 4 && res.residual < 1e-13).toBe(true);
          const warm = solver.solve(state, (i + 2) / 1000, (j - 2) / 1000);
          expect(warm.ok && warm.iterations <= 3).toBe(true);
        }
      }
    }
  });

  it('typical beam: roll centre in the rear range, springs beside the stubs, the stop 80 mm into bump', () => {
    const a = beam();
    const s = at(a, 0, 0);
    // The research's target for a rear roll centre; the RCF is tied to it (≈0.61, the research's weak ≈0.55).
    expect(s.rcHeight).toBeGreaterThan(0.09);
    expect(s.rcHeight).toBeLessThan(0.12);
    expect(rcf(a)).toBeCloseTo(1 - s.rcHeight / TWIST_BEAM_TYPICAL.wheelCentreZM, 9);
    // A spring at the stub's x moves with the wheel in heave and less in roll, being nearer the roll axis.
    expect(s.mrSpring + s.mrSpringCross).toBeCloseTo(1, 12);
    expect(s.mrSpring - s.mrSpringCross).toBeLessThan(1);
    const d = a.spec.damper;
    if (d.wheel === 'strut') throw new Error('a twist beam has no strut');
    const z = TWIST_BEAM_BUMP_STOP_TRAVEL_M;
    expect(at(a, z, z).damperLen).toBeCloseTo(dist(d.body, d.wheel) - a.spec.bumpStop.gapM, 12);
    // The typical torsional stiffness note: the beam twists 2.94 rad per radian of axle roll.
    const right = at(a, 0, 0, 'right');
    expect(((a.spec.track / 2) * (s.twistRate - right.twistRate)) / 2.94).toBeCloseTo(1, 2);
    expect(a.spec.linkage.shearCentre).toEqual(shearCentreOf(TWIST_BEAM_TYPICAL));
  });

  it('refuses intents it cannot build, and travels it cannot reach', () => {
    for (const beamPos of [-0.1, 1.1]) expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, beamPos })).toThrow(/between/);
    const keys = [
      'beamPos', 'shearCentreDzM', 'armM', 'pivotYM', 'pivotZM', 'trackM', 'wheelCentreZM', 'camberDeg', 'toeDeg',
      'torsionNmPerRad',
    ] as const;
    for (const key of keys) expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, [key]: NaN })).toThrow(/not a number/);
    for (const armM of [0, -0.4]) expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, armM })).toThrow(/ahead/);
    expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, pivotYM: 0 })).toThrow(/centre line/);
    expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, torsionNmPerRad: -1 })).toThrow();
    expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, camberDeg: 15 })).toThrow();
    // A level arm reaches 120 mm of bump only if longer; shorter ones fail in the template, not in a sweep.
    for (const armM of [0.05, 0.11]) expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, armM })).toThrow(/too short/);
    expect(() => twistBeamAxle({ ...TWIST_BEAM_TYPICAL, armM: 0.15 })).not.toThrow();
    expect(() => beam().measureAt(0.5, 0, 'left', newBeamSample())).toThrow(/does not solve/);
  });
});

describe('solid axles: Panhard rod, Watt’s linkage, leaf springs, de Dion', () => {
  const sample = (axle: SolidAxle, zL: number, zR: number, side: 'left' | 'right' = 'left'): SolidSample => {
    const out = newSolidSample();
    axle.measureAt(zL, zR, side, out);
    return out;
  };
  /** Level trailing links: no roll steer, so the axle rolls about its lateral locator alone. */
  const level = (intent: SolidAxleIntent) => new SolidAxle(solidAxle({ ...intent, linkAngleDeg: 0, upperAngleDeg: 0 }));

  it('Panhard rod: the axle shifts sideways by about z²/(2L) in heave, within 5 % on ±50 mm', () => {
    const axle = new SolidAxle(solidAxle(SOLID_TYPICAL.panhard));
    const lat = axle.spec.linkage.lateral;
    if (lat.kind !== 'panhard') throw new Error('expected a Panhard rod');
    // The rod is level at design: its axle end swings on an arc of its length about the body end.
    expect(lat.axle[2]).toBe(lat.body[2]);
    const L = dist(lat.axle, lat.body);
    for (const z of [-0.05, -0.03, 0.03, 0.05]) {
      const shift = Math.abs(sample(axle, z, z).axleShiftY);
      expect(Math.abs(shift / ((z * z) / (2 * L)) - 1), `${z * 1000} mm`).toBeLessThan(0.05);
    }
    // Toward the rod's body end (the right), whichever way the axle moves.
    expect(sample(axle, 0.05, 0.05).axleShiftY).toBeLessThan(0);
    expect(sample(axle, -0.05, -0.05).axleShiftY).toBeLessThan(0);
  });

  it('Watt’s linkage: its pivot strays less than 1 mm from a straight line on ±50 mm', () => {
    const axle = new SolidAxle(solidAxle(SOLID_TYPICAL.watt));
    const lat = axle.spec.linkage.lateral;
    if (lat.kind !== 'watt') throw new Error('expected Watt’s linkage');
    const pivot = [0, 0, 0];
    for (let z = -0.05; z <= 0.05 + 1e-9; z += 0.01) {
      const s = axle.rest();
      axle.solve(s, z, z);
      axle.solver.point(s, lat.spec.pivotOnAxle, pivot);
      expect(Math.abs(pivot[1] - lat.spec.pivotOnAxle[1]), `${(z * 1000).toFixed(0)} mm`).toBeLessThan(1e-3);
    }
    // Ten times straighter than the Panhard rod over the same travel.
    const panhard = Math.abs(sample(new SolidAxle(solidAxle(SOLID_TYPICAL.panhard)), 0.05, 0.05).axleShiftY);
    expect(Math.abs(sample(axle, 0.05, 0.05).axleShiftY)).toBeLessThan(panhard / 10);
  });

  it('rolls about its lateral locator: the Panhard rod’s height, the Watt pivot, ±1 mm', () => {
    for (const intent of [SOLID_TYPICAL.panhard, { ...SOLID_TYPICAL.panhard, links: 'three' }, SOLID_TYPICAL.watt] as const) {
      const axle = level(intent);
      expect(Math.abs(axle.rollCentre() - intent.lateralZM), intent.lateral).toBeLessThan(1e-3);
      // Both wheels give the same roll centre.
      expect(sample(axle, 0, 0, 'right').rcHeight).toBeCloseTo(axle.rollCentre(), 9);
    }
    // Raising the rod raises the roll centre by as much.
    expect(level({ ...SOLID_TYPICAL.panhard, lateralZM: 0.5 }).rollCentre() - level(SOLID_TYPICAL.panhard).rollCentre()).toBeCloseTo(0.1, 3);
    // With sloped links the axle also steers in roll, and a rod behind the axle then sits a little off its height.
    const sloped = new SolidAxle(solidAxle(SOLID_TYPICAL.panhard));
    const rollSteer = sample(sloped, 0.02, -0.02);
    expect(rollSteer.axleSteer / rollSteer.axleRoll).toBeCloseTo(Math.tan(SOLID_TYPICAL.panhard.linkAngleDeg * DEG), 2);
  });

  it('keeps camber to the road whatever the body roll: the roll camber factor is 0 (Chalmers §2.3.4)', () => {
    for (const intent of Object.values(SOLID_TYPICAL)) {
      const axle = new SolidAxle(solidAxle(intent));
      const half = axle.spec.wheelCentre[1];
      const design = sample(axle, 0, 0);
      expect(1 - (axle.spec.track / 2) * Math.abs(design.camberGain - design.camberGainCross), intent.lateral).toBeCloseTo(0, 9);
      for (const phi of [1, 3, 5]) {
        // Body rolled left side up by φ: the left wheel droops, the right one is pressed, the axle stays on the road.
        const z = half * Math.sin(phi * DEG);
        const l = sample(axle, -z, z, 'left');
        const r = sample(axle, -z, z, 'right');
        // The road under both wheels holds the car's x axis and the line through both wheel centres (both wheels are
        // rigid to the axle). Camber to the road is the spin axis's tilt from that plane.
        const n = cross([1, 0, 0], sub([l.wheelX, l.wheelY, l.wheelZ], [r.wheelX, r.wheelY, r.wheelZ]));
        const len = Math.hypot(...n);
        const spin = (w: SolidSample, my: number): Vec3 => [Math.cos(w.camber) * Math.sin(w.toe), my * Math.cos(w.camber) * Math.cos(w.toe), -Math.sin(w.camber)];
        expect(-Math.asin(dot(spin(l, 1), n) / len), `${intent.lateral} ${phi}°`).toBeCloseTo(design.camber, 12);
        expect(-Math.asin(dot(spin(r, -1), n) / len), `${intent.lateral} ${phi}°`).toBeCloseTo(design.camber, 12);
        // To the body, the wheels lean with the axle (up to the second-order effect of its roll steer).
        expect(l.camber).toBeCloseTo(phi * DEG, 4);
        expect(l.axleRoll).toBeCloseTo(-phi * DEG, 4);
      }
      // One wheel alone tilts both: the axle turns about the other wheel, 1/t per metre.
      expect(Math.abs(design.camberGain)).toBeCloseTo(1 / axle.spec.track, 9);
    }
  });

  it('leaf springs: the axle rolls about the line through the eyes and steers as the front half swings', () => {
    const intent = SOLID_TYPICAL.leaf;
    const axle = new SolidAxle(solidAxle(intent));
    const lat = axle.spec.linkage.lateral;
    if (lat.kind !== 'leaf') throw new Error('expected leaf springs');
    const leaf = lat.spec;
    // Level eyes: both at seat height plus the arch. The three-link model's links turn about the axle's y axis at the
    // clamp, so a rolling axle tilts them with it, and they stay put only if it rolls about the eyes.
    expect(leaf.frontEye[2]).toBeCloseTo(leaf.rearEye[2], 12);
    expect(Math.abs(axle.rollCentre() - leaf.frontEye[2])).toBeLessThan(1e-3);
    // Roll steer: the clamp's front end swings about the front eye, so the side that rises moves by the link's slope.
    const A: Vec3 = [
      leaf.axleSeat[0] + (1 - LEAF_LINK_SHARE) * (leaf.frontEye[0] - leaf.axleSeat[0]),
      0,
      leaf.axleSeat[2] + (1 - LEAF_LINK_SHARE) * (leaf.frontEye[2] - leaf.axleSeat[2]),
    ];
    const slope = (leaf.frontEye[2] - A[2]) / (leaf.frontEye[0] - A[0]);
    const s = sample(axle, 0.02, -0.02);
    expect(Math.abs(s.axleSteer / s.axleRoll / slope - 1)).toBeLessThan(0.05);
    // The leaves alone hold the axle: no rods, nothing binds, no sideways shift in heave.
    expect(axle.spec.linkage.rods.length).toBe(0);
    for (const z of [-0.08, 0.1]) {
      const h = sample(axle, z, z);
      expect(h.bind).toBe(0);
      expect(Math.abs(h.axleShiftY)).toBeLessThan(1e-9);
    }
    // A leaf sloping down to the front steers the other way.
    const down = new SolidAxle(solidAxle({ ...intent, leaf: { ...intent.leaf, archM: 0, slopeDeg: -5 } }));
    const d = sample(down, 0.02, -0.02);
    expect(Math.sign(d.axleSteer)).toBe(-Math.sign(s.axleSteer));
  });

  it('lays each trailing link at its side-view slope and length, also one angled in plan', () => {
    const intent: SolidAxleIntent = { ...SOLID_TYPICAL.triangulated, linkAngleDeg: 6, upperAngleDeg: -9 };
    for (const r of solidAxle(intent).linkage.rods) {
      const upper = r.id.startsWith('upper');
      const slope = Math.atan2(r.body[2] - r.knuckle[2], r.body[0] - r.knuckle[0]) / DEG;
      expect(slope, r.id).toBeCloseTo(upper ? intent.upperAngleDeg : intent.linkAngleDeg, 9);
      expect(dist(r.body, r.knuckle), r.id).toBeCloseTo(upper ? intent.upperLinkM : intent.lowerLinkM, 12);
    }
  });

  it('anti-squat lines: in heave the axle’s point at the contact patch moves square to the line to where the link lines meet, seen from the side', () => {
    // With the drive or brake torque taken by the axle, the force from the road acts on the axle at the contact patch,
    // so the anti line runs from the patch to the axle's side-view instant centre, where the side-view lines of the
    // lower and upper links meet (docs/research/suspensions.md, «Анти-геометрія»: for a solid axle from the contact
    // point). In heave both wheels move, so the slope is own plus cross. tanθ_WC is the line from the wheel centre
    // instead, for torque the body takes (a de Dion's differential, inboard brakes).
    const lineOf = (axle: SolidAxle, id: string): [number, number, number, number] => {
      const r = axle.spec.linkage.rods.find((x) => x.id === id)!;
      return [r.knuckle[0], r.knuckle[2], r.body[0] - r.knuckle[0], r.body[2] - r.knuckle[2]];
    };
    const cases: Array<[string, SolidAxleIntent, string]> = [
      ['triangulated', SOLID_TYPICAL.triangulated, 'upper-left'],
      ['three links, level upper', { ...SOLID_TYPICAL.panhard, links: 'three', upperAngleDeg: 0 }, 'upper'],
      ['three links, upper at 12°', { ...SOLID_TYPICAL.watt, links: 'three', upperAngleDeg: 12 }, 'upper'],
    ];
    for (const [name, intent, upperId] of cases) {
      const axle = new SolidAxle(solidAxle(intent));
      const [x1, z1, dx1, dz1] = lineOf(axle, 'lower-left');
      const [x2, z2, dx2, dz2] = lineOf(axle, upperId);
      // x1 + s·dx1 = x2 + u·dx2, z1 + s·dz1 = z2 + u·dz2
      const det = dx1 * -dz2 + dx2 * dz1;
      const s = ((x2 - x1) * -dz2 + dx2 * (z2 - z1)) / det;
      const icX = x1 + s * dx1;
      const icZ = z1 + s * dz1;
      const w = sample(axle, 0, 0);
      expect(w.tanThetaCP + w.tanThetaCPCross, name).toBeCloseTo((w.contactZ - icZ) / (icX - w.contactX), 9);
      expect(w.tanThetaWC + w.tanThetaWCCross, name).toBeCloseTo((w.wheelZ - icZ) / (icX - w.wheelX), 9);
      // A pitching axle: the two lines differ by the wheel radius over the instant centre's distance.
      expect(Math.abs(w.tanThetaCP + w.tanThetaCPCross - (w.tanThetaWC + w.tanThetaWCCross)), name).toBeGreaterThan(0.05);
    }
    // Parallel links: the instant centre is at infinity along them, and the axle translates square to them.
    const parallel = sample(new SolidAxle(solidAxle(SOLID_TYPICAL.panhard)), 0, 0);
    const slope = -Math.tan(SOLID_TYPICAL.panhard.linkAngleDeg * DEG);
    expect(parallel.tanThetaCP + parallel.tanThetaCPCross).toBeCloseTo(slope, 9);
    expect(parallel.tanThetaWC + parallel.tanThetaWCCross).toBeCloseTo(slope, 9);
  });

  it('touches the bump stop 80 mm into bump, and refuses intents that cannot be built', () => {
    for (const intent of Object.values(SOLID_TYPICAL)) {
      const axle = new SolidAxle(solidAxle(intent));
      const design = sample(axle, 0, 0).damperLen;
      expect(design - sample(axle, SOLID_BUMP_STOP_TRAVEL_M, SOLID_BUMP_STOP_TRAVEL_M).damperLen).toBeCloseTo(axle.spec.bumpStop.gapM, 12);
    }
    const base = SOLID_TYPICAL.panhard;
    expect(() => solidAxle({ ...base, trackM: Number.NaN })).toThrow(/trackM/);
    expect(() => solidAxle({ ...base, lowerLinkM: 0.05 })).toThrow(/0\.1 m/);
    expect(() => solidAxle({ ...base, linkAngleDeg: 40 })).toThrow(/30°/);
    expect(() => solidAxle({ ...base, lateralZM: 2 })).toThrow(/lateral locator/);
    expect(() => solidAxle({ ...SOLID_TYPICAL.leaf, leaf: { ...SOLID_TYPICAL.leaf.leaf, frontShare: 0.95 } })).toThrow(/seat/);
    expect(() => solidAxle({ ...SOLID_TYPICAL.deDion, diffOutputYM: 0.7 })).toThrow(/differential output/);
    // A travel that is not a number is refused, not measured as the design pose.
    const axle = new SolidAxle(solidAxle(base));
    expect(() => axle.measureAt(Number.NaN, 0.05, 'left', newSolidSample())).toThrow(/numbers/);
  });
});
