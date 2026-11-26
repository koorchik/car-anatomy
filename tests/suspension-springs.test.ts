// Stage P14-core (suspensions plan, stage 14 tests): the laws of the air spring and the hydropneumatic strut, skyhook on
// the shaker, the pushrod's rocker against finite differences, and the third spring in heave and roll.

import { describe, expect, it } from 'vitest';
import {
  GAS_POLYTROPIC_N, gasSpringFor, gasSpringForce, gasSpringRate, levelGasSpring, P_ATM_PA,
} from '../src/suspension/forces.ts';
import { frequencyAtLoad, springUnderLoad } from '../src/suspension/spring-types.ts';
import { jtektCorner } from '../src/suspension/templates/macpherson.ts';
import { factorySetup, resolveCorner } from '../src/suspension/setup.ts';
import { SteppedSine } from '../src/suspension/shaker.ts';
import { invariantPoints, lineariseQuarter, newQuarterGains, quarterGains, quarterModes } from '../src/suspension/evaluate.ts';
import { controlledLinear, controllerFor } from '../src/suspension/damper-control.ts';
import { QuarterSim } from '../src/suspension/quarter.ts';
import { pushrod, pushrodDefaults, pushrodRocker } from '../src/suspension/templates/pushrod.ts';
import { doubleWishbone } from '../src/suspension/templates/double-wishbone.ts';
import { Axle, newCornerSample } from '../src/suspension/kinematics.ts';
import { Rocker, thirdSpringLength } from '../src/suspension/rocker.ts';
import { buildChassis } from '../src/suspension/chassis.ts';
import { axleRollStiffness } from '../src/suspension/statics.ts';
import { evaluateChassis } from '../src/suspension/evaluate-chassis.ts';
import { DEFAULT_CHASSIS } from '../src/suspension-designer/defaults.ts';
import { editChassis } from '../src/suspension-designer/edit.ts';
import { chassisToSpec } from '../src/suspension-designer/to-spec.ts';

/** Exponent b of f ∝ m^b between two masses. */
const exponent = (f1: number, f2: number, m1: number, m2: number): number => Math.log(f2 / f1) / Math.log(m2 / m1);

describe('gas springs', () => {
  it('carry their static load at design with the rate asked for, k = n·p·A²/V', () => {
    for (const kind of ['air', 'hydro'] as const) {
      const g = gasSpringFor(kind, 4000, 60000, 0.3);
      expect(gasSpringForce(g, 0.3)).toBeCloseTo(4000, 6);
      const h = 1e-6;
      const fd = (gasSpringForce(g, 0.3 - h) - gasSpringForce(g, 0.3 + h)) / (2 * h);
      expect(fd / 60000).toBeCloseTo(1, 5);
      expect(gasSpringRate(g, 0.3)).toBeCloseTo(60000, 3);
      // Stiffer in bump, softer in droop: the gas law is progressive.
      expect(gasSpringRate(g, 0.27)).toBeGreaterThan(gasSpringRate(g, 0.3));
      expect(gasSpringRate(g, 0.33)).toBeLessThan(gasSpringRate(g, 0.3));
    }
  });

  it('levelling keeps the air volume but not the nitrogen\'s', () => {
    const air = gasSpringFor('air', 4000, 60000, 0.3);
    const hydro = gasSpringFor('hydro', 4000, 60000, 0.3);
    expect(levelGasSpring(air, 6000).volumeM3).toBe(air.volumeM3);
    const h2 = levelGasSpring(hydro, 6000);
    // p·V^n is the same gas.
    expect(h2.pressurePa * h2.volumeM3 ** GAS_POLYTROPIC_N).toBeCloseTo(hydro.pressurePa * hydro.volumeM3 ** GAS_POLYTROPIC_N, 6);
    expect(gasSpringForce(levelGasSpring(air, 6000), 0.3)).toBeCloseTo(6000, 6);
    expect(gasSpringForce(h2, 0.3)).toBeCloseTo(6000, 6);
    expect(levelGasSpring(air, 6000).pressurePa).toBeCloseTo(6000 / air.areaM2 + P_ATM_PA, 3);
  });

  it('frequency from load: steel falls as m^−0.5, the levelled air spring stays nearly where it was, hydropneumatics rises as m^0.36', () => {
    const f = (type: 'coil' | 'air' | 'hydro', kg: number): number => frequencyAtLoad(type, true, 300, 1.2, kg);
    expect(exponent(f('coil', 200), f('coil', 600), 200, 600)).toBeCloseTo(-0.5, 6);
    // Levelled air: within 6 % over 200–600 kg on a corner built for 300 kg (steel moves by 42 %).
    const air = [200, 300, 400, 500, 600].map((kg) => f('air', kg));
    expect(Math.max(...air) / Math.min(...air)).toBeLessThan(1.1);
    expect(Math.abs(air[0] - 1.2) / 1.2).toBeLessThan(0.06);
    expect(Math.abs(air[4] - 1.2) / 1.2).toBeLessThan(0.06);
    // Hydropneumatic: 1/(2n) = 0.362 in the limit p ≫ p_atm; within 5 %.
    const b = exponent(f('hydro', 300), f('hydro', 600), 300, 600);
    expect(Math.abs(b - 0.36) / 0.36).toBeLessThan(0.05);
  });

  it('without levelling a gas spring sinks under the load, a levelled one does not', () => {
    const s = { type: 'air' as const, staticN: 3000, rateNm: 50000, lenM: 0.3, levelled: false };
    const sunk = springUnderLoad(s, 4500);
    expect(sunk.sagM).toBeGreaterThan(0);
    // It sinks less than a coil of the same rate would, since it stiffens as it goes.
    expect(sunk.sagM).toBeLessThan(1500 / 50000);
    expect(springUnderLoad({ ...s, levelled: true }, 4500).sagM).toBe(0);
  });
});

describe('controlled dampers on the shaker', () => {
  const corner = jtektCorner();
  const rc = resolveCorner(corner, factorySetup(corner));
  const lin = lineariseQuarter(rc);
  const inv = invariantPoints(lin);
  const freqs = [rc.bodyHz, inv.bodyHz];
  const run = (kind: 'passive' | 'magneride' | 'active') => new SteppedSine(rc, { freqsHz: freqs, velocityMs: 0.05, damperKind: kind }).run();
  const passive = run('passive');
  const skyhook = run('magneride');
  const active = run('active');

  it('skyhook calms the body at its resonance but cannot at the wheel-hop frequency, and leaves the wheel hopping', () => {
    expect(skyhook[0].bodyAcc).toBeLessThan(0.9 * passive[0].bodyAcc);
    // The invariant point: any force between body and wheel leaves the body there (c_t moves it by a few per cent).
    expect(Math.abs(skyhook[1].bodyAcc / passive[1].bodyAcc - 1)).toBeLessThan(0.07);
    expect(Math.abs(active[1].bodyAcc / passive[1].bodyAcc - 1)).toBeLessThan(0.07);
    // With only its softest setting on the wheel, the tyre force at hop grows.
    expect(skyhook[1].tyreForce).toBeGreaterThan(1.5 * passive[1].tyreForce);
  });

  it('the active damper calms the body at its resonance, and the linear skyhook with the actuator lag agrees with the run', () => {
    expect(active[0].bodyAcc).toBeLessThan(0.6 * passive[0].bodyAcc);
    const g = newQuarterGains();
    for (const [i, hz] of freqs.entries()) {
      expect(Math.abs(quarterGains(controlledLinear(lin, 'active'), hz, g).bodyAcc / active[i].bodyAcc - 1)).toBeLessThan(0.05);
      expect(Math.abs(quarterGains(lin, hz, g).bodyAcc / passive[i].bodyAcc - 1)).toBeLessThan(0.02);
    }
    // The ideal skyhook damps the body mode harder than the passive damper does.
    expect(quarterModes(controlledLinear(lin, 'magneride')).body.zeta).toBeGreaterThan(quarterModes(lin).body.zeta);
  });

  it('a camera lets the active damper meet a bump: less body motion over a step', () => {
    // A 30 mm smoothed step at 15 m/s: the actuator's lag costs it the step without the preview.
    const road = { heightAt: (x: number) => 0.03 / (1 + Math.exp(-(x - 10) / 0.5)), slopeAt: () => 0 };
    const peak = (preview: number): number => {
      const sim = new QuarterSim(rc, road, 15);
      sim.control = controllerFor('active', rc);
      sim.control.previewM = preview;
      sim.reset(0);
      let worst = 0;
      for (let i = 0; i < 2000; i++) {
        sim.step();
        worst = Math.max(worst, Math.abs(sim.out.bodyAcc));
      }
      return worst;
    };
    expect(peak(15)).toBeLessThan(0.8 * peak(0));
  });
});

describe('pushrod and rocker', () => {
  const it0 = pushrodDefaults('front');
  const spec = pushrod({ ...it0, thirdWheelRateNm: 30000 });
  const axle = new Axle(spec);
  const s = newCornerSample();

  it('the rocker closes at design and the rod keeps its length', () => {
    const { rocker, rodOuter } = pushrodRocker(doubleWishbone(it0), it0);
    const r = new Rocker(rocker, rodOuter);
    expect(r.solveAngle(rodOuter)).toBeCloseTo(0, 12);
    const P: [number, number, number] = [rodOuter[0], rodOuter[1] - 0.01, rodOuter[2] + 0.03];
    const theta = r.solveAngle(P);
    const R = [0, 0, 0];
    r.rodEndAt(theta, R);
    expect(Math.hypot(R[0] - P[0], R[1] - P[1], R[2] - P[2])).toBeCloseTo(r.rodLengthM, 12);
  });

  it('the motion ratio is the finite difference of the spring length, and it changes over the travel', () => {
    const mrs: number[] = [];
    const travels: number[] = [];
    const h = 1e-5;
    for (let q = -0.09; q <= 0.1 + 1e-9; q += 0.019) {
      travels.push(q);
      axle.measureAt(q, s);
      const mr = s.mrSpring;
      const mrD = s.mrDamper;
      axle.measureAt(q + h, s);
      const up = [s.springLen, s.damperLen];
      axle.measureAt(q - h, s);
      const down = [s.springLen, s.damperLen];
      expect(Math.abs(mr - (down[0] - up[0]) / (2 * h))).toBeLessThan(1e-7);
      expect(Math.abs(mrD - (down[1] - up[1]) / (2 * h))).toBeLessThan(1e-7);
      mrs.push(mr);
    }
    // Rising rate: the rocker set short of square gives more spring travel per wheel travel in bump, up to the bump
    // stop (80 mm); past it the rocker turns over square and the rise levels off.
    expect(mrs.at(-1)! / mrs[0]).toBeGreaterThan(1.15);
    for (let i = 1; i < mrs.length && travels[i] <= 0.08; i++) expect(mrs[i]).toBeGreaterThan(mrs[i - 1]);
  });

  it('the third spring is squeezed in heave and barely moves in roll', () => {
    const rocker = new Rocker(spec.spring.rocker!, spec.spring.wheel as [number, number, number]);
    const point = spec.thirdSpring!.rockerPoint;
    const body = spec.spring.body;
    // The rocker's angle at a travel, from the spring's length there (monotonic in the angle near design).
    const angleAt = (q: number): number => {
      axle.measureAt(q, s);
      const want = s.springLen;
      const E = [0, 0, 0];
      const lenAt = (t: number): number => {
        rocker.elementEndAt(t, E);
        return Math.hypot(E[0] - body[0], E[1] - body[1], E[2] - body[2]);
      };
      let lo = -1;
      let hi = 1;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        // The spring shortens as the rocker turns up.
        if (lenAt(mid) > want) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const len = (qL: number, qR: number): number => thirdSpringLength(rocker, point, angleAt(qL), angleAt(qR));
    const L0 = len(0, 0);
    const heave = L0 - len(0.02, 0.02);
    const roll = L0 - len(0.02, -0.02);
    expect(heave).toBeGreaterThan(0.005);
    // In roll the change is of second order (the rockers' angles cancel to first order): a tenth of heave's at ±20 mm,
    // a quarter of that at ±10 mm.
    expect(Math.abs(roll)).toBeLessThan(0.1 * heave);
    expect(Math.abs(L0 - len(0.01, -0.01))).toBeLessThan(0.3 * Math.abs(roll));
  });
});

describe('the chassis with the new elements', () => {
  const base = editChassis(DEFAULT_CHASSIS, { drive: 'rwd' });
  const push = editChassis(base, { layoutF: 'pushrod', layoutR: 'pushrod' });

  it('a third spring adds heave stiffness, not roll stiffness', () => {
    const without = buildChassis(chassisToSpec(push));
    const withThird = buildChassis(chassisToSpec(editChassis(push, { thirdSpringNmmF: 40, thirdSpringNmmR: 40 })));
    for (const k of [0, 1] as const) {
      // 40 N/mm at each wheel in heave.
      expect(2 * withThird.thirdRates[k]).toBeCloseTo(40000, 3);
      expect(axleRollStiffness(withThird, k).total).toBeCloseTo(axleRollStiffness(without, k).total, 3);
    }
    const a = evaluateChassis(chassisToSpec(push));
    const b = evaluateChassis(chassisToSpec(editChassis(push, { thirdSpringNmmF: 40, thirdSpringNmmR: 40 })));
    expect(b.axles[0].rideHz).toBeGreaterThan(1.05 * a.axles[0].rideHz);
    expect(b.rollPerG).toBeCloseTo(a.rollPerG, 6);
  });

  it('a gas spring has the coil\'s rate at design and its own law laden', () => {
    const coil = evaluateChassis(chassisToSpec(base));
    const air = evaluateChassis(chassisToSpec(editChassis(base, { springKindF: 'air', springKindR: 'air' })));
    const hydro = evaluateChassis(chassisToSpec(editChassis(base, { springKindF: 'hydro', springKindR: 'hydro' })));
    for (const k of [0, 1] as const) {
      expect(air.axles[k].rideHz).toBeCloseTo(coil.axles[k].rideHz, 6);
      expect(coil.axles[k].laden.sagM).toBeGreaterThan(0.005);
      expect(air.axles[k].laden.sagM).toBe(0);
      expect(coil.axles[k].laden.rideHz).toBeLessThan(coil.axles[k].rideHz);
      expect(hydro.axles[k].laden.rideHz).toBeGreaterThan(hydro.axles[k].rideHz);
      expect(Math.abs(air.axles[k].laden.rideHz / air.axles[k].rideHz - 1)).toBeLessThan(0.03);
    }
  });

  it('active dampers hold the body level; MagneRide and adaptive ones ride better than passive', () => {
    const passive = evaluateChassis(chassisToSpec(base));
    const active = evaluateChassis(chassisToSpec(editChassis(base, { dampers: 'active' })));
    const magne = evaluateChassis(chassisToSpec(editChassis(base, { dampers: 'magneride' })));
    const adaptive = evaluateChassis(chassisToSpec(editChassis(base, { dampers: 'adaptive' })));
    expect(active.levelled).toBe(true);
    expect(active.rollPerG).toBeLessThan(0.25 * passive.rollPerG);
    expect(active.pitchPerG).toBeLessThan(0.5 * passive.pitchPerG);
    // The load transfer stays where the springs and bars put it.
    expect(active.frontTransferShare).toBeCloseTo(passive.frontTransferShare, 9);
    expect(magne.comfortAw).toBeLessThan(passive.comfortAw);
    expect(adaptive.comfortAw).toBeLessThanOrEqual(passive.comfortAw);
    expect(adaptive.roughGrip).toBeGreaterThanOrEqual(passive.roughGrip);
  });
});
