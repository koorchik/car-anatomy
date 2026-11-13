// Sizes the hardpoints do not give, for the drawing only: the model reads nothing from them.

/**
 * Metres: typical of a compact car's corner. The strut's sizes are a front strut's; a coilover between the body and an
 * arm is slimmer, with a smaller coil, as on cars with wishbones or links.
 */
export const DRAWING = {
  /** Wheel offset (ET): the hub face outboard of the wheel's centre plane. */
  wheelOffsetM: 0.045,
  rimWidthM: 0.2032,
  discOuterM: 0.15,
  discInnerM: 0.088,
  discThickM: 0.026,
  /** The disc's braking ring sits this far inboard of the hub face. */
  hatDepthM: 0.039,
  strutTubeRadiusM: 0.026,
  rodRadiusM: 0.011,
  /** Coil spring: mean radius, total turns and closed turns at each end. */
  springMeanRadiusM: 0.06,
  springTurns: 6,
  springEndTurns: 0.75,
  /** Rod guide at the top of the strut tube, and the margin below the piston at full bump. */
  guideM: 0.02,
  /** A coilover's tube, rod and coil, and where its seats sit: below the top mount and above the lower eye. */
  coiloverTubeRadiusM: 0.022,
  coiloverRodRadiusM: 0.009,
  coiloverSpringMeanRadiusM: 0.045,
  coiloverUpperSeatM: 0.035,
  coiloverLowerSeatM: 0.06,
} as const;

/** Shear modulus of carbon steel, Pa: the handbook value (Shigley, table A-5), not checked against a primary source. */
const STEEL_SHEAR_PA = 79.3e9;

/**
 * Wire diameter (m) of a coil of DRAWING's turns and the given mean radius that has `rate` (N/m):
 * k = G·d⁴ / (8·D³·n), the helical spring formula, with n the active turns. 25 N/mm on the strut's coil gives 11.8 mm.
 */
export function springWireM(rate: number, meanRadiusM: number = DRAWING.springMeanRadiusM): number {
  const D = 2 * meanRadiusM;
  const n = DRAWING.springTurns - 2 * DRAWING.springEndTurns;
  return ((8 * rate * D ** 3 * n) / STEEL_SHEAR_PA) ** 0.25;
}
