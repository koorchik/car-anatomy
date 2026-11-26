// The lock-up clutch's controller (stage K12a; the shift program of stage K12b decides when to call for it). Real
// lock-up clutches mostly slip a little on purpose: the EPA found the 6T40's "almost always in a state of slip", an
// NVH measure (research §9). So the controller does not lock: it holds the slip near SLIP_TARGET_RPM with the clamp,
// a proportional and an integral term on the slip error, after a fill ramp [estimates of the gains and the target].

const RPM = 30 / Math.PI;

/** Slip the controller holds, rpm [estimate inside the gearbox plan's 30–60]. */
export const SLIP_TARGET_RPM = 40;
/** Clamp share per rad/s of slip error, and its integral per rad/s·s [estimates, stable on the 8HP lab]. */
const KP = 0.004;
const KI = 0.06;
/** Time the piston takes to fill to the touch point, s (gearbox plan: 0.1 s). */
const FILL_S = 0.1;

export class LockupControl {
  /** Clamp share 0…1 commanded in the last step. */
  command = 0;
  private integral = 0;
  private filled = 0;

  /** The clamp share for this step: 0 while not asked; `slip` is pump minus turbine speed, rad/s. */
  step(h: number, on: boolean, slip: number): number {
    if (!on) {
      this.integral = 0;
      this.filled = 0;
      this.command = 0;
      return 0;
    }
    if (this.filled < FILL_S) {
      this.filled += h;
      this.command = 0;
      return 0;
    }
    const error = slip - SLIP_TARGET_RPM / RPM;
    this.integral = Math.min(1, Math.max(0, this.integral + h * KI * error));
    this.command = Math.min(1, Math.max(0, this.integral + KP * error));
    return this.command;
  }
}
