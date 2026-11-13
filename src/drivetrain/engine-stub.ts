// The engine as a torque on the crank member, from the dyno's torque map, until stage K2c couples the real engine
// (EngineSim on a LoadedCrank). The gearbox plan allows it for the drivetrain's own tests and tables: full load and
// part load on the Willans line (brakeTorque), fuel cut at the rev limit, and an idle governor so that a coasting
// engine settles at idle instead of stopping. No DOM: plain maths on the map.

import { brakeTorque, holdCharge, leakCharge, type EngineTorqueMap } from '../engine/torque-map.ts';

const RPM = 30 / Math.PI;

/** Proportional gain of the idle governor, charge per relative speed error [estimate]. */
const IDLE_GAIN = 2;

/**
 * Brake torque on the crank at speed ω, rad/s, with the pedal 0…1: the charge goes from what leaks past a shut
 * throttle to full. Above the rev limit the fuel is cut and the engine only drags; below idle the governor opens
 * the throttle as much as holding idle needs.
 */
export function stubTorque(map: EngineTorqueMap, omega: number, pedal: number): number {
  const rpm = omega * RPM;
  if (rpm > map.limitRpm) return brakeTorque(map, rpm, 0);
  const leak = leakCharge(map, rpm);
  let charge = leak + (1 - leak) * Math.min(1, Math.max(0, pedal));
  if (rpm < map.idleRpm) charge = Math.max(charge, Math.min(1, holdCharge(map, rpm) * (1 + (IDLE_GAIN * (map.idleRpm - rpm)) / map.idleRpm)));
  return brakeTorque(map, rpm, charge);
}

/** Full-load brake torque at ω, rad/s, without the rev limiter: what the driver can ask of the engine. */
export const fullLoadTorque = (map: EngineTorqueMap, omega: number): number => brakeTorque(map, Math.min(omega * RPM, map.limitRpm), 1);
