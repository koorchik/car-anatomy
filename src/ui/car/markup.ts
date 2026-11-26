// What the car overview puts into the shell's slots at stage C1a: the car's name and the line under it. The chips, the
// article and the cards of the systems come with stage C1b.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { CarRecord } from '../../vehicle/car.ts';

const DRIVE: Record<CarRecord['drive'], () => string> = {
  fwd: () => t('Передній привід'),
  rwd: () => t('Задній привід'),
  awd: () => t('Повний привід'),
};

const LAYOUT: Record<CarRecord['mount']['position'], Record<CarRecord['mount']['axis'], () => string>> = {
  front: { transverse: () => t('двигун поперек спереду'), longitudinal: () => t('двигун уздовж спереду') },
  mid: { transverse: () => t('двигун поперек посередині'), longitudinal: () => t('двигун уздовж посередині') },
  rear: { transverse: () => t('двигун поперек ззаду'), longitudinal: () => t('двигун уздовж ззаду') },
};

/** The drive, where the engine stands and the mass, from the record, joined by middle dots. */
export function summaryLine(car: CarRecord): string {
  const mass = t('{value} кг', { value: car.massKg.toLocaleString(numberLocale) });
  return [DRIVE[car.drive](), LAYOUT[car.mount.position][car.mount.axis](), mass].join(' · ');
}

export const titleHtml = (): string => `
    <h1 id="car-title"></h1>
    <p id="car-sub"></p>
  `;
