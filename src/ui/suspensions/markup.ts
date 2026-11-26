// What the suspension page puts into the shell's slots: the corner's name; the scene switch, the travel slider and the
// switches under the stage; the bump scene's dash (its event, strip chart and numbers); and the panel with the
// scene's controls, the setup and the article.

import { t } from '../../i18n/t.ts';
import { BUMP_SPEED_KMH, OBSTACLE_IDS, WHEEL_IDS, type ObstacleId, type WheelId } from '../../suspension/bump.ts';
import { articleHtml } from './article.ts';
import { SCENES, sceneLabel } from './scenes.ts';
import { setupPanelHtml } from './setup-panel.ts';
import { stripLegendHtml } from './strip-chart.ts';

export const titleHtml = (): string => `
    <h1 id="susp-title">${t('Стійка Макферсон')}</h1>
    <p id="susp-sub">${t('Передня підвіска компактного передньопривідного авто')}</p>
  `;

/** The scene switch, the travel slider (the travel scene's), the explode and the overlays. Travel in mm. */
export const toolsHtml = (minMm: number, maxMm: number): string => `<div class="tool susp-scene-tool">
      <span class="tool-label">${t('Сцена')}</span>
      <div class="segmented" role="group" aria-label="${t('Сцена')}" id="susp-scene">
        ${SCENES.map((s) => `<button type="button" data-v="${s}" aria-pressed="false">${sceneLabel(s)}</button>`).join('')}
      </div>
    </div>
    <label class="tool susp-travel-tool susp-only-travel">
      <span class="tool-label">${t('Хід колеса')}: <output id="susp-travel-value" for="susp-travel">0</output></span>
      <input type="range" id="susp-travel" min="${minMm}" max="${maxMm}" step="1" value="0" />
    </label>
    <label class="tool susp-explode-tool susp-only-travel">
      <span class="tool-label">${t('Розібрати')}</span>
      <input type="range" id="susp-explode" min="0" max="1" step="0.01" value="0" />
    </label>
    <div class="susp-checks">
      <label class="check"><input type="checkbox" id="susp-forces" checked /> ${t('Сили')}</label>
      <label class="check"><input type="checkbox" id="susp-laser" checked /> ${t('Лазери')}</label>
    </div>
  `;

/** The bump scene's dash: drive again or pause, the strip chart, the numbers of the last run. */
export const dashHtml = (): string => `<footer class="susp-dash" id="susp-dash" hidden>
      <section class="susp-dash-event">
        <button type="button" class="btn primary" id="susp-go">${t('Наїхати')}</button>
        <button type="button" class="btn" id="susp-pause" aria-pressed="false">${t('Пауза')}</button>
        <p class="susp-dash-what" id="susp-what"></p>
      </section>
      <section class="susp-dash-chart">
        ${stripLegendHtml()}
        <canvas id="susp-strip" aria-label="${t('Стрічка за останні 2 с: дорога, центр колеса, кузов і сила в плямі контакту')}" role="img"></canvas>
      </section>
      <section class="susp-dash-numbers">
        <dl class="susp-numbers" id="susp-numbers"></dl>
      </section>
      <p class="visually-hidden" id="susp-live" aria-live="polite"></p>
    </footer>`;

export const obstacleLabel = (id: ObstacleId): string =>
  ({
    bump: t('Горб 50 мм'),
    hump: t('Лежачий поліцейський'),
    pothole: t('Яма'),
    kerb: t('Бордюр 100 мм'),
    'kerb-hard': t('Бордюр 120 мм'),
  })[id];

/** What the obstacle is, for the line under the buttons. */
export const obstacleSize = (id: ObstacleId): string =>
  ({
    bump: t('горб 50 мм × 0,5 м'),
    hump: t('лежачий поліцейський 70 мм × 1 м'),
    pothole: t('яма 60 мм × 0,4 м'),
    kerb: t('край бордюру 100 мм'),
    'kerb-hard': t('край бордюру 120 мм'),
  })[id];

const wheelLabel = (id: WheelId): string => ({ steel: t('Сталеві'), cast: t('Литі'), forged: t('Ковані') })[id];

const row = (id: string, label: string): string => `<dt>${label}</dt><dd id="${id}"></dd>`;

export const panelHtml = (): string => `<div class="panel-scroll susp-panel" id="susp-panel" tabindex="0">
      <section class="susp-bump-controls susp-only-bump">
        <h3>${t('Перешкода')}</h3>
        <div class="segmented susp-obstacle" role="group" aria-label="${t('Перешкода')}" id="susp-obstacle">
          ${OBSTACLE_IDS.filter((o) => o !== 'kerb-hard').map((o) => `<button type="button" data-v="${o}" aria-pressed="false">${obstacleLabel(o)}</button>`).join('')}
        </div>
        <label class="susp-ctl">
          <span class="susp-ctl-head"><span>${t('Швидкість')}</span><output id="susp-speed-value" for="susp-speed"></output></span>
          <input type="range" id="susp-speed" min="${BUMP_SPEED_KMH[0]}" max="${BUMP_SPEED_KMH[1]}" step="1" />
        </label>
        <div class="susp-ctl">
          <span class="susp-ctl-head"><span>${t('Колеса')}</span></span>
          <div class="segmented" role="group" aria-label="${t('Колеса')}" id="susp-wheel">
            ${WHEEL_IDS.map((w) => `<button type="button" data-v="${w}" aria-pressed="false">${wheelLabel(w)}</button>`).join('')}
          </div>
        </div>
        <button type="button" class="btn" id="susp-punch">${t('Пробити: бордюр 120 мм на 40 км/год')}</button>
        <p class="susp-caption" id="susp-caption"></p>
      </section>
      <section class="susp-only-travel">
        <p>${t('Рухай повзунок «Хід колеса»: колесо пройде від повного відбою до стиснутого відбійника, а цифри нижче покажуть, як при цьому змінюються розвал, сходження й пружина.')}</p>
        <h3>${t('На цьому ході')}</h3>
        <dl class="susp-readout">
          ${row('susp-r-travel', t('Хід колеса'))}
          ${row('susp-r-camber', t('Розвал'))}
          ${row('susp-r-toe', t('Сходження'))}
          ${row('susp-r-spring-len', t('Довжина пружини'))}
          ${row('susp-r-spring', t('Зусилля пружини'))}
        </dl>
        <p class="susp-note">${t('Хід рахується від проєктної висоти кузова, плюс — колесо вгору. Розвал від’ємний, коли верх колеса нахилений до кузова; сходження додатне, коли перед колеса повернутий до середини авто.')}</p>
      </section>
      ${setupPanelHtml()}
      ${articleHtml()}
      <p class="susp-note">${t('«Рентген» робить шину, диск і корпус амортизатора скляними, «Механізм» лишає самі ланки й шарніри. Клацни будь-яку деталь, щоб дізнатися, що вона робить.')}</p>
    </div>
  `;
