// Synchroniser formulas in closed form against the worked examples of research §4.2. Every expected number below is
// the research's own, recomputed by hand where it says so.
import { describe, expect, it } from 'vitest';
import { ESTIMATED_SYNCHRO } from '../src/drivetrain/elements.ts';
import type { SynchroDef } from '../src/drivetrain/spec.ts';
import {
  CONE_TEST_LIMITS, SHIFT_FORCE_N, type SyncCase, blockingMargin, blocks, coneArea, coneTorque, coneTorquePerN, coneSlip, crunchHz, indexTorque,
  inputSpeedChange, perConeArea, selfLocking, syncEnergy, syncPeakPower, syncTime,
} from '../src/drivetrain/synchro-math.ts';

/** The research example: μ_C 0.10, R_C 35 mm, α 6.5°, R_I 40 mm, μ_I 0.06, a 35 × 8 mm cone. */
const ring = (chamfer: number, cones: 1 | 2 | 3 = 1): SynchroDef => ({ ...ESTIMATED_SYNCHRO, cones, chamfer });
const DEG = Math.PI / 180;

describe('blocking inequality (research §4.2)', () => {
  it('the cone side is 0.773·R_I, the index side 0.74·R_I at 50° and 0.50·R_I at 60°', () => {
    const def = ring(50);
    const rI = def.chamferRadius / 1000;
    expect(coneTorquePerN(def) / rI).toBeCloseTo(0.773, 3);
    expect(indexTorque(def, 1) / rI).toBeCloseTo(0.742, 3);
    expect(indexTorque(ring(60), 1) / rI).toBeCloseTo(0.5, 2);
  });

  it('a 100° roof (γ 50°) sits on the edge and still blocks, 120° blocks with a margin, 80° does not', () => {
    // With μ_C 0.10 the 100° roof keeps 4 %; with the 0.09 of the Chalmers thesis it would not block (stage K4).
    expect(blockingMargin(ring(50))).toBeGreaterThan(1);
    expect(blockingMargin(ring(50))).toBeLessThan(1.05);
    expect(blockingMargin({ ...ring(50), muCone: 0.09 })).toBeLessThan(1);
    expect(blockingMargin(ring(60))).toBeCloseTo(1.55, 2);
    expect(blocks(ring(60))).toBe(true);
    expect(blocks(ring(40))).toBe(false);
  });

  it('the sleeve force cancels: pushing three times harder never unblocks the ring early', () => {
    const def = ring(60);
    for (const force of [SHIFT_FORCE_N.normal, SHIFT_FORCE_N.hard, 3 * SHIFT_FORCE_N.hard]) {
      expect(coneTorque(def, force) / indexTorque(def, force)).toBeCloseTo(blockingMargin(def), 12);
    }
  });

  it('the ring sticks on the cone once μ_C > tan α', () => {
    expect(selfLocking(ring(60))).toBe(false); // tan 6.5° = 0.114 > 0.10
    expect(selfLocking({ ...ring(60), coneHalfAngle: 5 })).toBe(true); // tan 5° = 0.087
    expect(Math.tan(6.5 * DEG)).toBeGreaterThan(ESTIMATED_SYNCHRO.muCone);
  });
});

describe('synchronising time, work and power (research §4.2: 2→3 at 6000 rpm)', () => {
  const i2 = 2.05;
  const i3 = 1.3;
  const omegaIn = (6000 * Math.PI) / 30;
  const dw = inputSpeedChange(omegaIn / i2, i2, i3);
  const single = ring(60);
  const triple = ring(60, 3);
  const at = (def: SynchroDef, dragNm: number, direction: 'up' | 'down'): SyncCase => ({
    inputInertia: 0.01, inputSpeedChange: dw, ratio: i3, coneNm: coneTorque(def, SHIFT_FORCE_N.normal), dragNm, direction,
  });

  it('Δω_in = 230 rad/s, a single cone gives 18.6 N·m and t ≈ 0.15 s', () => {
    expect(dw).toBeCloseTo(230, 0);
    expect(coneTorque(single, SHIFT_FORCE_N.normal)).toBeCloseTo(18.6, 1);
    expect(syncTime(at(single, 1, 'up'))).toBeCloseTo(0.15, 2);
  });

  it('three cones give about 2.6 times the torque and t ≈ 0.06 s', () => {
    expect(coneTorque(triple, 600) / coneTorque(single, 600)).toBeCloseTo(2.6, 1);
    expect(syncTime(at(triple, 1, 'up'))).toBeCloseTo(0.06, 2);
  });

  it('t = J·Δω·i/(T_C ± i·T_drag): drag helps an upshift, hinders a downshift, and can stop it', () => {
    const c = at(single, 1, 'up');
    expect(syncTime(c)).toBeCloseTo((c.inputInertia * c.inputSpeedChange * c.ratio) / (c.coneNm + c.ratio * c.dragNm), 12);
    expect(syncTime(at(single, 1, 'down'))).toBeGreaterThan(syncTime(at(single, 1, 'up')));
    expect(syncTime(at(single, 0, 'down'))).toBeCloseTo(syncTime(at(single, 0, 'up')), 12);
    expect(syncTime(at(single, 20, 'down'))).toBe(Number.POSITIVE_INFINITY);
  });

  it('without drag the cone turns ½·J·Δω² = 265 J into heat, 0.15 J/mm² on a 35 × 8 mm cone of 1760 mm²', () => {
    const c = at(single, 0, 'up');
    expect(syncEnergy(c)).toBeCloseTo(0.5 * 0.01 * dw * dw, 9);
    expect(syncEnergy(c)).toBeCloseTo(265, -1);
    expect(coneArea(single)).toBeCloseTo(1760, -1);
    expect(perConeArea(single, c).energyJPerMm2).toBeCloseTo(0.15, 2);
    expect(perConeArea(single, c).energyJPerMm2).toBeLessThan(CONE_TEST_LIMITS.energyJPerMm2);
  });

  it('peak power is the cone torque times the slip across the cone, Δω_in/i, which falls linearly: 2E/t', () => {
    // Research §4.2 quotes 4.3 kW and 2.4 W/mm², which is T_C·Δω_in: the speed change at the input shaft. The cone
    // itself slips between the loose gear (ω_in/i) and the hub (ω_out), at Δω_in/i at the start, so the peak is
    // 3.3 kW and 1.9 W/mm². The energy, ½·J·Δω², is the same either way.
    const c = at(single, 0, 'up');
    expect(coneSlip(c)).toBeCloseTo(dw / i3, 9);
    expect(syncPeakPower(c)).toBeCloseTo((2 * syncEnergy(c)) / syncTime(c), 6);
    expect(syncPeakPower(c) / 1000).toBeCloseTo(3.3, 1);
    expect(perConeArea(single, c).powerWPerMm2).toBeCloseTo(1.9, 1);
    expect(coneTorque(single, 600) * dw).toBeCloseTo(4270, -2); // the research's figure, input-side
  });

  it('the crunch of a sleeve forced through: f = z·|Δω|/2π, 36 teeth at 100 rad/s ≈ 570 Hz', () => {
    expect(crunchHz(ESTIMATED_SYNCHRO, 100)).toBeCloseTo(573, 0);
    expect(crunchHz(ESTIMATED_SYNCHRO, -100)).toBeCloseTo(573, 0);
  });
});
