import { describe, expect, it } from 'vitest';
import { fromJtekt, jtektCorner, jtektKingpinOffsetM, JTEKT_TABLE1, macphersonJtekt, SPLIT_KNUCKLE_DEFAULTS } from '../src/suspension/templates/macpherson.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { multilink, multilinkDefaults } from '../src/suspension/templates/multilink.ts';
import { buildAxle, newCornerSample } from '../src/suspension/kinematics.ts';
import { buildAxleLite } from '../src/suspension/axle-lite.ts';
import { POSE_SIZE } from '../src/suspension/solve.ts';
import type { AxleSpec, Vec3 } from '../src/suspension/spec.ts';
import { cross, dot, sub, svd } from '../src/suspension/vec.ts';
import { clampSetup, factorySetup, resolveCorner, SETUP_RANGES, type CornerSetup } from '../src/suspension/setup.ts';
import { dist } from '../src/suspension/vec.ts';
import { CornerSolver } from '../src/suspension/solve.ts';
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
        expect(c.rcHeight).toBeCloseTo(c.contactY * c.tanBeta, 15);
        // The spring and damper motion ratios, wherever they sit (strut, lower arm, spring link).
        expect(Math.abs(-(u.springLen - d.springLen) / (2 * h) - c.mrSpring)).toBeLessThan(1e-6);
        expect(Math.abs(-(u.damperLen - d.damperLen) / (2 * h) - c.mrDamper)).toBeLessThan(1e-6);
      }
    }
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

  it('measures the rising rate and where the roll centre goes in a 3° roll', () => {
    // Geometric roll centre of two force lines from the contact points, outer wheel `dz` into bump, inner as far out.
    const crossing = (a: ReturnType<typeof buildAxle>, dz: number): { heightM: number; lateralM: number } => {
      const [o, i] = [sampleAt(a, dz), sampleAt(a, -dz)];
      const T = o.contactY + i.contactY;
      return { heightM: (T * o.tanBeta * i.tanBeta) / (o.tanBeta + i.tanBeta), lateralM: ((T / 2) * (o.tanBeta - i.tanBeta)) / (o.tanBeta + i.tanBeta) };
    };
    for (const s of all) {
      const lite = buildAxleLite(s);
      const a = buildAxle(s);
      const h = 0.002;
      expect(lite.mrSpringSlope).toBeCloseTo((sampleAt(a, h).mrSpring - sampleAt(a, -h).mrSpring) / (2 * h), 9);
      const dz = (s.track / 2) * Math.sin(3 * DEG);
      const rolled = crossing(a, dz);
      expect(lite.rolled.heightM).toBeCloseTo(rolled.heightM, 9);
      expect(lite.rolled.lateralM).toBeCloseTo(rolled.lateralM, 9);
      // With no roll the two lines meet on the centre line at y_C·tanβ.
      const still = crossing(a, 1e-6);
      expect(Math.abs(still.heightM - lite.design.rcHeight)).toBeLessThan(1e-6);
      expect(Math.abs(still.lateralM)).toBeLessThan(1e-3);
      // In roll the geometric centre runs off toward the inner wheel and drops, as on all these layouts.
      expect(lite.rolled.lateralM).toBeLessThan(-0.3);
      expect(lite.rolled.heightM).toBeLessThan(lite.design.rcHeight);
    }
    // The strut's rising rate: its mr grows in bump.
    expect(buildAxleLite(spec).mrSpringSlope).toBeGreaterThan(0);
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
