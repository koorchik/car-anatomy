// What the stage says about its parts: the name that follows the pointer, the card a click opens, and the first-visit
// note that parts can be asked about.

import { t } from '../i18n/t.ts';
import type { Stage } from '../scene/stage.ts';

const PARTS_LEARNED_KEY = 'parts-learned';

export interface PartElements {
  canvas: HTMLCanvasElement;
  tip: HTMLElement;
  card: HTMLElement;
  callout: HTMLElement;
}

export function partUi(stage: Stage, { canvas, tip, card, callout }: PartElements): void {
  /** Storage can be blocked. Then the callout just comes back next time. */
  const partsLearned = (): void => {
    callout.hidden = true;
    try {
      localStorage.setItem(PARTS_LEARNED_KEY, '1');
    } catch {
      // Nothing to do: the note is only a convenience.
    }
  };

  {
    const touch = window.matchMedia('(hover: none)').matches;
    callout.textContent = touch ? t('Торкнись будь-якої деталі, щоб дізнатися, що це') : t('Наведи на будь-яку деталь, щоб побачити її назву. Клацни, щоб дізнатися, що вона робить');
    let learned = false;
    try {
      learned = localStorage.getItem(PARTS_LEARNED_KEY) === '1';
    } catch {
      learned = false;
    }
    callout.hidden = learned;
  }

  // The name of a part follows the pointer, so it's plain that parts can be asked about.
  {
    let lastPick = 0;
    let dragging = false;
    canvas.addEventListener('pointerdown', () => {
      dragging = true;
      tip.hidden = true;
    });
    window.addEventListener('pointerup', () => {
      dragging = false;
    });
    canvas.addEventListener('pointerleave', () => {
      tip.hidden = true;
      canvas.style.cursor = '';
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || dragging) return;
      // Casting a ray through a whole engine is too slow to do on every move.
      const now = performance.now();
      if (now - lastPick < 90) {
        if (!tip.hidden) {
          tip.style.left = `${event.clientX + 14}px`;
          tip.style.top = `${event.clientY + 16}px`;
        }
        return;
      }
      lastPick = now;
      const info = stage.pick(event.clientX, event.clientY);
      canvas.style.cursor = info ? 'pointer' : '';
      if (!info) {
        tip.hidden = true;
        return;
      }
      tip.innerHTML = `<strong>${info.name}</strong><span>${t('клацни, щоб дізнатись більше')}</span>`;
      tip.hidden = false;
      const width = tip.offsetWidth;
      tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - width - 8)}px`;
      tip.style.top = `${event.clientY + 16}px`;
    });
  }

  // Clicking a part without dragging explains what it is.
  {
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (event) => {
      down = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const info = stage.pick(event.clientX, event.clientY);
      if (!info) {
        card.hidden = true;
        return;
      }
      tip.hidden = true;
      partsLearned();
      card.innerHTML = `<strong>${info.name}</strong><p>${info.text}</p>`;
      card.hidden = false;
      const rect = card.getBoundingClientRect();
      const x = Math.min(window.innerWidth - rect.width - 12, Math.max(12, event.clientX + 14));
      const y = Math.max(60, event.clientY - rect.height - 10);
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    });
  }
}
