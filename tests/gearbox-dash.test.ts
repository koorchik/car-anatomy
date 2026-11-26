// The full dash of the car mode (stage K3b): the clutch's heat the dash shows is the core's, the rev matching takes the
// jolt out of a downshift, a clutch dropped without gas stalls the engine, the E30 pulls away up a 15 % grade and rolls
// back without gas, demonstration 3 tells and shows the classic drop on the E30's ratios, the gate is the dogleg of the
// Getrag 265, and the traction chart and the hints read the same force the core applies. The drives step the solver in
// Node for tens of simulated seconds, so they get the time the sound tests get on a busy machine.

import { describe, expect, it } from 'vitest';
import { synthConfig } from '../src/audio/synth.ts';
import { buildCarDrive } from '../src/data/car-drive.ts';
import { carById } from '../src/data/cars.ts';
import { engineById } from '../src/data/engines.ts';
import { GEARBOX_PAGES } from '../src/data/gearboxes.ts';
import { vehicleLoadSpec } from '../src/drivetrain/car-load.ts';
import { DriveStory, runStory } from '../src/drivetrain/drive-story.ts';
import { forceFromInput } from '../src/drivetrain/runs.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { LoadedCrank } from '../src/engine/loaded-crank.ts';
import { EngineSim } from '../src/engine/sim.ts';
import { pullAwayDemo, shiftDrop, shiftingDemo, SHIFT_DEMO_RPM, type CarDemo, type DemoControls, type DemoView } from '../src/ui/gearboxes/car-demos.ts';
import { DriveMeter, DriveStrip, STRIP_RATE, STRIP_SECONDS } from '../src/ui/gearboxes/drive-meter.ts';
import { DEFAULT_DRIVE_SETTINGS, gradeRad } from '../src/ui/gearboxes/drive-panel.ts';
import { constrain, gateLayout } from '../src/ui/gearboxes/gate.ts';
import { mapTorque, runTorque, sameEngine, shiftHint, traction } from '../src/ui/gearboxes/traction.ts';
import { wheelSlip } from '../src/ui/gearboxes/wheel-road.ts';
import type { Run } from '../src/ui/dyno/runs.ts';
import { VehicleLoad } from '../src/vehicle/vehicle-load.ts';

const CAR = 'bmw-m3-e30';
const DT = 1 / 3000;

function rig() {
  const cd = buildCarDrive(CAR);
  const load = new VehicleLoad(vehicleLoadSpec(cd));
  const sim = new EngineSim(synthConfig(buildEngine(engineById(carById(CAR)!.engine)!)).sim);
  sim.attach(new LoadedCrank(cd.map, load));
  const command = (c: Record<string, unknown>) => load.command({ kind: 'vehicle', ...c } as Parameters<VehicleLoad['command']>[0]);
  const run = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += DT) {
      sim.step(DT);
      each?.();
    }
  };
  return { cd, load, sim, command, run, clutch: load.control.spec.clutch };
}

/** Runs one step of a demonstration on a fresh car the way the page does, a frame every 1/30 s; its result. */
function runDemoStep(make: (cd: ReturnType<typeof buildCarDrive>) => CarDemo, at: number, maxS = 40): { done: boolean; result: string; r: ReturnType<typeof rig> } {
  const r = rig();
  const settings = { ...DEFAULT_DRIVE_SETTINGS };
  const meter = new DriveMeter();
  const controls: DemoControls = {
    gas: (v) => (r.sim.pedal = v),
    clutch: (v) => r.command({ action: 'clutch', pedal: v }),
    gear: (gear) => r.command({ action: 'gear', gear }),
    brake: (value) => r.command({ action: 'brake', value }),
    settings: (patch) => {
      Object.assign(settings, patch);
      r.command({ action: 'autoClutch', on: settings.autoClutch });
      r.command({ action: 'revMatch', on: settings.revMatch });
      r.command({ action: 'road', gradeRad: gradeRad(settings.gradePct), surfaceMu: [1, 1, 1, 1] });
    },
    start: () => r.sim.start(),
  };
  const step = make(r.cd).steps[at]!;
  const view: DemoView = { rpm: 0, speed: 0, gear: 'N', shift: 'engaged', accel: 0, running: false, launchJ: 0, clutchJ: 0, clutchC: 0, slip: 0 };
  const frame = 1 / 30;
  let done = false;
  for (let t = 0; t < maxS && !done; t += frame) {
    r.run(frame);
    const f = r.load.frame();
    meter.step(f, frame);
    Object.assign(view, {
      rpm: r.sim.rpm, speed: f.speed, gear: f.gear, shift: f.shift, accel: f.accel, running: r.sim.state === 'running',
      launchJ: meter.figures.launchJ, clutchJ: f.clutchJ, clutchC: f.clutchC, slip: wheelSlip(f, r.cd.driven[0]).slip,
    });
    done = step.frame(view, controls, frame);
  }
  return { done, result: step.result(), r };
}

describe('the full dash in the car', () => {
  it('counts the clutch\'s heat as the core does: in the frame, in the readings and for the last pull-away', () => {
    const { cd, load, sim, clutch } = rig();
    const story = new DriveStory(cd, load, sim);
    Object.assign(story.o, { idleS: 1, topS: 1, endIdleS: 0.5, downshift: true });
    const meter = new DriveMeter();
    let base = 0;
    let checked = 0;
    let n = 0;
    runStory(story, DT, 90, () => {
      if (n++ % 100) return;
      const f = load.frame();
      const core = load.vehicle.solver.energy[clutch]!;
      expect(f.clutchJ).toBe(core);
      // The meter's pull-away heat is the core's counter since the car last stood with the clutch at rest.
      if (Math.abs(f.speed) < 0.15 && Math.abs(f.clutchSlip) < 0.5) base = core;
      const fig = meter.step(structuredClone(f), 100 * DT);
      expect(fig.launchJ).toBeCloseTo(core - base, 6);
      checked++;
    });
    expect(story.done).toBe(true);
    expect(checked).toBeGreaterThan(100);
    const total = load.vehicle.solver.energy[clutch]!;
    expect(total).toBeGreaterThan(1000);
    expect(load.readings().clutchJ).toBe(total);
    // The pull-away was timed: 0–100 km/h within a sane range for the E30 [the model's figure, not a published one].
    expect(meter.figures.to100).not.toBeNull();
    expect(meter.figures.to100!).toBeGreaterThan(5);
    expect(meter.figures.to100!).toBeLessThan(12);
  }, 60_000);

  it('takes the jolt out of a downshift with the rev matching: the engine meets the gear before the clutch closes', () => {
    const down = (revMatch: boolean) => {
      const r = rig();
      r.sim.start();
      r.run(1.5);
      r.command({ action: 'revMatch', on: revMatch });
      r.command({ action: 'gear', gear: '1' });
      r.run(0.6);
      r.sim.pedal = 0.6;
      r.run(2.5);
      r.sim.pedal = 0;
      r.command({ action: 'gear', gear: '2' });
      r.run(0.6);
      r.sim.pedal = 0.6;
      r.run(2);
      r.sim.pedal = 0;
      r.command({ action: 'gear', gear: '3' });
      r.run(0.6);
      r.sim.pedal = 0.5;
      r.run(2);
      r.sim.pedal = 0;
      const j0 = r.load.vehicle.solver.energy[r.clutch]!;
      r.command({ action: 'gear', gear: '2' });
      let minA = 0;
      let blipped = false;
      r.run(1.2, () => {
        minA = Math.min(minA, r.load.chassis.ax);
        blipped ||= r.load.control.blip > 0;
      });
      expect(r.load.control.gearIn(r.load.vehicle.solver)).toBe('2');
      return { heat: r.load.vehicle.solver.energy[r.clutch]! - j0, minA, blipped };
    };
    const plain = down(false);
    const matched = down(true);
    expect(plain.blipped).toBe(false);
    expect(matched.blipped).toBe(true);
    // Without the blip the clutch drags the engine up to the shaft: hundreds of joules and a dip of over 2 m/s².
    expect(plain.heat).toBeGreaterThan(300);
    expect(matched.heat).toBeLessThan(0.1 * plain.heat);
    expect(plain.minA).toBeLessThan(-2);
    expect(matched.minA).toBeGreaterThan(plain.minA + 1);
  }, 60_000);

  it('stalls when the driver drops the clutch in first without gas, and the auto clutch never does', () => {
    for (const auto of [false, true]) {
      const r = rig();
      r.sim.start();
      r.run(1.5);
      r.command({ action: 'autoClutch', on: auto });
      r.command({ action: 'clutch', pedal: 1 });
      r.run(0.3);
      r.command({ action: 'gear', gear: '1' });
      r.run(0.6);
      expect(r.sim.state).toBe('running');
      r.command({ action: 'clutch', pedal: 0 });
      r.run(2);
      expect(r.sim.state, auto ? 'auto clutch' : 'driver').toBe(auto ? 'running' : 'off');
    }
  }, 60_000);

  it('demonstration 2: drops the clutch to a stall, rolls back down a 15 % grade without gas and pulls up it with gas', () => {
    const stall = runDemoStep(() => pullAwayDemo(), 1);
    expect(stall.done).toBe(true);
    expect(stall.r.sim.state).toBe('off');
    expect(stall.result).toMatch(/заглух/);
    const back = runDemoStep(() => pullAwayDemo(), 3);
    expect(back.done).toBe(true);
    expect(back.result).toMatch(/назад/);
    const up = runDemoStep(() => pullAwayDemo(), 4);
    expect(up.done).toBe(true);
    expect(up.r.sim.state).toBe('running');
    expect(up.r.load.chassis.x).toBeGreaterThan(5);
    expect(up.result).toMatch(/вгору/);
  }, 120_000);

  it('demonstration 3 on the E30: 1→2 at 6750 rpm drops the engine to 6750·2.404/3.717 ≈ 4366, as the model drives it', () => {
    const cd = buildCarDrive(CAR);
    const [first, second] = cd.gears;
    expect(first!.ratio).toBeCloseTo(3.717, 2);
    expect(second!.ratio).toBeCloseTo(2.404, 2);
    expect(SHIFT_DEMO_RPM).toBe(6750);
    expect(shiftDrop(6750, 3.717, 2.404)).toBeCloseTo(4366, 0);
    const text = shiftingDemo(cd).steps[0]!.text.replace(/\s/g, '');
    expect(text).toContain(Math.round(shiftDrop(6750, first!.ratio, second!.ratio)).toLocaleString('uk-UA').replace(/\s/g, ''));
    const { done, result, r } = runDemoStep((c) => shiftingDemo(c), 0);
    expect(done).toBe(true);
    expect(r.sim.state).toBe('running');
    // Driven: at the lock the engine turns at the drop from the speed at the lever, within what the car gained meanwhile.
    // «перед перемиканням B об/хв, і B · r2/r1 = E; … — A об/хв»: the whole numbers are B, B, E and A.
    const [before, , expected, after] = (result.replace(/[\s\u202f\u00a0]/g, '').match(/\d+(?:,\d+)?/g) ?? []).filter((x) => !x.includes(',')).map(Number);
    expect(before!).toBeGreaterThanOrEqual(6750);
    expect(before!).toBeLessThan(7100);
    expect(expected!).toBeCloseTo(shiftDrop(before!, first!.ratio, second!.ratio), -1);
    expect(Math.abs(after! - expected!) / expected!).toBeLessThan(0.05);
  }, 120_000);

  it('lays out the Getrag 265 as a dogleg, first back on the left, and lets the lever cross only in neutral', () => {
    const e30 = GEARBOX_PAGES.find((p) => p.id === 'manual-rwd')!.base;
    if (e30.layout.kind !== 'layshaft') throw new Error('layshaft expected');
    const gate = gateLayout(e30.layout.desc.sleeves);
    expect(gate.planes).toBe(3);
    const at = (name: string) => gate.slots.find((s) => s.name === name);
    expect(at('R')).toEqual({ name: 'R', plane: 0, up: true });
    expect(at('1')).toEqual({ name: '1', plane: 0, up: false });
    expect(at('2')).toEqual({ name: '2', plane: 1, up: true });
    expect(at('3')).toEqual({ name: '3', plane: 1, up: false });
    expect(at('4')).toEqual({ name: '4', plane: 2, up: true });
    expect(at('5')).toEqual({ name: '5', plane: 2, up: false });
    // In first, a drag toward third stays in the plane of first; in neutral it moves across.
    expect(constrain({ u: 0, v: 1 }, { u: 1, v: 1 }, 3)).toEqual({ u: 0, v: 1 });
    expect(constrain({ u: 0, v: 0 }, { u: 0.5, v: 0.6 }, 3)).toEqual({ u: 0.5, v: 0 });
    expect(constrain({ u: 0.5, v: 0 }, { u: 1.05, v: 0.7 }, 3)).toEqual({ u: 1, v: 0.7 });
  });

  it('draws the traction from the core\'s own force, and from the last dyno run only when it was made on this engine', () => {
    const cd = buildCarDrive(CAR);
    const tr = traction(cd, 0, null);
    expect(tr.source).toBe('map');
    expect(tr.gears.map((g) => g.gear)).toEqual(['1', '2', '3', '4', '5']);
    // A point of second: the force the core applies at that input torque and speed.
    const g2 = cd.gears[1]!;
    const curve = tr.gears[1]!;
    const i = 20;
    const omegaIn = (curve.kmh[i]! / 3.6 / cd.radius[cd.driven[0]]!) * g2.ratio * cd.axle.ratio;
    expect(curve.force[i]!).toBeCloseTo(forceFromInput(cd, g2, mapTorque(cd.map)((omegaIn * 30) / Math.PI)!, omegaIn), 6);
    // The road on a 15 % grade needs more than on the level at every speed.
    const hill = traction(cd, gradeRad(15), null);
    hill.road.force.forEach((f, k) => expect(f).toBeGreaterThan(tr.road.force[k]!));
    // A full-throttle run of this engine replaces the map; one of another engine does not.
    const points = Array.from({ length: 30 }, (_, k) => {
      const rpm = 1500 + k * 200;
      return { rpm, nm: 200, inertiaNm: 10, manifoldBar: 1, settled: true };
    });
    const run = { kind: 'sweep', engine: 'S14', map: cd.map, absorber: 'eddy', rate: 300, throttle: null, points, stopped: null, stoppedAt: null } as unknown as Run;
    expect(sameEngine(cd.map, structuredClone(cd.map))).toBe(true);
    expect(runTorque(run, cd.map)!(3000)).toBeCloseTo(210, 9);
    expect(traction(cd, 0, run).source).toBe('dyno');
    const other = buildCarDrive('bmw-m3-e30').map;
    const foreign = { ...run, map: { ...other, wotNm: other.wotNm.map((v) => v * 1.1) } } as Run;
    expect(runTorque(foreign, cd.map)).toBeNull();
    expect(traction(cd, 0, { ...run, throttle: 0.5 } as Run).source).toBe('map');
  });

  it('hints an upshift at the limiter and a downshift when the engine labours', () => {
    const cd = buildCarDrive(CAR);
    const v1 = ((cd.map.limitRpm - 100) / 30) * Math.PI / (cd.gears[0]!.ratio * cd.axle.ratio) * cd.radius[cd.driven[0]]!;
    expect(shiftHint(cd, '1', cd.map.limitRpm - 100, v1, 1)).toEqual({ direction: 'up', to: '2' });
    expect(shiftHint(cd, '3', cd.map.idleRpm * 1.2, 8, 0.3)).toEqual({ direction: 'down', to: '2' });
    expect(shiftHint(cd, '5', 3000, 30, 0.3)).toBeNull();
  });

  it('keeps ten seconds of the drive for the strip', () => {
    const { load } = rig();
    const strip = new DriveStrip();
    const f = load.frame();
    for (let k = 0; k < 20 * 60; k++) strip.step({ ...f, speed: k }, 1000, 1 / 60);
    expect(strip.count).toBe(STRIP_SECONDS * STRIP_RATE);
    // The newest is last, the oldest ten seconds back.
    expect(strip.at('kmh', strip.count - 1)).toBeCloseTo((20 * 60 - 1) * 3.6, 0);
    expect(strip.at('kmh', strip.count - 1) - strip.at('kmh', 0)).toBeCloseTo((STRIP_SECONDS * 60 - 2) * 3.6, -1);
  });
});
