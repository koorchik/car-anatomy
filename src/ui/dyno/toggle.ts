// The button that puts the engine on the dyno, and the dyno's place in the dash. Both are on the page before the dyno's
// code has loaded: the first press loads it (src/ui/engines/features.ts), and DynoPanel takes them over. The place
// keeps the dash's columns as they are with the dyno there, hidden.

import { t } from '../../i18n/t.ts';

export function dynoToggle(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.id = 'dyno-toggle';
  button.textContent = t('На стенд');
  button.setAttribute('aria-pressed', 'false');
  return button;
}

/** The dyno's column in the dash, hidden and empty until DynoPanel fills it. */
export function dynoColumn(): HTMLElement {
  const column = document.createElement('section');
  column.className = 'dyno-col';
  column.hidden = true;
  return column;
}
