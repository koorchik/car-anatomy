// The engine systems in the X-ray: the switches under the stage, the readout card and the warm-up buttons.
// It owns the systems model and the layers of the model on stage. Layers show only in the X-ray of an assembled engine.

import type { Engine } from '../engine/kinematics.ts';
import { isDieselSystem } from '../engine/systems-spec.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import type { EngineModel, ViewMode } from '../scene/model-types.ts';
import { LAYER_STYLES, SystemsLayers, type LayerId } from '../scene/systems/index.ts';
import { RELIEF_BAR, RELIEF_BAR_HEAVY } from '../systems/oil.ts';
import { SystemsSim, type SystemsFrame, type SystemsState } from '../systems/sim.ts';
import { WARMUP_SPEED } from '../systems/thermal.ts';
import type { CycleMarkers } from './firing-diagram.ts';

export interface SystemsHost {
  /** Asked when a layer is switched on outside the X-ray. */
  wantXray(): void;
  /** Asked when a layer is switched on while the engine is pulled apart. */
  wantAssembled(): void;
  /** Injection and spark marks for the cycle diagram while the fuel layer shows; null clears them. */
  markers?(markers: CycleMarkers | null): void;
}

/** Layers in the order of their keys, 4 to 7. */
const LAYERS: Array<{ id: LayerId; label: string; title: string }> = [
  { id: 'oil', label: t('Олива'), title: t('Шлях оливи: насос, фільтр, магістраль, підшипники, головка') },
  { id: 'coolant', label: t('Охолодження'), title: t('Охолодження: насос, сорочка, термостат, патрубки радіатора') },
  { id: 'fuel', label: t('Паливо'), title: t('Паливо і запалювання: форсунки, свічки, котушки') },
  { id: 'air', label: t('Повітря'), title: t('Повітря: фільтр, дросель, ресивер, патрубки, наддув') },
];

const STORAGE_KEY = 'systems-layers';
/** Top of the oil gauge, bar. */
const GAUGE_BAR = 7;

/** Degrees before top dead centre, or after it when negative. */
const beforeTdc = (deg: number): string => (deg >= 0 ? t('{deg}° до ВМТ', { deg: Math.round(deg) }) : t('{deg}° після ВМТ', { deg: Math.round(-deg) }));

const fmt = (value: number, digits = 1): string => value.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** One layer's block in the readout. Built once; the numbers change in place. */
interface Section {
  root: HTMLElement;
  lines: HTMLElement[];
  gauge?: { fill: HTMLElement; mark: HTMLElement };
  flags: HTMLElement;
  warning: HTMLElement;
}

export class SystemsView {
  readonly sim = new SystemsSim();
  private layers: SystemsLayers | null = null;
  private readonly on = new Set<LayerId>();
  private readonly tool: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly live: HTMLElement;
  private readonly mode: HTMLElement;
  private readonly sections = new Map<LayerId, Section>();
  private readonly host: SystemsHost;
  private view: ViewMode = 'xray';
  private explode = 0;
  private lastText = 0;
  private lastAnnounce = '';
  private readonly reducedMotion: boolean;

  constructor(tool: HTMLElement, readout: HTMLElement, host: SystemsHost) {
    this.tool = tool;
    this.readout = readout;
    this.host = host;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    tool.innerHTML = `<span class="tool-label">${t('Системи')}</span>
      <div class="segmented systems-toggles" role="group" aria-label="${t('Шари систем у рентгені')}">
        ${LAYERS.map((l, i) => `<button type="button" data-layer="${l.id}" aria-pressed="false" title="${l.title} (${i + 4})"><i class="systems-swatch" style="--swatch:${LAYER_STYLES[l.id].color}"></i>${l.label}</button>`).join('')}
      </div>`;
    tool.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-layer]');
      if (button) this.toggle(button.dataset.layer as LayerId);
    });

    readout.setAttribute('role', 'status');
    readout.setAttribute('aria-live', 'off');
    readout.setAttribute('aria-label', t('Стан систем двигуна'));
    this.mode = el('p', 'systems-mode');
    readout.append(this.mode);
    for (const layer of LAYERS) {
      const section = this.section(layer.id);
      this.sections.set(layer.id, section);
      readout.append(section.root);
    }
    const warm = el('div', 'systems-warm');
    const cold = el('button', 'btn', t('Холодний пуск'));
    const hot = el('button', 'btn', t('Прогріти'));
    cold.type = hot.type = 'button';
    cold.addEventListener('click', () => this.reset('cold'));
    hot.addEventListener('click', () => this.reset('warm'));
    warm.append(cold, hot, el('span', 'systems-note', t('Прогрів показано у {n} разів швидше', { n: WARMUP_SPEED })));
    readout.append(warm);
    this.live = el('div', 'visually-hidden');
    this.live.setAttribute('aria-live', 'polite');
    readout.after(this.live);
    // On a narrow stage the row of view options wraps upwards; the card stays above it.
    const row = tool.parentElement;
    if (row && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => readout.style.setProperty('--tools-h', `${row.offsetHeight}px`)).observe(row);

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      if (Array.isArray(saved)) for (const id of saved) if (LAYERS.some((l) => l.id === id)) this.on.add(id as LayerId);
    } catch {
      // Storage may be blocked; the layers then start off.
    }
    this.syncButtons();
  }

  private section(id: LayerId): Section {
    const root = el('div', 'systems-section');
    root.style.setProperty('--swatch', LAYER_STYLES[id].color);
    const lines = [el('div', 'systems-line')];
    root.append(...lines);
    let gauge: Section['gauge'];
    if (id === 'oil') {
      const track = el('div', 'systems-gauge');
      track.setAttribute('aria-hidden', 'true');
      gauge = { fill: el('u'), mark: el('b') };
      track.append(gauge.fill, gauge.mark);
      root.append(track);
    }
    const flags = el('div', 'systems-flags');
    const warning = el('div', 'systems-warning');
    root.append(flags, warning);
    return { root, lines, gauge, flags, warning };
  }

  get state(): SystemsState {
    return this.sim.state;
  }

  /** The systems layers of the model on stage, for the oil-sump hooks and checks in the console. */
  get sceneLayers(): SystemsLayers | null {
    return this.layers;
  }

  /** A new model on stage. Temperatures carry over, so a designer slider doesn't restart the warm-up. */
  attach(engine: Engine, model: EngineModel): void {
    this.layers?.dispose();
    this.sim.configure(engine);
    this.layers = new SystemsLayers(engine, model, this.reducedMotion);
    this.layers.setView(this.view);
    this.layers.setExplode(this.explode);
    for (const id of this.on) this.layers.set(id, true);
    this.lastText = 0;
  }

  /** Same model on stage, new figures: the designer's mixture, ignition or boost moved. */
  retune(engine: Engine): void {
    this.sim.configure(engine);
  }

  reset(kind: 'warm' | 'cold'): void {
    this.sim.reset(kind);
    this.lastText = 0;
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.layers?.setView(view);
    this.syncButtons();
  }

  setExplode(amount: number): void {
    this.explode = amount;
    this.layers?.setExplode(amount);
    this.syncButtons();
  }

  toggle(id: LayerId): void {
    if (!LAYERS.some((l) => l.id === id)) return;
    const next = !this.on.has(id);
    if (next) {
      this.on.add(id);
      // A layer is only visible in the X-ray of an assembled engine: switching one on takes the visitor there.
      if (this.view !== 'xray') this.host.wantXray();
      if (this.explode > 0.01) this.host.wantAssembled();
    } else {
      this.on.delete(id);
    }
    this.layers?.set(id, next);
    if (id === 'fuel' && !next) this.host.markers?.(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.on]));
    } catch {
      // Only a convenience.
    }
    this.syncButtons();
    this.lastText = 0;
  }

  private syncButtons(): void {
    const showing = this.view === 'xray' && this.explode <= 0.01;
    if (!showing || !this.on.has('fuel')) this.host.markers?.(null);
    this.tool.classList.toggle('dimmed', !showing);
    this.tool.title = showing ? '' : t('Шари систем видно в рентгені');
    this.tool.querySelectorAll<HTMLButtonElement>('button[data-layer]').forEach((b) => b.setAttribute('aria-pressed', String(this.on.has(b.dataset.layer as LayerId))));
    this.readout.hidden = !showing || this.on.size === 0;
    // With three or four layers the card keeps to one line each, so it doesn't cover the engine.
    this.readout.classList.toggle('compact', this.on.size > 2);
    for (const [id, section] of this.sections) section.root.hidden = !this.on.has(id);
  }

  private renderFuel(s: SystemsState, section: Section): void {
    const f = s.fuel;
    const engine = this.sim.engine;
    const systems = this.sim.systems;
    if (!engine || !systems) return;
    const system = systems.fuelSystem;
    const diesel = isDieselSystem(system);
    const ms = fmt(f.pulseMs, 1);
    let first: string;
    if (system === 'carburettor') first = t('Карбюратор: потік повітря підхоплює паливо в дифузорі');
    else if (system === 'mechanical') first = t('Безперервне упорскування: форсунки бризкають весь час');
    else if (diesel) {
      const btdc = (((engine.cycle - f.injectStart) % engine.cycle) + engine.cycle) % engine.cycle;
      const main = t('основне упорскування {a}', { a: beforeTdc(btdc > engine.cycle / 2 ? btdc - engine.cycle : btdc) });
      first = f.railBar !== null ? `${t('Тиск у рампі {p} бар', { p: Math.round(f.railBar) })} · ${main}` : main.charAt(0).toLocaleUpperCase() + main.slice(1);
      if (f.pilotEnd > f.pilotStart) first += ` · ${t('пілотне перед ним')}`;
    } else if (system === 'port') first = t('Упорскування {ms} мс, закінчується за {deg}° до відкриття впускного клапана', { ms, deg: 20 });
    else if (system === 'direct') first = `${t('Тиск {p} бар', { p: Math.round(f.railBar ?? 0) })} · ${t('упорскування на такті впуску, {ms} мс', { ms })}`;
    else first = `${t('У канали {share} %, решта в циліндри', { share: Math.round(f.portShare * 100) })} · ${t('Тиск {p} бар', { p: Math.round(f.railBar ?? 0) })}`;
    section.lines[0]!.textContent = s.running ? first : t('Двигун стоїть: палива немає');
    const second = diesel
      ? f.glow
        ? t('Свічки розжарювання ввімкнено')
        : ''
      : engine.isRotary
        ? t('Провідна свічка {a}, відстаюча {b}', { a: beforeTdc(f.advance), b: beforeTdc(f.trailingAdvance) })
        : t('Іскра {a}', { a: beforeTdc(f.advance) });
    section.flags.textContent = second;
    section.flags.hidden = !second;
    section.warning.hidden = true;
    const cycle = engine.cycle;
    const window = (a: number, b: number): [number, number] | null => (((b - a) % cycle) + cycle) % cycle > 0 ? [a, b] : null;
    const sparks = diesel ? [] : engine.isRotary ? [cycle - f.advance, cycle - f.trailingAdvance] : systems.ignition === 'wasted-spark' ? [cycle - f.advance, 360 - f.advance] : [cycle - f.advance];
    this.host.markers?.(s.running ? { inject: window(f.injectStart, f.injectEnd), pilot: window(f.pilotStart, f.pilotEnd), sparks } : { inject: null, pilot: null, sparks: [] });
  }

  frame(frame: SystemsFrame): void {
    const state = this.sim.step(frame);
    this.layers?.update(state, frame.theta, frame.dt);
    if (this.readout.hidden) return;
    const now = performance.now();
    if (now - this.lastText < 200) return;
    this.lastText = now;
    this.render(state, frame);
  }

  private render(s: SystemsState, frame: SystemsFrame): void {
    this.mode.textContent = frame.live ? '' : frame.demo ? t('Двигун не заведено: показано холостий хід') : frame.running ? t('Сповільнено: як на холостому ходу') : '';
    this.mode.hidden = !this.mode.textContent;
    const oil = this.sections.get('oil');
    if (oil && this.on.has('oil')) {
      const o = s.oil;
      const spec = this.sim.engine?.spec;
      const relief = spec && (spec.aspiration !== 'na' || spec.fuel === 'diesel') ? RELIEF_BAR_HEAVY : RELIEF_BAR;
      oil.lines[0]!.textContent = `${t('Тиск оливи {p} бар', { p: fmt(o.pressure) })} · ${t('олива {t} °C', { t: Math.round(s.thermal.oilC) })}`;
      oil.gauge!.fill.style.width = `${Math.min(100, (o.pressure / GAUGE_BAR) * 100)}%`;
      oil.gauge!.mark.style.left = `${(relief / GAUGE_BAR) * 100}%`;
      const flags: string[] = [];
      if (o.reliefOpen) flags.push(t('Редукційний клапан відкритий'));
      if (o.jetsOpen > 0.05) flags.push(t('Форсунки поршнів працюють'));
      oil.flags.textContent = flags.join(' · ');
      oil.flags.hidden = !flags.length;
      oil.warning.textContent = o.warning ? t('Тиск оливи майже нуль') : '';
      oil.warning.hidden = !o.warning;
    }
    const coolant = this.sections.get('coolant');
    if (coolant && this.on.has('coolant')) {
      const th = s.thermal;
      const liquid = this.sim.systems?.cooling === 'liquid' || this.sim.engine?.isRotary;
      coolant.lines[0]!.textContent = liquid
        ? `${t('Рідина {t} °C', { t: Math.round(th.engineC) })} · ${t('термостат {s} %', { s: Math.round(th.thermostat * 100) })}`
        : t('Повітряне охолодження · олива {t} °C', { t: Math.round(th.oilC) });
      coolant.flags.textContent = !liquid
        ? ''
        : th.thermostat < 0.02
          ? t('мале коло: радіатор закритий')
          : th.thermostat < 0.9
            ? t('термостат відкривається: частина йде в радіатор')
            : t('велике коло: через радіатор');
      coolant.flags.hidden = !liquid;
      coolant.warning.textContent = liquid && th.engineC > 112 ? t('Перегрів') : '';
      coolant.warning.hidden = !(liquid && th.engineC > 112);
    }
    const airSection = this.sections.get('air');
    if (airSection && this.on.has('air')) {
      const a = s.air;
      const boosted = a.pressureRatio > 1.005 || (this.sim.systems?.boostBar ?? 0) > 0;
      airSection.lines[0]!.textContent = s.running ? t('Повітря {g} г/с', { g: fmt(a.airGs, a.airGs < 10 ? 1 : 0) }) : t('Двигун стоїть: повітря не йде');
      airSection.flags.textContent = !s.running
        ? ''
        : boosted && (this.sim.systems?.intercooler ?? 0) > 0
          ? t('Наддув {b} бар · після компресора {t2} °C · після інтеркулера {t3} °C', { b: fmt((a.pressureRatio - 1) * 1.013, 2), t2: Math.round(a.compressorC), t3: Math.round(a.chargeC) })
          : boosted
            ? t('Наддув {b} бар · після компресора {t2} °C', { b: fmt((a.pressureRatio - 1) * 1.013, 2), t2: Math.round(a.compressorC) })
          : this.sim.engine?.spec.fuel === 'diesel'
            ? t('Дроселя немає: дизелем керує кількість палива')
            : t('Тиск у ресивері {p} бар', { p: fmt(a.manifoldBar, 2) });
      airSection.flags.hidden = !airSection.flags.textContent;
      airSection.warning.hidden = true;
    }
    const fuel = this.sections.get('fuel');
    if (fuel && this.on.has('fuel')) this.renderFuel(s, fuel);
    const announce = s.oil.warning ? t('Тиск оливи майже нуль') : s.oil.reliefOpen && this.on.has('oil') ? t('Редукційний клапан відкрився') : '';
    if (announce !== this.lastAnnounce) {
      this.lastAnnounce = announce;
      this.live.textContent = announce;
    }
  }
}
