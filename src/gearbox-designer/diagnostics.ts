// The gearbox designer's figures in plain words (gearbox plan, reliability and diagnoses; stage K9b): what goes
// wrong, why, and what would help. Nothing here forbids a design; a fatal one is only told so. The catalogue's
// factory boxes get no fatal diagnosis (tests/gearbox-designer 4).

import { helixForCentre } from '../drivetrain/gear-geometry.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { CLUTCH_MARGIN } from './clutch.ts';
import type { GearboxDesign } from './design.ts';
import type { GearboxPerformance } from './evaluate.ts';
import { FATAL_STARTS, startsText, type GearboxReliability } from './reliability.ts';
import { startsAt } from './strength.ts';
import { SLOW_SYNC_S } from './synchro.ts';
import { whineDb } from './mesh-sound.ts';
import { undercutLimit } from './teeth.ts';
import { designBuild } from './to-spec.ts';

export type GearboxSeverity = 'fatal' | 'warning' | 'note';

export interface GearboxDiagnostic {
  id: string;
  severity: GearboxSeverity;
  title: string;
  text: string;
  fix?: string;
}

/** Grade a first gear must pull away on, per cent (gearbox plan). */
export const START_GRADE_PCT = 15;
/** Top gear counts as an overdrive when its speed at the rev limit is this much above v_max [estimate]. */
const OVERDRIVE_SHARE = 1.1;
/** The helical base pair of NASA TM-106511 (20°, ε_α 1.38, ε_β 1.25) by the overlap law, dB (research §18.1). */
const HELICAL_BASE_DB = whineDb({ epsAlpha: 1.38, epsBeta: 1.25 });

const n0 = (v: number): string => Math.round(v).toLocaleString(numberLocale);
const n1 = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n2 = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pair = (teeth: readonly number[]): string => teeth.join('/');

export function diagnoseGearbox(d: GearboxDesign, perf: GearboxPerformance, rel: GearboxReliability): GearboxDiagnostic[] {
  const out: GearboxDiagnostic[] = [];
  const add = (id: string, severity: GearboxSeverity, title: string, text: string, fix?: string): void => {
    out.push({ id, severity, title, text, fix });
  };

  // Teeth.
  const weakest = perf.strength.find((g) => g.gear === rel.weakestGear);
  if (weakest && weakest.bending > 1 && weakest.weakest) {
    const starts = startsAt(weakest.bending);
    add(
      'teeth-break',
      starts < FATAL_STARTS ? 'fatal' : 'warning',
      t('Зубці {gear}-ї передачі зламаються', { gear: weakest.gear }),
      t('На повному газу пара {teeth} витримає близько {starts} стартів: корінь зубця навантажено на {pct}% від межі.', {
        teeth: pair(weakest.weakest.teeth), starts: startsText(starts), pct: n0(weakest.bending * 100),
      }),
      t('Ширший зубець, грубіший модуль першої, більша міжосьова або коротша головна пара.'),
    );
  }
  const flank = perf.strength.reduce((w, g) => (g.contact > w.contact ? g : w), perf.strength[0]!);
  if (flank.contact > 1) {
    add('pitting', 'warning', t('Поверхня зубців викришиться'), t('У {gear}-й передачі тиск на робочій поверхні {pct}% від межі: з часом на ній з’являться раковини.', { gear: flank.gear, pct: n0(flank.contact * 100) }), t('Ширший зубець або більша міжосьова.'));
  }

  // Clutch.
  const c = perf.clutch;
  if (c.margin < 1) {
    add('clutch-slips', 'fatal', t('Зчеплення ковзає на піковому моменті'), t('Воно тримає {capacity} Н·м, а двигун дає {torque}: на повному газу диск прослизає й горить.', { capacity: n0(c.staticNm), torque: n0(perf.peakTorqueNm) }), t('Більший диск, сильніше притискання, другий диск або керамічна накладка.'));
  } else if (c.margin < CLUTCH_MARGIN) {
    add('clutch-margin', 'warning', t('Зчеплення без запасу'), t('Запас лише {margin} при звичних 1,2–1,5: зношений диск почне прослизати.', { margin: n2(c.margin) }), t('Більший диск або сильніше притискання.'));
  }

  // Synchronisers.
  const up12 = perf.synchro.shifts.find((s) => s.from === 1 && s.to === 2);
  if (up12 && up12.timeS > SLOW_SYNC_S) {
    add('sync-slow', 'warning', t('Синхронізатор 1→2 не встигає'), t('На межі обертів він вирівнює швидкості {ms} мс: рука водія чекає на важелі.', { ms: n0(up12.timeS * 1000) }), t('Більше конусів, матеріал із більшим тертям, менший кут конуса або сильніше на важіль.'));
  }
  const hot = perf.synchro.shifts.filter((s) => s.load > 1);
  if (hot.length) {
    const s = hot.reduce((w, x) => (x.load > w.load ? x : w), hot[0]!);
    add('sync-hot', 'warning', t('Синхронізатор перегрівається'), t('Перемикання {from}→{to} кладе на конус {energy} Дж/мм² і {power} Вт/мм²: більше, ніж витримують кільця на випробуваннях.', { from: s.from, to: s.to, energy: n2(s.energyJPerMm2), power: n2(s.powerWPerMm2) }), t('Більше конусів або ближчі числа передач.'));
  }
  if (perf.synchro.blocking < 1) {
    add('sync-crunch', 'warning', t('Кільце не блокує муфту'), t('Фаски провертають кільце раніше, ніж швидкості зрівняються (запас блокування {margin}): передачі вмикаються з хрускотом.', { margin: n2(perf.synchro.blocking) }), t('Гостріший кут даху, менший кут конуса або матеріал із більшим тертям.'));
  }
  if (perf.synchro.sticks) {
    add('sync-sticks', 'warning', t('Кільце прилипає до конуса'), t('Кут конуса замалий для такого тертя: після перемикання кільце не відходить і гальмує шестерню.'), t('Більший кут конуса.'));
  }

  // Ratios and the car.
  const out1 = perf.shifts.filter((s) => !s.inBand);
  if (out1.length) {
    add('band', 'note', t('Двигун випадає зі смуги потужності'), t('Після перемикання {shifts} оберти падають нижче {rpm} об/хв, де двигун ще дає 85% піку.', {
      shifts: out1.map((s) => `${s.from}→${s.to}`).join(', '), rpm: n0(perf.powerBand[0]),
    }), t('Більше передач або ближчі числа внизу.'));
  }
  if (perf.startGradePct < START_GRADE_PCT) {
    add('start-grade', 'warning', t('Перша задовга'), t('Рушити вдасться лише з ухилу {pct}%, а не з {need}%.', { pct: n0(perf.startGradePct), need: START_GRADE_PCT }), t('Коротша перша або головна передача.'));
  }
  const top = perf.gears[perf.gears.length - 1]!;
  if (perf.vmaxAtLimiter) {
    add('limiter', 'note', t('Вища передача впирається у відсічку'), t('На {kmh} км/год двигун уже на межі обертів, хоча опір ще дозволив би їхати швидше.', { kmh: n0(perf.vmaxKmh) }), t('Довша вища передача або головна.'));
  } else if (perf.vmaxGear < perf.gears.length || top.kmhAtLimit > perf.vmaxKmh * OVERDRIVE_SHARE) {
    add('overdrive', 'note', t('Вища передача — овердрайв'), t('Найбільша швидкість {kmh} км/год у {gear}-й, а вища передача до межі обертів не доходить: вона для тихої їзди на трасі.', { kmh: n0(perf.vmaxKmh), gear: perf.vmaxGear }));
  }

  // Teeth as cut.
  const { box, teeth } = designBuild(d);
  const forwardMeshes = new Set<number>();
  for (let k = 1; k <= d.gears; k++) for (const j of box.states.find((s) => s.name === String(k))?.loaded ?? []) forwardMeshes.add(j);
  const spur = [...forwardMeshes].filter((j) => !box.meshes[j]!.bevel && box.meshes[j]!.geometry.a.beta === 0);
  if (spur.length) {
    const loudest = Math.max(...perf.tones.flatMap((g) => g.meshes.map((m) => m.db)));
    add('spur-whine', 'note', t('Прямозубі шестерні завивають'), t('Зачеплення без нахилу зуба дзвенить на частоті зубців, на {db} дБ гучніше за звичайну косозубу пару.', { db: n1(loudest - HELICAL_BASE_DB) }));
  }
  const pairs = [teeth.main, ...teeth.speeds].filter((p) => p !== null);
  const shifted = pairs.filter((p) => {
    const small = p.teeth[0] <= p.teeth[1] ? 0 : 1;
    const helix = helixForCentre(d.centreMm, p.module, p.teeth[0], p.teeth[1], d.pressureAngle, p.shift[0] + p.shift[1]);
    return p.shift[small] > 0 && undercutLimit(p.teeth[small], Number.isFinite(helix) ? helix : 0, d.pressureAngle) > 0;
  });
  if (shifted.length) {
    add('undercut', 'note', t('Підрізання виправлено зміщенням профілю'), t('У пар {pairs} мала шестерня зрізана б біля основи зубця, тому інструмент відсунуто: зуб товщий біля кореня.', { pairs: shifted.map((p) => pair(p.teeth)).join(', ') }));
  }
  const shared = pairs.filter((p) => !p.coprime);
  if (shared.length) {
    add('hunting', 'note', t('Зубці пари мають спільний дільник'), t('У пар {pairs} той самий зубець зустрічає лише частину зубців партнера, тому вони зношуються нерівно.', { pairs: shared.map((p) => pair(p.teeth)).join(', ') }), t('Змінити кількість зубців на одиницю.'));
  }

  const order: Record<GearboxSeverity, number> = { fatal: 0, warning: 1, note: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
