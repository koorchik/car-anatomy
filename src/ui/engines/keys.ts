// The keys of the engine pages, as bindings for the shell's KeyMap. Without the DOM, so the test of the keys binds them
// as the section does and checks them against the shell's.

import { t } from '../../i18n/t.ts';
import type { KeyBinding } from '../../shell/section.ts';

export type LayerKey = 'oil' | 'coolant' | 'fuel' | 'air';

/** What the keys do; the section wires them to its pages. */
export interface EngineKeyActions {
  /** The gas held down by a key, and let go. */
  gas(on: boolean): void;
  ignition(): void;
  /** The previous (-1) or the next (1) engine of the catalogue. */
  step(direction: -1 | 1): void;
  table(): void;
  mute(): void;
  layer(id: LayerKey): void;
  /** Closes the dyno's help, if it is open. */
  closeHelp(): void;
  /** The oil page's lap takes the key: true when it did something with it. */
  lap(event: KeyboardEvent): boolean;
}

/** The contexts of the engine pages, the most specific first, as each page puts them in use. */
export const ENGINE_KEY_CONTEXTS = {
  catalogue: ['engines'],
  sump: ['engines/sump', 'engines'],
} as const satisfies Record<string, readonly string[]>;

export function engineKeys(actions: EngineKeyActions): { engines: KeyBinding[]; sump: KeyBinding[] } {
  const gas: Pick<KeyBinding, 'label' | 'down' | 'up'> = {
    label: t('Газ'),
    down: (event) => {
      event.preventDefault();
      if (!event.repeat) actions.gas(true);
    },
    up: (event) => {
      event.preventDefault();
      actions.gas(false);
    },
  };
  const layer = (code: string, id: LayerKey, label: string): KeyBinding => ({ codes: [code], label, down: () => actions.layer(id) });
  const engines: KeyBinding[] = [
    // Esc closes the dyno's help and then goes on to the shell, which closes the table: Esc closes whatever is open.
    {
      codes: ['Escape'],
      label: t('Закрити'),
      reach: 'always',
      down: () => {
        actions.closeHelp();
        return false;
      },
    },
    // Space works on a slider too: it is the gas wherever the visitor is.
    { codes: ['Space'], reach: 'controls', ...gas },
    { codes: ['ArrowUp'], ...gas },
    { codes: ['KeyS'], label: t('Запустити двигун'), down: () => actions.ignition() },
    { codes: ['ArrowLeft'], label: t('Попередній двигун'), down: () => actions.step(-1) },
    { codes: ['ArrowRight'], label: t('Наступний двигун'), down: () => actions.step(1) },
    { codes: ['KeyT'], label: t('Усі двигуни'), down: () => actions.table() },
    { codes: ['KeyM'], label: t('Вимкнути звук'), down: () => actions.mute() },
    layer('Digit4', 'oil', t('Олива')),
    layer('Digit5', 'coolant', t('Охолодження')),
    layer('Digit6', 'fuel', t('Паливо')),
    layer('Digit7', 'air', t('Повітря')),
  ];
  // The oil page plays its lap with Space and moves through it with the arrows; its engine is the lap's to drive.
  const lap = (event: KeyboardEvent): boolean => {
    if (!actions.lap(event)) return false;
    event.preventDefault();
    return true;
  };
  const digits = Array.from({ length: 10 }, (_, i) => `Digit${i}`);
  const sump: KeyBinding[] = [
    { codes: ['Space'], label: t('Поїхали або пауза'), down: lap },
    { codes: ['ArrowLeft', 'ArrowRight'], label: t('На 5 с назад або вперед'), down: lap },
    // Held back: the views, the layers and the ignition are the lap's here.
    { codes: [...digits, 'KeyS'], label: null, down: lap },
  ];
  return { engines, sump };
}
