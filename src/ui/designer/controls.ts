// The parameter panel. It only reports what the visitor asked for: limits and consequences are decided elsewhere.

import { paramRange, type NumericKey, type Range } from '../../designer/constraints.ts';
import type { Reliability } from '../../designer/reliability.ts';
import { previewEffects, type Effect } from '../../designer/sensitivity.ts';
import { axisAngle, firingFromCrank } from '../../designer/crank.ts';
import { exhaustGroups, isRotary, type CrankThrow, type Design } from '../../designer/design.ts';
import type { Performance } from '../../designer/physics.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { PARAM_GROUPS, type ChoiceParam, type ColorParam, type NumberParam, type Param, type ParamGroup, type ToggleParam } from './params.ts';

export type DesignPatch = Partial<Design>;

const toSlider = (value: number, range: Range, log: boolean): number => {
  if (!log) return value;
  const min = Math.max(range.min, 1e-3);
  return (Math.log(Math.max(value, min) / min) / Math.log(range.max / min)) * 1000;
};

const fromSlider = (slider: number, range: Range, log: boolean): number => {
  if (!log) return slider;
  const min = Math.max(range.min, 1e-3);
  return min * (range.max / min) ** (slider / 1000);
};

const snap = (value: number, step: number): number => Math.round(value / step) * step;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

interface Control {
  param: Param;
  root: HTMLElement;
  sync(d: Design): void;
}

/** A line of computed consequences. */
const effectsHtml = (effects: Effect[]): string =>
  effects.map((e) => `<span class="effect"><span>${e.name}</span> <b>${e.text}</b></span>`).join('');

const nothingChanged = (param: Param): string => {
  const only = 'only' in param ? param.only : undefined;
  if (only === 'sound') return t('На показники не впливає, змінює лише звук.');
  if (only === 'looks') return t('На показники не впливає, змінює лише вигляд.');
  return t('На цьому двигуні майже нічого не змінилось.');
};

/** A reveal for the explanation of one parameter. */
const helpLine = (help: string, preview?: () => string): { button: HTMLButtonElement; text: HTMLElement } => {
  const button = el('button', 'help-button', '?');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', t('Що це'));
  const text = el('div', 'param-help');
  const words = el('p', undefined, help);
  const computed = el('div', 'param-preview');
  text.append(words, computed);
  text.hidden = true;
  button.addEventListener('click', () => {
    text.hidden = !text.hidden;
    button.setAttribute('aria-expanded', String(!text.hidden));
    // Worked out for the engine on screen, at the moment it's asked for.
    if (!text.hidden && preview) computed.innerHTML = preview();
  });
  return { button, text };
};

function numberControl(param: NumberParam, onChange: (patch: DesignPatch) => void, onCommit: () => void): Control {
  const root = el('div', 'param');
  const head = el('div', 'param-head');
  const id = `param-${param.key}`;
  const label = el('label', 'param-label', param.label);
  label.htmlFor = id;
  let latest: Design | null = null;
  const { button, text } = helpLine(param.help, () => {
    if (!latest) return '';
    const d = latest;
    const value = (d[param.key] as number | null) ?? param.shown?.(d) ?? 0;
    const range = paramRange(d, param.key);
    const step = (range.max - range.min) * 0.1;
    const line = (label: string, to: number): string => {
      const effects = previewEffects(d, param.key, to);
      return `<p><strong>${label}:</strong> ${effects.length ? effectsHtml(effects) : nothingChanged(param)}</p>`;
    };
    return [value + step <= range.max ? line(t('Більше'), value + step) : '', value - step >= range.min ? line(t('Менше'), value - step) : ''].join('');
  });
  const input = el('input', 'param-number');
  input.type = 'number';
  input.id = id;
  input.step = String(param.percent ? 1 : param.step);
  const unit = el('span', 'param-unit', param.unit);
  head.append(label, button, input, unit);
  const slider = el('input', 'param-slider');
  slider.type = 'range';
  slider.setAttribute('aria-label', param.label);
  const limit = el('p', 'param-limit');
  limit.hidden = true;
  root.append(head, slider, limit, text);

  const shown = (v: number): number => (param.percent ? Math.round(v * 100) : v);
  const parse = (v: number): number => (param.percent ? v / 100 : v);
  const log = param.log === true;

  slider.addEventListener('input', () => {
    if (!latest) return;
    const range = paramRange(latest, param.key);
    const raw = fromSlider(Number(slider.value), range, log);
    onChange({ [param.key]: snap(raw, param.step) } as DesignPatch);
  });
  slider.addEventListener('change', onCommit);
  input.addEventListener('change', () => {
    // An emptied field means nothing yet, not zero. Put the current value back.
    const value = parse(Number(input.value));
    if (input.value.trim() !== '' && Number.isFinite(value)) onChange({ [param.key]: value } as DesignPatch);
    else if (latest) sync(latest);
    onCommit();
  });

  const sync = (d: Design): void => {
    latest = d;
    const value = (d[param.key] as number | null) ?? param.shown?.(d) ?? 0;
    const range = paramRange(d, param.key);
    if (document.activeElement !== input) {
      input.value = shown(value).toFixed(param.percent ? 0 : param.digits ?? 0);
    }
    input.min = String(shown(range.min));
    input.max = String(shown(range.max));
    slider.step = log ? '1' : String(param.step);
    slider.min = String(log ? 0 : range.min);
    slider.max = String(log ? 1000 : range.max);
    if (document.activeElement !== slider || !log) slider.value = String(toSlider(value, range, log));
    const atMin = range.minWhy && value <= range.min + 1e-9;
    const atMax = range.maxWhy && value >= range.max - 1e-9;
    const why = atMin ? range.minWhy : atMax ? range.maxWhy : undefined;
    limit.hidden = !why;
    if (why) limit.textContent = why;
  };
  return { param, root, sync };
}

function choiceControl(param: ChoiceParam, onChange: (patch: DesignPatch) => void, onCommit: () => void): Control {
  const root = el('div', 'param');
  const head = el('div', 'param-head');
  const { button, text } = helpLine(param.help);
  const options = (d: Design): Array<[string | number, string]> => (typeof param.options === 'function' ? param.options(d) : param.options);

  if (param.select) {
    const id = `param-${param.key}`;
    const label = el('label', 'param-label', param.label);
    label.htmlFor = id;
    head.append(label, button);
    const select = el('select', 'param-select');
    select.id = id;
    let signature = '';
    select.addEventListener('change', () => {
      const raw = select.value;
      const asNumber = Number(raw);
      onChange({ [param.key]: raw !== '' && Number.isFinite(asNumber) ? asNumber : raw } as DesignPatch);
      onCommit();
    });
    root.append(head, select, text);
    return {
      param,
      root,
      sync(d) {
        const list = options(d);
        const next = list.map(([v]) => v).join('|');
        if (next !== signature) {
          select.replaceChildren(
            ...list.map(([value, name]) => {
              const option = el('option', undefined, name);
              option.value = String(value);
              return option;
            }),
          );
          signature = next;
        }
        select.value = String(d[param.key] ?? param.shown?.(d));
      },
    };
  }

  const label = el('span', 'param-label', param.label);
  head.append(label, button);
  const group = el('div', 'segmented param-segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', param.label);
  let signature = '';
  root.append(head, group, text);
  return {
    param,
    root,
    sync(d) {
      const list = options(d);
      const next = list.map(([v]) => v).join('|');
      if (next !== signature) {
        group.replaceChildren(
          ...list.map(([value, name]) => {
            const b = el('button', undefined, name);
            b.type = 'button';
            b.dataset.v = String(value);
            b.addEventListener('click', () => {
              onChange({ [param.key]: value } as DesignPatch);
              onCommit();
            });
            return b;
          }),
        );
        signature = next;
      }
      group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(d[param.key] ?? param.shown?.(d)))));
    },
  };
}

function toggleControl(param: ToggleParam, onChange: (patch: DesignPatch) => void, onCommit: () => void): Control {
  const root = el('div', 'param');
  const head = el('div', 'param-head');
  const wrap = el('label', 'check param-check');
  const input = el('input');
  input.type = 'checkbox';
  wrap.append(input, document.createTextNode(param.label));
  const { button, text } = helpLine(param.help);
  head.append(wrap, button);
  root.append(head, text);
  input.addEventListener('change', () => {
    onChange({ [param.key]: input.checked } as DesignPatch);
    onCommit();
  });
  return {
    param,
    root,
    sync(d) {
      input.checked = d[param.key] ?? param.shown?.(d) ?? false;
    },
  };
}

function colorControl(param: ColorParam, onChange: (patch: DesignPatch) => void, onCommit: () => void): Control {
  const root = el('div', 'param');
  const head = el('div', 'param-head');
  const id = `param-${param.key}`;
  const label = el('label', 'param-label', param.label);
  label.htmlFor = id;
  const { button, text } = helpLine(param.help);
  const input = el('input', 'param-color');
  input.type = 'color';
  input.id = id;
  head.append(label, button, input);
  root.append(head, text);
  input.addEventListener('input', () => onChange({ [param.key]: input.value } as DesignPatch));
  input.addEventListener('change', onCommit);
  return {
    param,
    root,
    sync(d) {
      input.value = param.shown(d);
    },
  };
}

/** Each primary on its own: length, the collector it joins, and where that collector sits in the stereo picture. */
class PipesWidget {
  readonly root = el('div', 'pipes-widget');
  private readonly sketch = el('div', 'exhaust-widget');
  private readonly toggle = el('input');
  private readonly toggleRow = el('label', 'check param-check');
  private readonly rows = el('div', 'crank-rows');
  private readonly pans = el('div', 'crank-rows');
  private rowCount = -1;
  private panCount = -1;
  private latest: Design | null = null;
  private readonly onChange: (patch: DesignPatch) => void;
  private readonly onCommit: () => void;

  constructor(onChange: (patch: DesignPatch) => void, onCommit: () => void) {
    this.onChange = onChange;
    this.onCommit = onCommit;
    this.toggle.type = 'checkbox';
    this.toggleRow.append(this.toggle, document.createTextNode(t('Налаштувати кожну трубу окремо')));
    this.toggle.addEventListener('change', () => this.setCustom(this.toggle.checked));
    this.root.append(this.sketch, this.toggleRow, this.rows, this.pans);
  }

  private setCustom(on: boolean): void {
    const d = this.latest;
    if (!d) return;
    if (!on) {
      this.onChange({ headerLengths: null, collectorOf: null, pans: null });
    } else {
      this.onChange({ headerLengths: this.lengthsOf(d), collectorOf: this.collectorsOf(d) });
    }
    this.onCommit();
  }

  private lengthsOf(d: Design): number[] {
    return d.headerLengths ?? Array.from({ length: d.cylinders }, () => d.headerLength);
  }

  private collectorsOf(d: Design): number[] {
    if (d.collectorOf) return d.collectorOf;
    const groups = exhaustGroups(d);
    return Array.from({ length: d.cylinders }, (_, i) => groups.findIndex((g) => g.includes(i + 1)));
  }

  private patchRow(index: number, length?: number, group?: number): void {
    const d = this.latest;
    if (!d) return;
    const headerLengths = this.lengthsOf(d).map((v, i) => (i === index && length !== undefined ? length : v));
    const collectorOf = this.collectorsOf(d).map((v, i) => (i === index && group !== undefined ? group : v));
    this.onChange({ headerLengths, collectorOf, pans: group !== undefined ? null : d.pans });
  }

  private makeRow(index: number): HTMLElement {
    const row = el('div', 'pipe-row');
    const name = el('span', 'crank-name', `${index + 1}`);
    const slider = el('input');
    slider.type = 'range';
    slider.min = '100';
    slider.max = '1600';
    slider.step = '10';
    slider.setAttribute('aria-label', t('Довжина первинної труби циліндра {n}', { n: index + 1 }));
    const value = el('span', 'crank-value');
    const select = el('select', 'param-select pipe-group');
    select.setAttribute('aria-label', t('Збірник циліндра {n}', { n: index + 1 }));
    for (const g of [0, 1, 2, 3]) {
      const option = el('option', undefined, t('Збірник {n}', { n: g + 1 }));
      option.value = String(g);
      select.append(option);
    }
    slider.addEventListener('input', () => this.patchRow(index, Number(slider.value)));
    slider.addEventListener('change', this.onCommit);
    select.addEventListener('change', () => {
      this.patchRow(index, undefined, Number(select.value));
      this.onCommit();
    });
    row.append(name, slider, value, select);
    return row;
  }

  private makePan(index: number): HTMLElement {
    const row = el('label', 'pan-row');
    row.append(el('span', 'crank-name', t('Збірник {n}: зліва чи справа', { n: index + 1 })));
    const slider = el('input');
    slider.type = 'range';
    slider.min = '-1';
    slider.max = '1';
    slider.step = '0.05';
    slider.addEventListener('input', () => {
      const d = this.latest;
      if (!d) return;
      const groups = exhaustGroups(d).length;
      const current = d.pans ?? Array.from({ length: groups }, (_, i) => -0.55 + (1.1 * i) / (groups - 1));
      this.onChange({ pans: current.map((v, i) => (i === index ? Number(slider.value) : v)) });
    });
    slider.addEventListener('change', this.onCommit);
    row.append(slider);
    return row;
  }

  sync(d: Design): void {
    this.latest = d;
    this.sketch.innerHTML = exhaustSketch(d);
    const rotary = isRotary(d);
    this.toggleRow.hidden = rotary;
    // A real engine may set only one of the two, like a single collector with pipes of different lengths.
    const custom = !rotary && (d.headerLengths !== null || d.collectorOf !== null);
    this.toggle.checked = custom;
    this.rows.hidden = !custom;
    if (custom) {
      if (this.rowCount !== d.cylinders) {
        this.rows.replaceChildren(...this.lengthsOf(d).map((_, i) => this.makeRow(i)));
        this.rowCount = d.cylinders;
      }
      const collectors = this.collectorsOf(d);
      this.lengthsOf(d).forEach((mm, i) => {
        const row = this.rows.children[i] as HTMLElement;
        const slider = row.querySelector<HTMLInputElement>('input')!;
        if (document.activeElement !== slider) slider.value = String(mm);
        row.querySelector('.crank-value')!.textContent = `${Math.round(mm)}`;
        row.querySelector('select')!.value = String(collectors[i]);
      });
    }
    const groups = rotary ? 1 : exhaustGroups(d).length;
    this.pans.hidden = groups < 2;
    if (groups >= 2) {
      if (this.panCount !== groups) {
        this.pans.replaceChildren(...Array.from({ length: groups }, (_, i) => this.makePan(i)));
        this.panCount = groups;
      }
      const current = d.pans ?? Array.from({ length: groups }, (_, i) => -0.55 + (1.1 * i) / (groups - 1));
      current.forEach((pan, i) => {
        const slider = this.pans.children[i]!.querySelector<HTMLInputElement>('input')!;
        if (document.activeElement !== slider) slider.value = String(pan);
      });
    }
  }
}

/** The rev range as what the parts can take: where it's fine, where it wears, where it breaks. */
class RevsWidget {
  readonly root = el('div', 'revs-widget');
  private readonly bar = el('div', 'revs-bar');
  private readonly safe = el('i', 'revs-safe');
  private readonly wear = el('i', 'revs-wear');
  private readonly broken = el('i', 'revs-broken');
  private readonly cut = el('b', 'revs-cut');
  private readonly text = el('p', 'revs-text');
  private readonly button = el('button', 'btn', t('Поставити безпечну відсічку'));
  private safeRpm = 0;

  constructor(onChange: (patch: DesignPatch) => void, onCommit: () => void) {
    this.bar.append(this.safe, this.wear, this.broken, this.cut);
    this.button.type = 'button';
    this.button.addEventListener('click', () => {
      onChange({ rpmLimit: Math.floor(this.safeRpm / 100) * 100 });
      onCommit();
    });
    this.root.append(this.bar, this.text, this.button);
  }

  sync(d: Design, rel: Reliability): void {
    const words = (v: number): string => (Math.round(v / 50) * 50).toLocaleString(numberLocale);
    const top = Math.max(d.rpmLimit, rel.failureRpm, rel.safeRpm) * 1.08;
    const share = (v: number): string => `${(Math.min(v, top) / top) * 100}%`;
    const safeEnd = Math.min(rel.safeRpm, rel.failureRpm);
    this.safe.style.width = share(safeEnd);
    this.wear.style.width = `${((rel.failureRpm - safeEnd) / top) * 100}%`;
    this.broken.style.width = `${((top - rel.failureRpm) / top) * 100}%`;
    this.cut.style.left = share(d.rpmLimit);
    this.safeRpm = safeEnd;
    const where = d.rpmLimit > rel.failureRpm ? t('Відсічка стоїть там, де двигун уже зруйнується.') : d.rpmLimit > safeEnd ? t('Відсічка стоїть у зоні зносу.') : t('Відсічка в безпечній зоні.');
    this.text.textContent = t('Безпечно до {safe}, знос до {failure}, далі руйнування. {where}', { safe: words(safeEnd), failure: words(rel.failureRpm), where });
    this.button.hidden = d.rpmLimit <= safeEnd;
  }
}

/** End-on view of the crank plus a row per cylinder for free editing. */
class CrankWidget {
  readonly root = el('div', 'crank-widget');
  private readonly svg: SVGSVGElement;
  private readonly firing = el('dl', 'readouts');
  private readonly rows = el('div', 'crank-rows');
  private readonly onChange: (patch: DesignPatch) => void;
  private readonly onCommit: () => void;
  private rowCount = -1;

  constructor(onChange: (patch: DesignPatch) => void, onCommit: () => void) {
    this.onChange = onChange;
    this.onCommit = onCommit;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '-60 -60 120 120');
    this.svg.setAttribute('class', 'crank-svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', t('Кути шатунних шийок, якщо дивитись на вал спереду'));
    const top = el('div', 'crank-top');
    top.append(this.svg, this.firing);
    this.root.append(top, this.rows);
  }

  sync(d: Design): void {
    this.drawCrank(d);
    this.fillFiring(d);
    this.syncRows(d);
  }

  private drawCrank(d: Design): void {
    const parts = ['<circle cx="0" cy="0" r="9" class="crank-main"/>'];
    for (const t of d.throws) {
      const a = (t.pin * Math.PI) / 180;
      const x = Math.sin(a) * 42;
      const y = -Math.cos(a) * 42;
      parts.push(`<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="crank-arm"/>`);
    }
    // Label each distinct pin once, with the cylinders on it.
    const byAngle = new Map<number, number[]>();
    d.throws.forEach((t, i) => {
      const key = Math.round(t.pin);
      byAngle.set(key, [...(byAngle.get(key) ?? []), i + 1]);
    });
    for (const [angle, list] of byAngle) {
      const a = (angle * Math.PI) / 180;
      const x = Math.sin(a) * 42;
      const y = -Math.cos(a) * 42;
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" class="crank-pin"/>`);
      parts.push(`<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" class="crank-label">${list.length > 2 ? `${list.length}×` : list.join(',')}</text>`);
    }
    this.svg.innerHTML = parts.join('');
  }

  private fillFiring(d: Design): void {
    const plan = firingFromCrank(d, d.throws);
    const distinct = [...new Set(plan.intervals.map((v) => Math.round(v)))];
    const gaps = distinct.length === 1 ? `${distinct[0]}°` : plan.intervals.map((v) => Math.round(v)).join(', ') + '°';
    const row = (name: string, value: string): string => `<div><dt>${name}</dt><dd>${value}</dd></div>`;
    this.firing.innerHTML = row(t('Порядок запалювання'), plan.order.join('-')) + row(t('Проміжки'), gaps);
  }

  private syncRows(d: Design): void {
    const custom = d.crankPreset === 'custom';
    this.rows.hidden = !custom;
    if (!custom) return;
    if (this.rowCount !== d.cylinders) {
      this.rows.replaceChildren(...d.throws.map((_, i) => this.makeRow(i)));
      this.rowCount = d.cylinders;
    }
    d.throws.forEach((crankThrow, i) => {
      const row = this.rows.children[i] as HTMLElement;
      const slider = row.querySelector<HTMLInputElement>('input[type=range]')!;
      if (document.activeElement !== slider) slider.value = String(crankThrow.pin);
      row.querySelector('.crank-value')!.textContent = `${Math.round(crankThrow.pin)}°`;
      row.querySelector('.crank-tdc')!.textContent = `${Math.round(((axisAngle(d, i + 1) - crankThrow.pin) % 360 + 360) % 360) + (crankThrow.turn ? 360 : 0)}°`;
      row.querySelector('button')!.textContent = crankThrow.turn ? t('другий') : t('перший');
      row.querySelector('button')!.setAttribute('aria-pressed', String(crankThrow.turn === 1));
    });
    this.latest = d;
  }

  private latest: Design | null = null;

  private patch(index: number, change: Partial<CrankThrow>): void {
    const d = this.latest;
    if (!d) return;
    const throws = d.throws.map((t, i) => (i === index ? { ...t, ...change } : t));
    this.onChange({ throws, crankPreset: 'custom' });
  }

  private makeRow(index: number): HTMLElement {
    const row = el('div', 'crank-row');
    const name = el('span', 'crank-name', `${index + 1}`);
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '355';
    slider.step = '5';
    slider.setAttribute('aria-label', t('Кут шийки циліндра {n}', { n: index + 1 }));
    const value = el('span', 'crank-value');
    const tdc = el('span', 'crank-tdc');
    tdc.title = t('Кут вала, на якому цей циліндр спалахує');
    const turn = el('button', 'btn crank-turn');
    turn.type = 'button';
    turn.title = t('У якому з двох обертів циклу спалахує циліндр');
    slider.addEventListener('input', () => this.patch(index, { pin: Number(slider.value) }));
    slider.addEventListener('change', this.onCommit);
    turn.addEventListener('click', () => {
      const current = this.latest?.throws[index]?.turn ?? 0;
      this.patch(index, { turn: current ? 0 : 1 });
      this.onCommit();
    });
    row.append(name, slider, value, tdc, turn);
    return row;
  }
}

/** Plain to-scale drawing of the exhaust, because seeing it explains its numbers. */
function exhaustSketch(d: Design): string {
  const w = 340;
  const h = 58;
  const total = d.headerLength + d.pipeLength + 300;
  const scale = (w - 30) / total;
  const headerW = d.headerLength * scale;
  const pipeW = d.pipeLength * scale;
  const thick = (mm: number): number => Math.max(2, Math.min(18, mm * 0.2));
  const y = h / 2;
  const headers = Math.min(4, isRotary(d) ? d.cylinders : Math.max(1, Math.ceil(d.cylinders / (d.collector === 'bybank' ? 2 : 1))));
  const lines: string[] = [];
  for (let i = 0; i < headers; i++) {
    const offset = headers === 1 ? 0 : (i / (headers - 1) - 0.5) * 34;
    const spread = 1 + d.headerSpread * ((i % 2) * 2 - 1) * 0.4;
    lines.push(`<path d="M 6 ${(y + offset).toFixed(1)} C ${(headerW * 0.5 * spread + 6).toFixed(1)} ${(y + offset).toFixed(1)}, ${(headerW * 0.7).toFixed(1)} ${y}, ${(headerW + 8).toFixed(1)} ${y}" class="sketch-pipe" stroke-width="${thick(d.headerDia).toFixed(1)}"/>`);
  }
  const pipeStart = headerW + 8;
  const catX = pipeStart + pipeW * 0.18;
  const mufflerW = { road: 58, sport: 36, open: 0 }[d.muffler];
  const mufflerX = pipeStart + pipeW - mufflerW - 2;
  const pipeEnd = pipeStart + pipeW;
  const tail = `<line x1="${pipeStart.toFixed(1)}" y1="${y}" x2="${pipeEnd.toFixed(1)}" y2="${y}" class="sketch-pipe" stroke-width="${thick(d.pipeDia).toFixed(1)}"/>`;
  const cat = d.catalyst ? `<rect x="${catX.toFixed(1)}" y="${y - 11}" width="26" height="22" rx="3" class="sketch-box"/>` : '';
  const muffler = mufflerW ? `<rect x="${mufflerX.toFixed(1)}" y="${y - 14}" width="${mufflerW}" height="28" rx="4" class="sketch-box"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" class="exhaust-sketch" role="img" aria-label="${t('Схема вихлопної системи в масштабі')}">${lines.join('')}${tail}${cat}${muffler}</svg>`;
}

export class DesignerControls {
  readonly root = el('div', 'designer-controls');
  private readonly groups: Array<{ group: ParamGroup; node: HTMLDetailsElement; controls: Control[]; readouts: HTMLElement; widget: CrankWidget | PipesWidget | RevsWidget | null }> = [];
  private effectsNode: HTMLElement | null = null;

  constructor(onChange: (patch: DesignPatch) => void, onCommit: () => void) {
    for (const group of PARAM_GROUPS) {
      const node = el('details', 'param-group');
      node.open = ['layout', 'cylinder', 'revs', 'rotor', 'charger'].includes(group.id);
      const summary = el('summary', undefined, group.title);
      node.append(summary, el('p', 'group-intro', group.intro));
      const controls = group.params.map((param) => {
        const control =
          param.kind === 'number'
            ? numberControl(param, onChange, onCommit)
            : param.kind === 'choice'
              ? choiceControl(param, onChange, onCommit)
              : param.kind === 'color'
                ? colorControl(param, onChange, onCommit)
                : toggleControl(param, onChange, onCommit);
        node.append(control.root);
        return control;
      });
      const widget = group.widget === 'crank' ? new CrankWidget(onChange, onCommit) : group.widget === 'pipes' ? new PipesWidget(onChange, onCommit) : group.widget === 'revs' ? new RevsWidget(onChange, onCommit) : null;
      if (widget) node.append(widget.root);
      const readouts = el('dl', 'readouts');
      node.append(readouts);
      this.root.append(node);
      this.groups.push({ group, node, controls, readouts, widget });
    }
  }

  /** Brings every control in line with the design. Cheap enough for every input event. */
  sync(d: Design, perf: Performance, rel: Reliability): void {
    for (const { group, node, controls, readouts, widget } of this.groups) {
      const on = group.applies ? group.applies(d) : true;
      node.hidden = !on;
      if (!on) continue;
      for (const control of controls) {
        const applies = control.param.applies ? control.param.applies(d) : true;
        control.root.hidden = !applies;
        if (applies) control.sync(d);
      }
      if (widget instanceof CrankWidget) {
        if (!isRotary(d)) widget.sync(d);
      } else if (widget instanceof RevsWidget) {
        widget.sync(d, rel);
      } else if (widget) {
        widget.sync(d);
      }
      const rows = group.readouts ? group.readouts(d, perf) : [];
      readouts.hidden = rows.length === 0;
      readouts.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    }
  }

  /** The control a design field belongs to. Tables report through the control that heads them. */
  private controlFor(key: string): Control | null {
    const owner: Record<string, string> = { throws: 'crankPreset', headerLengths: 'collector', collectorOf: 'collector', pans: 'collector' };
    const wanted = owner[key] ?? key;
    for (const { controls } of this.groups) {
      const found = controls.find((c) => c.param.key === wanted);
      if (found) return found;
    }
    return null;
  }

  /** Shows under a control what its last change did, in numbers from the model. */
  showEffects(key: string, effects: Effect[]): void {
    const control = this.controlFor(key);
    if (!control) return;
    if (!this.effectsNode) this.effectsNode = el('div', 'param-effects');
    if (this.effectsNode.parentElement !== control.root) control.root.append(this.effectsNode);
    this.effectsNode.innerHTML = effects.length ? effectsHtml(effects) : nothingChanged(control.param);
  }

  clearEffects(): void {
    this.effectsNode?.remove();
  }

  /** Brings a control into view, for when a figure points at its causes. */
  focusParam(key: string): void {
    const control = this.controlFor(key);
    if (!control) return;
    for (const { node, controls } of this.groups) {
      if (controls.includes(control)) node.open = true;
    }
    control.root.scrollIntoView({ block: 'center', behavior: 'smooth' });
    control.root.classList.remove('moved');
    void control.root.offsetWidth;
    control.root.classList.add('moved');
    control.root.querySelector<HTMLElement>('input,select,button:not(.help-button)')?.focus({ preventScroll: true });
  }

  /** Marks controls another change has just moved. */
  flash(keys: NumericKey[]): void {
    for (const key of keys) {
      const input = this.root.querySelector<HTMLElement>(`#param-${key}`);
      const param = input?.closest<HTMLElement>('.param');
      if (!param) continue;
      param.classList.remove('moved');
      void param.offsetWidth;
      param.classList.add('moved');
    }
  }
}
