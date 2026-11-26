// The settings panel of a gearbox page (owner decision A3 of the build order): each speed's ratio on a slider or its
// teeth in steps, the speed count, the final drive, and a button back to the factory box. What a change does is seen
// at once: the gears in 3D (the section rebuilds the model), the ratio captions, road speed in every gear and the drop
// of the revs at each upshift. The model of the setup is the layout's (src/drivetrain/layouts/setup-model.ts: the
// layshaft page and the transaxle page); the panel only shows it, with the words the page gives it.
//
// The state is not in the address: "Open in the designer" carries the box to the gearbox designer, whose link holds it
// (stage K10).

import type { SetupModel } from '../../drivetrain/layouts/setup-model.ts';
import { roadSpeedKmh, shiftDrops } from '../../drivetrain/table-figures.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { ladderSvg } from './ladder.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** The page's words for its layout. */
export interface SetupLabels {
  /** The note at the top, for a box with this centre distance. */
  note(centreMm: number): string;
  /** The line about a pair every speed runs through (the layshaft's constant-mesh pair); null for none. */
  through: string | null;
  /** A speed's two gears, for the steppers' labels. */
  gears: readonly [string, string];
  /** The text of a direct speed's row. */
  direct: string;
  /** The line about reverse, its ratio as printed. */
  reverse(ratio: string): string;
}

export interface SetupContext<D, S> {
  model: SetupModel<D, S>;
  labels: SetupLabels;
  /** Rolling radius of the driven wheels' tyre, m, and its size as printed. */
  radiusM: number;
  tyre: string;
  /** Where the table and the ladder take the revs to: the engine's rev limit. */
  redlineRpm: number;
  /** Reverse's ratio in the table, the final drive left out; the panel does not change it. */
  reverse: number | null;
  /** Carries the panel's box to the gearbox designer (stage K10); left out, the panel has no such button. */
  openDesigner?: () => void;
}

export class SetupPanel<D = unknown, S = unknown> {
  private readonly root: HTMLElement;
  private readonly ctx: SetupContext<D, S>;
  private readonly changed: (desc: D) => void;
  private setup: S;
  private desc: D;

  constructor(root: HTMLElement, ctx: SetupContext<D, S>, changed: (desc: D) => void) {
    this.root = root;
    this.ctx = ctx;
    this.changed = changed;
    this.setup = ctx.model.factory;
    this.desc = ctx.model.desc(this.setup);
    root.addEventListener('input', (event) => this.onInput(event));
    root.addEventListener('change', (event) => this.onCommit(event));
    root.addEventListener('click', (event) => this.onClick(event));
    this.render();
  }

  get current(): S {
    return this.setup;
  }

  get finalDrive(): number {
    return this.ctx.model.finalDrive(this.setup, this.desc);
  }

  /** Back to the factory box, as the button does. */
  reset(): void {
    this.apply(this.ctx.model.factory);
    this.render();
  }

  /** A new setup; the box is derived again only when it changed, so a final drive outside the box keeps the same box. */
  private apply(setup: S): void {
    if (setup === this.setup) return;
    const model = this.ctx.model;
    if (!model.sameBox(setup, this.setup)) this.desc = model.desc(setup);
    this.setup = setup;
    this.changed(this.desc);
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const model = this.ctx.model;
    if (input.dataset.ratio !== undefined) {
      const index = Number(input.dataset.ratio);
      const teeth = model.teethForRatio(this.desc, index, Number(input.value));
      if (teeth) this.apply(model.setTeeth(this.setup, index, teeth));
      this.refresh(index);
    } else if (input.id === 'gbx-final') {
      this.apply(model.setFinalDrive(this.setup, Number(input.value)));
      this.refresh(-1, true);
    }
  }

  /** A slider let go: it settles on the ratio the teeth give. */
  private onCommit(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.dataset.ratio !== undefined) input.value = String(this.ctx.model.ratios(this.desc)[Number(input.dataset.ratio)]);
    else if (input.id === 'gbx-final') input.value = String(this.finalDrive);
  }

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    const model = this.ctx.model;
    if (button.dataset.speeds) {
      this.apply(model.setSpeeds(this.setup, Number(button.dataset.speeds)));
      this.render();
    } else if (button.dataset.step) {
      const [index, which, delta] = button.dataset.step.split(',').map(Number) as [number, 0 | 1, 1 | -1];
      const teeth = model.stepTeeth(this.desc, index, which, delta);
      if (!teeth) return;
      this.apply(model.setTeeth(this.setup, index, teeth));
      this.render();
    } else if (button.id === 'gbx-factory') {
      this.reset();
    } else if (button.id === 'gbx-open-designer') {
      this.ctx.openDesigner?.();
    }
  }

  /** The whole panel, after a change of its shape: the speed count, a step, the factory button. */
  private render(): void {
    const { ctx, setup } = this;
    const { model, labels } = ctx;
    const desc = this.desc;
    const ratios = model.ratios(desc);
    const [range0, range1] = model.ratioRange;
    const rows = model
      .rows(desc)
      .map((row, i) => {
        const n = i + 1;
        if (row.teeth === null) {
          return `<div class="gbx-speed gbx-direct" data-speed="${i}">
            <div class="gbx-speed-head"><b class="gbx-n">${n}</b><span class="gbx-formula">${labels.direct}</span><b class="gbx-ratio" data-ratio-text="${i}"></b></div>
          </div>`;
        }
        const [z1, z2] = row.teeth;
        const stepper = (which: 0 | 1, z: number, label: string): string => `<span class="gbx-stepper" aria-label="${label}">
            <button class="btn" type="button" data-step="${i},${which},-1" aria-label="${t('{gear}: на зубець менше', { gear: label })}">−</button><b>${z}</b><button class="btn" type="button" data-step="${i},${which},1" aria-label="${t('{gear}: на зубець більше', { gear: label })}">+</button>
          </span>`;
        return `<div class="gbx-speed" data-speed="${i}">
            <div class="gbx-speed-head"><b class="gbx-n">${n}</b><span class="gbx-formula" data-formula="${i}"></span><b class="gbx-ratio" data-ratio-text="${i}"></b></div>
            <input type="range" class="gbx-ratio-slider" data-ratio="${i}" min="${range0}" max="${range1}" step="0.005" value="${ratios[i]}" aria-label="${t('Число {n}-ї передачі', { n })}" />
            <div class="gbx-teeth">
              ${stepper(0, z1, labels.gears[0])}
              <span class="gbx-teeth-arrow">→</span>
              ${stepper(1, z2, labels.gears[1])}
              <span class="gbx-helix" data-helix="${i}"></span>
            </div>
          </div>`;
      })
      .join('');
    const [final0, final1] = model.finalRange;
    this.root.innerHTML = `
      <p class="note">${labels.note(model.centreMm(desc))}</p>
      <div class="gbx-setup-row">
        <span>${t('Передач')}</span>
        <div class="segmented" role="group" aria-label="${t('Передач')}">
          ${model.speedCounts.map((n) => `<button type="button" data-speeds="${n}" aria-pressed="${n === model.speeds(setup)}">${n}</button>`).join('')}
        </div>
      </div>
      ${labels.through === null ? '' : `<p class="gbx-main-pair">${labels.through}</p>`}
      <div class="gbx-speeds">${rows}</div>
      ${ctx.reverse === null ? '' : `<p class="gbx-reverse">${labels.reverse(num(ctx.reverse, 3))}</p>`}
      <label class="gbx-final">
        <span>${t('Головна передача')} <b id="gbx-final-value"></b></span>
        <input type="range" id="gbx-final" min="${final0}" max="${final1}" step="0.01" value="${this.finalDrive}" />
      </label>
      <h3>${t('Швидкість у передачах')}</h3>
      <div class="gbx-speed-table" id="gbx-speed-table"></div>
      <h3>${t('Оберти після перемикання')}</h3>
      <div class="gbx-ladder" id="gbx-ladder"></div>
      <div class="gbx-setup-actions">
        <button class="btn gbx-factory" id="gbx-factory" type="button">${t('Заводські')}</button>
        ${ctx.openDesigner ? `<button class="btn" id="gbx-open-designer" type="button">${t('Відкрити в конструкторі')}</button>` : ''}
      </div>`;
    this.refresh();
  }

  /**
   * Captions, the table and the ladder; the slider being dragged (`dragging`, or the final drive's with
   * `draggingFinal`) is left where the visitor holds it.
   */
  private refresh(dragging = -1, draggingFinal = false): void {
    const { ctx, desc } = this;
    const model = ctx.model;
    const ratios = model.ratios(desc);
    const finalDrive = this.finalDrive;
    const q = <T extends HTMLElement>(selector: string): T | null => this.root.querySelector<T>(selector);
    model.rows(desc).forEach((row, i) => {
      const ratio = q(`[data-ratio-text="${i}"]`);
      if (ratio) ratio.textContent = num(ratios[i]!, 3);
      if (row.teeth === null) return;
      const formula = q(`[data-formula="${i}"]`);
      if (formula) formula.textContent = row.formula;
      const helix = q(`[data-helix="${i}"]`);
      if (helix) helix.textContent = t('кут {deg}°', { deg: num(row.helix ?? NaN, 1) });
      const steps = this.root.querySelectorAll<HTMLElement>(`[data-speed="${i}"] .gbx-stepper b`);
      if (steps.length === 2) {
        steps[0]!.textContent = String(row.teeth[0]);
        steps[1]!.textContent = String(row.teeth[1]);
      }
      const slider = q<HTMLInputElement>(`[data-ratio="${i}"]`);
      if (slider && i !== dragging) slider.value = String(ratios[i]);
    });
    const final = q('#gbx-final-value');
    if (final) final.textContent = num(finalDrive, 2);
    const finalSlider = q<HTMLInputElement>('#gbx-final');
    if (finalSlider && !draggingFinal) finalSlider.value = String(finalDrive);
    const factoryButton = q<HTMLButtonElement>('#gbx-factory');
    if (factoryButton) factoryButton.disabled = model.isFactory(this.setup);

    const table = q('#gbx-speed-table');
    if (table) {
      const row = (label: string, ratio: number): string =>
        `<tr><th scope="row">${label}</th><td>${num(ratio, 3)}</td><td>${num(roadSpeedKmh(1000, ratio, finalDrive, ctx.radiusM), 1)}</td><td>${num(roadSpeedKmh(ctx.redlineRpm, ratio, finalDrive, ctx.radiusM))}</td></tr>`;
      table.innerHTML = `<table>
          <thead><tr><th scope="col">${t('Передача')}</th><th scope="col">${t('Число')}</th><th scope="col">${t('км/год на 1000 об/хв')}</th><th scope="col">${t('км/год на {rpm} об/хв', { rpm: num(ctx.redlineRpm) })}</th></tr></thead>
          <tbody>${ratios.map((r, i) => row(String(i + 1), r)).join('')}${ctx.reverse === null ? '' : row(t('Задній хід'), ctx.reverse)}</tbody>
        </table>
        <p class="note small">${t('Шини {tyre}, радіус кочення {mm} мм, без проковзування. Межа обертів двигуна {rpm} об/хв.', { tyre: ctx.tyre, mm: num(ctx.radiusM * 1000), rpm: num(ctx.redlineRpm) })}</p>`;
    }
    const ladder = q('#gbx-ladder');
    if (ladder) {
      const drops = shiftDrops(ratios, ctx.redlineRpm);
      const order = ratios.every((r, i) => i === 0 || r < ratios[i - 1]!);
      ladder.innerHTML = `${ladderSvg(ratios, ctx.redlineRpm)}
        <p class="note small">${drops.map((d) => t('{from}→{to}: {before} → {after} об/хв', { from: d.from, to: d.from + 1, before: num(d.before), after: num(d.after) })).join('; ')}.</p>
        ${order ? '' : `<p class="verify">${t('Передачі вже не йдуть від нижчої до вищої: на якомусь перемиканні оберти не падають, а ростуть.')}</p>`}`;
    }
  }
}
