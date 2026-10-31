// Turns the numbers into plain explanations: what went wrong, why, and what would help.
// Nothing here blocks a design. An engine may be strange or doomed, it just gets told so.

import { balance, buildEngine } from '../engine/kinematics.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { isBoosted, isRotary, isTurbo, type Design } from './design.ts';
import { FUELS } from './fuels.ts';
import { COLD_IGNITION_K, type Performance } from './physics.ts';
import { designToSpec } from './to-spec.ts';

export type Severity = 'fatal' | 'warning' | 'note';

export interface Diagnostic {
  id: string;
  severity: Severity;
  title: string;
  text: string;
  fix?: string;
}

const round = (v: number, step = 100): string => (Math.round(v / step) * step).toLocaleString(numberLocale);

/** Residual shake figures after balance shafts. Same units as kinematics' balance report. */
export function designBalance(d: Design, perf: Performance): { force1: number; force2: number; couple1: number; couple2: number } {
  if (isRotary(d)) return { force1: 0, force2: 0, couple1: 0, couple2: 0 };
  const b = balance(buildEngine(designToSpec(d, perf)));
  const first = d.balanceShafts >= 1 ? 0 : 1;
  const second = d.balanceShafts >= 2 ? 0 : 1;
  return { force1: b.force1 * first, force2: b.force2 * second, couple1: b.couple1 * first, couple2: b.couple2 * second };
}

export function diagnose(d: Design, perf: Performance): Diagnostic[] {
  const out: Diagnostic[] = [];
  const add = (id: string, severity: Severity, title: string, text: string, fix?: string): void => {
    out.push({ id, severity, title, text, fix });
  };
  const fuel = FUELS[d.fuel];
  const rotary = isRotary(d);
  const worstKnock = perf.points.reduce((a, b) => (b.knockSeverity > a.knockSeverity ? b : a), perf.points[0]!);
  const mostRetard = perf.points.reduce((a, b) => (b.knockRetard > a.knockRetard ? b : a), perf.points[0]!);
  const hottest = perf.points.reduce((a, b) => (b.egtC > a.egtC ? b : a), perf.points[0]!);
  const highestPressure = perf.points.reduce((a, b) => (b.peakPressureBar > a.peakPressureBar ? b : a), perf.points[0]!);
  const atLimit = perf.points[perf.points.length - 1]!;

  if (fuel.diesel && perf.coldCompressionK < COLD_IGNITION_K) {
    add('no-ignition', 'fatal', t('Дизель не заведеться'), t('При стисненні {ratio} : 1 повітря нагрівається лише до {temp} °C, а цього замало, щоб паливо спалахнуло саме.', { ratio: d.compression, temp: Math.round(perf.coldCompressionK - 273) }), t('Підніми ступінь стиснення приблизно до 13–14 або вище.'));
  }
  if (perf.peakTorque.torqueNm <= 0) {
    add('no-torque', 'fatal', t('Двигун не може крутити сам себе'), t('Втрати на тертя й прокачування більші за роботу згоряння на всіх обертах, тому після стартера він зупиняється.'), t('Найчастіше допомагають більший об’єм, вище стиснення або менше обмежень на впуску й випуску.'));
  }
  if (!rotary && perf.failureRpm < d.rpmLimit) {
    add('rod-failure', 'fatal', t('Шатуни не витримають після {rpm} об/хв', { rpm: round(perf.failureRpm) }), t('На межі обертів сила інерції дає в шатуні близько {stress} МПа. Двигун зруйнується, якщо доведеш його туди.', { stress: Math.round(perf.rodStressMpa) }), t('Зменш хід або межу обертів, полегши поршень чи постав титанові шатуни.'));
  } else if (!rotary && perf.failureRpm < d.rpmLimit * 1.12) {
    add('rod-margin', 'warning', t('Запас міцності шатунів малий'), t('Руйнування очікується близько {rpm} об/хв, лише трохи вище межі обертів.', { rpm: round(perf.failureRpm) }), t('Менший хід або легший поршень дадуть більший запас.'));
  }
  if (rotary && perf.failureRpm < d.rpmLimit) {
    add('rotor-failure', 'fatal', t('Ротор не витримає після {rpm} об/хв', { rpm: round(perf.failureRpm) }), t('Ексцентрик і підшипники навантажуються відцентровою силою ротора.'), t('Зменш межу обертів або ексцентриситет.'));
  }
  if (!rotary && perf.valveClearance < 0) {
    add('valve-hit', 'fatal', t('Клапан б’є по поршню'), t('У перекритті фаз клапан заходить на {depth} мм туди, де вже стоїть поршень. Так двигун згинає клапани вже на першому оберті.', { depth: Math.abs(perf.valveClearance).toFixed(1) }), t('Зменш ступінь стиснення, підйом або тривалість фаз, або збільш кут між кулачками.'));
  } else if (!rotary && perf.valveClearance < 1.2) {
    add('valve-close', 'warning', t('Клапан майже торкається поршня'), t('Мінімальний зазор лише {gap} мм, а на нагрітому двигуні він ще менший.', { gap: perf.valveClearance.toFixed(1) }));
  }
  if (!rotary && perf.floatRpm < d.rpmLimit) {
    add('valve-float', 'warning', t('Клапани зависають після {rpm} об/хв', { rpm: round(perf.floatRpm) }), t('Пружина вже не встигає повертати клапан услід за кулачком, тому наповнення різко падає і крива на графіку обривається.'), t('Жорсткіша пружина, менший підйом або ширші фази допоможуть.'));
  }
  if (!rotary && atLimit.pistonSpeed > 28) {
    add('piston-speed', 'warning', t('Поршень рухається надто швидко: {speed} м/с', { speed: atLimit.pistonSpeed.toFixed(1) }), t('Середня швидкість понад 25 м/с — територія гоночних двигунів, а понад 28 м/с швидко зношує кільця й підшипники.'), t('Зменш хід або межу обертів.'));
  }
  if (worstKnock.knockSeverity > 1.1 || mostRetard.knockRetard >= 22) {
    add('knock', 'fatal', t('Сильна детонація близько {rpm} об/хв', { rpm: round(worstKnock.knockSeverity > 1.1 ? worstKnock.rpm : mostRetard.rpm) }), rotary ? t('Паливо вибухає до приходу фронту полум’я навіть із максимально пізнім запалюванням. Апексні ущільнення такого довго не витримають.') : t('Паливо вибухає до приходу фронту полум’я навіть із максимально пізнім запалюванням. Поршень і прокладка такого довго не витримають.'), t('Вищий октан, менше стиснення чи наддуву або кращий інтеркулер.'));
  } else if (mostRetard.knockRetard >= 8) {
    add('knock-limited', 'warning', t('Запалювання відкочено на {deg}° через детонацію', { deg: mostRetard.knockRetard }), t('Близько {rpm} об/хв блок керування запалює суміш пізніше, щоб не було детонації. Двигун уцілів, але віддає менше моменту і гріється сильніше.', { rpm: round(mostRetard.rpm) }), t('Вищий октан або менше стиснення повернуть цю втрату.'));
  }
  if (fuel.diesel && d.lambda < 1.25) {
    add('smoke', 'warning', t('Двигун сильно чадить'), t('При λ = {lambda} дизелю бракує повітря: паливо згоряє не повністю, а з труби йде чорний дим.', { lambda: d.lambda.toFixed(2) }), t('Дизелям потрібно λ не менше 1,25–1,3.'));
  }
  const pressureWarn = fuel.diesel ? 200 : 165;
  const pressureFatal = fuel.diesel ? 280 : 220;
  const pressureBar = { bar: Math.round(highestPressure.peakPressureBar) };
  const pressureTitle = rotary ? t('Тиск у камері {bar} бар', pressureBar) : t('Тиск у циліндрі {bar} бар', pressureBar);
  if (highestPressure.peakPressureBar > pressureFatal) {
    add('cylinder-pressure', 'fatal', pressureTitle, rotary ? t('Такого не витримають ні апексні ущільнення, ні корпус. Двигун зруйнується від першого ж повного газу.') : t('Такого не витримає ні прокладка головки, ні поршень. Двигун зруйнується від першого ж повного газу.'), t('Зменш наддув або ступінь стиснення.'));
  } else if (highestPressure.peakPressureBar > pressureWarn) {
    add('cylinder-pressure-high', 'warning', pressureTitle, rotary ? t('Це багато для такого двигуна: ротор, ущільнення й підшипники треба робити значно міцнішими.') : t('Це багато для такого двигуна: блок, шатуни й підшипники треба робити значно міцнішими.'));
  }
  if (!fuel.diesel && d.lambda > 1.25) {
    add('lean-misfire', 'warning', t('Суміш надто бідна'), t('Бензинова суміш при такому λ горить повільно й нерівно: можливі пропуски спалахів, а гази виходять дуже гарячими.'), t('Для найбільшої потужності тримай λ близько 0,88, для економії близько 1,05.'));
  }
  if (!fuel.diesel && d.lambda < 0.78) {
    add('too-rich', 'note', t('Суміш багатша, ніж потрібно'), t('Понад найкращу потужність паливо вже не додає моменту. Тепер воно просто летить у випуск і охолоджує циліндр.'));
  }
  if (hottest.egtC > 1020) {
    add('egt', 'warning', t('Вихлопні гази {temp} °C', { temp: Math.round(hottest.egtC) }), rotary ? t('Випускне вікно, турбіна й каталізатор такого довго не витримають.') : t('Випускні клапани, турбіна й каталізатор такого довго не витримають.'), t('Трохи багатша суміш або менший наддув знизять температуру.'));
  }
  if (isTurbo(d)) {
    // Only what the turbine itself adds: a choked pipe further along is a different problem.
    const overBoost = (p: (typeof perf.points)[number]): number => p.backpressureBar - p.pipeBackBar - p.boostBar;
    const worstBack = perf.points.reduce((a, b) => (overBoost(b) > overBoost(a) ? b : a), perf.points[0]!);
    if (overBoost(worstBack) > 0.8) {
      add('turbo-small', 'warning', t('Турбіна замала для такого двигуна'), t('На {rpm} об/хв тиск перед турбіною на {bar} бар вищий за наддув, і двигун уже душиться.', { rpm: round(worstBack.rpm), bar: overBoost(worstBack).toFixed(1) }), t('Більша турбіна підніме верхню потужність, але запізнюватиметься на низах.'));
    }
    const spooled = perf.points.find((p) => p.boostBar > d.boostBar * 0.85);
    if (!spooled) {
      add('turbo-big', 'warning', t('Турбіна не виходить на заданий наддув'), t('Вихлопних газів не вистачає, щоб розкрутити її до цільового тиску на жодних обертах.'), t('Менша турбіна розкрутиться раніше.'));
    } else if (spooled.rpm > d.rpmLimit * 0.62) {
      add('turbo-lag', 'note', t('Наддув з’являється лише після {rpm} об/хв', { rpm: round(spooled.rpm) }), t('Турбіна розрахована на більший потік, тому на низах двигун працює майже як атмосферний.'), t('Менша турбіна розкрутиться раніше, але на верхах давитиме сильніше.'));
    }
  }
  if (isBoosted(d) && d.intercooler < 0.3 && d.boostBar > 0.5) {
    add('no-intercooler', 'note', t('Інтеркулера майже немає'), t('Стиснене повітря гаряче й менш щільне, а ризик детонації вищий.'), t('Навіть простий інтеркулер дає помітний приріст.'));
  }
  // At the rev limit, not at peak power: peak power itself slides down the range as breathing gets worse.
  if (atLimit.machIndex > 0.72) {
    const breathing = t('Індекс Маха на впуску на межі обертів {mach}, а наповнення падає вже після 0,6. На високих обертах двигун просто задихається.', { mach: atLimit.machIndex.toFixed(2) });
    if (rotary) add('valve-choke', 'warning', t('Впускне вікно не встигає пропускати повітря'), breathing, t('Ширший патрубок, менший ексцентриситет або нижча межа обертів.'));
    else add('valve-choke', 'warning', t('Клапани не встигають пропускати повітря'), breathing, t('Більші клапани, більший підйом або більше клапанів на циліндр.'));
  }
  if (atLimit.runnerMach > 0.72) {
    add('runner-choke', 'warning', t('Впускний патрубок завузький'), t('Повітря в ньому рухається зі швидкістю {mach} Маха, і значна частина тиску йде на подолання опору.', { mach: atLimit.runnerMach.toFixed(2) }), t('Ширший патрубок прибере ці втрати.'));
  }
  // With a turbo the turbine's own pressure is judged above; here only what follows it counts.
  const exhaustLoss = (p: (typeof perf.points)[number]): number => (isTurbo(d) ? p.pipeBackBar : p.backpressureBar);
  const worstExhaust = perf.points.reduce((a, b) => (exhaustLoss(b) > exhaustLoss(a) ? b : a), perf.points[0]!);
  if (exhaustLoss(worstExhaust) > 0.35) {
    add('exhaust-choke', 'warning', t('Випуск душить двигун'), rotary ? t('Протитиск вихлопної системи сягає {bar} бар. Ротор витрачає потужність, щоб виштовхнути гази.', { bar: exhaustLoss(worstExhaust).toFixed(2) }) : t('Протитиск вихлопної системи сягає {bar} бар. Поршень витрачає потужність, щоб виштовхнути гази.', { bar: exhaustLoss(worstExhaust).toFixed(2) }), rotary ? t('Ширша труба або менш щільний глушник.') : t('Ширша труба, менш щільний глушник, більший випускний клапан або окрема труба на кожен ряд.'));
  }
  const ratio = d.rodLength / d.stroke;
  if (!rotary && ratio < 1.45) {
    add('short-rod', 'note', t('Шатун короткий відносно ходу'), t('Співвідношення {ratio}: шатун сильніше тисне поршень на стінку, а вібрації другого порядку зростають.', { ratio: ratio.toFixed(2) }));
  }
  if (!rotary) {
    const shake = designBalance(d, perf);
    const total = shake.force1 + shake.force2 + shake.couple1 * 0.6 + shake.couple2 * 0.5;
    if (total > 2.2) {
      add('shake', 'warning', t('Двигун сильно трусить'), t('Сили інерції поршнів майже не гасять одна одну. На кронштейнах такий двигун довго не проживе.'), t('Спробуй рівні спалахи, інший кут розвалу або балансирні вали.'));
    } else if (total < 0.05) {
      add('balanced', 'note', t('Двигун зрівноважений майже ідеально'), t('Сили й моменти першого та другого порядку взаємно гасяться.'));
    }
    const iv = perf.firingIntervals;
    if (iv.length > 1) {
      const low = Math.min(...iv);
      const high = Math.max(...iv);
      if (high - low > 60) {
        add('uneven', 'note', t('Спалахи нерівні'), t('Проміжки між спалахами від {low}° до {high}°. Це дає характерний ритм, але навантажує вал крутильними коливаннями.', { low: Math.round(low), high: Math.round(high) }));
      }
    }
    if (d.cylinders <= 2 && d.flywheelKg < 7) {
      add('light-flywheel', 'note', t('Маховик замалий для такої кількості циліндрів'), t('Між спалахами вал суттєво сповільнюється, тому на холостому двигун трусить або глохне.'), t('Важчий маховик згладжує оберти, але сповільнює їхній набір.'));
    }
    if (perf.events.overlap > 70) {
      add('overlap', 'note', t('Велике перекриття фаз'), t('Двигун дихає на високих обертах, а на низьких частина суміші йде прямо у випуск. Холостий хід нерівний і витрата більша.'));
    }
  }
  if (!perf.cruise.reachable) {
    add('weak', 'note', t('Цей двигун не витягує круїз'), t('Для їзди 100 км/год потрібно близько 30 кВт при 2500 об/хв, а він стільки там не дає.'));
  }
  const order: Record<Severity, number> = { fatal: 0, warning: 1, note: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
