// What the rough-road and shaker scenes say (suspensions plan, the rough road and the shaker): the bars of the ride
// triangle, the sentence under the damping curves and the caption of the invariant point. Every number comes from the
// run or the curves, so a change of the setup rewrites the words too. Without the DOM, so the test reads them.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { ComfortBand } from '../../suspension/comfort.ts';
import type { RoughResult, RoughSweep } from '../../suspension/rough-run.ts';
import type { InvariantCheck } from '../../suspension/shaker-scene.ts';

const fmt = (v: number, digits: number): string =>
  v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A share as per cent with the digits it needs: 0,06 %, 0,6 %, 14 %, 99,7 %. */
export const percent = (share: number): string => {
  const p = share * 100;
  return t('{value} %', { value: fmt(p, p === 0 ? 0 : Math.abs(p) < 1 ? 2 : Math.abs(p) < 10 || Math.abs(p) > 90 ? 1 : 0) });
};

/** The words of ISO 2631-1 for a comfort band. */
export const bandWord = (b: ComfortBand): string =>
  ({
    not: t('не неприємно'),
    little: t('трохи неприємно'),
    fairly: t('досить неприємно'),
    uncomfortable: t('неприємно'),
    very: t('дуже неприємно'),
    extremely: t('вкрай неприємно'),
  })[b];

/** The one or two bands a value falls in (the standard's bands overlap), as words. */
export const bandWords = (bands: readonly ComfortBand[]): string => bands.map(bandWord).join(t(' або '));

export type RideBarId = 'comfort' | 'grip' | 'travel';

/** One bar of the triangle: its name, the number on it, the line under it and how full it is (longer is worse). */
export interface RideBar {
  id: RideBarId;
  label: string;
  value: string;
  note: string;
  /** The quantity the bar's length shows, in the bar's own unit. */
  amount: number;
  alarm: boolean;
}

/** Fixed lengths of the bars for one road and wheel, so a change of the damper shows as a longer or shorter bar. */
export interface RideScale {
  comfort: number;
  grip: number;
  travel: number;
}

/** The scale of the bars: the worst of the damping sweep, of this run and of the remembered one, and the bump stop. */
export function rideScale(sweep: RoughSweep, ...runs: Array<RoughResult | null>): RideScale {
  const max = (a: ArrayLike<number>): number => Math.max(...Array.from(a));
  const known = runs.filter((r): r is RoughResult => r !== null);
  return {
    comfort: 1.1 * Math.max(max(sweep.comfortAw), ...known.map((r) => r.comfortAw)),
    grip: 1.1 * Math.max(max(sweep.dlc), ...known.map((r) => r.load.dlc)),
    // A full bar is 3σ of travel reaching the bump stop.
    travel: Math.max(...known.map((r) => r.toStopM), 1e-3),
  };
}

export function rideBars(r: RoughResult): RideBar[] {
  return [
    {
      id: 'comfort',
      label: t('Комфорт'),
      value: t('{value} м/с²', { value: fmt(r.comfortAw, 2) }),
      note: bandWords(r.bands),
      amount: r.comfortAw,
      alarm: false,
    },
    {
      id: 'grip',
      label: t('Зчеплення шини'),
      value: t('коливання {value}', { value: percent(r.load.dlc) }),
      note: t('у повітрі {air} · зчеплення {grip}', { air: percent(r.load.airShare), grip: percent(r.load.availableGrip) }),
      amount: r.load.dlc,
      alarm: r.load.airShare > 0,
    },
    {
      id: 'travel',
      label: t('Хід'),
      value: t('СКВ {value} мм', { value: fmt(r.travelRmsM * 1000, 1) }),
      note: r.bumpStopMarginM < 0
        ? t('відбійник стиснуто на {value} мм', { value: fmt(-r.bumpStopMarginM * 1000, 0) })
        : t('до відбійника {value} мм', { value: fmt(r.bumpStopMarginM * 1000, 0) }),
      amount: 3 * r.travelRmsM,
      alarm: r.bumpStopMarginM < 0,
    },
  ];
}

/** The red line of step 3, or nothing while the wheel keeps the road. */
export const airAlarm = (r: RoughResult): string =>
  r.load.airShare > 0 ? t('Колесо втрачає дорогу {value} часу', { value: percent(r.load.airShare) }) : '';

/** The sentence under the damping curves: the two minima of this road, from the model. */
export const sweepCaption = (s: RoughSweep): string =>
  t('Один амортизатор не може бути найкращим і для спини, і для шини: на цій дорозі комфорт найкращий при ζ {comfort}, зчеплення — при ζ {grip}.', {
    comfort: fmt(s.bestComfortZeta, 2),
    grip: fmt(s.bestGripZeta, 2),
  });

/** The caption of the invariant point: how far the three curves of the body are from one point there, and why. */
export function invariantCaption(c: InvariantCheck, tyreDamping: boolean): string {
  const head = t('На {hz} Гц кузов рухається майже однаково з будь-яким амортизатором: три криві для ζ 0,1, 0,3 і 0,7 відходять від однієї точки щонайбільше на {spread}.', {
    hz: fmt(c.hz, 1),
    spread: percent(c.spread),
  });
  const why = tyreDamping
    ? t('Точно в одну точку їм не дає зійтися шина: вона теж трохи гасить коливання, її сила залежить від того, як рухається колесо, а рух колеса залежить від амортизатора. Вимкни «Демпфування шини», і криві зійдуться.')
    : t('Без демпфування шини криві сходяться точно: на частоті √(k_t/m_u) інерція колеса якраз урівноважує пружність шини, тож кузов отримує всю силу, з якою дорога тисне на шину, хоч який стоїть амортизатор.');
  return `${head} ${why} ${t('Тут не допоможе ні амортизатор, ні навіть активна підвіска між кузовом і колесом, лише легше колесо: воно зсуває точку на вищу частоту, а на графіку опускає її.')}`;
}
