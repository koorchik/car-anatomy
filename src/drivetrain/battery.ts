// The traction battery of a hybrid and the electric side of its motors (stage K15a): a state of charge that the
// motors' electric power moves, and the power the battery can give or take. No DOM, no text: the audio thread runs it.
//
// The electric power of a motor is its mechanical power over one combined efficiency of motor and inverter when it
// drives, and times it when it generates. ORNL measured the Prius 3's motor at up to 96 % and above 88 % over much of
// its range, and its inverter separately; one figure for both and every operating point is our simplification
// (MOTOR_EFFICIENCY, an estimate). The battery's own losses and its voltage sag are left out.

export interface BatteryDef {
  /** Nominal voltage, V, and capacity, A·h: the energy the state of charge counts. */
  nominalV: number;
  capacityAh: number;
  /** Most power out of and into the battery, kW. */
  maxDischargeKw: number;
  maxChargeKw: number;
  /** The window of the state of charge the control keeps to, and where a drive starts. */
  socMin: number;
  socMax: number;
  socStart: number;
}

/** Motor and inverter together, driving or generating [estimate from ORNL's maps of the Prius 3, docs/gearbox-model.md]. */
export const MOTOR_EFFICIENCY = 0.9;

/** Energy between empty and full, J. */
export const batteryEnergyJ = (b: BatteryDef): number => b.nominalV * b.capacityAh * 3600;

/** Electric power a motor draws (positive) or returns (negative) for this mechanical power, W. */
export const electricPower = (mechanicalW: number): number => (mechanicalW > 0 ? mechanicalW / MOTOR_EFFICIENCY : mechanicalW * MOTOR_EFFICIENCY);

/** The mechanical power that draws this electric power: electricPower inverted. */
export const mechanicalPower = (electricW: number): number => (electricW > 0 ? electricW * MOTOR_EFFICIENCY : electricW / MOTOR_EFFICIENCY);

/** Share of the state-of-charge window over which the limits fade to zero at its edges, so the control never chatters there. */
const EDGE = 0.02;

/** Power the battery can give at this state of charge, W: full inside the window, none below it. */
export function dischargeLimitW(b: BatteryDef, soc: number): number {
  return 1000 * b.maxDischargeKw * Math.min(1, Math.max(0, (soc - b.socMin) / EDGE));
}

/** Power the battery can take at this state of charge, W, positive. */
export function chargeLimitW(b: BatteryDef, soc: number): number {
  return 1000 * b.maxChargeKw * Math.min(1, Math.max(0, (b.socMax - soc) / EDGE));
}
