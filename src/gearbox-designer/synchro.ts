// The designer's synchronisers (gearbox plan, the designer's model: synchronisers; stage K9b): one shift as a
// synchro-math.ts case, and the hard shifts the plan judges: 1→2 and 2→3 at the shift point, and back down from them
// at the road speed where the lower gear reaches the rev limit. Each gives the time, the friction work and the peak
// power per square millimetre of cone against the upper end of the patent test points (2.46 J/mm², 2.67 W/mm²
// [unverified, research §4.2]), and the blocking margin of the ring. Plain maths: no DOM, no text.

import { blockingMargin, CONE_TEST_LIMITS, coneTorque, perConeArea, selfLocking, syncTime, type SyncCase } from '../drivetrain/synchro-math.ts';
import type { SynchroDef } from '../drivetrain/spec.ts';
import type { Gearbox } from '../drivetrain/topology.ts';
import type { GearboxDesign } from './design.ts';
import type { DesignVehicle } from './vehicle.ts';

/** A shift longer than this does not keep up with the driver's hand, s (gearbox plan, diagnostics). */
export const SLOW_SYNC_S = 0.4;

export interface SyncFigures {
  from: number;
  to: number;
  direction: 'up' | 'down';
  /** Input speed before the shift, rpm. */
  rpm: number;
  timeS: number;
  energyJPerMm2: number;
  powerWPerMm2: number;
  /** The larger of work and power over the test limits. */
  load: number;
}

export interface SynchroFigures {
  shifts: SyncFigures[];
  /** The worst load of the shifts judged. */
  load: number;
  /** T_C/T_I of the rings (synchro-math.ts blockingMargin): below 1 the sleeve gets through early. */
  blocking: number;
  /** The ring sticks on the cone after the shift. */
  sticks: boolean;
}

/** The synchroniser of gear k (its element sync-k) and the share of the input speed its loose side turns at. */
function synchroOfGear(box: Gearbox, gear: number): { def: SynchroDef; side: number } | null {
  const element = box.spec.elements.find((e) => e.id === `sync-${gear}`);
  if (!element || !element.synchro) return null;
  const col = box.basis.indexOf(box.spec.input);
  const speedOf = (member: string | null): number => (member === null ? 0 : box.P[box.members.indexOf(member)]![col]!);
  const side = Math.max(Math.abs(speedOf(element.a)), Math.abs(speedOf(element.b)));
  return side > 0 ? { def: element.synchro, side } : null;
}

const spin = (v: DesignVehicle, omegaIn: number): number => v.spinLoss.a * Math.sign(omegaIn) + v.spinLoss.b * omegaIn;

/**
 * The synchroniser of gear `to` on a shift from overall ratio nFrom to nTo at input speed omegaIn before it: the input
 * side changes speed by ω_wheel·|N_from − N_to|, the cone works on it through the ratio between the input and the side
 * of the synchroniser that turns with it, and the spin loss at the mean input speed helps an upshift and works against
 * a downshift.
 */
export function shiftCase(
  d: GearboxDesign, box: Gearbox, to: number, nFrom: number, nTo: number, omegaIn: number, inputInertia: number, v: DesignVehicle,
): { def: SynchroDef; c: SyncCase } | null {
  const s = synchroOfGear(box, to);
  if (!s) return null;
  const wheel = omegaIn / nFrom;
  const after = wheel * nTo;
  return {
    def: s.def,
    c: {
      inputInertia,
      inputSpeedChange: wheel * Math.abs(nFrom - nTo),
      ratio: 1 / s.side,
      coneNm: coneTorque(s.def, d.shiftForceN),
      dragNm: spin(v, (omegaIn + after) / 2),
      direction: nTo < nFrom ? 'up' : 'down',
    },
  };
}

/** Synchronising time of a shift, s; 0 where gear `to` has no synchroniser (synchro-math.ts). */
export function shiftTime(...args: Parameters<typeof shiftCase>): number {
  const s = shiftCase(...args);
  return s ? syncTime(s.c) : 0;
}

/**
 * The shifts the plan judges. `overall` is each forward gear's input speed per wheel speed, `shiftOmegas` the input
 * speed of each upshift k → k+1 and `limit` the rev limit, rad/s.
 */
export function synchroFigures(
  d: GearboxDesign, box: Gearbox, overall: number[], shiftOmegas: number[], limit: number, inputInertia: number, v: DesignVehicle,
): SynchroFigures {
  const shifts: SyncFigures[] = [];
  const judge = (from: number, to: number, omega: number): void => {
    const s = shiftCase(d, box, to, overall[from - 1]!, overall[to - 1]!, omega, inputInertia, v);
    if (!s) return;
    const per = perConeArea(s.def, s.c);
    const load = Math.max(per.energyJPerMm2 / CONE_TEST_LIMITS.energyJPerMm2, per.powerWPerMm2 / CONE_TEST_LIMITS.powerWPerMm2);
    shifts.push({ from, to, direction: s.c.direction, rpm: (omega * 30) / Math.PI, timeS: syncTime(s.c), ...per, load });
  };
  for (let k = 1; k <= Math.min(2, overall.length - 1); k++) {
    judge(k, k + 1, shiftOmegas[k - 1]!);
    // Down into k at the road speed where k reaches the limit.
    judge(k + 1, k, (limit * overall[k]!) / overall[k - 1]!);
  }
  const defs = box.spec.elements.flatMap((e) => (e.synchro ? [e.synchro] : []));
  return {
    shifts,
    load: Math.max(0, ...shifts.map((s) => s.load)),
    blocking: defs.length ? Math.min(...defs.map(blockingMargin)) : Infinity,
    sticks: defs.some(selfLocking),
  };
}
