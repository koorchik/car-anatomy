// The car on its drivetrain (gearbox plan, tests/drivetrain-vehicle 1–8, stage K2b): every car of DRIVE_CARS whose
// record has dynamics, the engine on the stub (the dyno's torque map), the longitudinal chassis, the site's tyre and
// road load. Tests named "calibration" check the calibration script, not the model.
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/data/cars.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { buildCarDrive, carVehicle, CLUTCH, CRANK, type CarDrive } from '../src/drivetrain/car-model.ts';
import { buildCore, elementIndex, memberIndex } from '../src/drivetrain/core.ts';
import { nullSpace } from '../src/drivetrain/linalg.ts';
import { dynamicRun, dynamicTopSpeed, inputForForce, quasiStaticRun, setRolling, steadyTopSpeed } from '../src/drivetrain/runs.ts';
import { vehicleSpec, type CarRecord } from '../src/vehicle/car.ts';
import type { ChassisPort } from '../src/vehicle/chassis-port.ts';
import { G } from '../src/vehicle/constants.ts';
import { LongitudinalChassis, longitudinalSpec } from '../src/vehicle/longitudinal.ts';
import { nonEpaRule, roadLoadCoeffs, roadLoadN } from '../src/vehicle/road-load.ts';
import { longitudinalOf } from '../src/vehicle/tyre.ts';
import { VehicleStep } from '../src/vehicle/vehicle-step.ts';
import { FL, FR, newWheelBus, RL, RR, WHEELS, type WheelBus } from '../src/vehicle/wheel-bus.ts';
import { stepWheels } from '../src/vehicle/wheel.ts';

const H = 1 / 3000;
const KMH = 3.6;
const driven = Object.values(DRIVE_CARS).filter((d) => d.dynamics).map((d) => CARS[d.car]!);
const models = Object.fromEntries(driven.map((car) => [car.id, buildCarDrive(car.id)])) as Record<string, CarDrive>;
const ids = driven.map((c) => c.id);
const chassisOf = (veh: VehicleStep) => veh.chassis as LongitudinalChassis;

it('drives at least the BMW M3 E30', () => {
  expect(ids).toContain('bmw-m3-e30');
});

describe('1. calibration of v_max', () => {
  const unlimited = driven.filter((c) => !c.roadLoad && !c.published.vmaxLimited);
  it.each(unlimited.map((c) => [c.id, c] as const))('%s: the whole model, at full load in its best gear, settles on the published v_max (±2 %)', (id, car) => {
    const cd = models[id]!;
    const steady = steadyTopSpeed(cd);
    const g = cd.gears.find((x) => x.name === steady.gear)!;
    const v0 = (0.98 * car.published.vmaxKmh) / KMH;
    const { v, drift } = dynamicTopSpeed(cd, g, v0, 60, 0.001);
    expect(Math.abs(drift)).toBeLessThan(0.05);
    expect(Math.abs((v * KMH) / car.published.vmaxKmh - 1)).toBeLessThan(0.02);
  });
});

describe('2. limited cars', () => {
  it('never solve C_dA from a top speed a limiter holds: a limited copy of each driven car falls under the brochure rule', () => {
    // No car of DRIVE_CARS is limited yet; the ones that are (Supra, M3 E46, …) come with later stages.
    for (const car of driven) {
      const limited: CarRecord = { ...car, published: { ...car.published, vmaxLimited: true } };
      expect(nonEpaRule(limited)).not.toBe('vmax');
    }
  });
});

describe('3. independent checks', () => {
  const timed = driven.filter((c) => c.published.zeroTo100S !== null);
  it.each(timed.map((c) => [c.id, c] as const))('%s: 0–100 km/h of the whole model is within ±25 % of the published time', (id, car) => {
    const run = dynamicRun(models[id]!);
    expect(Math.abs(run.zeroTo100S! / car.published.zeroTo100S! - 1)).toBeLessThan(0.25);
  });

  it('checks the top speed of every driven car with an EPA row and no limiter within ±7 % (none yet)', () => {
    for (const car of driven.filter((c) => c.roadLoad && !c.published.vmaxLimited)) {
      expect(Math.abs((steadyTopSpeed(models[car.id]!).v * KMH) / car.published.vmaxKmh - 1)).toBeLessThan(0.07);
    }
  });
});

describe('4. road load', () => {
  it.each(ids)('%s: the chassis pushes against the site\'s one road load, the lap\'s at every speed', (id) => {
    const car = CARS[id]!;
    expect(longitudinalSpec(car).roadLoad).toEqual(roadLoadCoeffs(car));
    for (const kmh of [50, 100, 200]) expect(roadLoadN(longitudinalSpec(car).roadLoad, kmh / KMH, 0)).toBeCloseTo(roadLoadN(vehicleSpec(car).roadLoad, kmh / KMH, 0), 9);
  });
});

describe('5. the tyre at zero', () => {
  it.each(ids)('%s: a standing start runs without NaN', (id) => {
    let finite = true;
    dynamicRun(models[id]!, {
      maxS: 3,
      observe: (veh) => {
        const b = veh.bus;
        for (const a of [b.fx, b.fz, b.omega, b.driveNm, veh.solver.phiDot]) for (const x of a) if (!Number.isFinite(x)) finite = false;
      },
    });
    expect(finite).toBe(true);
  });

  it.each(ids)('%s: creeping up a 2 per cent slope at 0.5 m/s on its own wheels and chassis, the tyre force holds still to 1 per cent after 0.2 s', (id) => {
    // The wheels driven straight through the bus with the torque that balances the slope and the road load.
    const cd = models[id]!;
    const chassis = new LongitudinalChassis(longitudinalSpec(cd.car));
    chassis.gradeRad = Math.atan(0.02);
    chassis.v = 0.5;
    const bus = newWheelBus();
    const tyre = longitudinalOf(cd.tyre);
    const states = Array.from({ length: WHEELS }, () => ({ u: 0 }));
    const out = { fx: 0, dFxdOmega: 0, dFxdV: 0 };
    for (let i = 0; i < WHEELS; i++) bus.omega[i] = 0.5 / cd.radius[i]!;
    const rl = chassis.spec.roadLoad;
    const push = rl.massKg * G * Math.sin(chassis.gradeRad) + roadLoadN(rl, 0.5, 0);
    const forces: number[] = [];
    for (let k = 0; k < 2 / H; k++) {
      chassis.preStep(bus);
      for (let i = 0; i < WHEELS; i++) {
        tyre.step(states[i]!, bus.omega[i]!, bus.rEff[i]!, bus.vx[i]!, bus.fz[i]!, bus.surfaceMu[i]!, H, out);
        bus.fx[i] = out.fx;
        bus.dFxdOmega[i] = out.dFxdOmega;
      }
      for (const i of cd.driven) bus.driveNm[i] = (push / 2) * cd.radius[i]!;
      stepWheels(bus, cd.wheelInertia, H);
      chassis.postStep(bus, H);
      if (k * H >= 0.2) forces.push(bus.fx[cd.driven[0]]! + bus.fx[cd.driven[1]]!);
    }
    const mean = forces.reduce((a, b) => a + b, 0) / forces.length;
    expect((Math.max(...forces) - Math.min(...forces)) / mean).toBeLessThan(0.01);
    expect(chassis.v).toBeCloseTo(0.5, 2);
  });
});

describe('6. weight transfer', () => {
  it.each(ids.filter((id) => CARS[id]!.drive === 'rwd'))('%s: accelerating at 0.3 g, the rear axle carries m·g·l_f/L + m·a·h/L', (id) => {
    const cd = models[id]!;
    const car = cd.car;
    const veh = carVehicle(cd);
    const ch = chassisOf(veh);
    const third = cd.gears[2]!;
    setRolling(cd, veh, 60 / KMH, third);
    const s = veh.solver;
    const crank = memberIndex(s.core, CRANK);
    const m = ch.spec.roadLoad.massKg;
    const torque = inputForForce(cd, third, 0.3 * m * G + 900, (60 / KMH / cd.radius[RL]!) * third.ratio * cd.axle.ratio);
    let checked = 0;
    while (veh.time < 2) {
      s.memberTorque[crank] = torque;
      const ax = ch.ax;
      veh.step(H);
      if (veh.time > 1 && Math.abs(ax / G - 0.3) < 0.03) {
        const lf = car.body.wheelbaseM * (1 - car.body.frontShare);
        const rear = (m * G * lf) / car.body.wheelbaseM + (m * ax * ch.spec.cgHeightM) / car.body.wheelbaseM;
        expect(veh.bus.fz[RL]! + veh.bus.fz[RR]!).toBeCloseTo(rear, 6);
        expect(veh.bus.fz[FL]! + veh.bus.fz[FR]! + veh.bus.fz[RL]! + veh.bus.fz[RR]!).toBeCloseTo(m * G, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('7. quasi-static against the whole model', () => {
  it.each(ids)('%s: 0–100 km/h and 0–400 m agree to 3 per cent', (id) => {
    const q = quasiStaticRun(models[id]!);
    const d = dynamicRun(models[id]!);
    expect(Math.abs(d.zeroTo100S! / q.zeroTo100S! - 1)).toBeLessThan(0.03);
    expect(Math.abs(d.zeroTo400mS! / q.zeroTo400mS! - 1)).toBeLessThan(0.03);
  });
});

describe('8. the chassis port', () => {
  const cd = models['bmw-m3-e30']!;

  /** A chassis that only replays loads, speeds and radii recorded from another: the stand-in for ChassisSim. */
  class Replay implements ChassisPort {
    private k = 0;
    private readonly frames: Float64Array[];
    constructor(frames: Float64Array[]) {
      this.frames = frames;
    }
    preStep(bus: WheelBus): void {
      const f = this.frames[this.k++]!;
      for (let i = 0; i < WHEELS; i++) {
        bus.fz[i] = f[i]!;
        bus.vx[i] = f[4 + i]!;
        bus.rEff[i] = f[8 + i]!;
        bus.surfaceMu[i] = f[12 + i]!;
        bus.vy[i] = 0;
        bus.camber[i] = 0;
      }
    }
    postStep(): void {}
    snapshotSize(): number {
      return 0;
    }
    snapshot(): void {}
    restore(): void {}
  }

  it('longitudinal.ts and another chassis writing the same port give the drivetrain the same wheel speeds to 1e-9', () => {
    const drive = (chassis?: ChassisPort) => {
      const veh = chassis ? new VehicleStep({ core: cd.core, chassis, tyres: Array(4).fill(longitudinalOf(cd.tyre)), wheelInertia: cd.wheelInertia, propshaft: cd.core.springs.ids.indexOf('propshaft') }) : carVehicle(cd);
      const g = cd.gears[1]!;
      setRolling(cd, veh, 30 / KMH, g);
      if (chassis) for (let i = 0; i < WHEELS; i++) veh.bus.omega[i] = 30 / KMH / cd.radius[i]!;
      const crank = memberIndex(veh.solver.core, CRANK);
      const frames: Float64Array[] = [];
      const omegas: number[][] = [];
      for (let k = 0; k < 1 / H; k++) {
        veh.solver.memberTorque[crank] = k < 0.3 / H ? 60 : 160;
        veh.step(H);
        const b = veh.bus;
        frames.push(Float64Array.from([...b.fz, ...b.vx, ...b.rEff, ...b.surfaceMu]));
        omegas.push([...b.omega]);
      }
      return { frames, omegas };
    };
    const a = drive();
    const b = drive(new Replay(a.frames));
    a.omegas.forEach((w, k) => w.forEach((x, i) => expect(Math.abs(x - b.omegas[k]![i]!)).toBeLessThan(1e-9)));
  });

  it('keeps the momentum crossing the halfshafts: with nothing outside, the rigid-mode momentum of drivetrain and wheels stays', () => {
    // No spin loss, no losses, no road: the car on a lift, first gear, the shafts wound up and let go.
    const core = buildCore({ ...cd.draft, drag: null, losses: [], diffs: [] });
    const lift: ChassisPort = {
      preStep: (bus) => {
        bus.fz.fill(0);
        bus.vx.fill(0);
        bus.rEff.set(cd.radius);
      },
      postStep: () => {},
      snapshotSize: () => 0,
      snapshot: () => {},
      restore: () => {},
    };
    const veh = new VehicleStep({ core, chassis: lift, tyres: Array(4).fill(longitudinalOf(cd.tyre)), wheelInertia: cd.wheelInertia, propshaft: core.springs.ids.indexOf('propshaft') });
    const s = veh.solver;
    s.command[elementIndex(core, CLUTCH)] = 1;
    s.command[elementIndex(core, cd.gears[0]!.element)] = 600;
    veh.bus.angle[RL] = 0.05;
    veh.bus.angle[RR] = -0.02;
    veh.bus.omega[RL] = 3;
    s.phi[core.coords.indexOf(CRANK)] = 0.3;
    // The rigid motion: locks closed, the springs between members rigid, the two sides together; per unit side speed.
    const { n, P } = core;
    const rows = [
      ...[CLUTCH, cd.gears[0]!.element].map((id) => Array.from(core.elements.rows.subarray(elementIndex(core, id) * n, (elementIndex(core, id) + 1) * n))),
      ...core.springs.ids.flatMap((_, j) => (core.springs.anchor[j]! >= 0 ? [] : [Array.from(core.springs.rows.subarray(j * n, (j + 1) * n))])),
      Array.from({ length: n }, (_, k) => P[memberIndex(core, 'side-left') * n + k]! - P[memberIndex(core, 'side-right') * n + k]!),
    ];
    const basis = nullSpace(rows, n).basis.map((r) => r[0]!);
    const unit = basis.reduce((a, v, k) => a + P[memberIndex(core, 'side-left') * n + k]! * v, 0);
    const rigid = core.members.map((_, i) => basis.reduce((a, v, k) => a + P[i * n + k]! * v, 0) / unit);
    const momentum = () =>
      core.members.reduce((a, _, i) => a + core.inertia[i]! * s.memberSpeed(i) * rigid[i]!, 0) +
      cd.driven.reduce((a, w) => a + cd.wheelInertia[w]! * veh.bus.omega[w]!, 0);
    const p0 = momentum();
    let swing = 0;
    for (let k = 0; k < 1 / H; k++) {
      veh.step(H);
      swing = Math.max(swing, Math.abs(veh.bus.driveNm[RL]!));
      expect(Math.abs(momentum() - p0)).toBeLessThan(1e-9 * Math.max(1, Math.abs(p0)));
    }
    expect(swing).toBeGreaterThan(100);
  });
});
