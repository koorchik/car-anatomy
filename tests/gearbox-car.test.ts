// The car mode of the gearbox page (stage K3a): the dash says what drive.snapshot() says, the 3D turns every member of
// the box as the solver has it, and the car's frame crosses threads as plain data.

import { describe, expect, it } from 'vitest';
import type { DriveSnapshot } from '../src/audio/drive.ts';
import { synthConfig } from '../src/audio/synth.ts';
import { buildCarDrive } from '../src/data/car-drive.ts';
import { carById } from '../src/data/cars.ts';
import { engineById } from '../src/data/engines.ts';
import { vehicleLoadSpec } from '../src/drivetrain/car-load.ts';
import { DriveStory, runStory } from '../src/drivetrain/drive-story.ts';
import { DrivePose } from '../src/drivetrain/drive-pose.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { LoadedCrank } from '../src/engine/loaded-crank.ts';
import { EngineSim } from '../src/engine/sim.ts';
import { carReadings } from '../src/ui/gearboxes/car-readings.ts';
import { wheelSlip } from '../src/ui/gearboxes/wheel-road.ts';
import { VehicleLoad } from '../src/vehicle/vehicle-load.ts';

const CAR = 'bmw-m3-e30';

function drive() {
  const cd = buildCarDrive(CAR);
  const spec = vehicleLoadSpec(cd);
  const load = new VehicleLoad(spec);
  const sim = new EngineSim(synthConfig(buildEngine(engineById(carById(CAR)!.engine)!)).sim);
  sim.attach(new LoadedCrank(cd.map, load));
  const story = new DriveStory(cd, load, sim);
  Object.assign(story.o, { idleS: 1, topS: 1.5, endIdleS: 0.5, downshift: true });
  return { cd, spec, load, sim, story };
}

/** The snapshot the main-thread copy gives for this state, as Drive builds it, its frame through a postMessage. */
const snapshotOf = (sim: EngineSim, load: VehicleLoad): DriveSnapshot => ({
  angle: sim.angle, rpm: sim.rpm, state: sim.state, load: sim.load, throttle: sim.throttle, fuelCut: sim.fuelCut, boost: sim.boost,
  vehicle: structuredClone(load.frame()),
});

describe('the car mode', () => {
  it('reads its dash from the snapshot alone: speed, gear and revs are the car\'s, all the way through a drive', () => {
    const { load, sim, story } = drive();
    const seen = { gears: new Set<string>(), clutch: new Set<string>(), top: 0 };
    let n = 0;
    runStory(story, 1 / 3000, 90, () => {
      if (n++ % 300) return;
      const r = carReadings(snapshotOf(sim, load))!;
      expect(r.kmh).toBe(Math.round(Math.abs(load.chassis.v) * 3.6));
      expect(r.rpm).toBe(Math.round(sim.rpm));
      expect(r.gear).toBe(load.control.gearIn(load.vehicle.solver));
      seen.gears.add(r.gear);
      seen.clutch.add(r.clutch);
      seen.top = Math.max(seen.top, r.kmh);
    });
    expect(story.done).toBe(true);
    expect([...seen.gears].sort()).toEqual(['1', '2', '3', '4', '5', 'N']);
    expect([...seen.clutch].sort()).toEqual(['locked', 'open', 'slipping']);
    expect(seen.top).toBeGreaterThan(150);
    // Without a car on the crank there is no car dash.
    expect(carReadings({ ...snapshotOf(sim, load), vehicle: undefined })).toBeNull();
  });

  it('turns every member of the box by the core\'s P·φ: the angles the solver has, and the teeth in mesh', () => {
    const { cd, spec, load, sim, story } = drive();
    const pose = new DrivePose(cd.box, spec.drivetrain);
    const solver = load.vehicle.solver;
    const members = cd.box.members.map((id) => spec.drivetrain.members.indexOf(id));
    let checked = 0;
    let n = 0;
    runStory(story, 1 / 3000, 20, () => {
      if (n++ % 1500) return;
      const p = pose.update(structuredClone(load.frame()), 0.5);
      members.forEach((m, i) => expect(p.angles[i]!).toBeCloseTo(solver.memberAngle(m), 9));
      // Every mesh: the two gears' angles keep the ratio of their teeth (ω_a·z_a = −ω_b·z_b, so θ too, from zero).
      for (const mesh of cd.box.meshes) {
        const a = cd.box.members.indexOf(cd.box.spec.gears.find((g) => g.id === mesh.a)!.member);
        const b = cd.box.members.indexOf(cd.box.spec.gears.find((g) => g.id === mesh.b)!.member);
        const za = cd.box.spec.gears.find((g) => g.id === mesh.a)!.teeth;
        const zb = cd.box.spec.gears.find((g) => g.id === mesh.b)!.teeth;
        expect(p.angles[a]! * za + p.angles[b]! * zb).toBeCloseTo(0, 6);
      }
      checked++;
    });
    expect(checked).toBeGreaterThan(10);
    expect(sim.state).toBe('running');
  });

  it('pushes the sleeve of the gear asked for, home once it holds, and lights the power path through it', () => {
    const { cd, spec, load } = drive();
    const pose = new DrivePose(cd.box, spec.drivetrain);
    const third = cd.box.states.find((s) => s.name === '3')!;
    const frame = (lever: string, gear: string, clutch: number) => ({ ...load.frame(), lever, gear, clutch });
    const run = (seconds: number, f: ReturnType<typeof frame>) => {
      let p = pose.update(f, 0);
      for (let t = 0; t < seconds; t += 1 / 60) p = pose.update(f, 1 / 60);
      return p;
    };
    // Pushed, the synchroniser still working: the sleeve waits part way, and nothing glows yet.
    let p = run(1, frame('3', 'N', 0));
    let moved = Object.values(p.sleeves).filter((v) => v !== 0);
    expect(moved).toHaveLength(1);
    expect(Math.abs(moved[0]!)).toBeGreaterThan(0.3);
    expect(Math.abs(moved[0]!)).toBeLessThan(1);
    expect(Math.max(...p.meshPower)).toBe(0);
    // Holding, the clutch half up: home, and the meshes of third glow with half their power.
    p = run(1, frame('3', '3', 0.5));
    moved = Object.values(p.sleeves).filter((v) => v !== 0);
    expect(moved.map(Math.abs)).toEqual([1]);
    third.meshLoads!.forEach((m, j) => expect(p.meshPower[j]!).toBeCloseTo(m.power * 0.5, 9));
    // Into fourth: out of third to neutral first, then in.
    p = pose.update(frame('4', 'N', 0), 0.05);
    expect(Object.values(p.sleeves).filter((v) => v !== 0)).toHaveLength(1);
    p = run(1, frame('4', '4', 1));
    expect(Object.values(p.sleeves).filter((v) => v !== 0).map(Math.abs)).toEqual([1]);
    const fourth = cd.box.states.find((s) => s.name === '4')!;
    fourth.meshLoads!.forEach((m, j) => expect(p.meshPower[j]!).toBeCloseTo(m.power, 9));
  });

  it('fills a frame in place for the main-thread copy, the same figures as a new one', () => {
    const { load, story } = drive();
    const kept = load.frame();
    runStory(story, 1 / 3000, 6, () => undefined);
    const fresh = load.frame();
    expect(load.frame(kept)).toBe(kept);
    expect(kept).toEqual(fresh);
    expect(fresh.speed).toBeGreaterThan(1);
  });

  it('shows the slip of a driven wheel: none rolling, positive spinning, negative locked', () => {
    const { load } = drive();
    const r = 0.3;
    const f = { ...load.frame(), wheelRadius: Float64Array.of(r, r, r, r) };
    const at = (speed: number, omega: number) => wheelSlip({ ...f, speed, wheelOmega: Float64Array.of(0, 0, omega, omega) }, 2);
    expect(at(20, 20 / r).slip).toBeCloseTo(0, 9);
    expect(at(20, 22 / r).slip).toBeCloseTo(0.1, 9);
    expect(at(20, 0).slip).toBeCloseTo(-1, 9);
    expect(at(0, 2 / r).slip).toBeCloseTo(2, 9);
    expect(at(20, 22 / r).wheelKmh).toBeCloseTo(79.2, 6);
  });
});
