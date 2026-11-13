// The one port between the drivetrain and the chassis (whole-car plan, the chain of force): one per car, arrays in the
// order FL, FR, RL, RR. Every field has exactly one writer, so the drivetrain never knows which chassis is behind it
// (the lift, longitudinal.ts on the gearbox pages, ChassisSim on the whole car). No DOM and no text: the audio worklet
// steps it.

export const FL = 0;
export const FR = 1;
export const RL = 2;
export const RR = 3;
export const WHEELS = 4;

export interface WheelBus {
  /** The chassis (ChassisPort.preStep), from the state at the start of the step: load, N; wheel-centre velocity along
   *  and across the wheel heading, m/s; camber, rad; effective rolling radius, m; surface share of dry friction. */
  fz: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  camber: Float64Array;
  rEff: Float64Array;
  surfaceMu: Float64Array;
  /** The drivetrain, or a stub drive on suspension pages: halfshaft spring torque on each hub, N·m; 0 when undriven. */
  driveNm: Float64Array;
  /** The drivetrain: propshaft torque of a longitudinal engine, reacting on the body about the car's x axis, N·m. */
  propNm: number;
  /** The controls: brake torque capacity on each wheel, N·m. */
  brakeNm: Float64Array;
  /** wheel.ts: spin, rad/s (positive rolls the car forward), and angle, rad, of every wheel. */
  omega: Float64Array;
  angle: Float64Array;
  /** The tyre pass: forces in the wheel frame, N, the aligning moment, N·m, and ∂fx/∂ω for a linear-implicit wheel. */
  fx: Float64Array;
  fy: Float64Array;
  mz: Float64Array;
  dFxdOmega: Float64Array;
}

export function newWheelBus(): WheelBus {
  const a = () => new Float64Array(WHEELS);
  return {
    fz: a(), vx: a(), vy: a(), camber: a(), rEff: a(), surfaceMu: Float64Array.of(1, 1, 1, 1),
    driveNm: a(), propNm: 0, brakeNm: a(), omega: a(), angle: a(), fx: a(), fy: a(), mz: a(), dFxdOmega: a(),
  };
}
