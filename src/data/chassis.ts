// Registry of the cars whose whole chassis the suspension section builds, one line per car (each car has its own file
// in src/data/chassis/), keyed by the car id every section shares. A car here has CarRecord.suspension set to the
// layouts of its two axles (tests/chassis-model.test.ts).

import type { ChassisCar } from '../suspension/car-chassis.ts';
import { CIVIC_TYPE_R_FK8 } from './chassis/civic-type-r-fk8.ts';
import { PORSCHE_911_CARRERA_T_992 } from './chassis/porsche-911-carrera-t-992.ts';

export const CHASSIS_CARS: Record<string, ChassisCar> = {
  'civic-type-r-fk8': CIVIC_TYPE_R_FK8,
  'porsche-911-carrera-t-992': PORSCHE_911_CARRERA_T_992,
};

export const chassisCarById = (id: string): ChassisCar | undefined => (Object.hasOwn(CHASSIS_CARS, id) ? CHASSIS_CARS[id] : undefined);
