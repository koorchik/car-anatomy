// The suspension designer's panel (stage P8c): where to start (a real car, a typical or an odd preset, a random one),
// the copy of the link, and the controls in groups, for the car or for one axle at a time. Each control is a slider, a
// row of buttons, a list or a switch; "?" gives its help and what moving it would do to this design (the model run
// twice, previewChassisEffects), and after a change the figures it moved stand under it. Which controls show follows
// the design (controlsFor): a layout brings its own geometry, an own damper its coefficients.

import { t } from '../../i18n/t.ts';
import { paramRange, type NumericKey, type Range } from '../../suspension-designer/constraints.ts';
import { axleControl, controlsFor, type ChassisControl } from '../../suspension-designer/controls.ts';
import type { AxleEnd, ChassisDesign, DesignKey } from '../../suspension-designer/design.ts';
import { CATALOGUE_PRESETS, ODD_PRESETS, TYPICAL_PRESETS } from '../../suspension-designer/presets.ts';
import { previewChassisEffects, controlTries } from '../../suspension-designer/sensitivity.ts';
import { ackermannShown, springRateNm } from '../../suspension-designer/to-spec.ts';
import type { Effect } from '../../shared/sensitivity-core.ts';
import { fmt } from './charts.ts';
import { GROUPS, limitText, optionLabel, PARAMS, type ParamInfo } from './params.ts';

export type PanelTab = 'car' | AxleEnd;

export interface PanelHandlers {
  /** One change of one control. */
  edit(patch: Partial<ChassisDesign>): void;
  preset(id: string): void;
  random(): void;
  reset(): void;
  copy(button: HTMLButtonElement): void;
}

const SLIDER_STEPS = 1000;

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** The bare key of a design key: 'springNmmR' → 'springNmm'; a car key stays. */
const bareOf = (key: DesignKey): string => axleControl(key)?.[1] ?? key;

/** Controls whose 0 sits below their range and means none: the button that sets it. */
const noneLabel = (bare: string): string | null => (bare === 'barMm' ? t('Без стабілізатора') : bare === 'barWallMm' ? t('Суцільний') : null);

const valueOf = (d: ChassisDesign, key: DesignKey): unknown => (d as unknown as Record<string, unknown>)[key];

/** A number as the panel shows it, with its unit: degrees and percent right after the number. */
export function shownText(info: ParamInfo, value: number): string {
  const v = value * (info.scale ?? 1);
  const unit = !info.unit ? '' : /^[°%″]/.test(info.unit) ? info.unit : ` ${info.unit}`;
  return `${fmt(v, info.digits)}${unit}`;
}

/** The number a spring or an Ackermann control shows when the design keeps the typical one (null). */
function effectiveNumber(d: ChassisDesign, control: ChassisControl): number {
  const v = valueOf(d, control.key);
  if (typeof v === 'number') return v;
  if (control.kind === 'auto') return ackermannShown(d);
  const axle = axleControl(control.key);
  return axle ? springRateNm(d, axle[0]) / 1000 : NaN;
}

interface Row {
  key: DesignKey;
  control: ChassisControl;
  info: ParamInfo;
  root: HTMLElement;
  output: HTMLElement | null;
  input: HTMLInputElement | HTMLSelectElement | null;
  segment: HTMLElement | null;
  typical: HTMLButtonElement | null;
  limit: HTMLElement;
  help: HTMLElement;
  effects: HTMLElement;
  range: Range | null;
}

export class ControlsPanel {
  readonly root = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly tabs = document.createElement('div');
  private readonly note = document.createElement('p');
  private readonly presetSelect = document.createElement('select');
  private readonly handlers: PanelHandlers;
  private tab: PanelTab = 'car';
  private rows = new Map<DesignKey, Row>();
  /** Which controls the panel was built for, so a change of layout rebuilds it and a slider does not. */
  private built = '';
  private design: ChassisDesign | null = null;

  constructor(handlers: PanelHandlers) {
    this.handlers = handlers;
    this.root.className = 'panel-scroll sd-panel';
    this.root.id = 'sd-panel';
    this.root.tabIndex = 0;
    this.root.append(this.header(), this.tabs, this.body);
    this.tabs.className = 'segmented sd-tabs';
    this.tabs.setAttribute('role', 'group');
    this.tabs.setAttribute('aria-label', t('Що налаштовувати'));
    for (const [id, label] of [['car', t('Автомобіль')], ['F', t('Передня вісь')], ['R', t('Задня вісь')]] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = id;
      b.textContent = label;
      b.addEventListener('click', () => this.setTab(id));
      this.tabs.append(b);
    }
    this.body.className = 'sd-groups';
    this.markTab();
  }

  private header(): HTMLElement {
    const head = document.createElement('div');
    head.className = 'sd-head';
    const label = document.createElement('label');
    label.className = 'sd-label';
    label.htmlFor = 'sd-preset';
    label.textContent = t('Почати з');
    const select = this.presetSelect;
    select.id = 'sd-preset';
    select.className = 'sd-select';
    const option = (value: string, text: string): HTMLOptionElement => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      return o;
    };
    select.append(option('', t('Обери заготовку')));
    for (const [title, list] of [[t('Справжні авто'), CATALOGUE_PRESETS], [t('Типові'), TYPICAL_PRESETS], [t('Дивні'), ODD_PRESETS]] as const) {
      const group = document.createElement('optgroup');
      group.label = title;
      for (const p of list) group.append(option(p.id, p.name));
      select.append(group);
    }
    select.addEventListener('change', () => {
      if (select.value) this.handlers.preset(select.value);
      select.value = '';
    });
    const actions = document.createElement('div');
    actions.className = 'sd-actions';
    const button = (text: string, act: (b: HTMLButtonElement) => void, id: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.id = id;
      b.textContent = text;
      b.addEventListener('click', () => act(b));
      return b;
    };
    actions.append(
      button(t('Випадкова'), () => this.handlers.random(), 'sd-random'),
      button(t('Скинути'), () => this.handlers.reset(), 'sd-reset'),
      button(t('Копіювати посилання'), (b) => this.handlers.copy(b), 'sd-copy'),
    );
    this.note.className = 'sd-note';
    this.note.id = 'sd-note';
    head.append(label, select, actions, this.note);
    return head;
  }

  /** The line under the buttons: what the design started from. */
  setNote(text: string): void {
    this.note.textContent = text;
    this.note.hidden = !text;
  }

  setTab(tab: PanelTab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.markTab();
    this.built = '';
    if (this.design) this.sync(this.design);
  }

  get currentTab(): PanelTab {
    return this.tab;
  }

  private markTab(): void {
    for (const b of this.tabs.querySelectorAll<HTMLElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.v === this.tab));
  }

  /** The controls of the tab shown that mean something on this design. */
  private shownControls(d: ChassisDesign): ChassisControl[] {
    return controlsFor(d).filter((c) => {
      const axle = axleControl(c.key);
      return this.tab === 'car' ? axle === null && c.key !== 'car' : axle?.[0] === this.tab;
    });
  }

  /** Puts the controls where the design is, building them again when the set of controls changed. */
  sync(d: ChassisDesign): void {
    this.design = d;
    const controls = this.shownControls(d);
    const signature = `${this.tab}|${controls.map((c) => c.key).join(',')}|${controls.map((c) => c.options?.(d).join('/') ?? '').join(',')}`;
    if (signature !== this.built) {
      this.built = signature;
      this.build(d, controls);
    }
    for (const row of this.rows.values()) this.put(row, d);
  }

  private build(d: ChassisDesign, controls: ChassisControl[]): void {
    this.rows.clear();
    this.body.replaceChildren();
    const byBare = new Map(controls.map((c) => [bareOf(c.key), c]));
    for (const group of GROUPS) {
      if ((group.scope === 'car') !== (this.tab === 'car')) continue;
      const inGroup = group.keys.map((k) => byBare.get(k)).filter((c): c is ChassisControl => !!c);
      if (!inGroup.length) continue;
      const section = document.createElement('section');
      section.className = 'sd-group';
      section.dataset.group = group.id;
      const h = document.createElement('h3');
      h.textContent = group.title;
      section.append(h);
      for (const control of inGroup) section.append(this.row(d, control));
      this.body.append(section);
    }
  }

  private row(d: ChassisDesign, control: ChassisControl): HTMLElement {
    const key = control.key;
    const info = PARAMS[bareOf(key) as keyof typeof PARAMS];
    const root = document.createElement('div');
    root.className = 'sd-ctl';
    root.dataset.key = key;
    const id = `sd-${key}`;
    const head = document.createElement('div');
    head.className = 'sd-ctl-head';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = info.label;
    head.append(label);
    let output: HTMLElement | null = null;
    let input: HTMLInputElement | HTMLSelectElement | null = null;
    let segment: HTMLElement | null = null;
    let typical: HTMLButtonElement | null = null;
    let range: Range | null = null;
    if (control.kind === 'number' || control.kind === 'spring' || control.kind === 'auto') {
      const out = document.createElement('output');
      out.htmlFor.add(id);
      output = out;
      head.append(output);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = id;
      range = paramRange(d, key as NumericKey);
      this.setSlider(slider, info, range);
      slider.addEventListener('input', () => {
        const r = this.rows.get(key)?.range ?? range!;
        this.handlers.edit({ [key]: this.fromSlider(slider, info, r) } as Partial<ChassisDesign>);
      });
      input = slider;
      const none = noneLabel(bareOf(key));
      if (control.kind !== 'number' || none) {
        typical = document.createElement('button');
        typical.type = 'button';
        typical.className = 'btn sd-typical';
        typical.textContent = none ?? (control.kind === 'spring' ? t('Типова') : t('Як у шаблоні'));
        const value = none ? 0 : null;
        typical.addEventListener('click', () => this.handlers.edit({ [key]: value } as Partial<ChassisDesign>));
      }
    } else if (control.kind === 'toggle') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = id;
      box.addEventListener('change', () => this.handlers.edit({ [key]: box.checked } as Partial<ChassisDesign>));
      head.prepend(box);
      root.classList.add('sd-toggle');
      input = box;
    } else {
      const options = control.options?.(d) ?? [];
      if (options.length <= 4) {
        segment = document.createElement('div');
        segment.className = 'segmented sd-choice';
        segment.id = id;
        segment.setAttribute('role', 'group');
        segment.setAttribute('aria-label', info.label);
        for (const v of options) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.v = String(v);
          b.textContent = optionLabel(bareOf(key), v);
          b.addEventListener('click', () => this.handlers.edit({ [key]: v } as Partial<ChassisDesign>));
          segment.append(b);
        }
      } else {
        const select = document.createElement('select');
        select.id = id;
        select.className = 'sd-select';
        for (const v of options) {
          const o = document.createElement('option');
          o.value = String(v);
          o.textContent = optionLabel(bareOf(key), v);
          select.append(o);
        }
        select.addEventListener('change', () => this.handlers.edit({ [key]: select.value } as Partial<ChassisDesign>));
        input = select;
      }
    }
    const helpButton = document.createElement('button');
    helpButton.type = 'button';
    helpButton.className = 'sd-help-button';
    helpButton.textContent = '?';
    helpButton.setAttribute('aria-label', t('Що це: {name}', { name: info.label }));
    helpButton.setAttribute('aria-expanded', 'false');
    head.append(helpButton);
    root.append(head);
    if (input && input.type !== 'checkbox') root.append(input);
    if (segment) root.append(segment);
    if (typical) root.append(typical);
    const limit = document.createElement('p');
    limit.className = 'sd-limit';
    limit.hidden = true;
    const help = document.createElement('div');
    help.className = 'sd-help';
    help.hidden = true;
    const effects = document.createElement('ul');
    effects.className = 'sd-effects';
    effects.hidden = true;
    root.append(limit, help, effects);
    helpButton.addEventListener('click', () => {
      const open = help.hidden;
      help.hidden = !open;
      helpButton.setAttribute('aria-expanded', String(open));
      if (open && this.design) help.innerHTML = this.helpHtml(this.design, control, info);
    });
    const row: Row = { key, control, info, root, output, input, segment, typical, limit, help, effects, range };
    this.rows.set(key, row);
    return root;
  }

  /** The help of a control and what its first try would do to this design, from the model. */
  private helpHtml(d: ChassisDesign, control: ChassisControl, info: ParamInfo): string {
    const lines = [`<p>${escapeHtml(info.help)}</p>`];
    const attempt = controlTries(d, control)[0];
    if (attempt) {
      const effects = previewChassisEffects(d, control.key, attempt.value, 4);
      const what =
        control.kind === 'choice'
          ? t('Якщо вибрати «{value}»:', { value: optionLabel(bareOf(control.key), attempt.value as string) })
          : control.kind === 'toggle'
            ? t('Якщо перемкнути:')
            : t('Якщо зробити {value}:', { value: shownText(info, attempt.value as number) });
      lines.push(`<p class="sd-help-what">${escapeHtml(what)}</p>`);
      lines.push(effects.length ? effectsHtml(effects) : `<p class="sd-help-what">${escapeHtml(t('помітних змін немає'))}</p>`);
    }
    return lines.join('');
  }

  private setSlider(slider: HTMLInputElement, info: ParamInfo, range: Range): void {
    if (info.log) {
      slider.min = '0';
      slider.max = String(SLIDER_STEPS);
      slider.step = '1';
      return;
    }
    const scale = info.scale ?? 1;
    slider.min = String(range.min * scale);
    slider.max = String(range.max * scale);
    slider.step = String(info.step);
  }

  private fromSlider(slider: HTMLInputElement, info: ParamInfo, range: Range): number {
    const v = Number(slider.value);
    if (info.log) {
      const lo = Math.max(range.min, 1e-3);
      const value = lo * (range.max / lo) ** (v / SLIDER_STEPS);
      // Two significant figures, as a spring rate is quoted.
      const p = 10 ** (Math.floor(Math.log10(value)) - 1);
      return Math.round(value / p) * p;
    }
    return Math.min(range.max, Math.max(range.min, v / (info.scale ?? 1)));
  }

  private toSlider(info: ParamInfo, range: Range, value: number): number {
    if (info.log) {
      const lo = Math.max(range.min, 1e-3);
      return Math.round((Math.log(Math.max(lo, value) / lo) / Math.log(range.max / lo)) * SLIDER_STEPS);
    }
    return value * (info.scale ?? 1);
  }

  private put(row: Row, d: ChassisDesign): void {
    const { control, info, key } = row;
    const raw = valueOf(d, key);
    if (row.input && row.range !== null && row.input instanceof HTMLInputElement && row.input.type === 'range') {
      const range = paramRange(d, key as NumericKey);
      if (range.min !== row.range.min || range.max !== row.range.max) {
        row.range = range;
        this.setSlider(row.input, info, range);
      }
      const value = effectiveNumber(d, control);
      // A slider being dragged keeps the visitor's own position; setting it again would snap it to the step.
      if (document.activeElement !== row.input) row.input.value = String(this.toSlider(info, range, value));
      const kept = raw === null;
      const suffix = kept ? ` · ${control.kind === 'spring' ? t('типова') : t('як у шаблоні')}` : '';
      // A bar below its range means none, a tube wall below its range a solid bar.
      const none = typeof raw === 'number' && raw < range.min && (key.startsWith('barMm') || key.startsWith('barWallMm'));
      row.output!.textContent = none ? (key.startsWith('barMm') ? t('немає') : t('суцільний')) : `${shownText(info, value)}${suffix}`;
      if (row.typical) row.typical.hidden = noneLabel(bareOf(key)) ? none : kept;
      const at = !none && typeof value === 'number' ? (value <= range.min + 1e-9 ? range.minWhy : value >= range.max - 1e-9 ? range.maxWhy : undefined) : undefined;
      row.limit.hidden = !at;
      if (at) row.limit.textContent = t('Межа: {why}', { why: limitText(at) });
    } else if (row.input instanceof HTMLInputElement && row.input.type === 'checkbox') {
      row.input.checked = raw === true;
    } else if (row.input instanceof HTMLSelectElement) {
      if (document.activeElement !== row.input) row.input.value = String(raw);
    } else if (row.segment) {
      for (const b of row.segment.querySelectorAll<HTMLElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(raw)));
    }
  }

  /** The figures one change moved, under its control. */
  showEffects(key: DesignKey, effects: Effect[]): void {
    for (const row of this.rows.values()) if (row.key !== key) row.effects.hidden = true;
    const row = this.rows.get(key);
    if (!row) return;
    row.effects.hidden = false;
    row.effects.innerHTML = effects.length ? effectsHtml(effects, false) : `<li class="sd-none">${escapeHtml(t('Цифри моделі майже не змінились.'))}</li>`;
  }

  clearEffects(): void {
    for (const row of this.rows.values()) row.effects.hidden = true;
  }

  /** Marks controls the design moved by itself to keep within its limits. */
  flash(keys: readonly string[]): void {
    for (const k of keys) {
      const row = this.rows.get(k as DesignKey);
      if (!row) continue;
      row.root.classList.remove('sd-moved');
      void row.root.offsetWidth;
      row.root.classList.add('sd-moved');
    }
  }
}

/** A list of effects: the figure and how it changed. */
export function effectsHtml(effects: readonly Effect[], wrap = true): string {
  const items = effects.map((e) => `<li><span>${escapeHtml(e.name)}</span> <b>${escapeHtml(e.text)}</b></li>`).join('');
  return wrap ? `<ul class="sd-effects">${items}</ul>` : items;
}
