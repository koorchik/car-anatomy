// The designer's controls for variable valve gear: phasers, a second cam profile, valves that set the load,
// and cylinders that rest. Kept apart from params.ts so the rest of the panel reads as before.

import { isRotary, type Design } from '../../designer/design.ts';
import { FUELS } from '../../designer/fuels.ts';
import type { Performance } from '../../designer/physics.ts';
import { deactivationSets } from '../../designer/valvetrain.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { ParamGroup } from './params.ts';

const rpm = (v: number): string => t('{rpm} об/хв', { rpm: (Math.round(v / 50) * 50).toLocaleString(numberLocale) });
const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const phased = (d: Design): boolean => d.camPhaser !== 'none';
const switched = (d: Design): boolean => d.camSwitch !== 'none';

/** How a phase reads: earlier or later than park, in crank degrees. */
export const phaseText = (shift: number, exhaust: boolean): string => {
  const deg = Math.round(Math.abs(shift));
  if (deg === 0) return exhaust ? t('випуск як у спокої') : t('впуск як у спокої');
  if (exhaust) return shift > 0 ? t('випуск пізніше на {deg}°', { deg }) : t('випуск раніше на {deg}°', { deg });
  return shift < 0 ? t('впуск раніше на {deg}°', { deg }) : t('впуск пізніше на {deg}°', { deg });
};

function readouts(d: Design, perf: Performance): Array<[string, string]> {
  const rows: Array<[string, string]> = [[t('Стиснення / розширення'), `${num(perf.effectiveCompression, 1)} : 1 / ${num(d.compression, 1)} : 1`]];
  const vt = perf.valvetrain;
  if (!vt) return rows;
  const c = perf.cruise;
  if (c.reachable) {
    if (phased(d)) {
      const phases = d.camPhaser === 'coupled' ? [phaseText(c.intakeShift, false)] : [phaseText(c.intakeShift, false), ...(d.camPhaser === 'dual' ? [phaseText(c.exhaustShift, true)] : [])];
      rows.push([t('Фази на круїзі'), phases.join(', ')]);
    }
    if (d.deactivation !== 'none') rows.push([t('Циліндри на круїзі'), t('{active} з {all}', { active: c.activeCylinders, all: d.cylinders })]);
    if (d.liftControl !== 'cam') rows.push([t('Підйом впуску на круїзі'), t('{value} мм', { value: num(c.liftMm, 1) })]);
    rows.push([t('Насосні втрати на круїзі'), t('{value} бар', { value: num(c.pumpingBar, 2) })]);
  }
  if (switched(d)) rows.push([t('Криві кулачків перетинаються'), vt.crossoverRpm === null ? t('ніде') : rpm(vt.crossoverRpm)]);
  if (phased(d)) rows.push([t('Виборки в поршні'), t('{value} мм', { value: num(vt.reliefMm, 1) })]);
  return rows;
}

export const VALVETRAIN_GROUP: ParamGroup = {
  id: 'vvt',
  title: t('Змінні фази й підйом'),
  intro: t('Один кулачок завжди компроміс між низами й верхами. Ці механізми дають двигуну кілька кулачків або рухають їх на ходу.'),
  applies: (d) => !isRotary(d),
  widget: 'cams',
  params: [
    {
      kind: 'choice',
      key: 'camPhaser',
      label: t('Фазообертач'),
      options: (d) =>
        d.valvetrain === 'dohc'
          ? [['none', t('Немає')], ['intake', t('Лише впуск')], ['dual', t('Впуск і випуск')]]
          : [['none', t('Немає')], ['coupled', t('Весь вал')]],
      help: t('Фазообертач повертає вал відносно зірочки на ходу: на низах впуск закривається раніше, на верхах пізніше, а на круїзі більше перекриття замінює частину дроселювання.'),
    },
    { kind: 'number', key: 'intakePhaseRange', label: t('Діапазон фазообертача'), unit: '°', step: 1, applies: phased, help: t('На скільки градусів колінвала можна зсунути впускний вал, а якщо кулачки на одному валу, то весь вал. Більший діапазон розширює криву моменту, але клапан підходить ближче до поршня, і в днищі потрібні глибші виборки.') },
    { kind: 'number', key: 'exhaustPhaseRange', label: t('Діапазон випуску'), unit: '°', step: 1, applies: (d) => d.camPhaser === 'dual', help: t('Пізній випуск залишає в циліндрі частину газів. На круїзі дросель тоді відкривається ширше, і насосні втрати менші.') },
    {
      kind: 'choice',
      key: 'camSwitch',
      label: t('Перемикання кулачків'),
      applies: (d) => d.valvetrain !== 'ohv',
      options: (d) => (d.liftControl === 'cam' ? [['none', t('Немає')], ['intake', t('Впуск')], ['exhaust', t('Випуск')], ['both', t('Обидва')]] : [['none', t('Немає')], ['exhaust', t('Випуск')]]),
      help: t('Два профілі на одному валу: низький для холостого ходу й круїзу, високий для верхів. Блок керування вмикає високий на заданих обертах під навантаженням.'),
    },
    { kind: 'number', key: 'switchRpm', label: t('Оберти перемикання'), unit: t('об/хв'), step: 50, applies: switched, help: t('Найкраще там, де перетинаються криві моменту двох кулачків. Раніше чи пізніше на графіку з’являється провал.') },
    { kind: 'number', key: 'lowLift', label: t('Підйом низького кулачка'), unit: t('мм'), step: 0.25, digits: 2, applies: switched, help: t('Менший підйом дає повільніший потік і рівніший холостий хід, але на верхах душить.') },
    { kind: 'number', key: 'lowDuration', label: t('Фаза низького кулачка'), unit: '°', step: 1, applies: switched, help: t('Тривалість впуску на низькому кулачку. Випускний низький кулачок має ту саму різницю з основним.') },
    {
      kind: 'choice',
      key: 'switchKind',
      label: t('Як перемикається'),
      only: 'looks',
      applies: switched,
      options: [['pin', t('Штифт і третій кулачок')], ['slide', t('Зсувний кулачок')]],
      help: t('Так перемикають Honda, Toyota, Porsche (штифт) або Audi, BMW (зсувний блок). На цифри не впливає.'),
    },
    {
      kind: 'choice',
      key: 'liftControl',
      label: t('Керування підйомом'),
      applies: (d) => !FUELS[d.fuel].diesel && d.valvetrain !== 'ohv',
      options: (d) => (d.valvetrain === 'dohc' ? [['cam', t('Кулачок')], ['continuous', t('Плавний підйом')], ['multiair', t('Гідравліка MultiAir')]] : [['cam', t('Кулачок')], ['multiair', t('Гідравліка MultiAir')]]),
      help: t('Навантаження задає впускний клапан, а не дросель: він менше відкривається або раніше закривається. На круїзі майже немає розрідження у впуску, тому менші насосні втрати.'),
    },
    {
      kind: 'choice',
      key: 'deactivation',
      label: t('Вимкнення циліндрів'),
      applies: (d) => d.cylinders >= 4 && d.cylinders % 2 === 0,
      options: [['none', t('Немає')], ['valves', t('Закриттям клапанів')], ['fuel', t('Лише паливо')]],
      help: t('На малому навантаженні половина циліндрів відпочиває, а решта працює з ширшим дроселем і меншими втратами на прокачування.'),
    },
    {
      kind: 'choice',
      key: 'deactivateGroup',
      label: t('Які вимикаються'),
      only: 'sound',
      applies: (d) => d.deactivation !== 'none',
      options: (d) => {
        const first = deactivationSets({ ...d, deactivateGroup: 'first' })[0] ?? [];
        const second = deactivationSets({ ...d, deactivateGroup: 'second' })[0] ?? [];
        return [['first', first.join(', ')], ['second', second.join(', ')], ['alternate', t('По черзі')]];
      },
      help: t('Кожен другий за порядком запалювання, тому решта спалахує рівно. По черзі міняє групи кожні 20 секунд, як Porsche. Витрату не змінює, лише звук і вигляд.'),
    },
  ],
  readouts,
};
