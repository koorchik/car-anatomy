// The left panel: what the current design does, compared with a saved one if there is any.

import { isRotary, type Design } from '../../designer/design.ts';
import { designBalance, diagnose, type Diagnostic } from '../../designer/diagnostics.ts';
import { FUELS } from '../../designer/fuels.ts';
import { brakeEfficiency, type Performance, type RpmPoint } from '../../designer/physics.ts';
import { SAFE_LOAD, type Reliability } from '../../designer/reliability.ts';
import { causesOf, type Cause, type Probe } from '../../designer/sensitivity.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { publishedText } from '../published.ts';
import { RpmChart, type ChartSeries } from './chart.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const rpmText = (v: number): string => (Math.round(v / 50) * 50).toLocaleString(numberLocale);

type MetricId = 'boost' | 'fill' | 'bsfc' | 'fuel' | 'egt' | 'backpressure';

const METRICS: Record<MetricId, { name: string; unit: string; digits: number; of: (p: RpmPoint) => number }> = {
  fill: { name: t('Наповнення'), unit: '%', digits: 0, of: (p) => p.fillRatio * 100 },
  fuel: { name: t('Витрата'), unit: t('л/год'), digits: 1, of: (p) => p.fuelLh },
  bsfc: { name: t('Питома витрата'), unit: t('г/кВт·год'), digits: 0, of: (p) => (p.bsfc < 2000 ? p.bsfc : Number.NaN) },
  boost: { name: t('Наддув'), unit: t('бар'), digits: 2, of: (p) => p.boostBar },
  backpressure: { name: t('Протитиск'), unit: t('бар'), digits: 2, of: (p) => p.backpressureBar },
  egt: { name: t('Температура газів'), unit: '°C', digits: 0, of: (p) => p.egtC },
};

const ENERGY: Array<{ key: keyof RpmPoint['energy']; name: string; color: string }> = [
  { key: 'brake', name: t('На вал'), color: '#ece6d6' },
  { key: 'exhaust', name: t('У вихлоп'), color: '#ea6a15' },
  { key: 'coolant', name: t('В охолодження'), color: '#1e9274' },
  { key: 'friction', name: t('Тертя'), color: '#45a4d0' },
  { key: 'pumping', name: t('Прокачування'), color: '#a96ca2' },
  { key: 'unburned', name: t('Незгоріле'), color: '#7a8a8f' },
];

const SEVERITY: Record<Diagnostic['severity'], { sign: string; word: string }> = {
  fatal: { sign: '✕', word: t('Критично') },
  warning: { sign: '!', word: t('Увага') },
  note: { sign: 'i', word: t('Цікаво') },
};

const seriesOf = (perf: Performance, of: (p: RpmPoint) => number): ChartSeries => ({
  x: perf.points.map((p) => p.rpm),
  y: perf.points.map(of),
});

export class DesignerResults {
  readonly root = document.createElement('div');
  private readonly hero = document.createElement('div');
  /** The maker's figures beside the model's, while the design is still a catalogue engine. */
  private readonly factoryFigures = document.createElement('p');
  private readonly heroCauses = document.createElement('div');
  private readonly verdict = document.createElement('div');
  private reliability: Reliability | null = null;
  /** Which figure or limit is open to show what causes it. */
  private openMetric: string | null = null;
  private causeList: Cause[] | null = null;
  private probes: (d: Design) => Probe[] = () => [];
  private onJump: (key: string) => void = () => {};
  private readonly diagnostics = document.createElement('div');
  private readonly stats = document.createElement('dl');
  private readonly energy = document.createElement('div');
  private readonly shake = document.createElement('div');
  private readonly power = new RpmChart(t('Потужність за обертами'));
  private readonly torque = new RpmChart(t('Момент за обертами'));
  private readonly extra = new RpmChart(t('Додатковий показник за обертами'));
  private readonly compareButton = document.createElement('button');
  private readonly legend = document.createElement('div');
  private readonly metricSelect = document.createElement('select');
  private metric: MetricId = 'fill';
  private baseline: Performance | null = null;
  private baselineName = '';
  private design: Design | null = null;
  private perf: Performance | null = null;

  constructor() {
    this.root.className = 'designer-results';
    this.hero.className = 'hero-figures';
    this.factoryFigures.className = 'note factory-figures';
    this.diagnostics.className = 'diagnostics';
    this.stats.className = 'readouts stats';
    this.energy.className = 'energy';
    this.shake.className = 'shake';
    this.legend.className = 'legend chart-legend';
    this.legend.hidden = true;

    this.compareButton.type = 'button';
    this.compareButton.className = 'btn compare-button';
    this.compareButton.addEventListener('click', () => this.toggleBaseline());

    const heading = (text: string): HTMLHeadingElement => {
      const h = document.createElement('h3');
      h.textContent = text;
      return h;
    };
    const labelled = (text: string, chart: RpmChart, unitId: string): HTMLElement => {
      const wrap = document.createElement('div');
      wrap.className = 'chart-block';
      const title = document.createElement('div');
      title.className = 'chart-title';
      title.innerHTML = `<span>${text}</span><span class="chart-unit" id="${unitId}"></span>`;
      wrap.append(title, chart.element);
      return wrap;
    };

    for (const [id, m] of Object.entries(METRICS)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = m.name;
      this.metricSelect.append(option);
    }
    this.metricSelect.className = 'param-select metric-select';
    this.metricSelect.setAttribute('aria-label', t('Показник на третьому графіку'));
    this.metricSelect.addEventListener('change', () => {
      this.metric = this.metricSelect.value as MetricId;
      this.refresh();
    });
    const extraBlock = document.createElement('div');
    extraBlock.className = 'chart-block';
    const extraTitle = document.createElement('div');
    extraTitle.className = 'chart-title';
    extraTitle.append(this.metricSelect);
    const extraUnit = document.createElement('span');
    extraUnit.className = 'chart-unit';
    extraUnit.id = 'chart-unit-extra';
    extraTitle.append(extraUnit);
    extraBlock.append(extraTitle, this.extra.element);

    const axisNote = document.createElement('p');
    axisNote.className = 'note axis-note';
    axisNote.textContent = t('По горизонталі тисячі обертів за хвилину, повний газ. Помаранчева лінія показує оберти зараз.');

    this.heroCauses.className = 'cause-panel';
    this.verdict.className = 'reliability';
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const jump = target.closest<HTMLElement>('[data-jump]');
      if (jump) {
        this.onJump(jump.dataset.jump!);
        return;
      }
      const metric = target.closest<HTMLElement>('[data-metric]');
      if (metric) this.toggleCauses(metric.dataset.metric!);
    });

    this.root.append(
      this.hero,
      this.factoryFigures,
      this.heroCauses,
      this.verdict,
      this.compareButton,
      this.legend,
      labelled(t('Потужність'), this.power, 'chart-unit-power'),
      labelled(t('Момент'), this.torque, 'chart-unit-torque'),
      extraBlock,
      axisNote,
      heading(t('Діагноз')),
      this.diagnostics,
      heading(t('Куди йде енергія палива')),
      this.energy,
      heading(t('Вібрації')),
      this.shake,
      heading(t('Цифри')),
      this.stats,
      this.modelNote(),
    );
  }

  private modelNote(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'note small';
    p.textContent = t('Це модель для розуміння, а не розрахунок для виробництва. На реальних двигунах каталогу вона помиляється приблизно на 10–30%, а напрям впливу кожного параметра надійніший за абсолютні цифри.');
    return p;
  }

  /** Wires the panel to the rest of the page. */
  connect(probes: (d: Design) => Probe[], onJump: (key: string) => void): void {
    this.probes = probes;
    this.onJump = onJump;
  }

  private toggleCauses(metric: string): void {
    this.openMetric = this.openMetric === metric ? null : metric;
    this.causeList = null;
    this.refresh();
    if (!this.openMetric || !this.design) return;
    const design = this.design;
    const wanted = this.openMetric;
    // Runs the model for each control, so let the panel show its open state first.
    window.setTimeout(() => {
      if (this.openMetric !== wanted || this.design !== design) return;
      this.causeList = causesOf(design, wanted, this.probes(design));
      this.refresh();
    }, 30);
  }

  private causesHtml(): string {
    if (!this.causeList) return `<p class="note">${t('Рахую, що на це впливає…')}</p>`;
    if (!this.causeList.length) return `<p class="note">${t('На цьому двигуні майже нічого на це не впливає.')}</p>`;
    const rows = this.causeList
      .map((c) => `<button type="button" class="cause" data-jump="${String(c.key)}"><span>${escapeHtml(c.name)}: ${escapeHtml(c.label)}</span><b>${escapeHtml(c.effect.text)}</b></button>`)
      .join('');
    return `<p class="note">${t('Що найбільше змінює цей показник, якщо рухати контрол на десяту частину його діапазону:')}</p>${rows}`;
  }

  private toggleBaseline(): void {
    if (this.baseline) {
      this.baseline = null;
      this.baselineName = '';
    } else if (this.perf && this.design) {
      this.baseline = this.perf;
      this.baselineName = this.design.name;
    }
    this.refresh();
  }

  update(design: Design, perf: Performance, reliability: Reliability): void {
    // A changed engine has other causes, so an open list would be out of date.
    if (design !== this.design) this.causeList = null;
    const reopen = this.openMetric && design !== this.design;
    this.design = design;
    this.perf = perf;
    this.reliability = reliability;
    this.power.setZones(reliability.safeRpm, reliability.failureRpm);
    this.torque.setZones(reliability.safeRpm, reliability.failureRpm);
    this.extra.setZones(reliability.safeRpm, reliability.failureRpm);
    this.refresh();
    if (reopen) {
      const wanted = this.openMetric!;
      window.setTimeout(() => {
        if (this.openMetric !== wanted || this.design !== design) return;
        this.causeList = causesOf(design, wanted, this.probes(design));
        this.refresh();
      }, 200);
    }
  }

  setMarker(rpm: number): void {
    this.power.setMarker(rpm);
    this.torque.setMarker(rpm);
    this.extra.setMarker(rpm);
  }

  /** Worst thing the panel currently reports, used to raise the alarm on small screens. */
  diagnosticsOf(design: Design, perf: Performance): Diagnostic[] {
    return diagnose(design, perf);
  }

  private refresh(): void {
    const { design, perf, baseline } = this;
    if (!design || !perf) return;
    this.hero.innerHTML = this.heroHtml(perf, baseline);
    const published = design.factory?.published;
    this.factoryFigures.hidden = !published;
    if (published) {
      this.factoryFigures.textContent = `${t('Заводські дані: {figures}', { figures: publishedText(published) })}. ${t('Цифри вище рахує модель, тому кожна зміна дає фізичну різницю.')}`;
    }
    const heroOpen = this.openMetric === 'power' || this.openMetric === 'torque' || this.openMetric === 'cruise';
    this.heroCauses.hidden = !heroOpen;
    this.heroCauses.innerHTML = heroOpen ? this.causesHtml() : '';
    this.verdict.innerHTML = this.reliabilityHtml();
    this.compareButton.textContent = baseline ? t('Прибрати порівняння') : t('Зафіксувати для порівняння');
    this.legend.hidden = !baseline;
    if (baseline) {
      this.legend.innerHTML = `<span class="legend-item"><i class="swatch-now"></i>${t('Зараз')}</span><span class="legend-item"><i class="swatch-then"></i>${escapeHtml(this.baselineName)}</span>`;
    }
    const peakPower = seriesOf(perf, (p) => p.powerHp);
    const ghost = (of: (p: RpmPoint) => number): ChartSeries | null => (baseline ? seriesOf(baseline, of) : null);
    this.power.setData(peakPower, ghost((p) => p.powerHp), t('к.с.'), 0, true);
    this.torque.setData(seriesOf(perf, (p) => p.torqueNm), ghost((p) => p.torqueNm), t('Н·м'), 0, true);
    const metric = METRICS[this.metric];
    this.extra.setData(seriesOf(perf, metric.of), ghost(metric.of), metric.unit, metric.digits, false);
    document.getElementById('chart-unit-power')!.textContent = t('к.с.');
    document.getElementById('chart-unit-torque')!.textContent = t('Н·м');
    document.getElementById('chart-unit-extra')!.textContent = metric.unit;

    this.diagnostics.innerHTML = this.diagnosticsHtml(diagnose(design, perf));
    this.energy.innerHTML = this.energyHtml(perf);
    this.shake.innerHTML = this.shakeHtml(design, perf);
    this.stats.innerHTML = this.statsHtml(design, perf);
  }

  private heroHtml(perf: Performance, baseline: Performance | null): string {
    const delta = (now: number, then: number | undefined, unit: string): string => {
      if (then === undefined) return '';
      const d = now - then;
      if (Math.abs(d) < 0.5) return `<span class="delta">${t('без змін')}</span>`;
      return `<span class="delta">${d > 0 ? '+' : '−'}${num(Math.abs(d))} ${unit}</span>`;
    };
    const fig = (metric: string, value: string, unit: string, sub: string, extra = ''): string =>
      `<button type="button" class="hero-figure${this.openMetric === metric ? ' open' : ''}" data-metric="${metric}" aria-expanded="${this.openMetric === metric}"><b>${value}</b><span class="hero-unit">${unit}</span><span class="hero-sub">${sub}</span>${extra}</button>`;
    const usable = perf.peakPower.powerHp > 0;
    return (
      fig('power', usable ? num(perf.peakPower.powerHp) : '0', t('к.с.'), usable ? t('при {rpm} об/хв', { rpm: rpmText(perf.peakPower.rpm) }) : t('не їде'), delta(perf.peakPower.powerHp, baseline?.peakPower.powerHp, t('к.с.'))) +
      fig('torque', usable ? num(perf.peakTorque.torqueNm) : '0', t('Н·м'), usable ? t('при {rpm} об/хв', { rpm: rpmText(perf.peakTorque.rpm) }) : '', delta(perf.peakTorque.torqueNm, baseline?.peakTorque.torqueNm, t('Н·м'))) +
      fig('cruise', perf.cruise.reachable ? num(perf.cruise.fuelLh, 1) : '—', t('л/100 км'), perf.cruise.reachable ? t('на 100 км/год, оцінка') : t('не витягує круїз'), baseline?.cruise.reachable && perf.cruise.reachable ? deltaFuel(perf.cruise.fuelLh, baseline.cruise.fuelLh) : '')
    );
  }

  private reliabilityHtml(): string {
    const rel = this.reliability;
    if (!rel) return '';
    const sorted = rel.items.filter((i) => !i.trackOnly).sort((a, b) => b.load - a.load);
    const rows = sorted
      .map((item) => {
        const open = this.openMetric === item.id;
        const percent = Math.round(item.load * 100);
        const zone = item.load > 1 ? 'over' : item.load > SAFE_LOAD ? 'wear' : 'fine';
        const body = open ? `<div class="limit-detail"><p>${escapeHtml(item.detail)}</p><p class="diag-fix">${escapeHtml(item.fix)}</p>${this.causesHtml()}</div>` : '';
        return `<div class="limit">
          <button type="button" class="limit-row limit-${zone}" data-metric="${item.id}" aria-expanded="${open}">
            <span class="limit-name">${escapeHtml(item.name)}</span>
            <span class="limit-track"><i style="width:${Math.min(100, item.load * 100).toFixed(1)}%"></i></span>
            <span class="limit-value">${percent}%</span>
          </button>${body}</div>`;
      })
      .join('');
    return `<div class="verdict verdict-${rel.verdict}"><b>${rel.verdictName}</b><span>${rel.lifeText}</span></div>
      <p class="note verdict-why">${t('Найслабше місце: {part}. Смужка показує, наскільки деталь близька до межі. Клацни, щоб побачити причини.', { part: escapeHtml(rel.worst.name.toLowerCase()) })}</p>
      <div class="limits">${rows}</div>`;
  }

  private diagnosticsHtml(list: Diagnostic[]): string {
    if (!list.length) return `<p class="note">${t('Нічого не зламається: двигун у межах розумного.')}</p>`;
    return list
      .map((d) => {
        const s = SEVERITY[d.severity];
        return `<div class="diag diag-${d.severity}">
          <span class="diag-sign" aria-label="${s.word}">${s.sign}</span>
          <div><strong>${escapeHtml(d.title)}</strong><p>${escapeHtml(d.text)}</p>${d.fix ? `<p class="diag-fix">${escapeHtml(d.fix)}</p>` : ''}</div>
        </div>`;
      })
      .join('');
  }

  private energyHtml(perf: Performance): string {
    const e = perf.peakPower.energy;
    const total = ENERGY.reduce((sum, c) => sum + Math.max(0, e[c.key]), 0) || 1;
    const segments = ENERGY.filter((c) => e[c.key] / total > 0.004)
      .map((c) => `<i style="flex-grow:${(e[c.key] / total).toFixed(4)};background:${c.color}"></i>`)
      .join('');
    const legend = ENERGY.filter((c) => e[c.key] / total > 0.004)
      .map((c) => `<span class="legend-item"><i style="background:${c.color}"></i>${c.name} ${num((e[c.key] / total) * 100)}%</span>`)
      .join('');
    return `<div class="energy-bar">${segments}</div><div class="legend">${legend}</div>
      <p class="note">${t('На піку потужності. Лише частина енергії палива доходить до вала, решта стає теплом.')}</p>`;
  }

  private shakeHtml(design: Design, perf: Performance): string {
    if (isRotary(design)) return `<p class="note">${t('Ротор обертається і зрівноважується противагами, тому вільних сил майже немає.')}</p>`;
    const b = designBalance(design, perf);
    const rows: Array<[string, number]> = [
      [t('Сила, 1-й порядок'), b.force1],
      [t('Сила, 2-й порядок'), b.force2],
      [t('Момент, 1-й порядок'), b.couple1],
      [t('Момент, 2-й порядок'), b.couple2],
    ];
    const bars = rows
      .map(([name, value]) => `<div class="bar-row"><span class="bar-name">${name}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.min(100, (value / 3) * 100).toFixed(1)}%"></span></span><span class="bar-value">${value < 0.01 ? '0' : num(value, 2)}</span></div>`)
      .join('');
    return `<div class="bars">${bars}</div><p class="note">${t('Одиниця: сила інерції одного поршня. Увімкни «Перебільшити вібрації», щоб побачити це на моделі.')}</p>`;
  }

  private statsHtml(design: Design, perf: Performance): string {
    const fuel = FUELS[design.fuel];
    const peak = perf.peakPower;
    const row = (k: string, v: string): string => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const litres = perf.displacementL;
    return [
      row(t('Робочий об’єм'), t('{value} л', { value: num(litres, 2) })),
      row(t('Питома потужність'), t('{value} к.с./л', { value: num(peak.powerHp / Math.max(litres, 0.01)) })),
      row(t('Середній ефективний тиск'), t('{value} бар', { value: num(perf.peakTorque.bmepBar, 1) })),
      row(t('Найкраща питома витрата'), perf.bestBsfc.bsfc < 2000 ? t('{value} г/кВт·год', { value: num(perf.bestBsfc.bsfc) }) : t('немає')),
      row(t('Найвищий ККД'), perf.bestBsfc.bsfc < 2000 ? `${num(brakeEfficiency(perf.bestBsfc.bsfc, fuel.lhv) * 100)}%` : t('немає')),
      row(t('Витрата на піку потужності'), t('{value} л/год', { value: num(peak.fuelLh, 1) })),
      row(t('Маса, оцінка'), t('{value} кг', { value: num(perf.massKg) })),
      row(t('Потужність на кілограм'), t('{value} к.с./кг', { value: num(peak.powerHp / perf.massKg, 2) })),
      row(t('Холостий хід'), t('{rpm} об/хв', { rpm: num(perf.idleRpm) })),
      row(t('Набір обертів без навантаження'), t('{value} с', { value: num(perf.revTimeS, 1) })),
      row(t('Запас до руйнування'), Number.isFinite(perf.failureRpm) ? t('{rpm} об/хв', { rpm: rpmText(perf.failureRpm) }) : t('немає')),
    ].join('');
  }
}

const deltaFuel = (now: number, then: number): string => {
  const d = now - then;
  if (Math.abs(d) < 0.05) return `<span class="delta">${t('без змін')}</span>`;
  return `<span class="delta">${t('{sign}{value} л', { sign: d > 0 ? '+' : '−', value: num(Math.abs(d), 1) })}</span>`;
};

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
