// The engineering level of the car builder (whole-car plan, constraints and diagnoses): nothing is forbidden, only
// explained. A factory build of every donor has no fatal diagnosis (tests/car-build). Each diagnosis reads a figure of
// a section's model (evaluate.ts); the thresholds are ours and named below.

import { SUMP_NAMES } from '../designer/lubrication.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import type { CarPerformance } from './evaluate.ts';
import type { ResolveNote } from './resolve.ts';

export type Severity = 'fatal' | 'warning' | 'note';

export interface CarDiagnostic {
  id: string;
  severity: Severity;
  title: string;
  text: string;
  fix?: string;
}

/** Thresholds [ours]. */
export const CAR_LIMITS = {
  /** Peak torque over the donor engine's that its gearbox stops being "made for". */
  torqueRatio: 1.3,
  /** Driven wheels spinning at full throttle past this speed in the low gears, km/h, are worth a word. */
  spinKmh: 40,
  /** ... and past the donor's own by this much, a warning. */
  spinWorseKmh: 20,
  /** Body ride frequency off the donor's by this share. */
  rideShare: 0.1,
  /** Weight on the front axle moved by this many points. */
  frontShare: 0.04,
};

const n0 = (v: number): string => Math.round(v).toLocaleString(numberLocale);
const n1 = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const GEARBOX_ORDER = { solid: 0, rated: 1, short: 2, doomed: 3 } as const;
const ENGINE_ORDER = { solid: 0, sport: 1, race: 2, oneshot: 3, doomed: 4 } as const;

function noteText(n: ResolveNote): { title: string; text: string } {
  switch (n.id) {
    case 'donor':
      return { title: t('Такого авто немає'), text: t('В посиланні авто «{id}», якого немає серед донорів. Збірка починається з Civic Type R.', { id: n.asked }) };
    case 'engine':
      return { title: t('Такого двигуна немає'), text: t('Двигуна «{id}» немає в каталозі, тож в авто стоїть його власний.', { id: n.asked }) };
    case 'gearbox':
      return { title: t('Такої коробки немає'), text: t('Коробки «{id}» немає серед тих, що пасують цьому авто, тож стоїть його власна.', { id: n.asked }) };
    case 'gearbox-type':
      return n.donor === 'transaxle'
        ? { title: t('Коробку замінено'), text: t('Поздовжня коробка не стане біля поперечного двигуна чи на задній осі: стоїть власна коробка авто.') }
        : { title: t('Коробку замінено'), text: t('Двовальна коробка з головною передачею в картері не стане за поздовжнім двигуном спереду: стоїть власна коробка авто.') };
    case 'gearbox-axis':
      return n.donor === 'transverse'
        ? { title: t('Коробку замінено'), text: t('Коробка для поздовжнього двигуна не стане біля поперечного: стоїть власна коробка авто.') }
        : { title: t('Коробку замінено'), text: t('Коробка для поперечного двигуна не стане за поздовжнім: стоїть власна коробка авто.') };
    case 'suspension':
      return { title: t('Такої підвіски немає'), text: t('Підвіски «{id}» немає в каталозі, тож стоїть власна підвіска авто.', { id: n.asked }) };
    case 'tyre':
      return { title: t('Шини не прочитано'), text: t('Розмір шин у посиланні не прочитався, тож стоять шини авто.') };
    case 'lubrication-rotary':
      return { title: t('Картер не змінюється'), text: t('Модель картера охоплює лише поршневі двигуни, тож роторний лишається зі своїм мащенням.') };
  }
}

export function diagnoseBuild(p: CarPerformance): CarDiagnostic[] {
  const out: CarDiagnostic[] = [];
  const add = (id: string, severity: Severity, title: string, text: string, fix?: string): void => {
    out.push({ id, severity, title, text, fix });
  };

  for (const n of p.notes) {
    const { title, text } = noteText(n);
    add(`resolve-${n.id}`, 'note', title, text);
  }

  // The engine itself, as the engine designer judges it.
  const engineVerdict = p.engine.reliability.verdict;
  if (engineVerdict === 'doomed') {
    add('engine-doomed', 'fatal', t('Двигун не переживе першого повного газу'), t('Конструктор двигуна дає йому вирок «{verdict}»: {part}.', { verdict: p.engine.reliability.verdictName, part: p.engine.reliability.worst.name }), t('Виправте двигун у конструкторі двигуна.'));
  } else if (ENGINE_ORDER[engineVerdict] >= ENGINE_ORDER.oneshot) {
    add('engine-oneshot', 'warning', t('Двигун на хвилини повного газу'), t('Конструктор двигуна дає йому вирок «{verdict}»: {part}.', { verdict: p.engine.reliability.verdictName, part: p.engine.reliability.worst.name }));
  }

  // Does it fit the bay.
  const over = p.fit.overMm;
  const sides: Array<[number, (mm: string) => string]> = [
    [Math.max(over.front, over.rear), (mm) => t('Двигун на {mm} мм довший за моторний відсік уздовж авто.', { mm })],
    [Math.max(over.left, over.right), (mm) => t('Двигун на {mm} мм ширший за моторний відсік.', { mm })],
    [over.top, (mm) => t('Двигун на {mm} мм вищий за моторний відсік: він стирчить крізь капот.', { mm })],
    [over.bottom, (mm) => t('Двигун на {mm} мм опускається нижче моторного відсіку.', { mm })],
  ];
  const worst = sides.reduce((a, b) => (b[0] > a[0] ? b : a));
  if (worst[0] > 0) {
    add('fit', 'warning', t('Двигун не вміщується'), `${worst[1](n0(worst[0]))} ${t('Габарит без колекторів і навісного, тож насправді місця треба ще більше.')}`, t('Інше авто-донор або менший двигун.'));
  }
  if (p.fit.clearanceMm < 0) {
    add('clearance', 'warning', t('Піддон нижче за просвіт'), t('Найнижча точка двигуна на {mm} мм нижче за дорожній просвіт авто.', { mm: n0(-p.fit.clearanceMm) }), t('Сухий картер, у нього мілкий піддон.'));
  }

  // The gearbox behind it.
  const gr = p.gearboxReliability;
  if (gr.verdict === 'doomed') {
    add('gearbox-doomed', 'fatal', t('Коробка не витримає цього двигуна'), t('Конструктор коробки дає їй вирок «{verdict}»: {part}.', { verdict: gr.verdictName, part: gr.worst.name }), t('Міцніша коробка або двигун з меншим моментом.'));
  } else if (GEARBOX_ORDER[gr.verdict] > GEARBOX_ORDER[p.donorGearboxVerdict]) {
    add('gearbox-worse', 'warning', t('Коробці важче, ніж із заводським двигуном'), t('Конструктор коробки дає їй вирок «{verdict}»: {part}.', { verdict: gr.verdictName, part: gr.worst.name }));
  }
  const ratio = p.engine.peakNm / p.engine.donorPeakNm;
  if (p.gearboxKind === 'donor' && ratio > CAR_LIMITS.torqueRatio) {
    add('torque', 'warning', t('Момент вищий за той, під який зроблено коробку'), t('Момент двигуна {nm} Н·м у {k} раза вищий, ніж у заводського двигуна цього авто ({donor} Н·м).', { nm: n0(p.engine.peakNm), k: n1(ratio), donor: n0(p.engine.donorPeakNm) }));
  }
  if (p.gearbox.clutch.margin < 1) {
    add('clutch', 'warning', t('Зчеплення ковзатиме на повному газу'), t('Зчеплення тримає {cap} Н·м, а двигун дає {nm} Н·м.', { cap: n0(p.gearbox.clutch.staticNm), nm: n0(p.engine.peakNm) }), t('Більше зусилля притискання або більший диск у конструкторі коробки.'));
  }

  // Grip at the launch.
  const spin = p.spinKmh;
  if (spin > CAR_LIMITS.spinKmh) {
    const axle = p.car.drive === 'fwd' ? t('Передні колеса') : p.car.drive === 'rwd' ? t('Задні колеса') : t('Колеса');
    const donorSpin = p.donorSpinKmh;
    add('wheelspin', spin > donorSpin + CAR_LIMITS.spinWorseKmh ? 'warning' : 'note', t('Колеса буксують'), t('{axle} буксують на першій передачі на повному газу до {kmh} км/год.', { axle, kmh: n0(spin) }), t('Ширші або липкіші шини, довша перша передача.'));
  }

  // The body on its springs.
  if (p.chassis && p.donorChassis) {
    const names = [t('Передня'), t('Задня')];
    p.chassis.axles.forEach((a, k) => {
      const before = p.donorChassis!.axles[k]!.rideHz;
      if (Math.abs(a.rideHz / before - 1) > CAR_LIMITS.rideShare) {
        const title = a.rideHz < before ? t('Пружини підібрано під легше авто') : t('Пружини підібрано під важче авто');
        add(`ride-${k}`, 'note', title, t('{axle} частота кузова {hz} Гц замість {was} Гц.', { axle: names[k]!, hz: n1(a.rideHz), was: n1(before) }), t('Підберіть пружини в конструкторі підвіски.'));
      }
    });
  } else if (!p.chassis) {
    add('no-chassis', 'note', t('Немає моделі підвіски'), t('Для цієї підвіски ще немає моделі, тож гальмування й поворот не пораховано.'));
  }
  if (Math.abs(p.frontShare - p.donor.body.frontShare) > CAR_LIMITS.frontShare) {
    add('balance', 'note', t('Розподіл маси змінився'), t('На передню вісь припадає {now}% ваги замість {was}%.', { now: n0(p.frontShare * 100), was: n0(p.donor.body.frontShare * 100) }));
  }

  // Gearing.
  // An ideal box puts v_max at the engine's peak power: where that is the rev limit, the limiter is the best there is.
  if (p.vmaxAtLimiter && p.gearboxKind !== 'ideal') {
    add('limiter', 'note', t('Найвища передача впирається у відсічку'), t('На {kmh} км/год двигун доходить до межі обертів раніше, ніж опір повітря зупиняє розгін.', { kmh: n0(p.vmaxKmh) }), t('Довша головна передача.'));
  }
  if (p.donorLimitKmh !== null) {
    add('donor-limit', 'note', t('Обмежувач швидкості не перенесено'), t('Заводське авто обмежене на {kmh} км/год електронікою; збірка показує, скільки дає сам опір.', { kmh: n0(p.donorLimitKmh) }));
  }
  if (p.build.lubrication) {
    const sump = SUMP_NAMES[p.build.lubrication.sump];
    const where =
      p.fit.crankDropMm > 0
        ? t('У двигуні {sump}: піддон мілкіший, тож двигун сидить на {mm} мм нижче.', { sump, mm: n0(p.fit.crankDropMm) })
        : p.gearboxDesign.type === 'transaxle'
          ? t('У двигуні {sump}. Двигун не опускається: до нього прикручено коробку з головною передачею, а її півосі мають лишатися на рівні маточин.', { sump })
          : t('У двигуні {sump}.', { sump });
    const cg = p.cgShiftMm;
    const height = cg < 0 ? t('Центр мас опустився на {mm} мм.', { mm: n0(-cg) }) : cg > 0 ? t('Центр мас піднявся на {mm} мм.', { mm: n0(cg) }) : '';
    add('sump', 'note', t('Інший картер'), height ? `${where} ${height}` : where);
  }

  const order: Record<Severity, number> = { fatal: 0, warning: 1, note: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
