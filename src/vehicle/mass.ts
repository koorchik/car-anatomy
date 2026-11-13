// The mass a model carries: the record's mass with one driver aboard. Its own module, so road-load.ts can use it
// without importing car.ts, which in turn derives the lap's VehicleSpec from road-load.ts.

import type { CarRecord } from './car.ts';

/** What the EU mass in running order counts for the driver, and what drivingMassKg adds to the other bases, kg. */
export const DRIVER_KG = 75;

/** The car with one driver aboard, kg: what the lap, the road load and the chassis carry. */
export const drivingMassKg = (car: CarRecord): number => car.massKg + (car.massBasis === 'eu' ? 0 : DRIVER_KG);
