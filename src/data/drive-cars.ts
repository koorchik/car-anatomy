// Registry of the cars the gearbox section drives, one line per car (each car has its own file in
// src/data/drive-cars/), keyed by the car id every section shares.

import type { DriveCar } from '../drivetrain/drive-car.ts';
import { BMW_M3_E30 } from './drive-cars/bmw-m3-e30.ts';
import { CIVIC_TYPE_R_FK8 } from './drive-cars/civic-type-r-fk8.ts';
import { PORSCHE_911_CARRERA_T_992 } from './drive-cars/porsche-911-carrera-t-992.ts';

export const DRIVE_CARS: Record<string, DriveCar> = {
  'bmw-m3-e30': BMW_M3_E30,
  'civic-type-r-fk8': CIVIC_TYPE_R_FK8,
  'porsche-911-carrera-t-992': PORSCHE_911_CARRERA_T_992,
};

export const driveCarById = (id: string): DriveCar | undefined => DRIVE_CARS[id];
