// The layers' names and colours: all the switches and the readout need before the layers themselves are loaded.

import { FLUID } from '../palette.ts';

export type LayerId = 'oil' | 'coolant' | 'fuel' | 'air';
export const LAYER_IDS: LayerId[] = ['oil', 'coolant', 'fuel', 'air'];

export const LAYER_STYLES: Record<LayerId, { color: string; hotColor: string; period: number }> = {
  oil: { color: FLUID.oil, hotColor: FLUID.oilHot, period: 0.3 },
  coolant: { color: FLUID.coolantCold, hotColor: FLUID.coolantHot, period: 0.42 },
  fuel: { color: FLUID.fuel, hotColor: FLUID.fuelHot, period: 0.3 },
  air: { color: FLUID.air, hotColor: FLUID.airHot, period: 0.6 },
};
