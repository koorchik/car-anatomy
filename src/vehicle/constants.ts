// Physical constants and the generic car of a visitor's engine. No imports, so any module of src/vehicle can use them,
// including the ones that will run in the audio worklet.

export const G = 9.81;
export const AIR_DENSITY = 1.2;

/**
 * The car a visitor's engine drives when it has no record (the oil page and the designer's track): drag area C_d·A,
 * m², no downforce, rolling resistance, and the tyre rolling radius, m. Estimates (docs/vehicle-model.md); a real car
 * gets all of these from its record instead.
 */
export const GENERIC_CAR = { cdA: 0.7, clA: 0, crr: 0.015, tyreRadiusM: 0.33 } as const;
