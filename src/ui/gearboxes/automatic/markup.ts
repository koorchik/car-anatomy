// What the automatic's page puts into the shell's slots. Ids carry the gba- prefix, apart from the dash widgets'
// (#ignition, #pedal), which every page's dash has and which the widgets look up inside their own column. Classes of
// the manual pages (gbx-…) are shared where the piece looks the same.

import { t } from '../../../i18n/t.ts';
import { elementColor } from '../../../scene/gearbox/element-colors.ts';
import { ignitionHtml } from '../../widgets/ignition.ts';
import { pedalHtml } from '../../widgets/pedal.ts';
import { SLOW_RPM_DEFAULT, SVG_SOUND_ON } from '../markup.ts';

export const titleHtml = (): string => `<div class="gbx-title" id="gba-title-block">
    <h1 id="gba-title"></h1>
    <p class="gbx-sub" id="gba-sub"></p>
    <p class="gbx-mode"><b>${t('На столі')}</b> <span>${t('двигун крутить вхідний вал, вихід вільний')}</span></p>
    <div class="gbx-title-row">
      <button class="btn" id="gba-levers-toggle" type="button" aria-controls="results-panel">${t('Номограма')}</button>
      <button class="btn" id="gba-demo-open" type="button">${t('Демонстрація')}<span class="gbx-long">: ${t('матриця 8HP')}</span></button>
      <button class="btn" id="gba-lab-open" type="button">${t('Лабораторія')}<span class="gbx-long">: ${t('гідротрансформатор')}</span></button>
    </div>
  </div>`;

export const toolsHtml = (): string => `<label class="tool tool-slow" id="gba-slow-tool" hidden>
      <span class="tool-label">${t('Оберти: {value} об/хв', { value: `<span id="gba-slow-value">${SLOW_RPM_DEFAULT}</span>` })}</span>
      <input type="range" id="gba-slow-rpm" min="10" max="300" step="5" value="${SLOW_RPM_DEFAULT}" />
    </label>
    <label class="tool tool-explode" id="gba-explode-tool">
      <span class="tool-label">${t('Розібрати')}</span>
      <input type="range" id="gba-explode" min="0" max="1" step="0.01" value="0" />
    </label>
    <label class="check" id="gba-glow-tool">
      <input type="checkbox" id="gba-glow" checked />
      ${t('Шлях потужності')}
    </label>`;

export const statusHtml = (): string => `<section class="gbx-demo" id="gba-demo" role="region" aria-live="polite" aria-label="${t('Демонстрація')}" hidden>
    <header><span id="gba-demo-count"></span><button class="btn" id="gba-demo-close" type="button">${t('Закрити')}</button></header>
    <h3 id="gba-demo-title"></h3>
    <p id="gba-demo-text"></p>
    <footer>
      <button class="btn" id="gba-demo-prev" type="button">${t('Назад')}</button>
      <button class="btn" id="gba-demo-next" type="button">${t('Далі')}</button>
    </footer>
  </section>`;

/** The torque converter's lab (demonstration 9): steps, readouts, a chart; converter-lab-ui.ts fills it. */
export const labHtml = (): string => `<section class="gbx-demo gba-lab" id="gba-lab" role="region" aria-live="polite" aria-label="${t('Лабораторія')}" hidden>
    <header><span id="gba-lab-count"></span><button class="btn" id="gba-lab-close" type="button">${t('Закрити')}</button></header>
    <h3 id="gba-lab-title"></h3>
    <p id="gba-lab-text"></p>
    <div class="gba-lab-chart" id="gba-lab-chart"></div>
    <dl class="gba-lab-figures">
      <div><dt>${t('Двигун і насос')}</dt><dd id="gba-lab-engine"></dd></div>
      <div><dt>${t('Турбінне колесо')}</dt><dd id="gba-lab-turbine"></dd></div>
      <div><dt>${t('Відношення')}</dt><dd id="gba-lab-ratio"></dd></div>
      <div><dt>${t('Реактор')}</dt><dd id="gba-lab-stator"></dd></div>
      <div><dt>${t('Ковзання')}</dt><dd id="gba-lab-slip"></dd></div>
      <div><dt>${t('Автомобіль')}</dt><dd><span id="gba-lab-speed"></span> · <span id="gba-lab-controls"></span></dd></div>
    </dl>
    <p class="gba-lab-legend"><i class="pump"></i>${t('насос')} <i class="turbine"></i>${t('турбіна')} <i class="stator"></i>${t('реактор')} <i class="flow"></i>${t('потік оливи')}</p>
    <footer>
      <button class="btn" id="gba-lab-prev" type="button">${t('Назад')}</button>
      <button class="btn" id="gba-lab-again" type="button">${t('Ще раз')}</button>
      <button class="btn" id="gba-lab-next" type="button">${t('Далі')}</button>
    </footer>
  </section>`;

export const panelHtml = (): string => `<div class="panel-scroll gbx-article" id="gba-article" tabindex="0"></div>`;

export const resultsHtml = (): string => `<div class="panel-scroll gba-levers" id="gba-levers" tabindex="0">
    <p class="gba-state" id="gba-state"></p>
    <div class="gba-nomogram" id="gba-nomogram"></div>
    <p class="note small">${t('Номограма важелів: кожен ряд — важіль із сонячною (S), водилом (C) і коронною (R) на відстанях, пропорційних зубцям. Висота точки — швидкість відносно входу, тож три точки ряду завжди на одній прямій. Однаковий колір — одна деталь, як у моделі.')}</p>
    <h3>${t('Матриця перемикань')}</h3>
    <table class="gba-matrix" id="gba-matrix"></table>
  </div>`;

export const dashHtml = (elements: readonly string[]): string => `<section class="control-col gbx-control" id="gba-control">
      ${ignitionHtml()}
      <div class="volume-row">
        <button class="btn icon-btn" id="gba-mute" type="button" aria-label="${t('Вимкнути звук')}" aria-pressed="false">${SVG_SOUND_ON}</button>
        <input type="range" id="gba-volume" min="0" max="1" step="0.01" value="0.8" aria-label="${t('Гучність')}" />
      </div>
    </section>
    <section class="tacho-wrap gbx-tacho" id="gba-tacho"></section>
    <section class="pedal-col gbx-pedal" id="gba-pedal-col">${pedalHtml()}</section>
    <section class="gbx-gears-col gba-gears-col">
      <h4>${t('Передача')} <span id="gba-gear-text"></span></h4>
      <div class="gba-gears" role="group" aria-label="${t('Передача')}" id="gba-gears"></div>
      <div class="gba-elements" role="group" aria-label="${t('Муфти й гальма')}" id="gba-elements">
        ${elements.map((id, i) => `<button type="button" data-element="${id}" aria-pressed="false" style="--el:${elementColor(id, i)}">${id}</button>`).join('')}
      </div>
      <dl class="gbx-shafts">
        <div><dt>${t('Вхідний вал')}</dt><dd id="gba-input-rpm"></dd></div>
        <div><dt>${t('Вихідний вал')}</dt><dd id="gba-output-rpm"></dd></div>
      </dl>
      <p class="gbx-gear-note" id="gba-note"></p>
    </section>`;
