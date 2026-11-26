// What the bump scene says about a run (suspensions plan, the bump scene, steps 3, 5 and 8): the numbers under the
// strip chart and the sentence on why the body feels the obstacle or not. Everything comes from the run itself, so a
// change of the setup, the speed or the obstacle rewrites the words too. Without the DOM, so the test reads them.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { BumpStats } from '../../suspension/bump.ts';

const fmt = (v: number, digits: number): string =>
  v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Ukrainian counts take two forms past one: 2–4 (but 12–14) and the rest. */
const hopsText = (ms: number, n: number): string =>
  n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? t('{ms} мс, відривалося {n} рази', { ms, n }) : t('{ms} мс, відривалося {n} разів', { ms, n });

/** One row of the numbers: what, and how much. */
export interface BumpRow {
  id: 'body' | 'tyre' | 'air' | 'travel' | 'settle';
  label: string;
  value: string;
  /** Worth a warning colour: the wheel off the road, the bump stop hit, a corner that never settles. */
  alarm: boolean;
}

export function bumpRows(s: BumpStats): BumpRow[] {
  const airMs = Math.round(s.airS * 1000);
  return [
    {
      id: 'body',
      label: t('Кузов, найбільше'),
      value: t('{g} g, піднявся на {mm} мм', { g: fmt(s.bodyPeakG, 2), mm: fmt(s.bodyRiseM * 1000, 0) }),
      alarm: false,
    },
    {
      id: 'tyre',
      label: t('Шина'),
      value: t('від {lo} до {hi} статичного навантаження', { lo: fmt(s.tyreMin, 2), hi: fmt(s.tyreMax, 2) }),
      alarm: s.tyreMin === 0,
    },
    {
      id: 'air',
      label: t('Колесо в повітрі'),
      value: airMs === 0 ? t('ні, весь час на дорозі') : s.hops > 1 ? hopsText(airMs, s.hops) : t('{ms} мс', { ms: airMs }),
      alarm: airMs > 0,
    },
    s.stopHit
      ? { id: 'travel', label: t('Удар у відбійник'), value: t('{g} g, хід {mm} мм із {stop}', { g: fmt(s.stopPeakG, 1), mm: fmt(s.travelMaxM * 1000, 0), stop: fmt(s.toStopM * 1000, 0) }), alarm: true }
      : { id: 'travel', label: t('Хід'), value: t('{mm} мм із {stop} до відбійника', { mm: fmt(s.travelMaxM * 1000, 0), stop: fmt(s.toStopM * 1000, 0) }), alarm: false },
    {
      id: 'settle',
      label: t('Заспокоївся'),
      value: s.settleS === null ? t('ні, гойдається й через 3 с') : t('за {s} с', { s: fmt(s.settleS, 2) }),
      alarm: s.settleS === null,
    },
  ];
}

/**
 * Why the body feels the obstacle or not (step 5): how long the obstacle takes to pass and its frequency V/ℓ against
 * the body's and the wheel's own frequencies.
 */
export function bumpCaption(s: BumpStats): string {
  const body = fmt(s.bodyHz, 1);
  const hop = fmt(s.hopHz, 0);
  if (s.hitS === null || s.hitHz === null) {
    return t('Край бордюру — сходинка: дорога за ним вища, тож колесо мусить піднятися на всю висоту одразу, а кузов слідом за ним. Частота кузова {body} Гц, підскоку колеса {hop} Гц.', { body, hop });
  }
  const head = t('Удар триває {ms} мс, тобто частота V/ℓ = {hz} Гц', { ms: fmt(s.hitS * 1000, 0), hz: fmt(s.hitHz, 0) });
  if (s.hitHz < 3 * s.bodyHz) {
    return t('{head}: недалеко від частоти кузова ({body} Гц), тому кузов повільно перекочується через перешкоду разом із колесом.', { head, body });
  }
  if (s.hitHz < s.hopHz) {
    return t('{head}: між частотою кузова ({body} Гц) і підскоком колеса ({hop} Гц). Колесо йде за дорогою, а пружина й амортизатор передають удар кузову.', { head, body, hop });
  }
  return t('{head}: вища за підскок колеса ({hop} Гц). Колесо не встигає за дорогою, удар беруть шина й амортизатор, а кузов піднімається менше, ніж на повільному проїзді. Тому дрібну хвилю краще проїжджати швидко, а лежачого поліцейського повільно.', { head, hop });
}
