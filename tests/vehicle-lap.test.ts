import { describe, expect, it } from 'vitest';
import { buildTrack, TEST_CIRCUIT, type Track, type TrackDef } from '../src/vehicle/track.ts';
import { lagFilter, sampleDt, sampleLap, newLapSample, simulateLap } from '../src/vehicle/lap.ts';
import { idealGearbox, topSpeed } from '../src/vehicle/powertrain.ts';
import { carToEngine, surfaceSlope } from '../src/vehicle/mount.ts';
import { AIR_DENSITY, dragForce, G, TYRES, type EngineMount, type VehicleSpec } from '../src/vehicle/vehicle.ts';

const CAR: VehicleSpec = {
  name: 'test',
  massKg: 1600,
  cdA: 0.7,
  clA: 0,
  crr: 0.015,
  drive: 'rwd',
  drivenShare: 0.55,
  tyreRadiusM: 0.33,
  mount: { axis: 'longitudinal', front: 'forward', position: 'front' },
};
const TORQUE = (rpm: number): number => 520 * (1 - ((rpm - 4500) / 6000) ** 2);
const PEAK_W = (() => {
  let best = 0;
  for (let rpm = 1000; rpm <= 6500; rpm += 10) best = Math.max(best, (TORQUE(rpm) * rpm * 2 * Math.PI) / 60);
  return best;
})();
const vTop = topSpeed(CAR, PEAK_W, 0.85);
const PT = idealGearbox({ torqueAt: TORQUE, idleRpm: 800, redlineRpm: 6500, gears: 6, spread: 4.3, topSpeedMs: vTop, tyreRadiusM: 0.33, efficiency: 0.85 });
const circuit = buildTrack(TEST_CIRCUIT);

/** A closed circle of radius R, built by hand: a skidpad. */
function skidpad(R: number): Track {
  const n = Math.round(2 * Math.PI * R);
  const ds = (2 * Math.PI * R) / n;
  const track: Track = {
    def: { id: 'skidpad', name: 'skidpad', pieces: [] },
    length: 2 * Math.PI * R,
    ds,
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    heading: new Float32Array(n),
    kappa: new Float32Array(n).fill(1 / R),
    kappaV: new Float32Array(n),
    sector: new Int16Array(n).fill(-1),
    sectors: [],
    closers: { a: 0, b: 0 },
  };
  for (let i = 0; i < n; i++) {
    const a = (i * ds) / R;
    track.x[i] = R * Math.sin(a);
    track.y[i] = R - R * Math.cos(a);
    track.heading[i] = a;
  }
  return track;
}

describe('lap simulation', () => {
  it('holds a skidpad at the speed the tyres allow', () => {
    const R = 50;
    for (const tyre of Object.values(TYRES)) {
      const lap = simulateLap(skidpad(R), CAR, tyre, PT);
      const expected = Math.sqrt(tyre.mu * G * R);
      for (let i = 0; i < lap.v.length; i += 17) {
        expect(Math.abs(lap.v[i]! / expected - 1)).toBeLessThan(0.005);
        expect(Math.abs(lap.ay[i]! / (tyre.mu * G) - 1)).toBeLessThan(0.01);
      }
    }
  });

  it('never asks the tyres for more than their friction ellipse', () => {
    for (const tyre of Object.values(TYRES)) {
      const lap = simulateLap(circuit, CAR, tyre, PT);
      const n = circuit.n;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        // Accelerating segments are limited at their start, braking ones at their end, as the passes run.
        const k = lap.ax[i]! >= 0 ? i : j;
        const v = lap.v[k]!;
        const gn = G + v * v * circuit.kappaV[k]!;
        const tyreX = lap.ax[i]! + dragForce(CAR, v) / CAR.massKg;
        const lat = v * v * Math.abs(circuit.kappa[k]!);
        const use = (tyreX / (tyre.mu * gn)) ** 2 + (lat / (tyre.mu * gn)) ** 2;
        expect(use).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('corners at μg and brakes at μg plus drag at most', () => {
    for (const tyre of Object.values(TYRES)) {
      const lap = simulateLap(circuit, CAR, tyre, PT);
      let lat = 0;
      let brake = 0;
      let vMax = 0;
      for (let i = 0; i < circuit.n; i++) {
        lat = Math.max(lat, Math.abs(lap.ay[i]!));
        brake = Math.max(brake, -lap.ax[i]!);
        vMax = Math.max(vMax, lap.v[i]!);
      }
      expect(Math.abs(lat / (tyre.mu * G) - 1)).toBeLessThan(0.01);
      expect(brake).toBeGreaterThanOrEqual(tyre.mu * G * 0.999);
      expect(brake).toBeLessThanOrEqual(tyre.mu * G + dragForce(CAR, vMax) / CAR.massKg + 1e-6);
    }
  });

  it('needs at least the physical distance to brake from 200 to 60 km/h', () => {
    const tyre = TYRES.street;
    const lap = simulateLap(circuit, CAR, tyre, PT);
    let vMax = 0;
    let at = 0;
    for (let i = 0; i < circuit.n; i++) if (lap.v[i]! > vMax) [vMax, at] = [lap.v[i]!, i];
    const v1 = Math.min(200 / 3.6, vMax);
    const v2 = 60 / 3.6;
    let start = -1;
    let end = -1;
    for (let k = 0; k < circuit.n; k++) {
      const i = (at + k) % circuit.n;
      if (start < 0 && lap.v[i]! <= v1) start = k;
      if (start >= 0 && lap.v[i]! <= v2) {
        end = k;
        break;
      }
    }
    expect(end).toBeGreaterThan(start);
    const distance = (end - start) * circuit.ds;
    const best = (v1 * v1 - v2 * v2) / (2 * (tyre.mu * G + dragForce(CAR, v1) / CAR.massKg));
    expect(distance).toBeGreaterThanOrEqual(best - circuit.ds);
  });

  it('reaches top speed on a long straight, where full power meets drag', () => {
    const long: TrackDef = {
      id: 'long',
      name: 'long',
      pieces: [
        { kind: 'straight', length: 30000, closer: 'a' },
        { kind: 'arc', radius: 2500, angle: 120 },
        { kind: 'straight', length: 30000, closer: 'b' },
        { kind: 'arc', radius: 2500, angle: 120 },
        { kind: 'straight', length: 30000 },
        { kind: 'arc', radius: 2500, angle: 120 },
      ],
    };
    const lap = simulateLap(buildTrack(long, 5), CAR, TYRES.street, PT);
    let vMax = 0;
    let rising = true;
    for (let i = 1; i < 2000; i++) if (lap.v[i]! < lap.v[i - 1]! - 1e-9) rising = false;
    for (let i = 0; i < lap.v.length; i++) vMax = Math.max(vMax, lap.v[i]!);
    expect(rising).toBe(true);
    // Top speed is geared at the limiter, so the car gets within a hair of it.
    expect(Math.abs(vMax / vTop - 1)).toBeLessThan(0.01);
    const need = (0.5 * AIR_DENSITY * CAR.cdA * vTop ** 2 + CAR.crr * CAR.massKg * G) * vTop;
    expect(need / (0.85 * PEAK_W)).toBeCloseTo(1, 3);
  });

  it('laps faster on more grip', () => {
    const times = (['street', 'semi', 'slick'] as const).map((id) => simulateLap(circuit, CAR, TYRES[id], PT).lapTime);
    expect(times[0]!).toBeGreaterThan(times[1]!);
    expect(times[1]!).toBeGreaterThan(times[2]!);
    // Order of magnitude: a 2.2 km club circuit takes about a minute.
    expect(times[0]!).toBeGreaterThan(50);
    expect(times[0]!).toBeLessThan(110);
  });

  it('is periodic: the lap ends at the speed it starts with', () => {
    const lap = simulateLap(circuit, CAR, TYRES.semi, PT);
    const n = circuit.n;
    const last = lap.v[n - 1]!;
    const step = Math.sqrt(Math.max(0, last * last + 2 * lap.ax[n - 1]! * circuit.ds));
    expect(Math.abs(step - lap.v[0]!)).toBeLessThan(0.1);
  });

  it('lags the chassis by its time constant', () => {
    const n = 400;
    const x = new Float32Array(n);
    for (let i = 100; i < 300; i++) x[i] = 1;
    const dt = new Float64Array(n).fill(0.01);
    const out = new Float32Array(n);
    lagFilter(x, dt, 0.15, out);
    const reached = [...out].findIndex((v, i) => i >= 100 && v >= 1 - Math.exp(-1));
    expect(Math.abs(reached - 100 - 15)).toBeLessThanOrEqual(1);
  });

  it('samples the lap in time, wrapping past its end', () => {
    const lap = simulateLap(circuit, CAR, TYRES.street, PT);
    const s = newLapSample();
    sampleLap(lap, lap.t[500]! + 0.5 * sampleDt(lap, 500), s);
    expect(s.index).toBe(500);
    expect(s.v).toBeGreaterThan(Math.min(lap.v[500]!, lap.v[501]!) - 1e-6);
    sampleLap(lap, lap.lapTime + lap.t[10]!, s);
    expect(s.index).toBe(10);
  });

  it('is deterministic', () => {
    const a = simulateLap(circuit, CAR, TYRES.slick, PT);
    const b = simulateLap(circuit, CAR, TYRES.slick, PT);
    expect(Buffer.from(a.axF.buffer).equals(Buffer.from(b.axF.buffer))).toBe(true);
    expect(Buffer.from(a.t.buffer).equals(Buffer.from(b.t.buffer))).toBe(true);
  });
});

describe('car to engine', () => {
  const mounts: EngineMount[] = (['forward', 'rearward', 'left', 'right'] as const).map((front) => ({ axis: front === 'forward' || front === 'rearward' ? 'longitudinal' : 'transverse', front, position: 'front' }));
  it('keeps every mapping right-handed', () => {
    for (const mount of mounts) {
      const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(([x, y, z]) => {
        const o = { x: 0, y: 0, z: 0 };
        carToEngine(mount, x!, y!, z!, o);
        return [o.x, o.y, o.z];
      });
      const [a, b, c] = cols as [number[], number[], number[]];
      const det = a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - b[0]! * (a[1]! * c[2]! - a[2]! * c[1]!) + c[0]! * (a[1]! * b[2]! - a[2]! * b[1]!);
      expect(det).toBe(1);
    }
  });

  it('raises the oil toward the car front under braking, whichever way the engine faces', () => {
    const o = { x: 0, y: 0, z: 0 };
    surfaceSlope(mounts[0]!, -G, 0, 0, G, o);
    expect(o.z).toBeCloseTo(1, 6); // engine front is the car front: 45° up toward +Z
    surfaceSlope(mounts[1]!, -G, 0, 0, G, o);
    expect(o.z).toBeCloseTo(-1, 6);
    // A left turn throws the oil to the right of the car: engine -X on a forward engine.
    surfaceSlope(mounts[0]!, 0, 1.3 * G, 0, G, o);
    expect(Math.atan(-o.x) / (Math.PI / 180)).toBeCloseTo(52.43, 1);
  });
});
