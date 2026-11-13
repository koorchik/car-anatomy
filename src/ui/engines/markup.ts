// What the engine pages put into the shell's slots. Each piece carries the whitespace up to the next element of the
// skeleton, so that the page's DOM stays exactly what it was before the shell (the snapshots compare it).

import { ENGINES, pageChoices } from '../../data/engines.ts';
import { t } from '../../i18n/t.ts';
import { legendHtml } from '../firing-diagram.ts';
import { ignitionHtml } from '../widgets/ignition.ts';
import { pedalHtml } from '../widgets/pedal.ts';
import { DEFAULT_ENGINE } from './routes.ts';

const ENGINE_COUNT = ENGINES.reduce((count, page) => count + pageChoices(page.id).length, 0);
export const SLOW_RPM_DEFAULT = 40;

export const SVG_SOUND_ON =
  '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6c1.5 1.6 1.5 4.4 0 6M14.2 3.8c2.8 3 2.8 7.4 0 10.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
export const SVG_SOUND_OFF =
  '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6.5l4 5M16 6.5l-4 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

export const badgeHtml = (): string => '<div class="badge" id="badge" aria-hidden="true"></div>';

export const actionsHtml = (): string => `<button class="btn btn-catalogue" id="open-table" type="button">${t('Усі двигуни')}<span class="btn-count">: ${ENGINE_COUNT}</span></button>
    `;

export const titleHtml = (): string => `
    <h1 id="engine-title"></h1>
    <p id="engine-sub"></p>
    <div class="engine-nav">
      <button class="btn" id="prev" type="button" aria-label="${t('Попередній двигун')}">${t('Попередній')}</button>
      <button class="btn" id="next" type="button" aria-label="${t('Наступний двигун')}">${t('Наступний')}</button>
      <a class="btn" id="to-designer" href="#/designer">${t('Змінити в конструкторі')}</a>
      <a class="btn" id="to-catalog" href="#/engines/${DEFAULT_ENGINE}" hidden>${t('До каталогу')}</a>
    </div>
    <nav class="variant-list" id="variants" aria-label="${t('Двигуни цієї компоновки')}" hidden></nav>
  `;

export const toolsHtml = (): string => `<div class="tool tool-systems" id="systems-tool"></div>
    <label class="tool tool-slow" id="slow-tool" hidden>
      <span class="tool-label">${t('Оберти: {value} об/хв', { value: `<span id="slow-value">${SLOW_RPM_DEFAULT}</span>` })}</span>
      <input type="range" id="slow-rpm" min="10" max="300" step="5" value="${SLOW_RPM_DEFAULT}" />
    </label>
    <label class="tool tool-explode">
      <span class="tool-label">${t('Розібрати')}</span>
      <input type="range" id="explode" min="0" max="1" step="0.01" value="0" />
    </label>
    <label class="check tool-shake">
      <input type="checkbox" id="shake" />
      ${t('Перебільшити вібрації')}
    </label>
  `;

export const statusHtml = (): string => `<div class="wreck" id="wreck" role="status" hidden></div>
  <div class="strain" id="strain" role="status" hidden></div>
  <div class="systems-readout" id="systems-readout" hidden></div>
  `;

export const panelHtml = (): string => `<div class="panel-scroll" id="article" tabindex="0"></div>
    <div class="panel-scroll" id="designer-host" tabindex="0" hidden></div>
    <div class="panel-scroll" id="sump-host" tabindex="0" hidden></div>
  `;

export const resultsHtml = (): string => `<div class="panel-scroll" id="results-host" tabindex="0"></div>
  `;

export const dashHtml = (): string => `
    <section class="control-col">
      ${ignitionHtml()}
      <div class="health" id="health" role="meter" aria-label="${t('Стан двигуна')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" hidden>
        <span>${t('Стан')}</span><i><u id="health-bar"></u></i><b id="health-value">100%</b>
      </div>
      <div class="volume-row">
        <button class="btn icon-btn" id="mute" type="button" aria-label="${t('Вимкнути звук')}" aria-pressed="false">${SVG_SOUND_ON}</button>
        <input type="range" id="volume" min="0" max="1" step="0.01" value="0.8" aria-label="${t('Гучність')}" />
      </div>
      <div class="listen-select" role="group" aria-label="${t('Звідки слухати')}" id="listen">
        <button type="button" data-v="exhaust" aria-pressed="true">${t('Біля вихлопу')}</button>
        <button type="button" data-v="bay" aria-pressed="false">${t('Під капотом')}</button>
        <button type="button" data-v="cabin" aria-pressed="false">${t('У салоні')}</button>
      </div>
    </section>
    <section class="tacho-wrap" id="tacho-wrap"></section>
    <section class="pedal-col">${pedalHtml()}</section>
    <section class="chart-col firing-col">
      <h4>${t('Цикл у порядку спалахів')} <span id="firing-text"></span></h4>
      <div class="chart-body" id="firing-body"></div>
      <div class="legend">${legendHtml()}</div>
    </section>
    <section class="chart-col spectrum-col">
      <h4>${t('Спектр звуку')} <span id="spectrum-text"></span></h4>
      <div class="chart-body" id="spectrum-body"></div>
    </section>
  `;

export const afterDashHtml = (): string => `<footer class="sump-dash" id="sump-dash" hidden></footer>
  <div class="sump-summary" id="sump-summary" hidden></div>

  `;

export const tableHeadHtml = (): string => `<div>
        <h2>${t('Усі двигуни')}</h2>
        <p>${t('Кожна компоновка зі своїми реальними двигунами. На значках видно напрям циліндрів, якщо дивитись на двигун спереду.')}</p>
        <p><a class="sibling" href="#/sump">${t('Олива на треку: як картер тримає оливу в поворотах')}</a></p>
      </div>
      `;
