// What the pump draws: oil, air or both. The screen's immersion sets the share of oil at the pickup, the suction
// tube delays it by its own volume, the crank's windage and low inlet pressure add air on top.

import { AERATION_IDLE, AERATION_SPAN, ATM_BAR, CAVITATION_BAR, G, OIL_DENSITY, PICKUP_LOSS_K, PICKUP_SUBMERGED, TUBE_FRICTION } from './constants.ts';

/**
 * Share of oil in what enters the screen, 0..1, from how far the surface stands over the top of its bell (scene units)
 * and the bell's height. Clean oil from PICKUP_SUBMERGED over the bell, nothing once the surface is below its rim;
 * squared because air passes the open part of the screen more easily than oil (estimate).
 */
export function pickupOil(immersion: number, bell: number): number {
  const share = Math.min(1, Math.max(0, (immersion + bell) / (bell + PICKUP_SUBMERGED)));
  return share * share;
}

/** Air the crank's windage beats into the oil, as a share of the volume (SAE 2014-01-2786: linear in speed). */
export const windageAeration = (rpm: number, redline: number, kind: number): number => (AERATION_IDLE + AERATION_SPAN * Math.min(1.2, Math.max(0, rpm / redline))) * kind;

/**
 * Absolute pressure at the pump's inlet, bar: the atmosphere less the lift from the oil's surface and the loss in the
 * screen and tube at this flow. `lift` in metres, `flow` in L/s, tube diameter and length in metres.
 */
export function inletPressure(lift: number, flow: number, tubeD: number, tubeL: number): number {
  const area = (Math.PI / 4) * tubeD * tubeD;
  const v = flow / 1000 / area;
  const loss = 0.5 * OIL_DENSITY * v * v * (PICKUP_LOSS_K + (TUBE_FRICTION * tubeL) / tubeD);
  return ATM_BAR - (OIL_DENSITY * G * Math.max(0, lift) + loss) / 1e5;
}

/** Air that comes out of the oil when the inlet pressure drops below CAVITATION_BAR (estimate: up to 15 %). */
export const cavitationAeration = (inletBar: number): number => 0.15 * Math.min(1, Math.max(0, (CAVITATION_BAR - inletBar) / 0.3));

/**
 * A pipe that delivers what entered it a volume ago: the suction tube between screen and pump, or the gallery between
 * pump and lifters. Plug flow, volume-weighted. Fixed capacity, no allocation per step.
 */
export class DelayLine {
  private readonly values: Float64Array;
  private readonly volumes: Float64Array;
  private head = 0;
  private count = 0;
  private held = 0;
  readonly volume: number;

  constructor(volume: number, capacity = 8192) {
    this.volume = volume;
    this.values = new Float64Array(capacity);
    this.volumes = new Float64Array(capacity);
  }

  /** Fills the pipe with one value. */
  fill(value: number): void {
    this.head = 0;
    this.count = 1;
    this.values[0] = value;
    this.volumes[0] = this.volume;
    this.held = this.volume;
  }

  /** Pushes `amount` of `value` in and returns the volume-weighted value that comes out. */
  push(value: number, amount: number): number {
    const cap = this.values.length;
    if (amount <= 0) return this.count ? this.values[this.head]! : value;
    // Merge with the newest entry when the ring is nearly full: plug flow keeps its average.
    if (this.count >= cap - 1) {
      const last = (this.head + this.count - 1) % cap;
      const v = this.volumes[last]!;
      this.values[last] = (this.values[last]! * v + value * amount) / (v + amount);
      this.volumes[last] = v + amount;
    } else {
      const at = (this.head + this.count) % cap;
      this.values[at] = value;
      this.volumes[at] = amount;
      this.count++;
    }
    this.held += amount;
    let excess = this.held - this.volume;
    if (excess <= 0) return this.values[this.head]!;
    let sum = 0;
    let taken = 0;
    while (excess > 1e-15 && this.count > 0) {
      const v = this.volumes[this.head]!;
      const take = Math.min(v, excess);
      sum += this.values[this.head]! * take;
      taken += take;
      excess -= take;
      if (take >= v - 1e-15) {
        this.head = (this.head + 1) % cap;
        this.count--;
      } else {
        this.volumes[this.head] = v - take;
      }
    }
    this.held = this.volume;
    return taken > 0 ? sum / taken : value;
  }
}
