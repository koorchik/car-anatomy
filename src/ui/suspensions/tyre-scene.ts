// The tyre scene of the suspension page (`?s=tyre`, suspensions plan, the tyre scene, stage 11). The sliders set the
// load, the slip angle, the slip along and the camber of one left tyre; the dash shows its contact patch as the brush
// model has it and the side force against slip angle at four loads; the panel adds the force along, the friction
// ellipse, the aligning moment, what camber does in the model's numbers, the sidewall code that builds the 3D wheel,
// the radial or bias carcass of the cut tyre, the static pressure and the article. All the numbers come from the
// Magic Formula of the site (src/vehicle/tyre.ts); none is written by hand.
//
// The pressure is the corner's: the scene writes it through the Setup panel, so the bump scene uses the same tyre
// stiffness (the build order, P1a moved the pressure law there).

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { paintPatch, SLIDE_COLOR, STICK_COLOR } from '../../scene/suspension/patch-paint.ts';
import { TyreModel, type Carcass } from '../../scene/suspension/tyre-model.ts';
import { onSegment, setSegment } from '../../shell/segmented.ts';
import { tyreAt, type Tyre } from '../../vehicle/tyre.ts';
import { aligningCurve, aligningPeak, camberNumbers, frictionEnvelope, lateralCurve, lateralPeak, longitudinalCurve, span, tyrePoint } from '../../vehicle/tyre-curves.ts';
import { tyreVertical, verticalStiffness } from '../../vehicle/tyre-data.ts';
import { contactPatch, type ContactPatch } from '../../vehicle/tyre-patch.ts';
import { decodeSidewall, type SidewallCode } from '../../vehicle/tyre-sidewall.ts';
import type { TyreId } from '../../vehicle/vehicle.ts';
import { Chart, type Series } from './tyre-charts.ts';
import { tyreArticleHtml } from './tyre-article.ts';

const DEG = Math.PI / 180;

/** The load every tyre is fitted to (tyreAt), N: a wheel of a 1630 kg car. The slider moves the load away from it. */
export const FIT_LOAD_N = 4000;
/** Ranges of the sliders (suspensions plan, the tyre scene, steps 1, 4 and 7). */
export const TYRE_RANGES = {
  loadKn: [2, 8],
  alphaDeg: [0, 15],
  kappaPct: [-30, 30],
  camberDeg: [-5, 3.5],
  pressurePct: [-30, 30],
} as const;
/** The four loads of the side-force chart, kN. */
const LOADS_KN = [2, 4, 6, 8] as const;
const LOAD_COLORS = ['#7fb3d5', '#93c47d', '#ffd966', '#f6a04d'] as const;
/** Width of the tread on the road as a share of the section width (our estimate, for the picture only). */
const TREAD_SHARE = 0.8;
/** Codes to try, one click each. */
const SAMPLE_CODES = ['245/40 R18 97Y', '205/55 R16 91V', '185/80 R14 90T', '315/30 R21 105Y'] as const;
const DEFAULT_CODE = SAMPLE_CODES[0];
const TYRE_CHOICES: readonly TyreId[] = ['classic', 'street', 'semi', 'slick'];

/** The page's heading while the scene is shown. */
export const TYRE_HEADING = { title: t('Шина'), sub: t('Одна шина на скляній дорозі: сили, пляма контакту й будова') };

const ALPHAS = span(0, 15, 121);
const KAPPAS = span(-0.3, 0.3, 121);

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (v: number, digits: number): string => {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${fmt(r, digits)}` : r < 0 ? `−${fmt(-r, digits)}` : fmt(0, digits);
};

const tyreLabel = (id: TyreId): string => ({ classic: t('Класичні'), street: t('Дорожні'), semi: t('Напівсліки'), slick: t('Сліки') })[id];

export interface TyreState {
  tyre: TyreId;
  loadKn: number;
  alphaDeg: number;
  kappaPct: number;
  camberDeg: number;
  code: string;
  carcass: Carcass;
  /** Pressure as a change from the nominal, %. */
  pressurePct: number;
}

export const TYRE_DEFAULT: TyreState = { tyre: 'street', loadKn: 4, alphaDeg: 4, kappaPct: 0, camberDeg: 0, code: DEFAULT_CODE, carcass: 'radial', pressurePct: 0 };

/** What the panel's numbers and the dash's picture need, for one state of the sliders. */
export interface TyreReading {
  fx: number;
  fy: number;
  mz: number;
  patch: ContactPatch;
  code: SidewallCode;
  ktNm: number;
}

/** The scene's numbers for a state, without the page: tested and used by the panel. */
export function readTyre(s: TyreState, fitted: Tyre = tyreAt(s.tyre, FIT_LOAD_N)): TyreReading {
  const code = decodeSidewall(s.code) ?? decodeSidewall(DEFAULT_CODE)!;
  const vertical = tyreVertical(s.tyre);
  const ktNm = verticalStiffness(vertical, vertical.nominalBar * (1 + s.pressurePct / 100));
  const fz = s.loadKn * 1000;
  const p = tyrePoint(fitted.set, fz, s.alphaDeg * DEG, s.kappaPct / 100, s.camberDeg * DEG);
  const patch = contactPatch({
    set: fitted.set,
    fz,
    alpha: s.alphaDeg * DEG,
    kappa: s.kappaPct / 100,
    camber: s.camberDeg * DEG,
    freeRadiusM: code.outerDiameterMm / 2000,
    ktNm,
    widthM: (code.size.widthMm / 1000) * TREAD_SHARE,
  });
  return { fx: p.fx, fy: p.fy, mz: p.mz, patch, code, ktNm };
}

const slider = (id: string, label: string, min: number, max: number, step: number, value: number): string => `<label class="susp-ctl">
      <span class="susp-ctl-head"><span>${label}</span><output id="${id}-value" for="${id}"></output></span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" />
    </label>`;

const row = (id: string, label: string): string => `<dt>${label}</dt><dd id="${id}"></dd>`;

export const tyreDashHtml = (): string => `<footer class="susp-dash susp-tyre-dash" id="tyre-dash" hidden>
      <section class="susp-dash-chart">
        <div class="susp-strip-legend">
          <span style="--c: ${STICK_COLOR}">${t('Протектор прилип')}</span>
          <span style="--c: ${SLIDE_COLOR}">${t('Протектор ковзає')}</span>
          <span class="tyre-dash-note" id="tyre-patch-note"></span>
        </div>
        <canvas id="tyre-patch" role="img" aria-label="${t('Пляма контакту згори: рух ліворуч, зелена зона зчеплення від передньої кромки, червона зона ковзання від задньої')}"></canvas>
      </section>
      <section class="susp-dash-chart">
        <div class="susp-strip-legend">
          ${LOADS_KN.map((kn, i) => `<span style="--c: ${LOAD_COLORS[i]}">${t('{value} кН', { value: fmt(kn, 0) })}</span>`).join('')}
        </div>
        <canvas id="tyre-lateral" role="img" aria-label="${t('Бічна сила від кута відведення на чотирьох навантаженнях')}"></canvas>
      </section>
    </footer>`;

export const tyrePanelHtml = (): string => `<section class="susp-bump-controls susp-only-tyre" aria-labelledby="tyre-title">
      <h3 id="tyre-title">${t('Шина')}</h3>
      <div class="segmented" role="group" aria-label="${t('Шини')}" id="tyre-choice">
        ${TYRE_CHOICES.map((id) => `<button type="button" data-v="${id}" aria-pressed="false">${tyreLabel(id)}</button>`).join('')}
      </div>
      ${slider('tyre-load', t('Навантаження'), TYRE_RANGES.loadKn[0], TYRE_RANGES.loadKn[1], 0.1, TYRE_DEFAULT.loadKn)}
      ${slider('tyre-alpha', t('Кут відведення'), TYRE_RANGES.alphaDeg[0], TYRE_RANGES.alphaDeg[1], 0.1, TYRE_DEFAULT.alphaDeg)}
      ${slider('tyre-kappa', t('Поздовжнє ковзання'), TYRE_RANGES.kappaPct[0], TYRE_RANGES.kappaPct[1], 0.5, TYRE_DEFAULT.kappaPct)}
      ${slider('tyre-camber', t('Розвал'), TYRE_RANGES.camberDeg[0], TYRE_RANGES.camberDeg[1], 0.1, TYRE_DEFAULT.camberDeg)}
      <dl class="susp-readout" id="tyre-readout">
        ${row('tyre-r-fy', t('Бічна сила'))}
        ${row('tyre-r-fx', t('Поздовжня сила'))}
        ${row('tyre-r-mz', t('Стабілізуючий момент'))}
        ${row('tyre-r-stick', t('Пляма в зчепленні'))}
        ${row('tyre-r-patch', t('Пляма, довжина × ширина'))}
      </dl>
      <p class="susp-caption" id="tyre-caption"></p>
    </section>
    <section class="susp-only-tyre tyre-charts">
      <h3>${t('Сила вздовж і еліпс тертя')}</h3>
      <canvas class="tyre-chart" id="tyre-long" role="img" aria-label="${t('Поздовжня сила від ковзання')}"></canvas>
      <canvas class="tyre-chart tyre-chart-square" id="tyre-ellipse" role="img" aria-label="${t('Еліпс тертя: найбільша сила в кожному напрямку й поточна точка')}"></canvas>
      <p class="susp-note">${t('Еліпс — найбільша сила, яку шина дає в кожному напрямку на цьому навантаженні. Точка — сила зараз: що більше ковзання вздовж, то менше лишається вбік.')}</p>
      <h3>${t('Стабілізуючий момент')}</h3>
      <canvas class="tyre-chart" id="tyre-mz" role="img" aria-label="${t('Стабілізуючий момент від кута відведення')}"></canvas>
      <p class="susp-note" id="tyre-mz-note"></p>
    </section>
    <section class="susp-only-tyre">
      <h3>${t('Розвал у числах моделі')}</h3>
      <p id="tyre-camber-note"></p>
    </section>
    <section class="susp-only-tyre tyre-code">
      <h3>${t('Напис на боковині')}</h3>
      <label class="susp-ctl">
        <span class="susp-ctl-head"><span>${t('Розмір і індекси')}</span></span>
        <input type="text" id="tyre-code" value="${DEFAULT_CODE}" spellcheck="false" autocomplete="off" inputmode="text" />
      </label>
      <div class="tyre-code-samples">
        ${SAMPLE_CODES.map((c) => `<button type="button" class="btn" data-code="${c}">${c}</button>`).join('')}
      </div>
      <dl class="susp-readout" id="tyre-decoded"></dl>
      <p class="susp-note">${t('3D-колесо будується саме з цих чисел. Ширина обода й протектора — наша оцінка для малюнка.')}</p>
    </section>
    <section class="susp-only-tyre">
      <h3>${t('Будова шини')}</h3>
      <div class="segmented" role="group" aria-label="${t('Каркас')}" id="tyre-carcass">
        <button type="button" data-v="radial" aria-pressed="true">${t('Радіальна')}</button>
        <button type="button" data-v="bias" aria-pressed="false">${t('Діагональна')}</button>
      </div>
      <p>${t('У «Рентгені» шину розрізано: протектор, сталевий брекер, каркас із нитками, борт із бортовим дротом, боковина й герметичний шар. Клацни шар, щоб дізнатися, що він робить.')}</p>
      <button type="button" class="btn" id="tyre-xray">${t('Показати розріз')}</button>
      <p class="susp-note" id="tyre-carcass-note"></p>
    </section>
    <section class="susp-only-tyre">
      <h3>${t('Тиск у шині')}</h3>
      ${slider('tyre-pressure', t('Тиск'), TYRE_RANGES.pressurePct[0], TYRE_RANGES.pressurePct[1], 1, 0)}
      <dl class="susp-readout">
        ${row('tyre-r-kt', t('Вертикальна жорсткість'))}
        ${row('tyre-r-defl', t('Прогин шини'))}
        ${row('tyre-r-len', t('Довжина плями'))}
      </dl>
      <p class="susp-note">${t('Оцінка: жорсткість росте лінійно з тиском, k = k₀·(1 + 0,8·Δp/p₀), а довжина плями ℓ ≈ 2·√(2·r·F/k). Як тиск змінює бічну й поздовжню силу, модель не знає. Тиск спільний зі сценою «Перешкода» й панеллю «Налаштувати».')}</p>
    </section>
    <div class="susp-only-tyre">${tyreArticleHtml()}</div>`;

/** The scene: its state, its model and its charts. The section shows it and tells it when it is shown or resized. */
export class TyreScene {
  readonly model: TyreModel;
  private readonly root: HTMLElement;
  private readonly pressure: { get(): number; set(pct: number): void };
  private state: TyreState = { ...TYRE_DEFAULT };
  private fitted: Tyre = tyreAt(TYRE_DEFAULT.tyre, FIT_LOAD_N);
  private readonly charts: { patch: HTMLCanvasElement; lateral: Chart; long: Chart; ellipse: Chart; mz: Chart };
  private patchSize = { w: 0, h: 0 };
  private dirty = true;
  private reading!: TyreReading;

  /**
   * `root` holds tyrePanelHtml() and tyreDashHtml(); `pressure` reads and writes the corner's pressure as a change
   * from the nominal, %.
   */
  constructor(root: HTMLElement, pressure: { get(): number; set(pct: number): void }, onView: () => void) {
    this.root = root;
    this.pressure = pressure;
    const code = decodeSidewall(DEFAULT_CODE)!;
    this.model = new TyreModel({ size: code.size, carcass: 'radial' });
    this.charts = {
      patch: this.$<HTMLCanvasElement>('tyre-patch'),
      lateral: new Chart(this.$<HTMLCanvasElement>('tyre-lateral')),
      long: new Chart(this.$<HTMLCanvasElement>('tyre-long')),
      ellipse: new Chart(this.$<HTMLCanvasElement>('tyre-ellipse')),
      mz: new Chart(this.$<HTMLCanvasElement>('tyre-mz')),
    };
    const input = (id: string, key: 'loadKn' | 'alphaDeg' | 'kappaPct' | 'camberDeg'): void => {
      this.$<HTMLInputElement>(id).addEventListener('input', (e) => this.edit({ [key]: Number((e.target as HTMLInputElement).value) }));
    };
    input('tyre-load', 'loadKn');
    input('tyre-alpha', 'alphaDeg');
    input('tyre-kappa', 'kappaPct');
    input('tyre-camber', 'camberDeg');
    this.$<HTMLInputElement>('tyre-pressure').addEventListener('input', (e) => {
      const pct = Number((e.target as HTMLInputElement).value);
      this.pressure.set(pct);
      this.edit({ pressurePct: pct });
    });
    onSegment(this.$('tyre-choice'), (v) => this.edit({ tyre: v as TyreId }));
    onSegment(this.$('tyre-carcass'), (v) => this.edit({ carcass: v as Carcass }));
    this.$<HTMLInputElement>('tyre-code').addEventListener('input', (e) => this.edit({ code: (e.target as HTMLInputElement).value }));
    this.$('tyre-code').closest('section')!.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((b) =>
      b.addEventListener('click', () => {
        this.$<HTMLInputElement>('tyre-code').value = b.dataset.code!;
        this.edit({ code: b.dataset.code! });
      }),
    );
    this.$('tyre-xray').addEventListener('click', onView);
  }

  /** The state of the sliders, for checks in the browser. */
  get current(): TyreState {
    return { ...this.state };
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  /** Changes the scene as the panel would. Out-of-range numbers are held at the ends. */
  edit(patch: Partial<TyreState>): void {
    const clamp = (v: number, [a, b]: readonly [number, number]): number => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a);
    const next = { ...this.state, ...patch };
    next.loadKn = clamp(next.loadKn, TYRE_RANGES.loadKn);
    next.alphaDeg = clamp(next.alphaDeg, TYRE_RANGES.alphaDeg);
    next.kappaPct = clamp(next.kappaPct, TYRE_RANGES.kappaPct);
    next.camberDeg = clamp(next.camberDeg, TYRE_RANGES.camberDeg);
    next.pressurePct = clamp(next.pressurePct, TYRE_RANGES.pressurePct);
    if (!TYRE_CHOICES.includes(next.tyre)) next.tyre = this.state.tyre;
    if (next.tyre !== this.fitted.id) this.fitted = tyreAt(next.tyre, FIT_LOAD_N);
    this.state = next;
    this.dirty = true;
  }

  /** The scene comes on: it takes the corner's pressure, which the Setup panel may have changed meanwhile. */
  show(): void {
    const pct = Math.round(this.pressure.get());
    if (pct !== this.state.pressurePct) this.edit({ pressurePct: pct });
    this.dirty = true;
  }

  /** Takes the canvases' sizes after a layout and draws again. */
  resize(): void {
    const c = this.charts.patch;
    const box = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.patchSize = { w: Math.max(1, Math.round(box.width)), h: Math.max(1, Math.round(box.height)) };
    c.width = Math.round(this.patchSize.w * dpr);
    c.height = Math.round(this.patchSize.h * dpr);
    c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.charts.lateral.resize();
    this.charts.long.resize();
    this.charts.ellipse.resize();
    this.charts.mz.resize();
    this.dirty = true;
  }

  /** Each frame while shown: the scene is still, so it only redraws after a change. */
  frame(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const s = this.state;
    const r = readTyre(s, this.fitted);
    this.reading = r;
    this.model.setLook({ size: r.code.size, carcass: s.carcass });
    this.model.update({ alpha: s.alphaDeg * DEG, camber: s.camberDeg * DEG, patch: r.patch });
    this.writeControls();
    this.writeNumbers();
    this.drawPatch();
    this.drawCharts();
  }

  private writeControls(): void {
    const s = this.state;
    const put = (id: string, value: number, text: string): void => {
      const el = this.$<HTMLInputElement>(id);
      if (document.activeElement !== el && Number(el.value) !== value) el.value = String(value);
      this.$(`${id}-value`).textContent = text;
    };
    put('tyre-load', s.loadKn, t('{value} кН', { value: fmt(s.loadKn, 1) }));
    put('tyre-alpha', s.alphaDeg, `${fmt(s.alphaDeg, 1)}°`);
    put('tyre-kappa', s.kappaPct, `${signed(s.kappaPct, 1)} %`);
    put('tyre-camber', s.camberDeg, `${signed(s.camberDeg, 1)}°`);
    const vertical = tyreVertical(s.tyre);
    put('tyre-pressure', s.pressurePct, t('{bar} бар ({pct} %)', { bar: fmt(vertical.nominalBar * (1 + s.pressurePct / 100), 2), pct: signed(s.pressurePct, 0) }));
    setSegment(this.$('tyre-choice'), s.tyre);
    setSegment(this.$('tyre-carcass'), s.carcass);
  }

  private writeNumbers(): void {
    const s = this.state;
    const r = this.reading;
    const p = r.patch;
    const text = (id: string, v: string): void => {
      this.$(id).textContent = v;
    };
    text('tyre-r-fy', t('{value} кН', { value: fmt(r.fy / 1000, 2) }));
    text('tyre-r-fx', t('{value} кН', { value: signed(r.fx / 1000, 2) }));
    text('tyre-r-mz', t('{value} Н·м', { value: signed(r.mz, 0) }));
    text('tyre-r-stick', `${fmt(p.adhesion * 100, 0)} %`);
    text('tyre-r-patch', t('{length} × {width} мм', { length: fmt(p.lengthM * 1000, 0), width: fmt(p.widthM * 1000, 0) }));
    text('tyre-r-kt', t('{value} кН/м', { value: fmt(r.ktNm / 1000, 0) }));
    text('tyre-r-defl', t('{value} мм', { value: fmt(p.deflectionM * 1000, 1) }));
    text('tyre-r-len', t('{value} мм', { value: fmt(p.lengthM * 1000, 0) }));
    const caption = p.adhesion <= 0
      ? t('Ковзає вся пляма: шина на межі, і більший кут уже не дає більшої сили.')
      : p.adhesion > 0.97
        ? t('Протектор майже всюди прилиплий: шина котиться без помітного ковзання.')
        : t('Протектор прилип у передніх {stick} % плями й ковзає в задніх {slide} %. З ростом кута червона зона росте від задньої кромки.', { stick: fmt(p.adhesion * 100, 0), slide: fmt((1 - p.adhesion) * 100, 0) });
    text('tyre-caption', caption);
    text('tyre-patch-note', t('Ковзає {slide} % плями', { slide: fmt((1 - p.adhesion) * 100, 0) }));
    // Camber in the model's numbers at this load.
    const cam = camberNumbers(this.fitted.set, s.loadKn * 1000, 2);
    text('tyre-camber-note', t('1° розвалу дає стільки ж бічної сили, скільки {slip}° кута відведення. −2° на зовнішньому колесі, тобто нахил у бік сили: пік бічної сили {gain} %. Ті самі 2° від сили, як у внутрішнього колеса: {loss} %. На {load} кН, шина «{tyre}».', {
      slip: fmt(cam.slipPerCamber, 2),
      gain: signed(cam.gainPct, 1),
      loss: signed(cam.lossPct, 1),
      load: fmt(s.loadKn, 1),
      tyre: tyreLabel(s.tyre),
    }));
    text('tyre-carcass-note', s.carcass === 'radial'
      ? t('Радіальна: нитки каркаса йдуть поперек, під 90° до напрямку кочення, а протектор тримає сталевий брекер. Так зроблено майже всі сучасні легкові шини.')
      : t('Діагональна: два шари ниток перехрещуються під кутом близько {deg}° до напрямку кочення (оцінка, у різних шин 30–40°), брекера немає. Боковина й протектор гнуться разом, тому пляма мнеться більше.', { deg: fmt(35, 0) }));
    const c = r.code;
    const rows: Array<[string, string]> = [
      [t('Ширина профілю'), t('{value} мм', { value: fmt(c.size.widthMm, 0) })],
      [t('Висота профілю'), t('{value} мм ({aspect} % ширини)', { value: fmt(c.sidewallMm, 0), aspect: fmt(c.size.aspect, 0) })],
      [t('Будова каркаса'), c.construction === 'radial' ? t('R — радіальна') : c.construction === 'bias-belted' ? t('B — діагональна з брекером') : t('D — діагональна')],
      [t('Діаметр обода'), t('{inch}″ = {value} мм', { inch: fmt(c.size.rimIn, 0), value: fmt(c.rimMm, 0) })],
      [t('Повний діаметр колеса'), t('{value} мм', { value: fmt(c.outerDiameterMm, 0) })],
      [t('Індекс навантаження'), c.loadIndex === null ? '—' : c.loadKg === null ? String(c.loadIndex) : t('{index}: до {kg} кг на шину', { index: String(c.loadIndex), kg: fmt(c.loadKg, 0) })],
      [t('Індекс швидкості'), c.speedSymbol === null ? '—' : c.speedAbove ? t('{symbol}: понад {kmh} км/год', { symbol: c.speedSymbol, kmh: fmt(c.speedKmh!, 0) }) : t('{symbol}: до {kmh} км/год', { symbol: c.speedSymbol, kmh: fmt(c.speedKmh!, 0) })],
    ];
    const valid = decodeSidewall(s.code) !== null;
    this.$('tyre-decoded').innerHTML =
      (valid ? '' : `<dt class="tyre-code-bad">${t('Не схоже на розмір шини; показано {code}', { code: DEFAULT_CODE })}</dt><dd></dd>`) +
      rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  private drawPatch(): void {
    const c = this.charts.patch;
    const ctx = c.getContext('2d');
    const { w, h } = this.patchSize;
    if (!ctx || w < 20 || h < 20) return;
    ctx.clearRect(0, 0, w, h);
    const p = this.reading.patch;
    // The patch keeps its true proportions, as large as the box allows, with room for the arrow of travel.
    const ratio = p.widthM > 0 && p.lengthM > 0 ? p.widthM / p.lengthM : 1;
    let pw = w - 48;
    let ph = pw * ratio;
    if (ph > h - 16) {
      ph = h - 16;
      pw = ph / ratio;
    }
    const x0 = (w - pw) / 2 + 14;
    const y0 = (h - ph) / 2;
    paintPatch(ctx, { phi: p.phi, across: p.dirY, x0, y0, w: pw, h: ph, leadRight: false, lines: true });
    // The direction of travel: to the left, where the leading edge is.
    ctx.strokeStyle = 'rgba(241, 239, 230, 0.8)';
    ctx.fillStyle = 'rgba(241, 239, 230, 0.8)';
    ctx.lineWidth = 1.5;
    const ay = y0 + ph / 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 6, ay);
    ctx.lineTo(x0 - 26, ay);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 - 30, ay);
    ctx.lineTo(x0 - 22, ay - 4);
    ctx.lineTo(x0 - 22, ay + 4);
    ctx.closePath();
    ctx.fill();
  }

  private drawCharts(): void {
    const s = this.state;
    const set = this.fitted.set;
    const camber = s.camberDeg * DEG;
    const fz = s.loadKn * 1000;
    const r = this.reading;
    const kn = (ys: number[]): number[] => ys.map((y) => y / 1000);
    // Side force at the four loads, with the current load on top in white and the point the sliders pick.
    const series: Series[] = LOADS_KN.map((l, i) => ({ xs: ALPHAS, ys: kn(lateralCurve(set, l * 1000, camber, ALPHAS)), color: LOAD_COLORS[i]!, width: 1.6 }));
    series.push({ xs: ALPHAS, ys: kn(lateralCurve(set, fz, camber, ALPHAS)), color: '#f1efe6', width: 2.2 });
    const top = Math.max(...series.flatMap((x) => x.ys)) * 1.08;
    this.charts.lateral.draw({
      x: [0, 15],
      y: [0, Math.max(2, top)],
      xTicks: [0, 5, 10, 15],
      yTicks: ticks(Math.max(2, top)),
      xTitle: t('α, °'),
      yTitle: t('F_y, кН'),
      series,
      marks: [{ kind: 'dot', x: s.alphaDeg, y: tyrePoint(set, fz, s.alphaDeg * DEG, 0, camber).fy / 1000, color: '#f1efe6' }],
    });
    // Force along against slip.
    const longYs = kn(longitudinalCurve(set, fz, camber, KAPPAS));
    const lt = Math.max(...longYs.map(Math.abs)) * 1.1;
    this.charts.long.draw({
      x: [-30, 30],
      y: [-lt, lt],
      xTicks: [-30, -15, 0, 15, 30],
      yTicks: ticks(lt, true),
      xTitle: t('κ, %'),
      yTitle: t('F_x, кН'),
      series: [{ xs: KAPPAS.map((k) => k * 100), ys: longYs, color: '#7fd3ff', width: 2 }],
      marks: [{ kind: 'dot', x: s.kappaPct, y: tyrePoint(set, fz, 0, s.kappaPct / 100, camber).fx / 1000, color: '#f1efe6' }],
    });
    // The friction ellipse with the point of both slips together.
    const env = frictionEnvelope(set, fz, camber, 48);
    const loop = [...env, env[0]!];
    const et = Math.max(...env.map(([a, b]) => Math.max(Math.abs(a), Math.abs(b)))) / 1000 * 1.1;
    this.charts.ellipse.draw({
      x: [-et, et],
      y: [-et, et],
      xTicks: ticks(et, true),
      yTicks: ticks(et, true),
      xTitle: t('F_x, кН'),
      yTitle: t('F_y, кН'),
      series: [{ xs: loop.map(([a]) => a / 1000), ys: loop.map(([, b]) => b / 1000), color: '#ffd966', width: 2 }],
      marks: [{ kind: 'dot', x: r.fx / 1000, y: r.fy / 1000, color: '#f1efe6' }],
      centred: true,
      square: true,
    });
    // Aligning moment, with the angles of its peak and of the side force's.
    const mz = aligningCurve(set, fz, camber, ALPHAS);
    const mzTop = Math.max(10, Math.max(...mz) * 1.15);
    const mzPeak = aligningPeak(set, fz, camber);
    const fyPeak = lateralPeak(set, fz, camber);
    this.charts.mz.draw({
      x: [0, 15],
      y: [Math.min(0, Math.min(...mz) * 1.1), mzTop],
      xTicks: [0, 5, 10, 15],
      yTicks: ticks(mzTop),
      xTitle: t('α, °'),
      yTitle: t('M_z, Н·м'),
      series: [{ xs: ALPHAS, ys: mz, color: '#c39bd3', width: 2 }],
      marks: [
        { kind: 'vline', x: mzPeak.alphaDeg, y: 0, color: '#c39bd3', label: t('пік моменту'), row: 0 },
        { kind: 'vline', x: Math.min(15, fyPeak.alphaDeg), y: 0, color: '#f1efe6', label: t('пік сили'), row: 1 },
        { kind: 'dot', x: s.alphaDeg, y: tyrePoint(set, fz, s.alphaDeg * DEG, 0, camber).mz, color: '#f1efe6' },
      ],
    });
    this.$('tyre-mz-note').textContent = t('Момент досягає піку на {mz}°, а бічна сила лише на {fy}°. Далі момент падає, і кермо легшає ще до того, як шина зірветься: так водій відчуває межу.', {
      mz: fmt(mzPeak.alphaDeg, 1),
      fy: fmt(fyPeak.alphaDeg, 1),
    });
  }
}

/** A few round ticks from 0 (or from −top) to `top`. */
function ticks(top: number, both = false): number[] {
  const step = [0.5, 1, 2, 5, 10, 20, 50, 100, 200].find((s) => top / s <= 4) ?? 500;
  const out: number[] = [];
  for (let v = both ? -Math.floor(top / step) * step : 0; v <= top + 1e-9; v += step) out.push(Number(v.toFixed(3)));
  return out;
}
