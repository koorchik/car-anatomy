// Registry of the cars the gearbox section drives, one line per car (each car has its own file in
// src/data/drive-cars/), keyed by the car id every section shares.

import type { DriveCar } from '../drivetrain/drive-car.ts';
import { BMW_M3_E30 } from './drive-cars/bmw-m3-e30.ts';

export const DRIVE_CARS: Record<string, DriveCar> = {
  'bmw-m3-e30': BMW_M3_E30,
};

export const driveCarById = (id: string): DriveCar | undefined => DRIVE_CARS[id];
