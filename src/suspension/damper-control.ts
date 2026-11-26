// Dampers with control (stage P14-core): what the four damper kinds of DamperSpec do, in time (the quarter car and the
// shaker) and in the frequency domain (the designer's quick estimates). docs/research/suspensions.md 1.3 gives the
// definitions: an adaptive damper switches between settings slowly; a semi-active one (MagneRide) changes its damping
// in milliseconds but only dissipates; an active one (Mercedes ABC) pushes the body, on body motions up to 5 Hz.
//
//   - passive: the damper's own curve (forces.ts);
//   - adaptive: the same curve scaled to one of its settings, chosen per road (the estimates take the best one for each
//     figure; in time a page sets `scale`);
//   - MagneRide: skyhook (Karnopp 1974): the body wants the force −c_sky·ż_b, the damper gives it when it can (when the
//     wanted force opposes the damper's own motion) within its range, and its softest setting otherwise. The skyhook
//     gain is the damper's own damping at the wheel, its softest setting SEMI_ACTIVE_FLOOR of it;
//   - active: the passive damper plus an actuator that pushes the body with −c_sky·ż_b through a first-order lag at
//     ACTIVE_BANDWIDTH_HZ; with `previewM` it also reads the road ahead (a camera) and cancels the spring force the bump
//     will bring, acting early by the lag's time constant.
//
// Every force between the body and the wheel leaves the body acceleration at the wheel-hop frequency √(k_t/m_u) where
// it was (Hedrick & Butsuen: the invariant point, evaluate.ts), so no control can calm the body there; the shaker test
// checks it. The linear estimates take the ideal skyhook, which a semi-active damper only approaches: for MagneRide
// they are a bound from above.

import type { DamperKind } from './spec.ts';
import type { QuarterLinear } from './evaluate.ts';
import type { ResolvedCorner } from './setup.ts';

export const DAMPER_KINDS = ['passive', 'adaptive', 'magneride', 'active'] as const satisfies readonly DamperKind[];

/** Settings of an adaptive damper relative to its own curve: soft, own, firm (illustrative range). */
export const ADAPTIVE_SCALES = [2 / 3, 1, 3 / 2] as const;
/** Softest setting of a semi-active damper as a share of its own damping, and its firmest (illustrative). */
export const SEMI_ACTIVE_FLOOR = 0.25;
export const SEMI_ACTIVE_CEILING = 3;
/** Bandwidth of an active suspension's actuators, Hz: Mercedes ABC acts on body motions up to 5 Hz. */
export const ACTIVE_BANDWIDTH_HZ = 5;
/** How far ahead a camera reads the road, m: Magic Body Control, 15 m up to 130 km/h. */
export const PREVIEW_M = 15;
/** With a camera the body follows the road's long waves: the road under it, low-passed at this frequency, Hz (an
 *  estimate, below the body's resonance). */
export const PREVIEW_FOLLOW_HZ = 0.5;

/**
 * A corner's damping in the frequency domain for a damper kind: the passive part between body and wheel and the skyhook
 * on the body. For an adaptive damper `scale` picks its setting.
 */
export function controlledLinear(lin: QuarterLinear, kind: DamperKind, scale = 1): QuarterLinear {
  switch (kind) {
    case 'passive':
      return lin;
    case 'adaptive':
      return scale === 1 ? lin : { ...lin, c: lin.c * scale, damper: scaleDamper(lin.damper, scale) };
    case 'magneride':
      return { ...lin, c: lin.c * SEMI_ACTIVE_FLOOR, damper: scaleDamper(lin.damper, SEMI_ACTIVE_FLOOR), skyNsm: lin.c };
    case 'active':
      return { ...lin, skyNsm: lin.c, skyHz: ACTIVE_BANDWIDTH_HZ };
  }
}

function scaleDamper(d: QuarterLinear['damper'], k: number): QuarterLinear['damper'] {
  return { ...d, compression: d.compression * k, rebound: d.rebound * k };
}

/** What the controller needs of the corner: its passive damping at the wheel (small sine) and its wheel rate. */
export interface ControlledCorner {
  /** Passive damping at the wheel, N·s/m: the mean of compression and rebound below the knee, through mr². */
  cWheel: number;
  /** Wheel rate at rest, N/m (the preview cancels the spring force a bump brings). */
  wheelRate: number;
}

/**
 * A damper's controller in time. The quarter car calls `advance` once a step (the actuator's lag and the preview live
 * here, held through the step) and `support` for the force the damper and the actuator put on the body at the wheel.
 */
export class DamperController {
  readonly kind: DamperKind;
  readonly corner: ControlledCorner;
  /** Adaptive: the setting, a share of the damper's own curve. */
  scale = 1;
  /** Active: how far ahead the road is read, m (0: no camera). */
  previewM = 0;
  /** Active: the actuator's force on the body now, N (positive up), and the power it puts in, W. */
  actuatorN = 0;
  actuatorW = 0;
  private readonly lagS = 1 / (2 * Math.PI * ACTIVE_BANDWIDTH_HZ);
  /** The road the body follows (preview), m; NaN until the first step. */
  private roadLevel = NaN;

  constructor(kind: DamperKind, corner: ControlledCorner) {
    this.kind = kind;
    this.corner = corner;
  }

  /** How far ahead of the wheel the preview reads the road at `speedMs`: one lag of travel, within the camera's reach. */
  lookAheadM(speedMs: number): number {
    return this.kind === 'active' && this.previewM > 0 ? Math.min(this.previewM, Math.abs(speedMs) * this.lagS) : 0;
  }

  reset(): void {
    this.actuatorN = 0;
    this.actuatorW = 0;
    this.roadLevel = NaN;
  }

  /**
   * One step of `h` s for an active damper: the command −c_sky·ż_b through the first-order lag. With a camera it also
   * takes −k_w·(y − ȳ): the spring force the road the wheel meets one lag later (lookAheadM) will add, against the road
   * level ȳ the body follows (that road low-passed at PREVIEW_FOLLOW_HZ).
   */
  advance(h: number, bodyV: number, road: { now: number; ahead: number } | null): void {
    if (this.kind !== 'active') return;
    let command = -this.corner.cWheel * bodyV;
    if (road && this.previewM > 0) {
      if (Number.isNaN(this.roadLevel)) this.roadLevel = road.ahead;
      const tau = 1 / (2 * Math.PI * PREVIEW_FOLLOW_HZ);
      this.roadLevel += (h / (tau + h)) * (road.ahead - this.roadLevel);
      command -= this.corner.wheelRate * (road.ahead - this.roadLevel);
    }
    this.actuatorN += (h / (this.lagS + h)) * (command - this.actuatorN);
  }

  /**
   * Support the damper (and actuator) puts on the body at the wheel, N, positive up. `bodyV` is the body's absolute
   * speed, `travelRate` q̇ (bump positive), `passiveN` the damper's own force at the wheel (its curve through mr).
   */
  support(bodyV: number, travelRate: number, passiveN: number): number {
    switch (this.kind) {
      case 'passive':
        return passiveN;
      case 'adaptive':
        return passiveN * this.scale;
      case 'magneride': {
        const c = this.corner.cWheel;
        const wanted = -c * bodyV;
        const lo = SEMI_ACTIVE_FLOOR * c * travelRate;
        if (wanted * travelRate <= 0) return lo;
        const hi = SEMI_ACTIVE_CEILING * c * travelRate;
        return travelRate > 0 ? Math.min(hi, Math.max(lo, wanted)) : Math.max(hi, Math.min(lo, wanted));
      }
      case 'active':
        // The actuator stretches at −q̇: its power is F·(−q̇).
        this.actuatorW = -this.actuatorN * travelRate;
        return passiveN + this.actuatorN;
    }
  }
}

/** The controller of a damper kind on a resolved corner (its damper at rest through mr², its wheel rate). */
export function controllerFor(kind: DamperKind, rc: ResolvedCorner): DamperController {
  const mr = rc.atRest.mrDamper;
  return new DamperController(kind, { cWheel: ((rc.damper.compression + rc.damper.rebound) / 2) * mr * mr, wheelRate: rc.wheelRate });
}
