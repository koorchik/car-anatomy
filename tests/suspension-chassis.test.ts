// The car as a body on four wheels in the prescribed mode (chassis-sim.ts) and its steady cornering (statics.ts): the
// lateral part of the suspensions plan's tests and the laws of stage 7's acceptance.

import { describe, expect, it } from 'vitest';
import { buildChassis, type Chassis } from '../src/suspension/chassis.ts';
import { ChassisSim, ROLLOVER_RAD } from '../src/suspension/chassis-sim.ts';
import { newWheelSample, type WheelSample } from '../src/suspension/chassis-axle.ts';
import { TwistBeamAxle, newBeamSample } from '../src/suspension/beam-kinematics.ts';
import { SolidAxle, newSolidSample } from '../src/suspension/solid-kinematics.ts';
import {
  axleRollStiffness, liftOff, millikenTransfer, rollModel, settle, understeerGradient,
} from '../src/suspension/statics.ts';
import {
  chassisOf, restWheelCentreZM, typicalChassis, typicalFront, typicalRear, type TypicalCar,
} from '../src/suspension/templates/typical-chassis.ts';
import { swayBarTorsionRate, G } from '../src/suspension/forces.ts';
import { QuarterSim } from '../src/suspension/quarter.ts';
import { factorySetup, resolveCorner } from '../src/suspension/setup.ts';
import { EventRoad, RoadBuffer } from '../src/suspension/road.ts';
import { estimateInertia, GYRATION_RATIOS, NHTSA_CARS } from '../src/vehicle/body-estimate.ts';
import { tyreVertical } from '../src/vehicle/tyre-data.ts';
import type { AxleSpec, ChassisSpec, CornerLinkage, SolidAxleLinkage, TwistBeamLinkage } from '../src/suspension/spec.ts';

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
