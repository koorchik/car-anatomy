// The switch of the force arrows under the stage. It is on the page before the arrows' code has loaded: the first
// change loads it (src/ui/engines/features.ts), and BalancePanel takes the switch over.

import { t } from '../i18n/t.ts';

/** Puts the switch in the row of tools and gives back its checkbox. */
export function forcesToggle(tools: HTMLElement): HTMLInputElement {
  const label = document.createElement('label');
  label.className = 'check tool-forces';
  label.innerHTML = `<input type="checkbox" /> ${t('Сили інерції')}`;
  // Stacked under the shake switch, which is about the same thing, so the row of tools does not grow.
  const shake = tools.querySelector('.tool-shake');
  if (shake) {
    const column = document.createElement('div');
    column.className = 'tool-checks';
    shake.replaceWith(column);
    column.append(shake, label);
  } else {
    tools.append(label);
  }
  return label.querySelector('input')!;
}
