// An oil accumulator on the gallery (Canton Accusump): a cylinder with a piston between the oil and a precharged
// air space. Isothermal air: p_abs·V_air = p_pre,abs·V_total. It gives oil back through its valve when the gallery
// pressure drops below its own, and refills through a restrictor, slower, so that refilling never robs the bearings.

import { ACCUMULATOR_DEAD_L, ACCUMULATOR_IN, ACCUMULATOR_L, ACCUMULATOR_OUT, ACCUMULATOR_PRECHARGE_BAR, ATM_BAR } from './constants.ts';

export class Accumulator {
  /** Oil in the cylinder, litres. */
  oil = 0;
  readonly total = ACCUMULATOR_L;
  private readonly preAbs = ACCUMULATOR_PRECHARGE_BAR + ATM_BAR;

  /** Gauge pressure of the air, and so of the oil, bar. */
  pressure(): number {
    const air = Math.max(1e-6, this.total - this.oil);
    return Math.max(ACCUMULATOR_PRECHARGE_BAR, (this.preAbs * this.total) / air - ATM_BAR);
  }

  /** Oil it holds when charged to a gauge pressure. */
  oilAt(gauge: number): number {
    if (gauge <= ACCUMULATOR_PRECHARGE_BAR) return 0;
    return Math.min(this.total - ACCUMULATOR_DEAD_L, this.total * (1 - this.preAbs / (gauge + ATM_BAR)));
  }

  /** Flow into the gallery, L/s: positive when it gives oil, negative while it refills. */
  flow(gallery: number): number {
    const dp = this.pressure() - gallery;
    if (dp > 0) return this.oil > 1e-9 ? ACCUMULATOR_OUT * dp : 0;
    return this.oil < this.total - ACCUMULATOR_DEAD_L ? ACCUMULATOR_IN * dp : 0;
  }

  step(flow: number, dt: number): void {
    this.oil = Math.min(this.total - ACCUMULATOR_DEAD_L, Math.max(0, this.oil - flow * dt));
  }
}
