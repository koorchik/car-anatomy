// The gearbox designer's parameter panel, in the engine designer's style (src/ui/designer/controls.ts): a group per
// part, a slider and a field for each number, buttons or a list for each choice, and the table of the gears with
// their teeth and a field for each ratio. It only reports what the visitor asked for; limits are the model's
// (paramRange, resolveGearboxDesign) and consequences are computed (sensitivity.ts).

import { paramRange } from '../../gearbox-designer/constraints.ts';
import { CONTROL_GROUPS, gearboxControls, type ChoiceControl, type ControlGroup, type GearboxControl, type NumberControl } from '../../gearbox-designer/controls.ts';
import type { GearboxDesign } from '../../gearbox-designer/design.ts';
import type { GearboxPerformance } from '../../gearbox-designer/evaluate.ts';
import { previewGearboxEffects, type GearboxEffect } from '../../gearbox-designer/sensitivity.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { GROUP_INTRO, HELP, NUMBER_LOOK, OPEN_GROUPS } from './params.ts';

export type GearboxPatch = Partial<GearboxDesign>;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const snap = (value: number, step: number): number => Math.round(value / step) * step;

export const effectsHtml = (effects: GearboxEffect[]): string => effects.map((e) => `<span class="effect"><span>${e.name}</span> <b>${e.text}</b></span>`).join('');

const nothingChanged = (c: GearboxControl): string =>
  c.only === 'drive' ? t('На квазістатичні цифри не впливає: змінює заїзд «Проїхати».') : t('На цій коробці майже нічого не змінилось.');

interface Row {
  control: GearboxControl;
  root: HTMLElement;
  sync(d: GearboxDesign): void;
}

/** «?» with the plain words and, when opened, what moving the control would do to this box. */
function helpLine(help: string | undefined, preview: () => string): { button: HTMLButtonElement; text: HTMLElement } {
  const button = el('button', 'help-button', '?');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', t('Що це'));
  const text = el('div', 'param-help');
  if (help) text.append(el('p', undefined, help));
  const computed = el('div', 'param-preview');
  text.append(computed);
  text.hidden = true;
  button.addEventListener('click', () => {
    text.hidden = !text.hidden;
    button.setAttribute('aria-expanded', String(!text.hidden));
    if (!text.hidden) computed.innerHTML = preview();
  });
  return { button, text };
}

function numberRow(c: NumberControl, onChange: (patch: GearboxPatch, id: string) => void, onCommit: () => void): Row {
  const look = NUMBER_LOOK[c.key];
  const root = el('div', 'param');
  const head = el('div', 'param-head');
  const id = `gparam-${c.id}`;
  const label = el('label', 'param-label', c.label);
  label.htmlFor = id;
  let latest: GearboxDesign | null = null;
  const { button, text } = helpLine(HELP[c.key], () => {
    const d = latest;
    if (!d) return '';
    const range = paramRange(d, c.key);
    const value = d[c.key];
    const step = Math.max(look.step, (range.max - range.min) * 0.1);
    const line = (word: string, to: number): string => {
      const effects = previewGearboxEffects(d, { [c.key]: to });
      return `<p><strong>${word}:</strong> ${effects.length ? effectsHtml(effects) : nothingChanged(c)}</p>`;
    };
    return [value + step <= range.max + 1e-9 ? line(t('Більше'), value + step) : '', value - step >= range.min - 1e-9 ? line(t('Менше'), value - step) : ''].join('');
  });
  const input = el('input', 'param-number');
  input.type = 'number';
  input.id = id;
  input.step = String(look.percent ? 1 : look.step);
  const unit = el('span', 'param-unit', look.unit);
  head.append(label, button, input, unit);
  const slider = el('input', 'param-slider');
  slider.type = 'range';
  slider.setAttribute('aria-label', c.label);
  root.append(head, slider, text);
  const shown = (v: number): number => (look.percent ? v * 100 : v);
  const parse = (v: number): number => (look.percent ? v / 100 : v);
  slider.addEventListener('input', () => onChange({ [c.key]: snap(Number(slider.value), look.step) }, c.id));
  slider.addEventListener('change', onCommit);
  input.addEventListener('change', () => {
    const value = parse(Number(input.value));
    if (input.value.trim() !== '' && Number.isFinite(value)) onChange({ [c.key]: value }, c.id);
    else if (latest) sync(latest);
    onCommit();
  });
  const sync = (d: GearboxDesign): void => {
    latest = d;
    const value = d[c.key];
    const range = paramRange(d, c.key);
    if (document.activeElement !== input) input.value = num(shown(value), look.percent ? Math.max(0, look.digits) : look.digits).replace(/\s/g, '').replace(',', '.');
    input.min = String(shown(range.min));
    input.max = String(shown(range.max));
    slider.min = String(range.min);
    slider.max = String(range.max);
    slider.step = String(look.step);
    slider.disabled = range.max - range.min < 1e-9;
    if (document.activeElement !== slider) slider.value = String(value);
  };
  return { control: c, root, sync };
}

function choiceRow(c: ChoiceControl, at: GearboxDesign, onChange: (patch: GearboxPatch, id: string) => void, onCommit: () => void): Row {
  const root = el('div', 'param');
  const head = el('div', 'param-head');
  let latest: GearboxDesign | null = null;
  const { button, text } = helpLine(HELP[c.key], () => {
    const d = latest;
    if (!d) return '';
    return c
      .options(d)
      .filter(([value]) => value !== c.get(d))
      .slice(0, 4)
      .map(([value, name]) => {
        const effects = previewGearboxEffects(d, c.patch(d, value));
        return `<p><strong>${name}:</strong> ${effects.length ? effectsHtml(effects) : nothingChanged(c)}</p>`;
      })
      .join('');
  });
  const asSelect = ['car', 'engine', 'tyre', 'directGear'].includes(c.key) || c.options(at).length > 4;
  let signature = '';
  const value = (raw: string): string | number => {
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : raw;
  };
  if (asSelect) {
    const id = `gparam-${c.id}`;
    const label = el('label', 'param-label', c.label);
    label.htmlFor = id;
    head.append(label, button);
    const select = el('select', 'param-select');
    select.id = id;
    select.addEventListener('change', () => {
      if (latest) onChange(c.patch(latest, value(select.value)), c.id);
      onCommit();
    });
    root.append(head, select, text);
    return {
      control: c,
      root,
      sync(d) {
        latest = d;
        const list = c.options(d);
        const next = list.map(([v, n]) => `${v}:${n}`).join('|');
        if (next !== signature) {
          select.replaceChildren(
            ...list.map(([v, name]) => {
              const option = el('option', undefined, name);
              option.value = String(v);
              return option;
            }),
          );
          signature = next;
        }
        select.value = String(c.get(d));
      },
    };
  }
  head.append(el('span', 'param-label', c.label), button);
  const group = el('div', 'segmented param-segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', c.label);
  root.append(head, group, text);
  return {
    control: c,
    root,
    sync(d) {
      latest = d;
      const list = c.options(d);
      const next = list.map(([v, n]) => `${v}:${n}`).join('|');
      if (next !== signature) {
        group.replaceChildren(
          ...list.map(([v, name]) => {
            const b = el('button', undefined, name);
            b.type = 'button';
            b.dataset.v = String(v);
            b.addEventListener('click', () => {
              if (latest) onChange(c.patch(latest, v), c.id);
              onCommit();
            });
            return b;
          }),
        );
        signature = next;
      }
      const now = String(c.get(d));
      group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === now)));
    },
  };
}

/** The gears with their teeth: a field for every ratio, empty to hand it back to the ladder. */
class GearTable {
  readonly root = el('div', 'gbd-gears');
  private count = -1;
  private readonly onChange: (patch: GearboxPatch, id: string) => void;
  private readonly onCommit: () => void;
  private latest: GearboxDesign | null = null;

  constructor(onChange: (patch: GearboxPatch, id: string) => void, onCommit: () => void) {
    this.onChange = onChange;
    this.onCommit = onCommit;
  }

  private build(n: number): void {
    const head = `<div class="gbd-gear gbd-gear-head"><span>${t('Пер.')}</span><span>${t('Зубці')}</span><span>${t('Число')}</span></div>`;
    this.root.innerHTML = `<p class="note small">${t('Число кожної передачі можна задати вручну; порожнє поле повертає його до прогресії.')}</p>${head}${Array.from(
      { length: n },
      (_, i) =>
        `<div class="gbd-gear" data-gear="${i}"><b>${i + 1}</b><span class="gbd-teeth"></span><input type="number" class="param-number" step="0.001" min="0.3" max="8" aria-label="${t('Число {n}-ї передачі', { n: i + 1 })}" /></div>`,
    ).join('')}`;
    this.root.querySelectorAll<HTMLInputElement>('input').forEach((input, i) => {
      input.addEventListener('change', () => {
        const d = this.latest;
        if (!d) return;
        const raw = input.value.trim();
        const value = raw === '' ? null : Number(raw.replace(',', '.'));
        if (value !== null && !Number.isFinite(value)) return;
        this.onChange({ ratios: d.ratios.map((r, k) => (k === i ? value : r)) }, 'ratios');
        this.onCommit();
      });
    });
    this.count = n;
  }

  sync(d: GearboxDesign, perf: GearboxPerformance): void {
    this.latest = d;
    if (this.count !== d.gears) this.build(d.gears);
    perf.gears.forEach((g, i) => {
      const row = this.root.querySelector<HTMLElement>(`[data-gear="${i}"]`);
      if (!row) return;
      row.querySelector('.gbd-teeth')!.textContent = g.pair ? `${g.pair.teeth[0]} → ${g.pair.teeth[1]}` : t('пряма');
      const input = row.querySelector<HTMLInputElement>('input')!;
      if (document.activeElement !== input) input.value = g.ratio.toFixed(3);
      input.disabled = g.pair === null;
      row.classList.toggle('gbd-hand', d.ratios[i] !== null || d.pairs[i] !== null);
    });
  }
}

export class GearboxControlsPanel {
  readonly root = el('div', 'designer-controls gbd-controls');
  private readonly groups = new Map<ControlGroup, { node: HTMLDetailsElement; body: HTMLElement; rows: Row[]; signature: string }>();
  private readonly gearTable: GearTable;
  private effectsNode: HTMLElement | null = null;
  private readonly onChange: (patch: GearboxPatch, id: string) => void;
  private readonly onCommit: () => void;

  constructor(onChange: (patch: GearboxPatch, id: string) => void, onCommit: () => void) {
    this.onChange = onChange;
    this.onCommit = onCommit;
    this.gearTable = new GearTable(onChange, onCommit);
    for (const g of CONTROL_GROUPS) {
      const node = el('details', 'param-group');
      node.open = OPEN_GROUPS.has(g.id);
      node.dataset.group = g.id;
      node.append(el('summary', undefined, g.label), el('p', 'group-intro', GROUP_INTRO[g.id]));
      const body = el('div');
      node.append(body);
      if (g.id === 'ratios') node.append(this.gearTable.root);
      this.root.append(node);
      this.groups.set(g.id, { node, body, rows: [], signature: '' });
    }
  }

  /** Brings every control in line with the design; rebuilds a group only when its set of controls changed. */
  sync(d: GearboxDesign, perf: GearboxPerformance): void {
    const controls = gearboxControls(d);
    for (const [id, group] of this.groups) {
      const mine = controls.filter((c) => c.group === id);
      const signature = mine.map((c) => c.id).join('|');
      if (signature !== group.signature) {
        group.rows = mine.map((c) => (c.kind === 'number' ? numberRow(c, this.onChange, this.onCommit) : choiceRow(c, d, this.onChange, this.onCommit)));
        group.body.replaceChildren(...group.rows.map((r) => r.root));
        group.signature = signature;
        this.effectsNode?.remove();
      }
      for (const row of group.rows) row.sync(d);
    }
    this.gearTable.sync(d, perf);
  }

  /** Shows under a control what its last change did, in numbers from the model. */
  showEffects(id: string, effects: GearboxEffect[]): void {
    const row = this.rowFor(id);
    const host = row?.root ?? (id === 'ratios' ? this.gearTable.root : null);
    if (!host) return;
    this.effectsNode ??= el('div', 'param-effects');
    if (this.effectsNode.parentElement !== host) host.append(this.effectsNode);
    this.effectsNode.innerHTML = effects.length ? effectsHtml(effects) : row ? nothingChanged(row.control) : t('На цій коробці майже нічого не змінилось.');
  }

  clearEffects(): void {
    this.effectsNode?.remove();
  }

  private rowFor(id: string): Row | null {
    for (const group of this.groups.values()) {
      const row = group.rows.find((r) => r.control.id === id);
      if (row) return row;
    }
    return null;
  }

  /** Brings a control into view, for a figure that points at its causes. */
  focus(id: string): void {
    const row = this.rowFor(id);
    if (!row) return;
    this.groups.get(row.control.group)!.node.open = true;
    row.root.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.root.classList.remove('moved');
    void row.root.offsetWidth;
    row.root.classList.add('moved');
  }
}
