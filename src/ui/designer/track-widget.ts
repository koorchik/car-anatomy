// "On track" under the designer's lubrication controls: the visitor's engine in a generic car on the test circuit, on
// street tyres, semi-slicks and slicks, with a verdict for each. Worked out after a pause, in slices between frames,
// with the oil model loaded the first time it is needed.

import { encodeDesign } from '../../designer/codec.ts';
import { isRotary, type Design } from '../../designer/design.ts';
import { effectiveSump } from '../../designer/lubrication.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { TYRE_IDS, TYRES } from '../../vehicle/vehicle.ts';

const DELAY_MS = 800;
const STEPS_PER_SLICE = 1500;

const BANDS: Record<string, string> = {
  hundreds: t('сотні кіл'),
  tens: t('десятки кіл'),
  few: t('кілька кіл'),
  lap: t('не доїде коло'),
};

export class TrackWidget {
  readonly root = document.createElement('div');
  private readonly rows = document.createElement('div');
  private readonly link = document.createElement('a');
  private timer = 0;
  private generation = 0;
  private lastKey = '';

  constructor() {
    this.root.className = 'track-widget';
    const head = document.createElement('h4');
    head.textContent = t('На треку');
    this.rows.className = 'track-rows';
    this.link.className = 'btn';
    this.link.textContent = t('Перевірити на треку');
    this.root.append(head, this.rows, this.link);
  }

  sync(d: Design): void {
    this.root.hidden = isRotary(d);
    if (isRotary(d)) return;
    this.link.href = `#/sump/design/${encodeDesign(d)}`;
    // Only what the lap and the oil depend on.
    const key = JSON.stringify({ ...d, name: '', coverColor: null, factory: null });
    if (key === this.lastKey) return;
    this.lastKey = key;
    clearTimeout(this.timer);
    const generation = ++this.generation;
    this.rows.textContent = t('Рахую коло…');
    this.timer = window.setTimeout(() => void this.compute(d, generation), DELAY_MS);
  }

  private async compute(d: Design, generation: number): Promise<void> {
    const [{ evaluate }, { designToSpec }, { buildEngine }, { systemsOf }, { genericCar }, scenario] = await Promise.all([
      import('../../designer/physics.ts'),
      import('../../designer/to-spec.ts'),
      import('../../engine/kinematics.ts'),
      import('../../engine/systems-spec.ts'),
      import('../../data/sump-cars.ts'),
      import('../../lubrication/scenario.ts'),
    ]);
    if (generation !== this.generation) return;
    const plain = { ...d, factory: null };
    const perf = evaluate(plain);
    const spec = designToSpec(plain, perf);
    const engine = buildEngine(spec);
    const systems = systemsOf(spec);
    const car = genericCar(d.name, perf.peakPower.powerHp);
    const choice = { kind: effectiveSump(d), oilDeltaL: 0, accumulator: false, place: 'middle' as const };
    const lines: string[] = [];
    for (const tyre of TYRE_IDS) {
      const runner = scenario.oilRunner(engine, systems, car, scenario.lapFor(plain, null, car, tyre), choice);
      while (!runner.advance(STEPS_PER_SLICE)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (generation !== this.generation) return;
      }
      const s = runner.run.summary;
      const name = TYRES[tyre].name;
      const dip = s.longestDipS.toLocaleString(numberLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
      if (s.belowNeedS === 0) lines.push(`<div class="track-row ok"><b>${name}</b><span>${t('тиск тримається')}</span></div>`);
      else if (s.band === 'none') lines.push(`<div class="track-row warn"><b>${name}</b><span>${t('короткі провали до {s} с', { s: dip })}</span></div>`);
      else lines.push(`<div class="track-row bad"><b>${name}</b><span>${t('голодування: вкладиші витримають {band}', { band: BANDS[s.band] ?? '' })}</span></div>`);
      this.rows.innerHTML = lines.join('');
    }
  }
}
