// The Prius 3's drivetrain beyond its shared record: the power-split box P410 (src/data/gearboxes/power-split.ts), the
// battery and the control's figures.
//
// Published: the battery, nickel-metal hydride, 201.6 V of 168 cells, 6.5 A·h, 27 kW peak (Toyota's 2010 product
// information and Toyota GB's launch pack); the system's 100 kW (134 hp, both); electric driving from start-up and
// below 44 mph, 70 km/h, the engine joining under hard acceleration (the launch pack).
// Ours: the damper (the disc damper of elements.ts: the transaxle's own is not published), halfshafts of 24 mm steel
// over 0.6 m, a 15″ wheel with its tyre, hub and disc of 0.8 kg·m², the open differential, the power the battery
// takes (taken equal to what it gives), the window of the state of charge and the engine's top speed at the 5200 rpm
// of its peak power.

import { DISC_DAMPER } from '../../drivetrain/elements.ts';
import type { HybridCar } from '../../drivetrain/hybrid-car.ts';

export const TOYOTA_PRIUS_XW30: HybridCar = {
  car: 'toyota-prius-xw30',
  gearbox: 'power-split',
  differential: { kind: 'open' },
  damper: DISC_DAMPER,
  halfshaft: { diameterMm: 24, lengthM: 0.6 },
  wheelInertia: 0.8,
  battery: { nominalV: 201.6, capacityAh: 6.5, maxDischargeKw: 27, maxChargeKw: 27, socMin: 0.4, socMax: 0.8, socStart: 0.6 },
  control: { systemKw: 100, evMaxKmh: 70, engineMaxRpm: 5200 },
  sources: [
    'https://web.archive.org/web/20101226001731/http://pressroom.toyota.com/pr/tms/toyota/document/10_Prius_Product_Info_final.pdf',
    'https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/Prius-gen3-UK-launch-pack-2009.pdf',
  ],
  unverified: ['differential', 'damper', 'halfshaft', 'wheelInertia', 'battery.maxChargeKw', 'battery.socMin', 'battery.socMax', 'battery.socStart', 'control.engineMaxRpm'],
};
