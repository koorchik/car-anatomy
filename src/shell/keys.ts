// The site's keys (KeyMap in section.ts). Each context binds a key once; the section says which of its contexts
// listen, and the shell's own come last. This is the simplest form, with the keys the engine pages always had; the
// help «?» comes later on top of bindings().

import type { KeyBinding, KeyMap, KeyReach } from './section.ts';

/** The shell's own context: keys that mean the same on every page. */
export const SHELL_KEYS = 'shell';

type Focus = 'page' | 'control' | 'text';

/** Text fields keep every key; sliders and checkboxes keep the arrows and digits but let the gas on Space through. */
function focusOf(target: EventTarget | null): Focus {
  const el = target as HTMLInputElement | null;
  if (!el || !el.tagName) return 'page';
  if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return 'text';
  if (el.tagName !== 'INPUT') return 'page';
  return el.type === 'range' || el.type === 'checkbox' ? 'control' : 'text';
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

  /** The bindings that listen now, in the order they are asked. */
  private listening(): KeyBinding[] {
    return [...this.active.filter((c) => c !== SHELL_KEYS), SHELL_KEYS].flatMap((context) => this.contexts.get(context) ?? []);
  }

  private down(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const focus = focusOf(event.target);
    const blocked = this.blocked();
    for (const binding of this.listening()) {
      if (!binding.codes.includes(event.code) || !reaches(binding.reach ?? 'page', focus, blocked)) continue;
      if (binding.down(event) !== false) return;
    }
  }

  private up(event: KeyboardEvent): void {
    for (const binding of this.listening()) {
      if (binding.up && binding.codes.includes(event.code)) binding.up(event);
    }
  }
}
