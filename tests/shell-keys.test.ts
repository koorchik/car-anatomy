// The keys of the shell (src/shell/keys.ts): which binding a key reaches, so that sections between this stage and the
// help of the keys can rely on it.

import { describe, expect, it } from 'vitest';
import { SHELL_KEYS, ShellKeys } from '../src/shell/keys.ts';
import type { KeyBinding } from '../src/shell/section.ts';

type Handler = (event: unknown) => void;

function setup(blocked = false) {
  const handlers: Record<string, Handler> = {};
  const target = { addEventListener: (type: string, handler: Handler) => (handlers[type] = handler) } as unknown as EventTarget;
  const state = { blocked };
  const keys = new ShellKeys(target, () => state.blocked);
  const log: string[] = [];
  const event = (code: string, target: unknown = null, extra: Record<string, unknown> = {}) => ({ code, target, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });
  const press = (code: string, target?: unknown, extra?: Record<string, unknown>) => handlers.keydown!(event(code, target, extra));
  const release = (code: string) => handlers.keyup!(event(code));
  const binding = (name: string, codes: string[], more: Partial<KeyBinding> = {}): KeyBinding => ({ codes, label: name, down: () => void log.push(name), ...more });
  return { keys, log, press, release, binding, state };
}

const slider = { tagName: 'INPUT', type: 'range' };
const textField = { tagName: 'INPUT', type: 'text' };
const select = { tagName: 'SELECT' };
const button = { tagName: 'BUTTON' };

describe('ShellKeys', () => {
  it('asks the most specific context first, and the shell last', () => {
    const { keys, log, press, binding } = setup();
    keys.bind(SHELL_KEYS, [binding('shell 1', ['Digit1']), binding('shell esc', ['Escape'])]);
    keys.bind('engines', [binding('engines 1', ['Digit1'])]);
    keys.bind('engines/sump', [binding('sump 1', ['Digit1'])]);
    keys.use(['engines']);
    press('Digit1');
    keys.use(['engines/sump', 'engines']);
    press('Digit1');
    keys.use([]);
    press('Digit1');
    press('Escape');
    expect(log).toEqual(['engines 1', 'sump 1', 'shell 1', 'shell esc']);
  });

  it('passes a key on when the binding gives false', () => {
    const { keys, log, press, binding } = setup();
    keys.bind('engines', [binding('gas', ['Space'])]);
    keys.bind('engines/sump', [binding('lap', ['Space'], { down: () => false })]);
    keys.use(['engines/sump', 'engines']);
    press('Space');
    expect(log).toEqual(['gas']);
  });

  it('keeps text fields, sliders and an open overlay out of reach unless the binding says otherwise', () => {
    const { keys, log, press, binding, state } = setup();
    keys.bind('engines', [binding('page', ['KeyS']), binding('controls', ['Space'], { reach: 'controls' })]);
    keys.bind(SHELL_KEYS, [binding('always', ['Escape'], { reach: 'always' })]);
    keys.use(['engines']);
    for (const target of [slider, textField, select, button]) {
      press('KeyS', target);
      press('Space', target);
      press('Escape', target);
    }
    expect(log).toEqual(['controls', 'always', 'always', 'always', 'page', 'controls', 'always']);
    log.length = 0;
    state.blocked = true;
    press('KeyS');
    press('Space');
    press('Escape');
    expect(log).toEqual(['always']);
  });

  it('lets a slider keep its keys while a page below binds them with a wider reach', () => {
    const { keys, log, press, binding } = setup();
    keys.bind('engines', [binding('gas', ['Space'], { reach: 'controls' })]);
    keys.bind('engines/sump', [binding('lap', ['Space'])]);
    keys.use(['engines/sump', 'engines']);
    press('Space', slider);
    press('Space', button);
    expect(log).toEqual(['gas', 'lap']);
  });

  it('ignores keys with modifiers and keys already handled', () => {
    const { keys, log, press, binding } = setup();
    keys.bind('engines', [binding('s', ['KeyS'])]);
    keys.use(['engines']);
    press('KeyS', null, { ctrlKey: true });
    press('KeyS', null, { metaKey: true });
    press('KeyS', null, { altKey: true });
    press('KeyS', null, { defaultPrevented: true });
    expect(log).toEqual([]);
  });

  it('lets every listening binding hear a release', () => {
    const { keys, log, release, binding } = setup();
    keys.bind('engines', [binding('gas', ['Space'], { up: () => void log.push('gas up') })]);
    keys.bind('engines/sump', [binding('lap', ['Space'])]);
    keys.bind('other', [binding('other', ['Space'], { up: () => void log.push('other up') })]);
    keys.use(['engines/sump', 'engines']);
    release('Space');
    expect(log).toEqual(['gas up']);
  });

  it('refuses a code bound twice in one context, and removes bindings on request', () => {
    const { keys, log, press, binding } = setup();
    const unbind = keys.bind('engines', [binding('a', ['KeyA', 'KeyB'])]);
    expect(() => keys.bind('engines', [binding('b', ['KeyB'])])).toThrow(/KeyB/);
    expect(() => keys.bind('engines/sump', [binding('b', ['KeyB'])])).not.toThrow();
    expect(keys.bindings().map((b) => `${b.context}:${b.binding.label}`)).toEqual(['engines:a', 'engines/sump:b']);
    keys.use(['engines']);
    unbind();
    press('KeyA');
    expect(log).toEqual([]);
  });
});
