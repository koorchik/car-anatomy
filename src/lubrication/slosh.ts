// The oil's surface lags the felt gravity like a damped oscillator at the first slosh mode of a rectangular tank
// (Abramson, NASA SP-106): ω₁² = (π g / L) · tanh(π h / L). Its slope along each engine axis follows the quasi-static
// slope tan φ = -a / (g + a_v) with overshoot exp(-ζπ/√(1-ζ²)) on a step.

/** First-mode angular frequency, rad/s, of liquid h metres deep in a tank L metres long under gravity g. */
export function sloshOmega(L: number, h: number, g: number): number {
  if (L <= 0 || h <= 0 || g <= 0) return 0;
  return Math.sqrt(((Math.PI * g) / L) * Math.tanh((Math.PI * h) / L));
}

/** One axis of the surface's slope. Semi-implicit Euler, which stays stable for ω·dt well under 2. */
export class SloshAxis {
  slope = 0;
  rate = 0;

  reset(slope: number): void {
    this.slope = slope;
    this.rate = 0;
  }

  step(target: number, omega: number, zeta: number, dt: number): void {
    if (omega <= 0) {
      this.slope = target;
      this.rate = 0;
      return;
    }
    this.rate += dt * (omega * omega * (target - this.slope) - 2 * zeta * omega * this.rate);
    this.slope += dt * this.rate;
  }
}

/** Overshoot of a damped oscillator on a step, as a share of the step. */
export const stepOvershoot = (zeta: number): number => Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
