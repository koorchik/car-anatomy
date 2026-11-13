// The layers' names and colours: all the switches and the readout need before the layers themselves are loaded.

export type LayerId = 'oil' | 'coolant' | 'fuel' | 'air';
export const LAYER_IDS: LayerId[] = ['oil', 'coolant', 'fuel', 'air'];

export const LAYER_STYLES: Record<LayerId, { color: string; hotColor: string; period: number }> = {
  oil: { color: '#e8a93a', hotColor: '#ffd27a', period: 0.3 },
  coolant: { color: '#3fa9f5', hotColor: '#ff5a3c', period: 0.42 },
  fuel: { color: '#e0559b', hotColor: '#ffd0e8', period: 0.3 },
  air: { color: '#62c6ec', hotColor: '#f0a060', period: 0.6 },
};
