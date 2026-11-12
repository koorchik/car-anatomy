// What the systems layers draw: how the engine is fed, lit, cooled and oiled. Derived from the design,
// so the catalogue and the designer agree. Pure data, safe to run anywhere.

import type { EngineSpec } from './spec.ts';

export type FuelSystem =
  | 'carburettor' | 'mechanical' | 'port' | 'direct' | 'dual'
  | 'diesel-idi' | 'diesel-pump' | 'unit-injector' | 'common-rail';
/** fan: air-cooled with a blower. ram: air-cooled by the airflow of riding. */
export type Cooling = 'liquid' | 'fan' | 'ram';
export type OilCooler = 'none' | 'coolant' | 'air';
export type Ignition = 'coil-on-plug' | 'wasted-spark' | 'distributor';
/** crank: gerotor on the crank nose. chain: in the pan, chain from the crank. shaft: in the pan, driven by a cam, auxiliary or distributor shaft. */
export type OilPumpDrive = 'crank' | 'chain' | 'shaft';
/** feature/oil-sump adds 'dry' and 'integrated-dry'. */
export type SumpKind = 'wet';
export type SuperchargerKind = 'roots' | 'centrifugal';

export const FUEL_SYSTEMS: readonly FuelSystem[] = ['carburettor', 'mechanical', 'port', 'direct', 'dual', 'diesel-idi', 'diesel-pump', 'unit-injector', 'common-rail'];
export const COOLINGS: readonly Cooling[] = ['liquid', 'fan', 'ram'];
export const OIL_COOLERS: readonly OilCooler[] = ['none', 'coolant', 'air'];
export const IGNITIONS: readonly Ignition[] = ['coil-on-plug', 'wasted-spark', 'distributor'];
export const OIL_PUMP_DRIVES: readonly OilPumpDrive[] = ['crank', 'chain', 'shaft'];

export const isDieselSystem = (f: FuelSystem): boolean => f.startsWith('diesel') || f === 'unit-injector' || f === 'common-rail';
export const hasPortInjectors = (f: FuelSystem): boolean => f === 'port' || f === 'dual' || f === 'mechanical';
export const hasDirectInjectors = (f: FuelSystem): boolean => f === 'direct' || f === 'dual';

export interface SystemsSpec {
  fuelSystem: FuelSystem;
  cooling: Cooling;
  oilCooler: OilCooler;
  pistonJets: boolean;
  /** Plugs per chamber: 0 on a diesel, 2 on a rotary (leading and trailing). */
  sparkPlugs: 0 | 1 | 2;
  /** Null on a diesel. */
  ignition: Ignition | null;
  glowPlugs: boolean;
  oilPump: OilPumpDrive;
  /** A full-flow filter. False: only the pickup strainer, as on the Beetle. */
  oilFilter: boolean;
  sump: SumpKind;
  /** Gauge boost at full charge, bar. Zero without a charger. */
  boostBar: number;
  /** Intercooler effectiveness 0..0.95, zero without one. */
  intercooler: number;
  supercharger: SuperchargerKind | null;
  /** Stoichiometric air-fuel ratio of the fuel. */
  afr: number;
  /** Lower heating value of the fuel, MJ/kg. */
  lhvMJ: number;
  /** Mixture at full load: the design's lambda, the same enrichment the power model uses. */
  lambda: number;
  /** Ignition relative to best timing, crank degrees, positive earlier. */
  ignitionOffset: number;
}

/** The spec's systems, or the usual ones for its fuel and aspiration, for specs written by hand in tests. */
export function systemsOf(spec: EngineSpec): SystemsSpec {
  if (spec.systems) return spec.systems;
  const diesel = spec.fuel === 'diesel';
  const rotary = spec.layout.kind === 'wankel';
  const boosted = spec.aspiration !== 'na';
  return {
    fuelSystem: diesel ? 'common-rail' : 'port',
    cooling: 'liquid',
    oilCooler: boosted || diesel ? 'coolant' : 'none',
    pistonJets: !rotary && (boosted || diesel),
    sparkPlugs: diesel ? 0 : rotary ? 2 : 1,
    ignition: diesel ? null : 'coil-on-plug',
    glowPlugs: diesel,
    oilPump: rotary ? 'chain' : 'crank',
    oilFilter: true,
    sump: 'wet',
    boostBar: boosted ? 0.8 : 0,
    intercooler: boosted && spec.aspiration !== 'supercharged' ? 0.7 : 0,
    supercharger: spec.aspiration === 'supercharged' ? 'roots' : null,
    afr: diesel ? 14.5 : 14.7,
    lhvMJ: diesel ? 42.7 : 43,
    lambda: diesel ? 1.4 : 0.9,
    ignitionOffset: 0,
  };
}
