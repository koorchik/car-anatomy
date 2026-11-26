// The travel scene's own controls and readouts (suspensions plan, the travel scene; stage P4): the curves of the
// corner with other types laid over them, the front view with its instant and roll centres, the 40 mm lowering, the
// tie-rod height pad, the steering, the five links taken away one by one, and the halfshaft's joints. The section owns
// the corner and the model; this module draws what they give and tells the section what the visitor changed.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { SUSPENSION_PAGES } from '../../data/suspensions.ts';
import type { SuspensionPageId } from '../../data/suspension-links.ts';
import { Axle, newCornerSample } from '../../suspension/kinematics.ts';
import type { ResolvedCorner } from '../../suspension/setup.ts';
import { POSE_SIZE } from '../../suspension/solve.ts';
import {
  bumpSteerPer25, camberGainLeft, camberReversal, curveAt, freeMotions, jointRange, linkRows, sceneRackRange, travelCurves,
  type JointRange, type TravelCurves,
} from '../../suspension/travel-curves.ts';
import { frontViewSvg } from './front-view.ts';
import { pageName, type PageChoice } from './pages.ts';
import { TravelChart, type ChartSeries } from './travel-chart.ts';

/** What the lowering button takes off the ride height, m. */
export const LOWER_M = 0.04;
/** The tie-rod height pad's reach either way, mm (suspensions plan, step 6). */
export const TIE_PAD_MM = 15;
/** Each page's colour on the chart and in its legend. */
export const PAGE_COLORS: Record<SuspensionPageId, string> = { macpherson: '#ffb36b', 'double-wishbone': '#7fd3ff', multilink: '#b5e48c' };
const TOE_BEFORE = '#ece6d6';
/** Size of the wobble along each free motion: the wheel centre's move plus this many metres per radian of turn. */
const WOBBLE_M = 0.012;
const WOBBLE_LEVER_M = 0.3;
/** Roll centre heights kept for the trail on the front view. */
const TRAIL = 24;

// A typographic minus, as the rest of the page writes it.
const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');
const signed = (v: number, digits: number): string => {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${fmt(r, digits)}` : r < 0 ? `−${fmt(-r, digits)}` : fmt(0, digits);
};

/** The panel's part of the scene, under the readout of the travel. */
export const travelControlsHtml = (): string => `<section class="susp-travel-controls">
      <button type="button" class="btn" id="susp-lower" aria-pressed="false">${t('Занизити на 40 мм')}</button>
      <p class="susp-caption" id="susp-lower-caption"></p>
      <label class="susp-ctl" id="susp-tie-row">
        <span class="susp-ctl-head"><span>${t('Висота внутрішнього шарніра тяги')}</span><output id="susp-tie-value" for="susp-tie"></output></span>
        <input type="range" id="susp-tie" min="${-TIE_PAD_MM}" max="${TIE_PAD_MM}" step="1" value="0" />
      </label>
      <p class="susp-caption" id="susp-tie-caption"></p>
      <label class="susp-ctl" id="susp-rack-row">
        <span class="susp-ctl-head"><span>${t('Кермо')}</span><output id="susp-rack-value" for="susp-rack"></output></span>
        <input type="range" id="susp-rack" min="-1" max="1" step="0.01" value="0" />
      </label>
      <div class="susp-ctl">
        <span class="susp-ctl-head"><span>${t('Накласти криві')}</span></span>
        <div class="susp-overlays" id="susp-overlays">
          ${SUSPENSION_PAGES.map((p) => `<label class="check" data-page="${p.id}"><input type="checkbox" value="${p.id}" /> <i style="--c: ${PAGE_COLORS[p.id]}"></i>${pageName(p.id)}</label>`).join('')}
        </div>
      </div>
      <section class="susp-links" id="susp-links">
        <h3>${t('П’ять тяг, один рух')}</h3>
        <p>${t('Кожна тяга сталої довжини забирає в кулака один рух із шести. Знімай їх по одній і дивись, як кулак хитається вздовж рухів, що звільнилися.')}</p>
        <div class="susp-links-row">
          <button type="button" class="btn" id="susp-link-off">${t('Зняти тягу')}</button>
          <button type="button" class="btn" id="susp-links-back">${t('Повернути всі')}</button>
          <output id="susp-dof"></output>
        </div>
      </section>
    </section>`;

/** The scene's dash: the curves, the front view and the numbers. */
export const travelDashHtml = (): string => `<footer class="susp-dash susp-travel-dash" id="susp-travel-dash" hidden>
      <section class="susp-dash-chart">
        <div class="susp-strip-legend" id="susp-curve-legend"></div>
        <canvas id="susp-curves" role="img" aria-label="${t('Розвал, сходження, зсув плями контакту й висота центра крену залежно від ходу колеса')}"></canvas>
      </section>
      <section class="susp-fv-box">
        <h4>${t('Вид спереду')}</h4>
        <div class="susp-fv-host" id="susp-fv"></div>
      </section>
      <section class="susp-dash-numbers">
        <dl class="susp-numbers" id="susp-travel-numbers"></dl>
      </section>
    </footer>`;

export interface TravelSceneActions {
  lower(on: boolean): void;
  tie(dzM: number): void;
  rack(m: number): void;
  links(removed: readonly string[]): void;
}

interface Geometry {
  axle: Axle;
  curves: TravelCurves;
}

export class TravelScene {
  private readonly $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  private readonly chart: TravelChart;
  /** The other pages' own corners, built when first laid over. */
  private readonly overlayCache = new Map<SuspensionPageId, TravelCurves>();
  private readonly overlays = new Set<SuspensionPageId>();
  private choice!: PageChoice;
  private resolved!: ResolvedCorner;
  private own!: Geometry;
  /** The corner before the pad moved its tie rod, when it has. */
  private before: TravelCurves | null = null;
  private joints: JointRange | null = null;
  private rackRange = 0;
  private removed: string[] = [];
  private motions: Float64Array[] = [];
  private motionsAt = Number.NaN;
  private readonly pose = new Float64Array(POSE_SIZE);
  private readonly sample = newCornerSample();
  private drawnTravel = Number.NaN;
  private drawnRack = Number.NaN;
  private trail: number[] = [];

  constructor($: <T extends HTMLElement = HTMLElement>(id: string) => T, actions: TravelSceneActions) {
    this.$ = $;
    this.chart = new TravelChart($<HTMLCanvasElement>('susp-curves'));
    $('susp-lower').addEventListener('click', () => actions.lower($('susp-lower').getAttribute('aria-pressed') !== 'true'));
    $<HTMLInputElement>('susp-tie').addEventListener('input', (e) => actions.tie(Number((e.target as HTMLInputElement).value) / 1000));
    $<HTMLInputElement>('susp-rack').addEventListener('input', (e) => actions.rack(Number((e.target as HTMLInputElement).value) * this.rackRange));
    $('susp-overlays').addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      const id = box.value as SuspensionPageId;
      if (box.checked) this.overlays.add(id);
      else this.overlays.delete(id);
      this.setChart();
    });
    $('susp-link-off').addEventListener('click', () => {
      const next = linkRows(this.own.axle.spec).find((l) => !this.removed.includes(l.id));
      if (next) actions.links([...this.removed, next.id]);
    });
    $('susp-links-back').addEventListener('click', () => actions.links([]));
  }

  /** The rack travel the steering slider spans either way, m; 0 on an unsteered corner. */
  get rackM(): number {
    return this.rackRange;
  }

  /**
   * A new corner or setup: its curves, the curves before the tie-rod pad, the joints, the controls' state. `tieDzM` and
   * `removed` are the section's, so the controls show what the corner has.
   */
  setCorner(choice: PageChoice, resolved: ResolvedCorner, untouched: Axle | null, tieDzM: number, removed: readonly string[]): void {
    const changed = !this.resolved || resolved.axle !== this.resolved.axle;
    this.choice = choice;
    this.resolved = resolved;
    if (changed) {
      this.own = { axle: resolved.axle, curves: travelCurves(resolved.axle) };
      this.before = untouched ? travelCurves(untouched) : null;
      this.rackRange = resolved.axle.spec.linkage.rods.some((r) => r.steer) ? sceneRackRange(resolved.axle) : 0;
      this.joints = jointRange(resolved.axle, this.rackRange);
      this.trail = [];
    }
    // Another set of links taken away frees other motions: the next wobble computes them again.
    this.motionsAt = Number.NaN;
    this.removed = [...removed];
    const $ = this.$;
    const lowered = resolved.staticTravelM >= LOWER_M - 1e-6;
    $('susp-lower').setAttribute('aria-pressed', String(lowered));
    const tie = $<HTMLInputElement>('susp-tie');
    if (document.activeElement !== tie) tie.value = String(Math.round(tieDzM * 1000));
    $('susp-tie-value').textContent = t('{value} мм', { value: signed(tieDzM * 1000, 0) });
    $('susp-rack-row').hidden = this.rackRange === 0;
    for (const label of $('susp-overlays').querySelectorAll<HTMLElement>('label')) label.hidden = label.dataset.page === choice.page.id;
    this.overlays.delete(choice.page.id);
    $('susp-links').hidden = choice.page.id !== 'multilink';
    const rows = linkRows(resolved.axle.spec);
    $<HTMLButtonElement>('susp-link-off').disabled = this.removed.length >= rows.length;
    $<HTMLButtonElement>('susp-links-back').disabled = this.removed.length === 0;
    this.writeCaptions(tieDzM);
    this.setChart();
    this.drawnTravel = Number.NaN;
  }

  private setChart(): void {
    const id = this.choice.page.id;
    const series: ChartSeries[] = [{ curves: this.own.curves, color: PAGE_COLORS[id], faint: false }];
    if (this.before) series.push({ curves: this.before, color: TOE_BEFORE, faint: true, only: ['toe'] });
    for (const other of SUSPENSION_PAGES) {
      if (other.id === id || !this.overlays.has(other.id)) continue;
      let curves = this.overlayCache.get(other.id);
      if (!curves) {
        curves = travelCurves(new Axle(other.base.corner().axle));
        this.overlayCache.set(other.id, curves);
      }
      series.push({ curves, color: PAGE_COLORS[other.id], faint: true });
    }
    this.chart.set(series, this.resolved.staticTravelM);
    const key = (color: string, text: string, faint = false): string => `<span class="${faint ? 'faint' : ''}" style="--c: ${color}">${text}</span>`;
    this.$('susp-curve-legend').innerHTML = [
      key(PAGE_COLORS[id], this.choice.car ? this.choice.car.link.name : pageName(id)),
      ...(this.before ? [key(TOE_BEFORE, t('сходження до зсуву тяги'), true)] : []),
      ...SUSPENSION_PAGES.filter((p) => p.id !== id && this.overlays.has(p.id)).map((p) => key(PAGE_COLORS[p.id], pageName(p.id), true)),
      `<span class="susp-legend-dot">${t('крапка — авто в спокої')}</span>`,
    ].join('');
  }

  /** What lowering would do, and what the pad does now. */
  private writeCaptions(tieDzM: number): void {
    const c = this.own.curves;
    const q0 = this.resolved.staticTravelM;
    const lowered = q0 >= LOWER_M - 1e-6;
    const from = lowered ? q0 - LOWER_M : q0;
    const to = from + LOWER_M;
    const rc = (q: number): string => fmt(curveAt(c, 'rcHeight', q), 0);
    const gain = (q: number): string => signed(camberGainLeft(c, q), 2);
    const turn = camberReversal(c, from);
    const caption =
      turn === null
        ? t('Занижене авто стоїть на 40 мм вище по кривих. Центр крену: {from} → {to} мм. Набір розвалу до відбійника: {g0}° → {g1}°, розвороту немає.', { from: rc(from), to: rc(to), g0: gain(from), g1: gain(to) })
        : t('Занижене авто стоїть на 40 мм вище по кривих. Центр крену: {from} → {to} мм. Розвал набирається ще {g0}°, а заниженому лишається {g1}°: далі він повертає назад.', { from: rc(from), to: rc(to), g0: gain(from), g1: gain(to) });
    this.$('susp-lower-caption').textContent = caption;
    const steer = bumpSteerPer25(this.own.axle);
    this.$('susp-tie-caption').textContent =
      tieDzM === 0
        ? t('Підрулювання на ході: {value}° на 25 мм. Зсунь шарнір — крива сходження нахилиться.', { value: signed(steer, 2) })
        : t('Підрулювання на ході: {value}° на 25 мм. Так з’являється підрулювання на нерівностях: колесо саме повертає, коли йде вгору чи вниз.', { value: signed(steer, 2) });
  }

  /** The chart's line, the front view and the numbers at `travel` and `rack`, m; only what changed is drawn again. */
  frame(travel: number, rack: number): void {
    if (travel === this.drawnTravel && rack === this.drawnRack) return;
    this.drawnTravel = travel;
    this.drawnRack = rack;
    this.chart.draw(travel);
    const axle = this.own.axle;
    axle.tablePose(travel, this.pose);
    const res = axle.solver.solve(this.pose, travel, rack, 30);
    if (!res.ok) return;
    axle.measure(this.pose, travel, rack, this.sample);
    this.trail.push(this.sample.rcHeight);
    if (this.trail.length > TRAIL) this.trail.shift();
    const host = this.$('susp-fv');
    const box = host.getBoundingClientRect();
    host.innerHTML = frontViewSvg(
      { axle, pose: this.pose, sample: this.sample, rack, radiusM: this.resolved.tyre.freeRadiusM, tyreWidthM: this.resolved.tyre.widthM, trail: this.trail },
      { width: Math.max(80, Math.round(box.width || 200)), height: Math.max(60, Math.round(box.height || 150)), label: t('Вид спереду: ланки, миттєвий центр і центр крену') },
    );
    // The rack's travel; the wheel's angle is the toe laser's.
    this.$('susp-rack-value').textContent = t('{value} мм рейки', { value: signed(rack * 1000, 0) });
    this.writeNumbers();
  }

  private writeNumbers(): void {
    const s = this.sample;
    const c = this.own.curves;
    const q0 = this.resolved.staticTravelM;
    const rows: Array<[string, string, boolean]> = [
      [t('Центр крену зараз'), t('{value} мм', { value: fmt(s.rcHeight * 1000, 0) }), false],
      [t('Центр крену в спокої'), t('{value} мм', { value: fmt(curveAt(c, 'rcHeight', q0), 0) }), false],
    ];
    const turn = camberReversal(c, q0);
    rows.push([
      t('Розвал набирається'),
      turn === null ? t('до відбійника') : t('до {value} мм ходу, далі назад', { value: signed(turn * 1000, 0) }),
      false,
    ]);
    const j = this.joints;
    if (j) {
      rows.push([
        t('Внутрішній ШРУС: хід'),
        t('{min}…{max} мм із {lo}…{hi}', { min: signed(j.plunge[0] * 1000, 0), max: signed(j.plunge[1] * 1000, 0), lo: signed(j.limits.plunge[0] * 1000, 0), hi: signed(j.limits.plunge[1] * 1000, 0) }),
        j.plunge[0] < j.limits.plunge[0] || j.plunge[1] > j.limits.plunge[1],
      ]);
      rows.push([t('Внутрішній ШРУС: кут'), t('{value}° із {limit}°', { value: fmt(j.innerDeg, 0), limit: fmt(j.limits.innerDeg, 0) }), j.innerDeg > j.limits.innerDeg]);
      rows.push([
        this.rackRange > 0 ? t('Зовнішній ШРУС на повороті й стиску') : t('Зовнішній ШРУС: кут'),
        t('{value}° із {limit}°', { value: fmt(j.outerDeg, 0), limit: fmt(j.limits.outerDeg, 0) }),
        j.outerDeg > j.limits.outerDeg,
      ]);
    }
    if (this.choice.page.id === 'multilink') rows.push([t('Ступенів свободи кулака'), String(this.motions.length || 1), this.removed.length > 0]);
    this.$('susp-travel-numbers').innerHTML = rows
      .map(([label, value, alarm]) => `<div class="susp-number${alarm ? ' alarm' : ''}"><dt>${label}</dt><dd>${value}</dd></div>`)
      .join('');
    this.$('susp-dof').textContent = t('Ступенів свободи: {value}', { value: String(this.removed.length ? this.motions.length : 1) });
  }

  /**
   * The wobble for the links taken away at `travel`, at time `now` (s): a sum of the free motions, each on its own
   * slow sine, scaled to about a centimetre at the wheel. Null with every link in place.
   */
  wobble(travel: number, now: number, out: Float64Array): Float64Array | null {
    if (!this.removed.length) {
      this.motions = [];
      return null;
    }
    if (travel !== this.motionsAt) {
      this.motions = freeMotions(this.own.axle, travel, this.removed);
      this.motionsAt = travel;
    }
    out.fill(0);
    this.motions.forEach((v, i) => {
      const size = Math.hypot(v[0]!, v[1]!, v[2]!) + WOBBLE_LEVER_M * Math.hypot(v[3]!, v[4]!, v[5]!);
      const a = (WOBBLE_M / Math.max(size, 1e-9)) * Math.sin(now * (1.3 + 0.47 * i) + i * 1.7);
      for (let k = 0; k < 6; k++) out[k] = out[k]! + a * v[k]!;
    });
    return out;
  }

  /** Forgets the links taken away (a new corner), so the next frame draws the numbers again. */
  resetLinks(): void {
    this.removed = [];
    this.motions = [];
    this.motionsAt = Number.NaN;
  }

  resize(): void {
    this.chart.resize();
    this.drawnTravel = Number.NaN;
  }
}
