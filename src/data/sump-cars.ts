// The cars of the oil-on-track page: six real engines that between them have all four kinds of sump, each in the car
// it came in. The car itself (mass, drive, how the engine sits) is its shared record in src/data/cars/; this file only
// says which well and why the car is here.

import { t } from '../i18n/t.ts';
import type { WellPlace } from '../systems/sump.ts';
import { vehicleSpec } from '../vehicle/car.ts';
import { LAP_STAND_IN } from '../vehicle/constants.ts';
import type { VehicleSpec } from '../vehicle/vehicle.ts';
import { CARS } from './cars.ts';

export interface SumpCar {
  /** Catalogue id of the engine, page or page/variant. */
  engineId: string;
  /** Id of the car's record in CARS; absent for the generic car of an engine that has none. */
  car?: string;
  /** Derived from the record by vehicleSpec(), never stored a second time. */
  vehicle: VehicleSpec;
  /** Where the factory pan's well sits, in the car's terms. */
  well: WellPlace;
  /** Why this car is in the set. */
  note: string;
  /** For the oil facts (capacity, sump kind); the car's own are in its record. */
  sources: string[];
  /** Oil fields not confirmed against a source. */
  unverified: string[];
}

const sumpCar = (car: string, rest: Pick<SumpCar, 'well' | 'note' | 'sources' | 'unverified'>): SumpCar => {
  const record = CARS[car];
  if (!record) throw new Error(`No car record ${car}`);
  return { engineId: record.engine, car, vehicle: vehicleSpec(record), ...rest };
};

export const SUMP_CARS: SumpCar[] = [
  sumpCar('chevrolet-camaro-ss-gen6', {
    well: 'middle',
    note: t('Заводський мокрий картер великого V8: багато оливи, але й багато її в обігу на високих обертах.'),
    sources: ['https://gm-techlink.com/wp-content/uploads/2024/11/TechLink-engine-oil-capacities-2024_B.pdf'],
    unverified: ['well'],
  }),
  sumpCar('subaru-wrx-sti-va', {
    well: 'middle',
    note: t('Опозитний мокрий картер: на довгому повороті олива збирається в головці на зовнішньому боці.'),
    sources: [],
    unverified: ['oilL', 'well'],
  }),
  sumpCar('civic-type-r-fk8', {
    well: 'middle',
    note: t('Поперечний двигун: у повороті олива тече вздовж колінвала, а на гальмуванні поперек піддона.'),
    sources: [],
    unverified: ['oilL', 'well'],
  }),
  sumpCar('porsche-cayman-s-981', {
    well: 'middle',
    note: t('Інтегрований сухий картер 9A1: олива в самому двигуні, але ступені відкачування забирають її з головок.'),
    sources: ['https://automotivetechinfo.com/wp-content/uploads/2018/11/Evolution-of-Porsche-Oiling-System-Part-2.pdf'],
    unverified: ['oilL', 'well'],
  }),
  sumpCar('porsche-911-gt3-991-2', {
    well: 'middle',
    note: t('Сухий картер з окремим баком. Двигун стоїть шківом назад, тож гальмування жене оливу до маховика.'),
    sources: ['https://www.stuttcars.com/wp-content/uploads/2021/05/Porsche_US-911GT3_2018.pdf', 'https://automotivetechinfo.com/wp-content/uploads/2018/11/Evolution-of-Porsche-Oiling-System-Part-2.pdf'],
    unverified: ['oilL'],
  }),
  sumpCar('chevrolet-corvette-z06-c8', {
    well: 'middle',
    note: t('Шестиступінчастий сухий картер з окремим відкачуванням кожного відсіку колінвала.'),
    sources: ['https://gm-techlink.com/wp-content/uploads/2026/02/TechLink-engine-oil-capacities-2026_B.pdf'],
    unverified: [],
  }),
];

export const DEFAULT_SUMP_CAR = SUMP_CARS[0]!;

export const sumpCarFor = (engineId: string): SumpCar | undefined => SUMP_CARS.find((c) => c.engineId === engineId);

/** A visitor's engine goes into a generic front-engined, rear-driven car whose mass follows its power (estimate). */
export function genericCar(name: string, powerHp: number): VehicleSpec {
  return { name, massKg: Math.min(2200, Math.max(700, 1150 + 0.75 * powerHp)), ...LAP_STAND_IN, drive: 'rwd', drivenShare: 0.5, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } };
}
