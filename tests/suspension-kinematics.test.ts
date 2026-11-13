import { describe, expect, it } from 'vitest';
import { fromJtekt, jtektCorner, JTEKT_TABLE1, macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { buildAxle, newCornerSample } from '../src/suspension/kinematics.ts';
import { factorySetup, resolveCorner, SETUP_RANGES, type CornerSetup } from '../src/suspension/setup.ts';
import { dist } from '../src/suspension/vec.ts';
import { PRESSURE_KT_SLOPE, patchLengthM, TYRE_FILES, tyreVertical, verticalStiffness } from '../src/vehicle/tyre-data.ts';

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
    const cases: Array<Partial<CornerSetup>> = [
      { camberDeg: -1.5, toeDeg: 0.1 },
      { camberDeg: -3, toeDeg: -0.3, rideHeightM: -0.04 },
      { camberDeg: 0.5, toeDeg: 0.4, rideHeightM: 0.03 },
      { camberDeg: -0.8, toeDeg: 0, rideHeightM: 0.04, springNmm: 60 },
    ];
    for (const c of cases) {
      const r = resolveCorner(corner, { ...factory, ...c });
      expect(Math.abs(r.atRest.camber / DEG - r.setup.camberDeg)).toBeLessThan(0.01);
      expect(Math.abs(r.atRest.toe / DEG - r.setup.toeDeg)).toBeLessThan(0.01);
      // The exact solve agrees with the table at rest.
      const s = newCornerSample();
      r.axle.measureAt(r.staticTravelM, s);
      expect(Math.abs(s.camber / DEG - r.setup.camberDeg)).toBeLessThan(1e-6);
      expect(Math.abs(s.toe / DEG - r.setup.toeDeg)).toBeLessThan(1e-6);
    }
    // Negative camber comes from moving the top mount inboard, toe-in from a shorter tie rod (arm ahead of the axle).
    const neg = resolveCorner(corner, { ...factory, camberDeg: -2 });
    expect(neg.topShiftM).toBeLessThan(0);
    const toeIn = resolveCorner(corner, { ...factory, toeDeg: 0.3 });
    expect(toeIn.tieRodChangeM).not.toBe(0);
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
    for (const rh of [-0.04, -0.02, 0.02, 0.04]) {
      // Keep the alignment the factory curve has at that travel, so no shift is needed and the corner is the factory one.
      const camber = page.value('camber', -rh) * D;
      const toe = page.value('toe', -rh) * D;
      const r = resolveCorner(corner, { ...factory, rideHeightM: rh, camberDeg: camber, toeDeg: toe });
      expect(r.staticTravelM).toBe(-rh);
      expect(Math.abs(r.topShiftM)).toBeLessThan(1e-6);
      for (const f of ['mrSpring', 'tanBeta', 'kpi', 'caster', 'scrub', 'damperLen'] as const) {
        expect(r.atRest[f]).toBeCloseTo(page.value(f, -rh), 6);
      }
      // The body stands rh higher; the tyre is as pressed as before.
      expect(r.bodyStaticM).toBeCloseTo(rh, 9);
      expect(r.tyre.staticDeflM).toBeCloseTo(resolveCorner(corner, factory).tyre.staticDeflM, 12);
    }
    // Lowering a strut drops its roll centre (y_C·dy_C/dz) and eats into the travel left to the bump stop.
    const low = resolveCorner(corner, { ...factory, rideHeightM: -0.04 });
    const base = resolveCorner(corner, factory);
    const rc = (r: typeof base): number => r.atRest.contactY * r.atRest.tanBeta;
    expect(rc(low)).toBeLessThan(rc(base) - 0.05);
    expect(low.atRest.damperLen - low.bumpStop.contactM).toBeLessThan(base.atRest.damperLen - base.bumpStop.contactM - 0.03);
    // The perch moves down by about the height times the motion ratio.
    expect(low.spring.perchM).toBeLessThan(-0.035);
    expect(low.spring.perchM).toBeGreaterThan(-0.05);
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
    expect(r.setup.toeDeg).toBe(0);
    expect(r.setup.pressureBar).toBe(1.2);
    expect(r.setup.damper).toBe(0.05);
    expect(Number.isFinite(r.bodyHz)).toBe(true);
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
