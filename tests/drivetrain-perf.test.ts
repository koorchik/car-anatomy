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
import { buildCarDrive } from '../src/data/car-drive.ts';
import { carVehicle } from '../src/drivetrain/car-model.ts';

// The cost is this thread's CPU time, not the wall clock: the machine that runs the tests is often shared, and a step
// the scheduler set aside for others is not the step's cost. On a quiet machine the two agree.
const cpuMicros = (): number => {
  const u = typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return u.user + u.system;
};

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
    const t0 = cpuMicros();
    for (let i = 0; i < 30000; i++) {
      s.step(h);
      if (s.state[clutch] === SLIP) slipping++;
      maxSlip = Math.max(maxSlip, Math.abs(s.slip[clutch]!));
    }
    const us = (cpuMicros() - t0) / 30000;
    // The state is the one the budget is about: slipping much of the time, on the falling part of μ(Δω).
    expect(slipping).toBeGreaterThan(0.3 * 30000);
    expect(maxSlip).toBeLessThan(4 * DRY_STRIBECK);
    expect(us).toBeLessThan(10);
  });
});

describe('15. budget with the car (stage K2b)', () => {
  it('BMW M3 E30 on its axle, wheels, tyres and chassis, clutch slipping on the falling Stribeck slope: under 10 µs per step', () => {
    // The car braked to a stand, first engaged, the engine held one Stribeck decay above it: the clutch slips where μ
    // falls, and every step also runs the plate differential, the four tyres, the wheels and the chassis.
    const cd = buildCarDrive('bmw-m3-e30');
    const veh = carVehicle(cd);
    const s = veh.solver;
    const { core } = s;
    const clutch = elementIndex(core, CLUTCH);
    s.drive[memberIndex(core, CRANK)] = DRY_STRIBECK;
    core.coords.forEach((id, k) => {
      if (id === CRANK || id === 'disc') s.phiDot[k] = DRY_STRIBECK;
    });
    s.command[elementIndex(core, 'sync-1')] = 600;
    s.command[clutch] = 0.4;
    veh.bus.brakeNm.fill(5000);
    const h = 1 / 3000;
    for (let i = 0; i < 3000; i++) veh.step(h);
    let slipping = 0;
    const t0 = cpuMicros();
    for (let i = 0; i < 30000; i++) {
      veh.step(h);
      if (s.state[clutch] === SLIP) slipping++;
    }
    const us = (cpuMicros() - t0) / 30000;
    expect(slipping).toBeGreaterThan(0.3 * 30000);
    expect(Math.abs(s.slip[clutch]!)).toBeLessThan(4 * DRY_STRIBECK);
    expect(us).toBeLessThan(10);
  });
});

describe('15. budget of the automatic (stage K12a)', () => {
  it('ZF 8HP51 with its converter, its lock-up clutch and clutch C slipping, the car braked: under 20 µs per step', async () => {
    // The car as one inertia behind its final drive (the Supra on its chassis comes with stage K12b), its brake
    // holding, first selected but clutch C at a share of the clamp it needs: the engine held at 2000 rpm, the
    // converter near stall, the lock-up clutch at a light controlled clamp and C slipping, so every step evaluates the
    // converter and factorises with two slipping packs.
    const { automaticLabInput } = await import('../src/data/converter-lab-input.ts');
    const { automaticCore, withPlanetaryFriction } = await import('../src/drivetrain/automatic.ts');
    const { converterDamper, lockupClutch, TURBINE_INERTIA } = await import('../src/drivetrain/converter.ts');
    const { LOCKUP, PUMP } = await import('../src/drivetrain/core.ts');
    const input = automaticLabInput();
    const box = buildGearbox(withPlanetaryFriction(input.spec, input.ratedInputNm));
    const core = automaticCore(
      box,
      { engineInertia: input.map.inertia, damper: converterDamper(input.map.inertia), turbineInertia: TURBINE_INERTIA, kStall: 100, lockup: lockupClutch(500) },
      input.load,
    );
    const s = new DrivetrainSolver(core);
    const w = 2000 * (Math.PI / 30);
    s.drive[memberIndex(core, CRANK)] = w;
    core.coords.forEach((id, k) => {
      if (id === CRANK || id === PUMP) s.phiDot[k] = w;
    });
    s.command[elementIndex(core, 'A')] = 1;
    s.command[elementIndex(core, 'B')] = 1;
    const c = elementIndex(core, 'C');
    s.command[c] = 0.6;
    const lockup = elementIndex(core, LOCKUP);
    s.command[lockup] = 0.05;
    s.command[elementIndex(core, 'brake')] = 1;
    const h = 1 / 3000;
    for (let i = 0; i < 3000; i++) s.step(h);
    let slipping = 0;
    let converting = 0;
    const t0 = cpuMicros();
    for (let i = 0; i < 30000; i++) {
      s.step(h);
      if (s.state[c] === SLIP && s.state[lockup] === SLIP) slipping++;
      if (s.converter.sr < 0.9) converting++;
    }
    const us = (cpuMicros() - t0) / 30000;
    expect(slipping).toBeGreaterThan(0.9 * 30000);
    expect(converting).toBeGreaterThan(0.9 * 30000);
    expect(us).toBeLessThan(20);
  });
});
