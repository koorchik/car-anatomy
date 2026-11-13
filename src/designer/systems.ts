// The hardware the systems layers draw, worked out from a design. Every field of the design may be null, meaning
// "what the rest of the design implies", and this is the one place that says what that is.
// None of it reaches the power model: only the layers in the X-ray read it.

import {
  type Cooling,
  type FuelSystem,
  type Ignition,
  type OilCooler,
  type OilPumpDrive,
  type SystemsSpec,
} from '../engine/systems-spec.ts';
import { t } from '../i18n/t.ts';
import { isBoosted, isRotary, type Design } from './design.ts';
import { FUELS } from './fuels.ts';
import { effectiveOilL, effectiveSump } from './lubrication.ts';

/** The design fields this module owns. Editing them never changes the engine's figures. */
export const SYSTEM_KEYS = ['fuelSystem', 'cooling', 'oilCooler', 'pistonJets', 'sparkPlugs', 'ignition', 'glowPlugs', 'oilPump', 'oilFilter'] as const;

export interface SystemChoices {
  fuelSystem: FuelSystem;
  cooling: Cooling;
  oilCooler: OilCooler;
  pistonJets: boolean;
  sparkPlugs: 1 | 2;
  ignition: Ignition;
  glowPlugs: boolean;
  oilPump: OilPumpDrive;
  oilFilter: boolean;
}

const isDiesel = (d: Design): boolean => FUELS[d.fuel].diesel;

/** Fuel systems that fit the fuel and the injection the power model was told about. */
export function fuelSystemsFor(d: Design): FuelSystem[] {
  if (isDiesel(d)) return d.directInjection ? ['diesel-pump', 'unit-injector', 'common-rail'] : ['diesel-idi'];
  return d.directInjection ? ['direct', 'dual'] : ['carburettor', 'mechanical', 'port'];
}

/**
 * What each field is when the design leaves it null. Later fields follow the ones before them as the design
 * has them, so a carburettor brings a distributor and air cooling brings an oil cooler in the airflow.
 */
export function systemDefaults(d: Design): SystemChoices {
  const diesel = isDiesel(d);
  const fuelSystem: FuelSystem = diesel ? (d.directInjection ? 'common-rail' : 'diesel-idi') : d.directInjection ? 'direct' : 'port';
  const shownFuel = d.fuelSystem ?? fuelSystem;
  const cooling: Cooling = 'liquid';
  const shownCooling = d.cooling ?? cooling;
  // Air-cooled engines lean on an oil cooler in the airflow; so does a rotary, whose rotors are oil-cooled.
  const oilCooler: OilCooler = shownCooling !== 'liquid' || isRotary(d) ? 'air' : isBoosted(d) || diesel ? 'coolant' : 'none';
  return {
    fuelSystem,
    cooling,
    oilCooler,
    pistonJets: isBoosted(d) || diesel,
    sparkPlugs: 1,
    ignition: shownFuel === 'carburettor' || shownFuel === 'mechanical' ? 'distributor' : 'coil-on-plug',
    glowPlugs: diesel,
    oilPump: 'crank',
    oilFilter: true,
  };
}

/** The design's own choices where it has them, the defaults elsewhere. */
export function shownSystems(d: Design): SystemChoices {
  const def = systemDefaults(d);
  return {
    fuelSystem: d.fuelSystem ?? def.fuelSystem,
    cooling: d.cooling ?? def.cooling,
    oilCooler: d.oilCooler ?? def.oilCooler,
    pistonJets: d.pistonJets ?? def.pistonJets,
    sparkPlugs: d.sparkPlugs ?? def.sparkPlugs,
    ignition: d.ignition ?? def.ignition,
    glowPlugs: d.glowPlugs ?? def.glowPlugs,
    oilPump: d.oilPump ?? def.oilPump,
    oilFilter: d.oilFilter ?? def.oilFilter,
  };
}

/** The SystemsSpec of a design. A rotary's cooling, plugs and pump are fixed by its construction. */
export function systemsOfDesign(d: Design): SystemsSpec {
  const s = shownSystems(d);
  const fuel = FUELS[d.fuel];
  const rotary = isRotary(d);
  const boosted = isBoosted(d);
  return {
    fuelSystem: s.fuelSystem,
    cooling: rotary ? 'liquid' : s.cooling,
    oilCooler: s.oilCooler,
    pistonJets: rotary ? false : s.pistonJets,
    sparkPlugs: fuel.diesel ? 0 : rotary ? 2 : s.sparkPlugs,
    ignition: fuel.diesel ? null : s.ignition,
    glowPlugs: fuel.diesel ? s.glowPlugs : false,
    oilPump: rotary ? 'chain' : s.oilPump,
    oilFilter: s.oilFilter,
    sump: effectiveSump(d),
    oilL: effectiveOilL(d),
    boostBar: boosted ? d.boostBar : 0,
    intercooler: boosted ? d.intercooler : 0,
    supercharger: d.charger === 'roots' || d.charger === 'centrifugal' ? d.charger : null,
    afr: fuel.afr,
    lhvMJ: fuel.lhv,
    lambda: d.lambda,
    ignitionOffset: d.ignitionOffset,
  };
}

/** Part of resolveDesign: a fuel system that no longer fits the fuel or the injection goes back to derived. */
export function resolveSystems(d: Design): void {
  if (d.fuelSystem !== null && !fuelSystemsFor(d).includes(d.fuelSystem)) d.fuelSystem = null;
}

export const FUEL_SYSTEM_NAMES: Record<FuelSystem, string> = {
  carburettor: t('карбюратор'),
  mechanical: t('механічне безперервне упорскування'),
  port: t('упорскування у впускні канали'),
  direct: t('безпосереднє упорскування'),
  dual: t('упорскування в канали й у циліндри'),
  'diesel-idi': t('дизель із форкамерою'),
  'diesel-pump': t('дизель із насосом високого тиску'),
  'unit-injector': t('насос-форсунки'),
  'common-rail': t('Common Rail'),
};

export const COOLING_NAMES: Record<Cooling, string> = {
  liquid: t('рідинне'),
  fan: t('повітряне, вентилятором'),
  ram: t('повітряне, набігаючим потоком'),
};

export const OIL_COOLER_NAMES: Record<OilCooler, string> = {
  none: t('немає'),
  coolant: t('теплообмінник у рідину'),
  air: t('радіатор у потоці повітря'),
};

export const IGNITION_NAMES: Record<Ignition, string> = {
  'coil-on-plug': t('котушка на кожній свічці'),
  'wasted-spark': t('холоста іскра'),
  distributor: t('розподільник'),
};

export const OIL_PUMP_NAMES: Record<OilPumpDrive, string> = {
  crank: t('на носку колінвала'),
  chain: t('у піддоні, ланцюгом'),
  shaft: t('у піддоні, валиком'),
};
