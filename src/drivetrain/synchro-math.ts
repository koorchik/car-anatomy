// Synchroniser formulas in closed form (research §4.2): the cone and index torques, the blocking inequality, the
// synchronising time with the drag at the input, and the friction work and power per square millimetre of cone.
//
// The solver's ideal synchroniser, the slow-motion synchroniser of stage K4 and the gearbox designer (K9a, K9b) all
// take them from here, so a shift in the car, the laboratory and the designer's table agree. Pure maths: no state, no
// DOM, no t(). Lengths in the SynchroDef are millimetres, like the rest of the gear data; torques come out in N·m.

import type { SynchroDef } from './spec.ts';

const DEG = Math.PI / 180;

/**
 * Sleeve force the driver gives through the lever and the linkage, N [estimate, gearbox plan]: an ordinary shift
 * and a hard one. A robot's actuator gives its own.
 */
export const SHIFT_FORCE_N = { normal: 600, hard: 1200 } as const;

/**
 * How far each further cone of a multi-cone synchroniser sits inside the one before it, mm [estimate: about one ring
 * thickness]. With the 35 mm outer cone of the research example three cones give 2.6 times the torque of one, the
 * factor research §4.2 quotes.
 */
export const CONE_STEP_MM = 4.5;

/** Cone face width when the data gives none, mm [estimate, the 35 × 8 mm cone of research §4.2]. */
export const CONE_WIDTH_MM = 8;

/**
 * The upper end of the patent test points for brass cones, per mm² of cone surface [unverified, research §4.2]: the
 * designer compares a shift's friction work and peak power with these.
 */
export const CONE_TEST_LIMITS = { energyJPerMm2: 2.46, powerWPerMm2: 2.67 } as const;

/** Mean radius of each friction cone, mm, outer first. */
export function coneRadii(def: SynchroDef): number[] {
  return Array.from({ length: def.cones }, (_, i) => def.coneRadius - i * CONE_STEP_MM);
}

/** Cone torque per newton of sleeve force, N·m/N: Σ μ_C·R_i / sin α. */
export function coneTorquePerN(def: SynchroDef): number {
  const sum = coneRadii(def).reduce((s, r) => s + r, 0) / 1000;
  return (def.muCone * sum) / Math.sin(def.coneHalfAngle * DEG);
}

/** Friction torque of the cones under the sleeve force, N·m: T_C = F_a·Σ μ_C·R_i / sin α (UTS, eq. 4). */
export const coneTorque = (def: SynchroDef, forceN: number): number => forceN * coneTorquePerN(def);

/** Index factor R_I·(1 − μ_I tan γ)/(μ_I + tan γ), m: the index torque per newton of sleeve force. */
function indexTorquePerN(def: SynchroDef): number {
  const tg = Math.tan(def.chamfer * DEG);
  return ((def.chamferRadius / 1000) * (1 - def.muChamfer * tg)) / (def.muChamfer + tg);
}

/**
 * Torque with which the sleeve's chamfers try to turn the ring out of the way, N·m (UTS, eq. 5):
 * T_I = F_a·R_I·(1 − μ_I tan γ)/(μ_I + tan γ), with γ half the roof angle from the shaft axis.
 */
export const indexTorque = (def: SynchroDef, forceN: number): number => forceN * indexTorquePerN(def);

/**
 * How far the ring blocks: T_C/T_I, the same at any sleeve force because F_a cancels. At 1 or more the ring holds the
 * sleeve until the speeds match; below 1 the sleeve gets through early and the teeth crunch.
 */
export const blockingMargin = (def: SynchroDef): number => coneTorquePerN(def) / indexTorquePerN(def);

/** The blocking inequality μ_C·ΣR/sin α ≥ R_I·(1 − μ_I tan γ)/(μ_I + tan γ). Pushing harder never unblocks it early. */
export const blocks = (def: SynchroDef): boolean => blockingMargin(def) >= 1;

/** The ring sticks on the cone after the shift when μ_C > tan α (UTS): the cone angle is too steep a wedge. */
export const selfLocking = (def: SynchroDef): boolean => def.muCone > Math.tan(def.coneHalfAngle * DEG);

/** Friction surface of all cones, mm²: Σ 2π·R_i·b. */
export function coneArea(def: SynchroDef): number {
  const width = def.coneWidth ?? CONE_WIDTH_MM;
  return coneRadii(def).reduce((s, r) => s + 2 * Math.PI * r * width, 0);
}

/**
 * Speed the input side has to change by for a shift from ratio iOld to iNew at output speed ω_out, rad/s:
 * Δω_in = ω_out·|i_old − i_new|. The output (the car) barely changes speed while the synchroniser works.
 */
export const inputSpeedChange = (outputOmega: number, iOld: number, iNew: number): number => Math.abs(outputOmega * (iOld - iNew));

/** One synchronisation, in input-shaft terms, for a synchroniser on the output shaft (research §4.2). */
export interface SyncCase {
  /**
   * Inertia that changes speed with the input shaft while the clutch is open, kg·m²: clutch disc, input shaft,
   * countershaft and every gear in mesh with them, reflected to the input.
   */
  inputInertia: number;
  /** |Δω_in|, rad/s (inputSpeedChange). */
  inputSpeedChange: number;
  /** Ratio of the gear being engaged, i_k = ω_in/ω_gear. */
  ratio: number;
  /** Cone torque, N·m (coneTorque). */
  coneNm: number;
  /** Spin loss at the input, N·m: it slows the input, so it helps an upshift and works against a downshift. */
  dragNm: number;
  /** 'up': the input must slow down; 'down': it must speed up. */
  direction: 'up' | 'down';
}

/** Net torque that closes the speed gap, at the loose gear, N·m: T_C ± i·T_drag. */
const closingNm = (c: SyncCase): number => c.coneNm + (c.direction === 'up' ? 1 : -1) * Math.abs(c.ratio) * c.dragNm;

/**
 * Synchronising time, s: t = J_in·Δω_in·i/(T_C ± i·T_drag), plus for an upshift and minus for a downshift.
 * Infinite when the drag beats the cone on a downshift (UTS, eq. 9–10: synchronisation fails).
 */
export function syncTime(c: SyncCase): number {
  const net = closingNm(c);
  return net > 0 ? (c.inputInertia * c.inputSpeedChange * Math.abs(c.ratio)) / net : Infinity;
}

/** Slip speed across the cone at the start, rad/s: the loose gear turns at ω_in/i, the hub at ω_out. */
export const coneSlip = (c: SyncCase): number => c.inputSpeedChange / Math.abs(c.ratio);

/**
 * Friction work at the cone, J: T_C·Δω_cone·t/2 with the slip falling linearly to zero. Without drag this is the
 * kinetic energy ½·J_in·Δω_in² the input side gives up or takes; drag takes a share on an upshift and adds work on a
 * downshift.
 */
export function syncEnergy(c: SyncCase): number {
  const t = syncTime(c);
  return Number.isFinite(t) ? (c.coneNm * coneSlip(c) * t) / 2 : Infinity;
}

/** Peak friction power at the cone, W: T_C times the slip at the start. */
export const syncPeakPower = (c: SyncCase): number => c.coneNm * coneSlip(c);

/** Friction work and peak power per mm² of cone surface: what wears and heats the rings. */
export function perConeArea(def: SynchroDef, c: SyncCase): { energyJPerMm2: number; powerWPerMm2: number } {
  const area = coneArea(def);
  return { energyJPerMm2: syncEnergy(c) / area, powerWPerMm2: syncPeakPower(c) / area };
}

/**
 * Pitch of the crunch when the sleeve is forced through the ring before the speeds match: its teeth skip over the
 * gear's dog teeth at f = z·|Δω|/2π, Hz (research §4.2). Δω is the slip between the gear and the hub.
 */
export const crunchHz = (def: SynchroDef, slip: number): number => (def.dogTeeth * Math.abs(slip)) / (2 * Math.PI);
