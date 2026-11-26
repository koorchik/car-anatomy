// The gearbox designer's results, in the engine designer's style (src/ui/designer/results.ts): the headline figures
// (with the pinned variant's beside them), the full run "Drive", the traction chart, the table of the gears, the
// verdict with the parts' loads and the diagnoses, then the synchronisers, the clutch, the mesh tones and the mass.

import { gearboxControls } from '../../gearbox-designer/controls.ts';
import type { GearboxDesign } from '../../gearbox-designer/design.ts';
import type { GearboxDiagnostic } from '../../gearbox-designer/diagnostics.ts';
import type { DesignRun } from '../../gearbox-designer/drive-run.ts';
import type { GearboxPerformance } from '../../gearbox-designer/evaluate.ts';
import type { GearboxReliability } from '../../gearbox-designer/reliability.ts';
import { gearboxCausesOf, type GearboxCause } from '../../gearbox-designer/sensitivity.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { GEAR_COLOURS, movePlayhead, runSvg, tractionSvg } from './charts.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const SEVERITY: Record<GearboxDiagnostic['severity'], { sign: string; word: string }> = {
  fatal: { sign: '✕', word: t('Критично') },
  warning: { sign: '!', word: t('Увага') },
  note: { sign: 'i', word: t('Цікаво') },
};
/** The engine designer's verdict colours: a box past its rating wears like a race engine, a doomed one is doomed. */
const VERDICT_CLASS: Record<GearboxReliability['verdict'], string> = { solid: '', rated: '', short: 'verdict-race', doomed: 'verdict-doomed' };
/** A load over this shows as wearing. */
const WEAR_LOAD = 0.85;

/** What the panel shows about a pinned variant. */
export interface Pinned {
  name: string;
  perf: GearboxPerformance;
}

/** What the full run shows: the run, and the panel's figure it was made against. */
export interface RunView {
  run: DesignRun;
  panel100: number | null;
}

export interface ResultsHandlers {
  drive(): void;
  pin(): void;
  unpin(): void;
  /** A cause of a load was clicked: bring its control into view. */
  focus(controlId: string): void;
}

export class GearboxResultsPanel {
  readonly root = document.createElement('div');
  private readonly hero = document.createElement('div');
  private readonly actions = document.createElement('div');
  private readonly runBlock = document.createElement('div');
  private readonly traction = document.createElement('div');
  private readonly gears = document.createElement('div');
  private readonly verdict = document.createElement('div');
  private readonly diagnostics = document.createElement('div');
  private readonly details = document.createElement('dl');
  private design: GearboxDesign | null = null;
  private perf: GearboxPerformance | null = null;
  private rel: GearboxReliability | null = null;
  private pinned: Pinned | null = null;
  private runView: RunView | null = null;
  private running = false;
  private openLimit: string | null = null;
  private causes: GearboxCause[] | null = null;
  private causesTimer = 0;

  constructor(handlers: ResultsHandlers) {
    this.root.className = 'designer-results gbd-results';
    this.hero.className = 'hero-figures';
    this.actions.className = 'designer-actions gbd-actions';
    this.runBlock.className = 'chart-block gbd-run';
    this.runBlock.hidden = true;
    this.traction.className = 'chart-block';
    this.gears.className = 'gbd-gear-table';
    this.verdict.className = 'reliability';
    this.diagnostics.className = 'diagnostics';
    this.details.className = 'readouts stats';
    const section = (title: string, body: HTMLElement): HTMLElement => {
      const wrap = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = title;
      wrap.append(h, body);
      return wrap;
    };
    this.root.append(
      this.hero,
      this.actions,
      this.runBlock,
      section(t('Тяга в передачах'), this.traction),
      section(t('Передачі'), this.gears),
      section(t('Міцність'), this.verdict),
      section(t('Діагнози'), this.diagnostics),
      section(t('Подробиці'), this.details),
    );
    this.actions.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'drive') handlers.drive();
      else if (act === 'pin') handlers.pin();
      else if (act === 'unpin') handlers.unpin();
    });
    this.verdict.addEventListener('click', (event) => {
      const jump = (event.target as HTMLElement).closest<HTMLElement>('[data-jump]');
      if (jump) {
        handlers.focus(jump.dataset.jump!);
        return;
      }
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-limit]');
      if (!row) return;
      this.openLimit = this.openLimit === row.dataset.limit ? null : row.dataset.limit!;
      this.findCauses();
      this.renderVerdict();
    });
  }

  update(d: GearboxDesign, perf: GearboxPerformance, rel: GearboxReliability, diags: GearboxDiagnostic[]): void {
    const changed = this.design !== d;
    this.design = d;
    this.perf = perf;
    this.rel = rel;
    if (changed && this.openLimit) this.findCauses();
    this.renderHero();
    this.renderActions();
    this.traction.innerHTML = `${tractionSvg(perf.traction, this.pinned?.perf.traction ?? null)}${this.pinned ? `<p class="legend chart-legend"><span class="legend-item"><i class="swatch-now"></i>${t('Зараз')}</span><span class="legend-item"><i class="swatch-then"></i>${escapeHtml(this.pinned.name)}</span></p>` : ''}<p class="note small">${t('Сила на ведучих колесах на повному газу; пунктир — опір руху на рівній дорозі. Де лінія передачі вище за наступну, там вигідніше не перемикатися.')}</p>`;
    this.renderGears();
    this.renderVerdict();
    this.diagnostics.innerHTML = diags.length
      ? diags
          .map((x) => {
            const s = SEVERITY[x.severity];
            return `<div class="diag diag-${x.severity}"><span class="diag-sign" aria-label="${s.word}">${s.sign}</span><div><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.text)}</p>${x.fix ? `<p class="diag-fix">${escapeHtml(x.fix)}</p>` : ''}</div></div>`;
          })
          .join('')
      : `<p class="note">${t('Нічого не зламається: коробка в межах розумного.')}</p>`;
    this.renderDetails();
  }

  setPinned(pinned: Pinned | null): void {
    this.pinned = pinned;
    if (!this.design || !this.perf || !this.rel) return;
    this.renderHero();
    this.renderActions();
  }

  /** The run in progress (null: computing) or done. */
  setRun(view: RunView | null, running: boolean): void {
    this.runView = view;
    this.running = running;
    this.renderActions();
    this.renderRun();
  }

  /** Where the playback of the run stands, s; null when it is not playing. */
  playhead(time: number | null): void {
    movePlayhead(this.runBlock.querySelector('svg'), time);
  }

  private renderHero(): void {
    const perf = this.perf!;
    const base = this.pinned?.perf;
    const delta = (now: number | null, then: number | null | undefined, digits: number, unit: string, better: 'less' | 'more'): string => {
      if (now === null || then === null || then === undefined) return '';
      const d = now - then;
      if (Math.abs(d) < 0.5 * 10 ** -digits) return `<span class="delta">${t('без змін')}</span>`;
      const good = better === 'less' ? d < 0 : d > 0;
      return `<span class="delta${good ? ' delta-good' : ''}">${d > 0 ? '+' : '−'}${num(Math.abs(d), digits)} ${unit}</span>`;
    };
    const fig = (value: string, unit: string, sub: string, extra = ''): string =>
      `<div class="hero-figure"><b>${value}</b><span class="hero-unit">${unit}</span><span class="hero-sub">${sub}</span>${extra}</div>`;
    this.hero.innerHTML = [
      fig(perf.zeroTo100S === null ? '—' : num(perf.zeroTo100S, 1), t('с'), t('0–100 км/год'), delta(perf.zeroTo100S, base?.zeroTo100S, 2, t('с'), 'less')),
      fig(perf.zeroTo400mS === null ? '—' : num(perf.zeroTo400mS, 1), t('с'), t('400 м з місця'), delta(perf.zeroTo400mS, base?.zeroTo400mS, 2, t('с'), 'less')),
      fig(num(perf.vmaxKmh), t('км/год'), perf.vmaxAtLimiter ? t('найбільша, у відсічку на {gear}-й', { gear: perf.vmaxGear }) : t('найбільша, на {gear}-й', { gear: perf.vmaxGear }), delta(perf.vmaxKmh, base?.vmaxKmh, 0, t('км/год'), 'more')),
      fig(num(perf.mass.totalKg, 1), t('кг'), t('маса коробки, оцінка'), delta(perf.mass.totalKg, base?.mass.totalKg, 1, t('кг'), 'less')),
    ].join('');
  }

  private renderActions(): void {
    const drive = `<button type="button" class="btn btn-primary" data-act="drive"${this.running ? ' disabled' : ''}>${this.running ? t('Їде…') : t('Проїхати')}</button>`;
    const pin = this.pinned
      ? `<button type="button" class="btn" data-act="unpin">${t('Прибрати порівняння')}</button>`
      : `<button type="button" class="btn" data-act="pin">${t('Закріпити для порівняння')}</button>`;
    this.actions.innerHTML = drive + pin;
  }

  private renderRun(): void {
    const view = this.runView;
    this.runBlock.hidden = !view && !this.running;
    if (!view) {
      this.runBlock.innerHTML = this.running ? `<p class="note">${t('Рахую повний заїзд…')}</p>` : '';
      return;
    }
    const r = view.run;
    const diff = r.zeroTo100S !== null && view.panel100 !== null ? (r.zeroTo100S / view.panel100 - 1) * 100 : null;
    const line =
      r.zeroTo100S === null
        ? t('До 100 км/год авто не доїхало.')
        : t('Повна модель: 0–100 км/год за {run} с, 400 м за {quarter} с. На панелі {panel} с, різниця {diff} %.', {
            run: num(r.zeroTo100S, 2),
            quarter: r.zeroTo400mS === null ? '—' : num(r.zeroTo400mS, 2),
            panel: view.panel100 === null ? '—' : num(view.panel100, 2),
            diff: diff === null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${num(Math.abs(diff), 1)}`,
          });
    this.runBlock.innerHTML = `<div class="chart-title"><span>${t('Заїзд з місця')}</span><span class="chart-unit">${t('км/год')}</span></div>${runSvg(r.samples, r.zeroTo100S)}
      <p class="note small">${escapeHtml(line)}</p>
      <p class="note small">${t('Тут уся трансмісія крок за кроком: зчеплення, синхронізатори, пружні вали й шини. Цифри на панелі рахує швидша модель, тож вони можуть трохи відрізнятися.')}</p>`;
  }

  private renderGears(): void {
    const perf = this.perf!;
    const drops = new Map(perf.shifts.map((s) => [s.from, s]));
    const rows = perf.gears
      .map((g, i) => {
        const s = perf.strength[i];
        const shift = drops.get(g.gear);
        const pct = (v: number | undefined): string => (v === undefined ? '—' : `${Math.round(v * 100)}%`);
        const over = (v: number | undefined): string => (v !== undefined && v > 1 ? ' class="gbd-over"' : v !== undefined && v > WEAR_LOAD ? ' class="gbd-wear"' : '');
        return `<tr><th scope="row"><i class="gbd-swatch" style="background:${GEAR_COLOURS[i % GEAR_COLOURS.length]}"></i>${g.gear}</th><td>${g.pair ? `${g.pair.teeth[0]}/${g.pair.teeth[1]}` : t('пряма')}</td><td>${num(g.ratio, 3)}</td><td>${g.step === null ? '' : num(g.step, 2)}</td><td>${num(g.kmhAtLimit)}</td><td>${shift ? num(shift.rpmAfter) : ''}</td><td${over(s?.bending)}>${pct(s?.bending)}</td><td${over(s?.contact)}>${pct(s?.contact)}</td></tr>`;
      })
      .join('');
    const main = perf.mainRatio === null ? '' : t('Постійна пара {ratio}. ', { ratio: num(perf.mainRatio, 3) });
    this.gears.innerHTML = `<div class="gbd-scroll"><table>
        <thead><tr><th scope="col">${t('Пер.')}</th><th scope="col">${t('Зубці')}</th><th scope="col">${t('Число')}</th><th scope="col">${t('Крок')}</th><th scope="col">${t('км/год')}</th><th scope="col">${t('Після')}</th><th scope="col">${t('Згин')}</th><th scope="col">${t('Контакт')}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="note small">${main}${t('Головна передача {final}, задній хід {reverse}, діапазон {range}. Км/год — швидкість на відсічці; «після» — оберти, коли з цієї передачі перемкнулися на наступну. Згин і контакт — навантаження найслабшої пари передачі на піковому моменті {torque} Н·м, де 100 % — межа.', {
        final: num(perf.finalDrive, 2),
        reverse: num(perf.reverse.ratio, 2),
        range: num(perf.range, 2),
        torque: num(perf.peakTorqueNm),
      })}</p>`;
  }

  private findCauses(): void {
    window.clearTimeout(this.causesTimer);
    this.causes = null;
    const d = this.design;
    const id = this.openLimit;
    if (!d || !id) return;
    // Two model runs per control: worked out after the click has painted.
    this.causesTimer = window.setTimeout(() => {
      this.causes = gearboxCausesOf(d, id, gearboxControls(d));
      this.renderVerdict();
    }, 30);
  }

  private causesHtml(): string {
    if (!this.causes) return `<p class="note">${t('Рахую, що на це впливає…')}</p>`;
    if (!this.causes.length) return `<p class="note">${t('На цій коробці майже нічого на це не впливає.')}</p>`;
    return `<p class="note">${t('Що найбільше змінює це навантаження, якщо рухати контрол на десяту частину його діапазону:')}</p>${this.causes
      .map((c) => `<button type="button" class="cause" data-jump="${escapeHtml(c.control)}"><span>${escapeHtml(c.name)}: ${escapeHtml(c.label)}</span><b>${escapeHtml(c.effect.text)}</b></button>`)
      .join('')}`;
  }

  private renderVerdict(): void {
    const rel = this.rel;
    if (!rel) return;
    const rows = [...rel.items]
      .sort((a, b) => b.load - a.load)
      .map((item) => {
        const open = this.openLimit === item.id;
        const zone = item.load > 1 ? 'over' : item.load > WEAR_LOAD ? 'wear' : 'fine';
        const body = open ? `<div class="limit-detail"><p>${escapeHtml(item.detail)}</p><p class="diag-fix">${escapeHtml(item.fix)}</p>${this.causesHtml()}</div>` : '';
        return `<div class="limit"><button type="button" class="limit-row limit-${zone}" data-limit="${item.id}" aria-expanded="${open}">
            <span class="limit-name">${escapeHtml(item.name)}</span>
            <span class="limit-track"><i style="width:${Math.min(100, item.load * 100).toFixed(1)}%"></i></span>
            <span class="limit-value">${Math.round(item.load * 100)}%</span>
          </button>${body}</div>`;
      })
      .join('');
    this.verdict.innerHTML = `<div class="verdict ${VERDICT_CLASS[rel.verdict]}"><b>${escapeHtml(rel.verdictName)}</b><span>${escapeHtml(rel.lifeText)}</span></div>
      <p class="note verdict-why">${t('Найслабше місце: {part}. Смужка показує, наскільки деталь близька до межі. Клацни, щоб побачити причини.', { part: escapeHtml(rel.worst.name.toLowerCase()) })}</p>
      <div class="limits">${rows}</div>`;
  }

  private renderDetails(): void {
    const perf = this.perf!;
    const sync12 = perf.synchro.shifts.find((s) => s.from === 1 && s.to === 2);
    const c = perf.clutch;
    const loudest = Math.max(...perf.tones.flatMap((g) => g.meshes.map((m) => m.db)));
    const rows: Array<[string, string]> = [
      [t('Оберти на 100 і 120 км/год у вищій'), t('{a} і {b} об/хв', { a: num(perf.topRpmAt100), b: num(perf.topRpmAt120) })],
      [t('Смуга потужності'), t('{a}–{b} об/хв', { a: num(perf.powerBand[0]), b: num(perf.powerBand[1]) })],
      [t('Найкрутіший ухил рушання'), `${num(perf.startGradePct)} %`],
      [t('Синхронізація 1→2'), sync12 ? t('{s} с', { s: num(sync12.timeS, 2) }) : '—'],
      [t('Запас зчеплення'), num(c.margin, 2)],
      [t('Робота зчеплення при рушанні'), t('{kj} кДж за {s} с', { kj: num(c.launchJ / 1000, 1), s: num(c.launchS, 2) })],
      [t('Частота демпфера'), t('{hz} Гц (спалахи на холостому {idle} Гц)', { hz: num(c.damperHz, 1), idle: num(c.idleFiringHz) })],
      [t('Завивання шестерень'), Number.isFinite(loudest) ? t('{db} дБ від прямозубої пари', { db: `${loudest > 0 ? '+' : loudest < 0 ? '−' : ''}${num(Math.abs(loudest), 1)}` }) : '—'],
      [t('Довжина пакета шестерень'), t('{mm} мм', { mm: num(perf.mass.lengthMm) })],
    ];
    this.details.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }
}
