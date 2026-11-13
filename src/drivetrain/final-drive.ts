// The axle behind the gearbox as one more draft of the core (gearbox plan, the final drive, differential and
// halfshafts): the propshaft as a spring with its rubber coupling in series, the final drive as a mesh with its
// loaded loss, the differential as a Willis row with equal side gears (ω_l + ω_r = 2·ω_case) and, for a plate
// limited-slip differential, a friction element between the side gears whose capacity follows the case torque. The
// drivetrain ends on the halfshaft springs: they are anchored to the wheels, which belong to the chassis
// (src/vehicle/wheel.ts).
//
// Data in, numbers out; the estimates are named where they are defined (docs/gearbox-model.md, the axle section).

import { type CoreDraft, type DraftElement } from './core.ts';
import { dampingFor, DRY_STRIBECK } from './elements.ts';
import type { DifferentialDef, FrictionDef } from './spec.ts';
import type { FinalDriveDesc } from './drive-car.ts';

export const PROP_FRONT = 'prop-front';
export const PINION = 'pinion';
export const DIFF_CASE = 'diff-case';
export const SIDE_LEFT = 'side-left';
export const SIDE_RIGHT = 'side-right';
export const PROPSHAFT = 'propshaft';
export const HALFSHAFT_LEFT = 'halfshaft-left';
export const HALFSHAFT_RIGHT = 'halfshaft-right';
export const LSD = 'lsd';

/** Shear modulus and density of steel, Pa and kg/m³. */
export const STEEL_G = 80e9;
const STEEL_DENSITY = 7850;

/**
 * Final drive efficiency under load [estimate, research §13: a hypoid's pinion offset adds sliding]. The idle part
 * (bearings, churning) is in the coast-down road load already (gearbox plan, decision 13), so this is the loaded
 * mesh only.
 */
export const FINAL_DRIVE_EFFICIENCY: Readonly<Record<FinalDriveDesc['kind'], number>> = { hypoid: 0.96, 'spiral-bevel': 0.97, helical: 0.98 };

/** Pinion with its flange; crown wheel with the case and a plate pack; side gear with the inner joint and half the shaft, kg·m² [estimates]. */
export const PINION_INERTIA = 0.002;
export const CASE_INERTIA = 0.03;
export const SIDE_INERTIA = 0.004;
/** Yokes, flanges and joints at each end of a propshaft, kg·m² [estimate]. */
export const PROPSHAFT_FITTINGS = 0.002;
/** Material damping of the shafts as a damping ratio of the two masses each joins [gearbox plan: ζ ≈ 0.05]. */
export const SHAFT_ZETA = 0.05;

/** Torsional stiffness of a solid round shaft, N·m/rad: G·π·d⁴/(32·L). */
export const shaftTorsion = (diameterMm: number, lengthM: number): number => (STEEL_G * Math.PI * (diameterMm / 1000) ** 4) / (32 * lengthM);

/** Torsional stiffness of a tube, N·m/rad: G·π·(D⁴ − d⁴)/(32·L). */
export const tubeTorsion = (outerMm: number, wallMm: number, lengthM: number): number =>
  (STEEL_G * Math.PI * ((outerMm / 1000) ** 4 - ((outerMm - 2 * wallMm) / 1000) ** 4)) / (32 * lengthM);

/** Polar inertia of a steel tube, kg·m²: ρ·π·(D⁴ − d⁴)·L/32. */
export const tubeInertia = (outerMm: number, wallMm: number, lengthM: number): number =>
  (STEEL_DENSITY * Math.PI * ((outerMm / 1000) ** 4 - ((outerMm - 2 * wallMm) / 1000) ** 4) * lengthM) / 32;

/** Springs in series: 1/k = Σ 1/k_i. */
export const seriesStiffness = (...k: number[]): number => 1 / k.reduce((s, v) => s + 1 / v, 0);

export interface AxleParts {
  /** Pinion to case, as published. */
  ratio: number;
  efficiency: number;
  differential: DifferentialDef;
  /**
   * Tube and coupling in series, N·m/rad, and the whole shaft's inertia with its fittings, split between its ends,
   * kg·m²; null bolts the pinion to the gearbox output.
   */
  propshaft: { stiffness: number; inertia: number } | null;
  /** One halfshaft, N·m/rad. */
  halfshaftStiffness: number;
  /** One driven wheel with its tyre, kg·m²: the mass the halfshaft's damping is rated on. */
  wheelInertia: number;
  /** Wheel slots (WheelBus indices) of the left and right halfshafts. */
  slots: [number, number];
}

/**
 * A plate differential's friction element in torque units: μ_k = 1 on one face of 1 m at 1 N, so its command is its
 * kinetic capacity in N·m, which the solver sets from the case torque every step (DraftDiff). Static 10 % above, the
 * hysteresis the solver needs against chatter (gearbox plan); wet plates decay over the dry facing's slip speed.
 */
const PLATE_UNIT: FrictionDef = { faces: 1, rIn: 1000, rOut: 1000, muStatic: 1.1, muKinetic: 1, stribeck: DRY_STRIBECK, clampN: 1, actuator: 'electric' };

/** The axle on the gearbox output `output`: members, links, springs, the differential and the final drive's loss. */
export function axleDraft(output: string, parts: AxleParts): CoreDraft {
  const d: CoreDraft = { members: [], links: [], springs: [], elements: [], prefer: [], drag: null, meshes: [], diffs: [], losses: [] };
  const sideShare = (parts.propshaft?.inertia ?? 0) / 2;
  d.members.push(
    { id: PINION, inertia: PINION_INERTIA + sideShare },
    { id: DIFF_CASE, inertia: CASE_INERTIA },
    { id: SIDE_LEFT, inertia: SIDE_INERTIA },
    { id: SIDE_RIGHT, inertia: SIDE_INERTIA },
  );
  if (parts.propshaft) {
    // The front half of the shaft turns with the gearbox output; the spring joins it to the pinion.
    d.members.push({ id: PROP_FRONT, inertia: sideShare });
    d.links.push([[PROP_FRONT, 1], [output, -1]]);
    const k = parts.propshaft.stiffness;
    const pinionSide = PINION_INERTIA + sideShare + CASE_INERTIA / parts.ratio ** 2;
    d.springs.push({ id: PROPSHAFT, a: PROP_FRONT, b: PINION, stiffness: k, damping: dampingFor(SHAFT_ZETA, k, sideShare, pinionSide) });
  } else {
    d.links.push([[PINION, 1], [output, -1]]);
  }
  // Final drive ω_pinion = i·ω_case, with the sign that keeps forward forward; Willis with equal side gears.
  d.links.push([[PINION, 1], [DIFF_CASE, -parts.ratio]]);
  d.links.push([[SIDE_LEFT, 1], [SIDE_RIGHT, 1], [DIFF_CASE, -2]]);
  // The halfshaft's damping is rated on the wheel swinging on it: the one mode the tyre does not damp when it slides
  // (a wheel spinning on ice), so the shaft's own ζ is all it has.
  const k = parts.halfshaftStiffness;
  const c = 2 * SHAFT_ZETA * Math.sqrt(k * parts.wheelInertia);
  d.springs.push(
    { id: HALFSHAFT_LEFT, a: SIDE_LEFT, b: null, anchor: parts.slots[0], stiffness: k, damping: c },
    { id: HALFSHAFT_RIGHT, a: SIDE_RIGHT, b: null, anchor: parts.slots[1], stiffness: k, damping: c },
  );
  const diff = parts.differential;
  switch (diff.kind) {
    case 'open':
      break;
    case 'locked':
      d.links.push([[SIDE_LEFT, 1], [SIDE_RIGHT, -1]]);
      break;
    case 'plate': {
      const element: DraftElement = { id: LSD, kind: 'friction', a: SIDE_LEFT, b: SIDE_RIGHT, friction: PLATE_UNIT };
      d.elements.push(element);
      // An unknown preload is taken as none: the locking value alone (docs/gearbox-model.md).
      d.diffs!.push({ element: LSD, left: HALFSHAFT_LEFT, right: HALFSHAFT_RIGHT, lockDrive: diff.lockDrive, lockCoast: diff.lockCoast, preloadNm: diff.preloadNm ?? 0 });
      break;
    }
    default:
      throw new Error(`axle: a ${diff.kind} differential comes with stage K6a`);
  }
  // The loaded loss (1 − η)·P on the torque the case passes on: share (1 − η)/η of the halfshafts' torque over the
  // ratio, so that in steady drive T_case = η·i·T_pinion exactly.
  d.losses!.push({ member: PINION, source: [[HALFSHAFT_LEFT, 1 / parts.ratio], [HALFSHAFT_RIGHT, 1 / parts.ratio]], share: (1 - parts.efficiency) / parts.efficiency });
  return d;
}
