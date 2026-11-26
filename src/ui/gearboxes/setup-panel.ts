// The settings panel of a layshaft gearbox page (owner decision A3 of the build order): each speed's ratio on a
// slider or its teeth in steps, 4, 5 or 6 speeds, the final drive, and a button back to the factory box. What a change does is seen at once:
// the gears in 3D (the section rebuilds the model), the ratio captions, road speed in every gear and the drop of the
// revs at each upshift. The model of the setup is src/drivetrain/layouts/layshaft-setup.ts; the panel only shows it.
//
// The state is not in the address yet: the designer's codec carries it from K10 on.

import type { LayshaftDesc } from '../../drivetrain/layouts/layshaft.ts';
import {
  FINAL_DRIVE_RANGE,
  isFactory,
  pairHelix,
  RATIO_RANGE,
  SETUP_SPEEDS,
  setFinalDrive,
  setSpeeds,
  setTeeth,
  setupDesc,
  speedRatios,
  stepTeeth,
  teethForRatio,
  factorySetup,
  type LayshaftSetup,
} from '../../drivetrain/layouts/layshaft-setup.ts';
import { roadSpeedKmh, shiftDrops } from '../../drivetrain/table-figures.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { ladderSvg } from './ladder.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export interface SetupContext {
  factory: LayshaftDesc;
  factoryFinal: number;
  /** Rolling radius of the car's tyre, m, and its size as printed. */
  radiusM: number;
  tyre: string;
  /** Where the table and the ladder take the revs to: the engine's rev limit. */
  redlineRpm: number;
  /** Reverse's overall ratio, which the panel does not change. */
  reverse: number | null;
}

export class SetupPanel {
  private readonly root: HTMLElement;
  private readonly ctx: SetupContext;
  private readonly changed: (setup: LayshaftSetup, desc: LayshaftDesc) => void;
  private setup: LayshaftSetup;
  private desc: LayshaftDesc;

  constructor(root: HTMLElement, ctx: SetupContext, changed: (setup: LayshaftSetup, desc: LayshaftDesc) => void) {
    this.root = root;
    this.ctx = ctx;
    this.changed = changed;
    this.setup = factorySetup(ctx.factory, ctx.factoryFinal);
    this.desc = ctx.factory;
    root.addEventListener('input', (event) => this.onInput(event));
    root.addEventListener('change', (event) => this.onCommit(event));
    root.addEventListener('click', (event) => this.onClick(event));
    this.render();
  }

  get current(): LayshaftSetup {
    return this.setup;
  }

  get finalDrive(): number {
    return this.setup.finalDrive;
  }

  /** Back to the factory box, as the button does. */
  reset(): void {
    this.apply(factorySetup(this.ctx.factory, this.ctx.factoryFinal));
    this.render();
  }

  private apply(setup: LayshaftSetup): void {
    this.setup = setup;
    this.desc = setupDesc(this.ctx.factory, setup);
    this.changed(setup, this.desc);
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.dataset.ratio !== undefined) {
      const index = Number(input.dataset.ratio);
      const teeth = teethForRatio(this.desc, index, Number(input.value));
      if (teeth) this.apply(setTeeth(this.ctx.factory, this.setup, index, teeth));
      this.refresh(index);
    } else if (input.id === 'gbx-final') {
      this.apply(setFinalDrive(this.setup, Number(input.value)));
      this.refresh();
    }
  }

  /** A slider let go: it settles on the ratio the teeth give. */
  private onCommit(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.dataset.ratio !== undefined) input.value = String(speedRatios(this.desc)[Number(input.dataset.ratio)]);
  }

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.speeds) {
      this.apply(setSpeeds(this.setup, Number(button.dataset.speeds)));
      this.render();
    } else if (button.dataset.step) {
      const [index, which, delta] = button.dataset.step.split(',').map(Number) as [number, 0 | 1, 1 | -1];
      const teeth = stepTeeth(this.desc, index, which, delta);
      if (!teeth) return;
      this.apply(setTeeth(this.ctx.factory, this.setup, index, teeth));
      this.render();
    } else if (button.id === 'gbx-factory') {
      this.reset();
    }
  }

  /** The whole panel, after a change of its shape: the speed count, a step, the factory button. */
  private render(): void {
    const { ctx, setup } = this;
    const desc = this.desc;
    const main = desc.main.teeth;
    const rows = desc.speeds
      .map((speed, i) => {
        const n = i + 1;
        if (speed === 'direct') {
          return `<div class="gbx-speed gbx-direct" data-speed="${i}">
            <div class="gbx-speed-head"><b class="gbx-n">${n}</b><span class="gbx-formula">${t('пряма: муфта з’єднує первинний вал із вторинним')}</span><b class="gbx-ratio" data-ratio-text="${i}"></b></div>
          </div>`;
        }
        const [z1, z2] = speed.teeth;
        const stepper = (which: 0 | 1, z: number, label: string): string => `<span class="gbx-stepper" aria-label="${label}">
            <button class="btn" type="button" data-step="${i},${which},-1" aria-label="${t('{gear}: на зубець менше', { gear: label })}">−</button><b>${z}</b><button class="btn" type="button" data-step="${i},${which},1" aria-label="${t('{gear}: на зубець більше', { gear: label })}">+</button>
          </span>`;
        return `<div class="gbx-speed" data-speed="${i}">
            <div class="gbx-speed-head"><b class="gbx-n">${n}</b><span class="gbx-formula" data-formula="${i}"></span><b class="gbx-ratio" data-ratio-text="${i}"></b></div>
            <input type="range" class="gbx-ratio-slider" data-ratio="${i}" min="${RATIO_RANGE[0]}" max="${RATIO_RANGE[1]}" step="0.005" value="${speedRatios(desc)[i]}" aria-label="${t('Число {n}-ї передачі', { n })}" />
            <div class="gbx-teeth">
              ${stepper(0, z1, t('шестерня проміжного вала'))}
              <span class="gbx-teeth-arrow">→</span>
              ${stepper(1, z2, t('шестерня передачі'))}
              <span class="gbx-helix" data-helix="${i}"></span>
            </div>
          </div>`;
      })
      .join('');
    this.root.innerHTML = `
      <p class="note">${t('Кожна пара лишається на тій самій міжосьовій {a} мм зі своїм модулем: змінюються лише зубці, а кут нахилу зубців підлаштовується. Зміни одразу видно в 3D, у числах і в таблиці.', { a: num(desc.centreMm) })}</p>
      <div class="gbx-setup-row">
        <span>${t('Передач')}</span>
        <div class="segmented" role="group" aria-label="${t('Передач')}">
          ${SETUP_SPEEDS.map((n) => `<button type="button" data-speeds="${n}" aria-pressed="${n === setup.speeds}">${n}</button>`).join('')}
        </div>
      </div>
      <p class="gbx-main-pair">${t('Головна пара {z1} → {z2}: {ratio}, постійно крутить проміжний вал', { z1: main[0], z2: main[1], ratio: num(main[1] / main[0], 3) })}</p>
      <div class="gbx-speeds">${rows}</div>
      ${ctx.reverse === null ? '' : `<p class="gbx-reverse">${t('Задній хід: {ratio}, через проміжну шестерню', { ratio: num(ctx.reverse, 3) })}</p>`}
      <label class="gbx-final">
        <span>${t('Головна передача')} <b id="gbx-final-value"></b></span>
        <input type="range" id="gbx-final" min="${FINAL_DRIVE_RANGE[0]}" max="${FINAL_DRIVE_RANGE[1]}" step="0.01" value="${setup.finalDrive}" />
      </label>
      <h3>${t('Швидкість у передачах')}</h3>
      <div class="gbx-speed-table" id="gbx-speed-table"></div>
      <h3>${t('Оберти після перемикання')}</h3>
      <div class="gbx-ladder" id="gbx-ladder"></div>
      <button class="btn gbx-factory" id="gbx-factory" type="button">${t('Заводські')}</button>`;
    this.refresh();
  }

  /** Captions, the table and the ladder; the slider being dragged (`dragging`) is left where the visitor holds it. */
  private refresh(dragging = -1): void {
    const { ctx, setup, desc } = this;
    const ratios = speedRatios(desc);
    const main = desc.main.teeth;
    const q = <T extends HTMLElement>(selector: string): T | null => this.root.querySelector<T>(selector);
    desc.speeds.forEach((speed, i) => {
      const ratio = q(`[data-ratio-text="${i}"]`);
      if (ratio) ratio.textContent = num(ratios[i]!, 3);
      if (speed === 'direct') return;
      const formula = q(`[data-formula="${i}"]`);
      if (formula) formula.textContent = `${main[1]}/${main[0]} × ${speed.teeth[1]}/${speed.teeth[0]} =`;
      const helix = q(`[data-helix="${i}"]`);
      if (helix) helix.textContent = t('кут {deg}°', { deg: num(pairHelix(desc, speed, speed.teeth), 1) });
      const steps = this.root.querySelectorAll<HTMLElement>(`[data-speed="${i}"] .gbx-stepper b`);
      if (steps.length === 2) {
        steps[0]!.textContent = String(speed.teeth[0]);
        steps[1]!.textContent = String(speed.teeth[1]);
      }
      const slider = q<HTMLInputElement>(`[data-ratio="${i}"]`);
      if (slider && i !== dragging) slider.value = String(ratios[i]);
    });
    const final = q('#gbx-final-value');
    if (final) final.textContent = num(setup.finalDrive, 2);
    const changed = !isFactory(ctx.factory, ctx.factoryFinal, setup);
    const factoryButton = q<HTMLButtonElement>('#gbx-factory');
    if (factoryButton) factoryButton.disabled = !changed;

    const table = q('#gbx-speed-table');
    if (table) {
      const row = (label: string, ratio: number): string =>
        `<tr><th scope="row">${label}</th><td>${num(ratio, 3)}</td><td>${num(roadSpeedKmh(1000, ratio, setup.finalDrive, ctx.radiusM), 1)}</td><td>${num(roadSpeedKmh(ctx.redlineRpm, ratio, setup.finalDrive, ctx.radiusM))}</td></tr>`;
      table.innerHTML = `<table>
          <thead><tr><th scope="col">${t('Передача')}</th><th scope="col">${t('Число')}</th><th scope="col">${t('км/год на 1000 об/хв')}</th><th scope="col">${t('км/год на {rpm} об/хв', { rpm: num(ctx.redlineRpm) })}</th></tr></thead>
          <tbody>${ratios.map((r, i) => row(String(i + 1), r)).join('')}${ctx.reverse === null ? '' : row(t('Задній'), ctx.reverse)}</tbody>
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
