// Every real car of the site, one record per file in src/data/cars/, shared by all sections (src/vehicle/car.ts).
// A dozen stages add cars in parallel, so a new car is one import line and one list line, kept in alphabetical order.

import type { CarRecord } from '../vehicle/car.ts';
import { CAR as bmwM3E30 } from './cars/bmw-m3-e30.ts';
import { CAR as chevroletCamaroSsGen6 } from './cars/chevrolet-camaro-ss-gen6.ts';
import { CAR as chevroletCorvetteZ06C8 } from './cars/chevrolet-corvette-z06-c8.ts';
import { CAR as civicTypeRFk8 } from './cars/civic-type-r-fk8.ts';
import { CAR as porsche911Gt3_991_2 } from './cars/porsche-911-gt3-991-2.ts';
import { CAR as porscheCaymanS981 } from './cars/porsche-cayman-s-981.ts';
import { CAR as subaruWrxStiVa } from './cars/subaru-wrx-sti-va.ts';

export const CAR_LIST: readonly CarRecord[] = [
  bmwM3E30,
  chevroletCamaroSsGen6,
  chevroletCorvetteZ06C8,
  civicTypeRFk8,
  porsche911Gt3_991_2,
  porscheCaymanS981,
  subaruWrxStiVa,
];

// Ids arrive from addresses (#/car/<id>, ?car=), so the map has no prototype: 'constructor' or '__proto__' must find
// no car rather than a function of Object.prototype.
export const CARS: Readonly<Record<string, CarRecord>> = Object.assign(
  Object.create(null) as Record<string, CarRecord>,
  Object.fromEntries(CAR_LIST.map((car) => [car.id, car])),
);

export const carById = (id: string): CarRecord | undefined => CARS[id];
