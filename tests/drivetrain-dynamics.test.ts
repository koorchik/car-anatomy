// Drivetrain dynamics (gearbox plan, tests/drivetrain-dynamics: 1, 2 and 5 at stage K2a, 3, 4, 6, 9, 14 and 17 at
// stage K2b; the elements). The step is 1/3000 s, as in tests/sim.test.ts, unless a test says otherwise. Tests that
// only hold our defaults against published bands say "calibration" in their name, so they are not taken for physics.
import { describe, expect, it } from 'vitest';
import { carById } from '../src/data/cars.ts';
import { engineById } from '../src/data/engines.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import {
  BRAKE, CLUTCH, CRANK, DAMPER, type CoreDraft, type DrivetrainCore, buildCore, drivetrainCore, elementIndex, gearboxDraft, launchDraft, memberIndex,
  mergeDrafts,
} from '../src/drivetrain/core.ts';
import { DISC_DAMPER, DMF_DAMPER, ESTIMATED_SYNCHRO, STIFF_DISC_HZ, dryClutch, pedalClamp, plateHeatCapacity, stiffDisc } from '../src/drivetrain/elements.ts';
import { naturalModes, stableStep } from '../src/drivetrain/modes.ts';
import { DrivetrainSolver, LOCKED, OPEN, SLIP } from '../src/drivetrain/solver.ts';
import type { DamperDef, FrictionDef } from '../src/drivetrain/spec.ts';
import { coneTorque, syncTime } from '../src/drivetrain/synchro-math.ts';
import { buildGearbox, stateByName } from '../src/drivetrain/topology.ts';
import { catalogueTorqueMap } from '../src/designer/torque-map.ts';
import { cardanRatio, singleJoint, twoJoints } from '../src/drivetrain/cardan.ts';
import { buildCarDrive, carVehicle, type CarDrive } from '../src/drivetrain/car-model.ts';
import { DISC } from '../src/drivetrain/core.ts';
import { stribeckMu } from '../src/drivetrain/elements.ts';
import { stubTorque } from '../src/drivetrain/engine-stub.ts';
import { DIFF_CASE, LSD, SIDE_LEFT, SIDE_RIGHT } from '../src/drivetrain/final-drive.ts';
import { dynamicRun, inputForForce, setRolling } from '../src/drivetrain/runs.ts';
import { vehicleModes } from '../src/drivetrain/vehicle-modes.ts';
import { G } from '../src/vehicle/constants.ts';
import type { LongitudinalChassis } from '../src/vehicle/longitudinal.ts';
import { roadLoadN } from '../src/vehicle/road-load.ts';
import { SURFACE_MU } from '../src/vehicle/surface.ts';
import { longitudinalPeakN } from '../src/vehicle/tyre.ts';
import type { VehicleStep } from '../src/vehicle/vehicle-step.ts';
import { FL, FR, RL, RR } from '../src/vehicle/wheel-bus.ts';
import { wheelEnergy } from '../src/vehicle/wheel.ts';

const STEPS = [1 / 3000, 16 / 44100, 32 / 48000, 0.001, 0.005];
const box = buildGearbox(gearboxSpec(gearboxById('manual-rwd')!));
const s14 = catalogueTorqueMap(engineById(carById('bmw-m3-e30')!.engine)!);
const ENGINE = s14.inertia;
const PEAK = Math.max(...s14.wotNm);
const e30 = (damper: DamperDef = DISC_DAMPER, clutch: FrictionDef = dryClutch(PEAK)): DrivetrainCore =>
  drivetrainCore(box, { engineInertia: ENGINE, damper, clutch }, { kind: 'brake', capacityNm: 3000 });

const friction = (capacityNm: number, extra: Partial<FrictionDef> = {}): FrictionDef => ({
  faces: 1, rIn: 100, rOut: 100, muStatic: 0.3, muKinetic: 0.27, stribeck: 3, clampN: capacityNm / (0.3 * 0.1), actuator: 'diaphragm', ...extra,
});
const draft = (members: Array<[string, number]>, elements: CoreDraft['elements']): CoreDraft => ({
  members: members.map(([id, inertia]) => ({ id, inertia })), links: [], springs: [], elements, prefer: members.map(([id]) => id), drag: null, meshes: [],
});
/** Two bodies a and b and one element between them. */
const twoBodies = (j1: number, j2: number, element: CoreDraft['elements'][number]) => buildCore(draft([['a', j1], ['b', j2]], [element]));

describe('1. no chatter', () => {
  it.each(STEPS)('two bodies: a locked clutch under steady torques holds for 10 s at h = %f s', (h) => {
    const core = twoBodies(0.2, 0.05, { id: 'c', kind: 'friction', a: 'a', b: 'b', friction: friction(500) });
    const s = new DrivetrainSolver(core);
    s.memberTorque.set([150, -40]);
    s.command[0] = 1;
    s.phiDot.set([100, 100]);
    const expected = -(0.05 * 150 - 0.2 * -40) / 0.25;
    for (let i = 0; i < Math.round(10 / h); i++) {
      s.step(h);
      expect(s.state[0]).toBe(LOCKED);
    }
    expect(Math.abs(s.slip[0]!)).toBeLessThan(1e-9);
    expect(s.torque[0]).toBeCloseTo(expected, 9);
  });

  it.each(STEPS)('BMW M3 E30 in first, output braked: 200 N·m on the crank never unlocks anything at h = %f s', (h) => {
    const core = e30();
    const s = new DrivetrainSolver(core);
    const [clutch, sync, brake] = [CLUTCH, 'sync-1', BRAKE].map((id) => elementIndex(core, id));
    s.command[clutch] = pedalClamp(0);
    s.command[sync!] = 600;
    s.command[brake!] = 1;
    s.memberTorque[memberIndex(core, CRANK)] = 200;
    // Start in equilibrium: the damper already carries the torque.
    s.phi[core.coords.indexOf(CRANK)] = 200 / DISC_DAMPER.stiffness;
    for (let i = 0; i < Math.round(10 / h); i++) {
      s.step(h);
      expect([s.state[clutch!], s.state[sync!], s.state[brake!]]).toEqual([LOCKED, LOCKED, LOCKED]);
    }
    expect(Math.abs(s.slip[clutch!]!)).toBeLessThan(1e-9);
    expect(s.torque[clutch!]).toBeCloseTo(-200, 6);
  });

  // The damper mode with the box free is 64–72 Hz: hω at 5 ms is above 2, beyond any explicit spring. The main
  // thread steps the drivetrain in substeps of 1 ms or less (gearbox plan, «Інтегрування»).
  it.each(STEPS.filter((h) => h <= 0.001))('BMW M3 E30 accelerating in first against a load holds its clutch at h = %f s', (h) => {
    const core = e30();
    const s = new DrivetrainSolver(core);
    const [clutch, sync] = [CLUTCH, 'sync-1'].map((id) => elementIndex(core, id));
    s.command[clutch!] = 1;
    s.command[sync!] = 600;
    const crank = memberIndex(core, CRANK);
    const output = memberIndex(core, 'output');
    for (let i = 0; i < Math.round(10 / h); i++) {
      const ramp = Math.min(1, (i * h) / 0.5);
      s.memberTorque[crank] = 200 * ramp;
      s.memberTorque[output] = -650 * ramp;
      s.step(h);
      expect(s.state[clutch!]).toBe(LOCKED);
    }
    expect(Math.abs(s.slip[clutch!]!)).toBeLessThan(1e-9);
    expect(s.memberSpeed(crank)).toBeGreaterThan(50);
  });
});

describe('2. the lock law', () => {
  it.each(STEPS)('two bodies with steady torques lock with (J₂T₁ − J₁T₂)/(J₁ + J₂) passing from a to b at h = %f s', (h) => {
    const [j1, j2, t1, t2] = [0.2, 0.05, 100, -30];
    const core = twoBodies(j1, j2, { id: 'c', kind: 'friction', a: 'a', b: 'b', friction: friction(500) });
    const s = new DrivetrainSolver(core);
    s.memberTorque.set([t1, t2]);
    s.command[0] = 1;
    s.phiDot.set([50, 0]);
    for (let i = 0; i < Math.round(1 / h); i++) s.step(h);
    expect(s.state[0]).toBe(LOCKED);
    // The torque on a holds it back: what passes to b is its negative.
    const passed = -s.torque[0]!;
    const expected = (j2 * t1 - j1 * t2) / (j1 + j2);
    expect(Math.abs(passed - expected) / expected).toBeLessThan(1e-6);
  });

  it('a slip that changes sign within a step locks at the crossing, and the lock holds', () => {
    const core = twoBodies(0.1, 0.1, { id: 'c', kind: 'friction', a: 'a', b: 'b', friction: friction(300) });
    const s = new DrivetrainSolver(core);
    s.command[0] = 1;
    s.phiDot.set([0.3, 0]);
    const h = 0.005; // the slip closes at 6000 rad/s² in 0.05 ms: far inside one step
    s.step(h);
    s.step(h);
    expect(s.state[0]).toBe(LOCKED);
    expect(s.phiDot[0]).toBeCloseTo(0.15, 9);
    expect(s.phiDot[1]).toBeCloseTo(0.15, 9);
  });

  it('the projection never adds energy: a dog closing between two spinning bodies loses exactly ½·J₁J₂/(J₁+J₂)·Δω²', () => {
    for (const [j1, j2, w1, w2] of [[0.2, 0.05, 300, 100], [0.01, 0.5, -40, 60], [0.3, 0.3, 10, 10.001]] as const) {
      const core = twoBodies(j1, j2, { id: 'd', kind: 'dog', a: 'a', b: 'b' });
      const s = new DrivetrainSolver(core);
      s.phiDot.set([w1, w2]);
      const before = s.kineticEnergy();
      const momentum = j1 * w1 + j2 * w2;
      s.command[0] = 1;
      s.step(1 / 3000);
      const lost = before - s.kineticEnergy();
      const expected = (0.5 * j1 * j2 * (w1 - w2) ** 2) / (j1 + j2);
      expect(lost).toBeGreaterThanOrEqual(0);
      expect(Math.abs(lost - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, expected));
      expect(Math.abs(s.energy[0]! - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, expected));
      expect(j1 * s.phiDot[0]! + j2 * s.phiDot[1]!).toBeCloseTo(momentum, 9);
    }
  });

  it('a new lock projects only itself: a held lock with a drift comes back to zero slip, not to minus the drift', () => {
    // a–b held by a clutch, b–c closed by a dog in this very step. The clutch's drift is corrected once, by its own
    // row (rhs −Δω/h); a projection that also zeroed it would leave it at +drift after the step.
    const d = draft([['a', 0.2], ['b', 0.05], ['c', 0.1]], [
      { id: 'clutch', kind: 'friction', a: 'a', b: 'b', friction: friction(500) },
      { id: 'dog', kind: 'dog', a: 'b', b: 'c' },
    ]);
    const s = new DrivetrainSolver(buildCore(d));
    s.command[0] = 1;
    s.phiDot.set([100, 100, 50]);
    for (let i = 0; i < 10; i++) s.step(1e-3);
    expect(s.state[0]).toBe(LOCKED);
    s.phiDot[1]! += 1e-3;
    s.command[1] = 1;
    s.step(1e-3);
    expect([s.state[0], s.state[1]]).toEqual([LOCKED, LOCKED]);
    expect(Math.abs(s.slip[0]!)).toBeLessThan(1e-9);
    expect(Math.abs(s.slip[1]!)).toBeLessThan(1e-9);
  });

  it('friction data that would give 0/0 or let go below its kinetic torque does not build', () => {
    for (const bad of [{ stribeck: 0 }, { muStatic: 0.2, muKinetic: 0.27 }, { muKinetic: 0 }]) {
      expect(() => twoBodies(0.1, 0.1, { id: 'c', kind: 'friction', a: 'a', b: 'b', friction: friction(100, bad) })).toThrow(/μ_s ≥ μ_k > 0/);
    }
  });

  it('the projection never adds energy in a geared box either: closing first with the clutch locked', () => {
    const core = e30();
    const s = new DrivetrainSolver(core);
    const [clutch, sync] = [CLUTCH, 'sync-1'].map((id) => elementIndex(core, id));
    s.command[clutch!] = 1;
    s.step(1 / 3000);
    // Input at 200 rad/s, output 0.1 rad/s off the first-gear speed: inside the synchroniser's window.
    const w = 200;
    s.phiDot.set([w, w, w, w / stateByName(box, '1').ratio! + 0.1]);
    const before = s.kineticEnergy();
    s.command[sync!] = 600;
    s.step(1e-9);
    expect(s.state[sync!]).toBe(LOCKED);
    expect(s.kineticEnergy()).toBeLessThanOrEqual(before);
    expect(before - s.kineticEnergy()).toBeCloseTo(s.energy[sync!]!, 6);
  });
});

/** Frequency of the damper's free swing measured from the simulation: zero crossings of the spring's twist. */
function measuredHz(core: DrivetrainCore, s: DrivetrainSolver, h: number, seconds: number): number {
  const spring = core.springs.ids.indexOf(DAMPER);
  const crossings: number[] = [];
  let prev = s.springTwist(spring);
  for (let i = 0; i < Math.round(seconds / h); i++) {
    s.step(h);
    const x = s.springTwist(spring);
    if (prev < 0 && x >= 0) crossings.push(s.time - h * (x / (x - prev)));
    prev = x;
  }
  return (crossings.length - 1) / (crossings.at(-1)! - crossings[0]!);
}

describe('5. damper modes', () => {
  const undamped = (d: DamperDef): DamperDef => ({ ...d, damping: 0 });
  const dampers: Array<[string, DamperDef]> = [['disc', DISC_DAMPER], ['dual-mass', DMF_DAMPER], ['stiff disc', stiffDisc(ENGINE)]];
  const pair = (k: number, j1: number, j2: number) => Math.sqrt(k * (1 / j1 + 1 / j2)) / (2 * Math.PI);

  it.each(dampers)('%s, clutch open: the swing between the crank and the ring is √(k(1/J₁ + 1/J₂))/2π to 2 %%', (_name, damper) => {
    const core = e30(undamped(damper));
    const s = new DrivetrainSolver(core);
    s.phi[core.coords.indexOf(CRANK)] = 0.01;
    const expected = pair(damper.stiffness, ENGINE, damper.inertia);
    expect(Math.abs(measuredHz(core, s, 1 / 3000, 40 / expected) / expected - 1)).toBeLessThan(0.02);
    expect(naturalModes(core, { locked: [] })[0]!.hz).toBeCloseTo(expected, 9);
  });

  it.each(dampers)('%s, clutch locked in neutral: the gearbox side joins the ring, to 2 %%', (_name, damper) => {
    const core = e30(undamped(damper));
    const s = new DrivetrainSolver(core);
    s.command[elementIndex(core, CLUTCH)] = 1;
    s.phi[core.coords.indexOf(CRANK)] = 0.01;
    // In neutral the input coordinate carries the hub, the input shaft, the countershaft and every loose gear.
    const input = core.coords.indexOf('input');
    const j2 = damper.inertia + core.mass[input * core.n + input]!;
    const expected = pair(damper.stiffness, ENGINE, j2);
    expect(Math.abs(measuredHz(core, s, 1 / 3000, 40 / expected) / expected - 1)).toBeLessThan(0.02);
    expect(naturalModes(core, { locked: [CLUTCH] })[0]!.hz).toBeCloseTo(expected, 9);
  });

  it('the stiff disc stays at 150 Hz in the lightest configuration, lower in every other, and is stable at 1 ms', () => {
    const damper = stiffDisc(ENGINE);
    const core = e30(damper);
    expect(naturalModes(core, { locked: [] })[0]!.hz).toBeCloseTo(STIFF_DISC_HZ, 6);
    for (const gear of ['N', '1', '5']) {
      const locked = gear === 'N' ? [CLUTCH] : [CLUTCH, `sync-${gear}`];
      for (const m of naturalModes(core, { locked })) expect(m.hz).toBeLessThan(STIFF_DISC_HZ);
    }
    const s = new DrivetrainSolver(core);
    const crank = core.coords.indexOf(CRANK);
    s.phi[crank] = 0.01;
    let late = 0;
    for (let i = 0; i < 2000; i++) {
      s.step(0.001);
      if (i >= 1000) late = Math.max(late, Math.abs(s.springTwist(0)));
    }
    expect(Number.isFinite(late)).toBe(true);
    expect(late).toBeLessThan(0.01);
  });

  it('the stable step is 1/ω of the fastest mode, and no lock makes the drivetrain faster', () => {
    for (const damper of [DISC_DAMPER, DMF_DAMPER, stiffDisc(ENGINE)]) {
      const core = e30(damper);
      const h = stableStep(core);
      expect(h).toBeCloseTo(1 / Math.sqrt(damper.stiffness * (1 / ENGINE + 1 / damper.inertia)), 9);
      for (const locked of [[CLUTCH], [CLUTCH, 'sync-1'], [CLUTCH, 'sync-5', BRAKE]]) {
        for (const m of naturalModes(core, { locked })) expect(2 * Math.PI * m.hz * h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(stableStep(e30(stiffDisc(ENGINE))) * 1000).toBeCloseTo(1.06, 2);
  });

  it.each([1, 2, 3, 4, 5])('calibration of the dampers: the E30 box mode in gear %i is 40–80 Hz with a disc, 7.5–15 Hz with a DMF (LuK)', (gear) => {
    // The box in gear with the clutch locked, the output free: the gearbox side swings against the engine. LuK,
    // research §6: mode 2 is 40–80 Hz with a disc damper and 7.5–15 Hz with a dual-mass flywheel.
    const locked = [CLUTCH, `sync-${gear}`];
    const disc = naturalModes(e30(DISC_DAMPER), { locked });
    const dmf = naturalModes(e30(DMF_DAMPER), { locked });
    expect(disc).toHaveLength(1);
    expect(disc[0]!.hz).toBeGreaterThan(40);
    expect(disc[0]!.hz).toBeLessThan(80);
    expect(dmf[0]!.hz).toBeGreaterThan(7.5);
    expect(dmf[0]!.hz).toBeLessThan(15);
  });
});

describe('elements', () => {
  it('a one-way clutch drives when the other side would overtake it and lets go when its torque would turn', () => {
    // b may not run ahead of a: the clutch holds Δω = ω_a − ω_b ≥ 0 only by pushing b back… here b is driven,
    // so the clutch carries a along. Then b brakes: a overruns and coasts.
    const core = twoBodies(0.1, 0.1, { id: 'o', kind: 'oneway', a: 'a', b: 'b' });
    const s = new DrivetrainSolver(core);
    s.memberTorque.set([0, 10]);
    for (let i = 0; i < 3000; i++) s.step(1 / 3000);
    expect(s.state[0]).toBe(LOCKED);
    expect(s.phiDot[0]).toBeCloseTo(50, 6);
    expect(s.phiDot[1]).toBeCloseTo(50, 6);
    expect(s.torque[0]).toBeCloseTo(5, 6);
    s.memberTorque.set([0, -10]);
    for (let i = 0; i < 3000; i++) s.step(1 / 3000);
    expect(s.state[0]).toBe(OPEN);
    expect(s.phiDot[0]).toBeCloseTo(50, 6);
    expect(s.phiDot[1]).toBeCloseTo(-50, 6);
  });

  it('a clutch that cannot hold slips at its kinetic torque, and between μ_k and μ_s it holds without chatter', () => {
    const f = friction(100);
    const run = (t: number) => {
      const core = twoBodies(0.2, 0.05, { id: 'c', kind: 'friction', a: 'a', b: 'b', friction: f });
      const s = new DrivetrainSolver(core);
      s.command[0] = 1;
      // Torque to hold: (J₂·t + J₁·t)/(J₁ + J₂) = t, against a static capacity of 100 N·m and a kinetic one of 90.
      s.memberTorque.set([t, -t]);
      let changes = 0;
      let prev = s.state[0];
      for (let i = 0; i < 6000; i++) {
        s.step(1 / 3000);
        if (s.state[0] !== prev) changes++;
        prev = s.state[0];
      }
      return { s, changes };
    };
    const over = run(150);
    expect(over.s.state[0]).toBe(SLIP);
    expect(over.changes).toBe(1);
    expect(over.s.torque[0]).toBeCloseTo(-f.muKinetic * (100 / 0.3), 3);
    const between = run(95);
    expect(between.s.state[0]).toBe(LOCKED);
    expect(between.changes).toBe(1);
    expect(between.s.torque[0]).toBeCloseTo(-95, 6);
  });

  it('the pedal: free play to 0.3, the full clamp released, nothing floored, never rising as it goes down', () => {
    expect(pedalClamp(0)).toBe(1);
    expect(pedalClamp(0.3)).toBe(1);
    expect(pedalClamp(1)).toBe(0);
    for (let p = 0; p < 1; p += 0.01) expect(pedalClamp(p + 0.01)).toBeLessThanOrEqual(pedalClamp(p));
  });

  it('the ideal synchroniser closes in the analytic time J·Δω·i/(T_C + i·T_drag) to 5 %, then holds like a dog', () => {
    // E30, 2→3 with the clutch floored: the input side (hub, shafts, loose gears) is slowed by the third-gear cone
    // while the output, on a car, keeps its speed. Spin loss a constant 1 N·m, as in the formula.
    const d = mergeDrafts(launchDraft('input', { engineInertia: ENGINE, damper: DISC_DAMPER, clutch: dryClutch(PEAK) }), gearboxDraft(box));
    d.drag = { member: 'input', loss: { a: 1, b: 0 } };
    const core = buildCore(d);
    const s = new DrivetrainSolver(core);
    const [i2, i3] = ['2', '3'].map((g) => stateByName(box, g).ratio!);
    const out = 6000 * (Math.PI / 30) / i2!;
    const input = core.coords.indexOf('input');
    s.phiDot[input] = out * i2!;
    s.drive[memberIndex(core, 'output')] = out;
    s.phiDot[core.coords.indexOf('output')] = out;
    const sync = elementIndex(core, 'sync-3');
    s.command[sync] = 600;
    const h = 1 / 3000;
    while (s.state[sync] !== LOCKED && s.time < 1) s.step(h);
    const expected = syncTime({
      inputInertia: core.mass[input * core.n + input]!, inputSpeedChange: out * (i2! - i3!), ratio: i3!,
      coneNm: coneTorque(ESTIMATED_SYNCHRO, 600), dragNm: 1, direction: 'up',
    });
    expect(Math.abs(s.time / expected - 1)).toBeLessThan(0.05);
    expect(s.memberSpeed(memberIndex(core, 'input'))).toBeCloseTo(out * i3!, 6);
    s.step(h);
    expect(s.state[sync]).toBe(LOCKED);
  });

  it('the disc heats by the slip work over the plate heat capacity, and cools toward the bell housing', () => {
    const core = e30();
    const s = new DrivetrainSolver(core);
    const clutch = elementIndex(core, CLUTCH);
    const crank = memberIndex(core, CRANK);
    // Engine held at 2000 rpm, output braked: everything the crank gives goes into the disc.
    s.drive[crank] = 2000 * (Math.PI / 30);
    s.phiDot.set([s.drive[crank]!, s.drive[crank]!, 0, 0]);
    s.command[elementIndex(core, 'sync-1')] = 600;
    s.command[elementIndex(core, BRAKE)] = 1;
    s.command[clutch] = 0.3;
    const t0 = s.temperature[clutch]!;
    for (let i = 0; i < 3000; i++) s.step(1 / 3000);
    const heat = plateHeatCapacity(dryClutch(PEAK));
    expect(s.state[clutch]).toBe(SLIP);
    // One second against a 60 s time constant: the rise is the work over the heat capacity, less under 1 %.
    const rise = s.temperature[clutch]! - t0;
    expect(rise).toBeGreaterThan(0.98 * (s.energy[clutch]! / heat));
    expect(rise).toBeLessThanOrEqual(s.energy[clutch]! / heat);
    // The work is the slip torque times the slip.
    expect(s.energy[clutch]!).toBeCloseTo(-s.torque[clutch]! * s.drive[crank]!, -2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The car (stage K2b): the BMW M3 E30's drivetrain on the longitudinal chassis, the engine on the stub.

const H = 1 / 3000;
const RAD = Math.PI / 30;
const chassisOf = (veh: VehicleStep) => veh.chassis as LongitudinalChassis;

/** The car at rest in first with the engine held at `rpm` and the clutch open. */
function heldEngine(cd: CarDrive, rpm: number): VehicleStep {
  const veh = carVehicle(cd);
  const s = veh.solver;
  const w = rpm * RAD;
  s.drive[memberIndex(s.core, CRANK)] = w;
  s.core.coords.forEach((id, k) => {
    if (id === CRANK || id === DISC) s.phiDot[k] = w;
  });
  s.command[elementIndex(s.core, 'sync-1')] = 600;
  return veh;
}

describe('3. launch energy', () => {
  // Engine held at 2000 rpm, first gear, the clutch passing a steady 60 N·m until it locks.
  const cd = buildCarDrive('bmw-m3-e30');
  const veh = heldEngine(cd, 2000);
  const s = veh.solver;
  const c = s.core;
  const ch = chassisOf(veh);
  const crank = memberIndex(c, CRANK);
  const disc = memberIndex(c, DISC);
  const clutch = elementIndex(c, CLUTCH);
  const E = c.elements;
  let road = 0;
  let tyres = 0;
  let damping = 0;
  let impulse = 0;
  while (s.state[clutch] !== LOCKED && s.time < 10) {
    s.command[clutch] = 60 / (stribeckMu(E.muStatic[clutch]!, E.muKinetic[clutch]!, E.stribeck[clutch]!, s.slip[clutch]!) * E.scale[clutch]!);
    veh.step(H);
    road += roadLoadN(ch.spec.roadLoad, ch.v, 0) * ch.v * H;
    for (let i = 0; i < 4; i++) tyres += veh.bus.fx[i]! * (veh.bus.omega[i]! * veh.bus.rEff[i]! - ch.v) * H;
    for (let j = 0; j < c.springs.ids.length; j++) if (c.springs.ids[j] !== DAMPER) damping += c.springs.damping[j]! * s.springRate(j) ** 2 * H;
    impulse += -s.torque[clutch]! * H;
  }
  // What sits behind the clutch, moving and twisted, and what the resistances took meanwhile.
  let behind = 0.5 * ch.spec.roadLoad.massKg * ch.v ** 2 + wheelEnergy(veh.bus, veh.wheelInertia);
  for (let i = 0; i < c.members.length; i++) if (i !== crank && i !== disc) behind += 0.5 * c.inertia[i]! * s.memberSpeed(i) ** 2;
  for (let j = 0; j < c.springs.ids.length; j++) if (c.springs.ids[j] !== DAMPER) behind += 0.5 * c.springs.stiffness[j]! * s.springTwist(j) ** 2;
  const resist = road + tyres + s.lossEnergy + damping;

  it('the clutch locks within the run, with the car moving at the speed first gear gives 2000 rpm', () => {
    expect(s.state[clutch]).toBe(LOCKED);
    expect(ch.v).toBeGreaterThan(0.95 * ((2000 * RAD) / (stateByName(cd.box, '1').ratio! * cd.axle.ratio)) * cd.radius[RL]!);
  });

  it('dissipates in the clutch the energy given to the car plus the work of the resistances while it slipped, to 2 %', () => {
    // Exact for steady torques: E_slip = ½J·ω² + ∫T_r·ω dt (the gearbox plan's launch rule).
    expect(Math.abs((behind + resist) / s.energy[clutch]! - 1)).toBeLessThan(0.02);
  });

  it('balances exactly: what the engine passed through the clutch went into the slip, the car and the resistances', () => {
    expect(Math.abs((2000 * RAD * impulse) / (s.energy[clutch]! + behind + resist) - 1)).toBeLessThan(0.002);
  });
});

describe('4. shunt', () => {
  /** Frequency of the halfshaft torque's swing after a step from 500 to 1500 N at the wheels, at 3000 rpm. */
  function shuntHz(cd: CarDrive, gear: string): { sim: number; linear: number } {
    const g = cd.gears.find((x) => x.name === gear)!;
    const w = 3000 * RAD;
    const v = (w / (g.ratio * cd.axle.ratio)) * cd.radius[RL]!;
    const veh = carVehicle(cd);
    const s = veh.solver;
    setRolling(cd, veh, v, g);
    const crank = memberIndex(s.core, CRANK);
    const [before, after] = [500, 1500].map((f) => inputForForce(cd, g, f, w));
    const torque: number[] = [];
    for (let i = 0; i < 3 / H; i++) {
      s.memberTorque[crank] = i < 1 / H ? before! : after!;
      veh.step(H);
      if (i >= 1 / H) torque.push(veh.bus.driveNm[RL]! + veh.bus.driveNm[RR]!);
    }
    // Swing about the trend of the last second (the car keeps accelerating): the first upward crossings.
    const tail = torque.slice(-1 / H);
    const mid = (tail.length - 1) / 2;
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    const slope = tail.reduce((a, y, i) => a + (i - mid) * (y - mean), 0) / tail.reduce((a, _, i) => a + (i - mid) ** 2, 0);
    const trend = (i: number) => mean + slope * (i - (torque.length - tail.length) - mid);
    const up: number[] = [];
    for (let i = 1; i < torque.length && up.length < 3; i++) {
      const a = torque[i - 1]! - trend(i - 1);
      const b = torque[i]! - trend(i);
      if (a < 0 && b >= 0) up.push((i - 1 + a / (a - b)) * H);
    }
    return { sim: 2 / (up[2]! - up[0]!), linear: vehicleModes(cd, g, v)[0]!.hz };
  }
  const withShaft = buildCarDrive('bmw-m3-e30');
  const bolted = buildCarDrive('bmw-m3-e30', { propshaft: false });
  const gears = withShaft.gears.map((g) => g.name);
  const runs = Object.fromEntries(gears.map((g) => [g, { shaft: shuntHz(withShaft, g), bolted: shuntHz(bolted, g) }]));

  it.each(gears)('gear %s: the swing after a torque step is the linearised car\'s shunt to 10 %, propshaft or not', (g) => {
    for (const r of [runs[g]!.shaft, runs[g]!.bolted]) expect(Math.abs(r.sim / r.linear - 1)).toBeLessThan(0.1);
  });

  it('lies in 1.5–12 Hz and rises from first to fifth (LuK: 2–10 Hz)', () => {
    const hz = gears.map((g) => runs[g]!.shaft.sim);
    for (const f of hz) {
      expect(f).toBeGreaterThan(1.5);
      expect(f).toBeLessThan(12);
    }
    for (let i = 1; i < hz.length; i++) expect(hz[i]!).toBeGreaterThan(hz[i - 1]!);
  });

  it('is higher in every gear with the pinion bolted to the gearbox: the propshaft and its coupling soften the shunt', () => {
    for (const g of gears) expect(runs[g]!.bolted.sim).toBeGreaterThan(runs[g]!.shaft.sim);
  });
});

describe('6. the step does not matter', () => {
  const cd = buildCarDrive('bmw-m3-e30');
  const ref = dynamicRun(cd, { dt: 1 / 3000, sampleS: 0.05 });

  it.each([['32/48000', 32 / 48000], ['0.001', 0.001]])('a standing start to 100 km/h at h = %s s gives the speed curve of h = 1/3000 s to 1 %', (_name, dt) => {
    const run = dynamicRun(cd, { dt, sampleS: 0.05 });
    expect(Math.abs(run.zeroTo100S! / ref.zeroTo100S! - 1)).toBeLessThan(0.01);
    const n = Math.min(ref.speeds.length, run.speeds.length);
    for (let i = 0; i < n && i * ref.sampleS <= ref.zeroTo100S!; i++) {
      // A hundredth of a metre per second covers the first instants, when the speed itself is near zero.
      expect(Math.abs(run.speeds[i]! - ref.speeds[i]!), `t = ${(i * ref.sampleS).toFixed(2)} s`).toBeLessThan(0.01 * ref.speeds[i]! + 0.01);
    }
  });
});

describe('9. differentials', () => {
  const open = buildCarDrive('bmw-m3-e30', { differential: { kind: 'open' } });
  /**
   * Left rear wheel on ice, the engine held at 2000 rpm in first, the clutch closing over 1.5 s. With `holdS` the
   * front brakes hold the car that long, so the spinning wheel is up to speed before it is let go.
   */
  function iceRun(cd: CarDrive, grade: number, seconds: number, each?: (veh: VehicleStep) => void, holdS = 0): VehicleStep {
    const veh = heldEngine(cd, 2000);
    const ch = chassisOf(veh);
    ch.surfaceMu[RL] = SURFACE_MU.ice;
    ch.gradeRad = Math.atan(grade);
    const clutch = elementIndex(veh.solver.core, CLUTCH);
    while (veh.time < seconds) {
      veh.solver.command[clutch] = Math.min(1, veh.time / 1.5);
      veh.bus.brakeNm[FL] = veh.bus.brakeNm[FR] = veh.time < holdS ? 3000 : 0;
      veh.step(H);
      if (veh.time >= holdS) each?.(veh);
    }
    return veh;
  }
  // Undriven wheels, the right one and the spinning one all take a share of the car's acceleration.
  const meq = (cd: CarDrive, ch: LongitudinalChassis) => ch.spec.roadLoad.massKg + [FL, FR, RL, RR].reduce((s, i) => s + cd.wheelInertia[i]! / cd.radius[i]! ** 2, 0);

  it('open: ω_case = (ω_l + ω_r)/2 and the two halfshafts carry the same torque, the left wheel spinning on ice', () => {
    const veh = iceRun(open, 0, 4, (v) => {
      const s = v.solver;
      const [l, r, c] = [SIDE_LEFT, SIDE_RIGHT, DIFF_CASE].map((id) => s.memberSpeed(memberIndex(s.core, id)));
      expect(Math.abs(c! - (l! + r!) / 2)).toBeLessThan(1e-9 * Math.max(1, Math.abs(c!)));
    });
    const b = veh.bus;
    expect(b.omega[RL]! * b.rEff[RL]!).toBeGreaterThan(5 * chassisOf(veh).v);
    expect(Math.abs(b.driveNm[RL]! / b.driveNm[RR]! - 1)).toBeLessThan(0.01);
  });

  it('open, left wheel on ice, level road: the car crawls at (2·F_ice − F_roll)/m_eq to 5 %, the right wheel rolling with it', () => {
    let worst = 0;
    let samples = 0;
    let fIce = 0;
    iceRun(open, 0, 6, (veh) => {
      if (veh.time < 2) return;
      const ch = chassisOf(veh);
      const b = veh.bus;
      fIce = b.fx[RL]!;
      // The acceleration the two equal torques can give, against what the car does, step by step.
      const expected = (2 * b.fx[RL]! - roadLoadN(ch.spec.roadLoad, ch.v, 0)) / meq(open, ch);
      worst = Math.max(worst, Math.abs(ch.ax / expected - 1));
      samples++;
      // The right wheel rolls with the car; the left one spins at 2ω_case − ω_r.
      expect(Math.abs(b.omega[RR]! * b.rEff[RR]! - ch.v)).toBeLessThan(0.05 * ch.v + 0.01);
      const s = veh.solver;
      const ce = s.memberSpeed(memberIndex(s.core, DIFF_CASE));
      expect(Math.abs(b.omega[RL]! - (2 * ce - b.omega[RR]!))).toBeLessThan(0.02 * b.omega[RL]!);
    });
    expect(samples).toBeGreaterThan(1000);
    expect(worst).toBeLessThan(0.05);
    // The ice pulls with sliding friction: at most its peak μ_ice·F_z, and not much less.
    const fz = chassisOf(carVehicle(open)).axleLoads(0).rear / 2;
    expect(fIce).toBeLessThanOrEqual(longitudinalPeakN(open.tyre.set, fz, 0, SURFACE_MU.ice) * 1.02);
    expect(fIce).toBeGreaterThan(0.6 * longitudinalPeakN(open.tyre.set, fz, 0, SURFACE_MU.ice));
  });

  it('open, left wheel on ice: let go on the limit grade plus 2 points, the car never moves up in 10 s; 2 points below it climbs', () => {
    // The limit, as the differential scene computes it: m·g·sin θ = 2·F_ice − F_roll, with the ice pulling its peak
    // at the static load of the left wheel (the low-speed tyre slides at it).
    const ch = chassisOf(carVehicle(open));
    const fIce = longitudinalPeakN(open.tyre.set, ch.axleLoads(0).rear / 2, 0, SURFACE_MU.ice);
    const limit = Math.tan(Math.asin((2 * fIce - ch.spec.roadLoad.a) / (ch.spec.roadLoad.massKg * G)));
    // The brakes hold it while the clutch closes and the ice wheel spins up: that spin-up passes extra torque to the
    // other wheel for a moment, which the steady limit is not about.
    let top = 0;
    iceRun(open, limit + 0.02, 13, (veh) => (top = Math.max(top, chassisOf(veh).v)), 3);
    expect(top).toBeLessThanOrEqual(0);
    const below = iceRun(open, limit - 0.02, 13, undefined, 3);
    expect(chassisOf(below).v).toBeGreaterThan(0.1);
  });

  /** The left rear wheel in the air, the front wheels braked, the engine held at 1500 rpm in first. */
  function hoisted(cd: CarDrive): VehicleStep {
    const veh = heldEngine(cd, 1500);
    chassisOf(veh).lifted[RL] = 1;
    veh.bus.brakeNm[FL] = veh.bus.brakeNm[FR] = 3000;
    const clutch = elementIndex(veh.solver.core, CLUTCH);
    while (veh.time < 4) {
      veh.solver.command[clutch] = Math.min(1, veh.time / 1.5);
      veh.step(H);
    }
    return veh;
  }
  const plate = (lockDrive: number, preloadNm: number) => buildCarDrive('bmw-m3-e30', { differential: { kind: 'plate', lockDrive, lockCoast: lockDrive, preloadNm } });

  it('a wheel in the air: the open differential gives the wheel on the ground nothing', () => {
    expect(Math.abs(hoisted(open).bus.driveNm[RR]!)).toBeLessThan(1);
  });

  it('a wheel in the air: a plate differential gives its preload, and with a locking value S, preload/(1 − S)', () => {
    // T_high − T_low = preload + S·(T_high + T_low) with T_low = 0 (gearbox plan: a 50 N·m preload gives 50 N·m).
    expect(hoisted(plate(0, 50)).bus.driveNm[RR]!).toBeCloseTo(50, 0);
    const e30 = hoisted(plate(0.25, 50));
    expect(Math.abs(e30.bus.driveNm[RR]! / (50 / 0.75) - 1)).toBeLessThan(0.02);
    expect(e30.solver.state[elementIndex(e30.solver.core, LSD)]).toBe(SLIP);
  });

  it('the E30\'s plate differential splits the torque (1 + S)/(1 − S) = 1.67 with one wheel on ice', () => {
    const veh = iceRun(buildCarDrive('bmw-m3-e30'), 0, 4);
    expect(veh.bus.driveNm[RR]! / veh.bus.driveNm[RL]!).toBeCloseTo(1.25 / 0.75, 2);
  });
});

describe('14. engine braking', () => {
  it('coasting from 80 km/h slows the car more in third with the throttle shut than in neutral', () => {
    const cd = buildCarDrive('bmw-m3-e30');
    const third = cd.gears.find((g) => g.name === '3')!;
    const decel = (inGear: boolean) => {
      const veh = carVehicle(cd);
      const s = veh.solver;
      setRolling(cd, veh, 80 / 3.6, third);
      if (!inGear) s.command[elementIndex(s.core, third.element)] = 0;
      const crank = memberIndex(s.core, CRANK);
      while (veh.time < 1) {
        s.memberTorque[crank] = stubTorque(cd.map, s.memberSpeed(crank), 0);
        veh.step(H);
      }
      return (80 / 3.6 - chassisOf(veh).v) / veh.time;
    };
    const coast = decel(false);
    const braked = decel(true);
    expect(coast).toBeGreaterThan(0);
    expect(braked).toBeGreaterThan(1.5 * coast);
  });
});

describe('17. Cardan joints', () => {
  const DEG = Math.PI / 180;
  const turn = Array.from({ length: 720 }, (_, i) => (i * 2 * Math.PI) / 720);

  it.each([3, 10, 30])('one joint at %i°: the 3D geometry gives ω₂/ω₁ = cos β/(1 − sin²β·cos²θ) to 1e-9, 1 on average over a turn', (deg) => {
    const beta = deg * DEG;
    for (const t of turn) expect(Math.abs(singleJoint(t, beta).omega - cardanRatio(t, beta))).toBeLessThan(1e-9);
    const mean = turn.reduce((s, t) => s + singleJoint(t, beta).omega, 0) / turn.length;
    expect(Math.abs(mean - 1)).toBeLessThan(1e-9);
  });

  it.each([3, 10, 30])('two joints at %i° with the intermediate yokes in one plane turn the output evenly to 1e-9', (deg) => {
    for (const t of turn) expect(Math.abs(twoJoints(t, deg * DEG, 0) - 1)).toBeLessThan(1e-9);
  });

  it('turning the intermediate yokes by 90° doubles the unevenness instead (10°: to 1 %)', () => {
    const range = (f: (t: number) => number) => Math.max(...turn.map(f)) - Math.min(...turn.map(f));
    const one = range((t) => singleJoint(t, 10 * DEG).omega);
    expect(Math.abs(range((t) => twoJoints(t, 10 * DEG, Math.PI / 2)) / one - 2)).toBeLessThan(0.02);
  });
});
