// The site's keys (KeyMap in section.ts). Each context binds a key once; the section says which of its contexts
// listen, and the shell's own come last. The help «?» lists what listens now (key-help.ts).

import { t } from '../i18n/t.ts';
import type { ViewMode } from '../scene/model-types.ts';
import type { KeyBinding, KeyMap, KeyReach } from './section.ts';

/** The shell's own context: keys that mean the same on every page. */
export const SHELL_KEYS = 'shell';

/** The order V goes through the views. */
const VIEWS: readonly ViewMode[] = ['solid', 'xray', 'mechanism'];

/** What the shell's keys do; the shell wires them to its overlays and the view. */
export interface ShellKeyActions {
  /** Closes what is on top: the help, the sheet, the table, the part's card. */
  close(): void;
  view(mode: ViewMode): void;
  /** The view chosen now, for V to go on from. */
  currentView(): ViewMode;
  help(): void;
}

/**
 * The keys of every page. The first view's key comes first: its label is the section's name for the model whole
 * (Section.solidLabel), which the shell sets on it when another section shows.
 */
export function shellBindings(actions: ShellKeyActions): KeyBinding[] {
  return [
    { codes: ['Digit1'], label: t('Двигун'), down: () => actions.view('solid') },
    { codes: ['Escape'], label: t('Закрити'), reach: 'always', down: () => actions.close() },
    { codes: ['Digit2'], label: t('Рентген'), down: () => actions.view('xray') },
    { codes: ['Digit3'], label: t('Механізм'), down: () => actions.view('mechanism') },
    { codes: ['KeyV'], label: t('Наступний вигляд'), down: () => actions.view(VIEWS[(VIEWS.indexOf(actions.currentView()) + 1) % VIEWS.length]!) },
    { codes: ['Slash'], label: t('Усі клавіші'), down: () => actions.help() },
  ];
}

type Focus = 'page' | 'control' | 'text';

/** Text fields keep every key; sliders and checkboxes keep the arrows and digits but let the gas on Space through. */
function focusOf(target: EventTarget | null): Focus {
  const el = target as HTMLInputElement | null;
  if (!el || !el.tagName) return 'page';
  if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return 'text';
  if (el.tagName !== 'INPUT') return 'page';
  return el.type === 'range' || el.type === 'checkbox' ? 'control' : 'text';
}

/**
 * The code a binding answers to. '?' is matched by what it types, not by where it sits: it is Shift+/ on an English
 * layout but Shift+7 on the Ukrainian one, where the code alone would toggle the air layer instead of the help.
 */
function codeOf(event: KeyboardEvent): string {
  return event.key === '?' ? 'Slash' : event.code;
}

function reaches(reach: KeyReach, focus: Focus, blocked: boolean): boolean {
  if (reach === 'always') return true;
  if (blocked) return false;
  return focus === 'page' || (focus === 'control' && reach === 'controls');
}

export class ShellKeys implements KeyMap {
  private readonly contexts = new Map<string, KeyBinding[]>();
  private active: readonly string[] = [];
  /** True while an overlay such as the table is open: only keys that reach 'always' work. */
  private readonly blocked: () => boolean;

  /** Listens on `target`, the window. */
  constructor(target: EventTarget, blocked: () => boolean) {
    this.blocked = blocked;
    target.addEventListener('keydown', (event) => this.down(event as KeyboardEvent));
    target.addEventListener('keyup', (event) => this.up(event as KeyboardEvent));
  }

  bind(context: string, bindings: readonly KeyBinding[]): () => void {
    const list = this.contexts.get(context) ?? [];
    for (const binding of bindings) {
      for (const code of binding.codes) {
        if (list.some((b) => b.codes.includes(code))) throw new Error(`Key ${code} is bound twice in ${context}`);
      }
      list.push(binding);
    }
    this.contexts.set(context, list);
    return () => this.contexts.set(context, (this.contexts.get(context) ?? []).filter((b) => !bindings.includes(b)));
  }

  use(contexts: readonly string[]): void {
    this.active = [...contexts];
  }

  bindings(): ReadonlyArray<{ context: string; binding: KeyBinding }> {
    return [...this.contexts].flatMap(([context, list]) => list.map((binding) => ({ context, binding })));
  }

  /** The contexts that listen now, in the order a key is offered to them: the section's, then the shell's. */
  get stack(): readonly string[] {
    return [...this.active.filter((c) => c !== SHELL_KEYS), SHELL_KEYS];
  }

  /** The bindings of one context, in the order they were bound. */
  of(context: string): readonly KeyBinding[] {
    return this.contexts.get(context) ?? [];
  }

  /** The bindings that listen now, in the order they are asked. */
  private listening(): KeyBinding[] {
    return this.stack.flatMap((context) => this.of(context));
  }

  private down(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const focus = focusOf(event.target);
    const blocked = this.blocked();
    const code = codeOf(event);
    for (const binding of this.listening()) {
      if (!binding.codes.includes(code) || !reaches(binding.reach ?? 'page', focus, blocked)) continue;
      if (binding.down(event) !== false) return;
    }
  }

  private up(event: KeyboardEvent): void {
    const code = codeOf(event);
    for (const binding of this.listening()) {
      if (binding.up && binding.codes.includes(code)) binding.up(event);
    }
  }
}
