// The Setup panel of the suspension page (build order, A3): spring, damper (a preset or ζ), ride height,
// static camber and toe, tyre pressure, and the factory setup back. Each change goes straight to the section, which
// resolves the corner again (resolveCorner, about half a millisecond), so the arrows, the lasers, the tyre's press and
// the numbers follow the slider. The panel only edits a CornerSetup; what it means is the core's (setup.ts).

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { onSegment, setSegment } from '../../shell/segmented.ts';
import { DAMPER_PRESETS, SETUP_RANGES, springRangeNmm, type CornerSetup, type DamperPreset, type ResolvedCorner } from '../../suspension/setup.ts';

const DEG = 180 / Math.PI;

const fmt = (v: number, digits: number): string =>
  v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (v: number, digits: number): string => {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${fmt(r, digits)}` : r < 0 ? `−${fmt(-r, digits)}` : fmt(0, digits);
};

const PRESETS: readonly DamperPreset[] = ['worn', 'comfort', 'sport', 'track'];
const presetLabel = (p: DamperPreset): string =>
  ({ worn: t('Зношений'), comfort: t('Комфорт'), sport: t('Спорт'), track: t('Трек') })[p];

/** A slider row: its name, the value as the page prints it, and the input. */
const slider = (id: string, label: string, min: number, max: number, step: number): string => `<label class="susp-ctl">
      <span class="susp-ctl-head"><span>${label}</span><output id="${id}-value" for="${id}"></output></span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" />
    </label>`;

export const setupPanelHtml = (): string => `<section class="susp-setup" aria-labelledby="susp-setup-title">
    <h3 id="susp-setup-title">${t('Пружина, амортизатор, шина')}</h3>
    ${slider('susp-spring', t('Жорсткість пружини'), SETUP_RANGES.springNmm[0], SETUP_RANGES.springNmm[1], 1)}
    <div class="susp-ctl">
      <span class="susp-ctl-head"><span>${t('Амортизатор')}</span><output id="susp-zeta-value" for="susp-zeta"></output></span>
      <div class="segmented susp-damper" role="group" aria-label="${t('Амортизатор')}" id="susp-damper">
        ${PRESETS.map((p) => `<button type="button" data-v="${p}" aria-pressed="false">${presetLabel(p)}</button>`).join('')}
      </div>
      <input type="range" id="susp-zeta" min="${SETUP_RANGES.zeta[0]}" max="${SETUP_RANGES.zeta[1]}" step="0.01" aria-label="${t('Ступінь демпфування ζ')}" />
    </div>
    ${slider('susp-ride', t('Висота кузова'), SETUP_RANGES.rideHeightM[0] * 1000, SETUP_RANGES.rideHeightM[1] * 1000, 1)}
    ${slider('susp-camber', t('Розвал у статиці'), SETUP_RANGES.camberDeg[0], SETUP_RANGES.camberDeg[1], 0.05)}
    ${slider('susp-toe', t('Сходження в статиці'), SETUP_RANGES.toeDeg[0], SETUP_RANGES.toeDeg[1], 0.01)}
    ${slider('susp-pressure', t('Тиск у шині'), SETUP_RANGES.pressureBar[0], SETUP_RANGES.pressureBar[1], 0.1)}
    <dl class="susp-readout susp-setup-sum" id="susp-setup-sum"></dl>
    <div class="susp-setup-actions">
      <button type="button" class="btn susp-setup-reset" id="susp-setup-reset">${t('Заводські')}</button>
      <a class="btn" id="susp-setup-designer" href="#/suspensions/designer">${t('Відкрити в конструкторі')}</a>
    </div>
  </section>`;

export class SetupPanel {
  private readonly root: HTMLElement;
  private factory: CornerSetup;
  private readonly onChange: (setup: CornerSetup) => void;
  private setup: CornerSetup;

  /** `root` holds setupPanelHtml(); `onChange` hears every setup the visitor makes, and show() puts the resolved one back. */
  constructor(root: HTMLElement, factory: CornerSetup, onChange: (setup: CornerSetup) => void) {
    this.root = root;
    this.factory = factory;
    this.setup = { ...factory };
    this.onChange = onChange;
    this.fitSpring();
    const input = (id: string, apply: (v: number) => Partial<CornerSetup>): void => {
      this.$<HTMLInputElement>(id).addEventListener('input', (event) => this.change(apply(Number((event.target as HTMLInputElement).value))));
    };
    input('susp-spring', (v) => ({ springNmm: v }));
    input('susp-zeta', (v) => ({ damper: v }));
    input('susp-ride', (v) => ({ rideHeightM: v / 1000 }));
    input('susp-camber', (v) => ({ camberDeg: v }));
    input('susp-toe', (v) => ({ toeDeg: v }));
    input('susp-pressure', (v) => ({ pressureBar: v }));
    onSegment(this.$('susp-damper'), (v) => this.change({ damper: v as DamperPreset }));
    this.$('susp-setup-reset').addEventListener('click', () => {
      this.setup = { ...this.factory };
      this.onChange(this.setup);
    });
  }

  /** Another corner: its factory setup, which the panel starts from and its factory button goes back to. */
  setFactory(factory: CornerSetup): void {
    this.factory = factory;
    this.setup = { ...factory };
    this.fitSpring();
  }

  /** The spring slider's top for this corner: past the usual one when the car's own spring is stiffer (setup.ts). */
  private fitSpring(): void {
    this.$<HTMLInputElement>('susp-spring').max = String(springRangeNmm(this.factory.springNmm)[1]);
  }

  /**
   * Which alignment adjusters the corner has: camber needs a strut's top mount, toe a steered tie rod (setup.ts). A
   * slider for hardware the corner lacks is hidden, as the setup would ignore it.
   */
  setAdjusters(on: { camber: boolean; toe: boolean }): void {
    this.$('susp-camber').closest<HTMLElement>('.susp-ctl')!.hidden = !on.camber;
    this.$('susp-toe').closest<HTMLElement>('.susp-ctl')!.hidden = !on.toe;
  }

  get current(): CornerSetup {
    return this.setup;
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  /** Changes the setup as the controls would. */
  edit(patch: Partial<CornerSetup>): void {
    this.change(patch);
  }

  private change(patch: Partial<CornerSetup>): void {
    this.setup = { ...this.setup, ...patch };
    this.onChange(this.setup);
  }

  /** Puts the controls and the numbers under them where the resolved corner is. */
  show(r: ResolvedCorner): void {
    this.setup = r.setup;
    const s = r.setup;
    const put = (id: string, value: number, text: string): void => {
      const el = this.$<HTMLInputElement>(id);
      // A slider being dragged keeps the visitor's own value; setting it again would snap it to the step.
      if (document.activeElement !== el) el.value = String(value);
      this.$(`${id}-value`).textContent = text;
    };
    put('susp-spring', s.springNmm, t('{value} Н/мм', { value: fmt(s.springNmm, 0) }));
    put('susp-ride', Math.round(s.rideHeightM * 1000), t('{value} мм', { value: signed(s.rideHeightM * 1000, 0) }));
    const camber = r.atRest.camber * DEG;
    const toe = r.atRest.toe * DEG;
    const factoryNote = (on: boolean): string => (on ? ` · ${t('як із заводу')}` : '');
    put('susp-camber', camber, `${signed(camber, 2)}°${factoryNote(s.camberDeg === 'factory')}`);
    put('susp-toe', toe, `${signed(toe, 2)}°${factoryNote(s.toeDeg === 'factory')}`);
    put('susp-pressure', s.pressureBar, t('{value} бар', { value: fmt(s.pressureBar, 1) }));
    const zeta = this.$<HTMLInputElement>('susp-zeta');
    if (document.activeElement !== zeta) zeta.value = String(r.zeta);
    this.$('susp-zeta-value').textContent = `ζ = ${fmt(r.zeta, 2)}`;
    setSegment(this.$('susp-damper'), typeof s.damper === 'string' && s.damper !== 'factory' ? s.damper : (PRESETS.find((p) => Math.abs(DAMPER_PRESETS[p] - r.zeta) < 0.005) ?? ''));
    const row = (label: string, value: string): string => `<dt>${label}</dt><dd>${value}</dd>`;
    this.$('susp-setup-sum').innerHTML = [
      row(t('Частота кузова'), t('{value} Гц', { value: fmt(r.bodyHz, 2) })),
      row(t('Підскок колеса'), t('{value} Гц', { value: fmt(r.hopHz, 1) })),
      row(t('Зусилля пружини в спокої'), t('{value} кН', { value: fmt(r.spring.staticN / 1000, 2) })),
      row(t('Прогин шини в спокої'), t('{value} мм', { value: fmt(r.tyre.staticDeflM * 1000, 1) })),
      row(t('Хід до відбійника'), t('{value} мм', { value: fmt(r.bumpStop.travelM * 1000, 0) })),
    ].join('');
  }
}
