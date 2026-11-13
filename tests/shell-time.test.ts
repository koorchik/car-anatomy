// The time control of the shell (src/shell/time.ts): a page only ever runs in a mode it offers, so that a section can
// read `time.mode` without checking it against its own list.

import { describe, expect, it } from 'vitest';
import type { TimeCapabilities, TimeMode } from '../src/shell/section.ts';
import { ShellTime } from '../src/shell/time.ts';

/** A segmented control with a button per mode, as the skeleton has it, without a DOM. */
function setup(offer: TimeCapabilities) {
  const buttons = (['slow', 'readable', 'real', 'slowdown'] as const).map((v) => ({ dataset: { v }, hidden: false, disabled: false, pressed: '', setAttribute(_: string, value: string) { this.pressed = value; } }));
  const group = { addEventListener: () => undefined, querySelectorAll: () => buttons } as unknown as HTMLElement;
  const state = { offer };
  const time = new ShellTime(group, () => state.offer);
  const heard: TimeMode[] = [];
  time.onChange((mode) => heard.push(mode));
  return { time, state, heard, buttons };
}

describe('ShellTime', () => {
  it('refuses a mode the page does not offer or cannot take now', () => {
    const { time, state, heard } = setup({ modes: ['slow', 'readable', 'real'] });
    expect(time.set('slowdown')).toBe(false);
    state.offer = { modes: ['slow', 'readable', 'real'], unavailable: { slow: 'dyno' } };
    expect(time.set('slow')).toBe(false);
    expect(time.set('real')).toBe(true);
    expect([time.mode, heard]).toEqual(['real', ['real']]);
  });

  it('shows only the offered buttons and disables the ones that cannot be chosen', () => {
    const { time, buttons } = setup({ modes: ['slow', 'readable', 'real'], unavailable: { slow: 'dyno' } });
    time.refresh();
    expect(buttons.map((b) => `${b.dataset.v}:${b.hidden ? 'hidden' : b.disabled ? 'disabled' : 'on'}`)).toEqual(['slow:disabled', 'readable:on', 'real:on', 'slowdown:hidden']);
  });

  it('leaves a mode that the page stops offering for the readable one, then the real one', () => {
    const { time, state, heard } = setup({ modes: ['slow', 'readable', 'real'] });
    time.set('slow');
    state.offer = { modes: ['slow', 'readable', 'real'], unavailable: { slow: 'dyno' } };
    time.refresh();
    expect(time.mode).toBe('readable');
    // Another section: real physics slowed down, nothing readable.
    state.offer = { modes: ['real', 'slowdown'], slowdown: [0.1, 0.25] };
    time.refresh();
    expect(time.mode).toBe('real');
    expect(heard).toEqual(['slow', 'readable', 'real']);
  });

  it('falls back to the first mode a page has when it offers neither readable nor real', () => {
    const { time, state } = setup({ modes: ['readable', 'real'] });
    state.offer = { modes: ['slowdown'], slowdown: [0.25, 0.1] };
    time.refresh();
    expect([time.mode, time.factor]).toEqual(['slowdown', 0.25]);
  });

  it('keeps the mode, without telling anyone, while the page still offers it', () => {
    const { time, state, heard } = setup({ modes: ['slow', 'readable', 'real'] });
    state.offer = { modes: ['slow', 'readable', 'real'], unavailable: { slow: 'dyno' } };
    time.refresh();
    expect([time.mode, heard]).toEqual(['readable', []]);
  });
});
