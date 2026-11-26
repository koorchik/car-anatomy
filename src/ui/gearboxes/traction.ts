// The traction chart's figures and the shift hints of the car mode (stage K3b; gearboxes plan, the dash): the force at
// the driven tyres at full load in each gear against road speed, the road's resistance at the present grade, and which
// gear a driver would want now. The engine's full-load torque comes from the last dyno run when it was made on the
// same engine (the whole-car plan, the amendments to the gearbox plan, item 12), else from the torque map the car drives on.
// Numbers only; the chart and the panel word them. No DOM.

import type { CarDrive, CarGear } from '../../drivetrain/car-model.ts';
import { fullLoadTorque } from '../../drivetrain/engine-stub.ts';
import { forceFromInput } from '../../drivetrain/runs.ts';
import type { EngineTorqueMap } from '../../engine/torque-map.ts';
import { roadLoadCoeffs, roadLoadN } from '../../vehicle/road-load.ts';
import type { Run } from '../dyno/runs.ts';

/** Where the dyno keeps its runs in the shell's RunStore (DYNO_RUNS of src/ui/dyno/dyno-panel.ts, not imported: the dyno's code stays out of this chunk). */
export const DYNO_RUNS_KEY = 'engines.dyno-runs';

const RPM = 30 / Math.PI;
/** Points along each gear's curve. */
const POINTS = 48;

export interface TractionCurve {
  gear: string;
  /** Road speed, km/h, and force at the driven tyres, N, from the lowest speed the curve has to the rev limit. */
  kmh: number[];
  force: number[];
}

export interface Traction {
  gears: TractionCurve[];
  /** The road's resistance at the grade, N, at the same speeds as `kmh`. */
  road: { kmh: number[]; force: number[] };
  /** Where the engine's torque came from. */
  source: 'dyno' | 'map';
  maxKmh: number;
  maxForce: number;
}

/** Engine torque at full load, N·m, by engine speed, rpm; null where the source has none. */
export type TorqueSource = (rpm: number) => number | null;

/** Whether two torque maps describe the same engine: a dyno run made on another engine draws nothing here. */
export function sameEngine(a: EngineTorqueMap, b: EngineTorqueMap): boolean {
  if (a === b) return true;
  const same = (x: readonly number[], y: readonly number[]) => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]!) < 1e-6);
  return a.limitRpm === b.limitRpm && a.idleRpm === b.idleRpm && same(a.rpm, b.rpm) && same(a.wotNm, b.wotNm);
}

/**
 * The full-load torque a dyno run measured, if it was a full-throttle run on this engine: the steady torque, so with
 * the share that went into the engine's own rotating parts added back (the dyno's inertia correction).
 */
export function runTorque(run: Run | null | undefined, map: EngineTorqueMap): TorqueSource | null {
  if (!run || !sameEngine(run.map, map) || (run.throttle !== null && run.throttle < 0.99)) return null;
  const points = run.points.map((p) => ({ rpm: p.rpm, nm: p.nm + p.inertiaNm })).sort((a, b) => a.rpm - b.rpm);
  if (points.length < 4) return null;
  return (rpm) => {
    if (rpm < points[0]!.rpm || rpm > points[points.length - 1]!.rpm) return null;
    let i = 1;
    while (points[i]!.rpm < rpm) i++;
    const a = points[i - 1]!;
    const b = points[i]!;
    const f = b.rpm > a.rpm ? (rpm - a.rpm) / (b.rpm - a.rpm) : 0;
    return a.nm + (b.nm - a.nm) * f;
  };
}

/** The torque map's own full-load torque. */
export const mapTorque = (map: EngineTorqueMap): TorqueSource => (rpm) => fullLoadTorque(map, rpm / RPM);

const drivenRadius = (cd: CarDrive): number => cd.radius[cd.driven[0]]!;
/** Road speed, m/s, at an engine speed, rpm, in a gear, the tyres rolling without slip. */
export const speedAt = (cd: CarDrive, g: CarGear, rpm: number): number => (rpm / RPM / (g.ratio * cd.axle.ratio)) * drivenRadius(cd);
/** Engine speed, rpm, at a road speed, m/s, in a gear. */
export const rpmAt = (cd: CarDrive, g: CarGear, v: number): number => (v / drivenRadius(cd)) * g.ratio * cd.axle.ratio * RPM;

/** Steady force at the driven tyres at full load in a gear at engine speed rpm, N; null where the source has none. */
export function gearForce(cd: CarDrive, g: CarGear, rpm: number, torque: TorqueSource): number | null {
  const nm = torque(rpm);
  return nm === null ? null : forceFromInput(cd, g, nm, rpm / RPM);
}

/** Every forward gear's curve from idle to the rev limit, and the road's resistance at `gradeRad`. */
export function traction(cd: CarDrive, gradeRad: number, run: Run | null | undefined): Traction {
  const fromRun = runTorque(run, cd.map);
  const torque = fromRun ?? mapTorque(cd.map);
  const lo = cd.map.idleRpm;
  const hi = cd.map.limitRpm;
  let maxKmh = 0;
  let maxForce = 0;
  const gears = cd.gears.map((g): TractionCurve => {
    const kmh: number[] = [];
    const force: number[] = [];
    for (let i = 0; i <= POINTS; i++) {
      const rpm = lo + ((hi - lo) * i) / POINTS;
      const f = gearForce(cd, g, rpm, torque);
      if (f === null) continue;
      kmh.push(speedAt(cd, g, rpm) * 3.6);
      force.push(f);
      maxForce = Math.max(maxForce, f);
    }
    maxKmh = Math.max(maxKmh, kmh[kmh.length - 1] ?? 0);
    return { gear: g.name, kmh, force };
  });
  const rl = roadLoadCoeffs(cd.car);
  const road = { kmh: [] as number[], force: [] as number[] };
  for (let i = 0; i <= POINTS; i++) {
    const kmh = (maxKmh * i) / POINTS;
    road.kmh.push(kmh);
    road.force.push(roadLoadN(rl, kmh / 3.6, gradeRad));
  }
  maxForce = Math.max(maxForce, ...road.force.filter((f) => f <= maxForce * 1.2));
  return { gears, road, source: fromRun ? 'dyno' : 'map', maxKmh, maxForce };
}

/** Force at the driven tyres the frame shows now, N: the hubs' drive torque over the driven wheels' radius. */
export const forceNow = (cd: CarDrive, driveNm: number): number => driveNm / drivenRadius(cd);

// ---- Shift hints ----

/** Above this pedal the driver wants all the car has: the hint goes by the force curves [estimate]. */
const FULL_PEDAL = 0.8;
/** At part throttle an upshift is due above this share of the rev limit, if the next gear keeps the engine above HINT_IDLE × idle [estimates]. */
const CRUISE_SHARE = 0.55;
const HINT_IDLE = 2;
/** Below this share of idle in a gear the engine labours: a lower gear is due [estimate]. */
const LABOUR_IDLE = 1.5;
/**
 * A downshift at a floored pedal is hinted when the engine is low in its range, the lower gear pulls this much harder
 * and stays this far under the limit [estimates]: a car pulling well in its gear gets no hint.
 */
const KICK_PEDAL = 0.95;
const KICK_SHARE = 0.5;
const KICK_GAIN = 1.3;
const KICK_MARGIN_RPM = 500;
/** An upshift at full pedal when the limiter is this close, rpm. */
const LIMIT_MARGIN_RPM = 250;

export interface ShiftHint {
  direction: 'up' | 'down';
  to: string;
}

/** The gear a driver would want at this speed, engine speed and pedal, or null when the one in is right. */
export function shiftHint(cd: CarDrive, gear: string, rpm: number, speed: number, pedal: number): ShiftHint | null {
  const i = cd.gears.findIndex((g) => g.name === gear);
  if (i < 0 || speed <= 0.5) return null;
  const g = cd.gears[i]!;
  const up = cd.gears[i + 1];
  const down = cd.gears[i - 1];
  const torque = mapTorque(cd.map);
  const idle = cd.map.idleRpm;
  const limit = cd.map.limitRpm;
  if (up) {
    const upRpm = rpmAt(cd, up, speed);
    if (pedal >= FULL_PEDAL) {
      const here = gearForce(cd, g, Math.min(rpm, limit), torque) ?? 0;
      const there = gearForce(cd, up, upRpm, torque) ?? 0;
      if (rpm >= limit - LIMIT_MARGIN_RPM || there >= here) return { direction: 'up', to: up.name };
    } else if (rpm > CRUISE_SHARE * limit && upRpm >= HINT_IDLE * idle) {
      return { direction: 'up', to: up.name };
    }
  }
  if (down) {
    const downRpm = rpmAt(cd, down, speed);
    if (downRpm < limit - KICK_MARGIN_RPM) {
      if (rpm < LABOUR_IDLE * idle) return { direction: 'down', to: down.name };
      if (pedal >= KICK_PEDAL && rpm < KICK_SHARE * limit) {
        const here = gearForce(cd, g, Math.max(rpm, idle), torque) ?? 0;
        const there = gearForce(cd, down, downRpm, torque) ?? 0;
        if (there >= KICK_GAIN * here) return { direction: 'down', to: down.name };
      }
    }
  }
  return null;
}
