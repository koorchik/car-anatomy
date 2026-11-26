// What the car overview puts into the shell's slots: the car's name, the line under it, the cars of the overview, the
// button "All cars" and the chips of the systems; the card of the system in focus over the stage; and the panel with
// the article "About this car".

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

export const titleHtml = (): string => `<div class="car-title">
    <h1 id="car-title"></h1>
    <p id="car-sub"></p>
    <div class="car-nav">
      <nav class="car-list" id="car-list" aria-label="${t('Авто огляду')}"></nav>
      <button class="btn" id="car-all" type="button"></button>
    </div>
    <div class="car-chips" id="car-chips" role="group" aria-label="${t('Системи авто')}"></div>
  </div>`;

/** The card of the system in focus, over the stage on the right (a sheet at the bottom on a phone). */
export const focusCardHtml = (): string => `<section class="car-focus" id="car-focus" hidden aria-labelledby="car-focus-name">
    <h2 id="car-focus-name"></h2>
    <p class="car-focus-kind" id="car-focus-kind"></p>
    <p class="car-focus-text" id="car-focus-text"></p>
    <dl class="car-figures" id="car-focus-rows"></dl>
    <p class="car-note" id="car-focus-note"></p>
    <div class="car-focus-actions">
      <a class="btn primary" id="car-focus-open" href="#/">${t('Відкрити розділ')}</a>
      <button class="btn" id="car-focus-back" type="button">${t('Назад до авто')} <kbd>Esc</kbd></button>
    </div>
    <p class="car-note" id="car-focus-where"></p>
  </section>`;

export const panelHtml = (): string => `<div class="panel-scroll car-panel" id="car-panel" tabindex="0">
    <div id="car-article"></div>
  </div>`;
