// Small labels over the dashboard: what the valve gear is doing right now. Only for engines that have some.

import type { EngineSpec } from '../engine/spec.ts';
import { liveTiming, type ValveState, type VariableValves } from '../engine/valve-control.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';

/** Picks the wording for a phase: later, earlier, or at park. */
const phase = (shift: number, later: string, earlier: string, still: string): string => (Math.round(Math.abs(shift)) === 0 ? still : shift > 0 ? later : earlier);

export class ValveReadout {
  readonly element = document.createElement('div');
  private readonly phases = document.createElement('span');
  private readonly cam = document.createElement('span');
  private readonly lift = document.createElement('span');
  private readonly cylinders = document.createElement('span');
  private vvt: VariableValves | null = null;
  private spec: EngineSpec | null = null;
  private shown = '';

  constructor() {
    this.element.className = 'valve-state';
    this.element.hidden = true;
    this.phases.className = 'valve-chip valve-phase';
    this.cam.className = 'valve-chip';
    this.lift.className = 'valve-chip valve-phase';
    this.cylinders.className = 'valve-chip';
    // The cam and the cylinders are worth announcing; the phase changes all the time.
    this.cam.setAttribute('aria-live', 'polite');
    this.cylinders.setAttribute('aria-live', 'polite');
    this.element.append(this.phases, this.cam, this.lift, this.cylinders);
  }

  setEngine(spec: EngineSpec): void {
    this.spec = spec;
    this.vvt = spec.vvt ?? null;
    this.element.hidden = !this.vvt;
    this.shown = '';
  }

  update(state: ValveState | undefined, running: boolean): void {
    const v = this.vvt;
    if (!v || !this.spec) return;
    const s = running && state ? state : null;
    const parts: string[] = [];
    const intake = s?.intakeShift ?? 0;
    const exhaust = s?.exhaustShift ?? 0;
    const di = Math.round(Math.abs(intake));
    const de = Math.round(Math.abs(exhaust));
    if (v.phaser === 'coupled') {
      parts.push(phase(intake, t('Вал: пізніше на {deg}°', { deg: di }), t('Вал: раніше на {deg}°', { deg: di }), t('Вал: як у спокої')));
    } else if (v.phaser !== 'none') {
      parts.push(phase(intake, t('Впуск: пізніше на {deg}°', { deg: di }), t('Впуск: раніше на {deg}°', { deg: di }), t('Впуск: як у спокої')));
      if (v.phaser === 'dual') parts.push(phase(exhaust, t('Випуск: пізніше на {deg}°', { deg: de }), t('Випуск: раніше на {deg}°', { deg: de }), t('Випуск: як у спокої')));
    }
    const cam = v.switching ? (s?.highCam ? t('Кулачок: високий') : t('Кулачок: низький')) : '';
    let lift = '';
    if (v.lift && this.spec.timing) {
      const now = liveTiming(this.spec.timing, v, s ?? undefined);
      const mm = (now.intakeLift * v.lift.maxLift).toLocaleString(numberLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
      lift = s?.lateOpen ? t('Впуск відкривається пізно, {mm} мм', { mm }) : t('Підйом впуску {mm} мм', { mm });
    }
    const all = this.spec.cylinders;
    const cylinders = v.deactivation ? t('Працюють {active} з {all}', { active: all - (s?.off.length ?? 0), all }) : '';
    const key = [parts.join('|'), cam, lift, cylinders, s?.off.join(',') ?? ''].join('#');
    if (key === this.shown) return;
    this.shown = key;
    this.phases.textContent = parts.join(' · ');
    this.phases.hidden = parts.length === 0;
    this.cam.textContent = cam;
    this.cam.hidden = !cam;
    this.lift.textContent = lift;
    this.lift.hidden = !lift;
    this.cylinders.textContent = cylinders;
    this.cylinders.hidden = !cylinders;
    this.cylinders.title = s?.off.length ? t('Відпочивають: {list}', { list: s.off.join(', ') }) : '';
  }
}
