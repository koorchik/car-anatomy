// The car as a point mass for the lap: tyres, mass, drag, which wheels drive, and how the engine sits in it.
// The whole-car section extends these types (weight transfer, load-sensitive tyres, a real gearbox); the oil sump only
// reads the lap's accelerations, so new optional fields cost it nothing. A real car's VehicleSpec is derived from its
// record by vehicleSpec() in car.ts.

import { AIR_DENSITY, G } from './constants.ts';
import { roadLoadN, type RoadLoadCoeffs } from './road-load.ts';
// Compatibility until stage O2a: the oil page still reads TYRES[id].name. Then pages translate ids with TYRE_NAMES
// themselves, and this import, the only one that gives src/vehicle text, goes.
import { TYRE_NAMES } from '../data/vehicle-names.ts';

export { AIR_DENSITY, G };

export type TyreId = 'classic' | 'street' | 'semi' | 'slick';

export interface TyreSpec {
  id: TyreId;
  /** @deprecated Until stage O2a; pages translate the id with TYRE_NAMES (src/data/vehicle-names.ts). */
  name: string;
  /** Peak friction, the same along and across, independent of load. */
  mu: number;
}

/**
 * Peak friction. Street: summer UHP tyres 1.0-1.15, a Corvette E-Ray on the skidpad 1.01 g. Semi-slicks: Cup 2-type
 * tyres 1.15-1.3, a 991 GT3 RS on Michelin Cup tyres 1.24 g. Slicks without downforce: 1.4-1.8. Classic: the tyres
 * of a 1980s car, which the oil page does not offer; 0.8 is an estimate. Sources and status in docs/vehicle-model.md.
 */
export const TYRES: Record<TyreId, TyreSpec> = {
  classic: { id: 'classic', name: TYRE_NAMES.classic, mu: 0.8 },
  street: { id: 'street', name: TYRE_NAMES.street, mu: 1.0 },
  semi: { id: 'semi', name: TYRE_NAMES.semi, mu: 1.25 },
  slick: { id: 'slick', name: TYRE_NAMES.slick, mu: 1.6 },
};

/** The tyres the oil page offers. */
export const TYRE_IDS: readonly TyreId[] = ['street', 'semi', 'slick'];

export interface EngineMount {
  axis: 'longitudinal' | 'transverse';
  /** Where the engine's front (the timing end, +Z of the engine frame) points in the car. */
  front: 'forward' | 'rearward' | 'left' | 'right';
  /** Where the engine sits along the car. */
  position: 'front' | 'mid' | 'rear';
}

export interface VehicleSpec {
  name: string;
  /** With the driver: roadLoad.massKg is the same number. */
  massKg: number;
  /** Rolling resistance and drag: the one road load of the site (road-load.ts), derived from the car's record. */
  roadLoad: RoadLoadCoeffs;
  /** Downforce area Cl·A, m², positive pushes down. */
  clA: number;
  drive: 'fwd' | 'rwd' | 'awd';
  /** Share of weight on the driven wheels at rest: the traction limit when no chassis data is given. */
  drivenShare: number;
  tyreRadiusM: number;
  mount: EngineMount;
  /** Optional chassis data for a model with weight transfer (the whole-car section). The point-mass lap ignores it. */
  cgHeightM?: number;
  wheelbaseM?: number;
  trackM?: number;
  /** Share of weight on the front axle at rest. */
  frontShare?: number;
}

/** Rolling and aerodynamic drag at a speed on the level, newtons: roadLoadN with the car's coefficients. */
export const dragForce = (car: Pick<VehicleSpec, 'roadLoad'>, v: number): number => roadLoadN(car.roadLoad, v, 0);
