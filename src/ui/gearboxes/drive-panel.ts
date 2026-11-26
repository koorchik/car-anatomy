// The drive panel of the car mode (stage K3b; gearboxes plan, the dash): in the left panel, where the table has its
// settings. The helpers (the auto clutch, rev matching, shift hints), the road (grade and surface), the clutch's
// figures (slip, the plate's temperature, the heat of the last pull-away), the times to 100 km/h and over 400 m, the
// traction chart and the strip of the last ten seconds. Everything it shows comes from drive.snapshot() through
// DriveMeter and DriveStrip; the controls only send commands to the car on the crank.

import type { CarDrive } from '../../drivetrain/car-model.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { SURFACE_IDS, SURFACE_MU, type SurfaceId } from '../../vehicle/surface.ts';
import type { VehicleFrame } from '../../vehicle/vehicle-frame.ts';
import type { DynoRuns } from '../dyno/dyno-panel.ts';
import { StripChart, TractionChart } from './drive-charts.ts';
import { DriveMeter, DriveStrip } from './drive-meter.ts';
import { forceNow, traction } from './traction.ts';

/** The grade slider's range, %. */
export const GRADE_MAX = 30;
/** The charts are drawn this often, s: a figure a frame would cost more than it shows. */
const DRAW_S = 0.1;

const SURFACE_NAMES: Record<SurfaceId, () => string> = {
  dry: () => t('Сухий асфальт'),
  wet: () => t('Мокрий'),
  snow: () => t('Сніг'),
  ice: () => t('Лід'),
};

const fmt = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export interface DriveSettings {
  autoClutch: boolean;
  revMatch: boolean;
  hints: boolean;
  /** Grade, %, uphill positive. */
  gradePct: number;
  surface: SurfaceId;
}

export const DEFAULT_DRIVE_SETTINGS: DriveSettings = { autoClutch: true, revMatch: false, hints: true, gradePct: 0, surface: 'dry' };

/** The grade as an angle, rad: a 15 % grade rises 15 m in 100 m along the level. */
export const gradeRad = (pct: number): number => Math.atan(pct / 100);

/** The panel's content, put into its empty column (#gbx-drive, markup.ts) when the car mode loads. */
export const drivePanelHtml = (): string => `<section class="gbx-drive-block">
      <h3>${t('Помічники')}</h3>
      <label class="check"><input type="checkbox" id="gbx-auto-clutch" checked /> ${t('Автозчеплення')}</label>
      <p class="note" id="gbx-auto-clutch-note">${t('Вимкніть його, щоб рушати самому педаллю зчеплення (C) і газом.')}</p>
      <label class="check"><input type="checkbox" id="gbx-rev-match" /> ${t('Підгазовка')}</label>
      <p class="note">${t('Перемикаючи вниз, система піднімає оберти до тих, які матиме нижча передача, і зчеплення замикається без ривка.')}</p>
      <label class="check"><input type="checkbox" id="gbx-hints" checked /> ${t('Підказки перемикання')}</label>
    </section>
    <section class="gbx-drive-block">
      <h3>${t('Дорога')}</h3>
      <label class="gbx-drive-range">
        <span>${t('Ухил')} <b id="gbx-grade-value">0 %</b></span>
        <input type="range" id="gbx-grade" min="0" max="${GRADE_MAX}" step="1" value="0" />
      </label>
      <p class="gbx-drive-label">${t('Покриття')}</p>
      <div class="segmented gbx-surface" role="group" aria-label="${t('Покриття')}" id="gbx-surface">
        ${SURFACE_IDS.map((id) => `<button type="button" data-surface="${id}" aria-pressed="${id === 'dry'}">${SURFACE_NAMES[id]()}</button>`).join('')}
      </div>
    </section>
    <section class="gbx-drive-block">
      <h3>${t('Зчеплення')}</h3>
      <dl class="gbx-shafts gbx-drive-figures">
        <div><dt>${t('Ковзання')}</dt><dd id="gbx-clutch-slip">0</dd></div>
        <div><dt>${t('Температура диска')}</dt><dd id="gbx-clutch-temp"></dd></div>
        <div><dt>${t('Енергія за рушання')}</dt><dd id="gbx-clutch-launch"></dd></div>
        <div><dt>${t('Усього в диск')}</dt><dd id="gbx-clutch-total"></dd></div>
      </dl>
    </section>
    <section class="gbx-drive-block">
      <h3>${t('Розгін з місця')}</h3>
      <dl class="gbx-shafts gbx-drive-figures">
        <div><dt>${t('0–100 км/год')}</dt><dd id="gbx-to100">—</dd></div>
        <div><dt>${t('0–400 м')}</dt><dd id="gbx-to400">—</dd></div>
      </dl>
    </section>
    <section class="gbx-drive-block">
      <h3>${t('Тяга')}</h3>
      <p class="note">${t('Сила на колесах за швидкістю на повному газу в кожній передачі, кН. Пунктир — опір руху на цьому ухилі, крапка — авто зараз.')}</p>
      <canvas class="gbx-traction" id="gbx-traction" role="img" aria-label="${t('Тяга')}"></canvas>
      <p class="note" id="gbx-traction-source"></p>
    </section>
    <section class="gbx-drive-block">
      <h3>${t('Останні 10 с')}</h3>
      <canvas class="gbx-strip" id="gbx-strip" role="img" aria-label="${t('Останні 10 с')}"></canvas>
    </section>`;

export interface DrivePanelHost {
  settings(s: DriveSettings): void;
  /** The engine's page, for the note on where the traction curve comes from. */
  engineHref(): string;
  /** The last dyno runs in the shell's store, if any. */
  runs(): DynoRuns | undefined;
}

export class DrivePanel {
  readonly meter = new DriveMeter();
  readonly strip = new DriveStrip();
  readonly settings: DriveSettings = { ...DEFAULT_DRIVE_SETTINGS };
  private readonly root: HTMLElement;
  private readonly host: DrivePanelHost;
  private readonly tractionChart: TractionChart;
  private readonly stripChart: StripChart;
  private cd: CarDrive | null = null;
  /** The run and the grade the curves were built for. */
  private builtFor: { run: unknown; grade: number } = { run: undefined, grade: Number.NaN };
  private sinceDraw = DRAW_S;
  private shown = { slip: '', temp: '', launch: '', total: '', to100: '', to400: '' };

  constructor(root: HTMLElement, host: DrivePanelHost) {
    this.root = root;
    this.host = host;
    this.el('gbx-drive').innerHTML = drivePanelHtml();
    this.tractionChart = new TractionChart(this.el<HTMLCanvasElement>('gbx-traction'));
    this.stripChart = new StripChart(this.el<HTMLCanvasElement>('gbx-strip'));
    const changed = (): void => host.settings({ ...this.settings });
    this.el<HTMLInputElement>('gbx-auto-clutch').addEventListener('change', (event) => {
      this.settings.autoClutch = (event.target as HTMLInputElement).checked;
      changed();
    });
    this.el<HTMLInputElement>('gbx-rev-match').addEventListener('change', (event) => {
      this.settings.revMatch = (event.target as HTMLInputElement).checked;
      changed();
    });
    this.el<HTMLInputElement>('gbx-hints').addEventListener('change', (event) => {
      this.settings.hints = (event.target as HTMLInputElement).checked;
      changed();
    });
    this.el<HTMLInputElement>('gbx-grade').addEventListener('input', (event) => {
      this.settings.gradePct = Number((event.target as HTMLInputElement).value);
      this.showSettings();
      changed();
    });
    this.el('gbx-surface').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-surface]');
      if (!button) return;
      this.settings.surface = button.dataset.surface as SurfaceId;
      this.showSettings();
      changed();
    });
  }

  /** The road's surface under every wheel, as shares of dry friction. */
  surfaceMu(): [number, number, number, number] {
    const mu = SURFACE_MU[this.settings.surface];
    return [mu, mu, mu, mu];
  }

  /** Sets the controls (a demonstration changes them too) and tells the car. */
  set(patch: Partial<DriveSettings>): void {
    Object.assign(this.settings, patch);
    this.showSettings();
    this.host.settings({ ...this.settings });
  }

  /** A car on the crank: its curves, and the counters from zero. */
  enter(cd: CarDrive): void {
    this.cd = cd;
    this.meter.reset();
    this.strip.clear();
    this.builtFor = { run: undefined, grade: Number.NaN };
    this.showSettings();
    this.sinceDraw = DRAW_S;
  }

  leave(): void {
    this.cd = null;
  }

  /** The frame shown now: the counters, the figures and, a few times a second, the charts. */
  frame(f: VehicleFrame, rpm: number, dt: number, visible: boolean): void {
    const cd = this.cd;
    if (!cd) return;
    const fig = this.meter.step(f, dt);
    this.strip.step(f, rpm, dt);
    if (!visible) return;
    const s = this.shown;
    const set = (id: string, key: keyof typeof s, text: string): void => {
      if (text === s[key]) return;
      s[key] = text;
      this.el(id).textContent = text;
    };
    // An open clutch passes nothing: the engine and the input shaft turning apart is not slip that heats the disc
    // (open as car-readings.ts has it).
    set('gbx-clutch-slip', 'slip', f.clutch <= 0 ? t('розімкнене') : t('{rpm} об/хв', { rpm: fmt(Math.abs((f.clutchSlip * 30) / Math.PI)) }));
    set('gbx-clutch-temp', 'temp', t('{c} °C', { c: fmt(f.clutchC) }));
    set('gbx-clutch-launch', 'launch', t('{kj} кДж', { kj: fmt(fig.launchJ / 1000, 1) }));
    set('gbx-clutch-total', 'total', t('{kj} кДж', { kj: fmt(f.clutchJ / 1000, 1) }));
    set('gbx-to100', 'to100', fig.to100 === null ? '—' : t('{s} с', { s: fmt(fig.to100, 1) }));
    set('gbx-to400', 'to400', fig.to400 === null ? '—' : t('{s} с, {kmh} км/год', { s: fmt(fig.to400, 1), kmh: fmt(fig.kmhAt400 ?? 0) }));
    if ((this.sinceDraw += dt) < DRAW_S) return;
    this.sinceDraw = 0;
    this.buildCurves();
    this.tractionChart.draw(Math.abs(f.speed) * 3.6, forceNow(cd, f.driveNm), f.gear);
    this.stripChart.draw(this.strip);
  }

  /** The curves again when the grade or the latest dyno run changed. */
  private buildCurves(): void {
    const cd = this.cd!;
    const run = this.host.runs()?.current ?? null;
    const grade = this.settings.gradePct;
    if (run === this.builtFor.run && grade === this.builtFor.grade) return;
    this.builtFor = { run, grade };
    const tr = traction(cd, gradeRad(grade), run);
    this.tractionChart.setTraction(tr);
    this.el('gbx-traction-source').innerHTML =
      tr.source === 'dyno'
        ? t('Звідки ця крива: двигун на стенді. Момент узято з останнього заміру на сторінці двигуна.')
        : t('Момент узято з моделі двигуна. Зробіть замір на стенді на <a href="{href}">сторінці двигуна</a> на повному газу, і крива візьме його.', { href: this.host.engineHref() });
  }

  private showSettings(): void {
    const s = this.settings;
    this.el<HTMLInputElement>('gbx-auto-clutch').checked = s.autoClutch;
    this.el<HTMLInputElement>('gbx-rev-match').checked = s.revMatch;
    this.el<HTMLInputElement>('gbx-hints').checked = s.hints;
    this.el<HTMLInputElement>('gbx-grade').value = String(s.gradePct);
    this.el('gbx-grade-value').textContent = `${fmt(s.gradePct)} %`;
    for (const button of this.el('gbx-surface').querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.surface === s.surface));
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector<T>(`#${id}`)!;
  }
}
