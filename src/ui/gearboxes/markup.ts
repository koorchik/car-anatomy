// What the gearbox pages put into the shell's slots. Ids carry the gbx- prefix, apart from the dash widgets'
// (#ignition, #pedal), which every page's dash has and which the widgets look up inside their own column.

import { t } from '../../i18n/t.ts';
import { ignitionHtml } from '../widgets/ignition.ts';
import { pedalHtml } from '../widgets/pedal.ts';
import { wheelRoadHtml } from './wheel-road.ts';

export const SLOW_RPM_DEFAULT = 60;

export const SVG_SOUND_ON =
  '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6c1.5 1.6 1.5 4.4 0 6M14.2 3.8c2.8 3 2.8 7.4 0 10.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
export const SVG_SOUND_OFF =
  '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6.5l4 5M16 6.5l-4 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

export const titleHtml = (): string => `<div class="gbx-title" id="gbx-title-block">
    <h1 id="gbx-title"></h1>
    <p class="gbx-sub" id="gbx-sub"></p>
    <div class="gbx-mode-row">
      <div class="segmented gbx-modes" role="group" aria-label="${t('Режим')}" id="gbx-modes">
        <button type="button" data-mode="table" aria-pressed="true">${t('На столі')}</button>
        <button type="button" data-mode="drive" aria-pressed="false">${t('В авто')}</button>
      </div>
      <p class="gbx-mode" id="gbx-mode-text">${t('двигун крутить первинний вал, вихід вільний')}</p>
    </div>
    <div class="gbx-title-row">
      <button class="btn" id="gbx-setup-toggle" type="button" aria-controls="results-panel">${t('Налаштувати')}</button>
      <button class="btn" id="gbx-demo-open" type="button">${t('Демонстрація')}<span class="gbx-long">: ${t('чому шестерні крутяться завжди')}</span></button>
      <span class="gbx-steps" id="gbx-steps"></span>
    </div>
    <div class="gbx-nav" id="gbx-nav"></div>
  </div>`;

export const toolsHtml = (): string => `<label class="tool tool-slow" id="gbx-slow-tool" hidden>
      <span class="tool-label">${t('Оберти: {value} об/хв', { value: `<span id="gbx-slow-value">${SLOW_RPM_DEFAULT}</span>` })}</span>
      <input type="range" id="gbx-slow-rpm" min="10" max="300" step="5" value="${SLOW_RPM_DEFAULT}" />
    </label>
    <label class="tool tool-explode" id="gbx-explode-tool">
      <span class="tool-label">${t('Розібрати')}</span>
      <input type="range" id="gbx-explode" min="0" max="1" step="0.01" value="0" />
    </label>
    <label class="check" id="gbx-glow-tool">
      <input type="checkbox" id="gbx-glow" checked />
      ${t('Шлях потужності')}
    </label>`;

export const statusHtml = (): string => `${wheelRoadHtml()}
  <section class="gbx-demo" id="gbx-demo" role="region" aria-live="polite" aria-label="${t('Демонстрація')}" hidden>
    <header><span id="gbx-demo-count"></span><button class="btn" id="gbx-demo-close" type="button">${t('Закрити')}</button></header>
    <h3 id="gbx-demo-title"></h3>
    <p id="gbx-demo-text"></p>
    <footer>
      <button class="btn" id="gbx-demo-prev" type="button">${t('Назад')}</button>
      <button class="btn" id="gbx-demo-next" type="button">${t('Далі')}</button>
    </footer>
  </section>`;

export const panelHtml = (): string => `<div class="panel-scroll gbx-article" id="gbx-article" tabindex="0"></div>`;

export const resultsHtml = (): string => `<div class="panel-scroll gbx-setup" id="gbx-setup" tabindex="0"></div>`;

export const dashHtml = (): string => `<section class="control-col gbx-control" id="gbx-control">
      ${ignitionHtml()}
      <div class="volume-row">
        <button class="btn icon-btn" id="gbx-mute" type="button" aria-label="${t('Вимкнути звук')}" aria-pressed="false">${SVG_SOUND_ON}</button>
        <input type="range" id="gbx-volume" min="0" max="1" step="0.01" value="0.8" aria-label="${t('Гучність')}" />
      </div>
    </section>
    <section class="tacho-wrap gbx-tacho" id="gbx-tacho"></section>
    <section class="gbx-speedo" id="gbx-speedo" hidden>
      <p class="gbx-kmh"><b id="gbx-kmh">0</b> <span>${t('км/год')}</span></p>
      <p class="gbx-gear-now" aria-live="polite"><span>${t('Передача')}</span> <b id="gbx-gear-now">N</b></p>
    </section>
    <section class="pedal-col gbx-pedal" id="gbx-pedal-col">${pedalHtml()}
      <div class="pedal gbx-brake" id="gbx-brake" role="slider" tabindex="0" aria-label="${t('Педаль гальма')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden>
        <div class="pedal-fill" id="gbx-brake-fill"></div>
        <div class="pedal-text">${t('Гальма')}<small>B</small></div>
      </div>
    </section>
    <section class="gbx-gears-col">
      <h4>${t('Передача')} <span id="gbx-gear-text"></span></h4>
      <div class="gbx-gears" role="group" aria-label="${t('Передача')}" id="gbx-gears"></div>
      <dl class="gbx-shafts" id="gbx-table-figures">
        <div><dt>${t('Первинний вал')}</dt><dd id="gbx-input-rpm"></dd></div>
        <div><dt>${t('Вторинний вал')}</dt><dd id="gbx-output-rpm"></dd></div>
        <div id="gbx-diff-row" hidden><dt>${t('Диференціал')}</dt><dd id="gbx-diff-rpm"></dd></div>
      </dl>
      <dl class="gbx-shafts" id="gbx-car-figures" hidden>
        <div><dt>${t('Швидкість')}</dt><dd id="gbx-car-speed"></dd></div>
        <div><dt>${t('Зчеплення')}</dt><dd id="gbx-car-clutch"></dd></div>
      </dl>
      <p class="gbx-gear-note" id="gbx-gear-note"></p>
    </section>`;
