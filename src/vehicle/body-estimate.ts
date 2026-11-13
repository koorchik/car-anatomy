// Inertias of a car that has none measured. NHTSA measured the whole-vehicle inertias of a few hundred cars (Heydinger
// et al., SAE 1999-01-1336, «Measured Vehicle Inertial Parameters – NHTSA's Data Through November 1998», read through a
// third-party copy; docs/suspension-research/real_car_data.md, table A1). Each radius of gyration divided by the size it
// scales with (the mean track for roll, the wheelbase for pitch and yaw) is nearly the same across the passenger cars
// of that table, so a car without a measurement takes the mean ratio: I = m·(ratio·size)². Our regression, not
// Allen et al.'s: on the cars it was made from it gives roll within ±13 % and pitch and yaw within ±22 % (tests). No
// DOM and no text, so the audio worklet may import it.

import type { VehicleBody } from './car.ts';

/** One row of NHTSA's table: weight with a full tank, N; wheelbase and tracks, m; pitch, roll and yaw, kg·m². */
interface NhtsaRow { car: string; weightN: number; wheelbaseM: number; trackM: readonly [number, number]; iyy: number; ixx: number; izz: number }

/** The passenger cars of table A1 with inertias (the Jeeps and the loaded Protegé left out). */
export const NHTSA_CARS: readonly NhtsaRow[] = [
  { car: '1998 Honda Civic', weightN: 11217, wheelbaseM: 2.621, trackM: [1.471, 1.468], iyy: 1617, ixx: 365, izz: 1785 },
  { car: '1983 Honda Civic', weightN: 8621, wheelbaseM: 2.235, trackM: [1.377, 1.379], iyy: 1122, ixx: 250, izz: 1216 },
  { car: '1998 Mazda Protégé', weightN: 11289, wheelbaseM: 2.601, trackM: [1.453, 1.461], iyy: 1558, ixx: 426, izz: 1737 },
  { car: '1986 BMW 325i', weightN: 12277, wheelbaseM: 2.57, trackM: [1.402, 1.394], iyy: 2011, ixx: 381, izz: 2027 },
  { car: '1987 Mercedes 190 (V158)', weightN: 12766, wheelbaseM: 2.664, trackM: [1.438, 1.417], iyy: 2083, ixx: 444, izz: 2095 },
  { car: '1987 Mercedes 190 (V159)', weightN: 12722, wheelbaseM: 2.664, trackM: [1.438, 1.417], iyy: 2099, ixx: 449, izz: 2113 },
  { car: '1987 Mercedes 190 E', weightN: 12766, wheelbaseM: 2.653, trackM: [1.419, 1.4], iyy: 2123, ixx: 443, izz: 2137 },
  { car: '1984 Audi 4000 Quattro', weightN: 12161, wheelbaseM: 2.52, trackM: [1.389, 1.405], iyy: 2328, ixx: 404, izz: 2352 },
  { car: '1988 Ford Mustang GL', weightN: 12322, wheelbaseM: 2.553, trackM: [1.454, 1.445], iyy: 2150, ixx: 408, izz: 2225 },
  { car: '1988 Ford Mustang GT', weightN: 14412, wheelbaseM: 2.559, trackM: [1.467, 1.461], iyy: 2568, ixx: 453, izz: 2620 },
  { car: '1971 Volkswagen Beetle', weightN: 8403, wheelbaseM: 2.408, trackM: [1.313, 1.328], iyy: 1196, ixx: 235, izz: 1289 },
  { car: '1987 Yugo GV', weightN: 8051, wheelbaseM: 2.134, trackM: [1.321, 1.27], iyy: 919, ixx: 251, izz: 940 },
  { car: '1988 Yugo GV', weightN: 9065, wheelbaseM: 2.159, trackM: [1.321, 1.27], iyy: 1018, ixx: 265, izz: 1073 },
  { car: '1976 Toyota Corolla', weightN: 10462, wheelbaseM: 2.372, trackM: [1.372, 1.349], iyy: 1619, ixx: 300, izz: 1706 },
  { car: '1987 Toyota Corolla FX', weightN: 9768, wheelbaseM: 2.431, trackM: [1.425, 1.405], iyy: 1485, ixx: 324, izz: 1594 },
  { car: '1991 Volvo 240', weightN: 14403, wheelbaseM: 2.647, trackM: [1.435, 1.356], iyy: 2560, ixx: 476, izz: 2663 },
];

/** Standard gravity: NHTSA's newtons back to kilograms. */
const G0 = 9.80665;

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const radius = (i: number, weightN: number): number => Math.sqrt(i / (weightN / G0));

/** Mean radius of gyration over the scaling size: roll over the mean track, pitch and yaw over the wheelbase. */
export const GYRATION_RATIOS = {
  roll: mean(NHTSA_CARS.map((r) => radius(r.ixx, r.weightN) / ((r.trackM[0] + r.trackM[1]) / 2))),
  pitch: mean(NHTSA_CARS.map((r) => radius(r.iyy, r.weightN) / r.wheelbaseM)),
  yaw: mean(NHTSA_CARS.map((r) => radius(r.izz, r.weightN) / r.wheelbaseM)),
} as const;

export interface BodyInertia { ixx: number; iyy: number; izz: number; source: 'nhtsa' | 'maker' | 'estimate' }

/** Whole-vehicle inertias about its centre of mass from mass, wheelbase and mean track, kg·m² (estimate). */
export function estimateInertia(massKg: number, wheelbaseM: number, trackM: number): BodyInertia {
  const sq = (r: number, size: number): number => massKg * (r * size) ** 2;
  return {
    ixx: sq(GYRATION_RATIOS.roll, trackM),
    iyy: sq(GYRATION_RATIOS.pitch, wheelbaseM),
    izz: sq(GYRATION_RATIOS.yaw, wheelbaseM),
    source: 'estimate',
  };
}

/** The body's own inertias, or the estimate when the record has none. */
export function bodyInertia(body: VehicleBody, massKg: number): BodyInertia {
  return body.inertia ?? estimateInertia(massKg, body.wheelbaseM, (body.trackFrontM + body.trackRearM) / 2);
}
