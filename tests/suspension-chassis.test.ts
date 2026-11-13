// The car as a body on four wheels in the prescribed mode (chassis-sim.ts) and its steady cornering (statics.ts): the
// lateral part of the suspensions plan's tests and the laws of stage 7's acceptance.

import { describe, expect, it } from 'vitest';
import { buildChassis, type Chassis } from '../src/suspension/chassis.ts';
import { ChassisSim, ROLLOVER_RAD } from '../src/suspension/chassis-sim.ts';
import { newWheelSample, type WheelSample } from '../src/suspension/chassis-axle.ts';
import { TwistBeamAxle, newBeamSample } from '../src/suspension/beam-kinematics.ts';
import { SolidAxle, newSolidSample } from '../src/suspension/solid-kinematics.ts';
import {
  axleRollStiffness, liftOff, millikenTransfer, rollModel, settle, settleAt, understeerGradient, type SteadyState,
} from '../src/suspension/statics.ts';
import { antiGeometry } from '../src/suspension/anti.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { solidAxle, SOLID_TYPICAL } from '../src/suspension/templates/solid-axle.ts';
import { aeroDragN, roadLoadN } from '../src/vehicle/road-load.ts';
import {
  chassisOf, restWheelCentreZM, typicalChassis, typicalFront, typicalRear, type TypicalCar,
} from '../src/suspension/templates/typical-chassis.ts';
import { coilForce, swayBarTorsionRate, G } from '../src/suspension/forces.ts';
import { QuarterSim } from '../src/suspension/quarter.ts';
import { factorySetup, resolveCorner } from '../src/suspension/setup.ts';
import { EventRoad, RoadBuffer } from '../src/suspension/road.ts';
import { estimateInertia, GYRATION_RATIOS, NHTSA_CARS } from '../src/vehicle/body-estimate.ts';
import { tyreVertical } from '../src/vehicle/tyre-data.ts';
import type { AxleSpec, ChassisLongitudinal, ChassisSpec, CornerLinkage, SolidAxleLinkage, TwistBeamLinkage } from '../src/suspension/spec.ts';

const DEG = Math.PI / 180;

/** The research's hot hatch (docs/research/suspensions.md, 13.2): 1250 kg, 62 % in front, CG 0.55 m. JTEKT strut in
 *  front, twist beam at the rear; the factory car has a 20 mm front bar and none at the rear (the beam is its own). */
const HOT_HATCH: TypicalCar = {
  id: 'hot-hatch', massKg: 1250, frontShare: 0.62, cgHeightM: 0.55, wheelbaseM: 2.5, trackM: [1.46, 1.44],
  front: 'macpherson', rear: 'twist-beam', drive: 'fwd', barsMm: [20, null], unsprungKg: [40, 40], rideHz: [1.3, 1.5],
};
/** A rear-drive sedan on double wishbones. */
const SEDAN: TypicalCar = {
  id: 'sedan', massKg: 1500, frontShare: 0.55, cgHeightM: 0.55, wheelbaseM: 2.7, trackM: [1.52, 1.54],
  front: 'double-wishbone', rear: 'double-wishbone', drive: 'rwd', barsMm: [22, 14], unsprungKg: [45, 45], rideHz: [1.3, 1.45],
};

const cache = new Map<string, Chassis>();
/** Chassis are built once per variant: a solid axle's grid takes a few hundred least-squares solves. */
function chassis(car: TypicalCar): Chassis {
  const key = JSON.stringify(car);
  let c = cache.get(key);
  if (!c) {
    c = buildChassis(typicalChassis(car));
    cache.set(key, c);
  }
  return c;
}

const LAYOUTS: TypicalCar[] = [
  HOT_HATCH,
  { ...HOT_HATCH, id: 'hot-hatch-multilink', rear: 'multilink' },
  SEDAN,
  { ...SEDAN, id: 'sedan-strut', front: 'macpherson' },
  { ...SEDAN, id: 'sedan-live-axle', rear: 'live-axle', unsprungKg: [45, 60] },
  { ...SEDAN, id: 'sedan-semi-trailing', rear: 'semi-trailing' },
  { ...SEDAN, id: 'sedan-swing-axle', rear: 'swing-axle' },
];

const sum = (a: ArrayLike<number>): number => Array.from(a).reduce((s, x) => s + x, 0);
const near = (a: number, b: number, rel: number): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b));

describe('chassis at rest', () => {
  it.each(LAYOUTS.map((c) => [c.id, c] as const))('%s: carries m·g with the front share, stands level and stays there', (_id, car) => {
    const c = chassis(car);
    const sim = new ChassisSim(c);
    const o = sim.observe();
    near(sum(o.fz), c.massKg * G, 1e-9);
    near((o.fz[0] + o.fz[1]) / sum(o.fz), car.frontShare, 0.005);
    for (const a of [o.zAcc, o.rollAcc, o.pitchAcc, ...o.wheelAcc]) expect(Math.abs(a)).toBeLessThan(1e-9);
    for (const q of o.travel) expect(Math.abs(q)).toBeLessThan(1e-12);
    for (let i = 0; i < 2000; i++) sim.step();
    expect(Math.abs(sim.out.roll)).toBeLessThan(1e-12);
    expect(Math.abs(sim.out.pitch)).toBeLessThan(1e-9);
    for (const q of sim.out.travel) expect(Math.abs(q)).toBeLessThan(1e-9);
  });

  it('the sprung body and the four unsprung corners add back to the measured car (NHTSA BMW 325i, 0.1 %)', () => {
    // Heydinger et al., SAE 1999-01-1336, 1986 BMW 325i: 12277 N, 53.3 % in front, CG 0.533 m, wheelbase 2.570 m,
    // tracks 1.402 / 1.394 m, pitch / roll / yaw 2011 / 381 / 2027 kg·m².
    const massKg = 12277 / 9.80665;
    const base = typicalChassis({
      id: 'e30', massKg, frontShare: 0.533, cgHeightM: 0.533, wheelbaseM: 2.57, trackM: [1.402, 1.394],
      front: 'double-wishbone', rear: 'semi-trailing', drive: 'rwd', barsMm: [null, null], unsprungKg: [40, 40], rideHz: [1.2, 1.4],
    });
    const spec: ChassisSpec = { ...base, body: { ...base.body, inertia: { ixx: 381, iyy: 2011, izz: 2027, source: 'nhtsa' } } };
    const c = buildChassis(spec);
    const s = c.sprung;
    let m = s.massKg;
    let mx = s.massKg * s.cgX;
    let mz = s.massKg * s.cgHeightM;
    for (const k of c.corners) {
      m += k.unsprungKg;
      mx += k.unsprungKg * k.x;
      mz += k.unsprungKg * k.restWheelZM;
    }
    near(m, massKg, 1e-12);
    expect(Math.abs(mx / m)).toBeLessThan(1e-12);
    near(mz / m, 0.533, 1e-12);
    const h = mz / m;
    let ixx = s.ixx + s.massKg * (s.cgHeightM - h) ** 2;
    let iyy = s.iyy + s.massKg * (s.cgX ** 2 + (s.cgHeightM - h) ** 2);
    let izz = s.izz + s.massKg * s.cgX ** 2;
    for (const k of c.corners) {
      ixx += k.unsprungKg * (k.y ** 2 + (k.restWheelZM - h) ** 2);
      iyy += k.unsprungKg * (k.x ** 2 + (k.restWheelZM - h) ** 2);
      izz += k.unsprungKg * (k.x ** 2 + k.y ** 2);
    }
    near(ixx, 381, 0.001);
    near(iyy, 2011, 0.001);
    near(izz, 2027, 0.001);
    // The research's worked example: four 40 kg corners near 0.30 m take about 87 kg·m² of the 381, and the sprung
    // centre of mass sits about 34 mm higher (0.567 m) with about 293 kg·m² of roll inertia.
    expect(s.cgHeightM).toBeGreaterThan(0.56);
    expect(s.cgHeightM).toBeLessThan(0.575);
    expect(s.ixx).toBeGreaterThan(285);
    expect(s.ixx).toBeLessThan(300);
  });

  it('the same input under all four wheels, no bars, answers as the quarter car does (2 %)', () => {
    // A symmetric car: the JTEKT corner at both ends, half the weight on each axle, so a bump under all four at once
    // only heaves it.
    const tyre = 'street' as const;
    const massKg = 1760;
    const mu = 40;
    const z = restWheelCentreZM(tyre, massKg / 4);
    const spec = chassisOf({
      id: 'symmetric', massKg, frontShare: 0.5, cgHeightM: 0.55, wheelbaseM: 2.6,
      front: typicalFront('macpherson', 1.46, z, true), rear: typicalFront('macpherson', 1.46, z, true),
      frontBar: null, rearBar: null, unsprungKg: [mu, mu], rideHz: [1.3, 1.3], zeta: 0.25, tyre, geometry: 'typical',
    });
    const c = buildChassis(spec);
    const corner = { axle: spec.front.axle as AxleSpec<CornerLinkage>, sprungKg: massKg / 4 - mu, unsprungKg: mu, tyre, tyreRadiusM: null };
    const rc = resolveCorner(corner, factorySetup(corner));
    const road = new RoadBuffer(new EventRoad([{ kind: 'bump', atM: 3, lengthM: 0.5, heightM: 0.05 }]), rc.tyre.freeRadiusM, rc.tyre.patchM);
    const v = 30 / 3.6;
    const quarter = new QuarterSim(rc, road, v);
    quarter.reset(0);
    const sim = new ChassisSim(c);
    let worst = 0;
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      const x = quarter.x;
      for (let w = 0; w < 4; w++) {
        sim.road[w] = road.heightAt(x);
        sim.roadRate[w] = road.slopeAt(x) * v;
      }
      quarter.step();
      sim.step();
      peak = Math.max(peak, Math.abs(quarter.out.tyreN - (massKg / 4) * G));
      worst = Math.max(worst, Math.abs(sim.out.fz[0] - quarter.out.tyreN), Math.abs(sim.out.zAcc - quarter.out.bodyAcc) * (massKg / 4 - mu));
      expect(Math.abs(sim.out.roll)).toBeLessThan(1e-12);
    }
    expect(peak).toBeGreaterThan(1000);
    expect(worst).toBeLessThan(0.02 * peak);
  });
});

describe('reading an axle at a pair of travels', () => {
  /** Every field that the axle modules measure themselves, by name. */
  const MEASURED = [
    'camber', 'toe', 'contactX', 'contactY', 'contactZ', 'wheelX', 'wheelY', 'wheelZ', 'springLen', 'damperLen',
    'mrSpring', 'mrDamper', 'tanBeta', 'tanThetaCP', 'tanThetaWC', 'camberGain', 'rcHeight',
  ] as const satisfies readonly (keyof WheelSample)[];
  const CROSS = [
    'mrSpringCross', 'mrDamperCross', 'tanBetaCross', 'tanThetaCPCross', 'tanThetaWCCross', 'camberGainCross',
  ] as const satisfies readonly (keyof WheelSample)[];
  const LATERAL = new Set<string>(['contactY', 'wheelY', 'tanBeta']);

  it('gives each wheel of two corners its own row of the corner table, the right one mirrored', () => {
    const ax = chassis(SEDAN).axles[0];
    const t = ax.corner!.table;
    const L = newWheelSample();
    const R = newWheelSample();
    for (const [i, j] of [[3, 30], [17, 4], [t.n - 2, 0]]) {
      ax.sample(t.travel0 + i * t.step, t.travel0 + j * t.step, L, R);
      for (const f of MEASURED) {
        expect(Math.abs(L[f] - t.fields[f][i])).toBeLessThan(1e-12);
        expect(Math.abs(R[f] - (LATERAL.has(f) ? -1 : 1) * t.fields[f][j])).toBeLessThan(1e-12);
      }
      for (const f of CROSS) expect(L[f]).toBe(0);
    }
  });

  it('gives both wheels of a twist beam and a solid axle what their modules measure at a node of the grid', () => {
    const beam = chassis(HOT_HATCH).axles[1];
    const solid = chassis({ ...SEDAN, rear: 'live-axle', unsprungKg: [45, 60] }).axles[1];
    const tb = new TwistBeamAxle(beam.spec as AxleSpec<TwistBeamLinkage>);
    const sa = new SolidAxle(solid.spec as AxleSpec<SolidAxleLinkage>);
    const bs = newBeamSample();
    const ss = newSolidSample();
    const L = newWheelSample();
    const R = newWheelSample();
    for (const [ax, measure] of [
      [beam, (qL: number, qR: number, side: 'left' | 'right') => (tb.measureAt(qL, qR, side, bs), bs)],
      [solid, (qL: number, qR: number, side: 'left' | 'right') => (sa.measureAt(qL, qR, side, ss), ss)],
    ] as const) {
      for (const [i, j] of [[4, 30], [25, 9]]) {
        const qL = ax.travel0 + i * ax.step;
        const qR = ax.travel0 + j * ax.step;
        ax.sample(qL, qR, L, R);
        for (const [mine, side] of [[L, 'left'], [R, 'right']] as const) {
          const m = measure(qL, qR, side);
          for (const f of [...MEASURED, ...CROSS]) expect(Math.abs(mine[f] - m[f])).toBeLessThan(1e-7);
        }
      }
    }
    // A twist beam's twist is the same on both wheels; each gets its own slope.
    beam.sample(0.03, -0.03, L, R);
    expect(L.beamTwist).not.toBe(0);
    expect(R.beamTwist).toBeCloseTo(L.beamTwist, 12);
    expect(L.twistRate * R.twistRate).toBeLessThan(0);
  });
});

describe('steady cornering', () => {
  it.each(LAYOUTS.map((c) => [c.id, c] as const))('%s: settles where the linear roll model says, at 0.1 g (3 %)', (_id, car) => {
    const c = chassis(car);
    const m = rollModel(c);
    const ay = 0.1 * G;
    const s = settle(c, ay);
    near(s.roll, m.gradient * ay, 0.03);
    near(s.suspensionRoll[0], m.suspensionGradient[0] * ay, 0.03);
    near(s.suspensionRoll[1], m.suspensionGradient[1] * ay, 0.03);
    const t = millikenTransfer(c, ay, m);
    near(s.transfer[0], t[0].total, 0.03);
    near(s.transfer[1], t[1].total, 0.03);
  });

  it('with rigid tyres and both wheels of each axle on one part, the gradient is m_s·h′/(ΣK_φ − m_s·g·h′) and the split Milliken’s (3 %)', () => {
    // Wheel centres drawn at the free radius: with rigid tyres the car then stands at its design height.
    const z = tyreVertical('street').freeRadiusM;
    const spec = chassisOf({
      id: 'two-live-axles', massKg: 1500, frontShare: 0.55, cgHeightM: 0.6, wheelbaseM: 2.4,
      front: typicalRear('live-axle', 1.47, z, false), rear: typicalRear('live-axle', 1.47, z, true),
      frontBar: null, rearBar: null, unsprungKg: [70, 70], rideHz: [1.3, 1.4], zeta: 0.25, tyre: 'street', geometry: 'typical',
    });
    const c = buildChassis(spec);
    // Rigid tyres: each corner then stands on its free radius, where the axles were drawn.
    for (const k of c.corners) {
      k.tyre.kt *= 1e4;
      k.restWheelZM = k.tyre.freeRadiusM - k.staticN / k.tyre.kt;
    }
    const m = rollModel(c);
    // On a solid axle the wheel centres' force line meets the centre line at the roll centre.
    near(m.wheelCentreLine[0], m.rollCentre[0], 0.01);
    const ay = 0.1 * G;
    const s = settle(c, ay);
    near(s.suspensionRoll[0], m.textbookGradient * ay, 0.03);
    near(s.suspensionRoll[1], m.textbookGradient * ay, 0.03);
    // Milliken: elastic m_s·h′·K_k/ΣK, geometric m_s,k·h_rc,k, unsprung m_u,k·h_u,k, each times a_y/t (the elastic
    // with the pendulum, through the gradient).
    const K = [m.stiffness[0].total, m.stiffness[1].total];
    for (const k of [0, 1] as const) {
      const t = c.tracks[k];
      const mu = 2 * c.corners[2 * k].unsprungKg;
      const ms = c.massKg * c.lateralShare[k] - mu;
      const hu = c.corners[2 * k].restWheelZM;
      const milliken = (K[k] * m.textbookGradient * ay) / t + (ms * m.rollCentre[k] * ay) / t + (mu * hu * ay) / t;
      near(s.transfer[k], milliken, 0.03);
    }
  });

  it.each(LAYOUTS.map((c) => [c.id, c] as const))('%s: the whole car’s roll moment balances about the road at 0.8 g (1 %)', (_id, car) => {
    // About the road under the body's origin: the tyre loads at their contact points against the side force's moment
    // (the sprung mass at h, the wheels at their centres) and the weight's, the sprung centre of mass having moved out
    // by h·φ over the road and the wheels standing on their contact points.
    const c = chassis(car);
    const ay = 0.8 * G;
    const sim = new ChassisSim(c);
    const s = settle(c, ay, sim);
    const L = newWheelSample();
    const R = newWheelSample();
    let moment = 0;
    let unsprungWeight = 0;
    for (const k of [0, 1] as const) {
      c.axles[k].sample(s.travel[2 * k], s.travel[2 * k + 1], L, R);
      moment += s.fz[2 * k] * L.contactY + s.fz[2 * k + 1] * R.contactY;
      unsprungWeight += G * c.corners[2 * k].unsprungKg * (L.contactY + R.contactY);
    }
    const h = c.sprung.cgHeightM + s.z;
    const sideMoment = ay * (c.sprung.massKg * h + c.corners.reduce((a, k, i) => a + k.unsprungKg * sim.out.wheelZ[i], 0));
    const pendulum = G * c.sprung.massKg * h * s.roll - unsprungWeight;
    near(-moment, sideMoment + pendulum, 0.01);
    // The centre of mass's shift is a few per cent of m·h·a_y on these cars, not nothing.
    expect(pendulum / sideMoment).toBeGreaterThan(0.02);
    expect(pendulum / sideMoment).toBeLessThan(0.15);
  });

  it('anti-roll bars move the transfer between the axles; the total, less the CG shift, changes under 1 %', () => {
    const variants = [SEDAN, { ...SEDAN, barsMm: [null, null] as const }, { ...SEDAN, barsMm: [28, null] as const }, { ...SEDAN, barsMm: [null, 22] as const }];
    const ay = 0.8 * G;
    const totals: number[] = [];
    const shares: number[] = [];
    for (const car of variants) {
      const c = chassis(car);
      const s = settle(c, ay);
      let moment = 0;
      const L = newWheelSample();
      const R = newWheelSample();
      for (const k of [0, 1] as const) {
        c.axles[k].sample(s.travel[2 * k], s.travel[2 * k + 1], L, R);
        moment += s.fz[2 * k] * L.contactY + s.fz[2 * k + 1] * R.contactY;
      }
      // Less the sprung weight's moment from the body's roll over the road (its CG over the road moves by h·φ).
      totals.push(-moment - G * c.sprung.massKg * (c.sprung.cgHeightM + s.z) * s.roll);
      shares.push(s.frontTransferShare);
    }
    for (const t of totals) near(t, totals[0], 0.01);
    // No bars: the front's share falls; a thick front bar raises it; a rear bar alone lowers it.
    expect(shares[1]).toBeLessThan(shares[0] - 0.05);
    expect(shares[2]).toBeGreaterThan(shares[0] + 0.05);
    expect(shares[3]).toBeLessThan(shares[1] - 0.05);
  });

  it('without bars the body rolls more, the front takes less of the transfer, and the understeer gradient changes', () => {
    const withBars = chassis(SEDAN);
    const without = chassis({ ...SEDAN, barsMm: [null, null] });
    const ay = 0.5 * G;
    const a = settle(withBars, ay);
    const b = settle(without, ay);
    expect(b.roll).toBeGreaterThan(1.5 * a.roll);
    expect(b.frontTransferShare).toBeLessThan(a.frontTransferShare - 0.05);
    // The load-sensitive tyre: a front that takes less of the transfer keeps more grip, so less understeer.
    const usA = understeerGradient(withBars, ay);
    const usB = understeerGradient(without, ay);
    expect(usB).toBeLessThan(usA - 0.3 * DEG);
  });

  it('lifts the inner rear wheel exactly when the rear transfer reaches its static load, and a stiffer front unloads it less', () => {
    const c = chassis({ ...HOT_HATCH, barsMm: [20, 26] });
    const lift = liftOff(c, 1.3 * G)!;
    expect(lift.corner).toBe(2);
    const s = settle(c, lift.ay);
    expect(s.fz[2]).toBeLessThan(1);
    near(s.transfer[1], c.corners[2].staticN, 0.01);
    // A right turn lifts the right rear at the same acceleration.
    const right = liftOff(c, -1.3 * G)!;
    expect(right.corner).toBe(3);
    near(-right.ay, lift.ay, 1e-6);
    // Raising the front roll stiffness loads the inner rear and unloads the inner front, monotonically.
    let innerRear = -Infinity;
    let innerFront = Infinity;
    for (const front of [null, 16, 20, 24, 28] as const) {
      const v = settle(chassis({ ...HOT_HATCH, barsMm: [front, 26] }), 0.7 * G);
      expect(v.fz[2]).toBeGreaterThan(innerRear);
      expect(v.fz[0]).toBeLessThan(innerFront);
      innerRear = v.fz[2];
      innerFront = v.fz[0];
    }
  });

  it('hot hatch: a stiff rear bar lifts the inner rear at 0.9 g; a thick front one does not, and the understeer grows (acceptance)', () => {
    const factory = chassis(HOT_HATCH);
    const stiffRear = chassis({ ...HOT_HATCH, barsMm: [20, 26] });
    const thickFront = chassis({ ...HOT_HATCH, barsMm: [26, null] });
    const ay = 0.9 * G;
    const r = settle(stiffRear, ay);
    expect(r.fz[2]).toBe(0);
    // The rear takes more of the transfer than its static load allows: 57 % in the linear model, where this car needs
    // about 54 % (the research's 58 % is for a 1.50 m track and leaves out the centre of mass's shift in roll).
    const lin = rollModel(stiffRear).transferPerAy;
    expect(lin[1].total / (lin[0].total + lin[1].total)).toBeGreaterThan(0.55);
    const f = settle(thickFront, ay);
    expect(f.fz[2]).toBeGreaterThan(1000);
    expect(f.fz[0]).toBeGreaterThan(0);
    expect(settle(factory, ay).fz[2]).toBeGreaterThan(500);
    const us = (c: Chassis): number => understeerGradient(c, 0.5 * G);
    expect(us(thickFront)).toBeGreaterThan(us(factory) + 0.5 * DEG);
    expect(us(stiffRear)).toBeLessThan(us(factory) - 1 * DEG);
  });

  it('a swing axle jacks the body up at 0.5 g, double wishbones barely', () => {
    const ay = 0.5 * G;
    const swing = settle(chassis({ ...SEDAN, rear: 'swing-axle' }), ay);
    const dw = settle(chassis(SEDAN), ay);
    expect(swing.z).toBeGreaterThan(0.003);
    expect(swing.z).toBeGreaterThan(5 * Math.abs(dw.z));
  });

  // A Panhard rod sits on one side, so the live axle's turns are not mirror images.
  it.each(LAYOUTS.filter((c) => c.rear !== 'live-axle').map((c) => [c.id, c] as const))('%s: a left turn is the mirror of a right one', (_id, car) => {
    const c = chassis(car);
    const l = settle(c, 0.6 * G);
    const r = settle(c, -0.6 * G);
    expect(r.roll).toBeCloseTo(-l.roll, 9);
    for (const [a, b] of [[0, 1], [1, 0], [2, 3], [3, 2]]) {
      expect(r.fz[a]).toBeCloseTo(l.fz[b], 4);
      expect(r.travel[a]).toBeCloseTo(l.travel[b], 9);
      expect(r.camberRoad[a]).toBeCloseTo(l.camberRoad[b], 9);
    }
  });
});

describe('the step of a side force', () => {
  const ay = 0.5 * G;
  /** Front axle's transfer through the links and through the springs, from the support each side pushes the body up with. */
  const parts = (c: Chassis, sim: ChassisSim): { links: number; elastic: number } => {
    const o = sim.out;
    return {
      links: (o.linksN[1] - o.linksN[0]) / 2,
      elastic: (o.elasticN[1] - c.restSupportN[1] - (o.elasticN[0] - c.restSupportN[0])) / 2,
    };
  };

  it.each([HOT_HATCH, SEDAN].map((c) => [c.id, c] as const))('%s: the links’ share is there within 2 ms, the springs’ grows with the roll', (_id, car) => {
    const c = chassis(car);
    const m = millikenTransfer(c, ay);
    const sim = new ChassisSim(c);
    sim.ay = ay;
    sim.step();
    sim.step();
    const early = parts(c, sim);
    near(early.links, m[0].geometric + m[0].unsprung, 0.02);
    expect(Math.abs(early.elastic)).toBeLessThan(0.02 * m[0].elastic);
    // The roll's natural period: the springs' part reaches half its steady value well inside it, not at once.
    const k = rollModel(c);
    const period = 2 * Math.PI * Math.sqrt(c.sprung.ixx / (k.stiffness[0].total + k.stiffness[1].total));
    let half = 0;
    for (let i = 0; i < 2000 && !half; i++) {
      sim.step();
      if (parts(c, sim).elastic > 0.5 * m[0].elastic) half = sim.t;
    }
    expect(half).toBeGreaterThan(0.05 * period);
    expect(half).toBeLessThan(0.5 * period);
  });

  it.each([HOT_HATCH, { ...SEDAN, id: 'sedan-live-axle', rear: 'live-axle' as const, unsprungKg: [45, 60] as const }].map((c) => [c.id, c] as const))(
    '%s: steps of 1/3000 s and 1/1000 s agree within 1 %, and both end where settle() says',
    (_id, car) => {
      const c = chassis(car);
      const run = (h: number): ChassisSim => {
        const sim = new ChassisSim(c);
        sim.ay = ay;
        for (let i = 0, n = Math.round(0.6 / h); i < n; i++) sim.step(h);
        return sim;
      };
      const a = run(1 / 1000).observe();
      const b = run(1 / 3000).observe();
      near(a.roll, b.roll, 0.01);
      for (let i = 0; i < 4; i++) near(a.fz[i], b.fz[i], 0.01);
      const sim = new ChassisSim(c);
      sim.ay = ay;
      for (let i = 0; i < 4000; i++) sim.step();
      const s = settle(c, ay);
      near(sim.observe().roll, s.roll, 0.005);
      for (let i = 0; i < 4; i++) near(sim.out.fz[i], s.fz[i], 0.005);
    },
  );
});

describe('past what the car can hold', () => {
  it('the scene’s sharp turn, 1 g in 0.3 s, puts none of the layouts over', () => {
    for (const car of LAYOUTS) {
      const sim = new ChassisSim(chassis(car));
      for (let i = 0; i < 2500; i++) {
        sim.ay = G * Math.min(1, sim.t / 0.3);
        sim.step();
      }
      expect(sim.rolledOver).toBe(false);
      expect(Math.abs(sim.out.roll)).toBeLessThan(10 * DEG);
    }
  });

  it('a 1.2 g step tips the hot hatch over: the simulation stops at 20° with a finite state, and reset() stands it up', () => {
    // Its rigid limit t/(2h) is 1.3 g, and the step overshoots: once both inner wheels are up, gravity's moment about
    // the outer patches falls as the body tips while the side force's grows.
    const sim = new ChassisSim(chassis(HOT_HATCH));
    sim.ay = 1.2 * G;
    let both = false;
    for (let i = 0; i < 5000 && !sim.rolledOver; i++) {
      sim.step();
      both ||= sim.out.inAir[0] === 1 && sim.out.inAir[2] === 1;
    }
    expect(sim.rolledOver).toBe(true);
    expect(both).toBe(true);
    const t = sim.t;
    sim.step();
    expect(sim.t).toBe(t);
    const o = sim.observe();
    expect(Math.abs(o.roll)).toBeGreaterThan(ROLLOVER_RAD);
    expect(Math.abs(o.roll)).toBeLessThan(ROLLOVER_RAD + 0.01);
    for (const a of [o.fz, o.travel, o.supportN, o.wheelZ]) for (const x of a) expect(Number.isFinite(x)).toBe(true);
    sim.reset();
    expect(sim.rolledOver).toBe(false);
    expect(sim.observe().roll).toBe(0);
  });
});

describe('camber in roll', () => {
  it('the JTEKT strut turns its camber gain round within the travel; double wishbones never do (acceptance)', () => {
    const strut = chassis({ ...SEDAN, front: 'macpherson' }).axles[0];
    const dw = chassis(SEDAN).axles[0];
    const L = newWheelSample();
    const R = newWheelSample();
    const signs = (ax: typeof strut): Set<number> => {
      const s = new Set<number>();
      for (let q = -ax.spec.travel.droopM; q <= ax.spec.travel.bumpM + 1e-9; q += 0.005) {
        ax.sample(q, q, L, R);
        s.add(Math.sign(L.camberGain));
      }
      return s;
    };
    expect(signs(strut)).toEqual(new Set([-1, 1]));
    expect(signs(dw)).toEqual(new Set([-1]));
  });

  it('on a solid axle the wheels’ camber to the road follows the axle on its tyres, not the body’s roll', () => {
    const c = chassis({ ...SEDAN, rear: 'live-axle', unsprungKg: [45, 60] });
    const sim = new ChassisSim(c);
    const L = newWheelSample();
    const R = newWheelSample();
    c.axles[1].sample(0, 0, L, R);
    const design = L.camber;
    for (const ay of [0.2, 0.5, 0.8].map((g) => g * G)) {
      const s = settle(c, ay, sim);
      expect(Math.abs(s.roll)).toBeGreaterThan(ay / G * 2 * DEG);
      // The axle's own tilt over the road (left side up), from its wheel centres' heights: the wheels lean with it, the
      // left one in and the right one out, whatever the body does.
      const o = sim.out;
      const tilt = (o.wheelZ[2] - o.wheelZ[3]) / (c.corners[2].y - c.corners[3].y);
      expect(Math.abs(tilt)).toBeLessThan(0.3 * Math.abs(s.roll));
      expect(Math.abs(s.camberRoad[2] - (design - tilt))).toBeLessThan(0.01 * DEG);
      expect(Math.abs(s.camberRoad[3] - (design + tilt))).toBeLessThan(0.01 * DEG);
    }
    // An independent rear in the same turn: its outer wheel leans with the body.
    const dw = settle(chassis(SEDAN), 0.8 * G);
    expect(dw.camberRoad[3]).toBeGreaterThan(1 * DEG);
  });
});

describe('anti-roll bar', () => {
  it('twists as G·π·(d⁴ − d_i⁴)/(32·L) and adds K_θ·(mr/arm)²·t² of roll stiffness to its axle (2 %)', () => {
    expect(swayBarTorsionRate(0.022, null, 1)).toBeCloseTo((79e9 * Math.PI * 0.022 ** 4) / 32, 6);
    expect(swayBarTorsionRate(0.025, 0.004, 1)).toBeCloseTo((79e9 * Math.PI * (0.025 ** 4 - 0.017 ** 4)) / 32, 6);
    for (const car of [SEDAN, HOT_HATCH, { ...HOT_HATCH, barsMm: [20, 26] as const }, { ...SEDAN, rear: 'live-axle' as const, unsprungKg: [45, 60] as const }]) {
      const c = chassis(car);
      for (const k of [0, 1] as const) {
        const bar = c.bars[k];
        if (bar.rate === 0) continue;
        const L = newWheelSample();
        const R = newWheelSample();
        c.axles[k].sample(0, 0, L, R);
        // Link rise per unit of differential travel (q_L − q_R): own minus cross.
        const mr = L.mrBar - L.mrBarCross;
        const tW = c.corners[2 * k].y - c.corners[2 * k + 1].y;
        near(axleRollStiffness(c, k).bar, bar.rate * (mr / bar.armM) ** 2 * tW ** 2, 0.02);
      }
    }
  });
});

describe('inertias without a measurement', () => {
  it('the NHTSA regression gives the measured cars back within ±13 % in roll and ±22 % in pitch and yaw', () => {
    expect(GYRATION_RATIOS.roll).toBeGreaterThan(0.38);
    expect(GYRATION_RATIOS.roll).toBeLessThan(0.42);
    for (const r of NHTSA_CARS) {
      const est = estimateInertia(r.weightN / 9.80665, r.wheelbaseM, (r.trackM[0] + r.trackM[1]) / 2);
      near(est.ixx, r.ixx, 0.13);
      near(est.iyy, r.iyy, 0.22);
      near(est.izz, r.izz, 0.22);
    }
  });
});

// ---- Stage P9-core: braking and accelerating ----

/** A sedan on double wishbones whose arms lean `svDeg` in the side view (front, rear): the anti angle of the template. */
function wishboneSedan(svDeg: readonly [number, number], longitudinal: Partial<ChassisLongitudinal> = {}): Chassis {
  const front = doubleWishbone({ ...wishboneDefaults('front'), trackM: 1.52, wheelCentreZM: restWheelCentreZM('street', (1500 * 0.55) / 2), driven: false, svAngleDeg: svDeg[0] });
  const rear = doubleWishbone({ ...wishboneDefaults('rear'), trackM: 1.54, wheelCentreZM: restWheelCentreZM('street', (1500 * 0.45) / 2), driven: true, svAngleDeg: svDeg[1] });
  return buildChassis(chassisOf({
    id: 'wishbone-sedan', massKg: 1500, frontShare: 0.55, cgHeightM: 0.55, wheelbaseM: 2.7, front, rear, frontBar: null, rearBar: null,
    unsprungKg: [45, 45], rideHz: [1.3, 1.45], zeta: 0.25, tyre: 'street', geometry: 'typical', longitudinal,
  }));
}

/**
 * The side-view angles that give `target` % of anti in braking on each axle (antiGeometry), by the secant on each:
 * an axle's anti depends on its own arms only.
 */
function antiAngles(target: readonly [number, number], longitudinal: Partial<ChassisLongitudinal> = {}): [number, number] {
  const sv: [number, number] = [0, 0];
  for (const k of [0, 1] as const) {
    if (target[k] === 0) continue;
    const anti = (deg: number): number => {
      const pair: [number, number] = [0, 0];
      pair[k] = deg;
      return antiGeometry(wishboneSedan(pair, longitudinal)).braking[k];
    };
    let [x0, y0, x1] = [0, anti(0), 10];
    for (let i = 0; i < 10; i++) {
      const y1 = anti(x1);
      if (Math.abs(y1 - target[k]) < 1e-4) break;
      [x0, y0, x1] = [x1, y1, x1 + ((target[k] - y1) * (x1 - x0)) / (y1 - y0)];
    }
    sv[k] = x1;
  }
  return sv;
}

/** Front axle's load gain less what the sprung centre of mass's move over the patches adds (h·θ ahead), N. */
const transferLessShift = (c: Chassis, s: SteadyState): number =>
  s.longitudinalTransfer - (c.sprung.massKg * G * (c.sprung.cgHeightM + s.z) * s.pitch) / c.wheelbaseM;

/**
 * m·a_x·h/L onto the front axle, N, with h the whole car's centre of mass as it stands (a body that sinks in braking
 * lowers it: the hot hatch's 9 mm are 1.6 % of the transfer), and the drag D (N along x, on the body at h_a).
 */
function textbookTransfer(c: Chassis, s: SteadyState, dragN = 0): number {
  const h = (c.sprung.massKg * (c.sprung.cgHeightM + s.z) + c.corners.reduce((a, k, i) => a + k.unsprungKg * s.wheelZ[i], 0)) / c.massKg;
  return (-c.massKg * s.ax * h + c.spec.longitudinal.aeroHeightM * dragN) / c.wheelbaseM;
}

/** The body's pitch over its wheel centres (nose down positive), from the travels, rad. */
const suspensionPitch = (c: Chassis, s: SteadyState): number =>
  ((s.travel[0] + s.travel[1]) / 2 - (s.travel[2] + s.travel[3]) / 2) / (c.corners[0].x - c.corners[2].x);

describe('braking and accelerating: the forces', () => {
  it.each(LAYOUTS.map((c) => [c.id, c] as const))('%s: the tyres make m·a_x less the drag, by the brake balance or the driven axle', (_id, car) => {
    const c = chassis(car);
    const lon = c.spec.longitudinal;
    const sim = new ChassisSim(c);
    for (const [ax, v] of [[-0.6 * G, 0], [0.3 * G, 0], [-0.4 * G, 40], [0, 30]] as const) {
      sim.ax = ax;
      sim.v = v;
      const o = sim.observe();
      expect(o.impossible).toBe(false);
      near(sum(o.fx), c.massKg * ax - o.dragN, 1e-12);
      // Rolling in the patches and drag on the body: the car's road load, none standing.
      if (v) near(-sum(o.rollingN) - o.dragN, roadLoadN(lon.roadLoad, v, 0), 1e-12);
      else expect(sum(o.rollingN) + o.dragN).toBe(0);
      near(-o.dragN, aeroDragN(lon.roadLoad, v), 1e-12);
      const front = o.brakeN[0] + o.brakeN[1] + o.driveN[0] + o.driveN[1];
      const total = sum(o.brakeN) + sum(o.driveN);
      if (total < 0) {
        near(front / total, lon.brakeFront, 1e-12);
        for (const i of [0, 2]) near(o.brakeN[i], o.brakeN[i + 1], 1e-12);
      } else {
        near(front / total, car.drive === 'fwd' ? 1 : 0, 1e-12);
        expect(sum(o.brakeN)).toBe(0);
      }
    }
  });
});

describe('braking and accelerating: the load transfer and the pitch', () => {
  it.each(LAYOUTS.map((c) => [c.id, c] as const))('%s: the front gains m·a_x·h/L less the CG’s shift (1 %), braking and under drive', (_id, car) => {
    const c = chassis(car);
    for (const ax of [-0.8 * G, 0.3 * G]) {
      const s = settleAt(c, { ax });
      expect(s.impossible).toBe(false);
      near(transferLessShift(c, s), textbookTransfer(c, s), 0.01);
      // The nose goes down in braking and up under drive.
      expect(Math.sign(s.pitch)).toBe(-Math.sign(ax));
    }
  });

  it('anti-dive changes the pitch but not the transfer (acceptance)', () => {
    const ax = -0.8 * G;
    const results = [0, 50, 100].map((target) => {
      const sv = antiAngles([target, 0]);
      const c = wishboneSedan(sv);
      expect(Math.abs(antiGeometry(c).braking[0] - target)).toBeLessThan(0.01);
      return { c, s: settleAt(c, { ax }) };
    });
    for (const { c, s } of results) near(transferLessShift(c, s), textbookTransfer(c, s), 0.01);
    expect(results[1].s.pitch).toBeLessThan(results[0].s.pitch - 0.2 * DEG);
    expect(results[2].s.pitch).toBeLessThan(results[1].s.pitch - 0.2 * DEG);
    // 100 % in front: the front springs carry nothing of m·a_x·h/L at design (the table's slopes and the virtual work
    // agree), only what the centre of mass's move adds as the rear, without anti-lift, rises 46 mm and lifts and tips
    // the body: the body still pitches.
    const [none, full] = [results[0].s, results[2].s];
    const frontElastic = (s: SteadyState): number => s.elasticN[0] + s.elasticN[1];
    const atDesign = (-1500 * ax * 0.55) / 2.7;
    near(frontElastic(none), none.longitudinalTransfer, 0.01);
    expect(Math.abs(frontElastic(full) - (full.longitudinalTransfer - atDesign))).toBeLessThan(0.005 * atDesign);
    expect(Math.abs(frontElastic(full))).toBeLessThan(0.06 * atDesign);
    expect(Math.abs(full.travel[0])).toBeLessThan(0.07 * none.travel[0]);
    expect(full.travel[2]).toBeLessThan(-0.04);
    expect(full.pitch).toBeGreaterThan(1 * DEG);
  });

  it('100 % anti on both axles holds the suspension still in braking: pitch over the wheels under 0.02°', () => {
    // A brake balance of 0.6 keeps the rear arms' lean near 30°; at 0.5 g neither axle reaches its tyres' limit (which
    // would move brake force to the other axle and off the balance the anti was set for).
    const lon = { brakeFront: 0.6 };
    const c = wishboneSedan(antiAngles([100, 100], lon), lon);
    const anti = antiGeometry(c);
    near(anti.braking[0], 100, 1e-5);
    near(anti.braking[1], 100, 1e-5);
    // The textbook figure, without the wheels' own inertia, says a tenth more: it would not hold the body.
    expect(anti.textbookBraking[0]).toBeGreaterThan(105);
    const s = settleAt(c, { ax: -0.5 * G });
    expect(s.impossible).toBe(false);
    expect(Math.abs(suspensionPitch(c, s))).toBeLessThan(0.02 * DEG);
    for (const q of s.travel) expect(Math.abs(q)).toBeLessThan(0.0002);
    near(transferLessShift(c, s), textbookTransfer(c, s), 0.01);
    // All of it went through the links: the elastic support barely changed.
    for (const e of s.elasticN) expect(Math.abs(e)).toBeLessThan(5);
    // What pitch is left over the road is the tyres': the front ones squashed by the transfer, the rear ones relieved.
    near(s.pitch - suspensionPitch(c, s), (s.longitudinalTransfer / c.corners[0].tyre.kt) / (c.corners[0].x - c.corners[2].x), 0.02);
  });

  it('without anti the body pitches as the springs and tyres in series say (3 %)', () => {
    const c = wishboneSedan([0, 0]);
    const anti = antiGeometry(c);
    for (const a of [...anti.braking, ...anti.drive]) expect(Math.abs(a)).toBeLessThan(0.5);
    // Each corner's heave rate at design: the spring through its motion ratio, preload through its change.
    const L = newWheelSample();
    const R = newWheelSample();
    const rate = (k: 0 | 1): number => {
      const corner = c.corners[2 * k];
      const support = (q: number): number => {
        c.axles[k].sample(q, q, L, R);
        return coilForce(corner.spring.rate, corner.spring.freeM, L.springLen, corner.spring.rate2, corner.spring.fromM) * L.mrSpring;
      };
      return (support(1e-4) - support(-1e-4)) / 2e-4;
    };
    const compliance = (k: 0 | 1): number => 1 / (2 * rate(k)) + 1 / (2 * c.corners[2 * k].tyre.kt);
    for (const ax of [-0.3 * G, 0.3 * G]) {
      const s = settleAt(c, { ax });
      const span = c.corners[0].x - c.corners[2].x;
      near(s.pitch, (s.longitudinalTransfer * (compliance(0) + compliance(1))) / span, 0.03);
    }
  });

  it('inboard brakes react through the wheel centre: a semi-trailing arm loses its anti-lift', () => {
    // The semi-trailing arm's knuckle point at the patch swings about the arm's axis, far ahead (tanθ_KP −0.6); its
    // wheel centre barely moves along the car. Brakes on the differential put the torque into the body instead.
    const car = { ...SEDAN, id: 'sedan-semi-trailing', rear: 'semi-trailing' } as const;
    const outboard = chassis(car);
    const inboard = buildChassis(typicalChassis({ ...car, longitudinal: { brakeInboard: [false, true] } }));
    const [a, b] = [antiGeometry(outboard), antiGeometry(inboard)];
    expect(a.braking[1]).toBeGreaterThan(60);
    expect(Math.abs(b.braking[1])).toBeLessThan(a.braking[1] - 50);
    near(b.braking[0], a.braking[0], 1e-12);
    const ax = -0.8 * G;
    const [sa, sb] = [settleAt(outboard, { ax }), settleAt(inboard, { ax })];
    near(transferLessShift(outboard, sa), textbookTransfer(outboard, sa), 0.01);
    near(transferLessShift(inboard, sb), textbookTransfer(inboard, sb), 0.01);
    // The rear rises more without the anti-lift.
    expect(sb.travel[2]).toBeLessThan(sa.travel[2] - 0.01);
    expect(sb.pitch).toBeGreaterThan(sa.pitch + 0.3 * DEG);
  });

  it('drag acts on the body at its own height: it pitches the body, but the links carry only what the tyres push', () => {
    // A drag centre well above the CG (0.9 m, a van's), so its own moment shows. The road load is drag alone.
    const base = wishboneSedan(antiAngles([100, 100], { brakeFront: 0.6 }), { brakeFront: 0.6 });
    const spec = { ...base.spec, longitudinal: { ...base.spec.longitudinal, aeroHeightM: 0.9, roadLoad: { a: 0, b: 0, c: 0.42, aeroC: 0.42, massKg: 1500 } } };
    const c = buildChassis(spec);
    const v = 210 / 3.6;
    // The same tyre forces twice: braking at 0.5 g standing, and at 210 km/h with the drag's 1.4 kN on top.
    const still = settleAt(c, { ax: -0.5 * G });
    const sim = new ChassisSim(c);
    sim.v = v;
    const drag = sim.observe().dragN;
    near(-drag, 1428, 0.01);
    const fast = settleAt(c, { ax: -0.5 * G + drag / c.massKg, v }, sim);
    for (let i = 0; i < 4; i++) near(fast.fx[i], still.fx[i], 1e-9);
    // The links carry the same (but for the 2–3 % their slopes change over the 2.5 mm of travel the drag's pitch puts
    // in); the springs take the drag's moment about the CG, so the body pitches nose up over its wheels, and the transfer
    // follows the drag's own height.
    for (let i = 0; i < 4; i++) near(fast.antiN[i], still.antiN[i], 0.04);
    expect(Math.abs(suspensionPitch(c, still))).toBeLessThan(0.02 * DEG);
    expect(suspensionPitch(c, fast)).toBeLessThan(-0.05 * DEG);
    near(transferLessShift(c, fast), textbookTransfer(c, fast, drag), 0.01);
    near(transferLessShift(c, still), textbookTransfer(c, still), 0.01);
  });

  it('a braking step: steps of 1/3000 s and 1/1000 s agree within 1 %, and both end where settleAt() says', () => {
    const c = chassis(SEDAN);
    const ax = -0.8 * G;
    const run = (h: number): ChassisSim => {
      const sim = new ChassisSim(c);
      sim.ax = ax;
      for (let i = 0, n = Math.round(0.6 / h); i < n; i++) sim.step(h);
      return sim;
    };
    const a = run(1 / 1000).observe();
    const b = run(1 / 3000).observe();
    near(a.pitch, b.pitch, 0.01);
    for (let i = 0; i < 4; i++) near(a.fz[i], b.fz[i], 0.01);
    const sim = new ChassisSim(c);
    sim.ax = ax;
    for (let i = 0; i < 4000; i++) sim.step();
    const s = settleAt(c, { ax });
    near(sim.observe().pitch, s.pitch, 0.005);
    for (let i = 0; i < 4; i++) near(sim.out.fz[i], s.fz[i], 0.005);
  });
});

describe('braking and accelerating: the wheel’s limit', () => {
  const total = (o: { fx: Float64Array }): number => sum(o.fx);

  it('a wheel on wet ice passes its excess to the other wheel of its axle; the sum stays exact', () => {
    const c = chassis(SEDAN);
    const sim = new ChassisSim(c);
    sim.surfaceMu[0] = 0.5;
    const ax = -0.5 * G;
    const s = settleAt(c, { ax }, sim);
    const o = sim.out;
    expect(s.impossible).toBe(false);
    near(total(o), c.massKg * ax, 1e-12);
    expect(Array.from(o.atLimit)).toEqual([1, 0, 0, 0]);
    near(-o.fx[0], o.limitXN[0], 1e-9);
    // The front axle still brakes its share: the right wheel took the rest.
    near(o.fx[0] + o.fx[1], c.spec.longitudinal.brakeFront * c.massKg * ax, 1e-9);
    expect(o.fx[1]).toBeLessThan(1.05 * o.fx[0]);
    // Harder, the right wheel reaches its limit too and the rear takes what is left.
    const t = settleAt(c, { ax: -0.75 * G }, sim);
    expect(t.impossible).toBe(false);
    near(total(sim.out), c.massKg * -0.75 * G, 1e-12);
    expect(sim.out.atLimit[0] && sim.out.atLimit[1]).toBe(1);
    expect((sim.out.fx[2] + sim.out.fx[3]) / total(sim.out)).toBeGreaterThan(1 - c.spec.longitudinal.brakeFront + 0.01);
  });

  it('a front axle on ice passes the excess to the rear axle, as far as the rear can take it', () => {
    const c = chassis(SEDAN);
    const sim = new ChassisSim(c);
    sim.surfaceMu.set([0.3, 0.3, 1, 1]);
    const s = settleAt(c, { ax: -0.5 * G }, sim);
    const o = sim.out;
    expect(s.impossible).toBe(false);
    near(total(o), c.massKg * -0.5 * G, 1e-12);
    expect(o.atLimit[0] && o.atLimit[1]).toBe(1);
    expect(o.atLimit[2] || o.atLimit[3]).toBe(0);
    // The rear brakes more than its share of 0.3.
    expect((o.fx[2] + o.fx[3]) / total(o)).toBeGreaterThan(0.5);
  });

  it('past every wheel’s limit the sample is impossible: forces at the limits, the shortfall written down (1 N)', () => {
    const c = chassis(SEDAN);
    const sim = new ChassisSim(c);
    const s = settleAt(c, { ax: -1.4 * G }, sim);
    const o = sim.out;
    expect(s.impossible).toBe(true);
    for (let i = 0; i < 4; i++) {
      expect(o.atLimit[i]).toBe(1);
      near(-o.fx[i], o.limitXN[i], 1e-9);
    }
    expect(Math.abs(c.massKg * 1.4 * G - -total(o) - o.shortfallXN)).toBeLessThan(1);
    expect(o.shortfallXN).toBeGreaterThan(1000);
    // Without the limit the tyres would make it all.
    sim.gripLimit = false;
    sim.observe();
    near(total(sim.out), c.massKg * -1.4 * G, 1e-12);
    expect(sim.out.impossible).toBe(false);
  });

  it('drive goes only to driven wheels: a front-drive car with a wheel on ice is short, not pushed by its rear', () => {
    const c = chassis(HOT_HATCH);
    const sim = new ChassisSim(c);
    sim.surfaceMu.set([0.1, 0.1, 1, 1]);
    sim.ax = 0.3 * G;
    const o = sim.observe();
    expect(o.impossible).toBe(true);
    expect(o.fx[2]).toBe(0);
    expect(o.fx[3]).toBe(0);
    near(o.fx[0] + o.fx[1] + o.shortfallXN, c.massKg * 0.3 * G, 1e-9);
    // Braking the same car on the same ice, the rear helps.
    sim.ax = -0.3 * G;
    const b = sim.observe();
    expect(b.impossible).toBe(false);
    expect(b.fx[2]).toBeLessThan(-0.15 * c.massKg * 0.3 * G);
  });

  it('marks a wheel past its side peak and an axle that cannot make its side force, but keeps the side force', () => {
    const c = chassis(SEDAN);
    const sim = new ChassisSim(c);
    sim.surfaceMu.set([0.5, 0.5, 0.5, 0.5]);
    sim.ay = 0.8 * G;
    const o = sim.observe();
    expect(o.impossible).toBe(true);
    expect(o.shortfallYN).toBeGreaterThan(0);
    near(sum(o.fy), c.massKg * 0.8 * G, 1e-12);
  });
});

describe('the propshaft’s reaction', () => {
  /** A rear-drive car on a live axle with Watt's linkage, no bars; rigid tyres when asked. */
  function liveAxleCar(rigid: boolean): Chassis {
    const z = (share: number): number => (rigid ? tyreVertical('street').freeRadiusM : restWheelCentreZM('street', (1500 * share) / 2));
    const c = buildChassis(chassisOf({
      id: 'live-axle-sedan', massKg: 1500, frontShare: 0.55, cgHeightM: 0.55, wheelbaseM: 2.7,
      front: typicalFront('double-wishbone', 1.52, z(0.55), false), rear: solidAxle({ ...SOLID_TYPICAL.watt, trackM: 1.54, wheelCentreZM: z(0.45), driven: true }),
      frontBar: null, rearBar: null, unsprungKg: [45, 60], rideHz: [1.3, 1.4], zeta: 0.25, tyre: 'street', geometry: 'typical',
    }));
    if (rigid) {
      for (const k of c.corners) {
        k.tyre.kt *= 1e4;
        k.restWheelZM = k.tyre.freeRadiusM - k.staticN / k.tyre.kt;
      }
    }
    return c;
  }

  it('live axle under throttle: the body rolls with the shaft’s torque, the axle against it, the right rear unloads (acceptance)', () => {
    // With rigid tyres the axle cannot roll, so the body takes T against both axles' roll stiffness and the pendulum
    // P = m_s·g·h′: φ = T/(ΣK_φ − P). The rear springs hand K_φr·φ of it back to the axle, which the pinion turns the other
    // way with T, so the right rear unloads by (T − K_φr·φ)/t_r = (K_φf − P)/(ΣK_φ − P)·T/t_r: the plan's
    // (K_φf/ΣK_φ)·T/t_r with the pendulum. Linear, so at a gentle 0.05 g; harder, the squat moves the roll centres.
    const c = liveAxleCar(true);
    const sim = new ChassisSim(c);
    const s = settleAt(c, { ax: 0.05 * G }, sim);
    const T = sim.out.propNm;
    near(T, ((sim.out.driveN[2] + sim.out.driveN[3]) * c.corners[2].tyre.freeRadiusM) / c.spec.longitudinal.finalDrive, 1e-12);
    expect(T).toBeGreaterThan(0);
    const K = [axleRollStiffness(c, 0).total, axleRollStiffness(c, 1).total];
    const P = c.sprung.massKg * G * rollModel(c).hPrimeM;
    near(s.roll, T / (K[0] + K[1] - P), 0.03);
    near((s.fz[2] - s.fz[3]) / 2, ((K[0] - P) / (K[0] + K[1] - P)) * (T / c.tracks[1]), 0.03);
    expect(s.fz[1]).toBeGreaterThan(s.fz[0]);
    // On real tyres, harder: the axle itself tips its left side down.
    const soft = liveAxleCar(false);
    const sim2 = new ChassisSim(soft);
    const t = settleAt(soft, { ax: 0.4 * G }, sim2);
    expect(t.roll).toBeGreaterThan(0.5 * DEG);
    expect(t.fz[3]).toBeLessThan(t.fz[2] - 300);
    expect(t.fz[1]).toBeGreaterThan(t.fz[0] + 300);
    expect(sim2.out.wheelZ[2]).toBeLessThan(sim2.out.wheelZ[3]);
  });

  it.each(['double-wishbone', 'multilink', 'semi-trailing'] as const)('independent rear (%s), differential on the body: nothing from the shaft, full throttle', (rear) => {
    const c = chassis({ ...SEDAN, id: `sedan-${rear}`, rear });
    const sim = new ChassisSim(c);
    const s = settleAt(c, { ax: 0.5 * G }, sim);
    expect(sim.out.propNm).toBe(0);
    expect(Math.abs(s.fz[3] - s.fz[2])).toBeLessThan(1);
    expect(Math.abs(s.roll)).toBeLessThan(1e-9);
  });
});
