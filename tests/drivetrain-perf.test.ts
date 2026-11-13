// Real-time budget of the drivetrain step (gearbox plan, tests/drivetrain-dynamics 15). The worklet steps it every
// 16 samples on top of the engine and the synthesis, and a phone is three to five times slower than this machine,
// so the average step must stay under 10 µs for the E30 in its worst state. The bound has the same headroom for
// noise as the designer's speed test.
import { describe, expect, it } from 'vitest';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { CLUTCH, CRANK, drivetrainCore, elementIndex, memberIndex } from '../src/drivetrain/core.ts';
import { DISC_DAMPER, DRY_STRIBECK, dryClutch } from '../src/drivetrain/elements.ts';
import { DrivetrainSolver, SLIP } from '../src/drivetrain/solver.ts';
import { buildGearbox, stateByName } from '../src/drivetrain/topology.ts';

describe('15. budget', () => {
  it('BMW M3 E30 without a car, clutch slipping on the falling Stribeck slope: under 10 µs per step', () => {
    const box = buildGearbox(gearboxSpec(gearboxById('manual-rwd')!));
    const core = drivetrainCore(box, { engineInertia: 0.093, damper: DISC_DAMPER, clutch: dryClutch(240) }, { kind: 'brake', capacityNm: 3000 });
    const s = new DrivetrainSolver(core);
    const clutch = elementIndex(core, CLUTCH);
    // The engine held at 2000 rpm, first engaged, the output held one Stribeck decay below the engine's speed: the
    // clutch at 40 % clamp slips there, sticks, winds the damper up and lets go again (judder): a factorisation and
    // Karnopp passes on every step.
    const w = 2000 * (Math.PI / 30);
    const outW = (w - DRY_STRIBECK) / stateByName(box, '1').ratio!;
    s.drive[memberIndex(core, CRANK)] = w;
    s.drive[memberIndex(core, 'output')] = outW;
    s.phiDot.set([w, w, w - DRY_STRIBECK, outW]);
    s.command[elementIndex(core, 'sync-1')] = 600;
    s.command[clutch] = 0.4;
    const h = 1 / 3000;
    for (let i = 0; i < 3000; i++) s.step(h);
    let slipping = 0;
    let maxSlip = 0;
    const t0 = performance.now();
    for (let i = 0; i < 30000; i++) {
      s.step(h);
      if (s.state[clutch] === SLIP) slipping++;
      maxSlip = Math.max(maxSlip, Math.abs(s.slip[clutch]!));
    }
    const us = ((performance.now() - t0) / 30000) * 1000;
    // The state is the one the budget is about: slipping much of the time, on the falling part of μ(Δω).
    expect(slipping).toBeGreaterThan(0.3 * 30000);
    expect(maxSlip).toBeLessThan(4 * DRY_STRIBECK);
    expect(us).toBeLessThan(10);
  });
});
