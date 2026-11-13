// The cars of the oil-on-track page: six real engines that between them have all four kinds of sump, each in the car
// it came in. Masses and mounts are from memory unless a source is listed, so they stay in `unverified`.

import { t } from '../i18n/t.ts';
import type { WellPlace } from '../systems/sump.ts';
import type { VehicleSpec } from '../vehicle/vehicle.ts';

export interface SumpCar {
  /** Catalogue id of the engine, page or page/variant. */
  engineId: string;
  vehicle: VehicleSpec;
  /** Where the factory pan's well sits, in the car's terms. */
  well: WellPlace;
  /** Why this car is in the set. */
  note: string;
  sources: string[];
  /** Field names not confirmed against a source. */
  unverified: string[];
}

/** Drag area and rolling resistance of every car here (estimates; aerodynamics is beyond this page). */
const AERO = { cdA: 0.7, clA: 0, crr: 0.015, tyreRadiusM: 0.33 };

export const SUMP_CARS: SumpCar[] = [
  {
    engineId: 'v8-cross/camaro-ss-lt1',
    vehicle: { name: 'Chevrolet Camaro SS', massKg: 1670, ...AERO, drive: 'rwd', drivenShare: 0.48, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } },
    well: 'middle',
    note: t('Заводський мокрий картер великого V8: багато оливи, але й багато її в обігу на високих обертах.'),
    sources: ['https://gm-techlink.com/wp-content/uploads/2024/11/TechLink-engine-oil-capacities-2024_B.pdf'],
    unverified: ['massKg', 'well'],
  },
  {
    engineId: 'b4',
    vehicle: { name: 'Subaru WRX STI', massKg: 1540, ...AERO, drive: 'awd', drivenShare: 1, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } },
    well: 'middle',
    note: t('Опозитний мокрий картер: на довгому повороті олива збирається в головці на зовнішньому боці.'),
    sources: [],
    unverified: ['massKg', 'oilL', 'well'],
  },
  {
    engineId: 'i4/civic-type-r-k20c1',
    vehicle: { name: 'Honda Civic Type R (FK8)', massKg: 1415, ...AERO, drive: 'fwd', drivenShare: 0.62, mount: { axis: 'transverse', front: 'right', position: 'front' } },
    well: 'middle',
    note: t('Поперечний двигун: у повороті олива тече вздовж колінвала, а на гальмуванні поперек піддона.'),
    sources: [],
    unverified: ['massKg', 'oilL', 'mount', 'well'],
  },
  {
    engineId: 'b6/porsche-cayman-981-3-4',
    vehicle: { name: 'Porsche Cayman S (981)', massKg: 1320, ...AERO, drive: 'rwd', drivenShare: 0.55, mount: { axis: 'longitudinal', front: 'forward', position: 'mid' } },
    well: 'middle',
    note: t('Інтегрований сухий картер 9A1: олива в самому двигуні, але ступені відкачування забирають її з головок.'),
    sources: ['https://automotivetechinfo.com/wp-content/uploads/2018/11/Evolution-of-Porsche-Oiling-System-Part-2.pdf'],
    unverified: ['massKg', 'oilL', 'well'],
  },
  {
    engineId: 'b6',
    vehicle: { name: 'Porsche 911 GT3 (991.2)', massKg: 1413, ...AERO, drive: 'rwd', drivenShare: 0.61, mount: { axis: 'longitudinal', front: 'rearward', position: 'rear' } },
    well: 'middle',
    note: t('Сухий картер з окремим баком. Двигун стоїть шківом назад, тож гальмування жене оливу до маховика.'),
    sources: ['https://www.stuttcars.com/wp-content/uploads/2021/05/Porsche_US-911GT3_2018.pdf', 'https://automotivetechinfo.com/wp-content/uploads/2018/11/Evolution-of-Porsche-Oiling-System-Part-2.pdf'],
    unverified: ['massKg', 'oilL'],
  },
  {
    engineId: 'v8-flat/corvette-z06-c8-lt6',
    vehicle: { name: 'Chevrolet Corvette Z06 (C8)', massKg: 1560, ...AERO, drive: 'rwd', drivenShare: 0.6, mount: { axis: 'longitudinal', front: 'forward', position: 'mid' } },
    well: 'middle',
    note: t('Шестиступінчастий сухий картер з окремим відкачуванням кожного відсіку колінвала.'),
    sources: ['https://gm-techlink.com/wp-content/uploads/2026/02/TechLink-engine-oil-capacities-2026_B.pdf', 'https://en.wikipedia.org/wiki/Chevrolet_Corvette_(C8)'],
    unverified: ['massKg'],
  },
];

export const DEFAULT_SUMP_CAR = SUMP_CARS[0]!;

export const sumpCarFor = (engineId: string): SumpCar | undefined => SUMP_CARS.find((c) => c.engineId === engineId);

/** A visitor's engine goes into a generic front-engined, rear-driven car whose mass follows its power (estimate). */
export function genericCar(name: string, powerHp: number): VehicleSpec {
  return { name, massKg: Math.min(2200, Math.max(700, 1150 + 0.75 * powerHp)), ...AERO, drive: 'rwd', drivenShare: 0.5, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } };
}
