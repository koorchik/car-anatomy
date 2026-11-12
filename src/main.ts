import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans-extra-condensed/600.css';
import '@fontsource/fira-sans-extra-condensed/700.css';
import '@fontsource/fira-sans-extra-condensed/800.css';
import './style.css';
import { ENGINES, engineById, pageChoices } from './data/engines.ts';
import { Drive } from './audio/drive.ts';
import type { ListenPosition } from './audio/synth.ts';
import { buildEngine, type Engine } from './engine/kinematics.ts';
import { ASPIRATION_NAMES } from './engine/spec.ts';
import type { EngineModel, ViewMode } from './scene/model-types.ts';
import { PistonEngineModel } from './scene/piston-engine.ts';
import { RotaryEngineModel } from './scene/rotary-engine.ts';
import { Stage } from './scene/stage.ts';
import { articleHtml } from './ui/article.ts';
import { DesignerPage } from './ui/designer/designer-page.ts';
import { DynoPanel } from './ui/dyno/dyno-panel.ts';
import { FiringDiagram, legendHtml } from './ui/firing-diagram.ts';
import { Spectrum } from './ui/spectrum.ts';
import { tableHtml } from './ui/table.ts';
import { LANGUAGE_GROUP_LABEL, LANGUAGE_LABELS, locale, switchLocale, type Locale } from './i18n/locale.ts';
import { t } from './i18n/t.ts';
import { Tacho } from './ui/tacho.ts';

type SpeedMode = 'slow' | 'readable' | 'real';

const DEFAULT_ENGINE = 'v8-cross';
const ENGINE_COUNT = ENGINES.reduce((count, page) => count + pageChoices(page.id).length, 0);
const SLOW_RPM_DEFAULT = 40;

document.documentElement.lang = locale;
document.title = t('Анатомія авто');
document.querySelector('meta[name="description"]')?.setAttribute('content', t('Інтерактивна база знань про будову автомобіля: 3D-моделі двигунів, які можна крутити, запускати і слухати.'));
const app = document.getElementById('app')!;

const SVG_SOUND_ON = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6c1.5 1.6 1.5 4.4 0 6M14.2 3.8c2.8 3 2.8 7.4 0 10.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const SVG_SOUND_OFF = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6.5l4 5M16 6.5l-4 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

app.innerHTML = `
  <div class="backdrop"><div class="badge" id="badge" aria-hidden="true"></div></div>
  <canvas class="stage-canvas" id="stage" aria-label="${t('Тривимірна модель двигуна. Перетягуй, щоб обертати, коліщатком наближай.')}"></canvas>

  <header class="topbar">
    <div class="brand">${t('Анатомія авто')}</div>
    <nav class="sections" aria-label="${t('Розділи')}">
      <a class="current" id="nav-engines" href="#/engines/${DEFAULT_ENGINE}">${t('Двигуни')}</a>
      <a id="nav-designer" href="#/designer">${t('Свій двигун')}</a>
      <span>${t('Коробки передач')} <small>${t('готуємо')}</small></span>
      <span>${t('Підвіски')} <small>${t('готуємо')}</small></span>
    </nav>
    <div class="grow"></div>
    <div class="lang-switch" role="group" aria-label="${LANGUAGE_GROUP_LABEL}">
      <button type="button" data-lang="uk" lang="uk">${LANGUAGE_LABELS.uk}</button>
      <button type="button" data-lang="en" lang="en">${LANGUAGE_LABELS.en}</button>
    </div>
    <button class="btn btn-catalogue" id="open-table" type="button">${t('Усі двигуни')}<span class="btn-count">: ${ENGINE_COUNT}</span></button>
    <button class="btn" id="results-open" type="button" hidden>${t('Показники')}</button>
    <button class="btn" id="panel-open" type="button" hidden>${t('Про двигун')}</button>
  </header>

  <div class="engine-name">
    <h1 id="engine-title"></h1>
    <p id="engine-sub"></p>
    <div class="engine-nav">
      <button class="btn" id="prev" type="button" aria-label="${t('Попередній двигун')}">${t('Попередній')}</button>
      <button class="btn" id="next" type="button" aria-label="${t('Наступний двигун')}">${t('Наступний')}</button>
      <a class="btn" id="to-designer" href="#/designer">${t('Змінити в конструкторі')}</a>
      <a class="btn" id="to-catalog" href="#/engines/${DEFAULT_ENGINE}" hidden>${t('До каталогу')}</a>
    </div>
    <nav class="variant-list" id="variants" aria-label="${t('Двигуни цієї компоновки')}" hidden></nav>
  </div>

  <div class="view-tools">
    <div class="tool">
      <span class="tool-label">${t('Вигляд')}</span>
      <div class="segmented" role="group" aria-label="${t('Вигляд')}" id="view">
        <button type="button" data-v="solid" aria-pressed="false">${t('Двигун')}</button>
        <button type="button" data-v="xray" aria-pressed="true">${t('Рентген')}</button>
        <button type="button" data-v="mechanism" aria-pressed="false">${t('Механізм')}</button>
      </div>
    </div>
    <div class="tool">
      <span class="tool-label">${t('Швидкість рухів')}</span>
      <div class="segmented" role="group" aria-label="${t('Швидкість')}" id="speed">
        <button type="button" data-v="slow" aria-pressed="false">${t('Повільно')}</button>
        <button type="button" data-v="readable" aria-pressed="true">${t('Наочно')}</button>
        <button type="button" data-v="real" aria-pressed="false">${t('Реально')}</button>
      </div>
    </div>
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
  </div>

  <div class="hint" id="hint">
    ${t('Перетягни модель, щоб покрутити')}<br />
    ${t('Наведи на деталь, щоб побачити назву, клацни, щоб дізнатись більше')}<br />
    ${t('<kbd>Пробіл</kbd> газ, <kbd>S</kbd> запуск, <kbd>←</kbd> <kbd>→</kbd> інший двигун')}
  </div>
  <div class="scale-bar" title="${t('У межах однієї сторінки всі двигуни показано в однаковому масштабі')}">
    <span class="scale-line" id="scale-line"></span>
    <span id="scale-label"></span>
  </div>
  <div class="wreck" id="wreck" role="status" hidden></div>
  <div class="strain" id="strain" role="status" hidden></div>
  <div class="part-card" id="part-card" hidden></div>
  <div class="part-tip" id="part-tip" hidden></div>
  <div class="parts-callout" id="parts-callout" hidden></div>
  <div class="tooltip" id="tooltip" hidden></div>

  <button class="btn panel-toggle" id="panel-toggle-closed" type="button" hidden>${t('Про двигун')}</button>
  <aside class="panel" id="panel" aria-label="${t('Про двигун')}">
    <div class="panel-head">
      <h2 id="panel-title"></h2>
      <button class="btn" id="panel-close" type="button">${t('Сховати')}</button>
    </div>
    <div class="panel-scroll" id="article" tabindex="0"></div>
    <div class="panel-scroll" id="designer-host" tabindex="0" hidden></div>
  </aside>

  <aside class="results-panel" id="results-panel" aria-label="${t('Показники двигуна')}" hidden>
    <div class="panel-head results-head">
      <h2>${t('Показники')}</h2>
      <button class="btn" id="results-close" type="button">${t('Закрити')}</button>
    </div>
    <div class="panel-scroll" id="results-host" tabindex="0"></div>
  </aside>

  <footer class="dash">
    <section class="control-col">
      <button class="ignition" id="ignition" type="button">${t('Запустити двигун')}</button>
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
    <section class="pedal-col">
      <div class="pedal" id="pedal" role="slider" tabindex="0" aria-label="${t('Педаль газу')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="pedal-fill" id="pedal-fill"></div>
        <div class="pedal-text">${t('Газ')}<small>${t('тисни і тримай')}</small></div>
      </div>
      <button class="latch" id="latch" type="button" aria-pressed="false">${t('Утримувати')}</button>
    </section>
    <section class="chart-col firing-col">
      <h4>${t('Цикл у порядку спалахів')} <span id="firing-text"></span></h4>
      <div class="chart-body" id="firing-body"></div>
      <div class="legend">${legendHtml()}</div>
    </section>
    <section class="chart-col spectrum-col">
      <h4>${t('Спектр звуку')} <span id="spectrum-text"></span></h4>
      <div class="chart-body" id="spectrum-body"></div>
    </section>
  </footer>

  <div class="table-overlay" id="table-overlay" hidden role="dialog" aria-modal="true" aria-label="${t('Усі двигуни')}">
    <div class="table-head">
      <div>
        <h2>${t('Усі двигуни')}</h2>
        <p>${t('Кожна компоновка зі своїми реальними двигунами. На значках видно напрям циліндрів, якщо дивитись на двигун спереду.')}</p>
      </div>
      <button class="btn" id="table-close" type="button">${t('Закрити')}</button>
    </div>
    <div class="table-scroll" id="table-body"></div>
  </div>
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let stage: Stage;
const canvas = $<HTMLCanvasElement>('stage');
try {
  stage = new Stage(canvas);
} catch (error) {
  console.error(error);
  app.innerHTML = `<div class="no-webgl"><p>${t('Ця сторінка показує двигуни у 3D, а браузер не зміг увімкнути WebGL. Спробуй увімкнути апаратне прискорення або відкрий сторінку в іншому браузері.')}</p></div>`;
  throw error;
}

const onDesignerRoute = (): boolean => location.hash.startsWith('#/designer');

const resolveEngine = (): Engine => {
  const match = /^#\/engines\/([\w-]+(?:\/[\w-]+)?)/.exec(location.hash);
  const wanted = match?.[1];
  // A variant that no longer exists falls back to its page rather than to another engine.
  const spec = (wanted && (engineById(wanted) ?? engineById(wanted.split('/')[0]!))) || engineById(DEFAULT_ENGINE)!;
  return buildEngine(spec);
};

let engine = resolveEngine();
const drive = new Drive(engine);
const tacho = new Tacho();
$('tacho-wrap').append(tacho.element);
const firing = new FiringDiagram($('tooltip'));
$('firing-body').append(firing.element);
const spectrum = new Spectrum();
$('spectrum-body').append(spectrum.element);
const dyno = new DynoPanel({
  drive,
  layout() {
    layoutPanels();
    stage.fit(false, true);
  },
  leaveSlowMotion() {
    if (speed === 'slow') setSpeed('readable');
  },
  changed(on) {
    $<HTMLButtonElement>('speed').querySelector<HTMLButtonElement>('[data-v="slow"]')!.disabled = on;
  },
});
app.querySelector('.dash')!.append(dyno.element);
$('to-designer').before(dyno.toggleButton);

let model: EngineModel | null = null;
let view: ViewMode = 'xray';
let speed: SpeedMode = 'readable';
let slowRpm = SLOW_RPM_DEFAULT;
let shake = 0.45;
let explode = 0;
let visualTheta = 0;
let demoMode = true;
/** True while the audio thread is loading after the first press of the start button. */
let starting = false;
let latched = false;
let pedalHeld = 0;
let keyHeld = false;
let keyValue = 0;
let volume = 0.8;
let muted = false;
let panelOpen = window.innerWidth > 860;
let resultsOpen = window.innerWidth > 860;
let onDesigner = false;
let wasSmall = window.innerWidth <= 860;

/** How much bigger the largest engine of this page is. Size goes as the cube root of displacement, near enough to frame by. */
function pageFrameScale(next: Engine): number {
  const largest = Math.max(...pageChoices(next.spec.id).map((c) => buildEngine(engineById(c.id)!).displacementCc));
  return Math.cbrt(largest / next.displacementCc);
}

const SCALE_STEPS_CM = [2, 5, 10, 20, 50, 100];
let shownScale = 0;

/** A ruler under the hints: the only way to compare engines across pages, and to see what the zoom has done. */
function updateScaleBar(): void {
  const perCm = stage.pixelsPerUnit / 10;
  if (Math.abs(perCm - shownScale) < 0.02) return;
  shownScale = perCm;
  const cm = SCALE_STEPS_CM.filter((v) => v * perCm <= 150).pop() ?? SCALE_STEPS_CM[0]!;
  $('scale-line').style.width = `${Math.round(cm * perCm)}px`;
  $('scale-label').textContent = t('{cm} см', { cm });
}

/** Everything drawn from the engine's geometry. Shared by the catalogue and the designer. */
function showEngine(next: Engine, keepCamera: boolean): void {
  engine = next;
  const spec = engine.spec;
  const newModel: EngineModel = engine.isRotary ? new RotaryEngineModel(engine) : new PistonEngineModel(engine);
  // A rotary explains itself from the front, a piston engine from a three-quarter view.
  // The same scale for a whole page, or for a design as its sliders move, so that size can be seen.
  stage.setModel(newModel, engine.isRotary ? [0.34, 0.22, 1] : undefined, keepCamera, true, onDesigner ? 1 : pageFrameScale(next));
  model = newModel;
  model.setView(view);
  model.setExplode(explode);
  tacho.configure(spec.redlineRpm);
  tachoScale = spec.redlineRpm;
  applyZones();
  firing.setEngine(engine);
  $('badge').textContent = spec.badge;
  $('badge').style.setProperty('--badge-fit', String(spec.badge.length > 2 ? 0.46 : 0.62));
  $('part-card').hidden = true;
}

/** The real engines of this layout, to click through and hear. */
function renderVariants(id: string): void {
  const list = $('variants');
  const choices = pageChoices(id);
  list.hidden = choices.length < 2;
  list.replaceChildren(
    ...choices.map((choice) => {
      const link = document.createElement('a');
      link.href = `#/engines/${choice.id}`;
      link.textContent = choice.name;
      link.className = `variant${choice.id === id ? ' active' : ''}`;
      if (choice.id === id) link.setAttribute('aria-current', 'true');
      return link;
    }),
    Object.assign(document.createElement('a'), { href: '#/designer', textContent: t('Сконструювати свій'), className: 'variant variant-own' }),
  );
  // On a phone the list is a row: the chosen engine may be out of sight.
  const active = list.querySelector<HTMLElement>('.active');
  if (active) list.scrollLeft = active.offsetLeft - list.offsetLeft - 8;
}

function loadEngine(next: Engine, keepRunning: boolean, keepCamera = false): void {
  drive.setEngine(next);
  showEngine(next, keepCamera);
  dyno.setEngine(next, { kind: 'catalogue' });
  const spec = engine.spec;
  renderVariants(spec.id);
  $('engine-title').textContent = spec.title;
  const asp = spec.aspiration === 'na' ? '' : `, ${ASPIRATION_NAMES[spec.aspiration]}`;
  $('engine-sub').textContent = `${spec.example}${asp}`;
  $('panel-title').textContent = t('Про цей двигун');
  $('article').innerHTML = articleHtml(engine);
  $('article').scrollTop = 0;
  document.title = t('{title}. Анатомія авто', { title: spec.title });
  $('table-body').innerHTML = tableHtml(spec.id);
  $('table-overlay').hidden = true;
  $<HTMLAnchorElement>('to-designer').href = `#/designer/from/${spec.id}`;
  $<HTMLAnchorElement>('to-catalog').href = `#/engines/${spec.id}`;
  if (!keepRunning) visualTheta = 0;
}

let tachoScale = 0;
let lastDistress = 0;
let lastZones: { safe: number; failure: number; cut: number } | null = null;

/** The rev limit draws the dial, exactly as in the catalogue. Zones are added on top of it. */
function applyZones(): void {
  if (!lastZones || !onDesigner) return;
  const { safe, failure, cut } = lastZones;
  if (cut !== tachoScale) {
    tachoScale = cut;
    tacho.configure(cut);
  }
  tacho.setZones(safe, failure, cut);
}

const designer = new DesignerPage({
  showEngine(next) {
    showEngine(next, true);
  },
  heading() {
    syncDesignerHeading();
  },
  soundEngine(next, perf) {
    const running = drive.snapshot().state === 'running';
    drive.setEngine(next);
    dyno.setEngine(next, { kind: 'designer', design: designer.current, perf });
    if (running && !perf.catches) drive.stop();
  },
  setTrim(trim) {
    drive.setTrim(trim);
  },
  wreck() {
    dyno.abort('broken');
    drive.bang();
    drive.setDistress(0);
    drive.stop();
    // A repaired engine must not start at the throttle that just killed it.
    latched = false;
    pedalHeld = 0;
    $('latch').setAttribute('aria-pressed', 'false');
    applyPedal();
    $('wreck').textContent = designer.wreckMessage;
    $('wreck').hidden = false;
    $('strain').hidden = true;
  },
  zones(safe, failure, cut) {
    lastZones = { safe, failure, cut };
    applyZones();
  },
  health(share, suffering, distress) {
    const percent = Math.round(share * 100);
    $('health-bar').style.width = `${percent}%`;
    $('health-bar').classList.toggle('low', share < 0.35);
    $('health-value').textContent = `${percent}%`;
    $('health').setAttribute('aria-valuenow', String(percent));
    $('strain').hidden = !suffering;
    if (suffering) $('strain').textContent = t('Зношується: {part}', { part: suffering.toLowerCase() });
    if (distress !== lastDistress) {
      lastDistress = distress;
      drive.setDistress(distress);
    }
    if (share === 1) $('wreck').hidden = true;
  },
  showFailure(part) {
    model?.setFailure(part);
  },
});
$('designer-host').append(designer.controlsHost);
$('results-host').append(designer.results.root);

function syncDesignerHeading(): void {
  $('engine-title').textContent = designer.title;
  $('engine-sub').textContent = designer.summary;
  document.title = t('{title}. Анатомія авто', { title: designer.title });
}

/** Switches the panels and the engine between the catalogue and the designer. */
function applyRoute(): void {
  const wantsDesigner = onDesignerRoute();
  const small = window.innerWidth <= 860;
  if (wantsDesigner !== onDesigner) {
    onDesigner = wantsDesigner;
    document.body.classList.toggle('designer-mode', onDesigner);
    stage.fitScale = onDesigner ? 0.82 : 0.68;
    $('nav-engines').classList.toggle('current', !onDesigner);
    $('nav-designer').classList.toggle('current', onDesigner);
    $('article').hidden = onDesigner;
    $('designer-host').hidden = !onDesigner;
    $('results-panel').hidden = !onDesigner;
    for (const id of ['prev', 'next', 'to-designer']) $(id).hidden = onDesigner;
    if (onDesigner) $('variants').hidden = true;
    $('health').hidden = !onDesigner;
    $('strain').hidden = true;
    $('to-catalog').hidden = !onDesigner;
    $('wreck').hidden = true;
    if (onDesigner) {
      panelOpen = !small;
      resultsOpen = !small;
      $('panel-title').textContent = t('Конструкція');
      $('table-body').innerHTML = tableHtml('');
    } else {
      designer.leave();
      panelOpen = !small;
      loadEngine(resolveEngine(), true);
    }
    layoutPanels();
  }
  if (onDesigner) {
    designer.enter(DesignerPage.designFromRoute(location.hash));
    syncDesignerHeading();
    $('table-overlay').hidden = true;
  }
}

function layoutPanels(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const small = width <= 860;
  // Crossing the phone width: a side panel would otherwise become a sheet covering the engine.
  if (small !== wasSmall) {
    wasSmall = small;
    panelOpen = !small;
    resultsOpen = !small;
  }
  const narrowDesk = width < 1500;
  const panelSize = onDesigner ? (narrowDesk ? 360 : 420) : 400;
  const panelW = panelOpen && !small ? panelSize : 0;
  const leftW = onDesigner && resultsOpen && !small ? (narrowDesk ? 300 : 340) : 0;
  const dashH = $('tacho-wrap').parentElement!.offsetHeight;
  $('results-panel').classList.toggle('closed', !resultsOpen);
  $('results-open').hidden = !(small && onDesigner);
  $('panel-open').textContent = onDesigner ? t('Параметри') : t('Про двигун');
  document.documentElement.style.setProperty('--left-w', `${leftW}px`);
  $('panel').classList.toggle('closed', !panelOpen);
  document.body.classList.toggle('panel-closed', !panelOpen);
  $('panel-toggle-closed').hidden = panelOpen || small;
  $('panel-open').hidden = !small;
  $('panel-close').textContent = small ? t('Закрити') : t('Сховати');
  document.documentElement.style.setProperty('--stage-right', `${panelW}px`);
  document.documentElement.style.setProperty('--stage-left', `${leftW}px`);
  document.documentElement.style.setProperty('--panel-w', `${panelW}px`);
  document.documentElement.style.setProperty('--stage-x', `${((leftW + (width - leftW - panelW) / 2) / width) * 100}%`);
  const toolsH = 70;
  const topH = small ? 90 : 60;
  stage.resize(width, height, { left: leftW, right: panelW, top: topH, bottom: dashH + (small ? 30 : toolsH * 0.4) });
  const fb = $('firing-body');
  firing.resize(fb.clientWidth, fb.clientHeight);
  const sb = $('spectrum-body');
  spectrum.resize(sb.clientWidth, sb.clientHeight);
}

new ResizeObserver(layoutPanels).observe(app);

function setSegment(groupId: string, value: string): void {
  $(groupId)
    .querySelectorAll('button')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
}

function setView(next: ViewMode): void {
  view = next;
  setSegment('view', next);
  model?.setView(next);
}

function setSpeed(next: SpeedMode): void {
  // Slow motion locks the crank at walking pace, where no absorber can work.
  if (next === 'slow' && dyno.isActive) return;
  speed = next;
  setSegment('speed', next);
  $('slow-tool').hidden = next !== 'slow';
  drive.lock(next === 'slow' ? slowRpm : null);
}

async function toggleIgnition(): Promise<void> {
  const button = $('ignition');
  const state = drive.snapshot().state;
  if (state === 'running' || state === 'cranking') {
    dyno.abort('stopped');
    drive.stop();
    button.textContent = t('Запустити двигун');
    button.classList.remove('on');
    return;
  }
  demoMode = false;
  starting = true;
  $('wreck').hidden = true;
  if (onDesigner && designer.isBroken) designer.repair();
  button.textContent = t('Заглушити');
  button.classList.add('on');
  await drive.ensureAudio();
  drive.start();
  starting = false;
  if (drive.audioFailed) {
    $('spectrum-text').textContent = t('звук недоступний у цьому браузері');
  }
}

function applyPedal(): void {
  const value = Math.max(pedalHeld, keyValue);
  drive.setPedal(value);
  $('pedal-fill').style.height = `${value * 100}%`;
  const pedalEl = $('pedal');
  pedalEl.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  pedalEl.classList.toggle('active', value > 0.45);
}

async function pressThrottle(): Promise<void> {
  // Touching the pedal on a silent engine also starts it, which is what people try first.
  const state = drive.snapshot().state;
  if (state === 'off' || state === 'stopping') await toggleIgnition();
}

function setPedalFromEvent(event: PointerEvent): void {
  const rect = $('pedal').getBoundingClientRect();
  // The fill follows the cursor exactly, down to a closed throttle at the bottom edge.
  pedalHeld = Math.max(0, Math.min(1, (rect.bottom - event.clientY) / rect.height));
  applyPedal();
}

{
  const pedalEl = $('pedal');
  pedalEl.addEventListener('pointerdown', (event) => {
    pedalEl.setPointerCapture(event.pointerId);
    void pressThrottle();
    setPedalFromEvent(event);
  });
  pedalEl.addEventListener('pointermove', (event) => {
    if (pedalEl.hasPointerCapture(event.pointerId)) setPedalFromEvent(event);
  });
  const release = (): void => {
    if (!latched) {
      pedalHeld = 0;
      applyPedal();
    }
  };
  pedalEl.addEventListener('pointerup', release);
  pedalEl.addEventListener('pointercancel', release);
  // Keyboard users move the pedal in steps with the arrow keys when it has focus.
  pedalEl.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      pedalHeld = Math.max(0, pedalHeld - 0.1);
    } else if (event.key === 'ArrowUp') {
      pedalHeld = Math.min(1, pedalHeld + 0.1);
      latched = true;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    $('latch').setAttribute('aria-pressed', String(latched));
    applyPedal();
  });
}

$('latch').addEventListener('click', () => {
  latched = !latched;
  if (latched && pedalHeld === 0) pedalHeld = 0.45;
  if (!latched) pedalHeld = 0;
  $('latch').setAttribute('aria-pressed', String(latched));
  if (latched) void pressThrottle();
  applyPedal();
});

$('ignition').addEventListener('click', () => void toggleIgnition());

for (const [id, handler] of [
  ['view', (v: string) => setView(v as ViewMode)],
  ['speed', (v: string) => setSpeed(v as SpeedMode)],
  [
    'listen',
    (v: string) => {
      setSegment('listen', v);
      drive.setListen(v as ListenPosition);
    },
  ],
] as const) {
  $(id).addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button?.dataset.v) handler(button.dataset.v);
  });
}

$<HTMLInputElement>('slow-rpm').addEventListener('input', (event) => {
  slowRpm = Number((event.target as HTMLInputElement).value);
  $('slow-value').textContent = String(slowRpm);
  if (speed === 'slow') drive.lock(slowRpm);
});

$<HTMLInputElement>('explode').addEventListener('input', (event) => {
  explode = Number((event.target as HTMLInputElement).value);
  model?.setExplode(explode);
});

$<HTMLInputElement>('shake').addEventListener('change', (event) => {
  shake = (event.target as HTMLInputElement).checked ? 2.6 : 0.45;
});

$<HTMLInputElement>('volume').addEventListener('input', (event) => {
  volume = Number((event.target as HTMLInputElement).value);
  muted = volume === 0;
  syncSound();
});

function syncSound(): void {
  drive.setVolume(volume, muted);
  const button = $('mute');
  button.innerHTML = muted ? SVG_SOUND_OFF : SVG_SOUND_ON;
  button.setAttribute('aria-pressed', String(muted));
  button.setAttribute('aria-label', muted ? t('Увімкнути звук') : t('Вимкнути звук'));
}

$('mute').addEventListener('click', () => {
  muted = !muted;
  syncSound();
});

const setPanel = (open: boolean): void => {
  panelOpen = open;
  layoutPanels();
};
$('panel-close').addEventListener('click', () => setPanel(false));
$('panel-toggle-closed').addEventListener('click', () => setPanel(true));
$('panel-open').addEventListener('click', () => setPanel(true));
const setResults = (open: boolean): void => {
  resultsOpen = open;
  layoutPanels();
};
$('results-open').addEventListener('click', () => setResults(true));
$('results-close').addEventListener('click', () => setResults(false));

const openTable = (open: boolean): void => {
  $('table-overlay').hidden = !open;
  if (open) $('table-close').focus();
};
for (const button of document.querySelectorAll<HTMLButtonElement>('.lang-switch button')) {
  const language = button.dataset.lang as Locale;
  button.classList.toggle('active', language === locale);
  button.setAttribute('aria-pressed', String(language === locale));
  if (language !== locale) button.addEventListener('click', () => switchLocale(language));
}

$('open-table').addEventListener('click', () => openTable(true));
// A link to where we already are changes no route, and the list must still close.
$('table-body').addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('a')) openTable(false);
});
$('table-close').addEventListener('click', () => openTable(false));

const stepEngine = (delta: number): void => {
  const i = ENGINES.findIndex((e) => e.id === engine.spec.id.split('/')[0]);
  const next = ENGINES[(i + delta + ENGINES.length) % ENGINES.length]!;
  location.hash = `#/engines/${next.id}`;
};
$('prev').addEventListener('click', () => stepEngine(-1));
$('next').addEventListener('click', () => stepEngine(1));

window.addEventListener('hashchange', () => {
  if (onDesignerRoute() || onDesigner) {
    applyRoute();
    return;
  }
  const next = resolveEngine();
  if (next.spec.id !== engine.spec.id) {
    // Within one layout the camera stays where it is, so one engine next to another shows its real size.
    loadEngine(next, true, next.spec.id.split('/')[0] === engine.spec.id.split('/')[0]);
    if (window.innerWidth <= 860) setPanel(false);
  } else {
    $('table-overlay').hidden = true;
  }
});

const PARTS_LEARNED_KEY = 'parts-learned';

/** Storage can be blocked. Then the callout just comes back next time. */
function partsLearned(): void {
  $('parts-callout').hidden = true;
  try {
    localStorage.setItem(PARTS_LEARNED_KEY, '1');
  } catch {
    // Nothing to do: the note is only a convenience.
  }
}

{
  const callout = $('parts-callout');
  const touch = window.matchMedia('(hover: none)').matches;
  callout.textContent = touch ? t('Торкнись будь-якої деталі, щоб дізнатися, що це') : t('Наведи на будь-яку деталь, щоб побачити її назву. Клацни, щоб дізнатися, що вона робить');
  let learned = false;
  try {
    learned = localStorage.getItem(PARTS_LEARNED_KEY) === '1';
  } catch {
    learned = false;
  }
  callout.hidden = learned;
}

// The name of a part follows the pointer, so it's plain that parts can be asked about.
{
  const tip = $('part-tip');
  let lastPick = 0;
  let dragging = false;
  canvas.addEventListener('pointerdown', () => {
    dragging = true;
    tip.hidden = true;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });
  canvas.addEventListener('pointerleave', () => {
    tip.hidden = true;
    canvas.style.cursor = '';
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || dragging) return;
    // Casting a ray through a whole engine is too slow to do on every move.
    const now = performance.now();
    if (now - lastPick < 90) {
      if (!tip.hidden) {
        tip.style.left = `${event.clientX + 14}px`;
        tip.style.top = `${event.clientY + 16}px`;
      }
      return;
    }
    lastPick = now;
    const info = stage.pick(event.clientX, event.clientY);
    canvas.style.cursor = info ? 'pointer' : '';
    if (!info) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = `<strong>${info.name}</strong><span>${t('клацни, щоб дізнатись більше')}</span>`;
    tip.hidden = false;
    const width = tip.offsetWidth;
    tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - width - 8)}px`;
    tip.style.top = `${event.clientY + 16}px`;
  });
}

// Clicking a part without dragging explains what it is.
{
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    const card = $('part-card');
    if (moved > 5) return;
    const info = stage.pick(event.clientX, event.clientY);
    if (!info) {
      card.hidden = true;
      return;
    }
    $('part-tip').hidden = true;
    partsLearned();
    card.innerHTML = `<strong>${info.name}</strong><p>${info.text}</p>`;
    card.hidden = false;
    const rect = card.getBoundingClientRect();
    const x = Math.min(window.innerWidth - rect.width - 12, Math.max(12, event.clientX + 14));
    const y = Math.max(60, event.clientY - rect.height - 10);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  });
}

// Keyboard: space or the up arrow is the gas pedal.
const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

/** Keys belong to the field: typing a number or a name must not rev the engine. */
const enteringText = (target: EventTarget | null): boolean => {
  const el = target as HTMLInputElement | null;
  if (!el) return false;
  if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && el.type !== 'range' && el.type !== 'checkbox';
};

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    openTable(false);
    return;
  }
  if (!$('table-overlay').hidden || enteringText(event.target)) return;
  const onRange = typing(event.target);
  if (event.code === 'Space' || (event.code === 'ArrowUp' && !onRange)) {
    event.preventDefault();
    if (event.repeat) return;
    keyHeld = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    void pressThrottle();
    return;
  }
  if (onRange) return;
  switch (event.code) {
    case 'KeyS':
      void toggleIgnition();
      break;
    case 'ArrowRight':
      if (!onDesigner) stepEngine(1);
      break;
    case 'ArrowLeft':
      if (!onDesigner) stepEngine(-1);
      break;
    case 'KeyT':
      openTable(true);
      break;
    case 'KeyM':
      muted = !muted;
      syncSound();
      break;
    case 'Digit1':
      setView('solid');
      break;
    case 'Digit2':
      setView('xray');
      break;
    case 'Digit3':
      setView('mechanism');
      break;
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    keyHeld = false;
  }
});

window.addEventListener('blur', () => {
  keyHeld = false;
  if (!latched) pedalHeld = 0;
  applyPedal();
});

/** How fast the crank turns on screen in the readable mode. Rises with rpm but stays followable. */
const readableDegreesPerSecond = (rpm: number): number => {
  const spec = engine.spec;
  const x = Math.min(1, Math.max(0, (rpm - spec.idleRpm) / (spec.redlineRpm - spec.idleRpm)));
  const shownRpm = 42 * Math.pow(8.5, x);
  return (rpm < spec.idleRpm ? (shownRpm * rpm) / spec.idleRpm : shownRpm) * 6;
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) stage.setOrbit(false);

let lastFrame = performance.now();
let firingTextShown = '';
let spectrumTextShown = '';

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  // Throttle key eases in and out so the note doesn't step.
  const keyTarget = keyHeld ? 1 : 0;
  const keyRate = keyHeld ? 6 : 12;
  const newKey = keyValue + (keyTarget - keyValue) * Math.min(1, keyRate * dt);
  if (Math.abs(newKey - keyValue) > 0.001) {
    keyValue = newKey < 0.004 ? 0 : newKey;
    applyPedal();
  }

  const snap = drive.tick(dt);
  dyno.frame(snap, dt);
  const spec = engine.spec;
  const running = snap.state === 'running';

  let theta: number;
  let shownSpeed: number;
  let shownRunning = running;
  let shownLoad = snap.load;
  let shownCut = snap.fuelCut;
  if (demoMode) {
    // Before the first start the mechanism turns gently so the page isn't dead on arrival.
    shownSpeed = reducedMotion ? 0 : 30 * 6;
    visualTheta = (visualTheta + shownSpeed * dt) % engine.cycle;
    theta = visualTheta;
    shownRunning = true;
    shownLoad = 0.35;
    shownCut = false;
  } else if (speed === 'readable') {
    shownSpeed = snap.state === 'off' ? 0 : readableDegreesPerSecond(snap.rpm);
    visualTheta = (visualTheta + shownSpeed * dt) % engine.cycle;
    theta = visualTheta;
  } else {
    shownSpeed = snap.rpm * 6;
    theta = snap.angle;
    visualTheta = theta;
  }

  model?.update({
    theta,
    rpm: demoMode ? spec.idleRpm : snap.rpm,
    load: shownLoad,
    fuelCut: shownCut,
    running: shownRunning,
    boost: snap.boost,
    dt,
    shake: demoMode ? 0 : shake,
  });
  stage.render(dt);
  updateScaleBar();

  tacho.update(snap.rpm, running && snap.fuelCut && snap.rpm > spec.redlineRpm - 200);
  if (onDesigner) designer.frame(snap.rpm, running, snap.load, dt);
  firing.draw(theta);

  const firesPerSecond = ((snap.rpm / 60) * 720 * spec.cylinders) / 720 / 2;
  const rotaryFires = (snap.rpm / 60) * spec.cylinders;
  const firingHz = engine.isRotary ? rotaryFires : firesPerSecond;
  spectrum.draw(drive.audioReady ? drive.analyser : null, drive.sampleRate, snap.state === 'off' ? 0 : firingHz);
  const firingText = snap.state === 'off' ? '' : t('{count} спалахів за секунду', { count: Math.round(firingHz) });
  if (firingText !== firingTextShown) {
    $('firing-text').textContent = firingText;
    firingTextShown = firingText;
  }
  const spectrumText = snap.state === 'off' || drive.audioFailed ? (drive.audioFailed ? t('звук недоступний') : '') : t('основний тон {hz} Гц', { hz: Math.round(firingHz) });
  if (spectrumText !== spectrumTextShown) {
    $('spectrum-text').textContent = spectrumText;
    spectrumTextShown = spectrumText;
  }

  const button = $('ignition');
  const shouldBeOn = snap.state === 'running' || snap.state === 'cranking';
  if (shouldBeOn !== button.classList.contains('on') && !demoMode && !starting) {
    button.classList.toggle('on', shouldBeOn);
    button.textContent = shouldBeOn ? t('Заглушити') : t('Запустити двигун');
  }
}

loadEngine(engine, false);
layoutPanels();
applyRoute();
requestAnimationFrame(frame);

// Handy for manual checks in the browser console.
declare global {
  interface Window {
    __engine: { drive: Drive; stage: Stage; designer: DesignerPage; dyno: DynoPanel };
  }
}
window.__engine = { drive, stage, designer, dyno };
