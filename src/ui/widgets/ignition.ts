// The start button of a dash. What starting means is the page's: the button only shows whether the engine runs.

import { t } from '../../i18n/t.ts';

export const ignitionHtml = (): string => `<button class="ignition" id="ignition" type="button">${t('Запустити двигун')}</button>`;

export class Ignition {
  private readonly button: HTMLElement;

  /** Works the button of ignitionHtml inside `root`; a click calls `toggle`. */
  constructor(root: ParentNode, toggle: () => void) {
    this.button = root.querySelector<HTMLElement>('#ignition')!;
    this.button.addEventListener('click', toggle);
  }

  /** Whether the button shows a running engine. */
  get on(): boolean {
    return this.button.classList.contains('on');
  }

  show(on: boolean): void {
    this.button.textContent = on ? t('Заглушити') : t('Запустити двигун');
    this.button.classList.toggle('on', on);
  }
}
