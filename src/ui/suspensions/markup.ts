// What the suspension page puts into the shell's slots: the corner's name, the travel slider and the switches under
// the stage, and the panel with what the corner does at this travel.

import { t } from '../../i18n/t.ts';

export const titleHtml = (): string => `
    <h1 id="susp-title">${t('Стійка Макферсон')}</h1>
    <p id="susp-sub">${t('Передня підвіска компактного передньопривідного авто')}</p>
  `;

/** The travel slider runs over the corner's whole travel, mm. */
export const toolsHtml = (minMm: number, maxMm: number): string => `<label class="tool susp-travel-tool">
      <span class="tool-label">${t('Хід колеса')}: <output id="susp-travel-value" for="susp-travel">0</output></span>
      <input type="range" id="susp-travel" min="${minMm}" max="${maxMm}" step="1" value="0" />
    </label>
    <label class="tool susp-explode-tool">
      <span class="tool-label">${t('Розібрати')}</span>
      <input type="range" id="susp-explode" min="0" max="1" step="0.01" value="0" />
    </label>
    <div class="susp-checks">
      <label class="check"><input type="checkbox" id="susp-forces" checked /> ${t('Сили')}</label>
      <label class="check"><input type="checkbox" id="susp-laser" checked /> ${t('Лазер розвалу')}</label>
    </div>
  `;

const row = (id: string, label: string): string => `<dt>${label}</dt><dd id="${id}"></dd>`;

export const panelHtml = (): string => `<div class="panel-scroll susp-panel" id="susp-panel" tabindex="0">
      <p>${t('У стійці Макферсон амортизатор жорстко затиснутий у поворотному кулаці й сам працює верхньою ланкою, а низ кулака тримає один поперечний важіль. Рухай повзунок «Хід колеса»: колесо пройде від повного відбою до стиснутого відбійника, а цифри нижче покажуть, як при цьому змінюються розвал, сходження й пружина.')}</p>
      <p>${t('«Рентген» робить шину, диск і корпус амортизатора скляними, «Механізм» лишає самі ланки й шарніри. Клацни будь-яку деталь, щоб дізнатися, що вона робить.')}</p>
      <h3>${t('На цьому ході')}</h3>
      <dl class="susp-readout">
        ${row('susp-r-travel', t('Хід колеса'))}
        ${row('susp-r-camber', t('Розвал'))}
        ${row('susp-r-toe', t('Сходження'))}
        ${row('susp-r-spring-len', t('Довжина пружини'))}
        ${row('susp-r-spring', t('Зусилля пружини'))}
      </dl>
      <p class="susp-note">${t('Хід рахується від проєктної висоти кузова, плюс — колесо вгору. Розвал від’ємний, коли верх колеса нахилений до кузова; сходження додатне, коли перед колеса повернутий до середини авто.')}</p>
      <h3>${t('Звідки цифри')}</h3>
      <p class="susp-note">${t('Точки кріплення стійки, важеля й рульової тяги виміряні на справжньому компактному передньопривідному авто: JTEKT Engineering Journal 1019E (2023), таблиця 1. Модель авто стаття не називає. Висота центра колеса, межі ходу, пружина, відбійник і піввісь типові: їх у статті немає.')}</p>
    </div>
  `;
