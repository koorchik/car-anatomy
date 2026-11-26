// The third spring on the pushrod page (stage P14): a slider for what it adds at each wheel in heave and two bars, the
// axle's stiffness in heave and in roll, each with a pale mark where it stands without the third spring. The heave bar
// grows with the slider and the roll bar does not move: that is the whole point of the spring (third-spring.ts measures
// both through the rockers). The single-wheel scenes do not see it: it works only when both wheels move.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { CornerSpec } from '../../suspension/spec.ts';
import { axleModes, ownThirdWheelNm, type AxleModes } from '../../suspension/third-spring.ts';

/** The slider's range, N/mm at each wheel. */
export const THIRD_SPRING_MAX_NMM = 100;
const THIRD_SPRING_STEP_NMM = 5;
const DEG = Math.PI / 180;
const COLORS = { heave: '#7fd3ff', roll: '#ffb36b' };

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (now: number, was: number): string => {
  const p = ((now - was) / was) * 100;
  const digits = Math.abs(p) < 10 ? 1 : 0;
  return `${p >= 0 ? '+' : '−'}${fmt(Math.abs(p), digits)} %`;
};

const barHtml = (id: 'heave' | 'roll', label: string): string => `<div class="susp-bar" data-third="${id}" style="--c: ${COLORS[id]}">
      <div class="susp-bar-head"><span class="susp-bar-label">${label}</span><span class="susp-bar-value"></span></div>
      <div class="susp-bar-track"><i class="susp-bar-a"></i><i class="susp-bar-fill"></i></div>
      <p class="susp-bar-note"></p>
    </div>`;

export const thirdSpringHtml = (): string => `<section class="susp-bump-controls susp-third" id="susp-third" hidden>
      <h3>${t('Третя пружина')}</h3>
      <p>${t('Вона стоїть поперек авто між коромислами лівого й правого колеса. Посунь повзунок: жорсткість на підйом росте, а на крен майже не змінюється.')}</p>
      <label class="susp-ctl">
        <span class="susp-ctl-head"><span>${t('Додає кожному колесу на підйомі')}</span><output id="susp-third-value" for="susp-third-rate"></output></span>
        <input type="range" id="susp-third-rate" min="0" max="${THIRD_SPRING_MAX_NMM}" step="${THIRD_SPRING_STEP_NMM}" value="0" />
      </label>
      <div class="susp-third-bars">
        ${barHtml('heave', t('На підйом'))}
        ${barHtml('roll', t('На крен'))}
      </div>
      <p class="susp-note">${t('Бліда позначка — без третьої пружини. Жорсткість на підйом — на кожне колесо, коли обидва йдуть угору на 10 мм; на крен — від пружин, коли одне колесо йде вгору, а друге вниз (без стабілізатора). Сцени з одним колесом третьої пружини не бачать: вона працює, лише коли рухаються обидва.')}</p>
    </section>`;

export class ThirdSpringPanel {
  private readonly root: HTMLElement;
  private readonly slider: HTMLInputElement;
  private corner: CornerSpec | null = null;
  private none: AxleModes | null = null;
  private most: AxleModes | null = null;
  /** The page's own third spring, N/mm at the wheel (the slider starts there). */
  private own = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.slider = this.$<HTMLInputElement>('susp-third-rate');
    this.slider.addEventListener('input', () => this.write());
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  /** Shows the block for a pushrod corner with a third spring, its own rate on the slider; hides it otherwise. */
  setCorner(corner: CornerSpec): void {
    const show = !!corner.axle.thirdSpring && !!corner.axle.spring.rocker;
    this.$('susp-third').hidden = !show;
    if (!show) {
      this.corner = null;
      return;
    }
    if (corner === this.corner) return;
    this.corner = corner;
    const ownNmm = ownThirdWheelNm(corner.axle) / 1000;
    this.own = ownNmm;
    this.none = axleModes(corner.axle, 0);
    this.most = axleModes(corner.axle, THIRD_SPRING_MAX_NMM * 1000);
    this.slider.value = String(Math.round(ownNmm / THIRD_SPRING_STEP_NMM) * THIRD_SPRING_STEP_NMM);
    this.write();
  }

  /** The modes at the slider's rate, for checks in the browser. */
  get state(): { nmm: number; modes: AxleModes | null; none: AxleModes | null; own: number } {
    const nmm = Number(this.slider.value);
    return { nmm, modes: this.corner ? axleModes(this.corner.axle, nmm * 1000) : null, none: this.none, own: this.own };
  }

  /** Sets the slider, as dragging it does. */
  setRate(nmm: number): void {
    this.slider.value = String(nmm);
    this.write();
  }

  private write(): void {
    const { corner, none, most } = this;
    if (!corner || !none || !most) return;
    const nmm = Number(this.slider.value);
    this.$('susp-third-value').textContent = t('{value} Н/мм', { value: fmt(nmm, 0) });
    const m = axleModes(corner.axle, nmm * 1000);
    this.bar('heave', m.heaveNm, none.heaveNm, most.heaveNm, t('{value} Н/мм', { value: fmt(m.heaveNm / 1000, 0) }), pct(m.heaveNm, none.heaveNm));
    this.bar('roll', m.rollNmRad, none.rollNmRad, most.rollNmRad, t('{value} Н·м/°', { value: fmt(m.rollNmRad * DEG, 0) }), pct(m.rollNmRad, none.rollNmRad));
  }

  private bar(id: 'heave' | 'roll', now: number, was: number, top: number, value: string, change: string): void {
    const el = this.root.querySelector<HTMLElement>(`[data-third="${id}"]`)!;
    const scale = top * 1.05;
    el.querySelector<HTMLElement>('.susp-bar-value')!.textContent = value;
    el.querySelector<HTMLElement>('.susp-bar-fill')!.style.width = `${Math.min(100, (now / scale) * 100)}%`;
    el.querySelector<HTMLElement>('.susp-bar-a')!.style.width = `${Math.min(100, (was / scale) * 100)}%`;
    el.querySelector<HTMLElement>('.susp-bar-note')!.textContent = t('{change} до значення без третьої пружини', { change });
  }
}
