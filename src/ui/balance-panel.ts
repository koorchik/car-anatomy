// Inertia force arrows on the model: the switch under the stage, and a card with the legend, what is left and the
// forces in newtons. The arrows themselves are in src/scene/balance-arrows.ts, the physics in src/engine/balance-forces.ts.

import { engineById, pageChoices } from '../data/engines.ts';
import { DEFAULT_DESIGN } from '../designer/design.ts';
import { reciprocatingMass } from '../designer/physics.ts';
import { ALL_LAYERS, BalanceForces, arrowScale, atRpm, massesOf, roughly, type ForceLayers, type OrderResidual } from '../engine/balance-forces.ts';
import { buildEngine, type Engine } from '../engine/kinematics.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { BalanceOverlay, FORCE_COLORS } from '../scene/balance-arrows.ts';
import type { EngineModel } from '../scene/model-types.ts';
import './balance-panel.css';

const num = (v: number): string => roughly(v).toLocaleString(numberLocale, { maximumFractionDigits: v < 10 ? 1 : 0 });

const LEFT_WORDS: Record<keyof OrderResidual, string> = {
  force1: t('сила 1-го порядку'),
  force2: t('сила 2-го порядку'),
  couple1: t('момент 1-го порядку'),
  couple2: t('момент 2-го порядку'),
};

const pageScales = new Map<string, number>();

/** One arrow scale for every engine of a page, so they compare like their sizes do. */
function pageArrowScale(id: string): number {
  const page = id.split('/')[0]!;
  let scale = pageScales.get(page);
  if (scale === undefined) {
    scale = arrowScale(pageChoices(page).map((c) => buildEngine(engineById(c.id)!)));
    pageScales.set(page, scale);
  }
  return scale;
}

/** The designer keeps the scale of its starting engine: a heavier piston gets a longer arrow. */
const designerArrowScale = (): number => DEFAULT_DESIGN.bore / ((reciprocatingMass(DEFAULT_DESIGN) * DEFAULT_DESIGN.stroke) / 2000);

const swatch = (color: string, shape = ''): string => `<i class="forces-swatch${shape}" style="--swatch:${color}"></i>`;

export class BalancePanel {
  private readonly checkbox: HTMLInputElement;
  private readonly card = document.createElement('section');
  private layers: ForceLayers = { ...ALL_LAYERS };
  private engine: Engine | null = null;
  private model: EngineModel | null = null;
  private scale = 1;
  private forces: BalanceForces | null = null;
  private overlay: BalanceOverlay | null = null;
  private on = false;
  /** The card is redrawn with each engine and set of layers, and must not fold the note back up. */
  private noteOpen = false;
  private shownRpm = -1;
  private lastText = 0;

  /** @param tools Row of view options under the stage, where the switch goes. */
  constructor(tools: HTMLElement, host: HTMLElement) {
    const label = document.createElement('label');
    label.className = 'check tool-forces';
    label.innerHTML = `<input type="checkbox" /> ${t('Сили інерції')}`;
    this.checkbox = label.querySelector('input')!;
    this.checkbox.addEventListener('change', () => this.show(this.checkbox.checked));
    // Stacked under the shake switch, which is about the same thing, so the row of tools does not grow.
    const shake = tools.querySelector('.tool-shake');
    if (shake) {
      const column = document.createElement('div');
      column.className = 'tool-checks';
      shake.replaceWith(column);
      column.append(shake, label);
    } else {
      tools.append(label);
    }

    this.card.className = 'forces-card';
    this.card.hidden = true;
    this.card.setAttribute('aria-label', t('Сили інерції'));
    this.card.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-layer]');
      if (!button) return;
      const key = button.dataset.layer as keyof ForceLayers;
      this.layers = { ...this.layers, [key]: !this.layers[key] };
      this.overlay?.setLayers(this.layers);
      this.render();
      this.card.querySelector<HTMLButtonElement>(`button[data-layer="${key}"]`)?.focus();
    });
    host.append(this.card);
    // On a phone the card sits just above the view options, whose height changes with the speed mode.
    new ResizeObserver(() => this.card.style.setProperty('--tools-h', `${tools.offsetHeight}px`)).observe(tools);
  }

  /** A new model on the stage. Arrows are built only while they are shown. */
  setEngine(engine: Engine, model: EngineModel, inDesigner: boolean): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.forces = null;
    this.engine = engine;
    this.model = model;
    this.scale = inDesigner ? designerArrowScale() : pageArrowScale(engine.spec.id);
    if (this.on) this.build();
  }

  show(on: boolean): void {
    this.on = on;
    this.checkbox.checked = on;
    this.card.hidden = !on;
    document.body.classList.toggle('forces-on', on);
    if (on && !this.overlay) this.build();
    if (this.overlay) this.overlay.group.visible = on;
  }

  /** Every frame: the crank angle on screen and the speed the figures are for. */
  frame(theta: number, rpm: number): void {
    if (!this.on || !this.overlay) return;
    this.overlay.update(theta);
    const now = performance.now();
    if (Math.abs(rpm - this.shownRpm) > Math.max(1, rpm * 0.01) && now - this.lastText > 250) {
      this.shownRpm = rpm;
      this.lastText = now;
      this.updateNow();
    }
  }

  /** Only the figures for the current speed change with it. The buttons stay, and keep their focus. */
  private updateNow(): void {
    const bf = this.forces;
    if (!bf) return;
    const rpm = Math.max(0, this.shownRpm);
    const peak = bf.peaks(this.layers);
    for (const cell of this.card.querySelectorAll<HTMLElement>('[data-now]')) {
      cell.textContent = `${num(atRpm(Number(cell.dataset.now), rpm))} ${cell.dataset.unit}`;
    }
    this.card.querySelector('.forces-rpm')!.textContent = t('{rpm} об/хв', { rpm: num(rpm) });
    this.card.querySelector('.forces-brief')!.textContent = t('{rpm} об/хв: сума сил {force} Н, момент {couple} Н·м', {
      rpm: num(rpm),
      force: num(atRpm(peak.force, rpm)),
      couple: num(atRpm(peak.couple, rpm)),
    });
  }

  private build(): void {
    if (!this.engine || !this.model) return;
    this.forces = new BalanceForces(this.engine, massesOf(this.engine.spec));
    this.overlay = new BalanceOverlay(this.forces, this.scale, this.layers);
    this.model.mounted.add(this.overlay.group);
    this.render();
  }

  private render(): void {
    const bf = this.forces;
    if (!bf) return;
    const spec = bf.engine.spec;
    const rotary = bf.engine.isRotary;
    const shafts = bf.shafts.length > 0;
    const redline = spec.redlineRpm;
    const peak = bf.peaks(this.layers);
    const chip = (key: keyof ForceLayers, color: string, label: string): string =>
      `<button type="button" data-layer="${key}" aria-pressed="${this.layers[key]}">${swatch(color)}${label}</button>`;
    const chips = rotary
      ? [chip('order1', FORCE_COLORS.order1, t('Ротори')), chip('balancing', FORCE_COLORS.counterweight, t('Противаги'))]
      : [
          chip('order1', FORCE_COLORS.order1, t('1-й порядок')),
          chip('order2', FORCE_COLORS.order2, t('2-й порядок')),
          chip('balancing', FORCE_COLORS.counterweight, shafts ? t('Противаги й вали') : t('Противаги')),
        ];
    const row = (mark: string, name: string, perOmega2: number, unit: string): string =>
      `<tr><th scope="row">${mark}${name}</th><td data-now="${perOmega2}" data-unit="${unit}"></td><td>${num(atRpm(perOmega2, redline))} ${unit}</td></tr>`;
    const rows = rotary
      ? [row(swatch(FORCE_COLORS.order1), t('Ротор'), bf.primary, t('Н'))]
      : [row(swatch(FORCE_COLORS.order1), t('Поршень, 1-й порядок'), bf.primary, t('Н')), row(swatch(FORCE_COLORS.order2), t('Поршень, 2-й порядок'), bf.secondary, t('Н'))];
    rows.push(row(swatch(FORCE_COLORS.net), t('Сума сил'), peak.force, t('Н')), row(swatch(FORCE_COLORS.couple, ' arc'), t('Момент гойдання'), peak.couple, t('Н·м')));
    const legend = [
      rotary ? '' : `<span>${swatch(FORCE_COLORS.rotating)}${t('шатун і шийка, що крутяться')}</span>`,
      shafts ? `<span>${swatch(FORCE_COLORS.shaft)}${t('балансирні вали')}</span>` : '',
    ].join('');
    const left = bf.left();
    const after = shafts ? t('Після противаг і балансирних валів') : t('Після противаг');
    // The 4th and higher orders of the pistons are never cancelled. They are small, but the net force shows them.
    const all = bf.peaks(ALL_LAYERS);
    const higher = all.force > bf.primary * 0.005 || all.couple > bf.primary * bf.lever * 0.005;
    const verdict = rotary
      ? t('Ротори крутяться разом із валом, тому противаги на кінцях вала гасять і їхні сили, і момент.')
      : left.length
        ? t('{after} лишається: {list}.', { after, list: left.map((k) => LEFT_WORDS[k]).join(', ') })
        : higher
          ? t('{after} сили й моменти 1-го і 2-го порядків гасять одне одного. Лишаються лише слабкі вищі порядки.', { after })
          : t('{after} сили й моменти гасять одне одного: двигун урівноважений.', { after });
    this.card.innerHTML = `
      <h2 class="forces-title">${t('Сили інерції')}</h2>
      <div class="forces-layers" role="group" aria-label="${t('Які сили показати')}">${chips.join('')}</div>
      <table class="forces-table">
        <thead><tr><th></th><th scope="col">${t('зараз')}<br /><span class="forces-rpm"></span></th><th scope="col">${t('на межі')}<br />${t('{rpm} об/хв', { rpm: num(redline) })}</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      <p class="forces-brief"></p>
      ${legend ? `<p class="forces-legend">${legend}</p>` : ''}
      <p class="forces-verdict">${verdict}</p>
      <details class="forces-note"${this.noteOpen ? ' open' : ''}><summary>${t('Як читати стрілки')}</summary>${t('Довжина стрілок від обертів не залежить: усі сили ростуть із квадратом обертів однаково. Фіолетові стрілки показують 2-й порядок разом із дрібними вищими. Сума сил і момент рахуються лише з показаних стрілок. Дуга моменту така, як сила, що дала б цей момент на плечі між сусідніми циліндрами. Маси деталей оцінено за їхніми розмірами.')}</details>`;
    this.card.querySelector('details')!.addEventListener('toggle', (event) => (this.noteOpen = (event.target as HTMLDetailsElement).open));
    this.updateNow();
  }
}
