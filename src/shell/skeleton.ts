// The page's skeleton: the top bar, the stage, the panels and the overlays every page has, with the places sections
// fill (ShellSlots). The ids and classes are the ones the page has always had, and the snapshots of the engine pages
// compare the DOM exactly, whitespace included: a section's markup carries the whitespace up to the next element of
// the skeleton, which is why some closing tags here look indented one step too far. The menu is the one the site has
// always had; a menu built from the sections' registry replaces it later.

import { LANGUAGE_GROUP_LABEL, LANGUAGE_LABELS } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { DEFAULT_ENGINE } from '../ui/engines/routes.ts';
import type { ShellSlots, Slot, TableOverlay } from './section.ts';

export function skeletonHtml(): string {
  return `
  <div class="backdrop"></div>
  <canvas class="stage-canvas" id="stage" aria-label="${t('Тривимірна модель двигуна. Перетягуй, щоб обертати, коліщатком наближай.')}"></canvas>

  <header class="topbar">
    <div class="brand">${t('Анатомія авто')}</div>
    <nav class="sections" aria-label="${t('Розділи')}">
      <a class="current" id="nav-engines" href="#/engines/${DEFAULT_ENGINE}">${t('Двигуни')}</a>
      <a id="nav-designer" href="#/designer">${t('Свій двигун')}</a>
      <a id="nav-sump" href="#/sump">${t('Олива на треку')}</a>
      <span>${t('Коробки передач')} <small>${t('готуємо')}</small></span>
      <span>${t('Підвіски')} <small>${t('готуємо')}</small></span>
    </nav>
    <div class="grow"></div>
    <div class="lang-switch" role="group" aria-label="${LANGUAGE_GROUP_LABEL}">
      <button type="button" data-lang="uk" lang="uk">${LANGUAGE_LABELS.uk}</button>
      <button type="button" data-lang="en" lang="en">${LANGUAGE_LABELS.en}</button>
    </div>
    <button class="btn" id="results-open" type="button" hidden>${t('Показники')}</button>
    <button class="btn" id="panel-open" type="button" hidden>${t('Про двигун')}</button>
  </header>

  <div class="engine-name"></div>

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
    </aside>

  <aside class="results-panel" id="results-panel" aria-label="${t('Показники двигуна')}" hidden>
    <div class="panel-head results-head">
      <h2>${t('Показники')}</h2>
      <button class="btn" id="results-close" type="button">${t('Закрити')}</button>
    </div>
    </aside>

  <footer class="dash"></footer>

  <div class="table-overlay" id="table-overlay" hidden role="dialog" aria-modal="true" aria-label="${t('Усі двигуни')}">
    <div class="table-head">
      <button class="btn" id="table-close" type="button">${t('Закрити')}</button>
    </div>
    <div class="table-scroll" id="table-body"></div>
  </div>
`;
}

/** Content goes into `parent` before `before`, or at its end. */
class Place implements Slot {
  readonly parent: HTMLElement;
  private readonly before: Element | null;

  constructor(parent: HTMLElement, before: Element | null = null) {
    this.parent = parent;
    this.before = before;
  }

  add(...content: Array<string | Node>): void {
    for (const item of content) {
      if (typeof item !== 'string') this.parent.insertBefore(item, this.before);
      else if (this.before) this.before.insertAdjacentHTML('beforebegin', item);
      else this.parent.insertAdjacentHTML('beforeend', item);
    }
  }
}

/** The skeleton's elements the shell itself works with. */
export interface SkeletonElements {
  canvas: HTMLCanvasElement;
  view: HTMLElement;
  speed: HTMLElement;
  tools: HTMLElement;
  panel: HTMLElement;
  panelOpen: HTMLElement;
  panelClose: HTMLElement;
  panelToggleClosed: HTMLElement;
  resultsPanel: HTMLElement;
  resultsOpen: HTMLElement;
  resultsClose: HTMLElement;
  tableClose: HTMLElement;
  scaleLine: HTMLElement;
  scaleLabel: HTMLElement;
  partTip: HTMLElement;
  partsCallout: HTMLElement;
}

/** Finds the skeleton's elements and places in `root`, after skeletonHtml() has been put in it. */
export function skeletonOf(root: HTMLElement): { slots: ShellSlots; elements: SkeletonElements } {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const overlay = $('#table-overlay');
  const tableClose = $('#table-close');
  const table: TableOverlay = {
    head: new Place($('.table-head'), tableClose),
    body: $('#table-body'),
    get isOpen() {
      return !overlay.hidden;
    },
    open(on) {
      overlay.hidden = !on;
      if (on) tableClose.focus();
    },
  };
  const slots: ShellSlots = {
    root,
    backdrop: new Place($('.backdrop')),
    actions: new Place($('.topbar'), $('#results-open')),
    title: new Place($('.engine-name')),
    tools: new Place($('.view-tools')),
    status: new Place(root, $('#part-card')),
    panelTitle: $('#panel-title'),
    panel: new Place($('#panel')),
    results: new Place($('#results-panel')),
    dash: new Place($('.dash')),
    afterDash: new Place(root, overlay),
    partCard: $('#part-card'),
    tooltip: $('#tooltip'),
    table,
  };
  const elements: SkeletonElements = {
    canvas: $<HTMLCanvasElement>('#stage'),
    view: $('#view'),
    speed: $('#speed'),
    tools: $('.view-tools'),
    panel: $('#panel'),
    panelOpen: $('#panel-open'),
    panelClose: $('#panel-close'),
    panelToggleClosed: $('#panel-toggle-closed'),
    resultsPanel: $('#results-panel'),
    resultsOpen: $('#results-open'),
    resultsClose: $('#results-close'),
    tableClose,
    scaleLine: $('#scale-line'),
    scaleLabel: $('#scale-label'),
    partTip: $('#part-tip'),
    partsCallout: $('#parts-callout'),
  };
  return { slots, elements };
}
