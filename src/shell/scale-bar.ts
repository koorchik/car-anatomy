// A ruler under the hints: the only way to compare models across pages, and to see what the zoom has done.

import { t } from '../i18n/t.ts';
import type { Stage } from '../scene/stage.ts';

const SCALE_STEPS_CM = [2, 5, 10, 20, 50, 100];

export class ScaleBar {
  private readonly stage: Stage;
  private readonly line: HTMLElement;
  private readonly label: HTMLElement;
  private shown = 0;

  constructor(stage: Stage, line: HTMLElement, label: HTMLElement) {
    this.stage = stage;
    this.line = line;
    this.label = label;
  }

  /** After each frame is drawn: the zoom may have changed. */
  update(): void {
    const perCm = this.stage.pixelsPerUnit / 10;
    if (Math.abs(perCm - this.shown) < 0.02) return;
    this.shown = perCm;
    const cm = SCALE_STEPS_CM.filter((v) => v * perCm <= 150).pop() ?? SCALE_STEPS_CM[0]!;
    this.line.style.width = `${Math.round(cm * perCm)}px`;
    this.label.textContent = t('{cm} см', { cm });
  }
}
