import { t } from '../i18n/t.ts';

export type FuelId = 'ai92' | 'ai95' | 'ai98' | 'race' | 'e85' | 'methanol' | 'diesel';

export interface FuelData {
  name: string;
  /** Mass of air per mass of fuel for complete combustion. */
  afr: number;
  /** Lower heating value, MJ/kg. */
  lhv: number;
  /** kg/L */
  density: number;
  /** Knock resistance for the ignition-delay correlation. Zero for compression ignition. */
  octane: number;
  /** Cooling of the charge by evaporating fuel, K. */
  chargeCooling: number;
  /** Compression-ignition fuel. */
  diesel: boolean;
}

// Stoichiometry, heating value and density follow published fuel tables. Methanol's and E85's octane
// are effective values, because standard octane tests don't describe neat oxygenates well.
export const FUELS: Record<FuelId, FuelData> = {
  ai92: { name: t('Бензин А-92'), afr: 14.7, lhv: 43, density: 0.74, octane: 92, chargeCooling: 6, diesel: false },
  ai95: { name: t('Бензин А-95'), afr: 14.7, lhv: 43, density: 0.75, octane: 95, chargeCooling: 6, diesel: false },
  ai98: { name: t('Бензин А-98'), afr: 14.7, lhv: 43, density: 0.75, octane: 98, chargeCooling: 6, diesel: false },
  race: { name: t('Гоночний бензин'), afr: 14.5, lhv: 43, density: 0.72, octane: 104, chargeCooling: 6, diesel: false },
  e85: { name: t('Етанол E85'), afr: 9.8, lhv: 29, density: 0.78, octane: 108, chargeCooling: 22, diesel: false },
  methanol: { name: t('Метанол'), afr: 6.4, lhv: 20, density: 0.79, octane: 112, chargeCooling: 45, diesel: false },
  diesel: { name: t('Дизель'), afr: 14.5, lhv: 42.7, density: 0.84, octane: 0, chargeCooling: 0, diesel: true },
};

/**
 * Heat released per unit of stoichiometric fuel energy, as a function of lambda.
 * Rich of stoichiometric the air limits burning, with best power near lambda 0.88.
 */
export function heatReleaseFactor(lambda: number, diesel: boolean): number {
  if (diesel) return 0.98 / Math.max(lambda, 1);
  const table: Array<[number, number]> = [
    [0.6, 0.8],
    [0.7, 0.9],
    [0.8, 0.97],
    [0.88, 1],
    [1, 0.96],
    [1.1, 0.875],
    [1.2, 0.8],
    [1.4, 0.68],
    [1.6, 0.56],
  ];
  if (lambda <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (lambda <= x1) return y0 + ((lambda - x0) / (x1 - x0)) * (y1 - y0);
  }
  return table[table.length - 1]![1];
}
