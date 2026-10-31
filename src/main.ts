import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans-extra-condensed/600.css';
import '@fontsource/fira-sans-extra-condensed/700.css';
import '@fontsource/fira-sans-extra-condensed/800.css';
import './style.css';
import { ENGINES, engineById } from './data/engines.ts';
import { Drive } from './audio/drive.ts';
import type { ListenPosition } from './audio/synth.ts';
import { buildEngine, type Engine } from './engine/kinematics.ts';
import { ASPIRATION_NAMES } from './engine/spec.ts';
import type { EngineModel, ViewMode } from './scene/model-types.ts';
import { PistonEngineModel } from './scene/piston-engine.ts';
import { RotaryEngineModel } from './scene/rotary-engine.ts';
import { Stage } from './scene/stage.ts';
import { articleHtml } from './ui/article.ts';
import { FiringDiagram, legendHtml } from './ui/firing-diagram.ts';
import { Spectrum } from './ui/spectrum.ts';
import { tableHtml } from './ui/table.ts';
import { Tacho } from './ui/tacho.ts';

type SpeedMode = 'slow' | 'readable' | 'real';

const DEFAULT_ENGINE = 'v8-cross';
const SLOW_RPM_DEFAULT = 40;

const app = document.getElementById('app')!;

const SVG_SOUND_ON = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6c1.5 1.6 1.5 4.4 0 6M14.2 3.8c2.8 3 2.8 7.4 0 10.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const SVG_SOUND_OFF = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor"/><path d="M12 6.5l4 5M16 6.5l-4 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

app.innerHTML = `
  <div class="backdrop"><div class="badge" id="badge" aria-hidden="true"></div></div>
  <canvas class="stage-canvas" id="stage" aria-label="Тривимірна модель двигуна. Перетягуй, щоб обертати, коліщатком наближай."></canvas>

  <header class="topbar">
    <div class="brand">Анатомія авто</div>
    <nav class="sections" aria-label="Розділи">
      <a class="current" href="#/engines/${DEFAULT_ENGINE}">Двигуни</a>
      <span>Коробки передач <small>готуємо</small></span>
      <span>Підвіски <small>готуємо</small></span>
    </nav>
    <div class="grow"></div>
    <button class="btn" id="open-table" type="button">Усі двигуни</button>
    <button class="btn" id="panel-open" type="button" hidden>Про двигун</button>
  </header>

  <div class="engine-name">
    <h1 id="engine-title"></h1>
    <p id="engine-sub"></p>
    <div class="engine-nav">
      <button class="btn" id="prev" type="button" aria-label="Попередній двигун">Попередній</button>
      <button class="btn" id="next" type="button" aria-label="Наступний двигун">Наступний</button>
    </div>
  </div>

  <div class="view-tools">
    <div class="tool">
      <span class="tool-label">Вигляд</span>
      <div class="segmented" role="group" aria-label="Вигляд" id="view">
        <button type="button" data-v="solid" aria-pressed="false">Двигун</button>
        <button type="button" data-v="xray" aria-pressed="true">Рентген</button>
        <button type="button" data-v="mechanism" aria-pressed="false">Механізм</button>
      </div>
    </div>
    <div class="tool">
      <span class="tool-label">Швидкість рухів</span>
      <div class="segmented" role="group" aria-label="Швидкість" id="speed">
        <button type="button" data-v="slow" aria-pressed="false">Повільно</button>
        <button type="button" data-v="readable" aria-pressed="true">Наочно</button>
        <button type="button" data-v="real" aria-pressed="false">Реально</button>
      </div>
    </div>
    <label class="tool tool-slow" id="slow-tool" hidden>
      <span class="tool-label">Оберти: <span id="slow-value">${SLOW_RPM_DEFAULT}</span> об/хв</span>
      <input type="range" id="slow-rpm" min="10" max="300" step="5" value="${SLOW_RPM_DEFAULT}" />
    </label>
    <label class="tool tool-explode">
      <span class="tool-label">Розібрати</span>
      <input type="range" id="explode" min="0" max="1" step="0.01" value="0" />
    </label>
    <label class="check tool-shake">
      <input type="checkbox" id="shake" />
      Перебільшити вібрації
    </label>
  </div>

  <div class="hint" id="hint">
    Перетягни модель, щоб покрутити<br />
    Клацни деталь, щоб дізнатись, що це<br />
    <kbd>Пробіл</kbd> газ, <kbd>S</kbd> запуск, <kbd>←</kbd> <kbd>→</kbd> інший двигун
  </div>
  <div class="part-card" id="part-card" hidden></div>
  <div class="tooltip" id="tooltip" hidden></div>

  <button class="btn panel-toggle" id="panel-toggle-closed" type="button" hidden>Про двигун</button>
  <aside class="panel" id="panel" aria-label="Про двигун">
    <div class="panel-head">
      <h2 id="panel-title"></h2>
      <button class="btn" id="panel-close" type="button">Сховати</button>
    </div>
    <div class="panel-scroll" id="article" tabindex="0"></div>
  </aside>

  <footer class="dash">
    <section class="control-col">
      <button class="ignition" id="ignition" type="button">Запустити двигун</button>
      <div class="volume-row">
        <button class="btn icon-btn" id="mute" type="button" aria-label="Вимкнути звук" aria-pressed="false">${SVG_SOUND_ON}</button>
        <input type="range" id="volume" min="0" max="1" step="0.01" value="0.8" aria-label="Гучність" />
      </div>
      <div class="listen-select" role="group" aria-label="Звідки слухати" id="listen">
        <button type="button" data-v="exhaust" aria-pressed="true">Біля вихлопу</button>
        <button type="button" data-v="bay" aria-pressed="false">Під капотом</button>
        <button type="button" data-v="cabin" aria-pressed="false">У салоні</button>
      </div>
    </section>
    <section class="tacho-wrap" id="tacho-wrap"></section>
    <section class="pedal-col">
      <div class="pedal" id="pedal" role="slider" tabindex="0" aria-label="Педаль газу" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="pedal-fill" id="pedal-fill"></div>
        <div class="pedal-text">Газ<small>тисни і тримай</small></div>
      </div>
      <button class="latch" id="latch" type="button" aria-pressed="false">Утримувати</button>
    </section>
    <section class="chart-col firing-col">
      <h4>Цикл у порядку спалахів <span id="firing-text"></span></h4>
      <div class="chart-body" id="firing-body"></div>
      <div class="legend">${legendHtml()}</div>
    </section>
    <section class="chart-col spectrum-col">
      <h4>Спектр звуку <span id="spectrum-text"></span></h4>
      <div class="chart-body" id="spectrum-body"></div>
    </section>
  </footer>

  <div class="table-overlay" id="table-overlay" hidden role="dialog" aria-modal="true" aria-label="Усі двигуни">
    <div class="table-head">
      <div>
        <h2>Усі двигуни</h2>
        <p>Рядки показують, як розміщені циліндри, стовпці показують, скільки їх. На значках видно напрям циліндрів, якщо дивитись на двигун спереду.</p>
      </div>
      <button class="btn" id="table-close" type="button">Закрити</button>
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
  app.innerHTML = '<div class="no-webgl"><p>Ця сторінка показує двигуни у 3D, а браузер не зміг увімкнути WebGL. Спробуй увімкнути апаратне прискорення або відкрий сторінку в іншому браузері.</p></div>';
  throw error;
}

const resolveEngine = (): Engine => {
  const match = /^#\/engines\/([\w-]+)/.exec(location.hash);
  const spec = (match && engineById(match[1]!)) || engineById(DEFAULT_ENGINE)!;
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

function loadEngine(next: Engine, keepRunning: boolean): void {
  engine = next;
  const spec = engine.spec;
  drive.setEngine(engine);
  const newModel: EngineModel = engine.isRotary ? new RotaryEngineModel(engine) : new PistonEngineModel(engine);
  // A rotary explains itself from the front, a piston engine from a three-quarter view.
  stage.setModel(newModel, engine.isRotary ? [0.34, 0.22, 1] : undefined);
  model = newModel;
  model.setView(view);
  model.setExplode(explode);
  tacho.configure(spec.redlineRpm);
  firing.setEngine(engine);
  $('badge').textContent = spec.badge;
  $('badge').style.setProperty('--badge-fit', String(spec.badge.length > 2 ? 0.46 : 0.62));
  $('engine-title').textContent = spec.title;
  const asp = spec.aspiration === 'na' ? '' : `, ${ASPIRATION_NAMES[spec.aspiration]}`;
  $('engine-sub').textContent = `${spec.example}${asp}`;
  $('panel-title').textContent = 'Про цей двигун';
  $('article').innerHTML = articleHtml(engine);
  $('article').scrollTop = 0;
  document.title = `${spec.title}. Анатомія авто`;
  $('table-body').innerHTML = tableHtml(spec.id);
  $('table-overlay').hidden = true;
  $('part-card').hidden = true;
  if (!keepRunning) visualTheta = 0;
}

function layoutPanels(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const small = width <= 860;
  const panelW = panelOpen && !small ? 400 : 0;
  const dashH = $('tacho-wrap').parentElement!.offsetHeight;
  $('panel').classList.toggle('closed', !panelOpen);
  document.body.classList.toggle('panel-closed', !panelOpen);
  $('panel-toggle-closed').hidden = panelOpen || small;
  $('panel-open').hidden = !small;
  $('panel-close').textContent = small ? 'Закрити' : 'Сховати';
  document.documentElement.style.setProperty('--stage-right', `${panelW}px`);
  document.documentElement.style.setProperty('--stage-left', '0px');
  document.documentElement.style.setProperty('--panel-w', `${panelW}px`);
  document.documentElement.style.setProperty('--stage-x', `${((width - panelW) / 2 / width) * 100}%`);
  const toolsH = 70;
  const topH = small ? 90 : 60;
  stage.resize(width, height, { left: 0, right: panelW, top: topH, bottom: dashH + (small ? 30 : toolsH * 0.4) });
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
  speed = next;
  setSegment('speed', next);
  $('slow-tool').hidden = next !== 'slow';
  drive.lock(next === 'slow' ? slowRpm : null);
}

async function toggleIgnition(): Promise<void> {
  const button = $('ignition');
  const state = drive.snapshot().state;
  if (state === 'running' || state === 'cranking') {
    drive.stop();
    button.textContent = 'Запустити двигун';
    button.classList.remove('on');
    return;
  }
  demoMode = false;
  starting = true;
  button.textContent = 'Заглушити';
  button.classList.add('on');
  await drive.ensureAudio();
  drive.start();
  starting = false;
  if (drive.audioFailed) {
    $('spectrum-text').textContent = 'звук недоступний у цьому браузері';
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
  const y = (rect.bottom - event.clientY) / rect.height;
  // The top third already gives some throttle so a simple tap is a useful blip.
  pedalHeld = Math.max(0.3, Math.min(1, 0.3 + y * 0.9));
  applyPedal();
}

{
  const pedalEl = $('pedal');
  pedalEl.addEventListener('pointerdown', (event) => {
    pedalEl.setPointerCapture(event.pointerId);
    void pressThrottle();
    latched = false;
    $('latch').setAttribute('aria-pressed', 'false');
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
      latched = pedalHeld > 0;
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
  button.setAttribute('aria-label', muted ? 'Увімкнути звук' : 'Вимкнути звук');
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

const openTable = (open: boolean): void => {
  $('table-overlay').hidden = !open;
  if (open) $('table-close').focus();
};
$('open-table').addEventListener('click', () => openTable(true));
$('table-close').addEventListener('click', () => openTable(false));

const stepEngine = (delta: number): void => {
  const i = ENGINES.findIndex((e) => e.id === engine.spec.id);
  const next = ENGINES[(i + delta + ENGINES.length) % ENGINES.length]!;
  location.hash = `#/engines/${next.id}`;
};
$('prev').addEventListener('click', () => stepEngine(-1));
$('next').addEventListener('click', () => stepEngine(1));

window.addEventListener('hashchange', () => {
  const next = resolveEngine();
  if (next.spec.id !== engine.spec.id) {
    loadEngine(next, true);
    if (window.innerWidth <= 860) setPanel(false);
  } else {
    $('table-overlay').hidden = true;
  }
});

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

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    openTable(false);
    return;
  }
  if (!$('table-overlay').hidden) return;
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
      stepEngine(1);
      break;
    case 'ArrowLeft':
      stepEngine(-1);
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

  tacho.update(snap.rpm, running && snap.fuelCut && snap.rpm > spec.redlineRpm - 200);
  firing.draw(theta);

  const firesPerSecond = ((snap.rpm / 60) * 720 * spec.cylinders) / 720 / 2;
  const rotaryFires = (snap.rpm / 60) * spec.cylinders;
  const firingHz = engine.isRotary ? rotaryFires : firesPerSecond;
  spectrum.draw(drive.audioReady ? drive.analyser : null, drive.sampleRate, snap.state === 'off' ? 0 : firingHz);
  const firingText = snap.state === 'off' ? '' : `${Math.round(firingHz)} спалахів за секунду`;
  if (firingText !== firingTextShown) {
    $('firing-text').textContent = firingText;
    firingTextShown = firingText;
  }
  const spectrumText = snap.state === 'off' || drive.audioFailed ? (drive.audioFailed ? 'звук недоступний' : '') : `основний тон ${Math.round(firingHz)} Гц`;
  if (spectrumText !== spectrumTextShown) {
    $('spectrum-text').textContent = spectrumText;
    spectrumTextShown = spectrumText;
  }

  const button = $('ignition');
  const shouldBeOn = snap.state === 'running' || snap.state === 'cranking';
  if (shouldBeOn !== button.classList.contains('on') && !demoMode && !starting) {
    button.classList.toggle('on', shouldBeOn);
    button.textContent = shouldBeOn ? 'Заглушити' : 'Запустити двигун';
  }
}

loadEngine(engine, false);
layoutPanels();
requestAnimationFrame(frame);

// Handy for manual checks in the browser console.
declare global {
  interface Window {
    __engine: { drive: Drive; stage: Stage };
  }
}
window.__engine = { drive, stage };
