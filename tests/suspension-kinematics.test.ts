import { describe, expect, it } from 'vitest';
import { fromJtekt, jtektCorner, JTEKT_TABLE1, macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { buildAxle, newCornerSample } from '../src/suspension/kinematics.ts';
import { clampSetup, factorySetup, resolveCorner, SETUP_RANGES, type CornerSetup } from '../src/suspension/setup.ts';
import { dist } from '../src/suspension/vec.ts';
import { CornerSolver } from '../src/suspension/solve.ts';
import { PRESSURE_KT_SLOPE, patchLengthM, TYRE_FILES, tyreVertical, verticalStiffness } from '../src/vehicle/tyre-data.ts';
import type { Axle } from '../src/suspension/kinematics.ts';
import { pivotAxisDirection, pivotAxle, pivotLayout, PIVOT_TYPICAL, type PivotIntent } from '../src/suspension/templates/pivot.ts';
import { pivotAsLinks, pivotFrontViewCentre, PivotSolver } from '../src/suspension/solve-pivot.ts';
import type { PivotLinkage, Vec3 } from '../src/suspension/spec.ts';

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
        const table = new Float64Array(7);
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

  it('refuses to adjust rods or a strut top that a pivot corner does not have', () => {
    const solver = buildAxle(pivotAxle(PIVOT_TYPICAL['semi-trailing'])).solver;
    expect(solver.steerRow()).toBe(-1);
    expect(() => solver.setLength(0, 0.5)).toThrow();
    expect(() => solver.setTopShift([0, 0, 0], [0, 0.01, 0])).toThrow();
  });
});
