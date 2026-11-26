// The keys of the whole site (the plan of the whole car, «Клавіші»): no key is taken twice in one context, a key means
// the same wherever it is bound, and the help «?» lists every binding a visitor can reach.

import { describe, expect, it } from 'vitest';
import { keyCap, keyHelp, knownKey } from '../src/shell/key-help.ts';
import { SHELL_KEYS, shellBindings, ShellKeys } from '../src/shell/keys.ts';
import type { KeyBinding } from '../src/shell/section.ts';
import { ENGINE_KEY_CONTEXTS, engineKeys } from '../src/ui/engines/keys.ts';
import { SUSPENSION_KEY_CONTEXTS, suspensionKeys } from '../src/ui/suspensions/keys.ts';
import { GEAR_KEY_CONTEXTS, GEARBOX_KEY_CONTEXTS, gearboxKeys } from '../src/ui/gearboxes/keys.ts';

const noop = (): void => undefined;

/** Every context the site binds, as the shell and the sections bind them. */
function siteKeys(): ShellKeys {
  const target = { addEventListener: noop } as unknown as EventTarget;
  const keys = new ShellKeys(target, () => false);
  keys.bind(SHELL_KEYS, shellBindings({ close: noop, view: noop, currentView: () => 'xray', help: noop }));
  const engines = engineKeys({ gas: noop, ignition: noop, step: noop, table: noop, mute: noop, layer: noop, closeHelp: noop, lap: () => false });
  keys.bind('engines', engines.engines);
  keys.bind('engines/sump', engines.sump);
  keys.bind(SUSPENSION_KEY_CONTEXTS[0], suspensionKeys({ event: () => true, scene: noop, page: noop }));
  const gearboxes = gearboxKeys({ gas: noop, ignition: noop, mute: noop, gear: noop, brake: noop });
  keys.bind('gearboxes', gearboxes.gearboxes);
  keys.bind('gearboxes/drive', gearboxes.drive);
  return keys;
}

/** The stacks of contexts the pages put in use, the shell's last, as ShellKeys.stack gives them; the shell's alone too. */
const STACKS: ReadonlyArray<readonly string[]> = [
  ...[...Object.values(ENGINE_KEY_CONTEXTS), ...Object.values(GEARBOX_KEY_CONTEXTS)].map((contexts) => [...contexts, SHELL_KEYS]),
  [...SUSPENSION_KEY_CONTEXTS, SHELL_KEYS],
  [SHELL_KEYS],
];

const shellCaps = (help: ReturnType<typeof keyHelp>): string[] => help.find((g) => g.context === SHELL_KEYS)!.rows.flatMap((row) => row.caps);

const contextsOf = (keys: ShellKeys): string[] => [...new Set(keys.bindings().map((b) => b.context))];

describe('keys of the site', () => {
  it('takes no key twice in one context', () => {
    const keys = siteKeys();
    for (const context of contextsOf(keys)) {
      const codes = keys.of(context).flatMap((b) => b.codes);
      expect(new Set(codes).size, context).toBe(codes.length);
    }
  });

  it('gives a key of the shell no other meaning in a section', () => {
    const keys = siteKeys();
    const shell = new Map(keys.of(SHELL_KEYS).flatMap((b) => b.codes.map((code) => [code, b.label] as const)));
    for (const { context, binding } of keys.bindings()) {
      if (context === SHELL_KEYS || binding.label === null) continue;
      for (const code of binding.codes) {
        // The first view's name follows the section (Section.solidLabel), and where there are gears the digits are the
        // gears, as on a gate (the views go by V there); every other key keeps the shell's meaning.
        if (GEAR_KEY_CONTEXTS.includes(context) && /^Digit/.test(code)) continue;
        if (shell.has(code) && code !== 'Digit1') expect(binding.label, `${context} ${code}`).toBe(shell.get(code));
      }
    }
  });

  it('lists every binding in the help, under the first context that has its key', () => {
    const keys = siteKeys();
    const listed = new Set<KeyBinding>();
    for (const stack of STACKS) {
      const help = keyHelp(stack, (context) => keys.of(context));
      const rows = help.flatMap((group) => group.rows.map((row) => ({ context: group.context, ...row })));
      const taken = new Set<string>();
      for (const context of stack) {
        for (const binding of keys.of(context)) {
          const free = binding.codes.filter((code) => !taken.has(code));
          free.forEach((code) => taken.add(code));
          if (binding.label === null || !free.length) continue;
          const row = rows.find((r) => r.context === context && r.label === binding.label);
          expect(row, `${stack.join(' > ')}: ${binding.label}`).toBeDefined();
          for (const code of free) expect(row!.caps, binding.label).toContain(keyCap(code));
          listed.add(binding);
        }
      }
      // Nothing in the help that no binding of the stack says.
      for (const row of rows) expect(keys.of(row.context).some((b) => b.label === row.label), row.label).toBe(true);
    }
    // Every binding with a label is in the help of some page: none is bound for nothing.
    for (const { context, binding } of keys.bindings()) {
      if (binding.label !== null) expect(listed.has(binding), `${context}: ${binding.label}`).toBe(true);
    }
  });

  it('prints every key of the site the way it is printed on the key', () => {
    const keys = siteKeys();
    for (const { binding } of keys.bindings()) for (const code of binding.codes) expect(knownKey(code), code).toBe(true);
    expect(['KeyS', 'Digit4', 'ArrowLeft', 'Escape', 'Slash'].map(keyCap)).toEqual(['S', '4', '←', 'Esc', '?']);
  });

  it('lets a key held back by a page hide what the contexts under it would do', () => {
    const keys = siteKeys();
    const sump = keyHelp([...ENGINE_KEY_CONTEXTS.sump, SHELL_KEYS], (context) => keys.of(context));
    const caps = sump.flatMap((group) => group.rows.flatMap((row) => row.caps));
    // On the oil page the lap owns the digits and S: the layers, the views by number and the ignition are not offered.
    for (const cap of ['1', '4', '7', 'S']) expect(caps, cap).not.toContain(cap);
    expect(sump[0]!.rows.map((row) => row.caps)).toContainEqual(['Пробіл']);
    // Two keys for the gas share one row.
    const catalogue = keyHelp([...ENGINE_KEY_CONTEXTS.catalogue, SHELL_KEYS], (context) => keys.of(context));
    expect(catalogue[0]!.rows.find((row) => row.caps.includes('↑'))?.caps).toEqual(['Пробіл', '↑']);
  });

  it('leaves the arrows to the panel when it is focused, so its article scrolls', () => {
    const steps: number[] = [];
    const arrows = suspensionKeys({ event: () => true, scene: (d) => steps.push(d), page: noop }).find((b) => b.codes.includes('ArrowDown'))!;
    const press = (target: unknown) => {
      let prevented = false;
      const event = { code: 'ArrowDown', target, preventDefault: () => (prevented = true) } as unknown as KeyboardEvent;
      return { handled: arrows.down(event) !== false, prevented };
    };
    expect(press({ closest: () => ({}) })).toEqual({ handled: false, prevented: false });
    expect(press({ closest: () => null })).toEqual({ handled: true, prevented: true });
    expect(press(null)).toEqual({ handled: true, prevented: true });
    expect(steps).toEqual([1, 1]);
  });

  it('goes to another type of suspension on the arrows left and right, but not from a slider', () => {
    const pages: number[] = [];
    const arrows = suspensionKeys({ event: () => true, scene: noop, page: (d) => pages.push(d) }).find((b) => b.codes.includes('ArrowLeft'))!;
    const press = (code: string, target: unknown) => arrows.down({ code, target, preventDefault: noop } as unknown as KeyboardEvent) !== false;
    expect(press('ArrowLeft', { closest: () => null })).toBe(true);
    expect(press('ArrowRight', null)).toBe(true);
    expect(press('ArrowRight', { closest: (selector: string) => (selector.includes('input') ? {} : null) })).toBe(false);
    expect(pages).toEqual([-1, 1]);
  });

  it('leaves Space to a focused button, so the keyboard can press it', () => {
    let events = 0;
    const space = suspensionKeys({ event: () => (events++, true), scene: noop, page: noop }).find((b) => b.codes.includes('Space'))!;
    const press = (target: unknown) => space.down({ code: 'Space', target, preventDefault: noop } as unknown as KeyboardEvent) !== false;
    expect(press({ closest: (selector: string) => (selector.includes('button') ? {} : null) })).toBe(false);
    expect(press({ closest: () => null })).toBe(true);
    expect(events).toBe(1);
  });

  it('gives the suspension pages the scene on the arrows up and down and V for the views', () => {
    const keys = siteKeys();
    const help = keyHelp([...SUSPENSION_KEY_CONTEXTS, SHELL_KEYS], (context) => keys.of(context));
    const rows = help.flatMap((group) => group.rows);
    expect(rows.find((row) => row.caps.includes('↑'))?.caps).toEqual(['↑', '↓']);
    expect(rows.find((row) => row.caps.includes('V'))).toBeDefined();
    expect(rows.find((row) => row.caps.includes('Пробіл'))).toBeDefined();
  });

  it('in the car the digits are the gears and V the views; the gas, the start and the mute are the engine pages\' keys', () => {
    const keys = siteKeys();
    const drive = keyHelp([...GEARBOX_KEY_CONTEXTS.drive, SHELL_KEYS], (context) => keys.of(context));
    const own = drive.find((g) => g.context === 'gearboxes/drive')!.rows;
    expect(own.find((row) => row.caps.includes('1'))?.caps).toEqual(['1', '2', '3', '4', '5']);
    // 6 to 8 are gears too, held back from the views, though the help does not list them.
    expect(keys.of('gearboxes/drive').some((b) => b.label === null && b.codes.includes('Digit8'))).toBe(true);
    expect(shellCaps(drive)).not.toContain('6');
    expect(own.flatMap((row) => row.caps)).toEqual(expect.arrayContaining(['R', 'N', 'B']));
    // The shell's views by number are not offered in the car, V is.
    expect(shellCaps(drive)).not.toContain('2');
    expect(shellCaps(drive)).toContain('V');
    const engines = new Map(keys.of('engines').flatMap((b) => b.codes.map((code) => [code, b.label] as const)));
    for (const binding of keys.of('gearboxes')) for (const code of binding.codes) expect(binding.label, code).toBe(engines.get(code));
  });
});

