// The gas pedal of a dash: press and hold it, drag along it, step it with the arrows when it has focus, or latch it.
// The gas key eases in and out so that the note does not step.

import { t } from '../../i18n/t.ts';

/** The pedal's markup, for a dash column (`.pedal-col`). */
export const pedalHtml = (): string => `
      <div class="pedal" id="pedal" role="slider" tabindex="0" aria-label="${t('Педаль газу')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="pedal-fill" id="pedal-fill"></div>
        <div class="pedal-text">${t('Газ')}<small>${t('тисни і тримай')}</small></div>
      </div>
      <button class="latch" id="latch" type="button" aria-pressed="false">${t('Утримувати')}</button>
    `;

export interface PedalHost {
  /** The throttle, 0 to 1. */
  setThrottle(value: number): void;
  /** The pedal was touched: a silent engine starts, which is what people try first. */
  press(): void;
}

export class Pedal {
  private readonly pedal: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly latch: HTMLElement;
  private readonly host: PedalHost;
  private latched = false;
  /** Where the pointer, the arrows or the latch put the pedal. */
  private held = 0;
  /** The gas key: held, and how far it has eased in. */
  private keyHeld = false;
  private keyValue = 0;

  /** Works the pedal's markup (pedalHtml) inside `root`. */
  constructor(root: ParentNode, host: PedalHost) {
    this.pedal = root.querySelector<HTMLElement>('#pedal')!;
    this.fill = root.querySelector<HTMLElement>('#pedal-fill')!;
    this.latch = root.querySelector<HTMLElement>('#latch')!;
    this.host = host;
    const pedal = this.pedal;
    pedal.addEventListener('pointerdown', (event) => {
      pedal.setPointerCapture(event.pointerId);
      host.press();
      this.fromPointer(event);
    });
    pedal.addEventListener('pointermove', (event) => {
      if (pedal.hasPointerCapture(event.pointerId)) this.fromPointer(event);
    });
    const release = (): void => {
      if (!this.latched) {
        this.held = 0;
        this.apply();
      }
    };
    pedal.addEventListener('pointerup', release);
    pedal.addEventListener('pointercancel', release);
    // Keyboard users move the pedal in steps with the arrow keys when it has focus.
    pedal.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        this.held = Math.max(0, this.held - 0.1);
      } else if (event.key === 'ArrowUp') {
        this.held = Math.min(1, this.held + 0.1);
        this.latched = true;
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.latch.setAttribute('aria-pressed', String(this.latched));
      this.apply();
    });
    this.latch.addEventListener('click', () => {
      this.latched = !this.latched;
      if (this.latched && this.held === 0) this.held = 0.45;
      if (!this.latched) this.held = 0;
      this.latch.setAttribute('aria-pressed', String(this.latched));
      if (this.latched) host.press();
      this.apply();
    });
    window.addEventListener('blur', () => {
      this.keyHeld = false;
      if (!this.latched) this.held = 0;
      this.apply();
    });
  }

  /** The gas key went down or up. */
  holdKey(on: boolean): void {
    this.keyHeld = on;
  }

  /** Lets go of the pedal and of the latch: the throttle closes. */
  letGo(): void {
    this.latched = false;
    this.held = 0;
    this.latch.setAttribute('aria-pressed', 'false');
    this.apply();
  }

  /**
   * Lets go of everything, the gas key too: for a page the visitor leaves. Its key-up goes to the next page's keys,
   * and a key still counted as held would open the throttle again on coming back.
   */
  reset(): void {
    this.keyHeld = false;
    this.keyValue = 0;
    this.letGo();
  }

  /** Eases the gas key toward pressed or released. */
  frame(dt: number): void {
    const target = this.keyHeld ? 1 : 0;
    const rate = this.keyHeld ? 6 : 12;
    const next = this.keyValue + (target - this.keyValue) * Math.min(1, rate * dt);
    if (Math.abs(next - this.keyValue) > 0.001) {
      this.keyValue = next < 0.004 ? 0 : next;
      this.apply();
    }
  }

  private fromPointer(event: PointerEvent): void {
    const rect = this.pedal.getBoundingClientRect();
    // The fill follows the cursor exactly, down to a closed throttle at the bottom edge.
    this.held = Math.max(0, Math.min(1, (rect.bottom - event.clientY) / rect.height));
    this.apply();
  }

  private apply(): void {
    const value = Math.max(this.held, this.keyValue);
    this.host.setThrottle(value);
    this.fill.style.height = `${value * 100}%`;
    this.pedal.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    this.pedal.classList.toggle('active', value > 0.45);
  }
}
