// The keys of the suspension pages, as bindings for the shell's KeyMap (the plan of the whole car, the keys): Space is
// the scene's event, ↑ and ↓ go to another scene, since the section has no gas. The views are the shell's (1/2/3, V).
// Without the DOM, so the test of the keys binds them as the section does.

import { t } from '../../i18n/t.ts';
import type { KeyBinding } from '../../shell/section.ts';

/** What the keys do; the section wires them to its scenes. */
export interface SuspensionKeyActions {
  /** The scene's event: drive over the obstacle again. False when the scene shown has none. */
  event(): boolean;
  /** The previous (-1) or the next (1) scene. */
  scene(direction: -1 | 1): void;
}

/** The section's contexts, the most specific first. */
export const SUSPENSION_KEY_CONTEXTS = ['suspensions'] as const;

export function suspensionKeys(actions: SuspensionKeyActions): KeyBinding[] {
  return [
    {
      codes: ['Space'],
      label: t('Наїхати на перешкоду'),
      down: (event) => {
        if (!actions.event()) return false;
        event.preventDefault();
        return true;
      },
    },
    {
      codes: ['ArrowUp', 'ArrowDown'],
      label: t('Інша сцена'),
      down: (event) => {
        event.preventDefault();
        actions.scene(event.code === 'ArrowUp' ? -1 : 1);
      },
    },
  ];
}
