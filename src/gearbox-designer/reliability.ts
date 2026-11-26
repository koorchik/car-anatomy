// How close a gearbox runs to what its parts take (gearbox plan, reliability and diagnoses; stage K9b): the teeth's
// bending and contact in the weakest gear, the synchroniser's hardest shift and the clutch, each as a load where 1 is
// the limit, and a verdict in words from the worst of them, as the engine designer gives one.
//
// What 1 means differs by part, and so does what lies past it:
// - teeth: 1 is the TR-6060 MZ6's first pair at its rating (strength.ts). Past it a gear lasts a number of
//   full-throttle starts; under FATAL_STARTS it is doomed;
// - synchroniser: 1 is the upper end of the patent test points. Past it the rings wear and crunch, but nothing breaks
//   at once;
// - clutch: 1 is the engine's peak torque on the clutch's static capacity. Past it the clutch slips at full throttle
//   and burns: doomed.

import { CONE_TEST_LIMITS } from '../drivetrain/synchro-math.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import type { GearboxPerformance } from './evaluate.ts';
import { BENDING_LIMIT_MPA, CONTACT_LIMIT_MPA, loadForStarts, startsAt } from './strength.ts';

/** Full-throttle starts under which a gear counts as doomed [estimate: a few track days]. */
export const FATAL_STARTS = 100;
/** Up to this worst load a box is solid. */
const SOLID_LOAD = 0.85;

export type GearboxPart = 'teeth' | 'flanks' | 'synchro' | 'clutch';
export type GearboxVerdictId = 'solid' | 'rated' | 'short' | 'doomed';

export interface GearboxLimit {
  id: GearboxPart;
  name: string;
  load: number;
  /** Load past which the part fails at once (Infinity: it only wears). */
  fatalAt: number;
  detail: string;
  fix: string;
  failure: string;
}

export interface GearboxReliability {
  items: GearboxLimit[];
  worst: GearboxLimit;
  verdict: GearboxVerdictId;
  verdictName: string;
  lifeText: string;
  /** Full-throttle starts the weakest gear lasts; Infinity at a bending load of 1 or below. */
  starts: number;
  /** The gear with the highest bending load, 0 when none is loaded. */
  weakestGear: number;
}

const n0 = (v: number): string => Math.round(v).toLocaleString(numberLocale);
const n2 = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
/** Starts rounded to two significant figures: the life curve says no more. */
export const startsText = (n: number): string => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(n, 1))) - 1);
  return n0(Math.round(n / p) * p);
};

export function assessGearbox(perf: GearboxPerformance): GearboxReliability {
  const weakest = perf.strength.reduce((w, g) => (g.bending > w.bending ? g : w), perf.strength[0]!);
  const flank = perf.strength.reduce((w, g) => (g.contact > w.contact ? g : w), perf.strength[0]!);
  const flankMesh = flank.meshes.reduce((w, m) => (!w || m.contact > w.contact ? m : w), flank.meshes[0]);
  const teeth = (pair: [number, number] | undefined): string => (pair ? `${pair[0]}/${pair[1]}` : '—');
  const hardest = perf.synchro.shifts.reduce((w, s) => (!w || s.load > w.load ? s : w), perf.synchro.shifts[0]);
  const c = perf.clutch;
  const items: GearboxLimit[] = [
    {
      id: 'teeth',
      name: t('Згин зубців'),
      load: weakest.bending,
      fatalAt: loadForStarts(FATAL_STARTS),
      detail: t('Найслабша пара {teeth} у {gear}-й передачі: {stress} МПа в корені зубця з {limit} на піковому моменті {torque} Н·м.', {
        teeth: teeth(weakest.weakest?.teeth), gear: weakest.gear, stress: n0(weakest.weakest?.bendingMpa ?? 0), limit: n0(BENDING_LIMIT_MPA), torque: n0(perf.peakTorqueNm),
      }),
      fix: t('Ширший зубець, грубіший модуль, більша міжосьова або менше число першої.'),
      failure: t('Відламало зубець у {gear}-й передачі.', { gear: weakest.gear }),
    },
    {
      id: 'flanks',
      name: t('Контакт зубців'),
      load: flank.contact,
      fatalAt: Infinity,
      detail: t('Пара {teeth} у {gear}-й передачі: {stress} МПа на робочій поверхні з {limit}. Понад межу поверхня викришується.', {
        teeth: teeth(flankMesh?.teeth), gear: flank.gear, stress: n0(flankMesh?.contactMpa ?? 0), limit: n0(CONTACT_LIMIT_MPA),
      }),
      fix: t('Ширший зубець або більша міжосьова.'),
      failure: t('Поверхню зубців викришило: коробка завиває й тріщить.'),
    },
    {
      id: 'synchro',
      name: t('Синхронізатор'),
      load: perf.synchro.load,
      fatalAt: Infinity,
      detail: hardest
        ? t('Найважче перемикання {from}→{to}: {energy} Дж/мм² і {power} Вт/мм² на конусі проти {eLimit} і {pLimit} на випробуваннях.', {
          from: hardest.from, to: hardest.to, energy: n2(hardest.energyJPerMm2), power: n2(hardest.powerWPerMm2), eLimit: n2(CONE_TEST_LIMITS.energyJPerMm2), pLimit: n2(CONE_TEST_LIMITS.powerWPerMm2),
        })
        : t('Синхронізаторів немає.'),
      fix: t('Більше конусів, ближчі числа передач або латунь замість вуглецю.'),
      failure: t('Кільця синхронізатора стерлися: передачі вмикаються з хрускотом.'),
    },
    {
      id: 'clutch',
      name: t('Зчеплення'),
      load: 1 / c.margin,
      fatalAt: 1,
      detail: t('Тримає {capacity} Н·м при піковому моменті {torque} Н·м: запас {margin}.', { capacity: n0(c.staticNm), torque: n0(perf.peakTorqueNm), margin: n2(c.margin) }),
      fix: t('Більший диск, сильніше притискання, другий диск або керамічна накладка.'),
      failure: t('Зчеплення ковзає й горить на повному газу.'),
    },
  ];
  const fatal = items.filter((i) => i.load > i.fatalAt);
  const worst = fatal[0] ?? items.reduce((w, i) => (i.load > w.load ? i : w), items[0]!);
  const starts = startsAt(weakest.bending);
  const verdict: GearboxVerdictId = fatal.length ? 'doomed' : worst.load <= SOLID_LOAD ? 'solid' : worst.load <= 1 ? 'rated' : 'short';
  const names: Record<GearboxVerdictId, string> = {
    solid: t('Надійна'),
    rated: t('На межі розрахунку'),
    short: t('Обмежений ресурс'),
    doomed: t('Приречена'),
  };
  let lifeText: string;
  if (verdict === 'solid') lifeText = t('Сотні тисяч кілометрів');
  else if (verdict === 'rated') lifeText = t('Як серійна коробка під свій розрахунковий момент');
  else if (verdict === 'doomed') lifeText = worst.id === 'clutch' ? t('Зчеплення ковзає вже на піковому моменті') : t('Зламається за кілька десятків стартів');
  else if (Number.isFinite(starts)) lifeText = t('Близько {starts} стартів на повному газу', { starts: startsText(starts) });
  else lifeText = t('Швидко зношується: {part}', { part: worst.name.toLowerCase() });
  return { items, worst, verdict, verdictName: names[verdict], lifeText, starts, weakestGear: weakest.weakest ? weakest.gear : 0 };
}
