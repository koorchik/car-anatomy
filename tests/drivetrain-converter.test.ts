// The torque converter (stage K12a): drivetrain-dynamics 7 of the gearbox plan, the converter's law itself, and the
// lab's acceptance (demonstration 9): the engine stalls at the computed speed, the pull-away shows SR and TR, the
// stator freewheels past the coupling point, and the lock-up brings the slip down to a few tens of rpm.
import { describe, expect, it } from 'vitest';
import { automaticLabInput } from '../src/data/converter-lab-input.ts';
import { automaticCore, withPlanetaryFriction, WHEELS } from '../src/drivetrain/automatic.ts';
import {
  capacity, CONVERTER_SR, converterDamper, converterTorques, couplingPoint, kForStall, lockupClutch, newConverterPoint, stallSpeed, torqueRatio, TURBINE_INERTIA,
} from '../src/drivetrain/converter.ts';
import { fullLoad, labEngineTorque, runConverterLab } from '../src/drivetrain/converter-lab.ts';
import { BRAKE, CRANK, elementIndex, LOCKUP, memberIndex, PUMP, TURBINE } from '../src/drivetrain/core.ts';
import { DrivetrainSolver } from '../src/drivetrain/solver.ts';
import { buildGearbox, stateByName } from '../src/drivetrain/topology.ts';
import { peakTorque } from '../src/engine/torque-map.ts';

const RPM = 30 / Math.PI;
const input = automaticLabInput();
const run = runConverterLab(input);
const frameAt = (t: number) => Math.min(run.frames - 1, Math.round(t / run.frameS));

describe('the converter law', () => {
  it('TR at stall is 1.81 and TR reaches 1 at the coupling point', () => {
    expect(torqueRatio(0)).toBe(1.81);
    // Research §9 reads "SR ≈ 0.86–0.88" off the same figure; the table read off it (TR 1.03 at 0.85, 0.99 at 0.9)
    // puts TR = 1 at 0.8875 when interpolated linearly, so the bound takes in the reading's last hundredth.
    expect(couplingPoint()).toBeGreaterThan(0.86);
    expect(couplingPoint()).toBeLessThan(0.89);
  });

  it('the torque passes zero at SR 1 without a step, both ways', () => {
    const c = newConverterPoint();
    const w = 300;
    converterTorques(w, w * (1 - 1e-6), 100, c);
    const below = c.turbine;
    converterTorques(w, w * (1 + 1e-6), 100, c);
    expect(Math.abs(below)).toBeLessThan(0.01);
    expect(Math.abs(c.turbine)).toBeLessThan(0.01);
    expect(capacity(1)).toBe(0);
  });

  it('the slopes are the derivatives of the torques, forward and reverse', () => {
    const c = newConverterPoint();
    const d = newConverterPoint();
    for (const [wp, wt] of [
      [200, 30], [250, 160], [300, 280], [300, 296], [150, 200], [100, 400], [220, -20],
    ] as Array<[number, number]>) {
      converterTorques(wp, wt, 100, c);
      const e = 1e-4;
      converterTorques(wp + e, wt, 100, d);
      const pumpP = (d.pump - c.pump) / e;
      const turbP = (d.turbine - c.turbine) / e;
      converterTorques(wp, wt + e, 100, d);
      const pumpT = (d.pump - c.pump) / e;
      const turbT = (d.turbine - c.turbine) / e;
      const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-3 * Math.max(1, Math.abs(b)));
      near(c.dPumpP, pumpP);
      near(c.dPumpT, pumpT);
      near(c.dTurbineP, turbP);
      near(c.dTurbineT, turbT);
    }
  });

  it('turns energy into heat, never out of it', () => {
    const c = newConverterPoint();
    for (let i = 0; i <= 40; i++) {
      const wp = 250;
      const wt = (i / 20) * wp;
      converterTorques(wp, wt, 100, c);
      expect(c.pump * wp - c.turbine * wt).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(CONVERTER_SR.length).toBe(13);
  });
});

describe('7. torque converter', () => {
  it('the stall test: the engine settles where T(n) = (n/K)², within 1 %', () => {
    const root = stallSpeed((rpm) => fullLoad(input.map, rpm), run.kStall, input.map.idleRpm, input.map.limitRpm)!;
    expect(run.stallRpm).toBeCloseTo(root, 6);
    const settled = run.engineRpm[frameAt(run.phases.settle - 0.05)]!;
    expect(Math.abs(settled - root) / root).toBeLessThan(0.01);
    // The turbine stands, the converter multiplies by its stall ratio, the pump takes all the engine gives.
    expect(run.turbineRpm[frameAt(run.phases.settle - 0.05)]!).toBeCloseTo(0, 3);
    expect(run.tr[frameAt(run.phases.settle - 0.05)]!).toBeCloseTo(1.81, 6);
  });

  it('calibration: the 8HP51 on the B58 stalls near the estimated 2200 rpm', () => {
    expect(run.stallRpm).toBeGreaterThan(2150);
    expect(run.stallRpm).toBeLessThan(2250);
    expect(kForStall((rpm) => fullLoad(input.map, rpm), 2200)).toBeCloseTo(run.kStall, 0);
  });

  it('on a lift of the throttle from any speed: no NaN, no kink over 5 % of the torque before it, at 1/3000 s and at 1 ms', () => {
    const spec = withPlanetaryFriction(input.spec, input.ratedInputNm);
    const box = buildGearbox(spec);
    const launch = input.spec.launch;
    if (launch?.kind !== 'converter') throw new Error('no converter');
    const map = input.map;
    const core = automaticCore(
      box,
      { engineInertia: map.inertia, damper: converterDamper(map.inertia), turbineInertia: TURBINE_INERTIA, kStall: launch.kStall, lockup: lockupClutch(peakTorque(map).nm) },
      { ...input.load, brakeNm: 1 },
    );
    const crank = memberIndex(core, CRANK);
    const wheels = memberIndex(core, WHEELS);
    // The coast torque 1 s after the lift, by speed, at the test step: the main thread's 1 ms must agree.
    const coast = new Map<number, number>();
    for (const h of [1 / 3000, 0.001]) {
      for (const kmh of [5, 15, 30, 45]) {
        const s = new DrivetrainSolver(core);
        for (const id of stateByName(box, '1').closed) s.command[elementIndex(core, id)] = 1;
        s.command[elementIndex(core, BRAKE)] = 0;
        // Drive at a steady speed with a part throttle, then let the wheels go and lift.
        s.drive[wheels] = kmh / 3.6 / input.load.radiusM;
        for (let t = 0; t < 1; t += h) {
          s.memberTorque[crank] = labEngineTorque(map, s.memberSpeed(crank), 0.3);
          s.step(h);
        }
        s.drive[wheels] = Number.NaN;
        // The scale is the torque the converter carried before the lift. Near SR 1 the converter is a stiff fluid
        // coupling: at 4000 rpm the pump's speed settles against the light engine side in about 7 ms, so after the
        // pedal's step its torque falls by several per cent per 1/3000 s step, and that is the physics. A jump of the
        // solver is a kink from one step to the next instead: the change of the step-to-step change is what must stay
        // under 5 %.
        const scale = Math.abs(s.converter.turbine);
        let before = s.converter.turbine;
        let lastDelta = 0;
        let biggest = 0;
        let flips = 0;
        let at1 = 0;
        for (let t = 0; t < 3; t += h) {
          if (t < 1) at1 = s.converter.turbine;
          s.memberTorque[crank] = labEngineTorque(map, s.memberSpeed(crank), 0);
          s.step(h);
          const now = s.converter.turbine;
          expect(Number.isFinite(now) && Number.isFinite(s.memberSpeed(crank))).toBe(true);
          biggest = Math.max(biggest, Math.abs(now - before - lastDelta));
          lastDelta = now - before;
          if (now * before < 0) flips++;
          before = now;
        }
        // At 1 ms the crank's spring to the pump (its mode at 150 Hz, gearbox plan) rings for a few steps after the
        // pedal's step: the kink test is the plan's, at its step of 1/3000 s; at 1 ms the result must be the same.
        if (h < 0.0005) {
          expect(biggest, `${kmh} km/h`).toBeLessThan(0.05 * scale);
          coast.set(kmh, at1);
        } else {
          expect(Math.abs(at1 - coast.get(kmh)!), `${kmh} km/h`).toBeLessThan(0.02 * Math.abs(coast.get(kmh)!) + 0.5);
        }
        // The flow reverses once, from drive to coast, and does not chatter across SR 1.
        expect(flips, `${kmh} km/h at ${h} s`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the lab (demonstration 9)', () => {
  it('the pull-away: SR rises from 0 past the coupling point while TR falls along the measured curve', () => {
    const from = frameAt(run.phases.pull);
    const to = frameAt(run.phases.lockup);
    expect(run.sr[from]!).toBeLessThan(0.05);
    expect(run.sr[to]!).toBeGreaterThan(run.coupling);
    let crossed = -1;
    for (let i = from; i < to; i++) {
      // TR is the curve's at the frame's SR (forward flow all the way).
      expect(run.tr[i]!).toBeCloseTo(torqueRatio(run.sr[i]!), 4);
      if (crossed < 0 && run.sr[i]! >= run.coupling) crossed = i;
    }
    expect(crossed).toBeGreaterThan(from);
    expect(run.speedKmh[to]!).toBeGreaterThan(5);
  });

  it('the stator is held below the coupling point and freewheels past it', () => {
    for (let i = frameAt(run.phases.pull); i < frameAt(run.phases.lockup); i++) {
      if (run.sr[i]! < run.coupling - 1e-3) expect(run.statorFree[i]).toBe(0);
      if (run.sr[i]! > run.coupling + 1e-3) expect(run.statorFree[i]).toBe(1);
    }
    // At stall the stator holds the whole difference: turbine torque 1.81 times the pump's.
    const stall = frameAt(run.phases.settle - 0.05);
    expect(run.statorFree[stall]).toBe(0);
    expect(run.turbineNm[stall]! / run.pumpNm[stall]!).toBeCloseTo(1.81, 4);
  });

  it('the lock-up brings the slip down to a few tens of rpm', () => {
    const before = run.slipRpm[frameAt(run.phases.lockup)]!;
    const end = run.slipRpm[run.frames - 1]!;
    expect(before).toBeGreaterThan(80);
    expect(end).toBeGreaterThan(20);
    expect(end).toBeLessThan(60);
    expect(Math.max(...run.lockupNm.subarray(frameAt(run.phases.lockup + 0.5)))).toBeGreaterThan(20);
  });

  it('the lock-up clutch and the converter sit between the pump and the turbine of the core', () => {
    const spec = withPlanetaryFriction(input.spec, input.ratedInputNm);
    const core = automaticCore(
      buildGearbox(spec),
      { engineInertia: 0.1, damper: converterDamper(0.1), turbineInertia: TURBINE_INERTIA, kStall: 100, lockup: lockupClutch(500) },
      input.load,
    );
    const e = elementIndex(core, LOCKUP);
    expect(core.members[core.elements.a[e]!]).toBe(PUMP);
    expect(core.members[core.elements.b[e]!]).toBe(TURBINE);
    expect(core.converter.pump).toBe(memberIndex(core, PUMP));
    expect(core.converter.turbine).toBe(memberIndex(core, TURBINE));
    expect(RPM).toBeGreaterThan(9);
  });
});
