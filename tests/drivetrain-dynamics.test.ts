// Drivetrain dynamics (gearbox plan, tests/drivetrain-dynamics: 1, 2 and 5 at stage K2a; the elements). The step is
// 1/3000 s, as in tests/sim.test.ts, unless a test says otherwise. Tests that only hold our defaults against
// published bands say "calibration" in their name, so they are not taken for physics.
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
