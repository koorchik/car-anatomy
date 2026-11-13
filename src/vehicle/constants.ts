// Physical constants and the oil page's stand-in car data. No imports, so any module of src/vehicle can use them,
// including the ones that will run in the audio worklet.

export const G = 9.81;
export const AIR_DENSITY = 1.2;

/**
 * What the lap gives every car until stage A1b calibrates each one from its record: drag area C_d·A, m², no
 * downforce, rolling resistance, and the tyre rolling radius, m. Estimates (docs/vehicle-model.md).
 */
export const LAP_STAND_IN = { cdA: 0.7, clA: 0, crr: 0.015, tyreRadiusM: 0.33 } as const;
