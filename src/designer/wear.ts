// How fast a part wears at a load, without the words of the limits (reliability.ts). The oil on track counts the
// bearings' wear with these alone, so its page does not load the designer's diagnoses and their text.

/** The oil reaching the bearings at this moment, from the oil-on-track model (src/lubrication). */
export interface OilCondition {
  /** Gallery pressure over what the bearings need at this speed. */
  margin: number;
  /** False once the film in the clearances and the crank drillings is used up. */
  reserveLeft: boolean;
}

/** Below this load a part doesn't wear in any way worth showing. */
export const SAFE_LOAD = 0.88;

/** A part at load 1 lasts about this long, seconds. Compressed so wear shows in minutes rather than years. */
export const SECONDS_AT_LIMIT = 30;

/**
 * Load on a rod bearing whose film has run out: past the safe load by the pressure deficit, more at speed and under
 * load. Full starvation at 6000 rpm and full throttle reaches 0.96, which wears 1.5 % of the bearings' life per second
 * (calibrated so that a one-second dip is survived, as track logs show; docs/lubrication-model.md).
 */
export function starvationLoad(rpm: number, throttle: number, oil: OilCondition): number {
  if (oil.reserveLeft) return 0;
  const deficit = Math.min(1, Math.max(0, 1 - oil.margin));
  return SAFE_LOAD + 0.08 * deficit * (rpm / 6000) * (0.6 + 0.4 * Math.min(1, Math.max(0, throttle)));
}

/** Share of life used per second at a load, as wearNow counts it. */
export const wearRateAt = (load: number): number => (load <= SAFE_LOAD ? 0 : ((load - SAFE_LOAD) / (1 - SAFE_LOAD)) ** 2 / SECONDS_AT_LIMIT);
