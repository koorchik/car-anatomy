// Every estimated constant of the oil-on-track model in one place, global per sump kind and never per engine.
// What each one means and where it comes from: docs/lubrication-model.md.

import type { SumpKind } from '../engine/systems-spec.ts';

export interface SumpKindConstants {
  /**
   * Refill and drain of the compartment round the pickup, in periods of the oil's first slosh mode: a time constant
   * τ = k·T₁, so a bigger, shallower pan refills more slowly. Derived from a Formula SAE pan (SAE 2024-36-0074):
   * 0.50 s to refill after braking with the stock pan, 0.03 s with a hinged baffle; τ = t/3 for an exponential.
   */
  kIn: number;
  /**
   * The same for oil leaving it. A factory well spills over its low step: a broad-crested weir, Q ≈ 1.7·b·H^1.5, gives
   * about 0.9 L/s over a 0.19 m step under 20 mm of head, so a litre or two of surplus takes 1-2 s, about 2 T₁. Trap
   * doors open only inwards, so a track box leaks through its gaps alone (estimate).
   */
  kOut: number;
  /** Damping ratio of the first slosh mode: baffles, the windage screen and the crank take energy out (estimate). */
  zeta: number;
  /** Aeration from the crank's windage, as a share of the wet sump's (estimate). */
  aeration: number;
  /** The heads are emptied by scavenge stages, whatever the g-load. */
  headScavenge: boolean;
  /**
   * Share of the oil reaching the counterweights' orbit that they strip off: a track pan's crank scraper and windage
   * screen keep most of it in the pan (estimate).
   */
  crankCatch: number;
}

/** Period of the reference FSAE pan's first mode, s: about 0.30 m long with 50 mm of oil (estimate, to be checked). */
export const REFERENCE_PERIOD_S = 0.894;

export const SUMP_KIND_CONSTANTS: Record<SumpKind, SumpKindConstants> = {
  wet: { kIn: 0.5 / 3 / REFERENCE_PERIOD_S, kOut: 2.0 / REFERENCE_PERIOD_S, zeta: 0.35, aeration: 1, headScavenge: false, crankCatch: 0.2 },
  baffled: { kIn: 0.03 / 3 / REFERENCE_PERIOD_S, kOut: 6.0 / REFERENCE_PERIOD_S, zeta: 0.5, aeration: 0.6, headScavenge: false, crankCatch: 0.1 },
  'integrated-dry': { kIn: 0.03 / 3 / REFERENCE_PERIOD_S, kOut: 6.0 / REFERENCE_PERIOD_S, zeta: 0.5, aeration: 0.5, headScavenge: true, crankCatch: 0.1 },
  dry: { kIn: 0, kOut: 0, zeta: 0.5, aeration: 0.25, headScavenge: true, crankCatch: 0 },
};

// The crank in the oil (src/lubrication/run.ts, src/lubrication/pan.ts).
/**
 * A wet pan has no lid: in a long corner the oil climbs past the rail and up the crankcase wall, as far as the crank
 * axis here (estimate). Clipping it at the rail instead would push the surface up over the pickup.
 */
export const CRANKCASE_CEIL = 0;
/** Turns of the crank in which the counterweights strip the oil that reaches their orbit (estimate). */
export const CATCH_TURNS = 5;

/** Oil on track runs hot: 110-150 °C, LN Engineering quotes over 300 °F on track. Held constant over the lap. */
export const T_OIL_TRACK = 120;
/** Model step, s. */
export const DT = 0.01;
export const G = 9.81;
/** Hot oil density, kg/m³ (estimate for a 5W-30 at 120 °C). */
export const OIL_DENSITY = 800;
export const ATM_BAR = 1.013;

// Oil in circulation (src/lubrication/run.ts).
/** Share of the delivered oil that goes up to the heads: HEAD_SHARE of src/systems/oil.ts. */
export const HEAD_FLOW_SHARE = 0.35;
/** Time the oil thrown off the bearings takes to run down the crankcase walls, s (estimate). */
export const WALL_TAU_S = 0.4;
/**
 * Share of the oil coming back from the crankcase that drips off the crank rather than running down the side walls
 * (estimate). Drops fall along felt gravity; wall oil reaches the pan at its edges (run.ts, returnShare).
 */
export const WELL_RAIN = 0.5;
/** Time oil takes to drain from a head by gravity, and when scavenged, s (estimates). */
export const HEAD_TAU_S = 3;
export const HEAD_TAU_SCAVENGED_S = 0.5;
/** Most a head holds before oil overflows down other paths: 0.15 L per litre of its share plus 0.2 L (estimate). */
export const headCapacityL = (litres: number, heads: number): number => (0.15 * litres) / heads + 0.2;

// What the pump draws (src/lubrication/run.ts).
/** The pump draws clean oil once the surface stands this far over the screen's bell. */
export const PICKUP_SUBMERGED = 8 * 0.01;
/** Aeration from the crank's windage at idle and at the limiter, wet sump (SAE 2014-01-2786: linear in speed). */
export const AERATION_IDLE = 0.02;
export const AERATION_SPAN = 0.06;
/** Below this absolute pressure at the pump inlet, air comes out of the oil (estimate). */
export const CAVITATION_BAR = 0.7;
/** Loss coefficient of the pickup's screen and entry, in velocity heads; friction of the tube on top (estimate). */
export const PICKUP_LOSS_K = 1.5;
export const TUBE_FRICTION = 0.03;
/** Lag of the gallery pressure behind the pump's flow: filter and gallery compliance, s (estimate). */
export const PRESSURE_TAU_S = 0.08;

// Dry sump (src/lubrication/run.ts).
/** A dry sump's pan empties in about this time while its pickups are covered, s (estimate). */
export const SCAVENGE_TAU_S = 0.2;
/** The tank's outlet takes clean oil above this many litres and nothing below LOW - SPAN (estimate). */
export const TANK_LOW_L = 0.5;
export const TANK_SPAN_L = 0.2;

// Bearings (src/lubrication/bearings.ts).
/** Main journal diameter over bore: an LS has 65 mm journals and a 103.25 mm bore (estimate for other engines). */
export const MAIN_JOURNAL_SHARE = 0.63;
/** Film pressure the bearings need over the centrifugal head, bar: Toyota's hot-idle minimum is 29 kPa. */
export const FILM_BAR = 0.3;
/** Seconds a bearing runs on the oil left in its clearance and the crank's drillings (estimate). */
export const FILM_RESERVE_S = 0.4;
/** How fast the film reserve fills again once the pressure is back, per second. */
export const RESERVE_REFILL = 2;
/** Gallery volume between the pump and the lifters, litres per litre of displacement (estimate). */
export const GALLERY_L_PER_L = 0.1;

// Accumulator (src/lubrication/accumulator.ts): Canton Accusump, 3 quarts.
export const ACCUMULATOR_L = 2.84;
/** Air precharge, bar gauge: Canton recommends 7-10 psi. */
export const ACCUMULATOR_PRECHARGE_BAR = 0.6;
/** Flow through the open valve, L/s per bar: discharging, and refilling through a restrictor (estimates). */
export const ACCUMULATOR_OUT = 2;
export const ACCUMULATOR_IN = 0.1;
/** The accumulator refills only while the gallery stands this many times over the need, and fully from half as much again. */
export const REFILL_ABOVE = 1.3;
/** Oil left under the piston at the end of its travel, litres. */
export const ACCUMULATOR_DEAD_L = 0.3;
