// The dyno mode: readouts, live torque and power charts, the absorber's controls, the step test and the sweep.
// The physics lives in src/engine/dyno-load.ts and runs where the crank runs; this panel only sends commands and
// reads what the dyno's software would see.

import type { Drive, DriveSnapshot } from '../../audio/drive.ts';
import type { Design } from '../../designer/design.ts';
import type { Performance } from '../../designer/physics.ts';
import { absorberMax, freePedalFor, holdRange, sizeAbsorber, sweepEndRpm, sweepStartRpm, type AbsorberKind, type DynoCommand, type DynoSpec } from '../../engine/dyno-load.ts';
import type { Engine } from '../../engine/kinematics.ts';
import type { CrankReadings } from '../../engine/loaded-crank.ts';
import { PEDAL_TOP_SPEED } from '../../engine/sim.ts';
import { DynoRig } from '../../scene/dyno-rig.ts';
import type { EngineModel, ViewMode } from '../../scene/model-types.ts';
import type * as THREE from 'three';
import { HP_PER_KW, powerKw, type EngineTorqueMap } from '../../engine/torque-map.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { RpmChart, type ChartSeries } from '../designer/chart.ts';
import { publishedText } from '../published.ts';
import { catalogueTorqueMap, designTorqueMap } from './maps.ts';
import { RunRecorder, StepTest, peaksOf, shortfall, shownPoint, type Run, type RunKind } from './runs.ts';

export type DynoMode = 'off' | 'hold' | 'sweep';
export type EngineSource = { kind: 'catalogue' } | { kind: 'designer'; design: Design; perf: Performance };

export interface DynoHost {
  drive: Drive;
  /** Where the rig goes in the scene: beside the engine, not shaking with it. */
  extras: THREE.Group;
  /** Lowers the shadow floor when the rig stands below the engine's base. */
  setFloor(y: number): void;
  /** Relayout the page after the dash changed height. */
  layout(): void;
  /** Slow motion cannot run on the dyno. */
  leaveSlowMotion(): void;
  /** The dyno went on or off. */
  changed(on: boolean): void;
}

/** Lever arm from the absorber's axis to the load cell on this rig, m. */
export const ARM_M = 0.35;
/** An electric kettle, kW, to put the heat into everyday terms. */
const KETTLE_KW = 2;
/** Example temperature rise of the cooling water, K, for the flow it would take. */
const WATER_RISE_K = 40;
const WATER_HEAT = 4.186; // kJ/(kg·K)
const RATES = [150, 300, 600, 1200];
const THROTTLES = [1, 0.75, 0.5, 0.25];

const num = (v: number, digits = 0): string => {
  // A reading that rounds to zero is zero, not "-0".
  const shown = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
  return shown.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
const rpmText = (v: number): string => num(Math.round(v / 50) * 50);
const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const ABSORBER_NAMES: Record<AbsorberKind, string> = {
  eddy: t('Вихрострумове'),
  water: t('Гідравлічне'),
};

const STOP_TEXT: Record<NonNullable<Run['stopped']>, string> = {
  broken: t('Двигун зламався на {rpm} об/хв.'),
  stopped: t('Замір зупинено на {rpm} об/хв.'),
  engine: t('Двигун змінився, замір перервано на {rpm} об/хв.'),
  source: t('Звук увімкнувся або вкладку ховали посеред заміру, тому його перервано на {rpm} об/хв.'),
  'gave-up': t('Двигун більше не тягне на {rpm} об/хв.'),
};

export class DynoPanel {
  readonly element = document.createElement('section');
  readonly toggleButton = document.createElement('button');
  private readonly help = document.createElement('div');
  private readonly torqueChart = new RpmChart(t('Момент на стенді за обертами'));
  private readonly powerChart = new RpmChart(t('Потужність на стенді за обертами'));
  private readonly host: DynoHost;
  private readonly rig = new DynoRig();
  private model: EngineModel | null = null;
  private active = false;
  private engine: Engine | null = null;
  private source: EngineSource = { kind: 'catalogue' };
  private map: EngineTorqueMap | null = null;
  private spec: DynoSpec | null = null;
  private absorber: AbsorberKind = 'eddy';
  private mode: DynoMode = 'off';
  private holdRpm = 3000;
  private listening = false;
  private rate = 300;
  private stepThrottle = 1;
  private correction = false;
  private readonly recorder = new RunRecorder();
  private stepTest: StepTest | null = null;
  private sweeping = false;
  private sweepSeenRamp = false;
  private current: Run | null = null;
  private previous: Run | null = null;
  private window: CrankReadings[] = [];
  private last: CrankReadings | null = null;
  private shown = { rpm: 0, nm: 0, throttle: 0, manifold: 0 };
  private running = false;
  private lastSource: 'worklet' | 'local' | null = null;
  private notice = '';
  private noticeUntil = 0;
  private drawTimer = 0;
  private textTimer = 0;
  private dirty = true;
  private readonly $: (name: string) => HTMLElement;

  constructor(host: DynoHost) {
    this.host = host;
    host.extras.add(this.rig.group);
    this.toggleButton.type = 'button';
    this.toggleButton.className = 'btn';
    this.toggleButton.id = 'dyno-toggle';
    this.toggleButton.textContent = t('На стенд');
    this.toggleButton.setAttribute('aria-pressed', 'false');
    this.toggleButton.addEventListener('click', () => this.setActive(!this.active));

    this.element.className = 'dyno-col';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', t('Динамометричний стенд'));
    this.element.innerHTML = `
      <div class="dyno-tabs" role="tablist">
        <button type="button" role="tab" data-tab="chart" aria-selected="true">${t('Графік')}</button>
        <button type="button" role="tab" data-tab="readouts" aria-selected="false">${t('Покази')}</button>
        <div class="segmented dyno-which" role="group" aria-label="${t('Який графік')}">
          <button type="button" data-v="torque" aria-pressed="true">${t('Момент, Н·м')}</button>
          <button type="button" data-v="power" aria-pressed="false">${t('Потужність, к.с.')}</button>
        </div>
      </div>
      <div class="dyno-charts">
        <div class="dyno-chart dyno-torque">
          <div class="chart-title"><span>${t('Момент')}</span><span class="chart-unit">${t('Н·м')}</span></div>
        </div>
        <div class="dyno-chart dyno-power">
          <div class="chart-title"><span>${t('Потужність')}</span><span class="chart-unit">${t('к.с.')}</span></div>
        </div>
        <p class="dyno-summary" data-el="summary" aria-live="polite"></p>
      </div>
      <div class="dyno-info">
        <div class="dyno-readouts">
          <div class="dyno-big"><b data-el="rpm">0</b><span>${t('об/хв')}</span></div>
          <div class="dyno-big"><b data-el="nm">0</b><span>${t('Н·м')}</span></div>
          <div class="dyno-big"><b data-el="hp">0</b><span>${t('к.с.')}</span></div>
          <div class="dyno-small"><b data-el="kw">0</b><span>${t('кВт')}</span></div>
          <div class="dyno-small"><b data-el="throttle">0%</b><span>${t('Газ')}</span></div>
          <div class="dyno-small"><b data-el="manifold">0,0</b><span>${t('Колектор, бар')}</span></div>
        </div>
        <p class="dyno-formula" data-el="formula"></p>
        <p class="dyno-feel" data-el="feel"></p>
        <p class="dyno-status" data-el="status"></p>
        <p class="dyno-summary dyno-summary-phone" data-el="summary-phone"></p>
      </div>
      <div class="dyno-controls">
          <div class="dyno-row">
            <span class="tool-label">${t('Гальмо')}</span>
            <div class="segmented" role="group" aria-label="${t('Режим гальма')}" data-el="mode">
              <button type="button" data-v="off" aria-pressed="true">${t('Вимкнене')}</button>
              <button type="button" data-v="hold" aria-pressed="false">${t('Утримання')}</button>
              <button type="button" data-v="sweep" aria-pressed="false">${t('Розгін')}</button>
            </div>
          </div>
          <div class="dyno-row" data-el="hold-row" hidden>
            <button type="button" class="btn small" data-act="minus" aria-label="${t('На 250 об/хв менше')}">−250</button>
            <input type="range" data-el="hold-rpm" min="1000" max="7000" step="50" value="3000" aria-label="${t('Оберти, які тримає гальмо')}" />
            <button type="button" class="btn small" data-act="plus" aria-label="${t('На 250 об/хв більше')}">+250</button>
            <b class="dyno-hold-value" data-el="hold-value"></b>
          </div>
          <div class="dyno-row" data-el="hold-row2" hidden>
            <button type="button" class="btn small" data-act="point">${t('Записати точку')}</button>
            <button type="button" class="btn small" data-act="steps">${t('Пройти точки')}</button>
            <select class="param-select small" data-el="step-throttle" aria-label="${t('Газ для точок')}">
              ${THROTTLES.map((v) => `<option value="${v}">${Math.round(v * 100)}%</option>`).join('')}
            </select>
          </div>
          <div class="dyno-row" data-el="hold-row3" hidden>
            <button type="button" class="btn small" data-act="listen" aria-pressed="false">${t('Послухати без навантаження')}</button>
          </div>
          <div class="dyno-row" data-el="sweep-row" hidden>
            <select class="param-select small" data-el="rate" aria-label="${t('Темп розгону')}">
              ${RATES.map((v) => `<option value="${v}"${v === 300 ? ' selected' : ''}>${t('{rate} об/хв за с', { rate: v })}</option>`).join('')}
            </select>
            <button type="button" class="btn small dyno-go" data-act="sweep">${t('Пуск')}</button>
            <span class="dyno-range" data-el="range"></span>
          </div>
          <div class="dyno-row">
            <div class="segmented" role="group" aria-label="${t('Тип гальма')}" data-el="absorber">
              <button type="button" data-v="eddy" aria-pressed="true">${ABSORBER_NAMES.eddy}</button>
              <button type="button" data-v="water" aria-pressed="false">${ABSORBER_NAMES.water}</button>
            </div>
          </div>
          <div class="dyno-row">
            <label class="check dyno-check"><input type="checkbox" data-el="correction" /> <span data-el="correction-label"></span></label>
          </div>
          <div class="dyno-row">
            <button type="button" class="btn small" data-act="clear">${t('Очистити')}</button>
            <button type="button" class="btn small" data-act="help">${t('Як читати стенд')}</button>
          </div>
      </div>`;
    this.$ = (name: string): HTMLElement => this.element.querySelector(`[data-el="${name}"]`)!;
    this.element.querySelector('.dyno-torque')!.append(this.torqueChart.element);
    this.element.querySelector('.dyno-power')!.append(this.powerChart.element);
    this.element.classList.add('tab-chart', 'show-torque');
    this.wire();

    this.help.className = 'dyno-help';
    this.help.hidden = true;
    this.help.setAttribute('role', 'dialog');
    this.help.setAttribute('aria-modal', 'true');
    this.help.setAttribute('aria-label', t('Як читати стенд'));
    document.body.append(this.help);
  }

  get isActive(): boolean {
    return this.active;
  }

  private wire(): void {
    const el = this.element;
    el.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button');
      if (!button) return;
      const group = button.parentElement?.dataset.el;
      if (group === 'mode' && button.dataset.v) this.setMode(button.dataset.v as DynoMode);
      else if (group === 'absorber' && button.dataset.v) this.setAbsorber(button.dataset.v as AbsorberKind);
      else if (button.dataset.tab) this.setTab(button.dataset.tab);
      else if (button.parentElement?.classList.contains('dyno-which') && button.dataset.v) this.showChart(button.dataset.v);
      switch (button.dataset.act) {
        case 'minus':
          this.setHold(this.holdRpm - 250);
          break;
        case 'plus':
          this.setHold(this.holdRpm + 250);
          break;
        case 'point':
          this.recordPoint();
          break;
        case 'steps':
          if (this.stepTest) this.stopStepTest();
          else this.startStepTest();
          break;
        case 'listen':
          this.setListening(!this.listening);
          break;
        case 'sweep':
          if (this.sweeping) this.stopSweep();
          else this.startSweep();
          break;
        case 'clear':
          this.clearRuns();
          break;
        case 'help':
          this.openHelp();
          break;
      }
    });
    const slider = this.$('hold-rpm') as HTMLInputElement;
    slider.addEventListener('input', () => this.setHold(Number(slider.value)));
    const rate = this.$('rate') as HTMLSelectElement;
    rate.addEventListener('change', () => {
      this.rate = Number(rate.value);
      this.refreshControls();
    });
    const throttle = this.$('step-throttle') as HTMLSelectElement;
    throttle.addEventListener('change', () => {
      this.stepThrottle = Number(throttle.value);
    });
    const correction = this.$('correction') as HTMLInputElement;
    correction.addEventListener('change', () => {
      this.correction = correction.checked;
      this.dirty = true;
      this.refreshSummary();
    });
    this.help.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === this.help || target.closest('[data-act="close-help"]')) this.help.hidden = true;
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.help.hidden) this.help.hidden = true;
    });
  }

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.toggleButton.textContent = on ? t('Зняти зі стенда') : t('На стенд');
    this.toggleButton.setAttribute('aria-pressed', String(on));
    this.element.hidden = !on;
    document.body.classList.toggle('dyno-mode', on);
    const drive = this.host.drive;
    if (on) {
      this.host.leaveSlowMotion();
      this.mode = 'off';
      this.listening = false;
      this.prepare();
      this.lastSource = drive.readingsSource;
    } else {
      this.abortRun('stopped');
      drive.setLoad(null);
      drive.setTorqueMap(null);
      this.map = null;
      this.spec = null;
      this.rig.detach();
      this.host.setFloor(0);
    }
    this.refreshControls();
    this.host.changed(on);
    this.host.layout();
    this.dirty = true;
  }

  /** The engine on the page changed. On the dyno the map and the absorber follow it. */
  setEngine(engine: Engine, source: EngineSource): void {
    this.engine = engine;
    this.source = source;
    if (!this.active) return;
    const wasRunning = this.recorder.run && (this.sweeping || this.stepTest);
    if (wasRunning) this.abortRun('engine');
    this.prepare();
    if (this.mode === 'hold') this.sendHold();
    this.dirty = true;
  }

  private prepare(): void {
    if (!this.engine) return;
    this.map = this.source.kind === 'designer' ? designTorqueMap(this.source.design, this.source.perf) : catalogueTorqueMap(this.engine.spec);
    this.spec = sizeAbsorber(this.map, this.absorber);
    const range = holdRange(this.spec);
    this.holdRpm = Math.min(range.max, Math.max(range.min, Math.round((0.45 * this.map.limitRpm) / 50) * 50));
    const slider = this.$('hold-rpm') as HTMLInputElement;
    slider.min = String(Math.ceil(range.min / 50) * 50);
    slider.max = String(Math.floor(range.max / 50) * 50);
    slider.value = String(this.holdRpm);
    this.host.drive.setTorqueMap(this.map);
    this.host.drive.setLoad(this.spec);
    this.placeRig();
    this.sendMode();
    this.setFrames();
    this.refreshControls();
  }

  /** The 3D model was rebuilt: the rig goes behind its flywheel. */
  attachModel(model: EngineModel): void {
    this.model = model;
    if (this.active) this.placeRig();
  }

  private placeRig(): void {
    if (!this.model || !this.spec) return;
    this.rig.attach(this.model, this.spec);
    this.host.setFloor(this.rig.floorY);
  }

  setView(view: ViewMode): void {
    this.rig.setView(view);
  }

  setExplode(amount: number): void {
    this.rig.setExplode(amount);
  }

  private command(cmd: DynoCommand): void {
    this.host.drive.loadCommand(cmd);
  }

  private sendMode(): void {
    if (this.mode === 'hold') this.sendHold();
    else this.command({ kind: 'dyno', action: 'off' });
  }

  private sendHold(): void {
    if (!this.spec || !this.engine) return;
    if (this.listening) {
      const s = this.engine.spec;
      this.command({ kind: 'dyno', action: 'free', pedal: freePedalFor(this.holdRpm, s.idleRpm, s.redlineRpm, PEDAL_TOP_SPEED) });
    } else {
      this.command({ kind: 'dyno', action: 'hold', rpm: this.holdRpm, throttle: null, keep: true });
    }
  }

  private setMode(mode: DynoMode): void {
    if (mode === this.mode) return;
    this.stopStepTest();
    if (this.sweeping) this.stopSweep();
    this.mode = mode;
    this.listening = false;
    this.sendMode();
    this.refreshControls();
    this.host.layout();
  }

  private setAbsorber(kind: AbsorberKind): void {
    if (kind === this.absorber) return;
    if (this.sweeping || this.stepTest) this.abortRun('stopped');
    this.absorber = kind;
    if (this.active) this.prepare();
    this.dirty = true;
  }

  private setHold(rpm: number): void {
    if (!this.spec) return;
    const range = holdRange(this.spec);
    this.holdRpm = Math.min(range.max, Math.max(range.min, Math.round(rpm / 50) * 50));
    (this.$('hold-rpm') as HTMLInputElement).value = String(this.holdRpm);
    if (this.mode === 'hold' && !this.stepTest) this.sendHold();
    this.refreshControls();
  }

  private setListening(on: boolean): void {
    if (this.mode !== 'hold' || this.stepTest) return;
    this.listening = on;
    this.sendHold();
    this.refreshControls();
  }

  private setTab(tab: string): void {
    this.element.classList.toggle('tab-chart', tab === 'chart');
    this.element.classList.toggle('tab-readouts', tab === 'readouts');
    this.element.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  }

  private showChart(which: string): void {
    this.element.classList.toggle('show-torque', which === 'torque');
    this.element.classList.toggle('show-power', which === 'power');
    this.element.querySelectorAll<HTMLButtonElement>('.dyno-which button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === which)));
  }

  private engineName(): string {
    if (this.source.kind === 'designer') return this.source.design.name;
    return this.engine?.spec.example ?? '';
  }

  /** A new run moves the last one to "previous", so the two can be compared. */
  private beginRun(kind: RunKind, rate: number | null, throttle: number | null, recordFrom = 0): void {
    const finished = this.recorder.run ? this.recorder.finish() : null;
    const latest = finished && finished.points.length ? finished : this.current;
    if (latest && latest.points.length) this.previous = latest;
    this.current = null;
    this.recorder.begin(kind, { engine: this.engineName(), absorber: this.absorber, rate, throttle }, this.map?.inertia ?? 0, recordFrom);
    this.dirty = true;
  }

  private finishRun(): void {
    const run = this.recorder.finish();
    if (run) this.current = run;
    this.sweeping = false;
    this.stepTest = null;
    this.refreshControls();
    this.refreshSummary();
    this.dirty = true;
  }

  private startSweep(): void {
    if (!this.map || !this.spec || !this.running) return;
    const from = sweepStartRpm(this.map, this.spec);
    const to = sweepEndRpm(this.spec);
    this.listening = false;
    this.beginRun('sweep', this.rate, 1, from + Math.max(200, 0.4 * this.rate));
    this.command({ kind: 'dyno', action: 'sweep', fromRpm: from, toRpm: to, rate: this.rate, throttle: 1 });
    this.sweeping = true;
    this.sweepSeenRamp = false;
    this.refreshControls();
  }

  private stopSweep(): void {
    if (!this.sweeping) return;
    this.recorder.stop('stopped', this.shown.rpm);
    this.command({ kind: 'dyno', action: 'abort' });
    this.finishRun();
  }

  private startStepTest(): void {
    if (!this.map || !this.spec || !this.running) return;
    this.listening = false;
    this.stepTest = new StepTest(this.map, sweepStartRpm(this.map, this.spec), sweepEndRpm(this.spec), this.stepThrottle);
    this.beginRun('steps', null, this.stepThrottle);
    this.command(this.stepTest.start());
    this.refreshControls();
  }

  private stopStepTest(): void {
    if (!this.stepTest) return;
    this.recorder.stop('stopped', this.shown.rpm);
    this.finishRun();
    this.sendMode();
  }

  private recordPoint(): void {
    if (!this.running || !this.window.length || this.listening) return;
    if (this.recorder.run?.kind !== 'points') this.beginRun('points', null, null);
    this.recorder.addPoint(this.window);
    this.refreshSummary();
    this.dirty = true;
  }

  private clearRuns(): void {
    if (this.sweeping || this.stepTest) return;
    this.recorder.finish();
    this.current = null;
    this.previous = null;
    this.refreshSummary();
    this.setFrames();
    this.dirty = true;
  }

  /** Something outside the dyno ended the run: the engine broke or stopped, or changed. */
  abort(reason: 'broken' | 'stopped' | 'engine'): void {
    this.abortRun(reason);
  }

  private abortRun(reason: NonNullable<Run['stopped']>): void {
    if (!this.recorder.run || !(this.sweeping || this.stepTest || reason === 'broken')) return;
    this.recorder.stop(reason, this.shown.rpm);
    if (this.sweeping) this.command({ kind: 'dyno', action: 'abort' });
    this.finishRun();
    if (this.mode === 'hold') {
      this.mode = 'off';
      this.command({ kind: 'dyno', action: 'off' });
    }
    this.refreshControls();
  }

  /** Called every frame. */
  frame(snap: DriveSnapshot, theta: number, dt: number): void {
    if (!this.active) return;
    this.rig.update(theta, this.last?.coupled ? this.last.load.absorberShare : 0);
    const drive = this.host.drive;
    const wasRunning = this.running;
    this.running = snap.state === 'running';
    if (wasRunning !== this.running) this.refreshControls();
    const source = drive.readingsSource;
    if (source !== this.lastSource) {
      if (this.sweeping || this.stepTest) this.abortRun('source');
      this.lastSource = source;
    }
    if (!this.running && (this.sweeping || this.stepTest)) this.abortRun('stopped');

    for (const reading of drive.takeReadings()) this.take(reading);
    const r = this.last;
    if (r) {
      const k = Math.min(1, dt / 0.25);
      const nm = r.coupled ? r.load.measuredNm + (this.correction && this.map ? this.map.inertia * r.load.alpha : 0) : 0;
      this.shown.rpm = snap.rpm;
      this.shown.nm += (nm - this.shown.nm) * k;
      this.shown.throttle += (r.load.throttle - this.shown.throttle) * Math.min(1, dt / 0.1);
      this.shown.manifold += (r.manifoldBar - this.shown.manifold) * k;
    }
    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 0.1;
      this.refreshReadouts();
    }
    this.drawTimer -= dt;
    if (this.drawTimer <= 0 || this.dirty) {
      this.drawTimer = 0.12;
      this.redraw();
    }
  }

  private take(reading: CrankReadings): void {
    if (reading.samples <= 0) return;
    this.last = reading;
    this.window.push(reading);
    let seconds = this.window.reduce((s, r) => s + r.load.seconds, 0);
    while (this.window.length > 1 && seconds - this.window[0]!.load.seconds >= 1) {
      seconds -= this.window[0]!.load.seconds;
      this.window.shift();
    }
    if (this.sweeping) {
      this.recorder.push(reading);
      const phase = reading.load.phase;
      if (phase === 'ramp') this.sweepSeenRamp = true;
      if (this.sweepSeenRamp && (phase === 'rampdown' || phase === 'off')) {
        if (reading.load.gaveUp) this.recorder.stop('gave-up', reading.load.rpm);
        this.finishRun();
      }
      this.dirty = true;
    }
    if (this.stepTest) {
      const out = this.stepTest.push(reading);
      if (out.point) {
        this.recorder.addPoint(out.point.readings, out.point.settled);
        this.refreshSummary();
        this.dirty = true;
      }
      if (out.command) this.command(out.command);
      if (this.stepTest.done) {
        this.finishRun();
        this.sendMode();
      }
    }
  }

  private shownRun(): Run | null {
    return this.recorder.run ?? this.current;
  }

  /** Axes that hold the whole page's comparison: this engine, the previous run, the published figures. */
  private setFrames(): void {
    const map = this.map;
    if (!map) return;
    const runs = [this.previous, this.current].filter((r): r is Run => !!r);
    const runRpm = Math.max(0, ...runs.flatMap((r) => r.points.map((p) => p.rpm)));
    const runNm = Math.max(0, ...runs.flatMap((r) => r.points.map((p) => shownPoint(p, true).nm)));
    const runHp = Math.max(0, ...runs.flatMap((r) => r.points.map((p) => shownPoint(p, true).hp)));
    const published = map.anchor.published ?? this.publishedForDesigner();
    const xMax = Math.max(map.limitRpm, runRpm) * 1.03;
    const topNm = Math.max(...map.wotNm, runNm, published?.torqueNm ?? 0);
    const topHp = Math.max(...map.wotNm.map((nm, i) => powerKw(nm, map.rpm[i]!) * HP_PER_KW), runHp, published?.powerHp ?? 0);
    this.torqueChart.setFrame({ xMax, yMax: topNm * 1.1 });
    this.powerChart.setFrame({ xMax, yMax: topHp * 1.1 });
  }

  private publishedForDesigner(): { powerHp: number; powerRpm: number | null; torqueNm: number | null; torqueRpm: number | null } | null {
    return this.source.kind === 'designer' ? (this.source.design.factory?.published ?? null) : null;
  }

  private redraw(): void {
    this.dirty = false;
    const map = this.map;
    if (!map) return;
    this.setFrames();
    const run = this.shownRun();
    const series = (r: Run | null, of: 'nm' | 'hp'): ChartSeries => {
      if (!r || r.kind !== 'sweep') return { x: [], y: [] };
      const shown = r.points.map((p) => shownPoint(p, this.correction));
      return { x: shown.map((p) => p.rpm), y: shown.map((p) => p[of]) };
    };
    const dots = (r: Run | null, of: 'nm' | 'hp'): Array<{ x: number; y: number; hollow?: boolean }> =>
      r && r.kind !== 'sweep' ? r.points.map((p) => shownPoint(p, this.correction)).map((p) => ({ x: p.rpm, y: p[of], hollow: !p.settled })) : [];
    const published = map.anchor.published ?? this.publishedForDesigner();
    const reference = (of: 'nm' | 'hp'): ChartSeries => ({ x: map.rpm, y: map.wotNm.map((nm, i) => (of === 'nm' ? nm : powerKw(nm, map.rpm[i]!) * HP_PER_KW)) });
    const markers = (of: 'nm' | 'hp'): Array<{ x: number; y: number }> => {
      if (!published) return [];
      if (of === 'nm') return published.torqueNm !== null && published.torqueRpm !== null ? [{ x: published.torqueRpm, y: published.torqueNm }] : [];
      return published.powerRpm !== null ? [{ x: published.powerRpm, y: published.powerHp }] : [];
    };
    const previousSeries = (of: 'nm' | 'hp'): ChartSeries | null => {
      const p = this.previous;
      if (!p) return null;
      const shown = p.points.map((pt) => shownPoint(pt, this.correction));
      return { x: shown.map((s) => s.rpm), y: shown.map((s) => s[of]) };
    };
    for (const [chart, of, unit] of [
      [this.torqueChart, 'nm', t('Н·м')],
      [this.powerChart, 'hp', t('к.с.')],
    ] as const) {
      chart.setOverlay({ reference: reference(of), dots: [...dots(this.previous, of).map((d) => ({ ...d, hollow: true })), ...dots(run, of)], markers: markers(of) });
      chart.setData(series(run, of), previousSeries(of), unit, 0, true);
      chart.setMarker(this.shown.rpm);
    }
  }

  private refreshReadouts(): void {
    const r = this.last;
    const rpm = this.shown.rpm;
    const nm = this.shown.nm;
    const kw = powerKw(nm, rpm);
    const hp = kw * HP_PER_KW;
    this.$('rpm').textContent = rpmText(rpm);
    this.$('nm').textContent = num(nm);
    this.$('hp').textContent = num(hp);
    this.$('kw').textContent = num(kw);
    const auto = r?.load.automatic ? ` ${t('авто')}` : '';
    this.$('throttle').textContent = `${num(this.shown.throttle * 100)}%${auto}`;
    const manifold = this.shown.manifold;
    this.$('manifold').textContent = `${manifold > 0.005 ? '+' : manifold < -0.005 ? '−' : ''}${num(Math.abs(manifold), 2)}`;
    this.$('formula').textContent = t('{kw} кВт = {nm} Н·м × {rpm} об/хв ÷ 9549 = {hp} к.с.', { kw: num(kw), nm: num(nm), rpm: num(rpm), hp: num(hp) });
    const force = nm / ARM_M;
    const kettles = kw / KETTLE_KW;
    const litres = (kw / (WATER_HEAT * WATER_RISE_K)) * 60;
    this.$('feel').textContent = t('Датчик: {n} Н ({kg} кг) на важелі {arm} м. Тепло у воду: {kw} кВт, як {kettles} чайників; на {rise} °C нагріву це {litres} л/хв.', {
      n: num(force),
      kg: num(force / 9.81),
      arm: num(ARM_M, 2),
      kw: num(kw),
      kettles: num(kettles),
      rise: WATER_RISE_K,
      litres: num(litres),
    });
    this.$('status').textContent = this.statusText(r);
    this.refreshSummary();
  }

  private statusText(r: CrankReadings | null): string {
    const now = performance.now();
    if (this.notice && now < this.noticeUntil) return this.notice;
    if (!this.running) return t('Запусти двигун, щоб почати замір.');
    const map = this.map;
    const spec = this.spec;
    const lines: string[] = [];
    if (r?.load.tracking === 'absorber-weak') lines.push(t('{absorber} гальмо не втримує стільки моменту на цих обертах.', { absorber: ABSORBER_NAMES[this.absorber] }));
    else if (r?.load.tracking === 'engine-weak' && this.mode === 'hold' && !this.stepTest) lines.push(t('Двигун не тягне на цих обертах: гальмо вже відпущене до мінімуму.'));
    if (this.stepTest) {
      const p = this.stepTest.progress;
      lines.push(t('Точка {index} з {count}: стенд чекає, поки все встоїться.', { index: p.index + 1, count: p.count }));
    } else if (this.sweeping) {
      lines.push(t('Розгін іде: газ відкриває автоматика.'));
    } else if (this.mode === 'off' && map && spec) {
      lines.push(t('Гальмо вимкнене: двигун крутить ще й ротор гальма, тому розганяється в {ratio} раза повільніше, а стенд нічого не міряє.', { ratio: num((map.inertia + spec.inertia) / map.inertia, 1) }));
    } else if (this.mode === 'hold' && this.listening) {
      lines.push(t('Гальмо відпустило двигун, а газ тримає ті самі оберти без навантаження. Порівняй звук.'));
    } else if (this.mode === 'hold') {
      lines.push(t('Педаль задає газ: у боксі заслінку відкриває привод, повний хід за секунду.'));
    }
    return lines.filter(Boolean).join(' ');
  }

  /** Where the numbers come from: the article's figures on a catalogue page, the model in the designer. */
  private originText(): string {
    const map = this.map;
    if (!map) return '';
    const a = map.anchor;
    if (a.published) {
      const model = t('Модель без цього дає {hp} к.с. і {nm} Н·м.', { hp: num(a.modelHp), nm: num(a.modelNm) });
      if (Math.abs(a.scale - 1) < 0.005 && Math.abs(a.modelHp / a.published.powerHp - 1) < 0.005) return t('Збігається з заводськими {figures}.', { figures: publishedText(a.published) });
      if (a.clamped) return `${t('Модель надто далека від заводських цифр ({figures}), тому їх досягнуто лише частково.', { figures: publishedText(a.published) })} ${model}`;
      return `${t('Приведено до заводських {figures}.', { figures: publishedText(a.published) })} ${model}`;
    }
    const published = this.publishedForDesigner();
    if (published) return t('Стенд показує модель конструктора, кола на графіку — заводські дані ({figures}).', { figures: publishedText(published) });
    return t('Стенд показує модель конструктора.');
  }

  private refreshSummary(): void {
    const run = this.shownRun();
    const el = this.$('summary');
    if (!run || !run.points.length) {
      const previous = this.previous ? t('Пунктир: попередній замір, {engine}.', { engine: this.previous.engine }) : '';
      const text = [previous, this.originText()].filter(Boolean).join(' ');
      if (el.textContent !== text) el.textContent = text;
      this.$('summary-phone').textContent = text;
      return;
    }
    const corrected = peaksOf(run, true)!;
    const raw = peaksOf(run, false)!;
    const parts: string[] = [];
    if (run.kind === 'sweep') {
      parts.push(
        t('Виміряно {nm} Н·м при {rpm} об/хв; ще {inertia} Н·м пішло на розгін маховика (J·ε); з поправкою {corrected} Н·м.', {
          nm: num(raw.torque.nm),
          rpm: rpmText(raw.torque.rpm),
          inertia: num(corrected.inertiaNm, 1),
          corrected: num(corrected.torque.nm),
        }),
      );
      const peaks = this.correction ? corrected : raw;
      parts.push(t('{hp} к.с. при {rpm} об/хв.', { hp: num(peaks.power.hp), rpm: rpmText(peaks.power.rpm) }));
      if (this.map && this.map.boostKind === 'turbo' && shortfall(run, this.map) > 0.02) {
        parts.push(t('На такому темпі турбіна не встигає: усталена крива вища на {share}%.', { share: num(shortfall(run, this.map) * 100) }));
      }
    } else {
      const peaks = this.correction ? corrected : raw;
      parts.push(t('Найбільше {nm} Н·м при {rpm1} об/хв, {hp} к.с. при {rpm2} об/хв.', { nm: num(peaks.torque.nm), rpm1: rpmText(peaks.torque.rpm), hp: num(peaks.power.hp), rpm2: rpmText(peaks.power.rpm) }));
      if (run.points.some((p) => !p.settled)) parts.push(t('Порожні точки не встигли встоятися.'));
    }
    if (run.stopped && run.stoppedAt !== null) parts.push(STOP_TEXT[run.stopped].replace('{rpm}', rpmText(run.stoppedAt)));
    if (this.previous) parts.push(t('Пунктир: попередній замір, {engine}.', { engine: this.previous.engine }));
    parts.push(this.originText());
    const text = parts.join(' ');
    if (el.textContent !== text) el.textContent = text;
    this.$('summary-phone').textContent = text;
  }

  private refreshControls(): void {
    const el = this.element;
    el.querySelectorAll<HTMLButtonElement>('[data-el="mode"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === this.mode)));
    el.querySelectorAll<HTMLButtonElement>('[data-el="absorber"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === this.absorber)));
    this.$('hold-row').hidden = this.mode !== 'hold';
    this.$('hold-row2').hidden = this.mode !== 'hold';
    this.$('hold-row3').hidden = this.mode !== 'hold';
    this.$('sweep-row').hidden = this.mode !== 'sweep';
    this.$('hold-value').textContent = t('{rpm} об/хв', { rpm: num(this.holdRpm) });
    (this.$('hold-rpm') as HTMLInputElement).setAttribute('aria-valuetext', t('{rpm} об/хв', { rpm: num(this.holdRpm) }));
    const busy = this.sweeping || !!this.stepTest;
    const steps = el.querySelector<HTMLButtonElement>('[data-act="steps"]')!;
    steps.textContent = this.stepTest ? t('Стоп') : t('Пройти точки');
    steps.disabled = !this.running && !this.stepTest;
    el.querySelector<HTMLButtonElement>('[data-act="point"]')!.disabled = !this.running || busy || this.listening;
    const listen = el.querySelector<HTMLButtonElement>('[data-act="listen"]')!;
    listen.textContent = this.listening ? t('Повернути гальмо') : t('Послухати без навантаження');
    listen.setAttribute('aria-pressed', String(this.listening));
    listen.disabled = busy;
    const go = el.querySelector<HTMLButtonElement>('[data-act="sweep"]')!;
    go.textContent = this.sweeping ? t('Стоп') : t('Пуск');
    go.disabled = !this.running && !this.sweeping;
    el.querySelector<HTMLButtonElement>('[data-act="clear"]')!.disabled = busy;
    if (this.map && this.spec) {
      this.$('range').textContent = t('з {from} до {to} об/хв', { from: num(sweepStartRpm(this.map, this.spec)), to: num(Math.round(sweepEndRpm(this.spec) / 50) * 50) });
      this.$('correction-label').textContent = t('Поправка на інерцію, J = {j} кг·м²', { j: num(this.map.inertia, 3) });
    }
    this.refreshSummary();
  }

  private openHelp(): void {
    const spec = this.spec;
    const sheet = spec
      ? t('Листок цього стенда: {absorber} гальмо, {nm} Н·м, {kw} кВт, до {rpm} об/хв, ротор {j} кг·м². Умови 25 °C і 99 кПа сухого повітря, поправка 1,00. Згладжування 25 об/хв.', {
          absorber: ABSORBER_NAMES[spec.absorber].toLowerCase(),
          nm: num(spec.ratedNm),
          kw: num(spec.ratedKw),
          rpm: num(spec.maxRpm),
          j: num(spec.inertia, 3),
        })
      : '';
    const max = spec ? absorberMax(spec, Math.max(1, this.holdRpm)) : 0;
    const paragraphs = [
      t('Двигун крутить ротор гальма. Корпус гальма підвішено на опорах, і момент, з яким ротор тягне його за собою, тримає тензодатчик на важелі. Це і є виміряний момент. Потужність стенд не міряє, а рахує: P = M × n ÷ 9549, у кіловатах, а 1 к.с. дорівнює 0,7355 кВт.'),
      t('Вихрострумове гальмо: у роторі, що обертається в полі котушок, виникають вихрові струми й гальмують його. Струм котушок змінюється за десяті частки секунди, тому стенд швидко тримає задані оберти. Крутити двигун таке гальмо не вміє, лише гальмує. На дуже низьких обертах сили в нього мало, далі межу ставить найбільший момент, а ще вище найбільша потужність, яку встигає відвести охолодна вода.'),
      t('Гідравлічне гальмо: ротор збиває воду в корпусі. Повне води гальмо тримає момент, що росте з квадратом обертів, тому на низьких обертах воно слабке, і повний газ на 1500 об/хв воно не втримає. Воду додають і зливають клапаном, тому гальмо відповідає повільніше, і регулятор стенда мусить випереджати його. Зате воно легше й дешевше на ту саму потужність.'),
      spec ? t('Зараз на {rpm} об/хв це гальмо втримає щонайбільше {nm} Н·м.', { rpm: num(this.holdRpm), nm: num(max) }) : '',
      t('Утримання обертів: гальмо тримає оберти, а газ задаєш ти. Коли все встоялося, момент двигуна дорівнює моменту гальма. Так знімають точні точки, і саме так видно, як турбіна за секунду-дві набирає тиск, на низьких обертах довше.'),
      t('Розгін: стенд піднімає оберти з однаковим темпом, найчастіше від 300 до 600 об/хв за секунду. Частина моменту йде на розкручування маховика й колінвала, тому крива виходить нижчою, ніж в усталеному режимі, на J × ε. Програма стенда може повернути цю частку, якщо знає інерцію. Турбодвигун на швидкому розгоні ще й не встигає набрати наддув.'),
      t('Чому пік потужності завжди на вищих обертах, ніж пік моменту: там, де момент перестає рости, потужність ще росте, бо оберти далі збільшуються.'),
      t('Чому двигун нахиляється: гальмо тримає ротор, а двигун так само сильно тягне назад свій корпус. Тому корпус гальма тисне на датчик, а двигун хитається на опорах у протилежний бік. Це третій закон Ньютона.'),
      t('Куди йде потужність: гальмо перетворює всю потужність двигуна на тепло в охолодній воді. 200 кВт — це сто електрочайників, увімкнених разом.'),
      t('Поправка на погоду: потужність залежить від тиску й температури повітря, тому результат приводять до стандартних умов. SAE J1349 і ISO 1585, на якому стоять правила ООН R85, беруть 25 °C і 99 кПа сухого повітря. Старий німецький DIN 70020 бере 20 °C і 1013 гПа, тому за DIN той самий замір дає приблизно на 2% більше. Наш бокс завжди має стандартні умови, тому поправка тут дорівнює 1.'),
      t('Що є на листку стенда: криві моменту й потужності за обертами, стандарт поправки та її значення, тиск, температура й вологість у боксі, тип гальма, тип і темп заміру, згладжування. Без цих рядків цифри з різних стендів порівнювати не можна.'),
      sheet,
      t('Лінії на графіку: суцільна — цей замір, пунктир — попередній, тонкий пунктир — розрахунок усталеного повного газу, порожні кола — заводські дані. Точки утримання заповнені, а порожня точка означає, що двигун не встиг устоятися.'),
      t('Звідки цифри: криву дає та сама модель, що й конструктор. На сторінці двигуна її масштаб приведено до заводських цифр зі статті, а оберти піків лишаються модельними. У конструкторі стенд показує саму модель, і порожні кола там показують заводські цифри для порівняння.'),
    ].filter(Boolean);
    this.help.innerHTML = `<div class="dyno-help-card">
      <div class="panel-head"><h2>${t('Як читати стенд')}</h2><button type="button" class="btn" data-act="close-help">${t('Закрити')}</button></div>
      <div class="dyno-help-body">${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>
    </div>`;
    this.help.hidden = false;
    this.help.querySelector<HTMLButtonElement>('[data-act="close-help"]')?.focus();
  }
}
