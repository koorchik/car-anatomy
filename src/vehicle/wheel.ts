// The wheels' spin, for every chassis (whole-car plan, step 4): J_w·ω̇ = driveNm − brake − fx·r, linear-implicit in
// the tyre force through dFxdOmega, so a stiff tyre at low speed is stable at any step. The brake is Coulomb friction
// with a static hold: a wheel it can stop stands still. No DOM: the worklet runs it.

import { WHEELS, type WheelBus } from './wheel-bus.ts';

/** Integrates every wheel over dt with the inertia of each, kg·m² (wheel, tyre, hub and brake disc). */
export function stepWheels(bus: WheelBus, inertia: ArrayLike<number>, dt: number): void {
  for (let i = 0; i < WHEELS; i++) {
    const r = bus.rEff[i]!;
    // fx(ω + Δω) ≈ fx + (∂fx/∂ω)·Δω: the tyre's slope joins the inertia.
    const jEff = inertia[i]! + dt * r * Math.max(0, bus.dFxdOmega[i]!);
    const free = bus.omega[i]! + (dt * (bus.driveNm[i]! - bus.fx[i]! * r)) / jEff;
    const hold = (dt * Math.max(0, bus.brakeNm[i]!)) / jEff;
    const w = Math.abs(free) <= hold ? 0 : free - Math.sign(free) * hold;
    bus.omega[i] = w;
    bus.angle[i]! += dt * w;
  }
}

/** Kinetic energy of the four wheels, J. */
export const wheelEnergy = (bus: WheelBus, inertia: ArrayLike<number>): number => {
  let e = 0;
  for (let i = 0; i < WHEELS; i++) e += 0.5 * inertia[i]! * bus.omega[i]! ** 2;
  return e;
};
