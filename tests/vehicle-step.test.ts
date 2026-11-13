// The car as a load on the crank (whole-car plan, tests/vehicle-step; stage K2c): the real engine on LoadedCrank
// drives the BMW M3 E30 through VehicleLoad. The same manoeuvre at 1/3000 and 1/1000 s gives the same speeds to 1 %;
// a load restored from a snapshot goes on bit for bit; the scripted drive pulls away and shifts up four times, each
// drop landing where the gear ratios put it. drivetrain-dynamics 13 and 16 test the stall and the hand-over.
import { describe, expect, it } from 'vitest';
import { synthConfig } from '../src/audio/synth.ts';
import { carById } from '../src/data/cars.ts';
import { engineById } from '../src/data/engines.ts';
import { vehicleLoadSpec } from '../src/drivetrain/car-load.ts';
import { buildCarDrive } from '../src/drivetrain/car-model.ts';
import { LAUNCH_RPM } from '../src/drivetrain/control/manual.ts';
import { anchorCrank, buildCore, CRANK } from '../src/drivetrain/core.ts';
import { DriveStory, runStory } from '../src/drivetrain/drive-story.ts';
import { LOCKED } from '../src/drivetrain/solver.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import type { CrankInput } from '../src/engine/load.ts';
import { LoadedCrank } from '../src/engine/loaded-crank.ts';
import { createLoad } from '../src/engine/loads.ts';
import { EngineSim } from '../src/engine/sim.ts';
import { CRANK_SLOT, VehicleLoad } from '../src/vehicle/vehicle-load.ts';

const cd = buildCarDrive('bmw-m3-e30');
const spec = vehicleLoadSpec(cd);
const params = synthConfig(buildEngine(engineById(carById('bmw-m3-e30')!.engine)!)).sim;

/** The E30's engine on its drivetrain, standing in neutral with the engine off. */
function rig(): { sim: EngineSim; load: VehicleLoad } {
  const sim = new EngineSim(params);
  const load = new VehicleLoad(spec);
  sim.attach(new LoadedCrank(cd.map, load));
  return { sim, load };
}

describe('the load', () => {
  it('takes the crank out of the drivetrain: the damper ends on the crank slot and the stable step stays', () => {
    expect(spec.drivetrain.members).not.toContain(CRANK);
    expect(spec.drivetrain.anchorSlots).toBe(CRANK_SLOT + 1);
    expect(spec.drivetrain.springs.anchor[spec.drivetrain.springs.ids.indexOf('damper')]).toBe(CRANK_SLOT);
    expect(spec.maxStepS).toBeGreaterThan(0.0005);
    expect(spec.maxStepS).toBeLessThanOrEqual(0.001);
    expect(() => buildCore(anchorCrank(anchorCrank(cd.draft, CRANK_SLOT), CRANK_SLOT))).toThrow();
  });

  it('is built from plain data on either thread, and createLoad makes it', () => {
    const copy = structuredClone(spec);
    expect(createLoad(copy)).toBeInstanceOf(VehicleLoad);
  });

  it('reports no inertia of its own and is always active: only the damper spring touches the crank', () => {
    const load = new VehicleLoad(spec);
    expect(load.inertia()).toBe(0);
    expect(load.active()).toBe(true);
    expect(load.maxStepS()).toBe(spec.maxStepS);
  });
});

describe('the step does not matter', () => {
  // The scripted drive with the real engine until third is in: start, idle, the auto clutch's pull-away, 1→2, 2→3.
  const drive = (dt: number) => {
    const { sim, load } = rig();
    const story = new DriveStory(cd, load, sim);
    const speeds: number[] = [];
    let next = 0;
    runStory(story, dt, 14, () => {
      if (story.time >= next * 0.1 - 1e-9) {
        speeds.push(load.chassis.v);
        next++;
      }
    });
    return { speeds, story };
  };
  const ref = drive(1 / 3000);

  it('drives through two upshifts in 14 s at h = 1/3000 s', () => {
    expect(ref.story.shifts.length).toBe(2);
    expect(Math.max(...ref.speeds)).toBeGreaterThan(80 / 3.6);
  });

  it('gives the speed curve of h = 1/3000 s to 1 % at h = 0.001 s, LoadedCrank and VehicleLoad together', () => {
    const run = drive(0.001);
    expect(run.story.shifts.length).toBe(ref.story.shifts.length);
    const n = Math.min(run.speeds.length, ref.speeds.length);
    for (let i = 0; i < n; i++) {
      // A hundredth of a metre per second covers the instants when the speed itself is near zero.
      expect(Math.abs(run.speeds[i]! - ref.speeds[i]!), `t = ${(i * 0.1).toFixed(1)} s`).toBeLessThan(0.01 * ref.speeds[i]! + 0.01);
    }
  });
});

describe('snapshot and restore', () => {
  it('a load restored from a snapshot goes on bit for bit, with the controls, the clutch heat and the tyres', () => {
    const { sim, load } = rig();
    const story = new DriveStory(cd, load, sim);
    // Into second gear at full throttle: a clutch that has slipped and heated, sleeves moved, tyres deflected.
    runStory(story, 1 / 3000, 9.3);
    expect(load.control.gearIn(load.vehicle.solver)).toBe('2');
    const copy = new VehicleLoad(spec);
    copy.restore(structuredClone(load.snapshot()));
    const input: CrankInput = { omega: 0, pedal: 0.8, engineNm: 150, engineInertia: cd.map.inertia, state: 'running' };
    for (let i = 0; i < 3000; i++) {
      input.omega = load.crankSpeed + 0.5 * Math.sin(i / 50);
      if (i === 1000) for (const l of [load, copy]) l.command({ kind: 'vehicle', action: 'gear', gear: '3' });
      const a = load.step(input, 1 / 3000);
      const b = copy.step(input, 1 / 3000);
      expect(b.torqueNm).toBe(a.torqueNm);
    }
    expect(copy.snapshot().values).toEqual(load.snapshot().values);
  });

  it('ignores a snapshot of another size', () => {
    const load = new VehicleLoad(spec);
    load.restore({ kind: 'vehicle', values: new Float64Array(3) });
    expect(load.chassis.v).toBe(0);
  });
});

describe('the scripted drive (stage K2c acceptance)', () => {
  const { sim, load } = rig();
  const story = new DriveStory(cd, load, sim);
  const ratio = (name: string) => cd.gears.find((g) => g.name === name)!.ratio;
  let launchMin = Number.POSITIVE_INFINITY;
  let launchMax = 0;
  let reached = false;
  let ran = false;
  let stalled = false;
  runStory(story, 1 / 3000, 90, () => {
    ran ||= sim.state === 'running';
    if (ran && sim.state !== 'running') stalled = true;
    // From the moment the engine first reaches the band until the clutch locks.
    const slipping = load.control.phase === 'launch' && story.phase === 'pull' && load.vehicle.solver.state[load.control.spec.clutch] !== LOCKED;
    reached ||= slipping && sim.rpm >= LAUNCH_RPM[0];
    if (reached && slipping) {
      launchMin = Math.min(launchMin, sim.rpm);
      launchMax = Math.max(launchMax, sim.rpm);
    }
  });

  it('starts, idles, pulls away, shifts up four times, brakes to a stop and idles in neutral without stalling', () => {
    expect(story.done).toBe(true);
    expect(stalled).toBe(false);
    expect(story.shifts.map((s) => `${s.from}→${s.to}`)).toEqual(['1→2', '2→3', '3→4', '4→5']);
    expect(load.chassis.v).toBeLessThan(0.05);
    expect(load.control.gearIn(load.vehicle.solver)).toBe('N');
    expect(Math.abs(sim.rpm - cd.map.idleRpm)).toBeLessThan(50);
    expect(story.topSpeed * 3.6).toBeGreaterThan(170);
  });

  it('the auto clutch holds the engine in its pull-away band while it slips', () => {
    expect(launchMin).toBeGreaterThan(LAUNCH_RPM[0] - 150);
    expect(launchMax).toBeLessThan(LAUNCH_RPM[1] + 150);
  });

  it('every upshift drops the engine to its new gear: the classic drop to 8 %, the drop with the car\'s speed change to 6 %', () => {
    for (const s of story.shifts) {
      expect(s.rpmLocked, `${s.from}→${s.to}`).not.toBeNull();
      expect(s.rpmDrop).toBeCloseTo((s.rpmBefore * ratio(s.to)) / ratio(s.from), 6);
      // Above them by the driven tyres' slip under the new gear's pull, which the car's speed does not show.
      expect(Math.abs(s.rpmLocked! / s.rpmDrop - 1), `${s.from}→${s.to}`).toBeLessThan(0.08);
      expect(Math.abs(s.rpmLocked! / s.rpmAtLock! - 1), `${s.from}→${s.to}`).toBeLessThan(0.06);
      expect(s.tLocked! - s.t).toBeLessThan(0.7);
    }
  });

  it('as the clutch locks the engine turns at the driven wheels\' speed through the gear and the final drive (to 3 %: the shafts wind up)', () => {
    for (const s of story.shifts) expect(Math.abs(s.rpmLocked! / s.rpmWheels! - 1), `${s.from}→${s.to}`).toBeLessThan(0.03);
  });
});
