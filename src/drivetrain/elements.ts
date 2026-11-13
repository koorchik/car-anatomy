// Laws of the launch parts and the shift elements, shared by the core builder (core.ts), the solver (solver.ts) and
// the tables: friction with the Stribeck rise at low slip, the clutch pedal, the torsional dampers and their
// defaults, the disc heat. Plain maths and data, no state: the audio thread runs it too.
//
// Defaults are estimates checked against published bands (docs/gearbox-model.md, the dynamics section). A car or a
// gearbox with its own data overrides them.

import type { DamperDef, FrictionDef, SpinLossDef, SynchroDef } from './spec.ts';

/** Dry organic facing: static and kinetic friction [estimate inside 0.25–0.37 from the patent, research §6]. */
export const DRY_ORGANIC = { muStatic: 0.3, muKinetic: 0.27 } as const;
/** Wet pack in ATF [estimate, research §6: 0.10–0.15]. */
export const WET_PACK = { muStatic: 0.13, muKinetic: 0.11 } as const;
/** Slip speed over which the static excess of a dry facing decays, rad/s [estimate: about 0.3 m/s at the mean radius]. */
export const DRY_STRIBECK = 3;
/** Clutch capacity over the engine's peak torque [research §6: 1.2–1.5]. */
export const CLUTCH_RESERVE = 1.4;

/** Slip below which a slipping element is offered the lock (Karnopp's zero-velocity band), rad/s. */
export const LOCK_SLIP = 0.05;
/** The ideal synchroniser lets the sleeve through once the slip is inside this window, rad/s (gearbox plan: unblock). */
export const SYNC_WINDOW = 0.5;

/** Mean friction radius for uniform wear, m: (r_in + r_out)/2, the data in mm. */
export const meanRadius = (f: FrictionDef): number => (f.rIn + f.rOut) / 2000;

/** Torque per unit of friction coefficient at full clamp, F·r_m·z, N·m. */
export const clampTorque = (f: FrictionDef): number => f.clampN * meanRadius(f) * f.faces;

/** Static capacity at full clamp, N·m: μ_s·F·r_m·z. */
export const staticCapacity = (f: FrictionDef): number => f.muStatic * clampTorque(f);

/** Friction coefficient at this slip, μ(Δω) = μ_k + (μ_s − μ_k)·e^{−|Δω|/ω_s}. Continuous at zero with μ_s. */
export function frictionMu(f: Pick<FrictionDef, 'muStatic' | 'muKinetic' | 'stribeck'>, slip: number): number {
  return f.muKinetic + (f.muStatic - f.muKinetic) * Math.exp(-Math.abs(slip) / f.stribeck);
}

/** dμ/d|Δω|: negative on the whole decay, steepest at zero slip. This slope is what lets a clutch judder. */
export function frictionSlope(f: Pick<FrictionDef, 'muStatic' | 'muKinetic' | 'stribeck'>, slip: number): number {
  return (-(f.muStatic - f.muKinetic) / f.stribeck) * Math.exp(-Math.abs(slip) / f.stribeck);
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Share of the full clamp a diaphragm-spring clutch gives at this pedal position, 0 released … 1 floored: free play
 * to 0.3, then the falling Belleville curve, F = F_max·(1 − smoothstep(0.35, 0.75, pedal)) [estimate of the shape].
 */
export const pedalClamp = (pedal: number): number => 1 - smoothstep(0.35, 0.75, pedal);

/**
 * A dry single-plate clutch for a car whose own clutch is not in the data yet: a 228 mm organic disc with a 152 mm
 * inner diameter, two faces, the clamp sized for CLUTCH_RESERVE times the engine's peak torque [estimate].
 */
export function dryClutch(engineMaxNm: number, outerMm = 228, innerMm = 152): FrictionDef {
  const rOut = outerMm / 2;
  const rIn = innerMm / 2;
  const faces = 2;
  const clampN = (CLUTCH_RESERVE * engineMaxNm) / (DRY_ORGANIC.muStatic * ((rIn + rOut) / 2000) * faces);
  return { faces, rIn, rOut, ...DRY_ORGANIC, stribeck: DRY_STRIBECK, clampN, actuator: 'diaphragm' };
}

/** Viscous damping that gives the damping ratio ζ to two masses on a spring, N·m·s/rad. */
export const dampingFor = (zeta: number, stiffness: number, j1: number, j2: number): number => 2 * zeta * Math.sqrt((stiffness * j1 * j2) / (j1 + j2));

/** The two masses the gearbox plan quotes the damper defaults on: the engine of KAIST and a disc ring, kg·m². */
const REFERENCE_ENGINE = 0.2;
const DISC_RING = 0.003;
/** Damping ratio of a disc damper [estimate, gearbox plan]. */
const DISC_ZETA = 0.1;

/**
 * Damper in the clutch disc [estimate checked against the LuK bands]: 1500 N·m/rad (26 N·m/°), the disc ring behind
 * the springs 0.003 kg·m², ζ 0.1 between the KAIST engine and the ring.
 */
export const DISC_DAMPER: DamperDef = {
  kind: 'disc',
  stiffness: 1500,
  damping: dampingFor(DISC_ZETA, 1500, REFERENCE_ENGINE, DISC_RING),
  inertia: DISC_RING,
};

/**
 * The clutch disc's hub with its side plates and springs, on the input shaft whatever the clutch does [estimate:
 * about 1 kg of steel at 40–70 mm for a 228 mm disc]. The ring with the facings is the damper's `inertia`.
 */
export const DISC_HUB = 0.003;

/** Dual-mass flywheel of KAIST (research §15.1): arc springs 215 N·m/rad, 10 N·m·s/rad, secondary 0.086 kg·m². */
export const DMF_DAMPER: DamperDef = { kind: 'dmf', stiffness: 215, damping: 10, inertia: 0.086 };

/** Highest mode a damper may have, Hz: the step budget leaves the worklet a sixfold margin above it (gearbox plan). */
export const STIFF_DISC_HZ = 150;

/**
 * A "solid" racing disc: the stiffest spring that keeps the mode between the engine and the ring at STIFF_DISC_HZ in
 * the lightest configuration (clutch slipping, only the ring behind the spring): k = (2π·150)²/(1/J_e + 1/J_d). A
 * real solid disc is stiffer still; the model stops here so that a 1 ms step stays stable (hω ≈ 0.94).
 */
export function stiffDisc(engineInertia: number, ring = DISC_RING): DamperDef {
  const stiffness = (2 * Math.PI * STIFF_DISC_HZ) ** 2 / (1 / engineInertia + 1 / ring);
  return { kind: 'disc', stiffness, damping: dampingFor(DISC_ZETA, stiffness, engineInertia, ring), inertia: ring };
}

/** Spin loss of a manual gearbox at the input, a + b·ω N·m [order-of-magnitude estimate, research §15.4]. */
export const MANUAL_SPIN_LOSS: SpinLossDef = { a: 0.5, b: 0.0015 };
/** Speed below which the constant part of the spin loss fades linearly to zero, so it never chatters at rest, rad/s. */
export const SPIN_LOSS_FADE = 1;

/**
 * Synchroniser of the research example (§4.2, §4.3) for a gearbox whose own rings are not in the data: one brass
 * cone of 35 × 8 mm at 6.5°, μ 0.10, chamfers at 60° from the axis (a 120° roof) on 40 mm, μ 0.06, 36 dog teeth,
 * 8 mm of sleeve travel [estimate]. It blocks with a margin of 1.5.
 */
export const ESTIMATED_SYNCHRO: SynchroDef = {
  cones: 1,
  coneHalfAngle: 6.5,
  coneRadius: 35,
  coneWidth: 8,
  muCone: 0.1,
  chamfer: 60,
  chamferRadius: 40,
  muChamfer: 0.06,
  dogTeeth: 36,
  travel: 8,
};

/** Specific heat of the cast-iron pressure plate, J/(kg·K) (gearbox plan). */
const PLATE_HEAT = 460;
const PLATE_DENSITY = 7200;
/** Thickness of the pressure plate's friction ring, mm [estimate]. */
const PLATE_THICKNESS = 15;
/** Time constant of the plate cooling in the bell housing, s [estimate, gearbox plan]. */
export const DISC_COOLING_S = 60;
/** Air in the bell housing of a warm car, °C [estimate]. */
export const BELL_HOUSING_C = 40;

/** Heat capacity of what the slip heats, J/K: the pressure plate's ring over the facing, its size from the facing. */
export function plateHeatCapacity(f: FrictionDef): number {
  const area = Math.PI * ((f.rOut / 1000) ** 2 - (f.rIn / 1000) ** 2);
  return area * (PLATE_THICKNESS / 1000) * PLATE_DENSITY * PLATE_HEAT;
}
