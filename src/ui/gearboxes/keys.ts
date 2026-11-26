// The keys of the gearbox pages, as bindings for the shell's KeyMap (the whole-car plan, keys). Without the DOM, so
// the test of the keys binds them as the section does. On the table: the gas, the start and the mute, as on the engine
// pages. In the car the digits are the gears, as on a gate, so the views go by V there; R reverse, N neutral, B the
// brake, C the clutch pedal held down (stage K3b).

import { t } from '../../i18n/t.ts';
import type { KeyBinding } from '../../shell/section.ts';

export interface GearboxKeyActions {
  /** The gas held down by a key, and let go. */
  gas(on: boolean): void;
  ignition(): void;
  mute(): void;
  /** A gear by its name in the shift matrix: 'N', 'R', '1' … */
  gear(name: string): void;
  /** The brake held down by its key, and let go. */
  brake(on: boolean): void;
  /** The clutch pedal held down by its key, and let go. */
  clutch(on: boolean): void;
}

/** The contexts of the gearbox pages, the most specific first, as each mode puts them in use. */
export const GEARBOX_KEY_CONTEXTS = {
  table: ['gearboxes'],
  drive: ['gearboxes/drive', 'gearboxes'],
} as const satisfies Record<string, readonly string[]>;

/** Contexts where the digits are gears and not the views. */
export const GEAR_KEY_CONTEXTS: readonly string[] = ['gearboxes/drive'];

/** The most forward speeds a gate has keys for. */
const GEAR_DIGITS = 8;

export function gearboxKeys(actions: GearboxKeyActions): { gearboxes: KeyBinding[]; drive: KeyBinding[] } {
  const held = (act: (on: boolean) => void): Pick<KeyBinding, 'down' | 'up'> => ({
    down: (event) => {
      event.preventDefault();
      if (!event.repeat) act(true);
    },
    up: (event) => {
      event.preventDefault();
      act(false);
    },
  });
  const gearboxes: KeyBinding[] = [
    // Space works on a slider too: it is the gas wherever the visitor is.
    { codes: ['Space'], reach: 'controls', label: t('Газ'), ...held((on) => actions.gas(on)) },
    { codes: ['ArrowUp'], label: t('Газ'), ...held((on) => actions.gas(on)) },
    { codes: ['KeyS'], label: t('Запустити двигун'), down: () => actions.ignition() },
    { codes: ['KeyM'], label: t('Вимкнути звук'), down: () => actions.mute() },
  ];
  const digits = Array.from({ length: GEAR_DIGITS }, (_, i) => `Digit${i + 1}`);
  const gear = (event: KeyboardEvent): void => actions.gear(event.code.slice(5));
  const drive: KeyBinding[] = [
    // The help lists the five a visitor meets first; 6 to 8 work the same for a box that has them.
    { codes: digits.slice(0, 5), label: t('Передача'), down: gear },
    { codes: digits.slice(5), label: null, down: gear },
    { codes: ['KeyR'], label: t('Задній хід'), down: () => actions.gear('R') },
    { codes: ['KeyN'], label: t('Нейтраль'), down: () => actions.gear('N') },
    { codes: ['KeyB'], label: t('Педаль гальма'), ...held((on) => actions.brake(on)) },
    { codes: ['KeyC'], label: t('Педаль зчеплення'), ...held((on) => actions.clutch(on)) },
  ];
  return { gearboxes, drive };
}
