// Registry of the hybrid cars the gearbox section drives, one line per car (each car has its own file in
// src/data/hybrid-cars/), keyed by the shared car id.

import type { HybridCar } from '../drivetrain/hybrid-car.ts';
import { TOYOTA_PRIUS_XW30 } from './hybrid-cars/toyota-prius-xw30.ts';

export const HYBRID_CARS: readonly HybridCar[] = [TOYOTA_PRIUS_XW30];

export const hybridCarById = (id: string): HybridCar | undefined => HYBRID_CARS.find((h) => h.car === id);
