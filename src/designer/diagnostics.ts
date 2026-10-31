// Turns the numbers into plain explanations: what went wrong, why, and what would help.
// Nothing here blocks a design. An engine may be strange or doomed, it just gets told so.

import { balance, buildEngine } from '../engine/kinematics.ts';
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

const round = (v: number, step = 100): string => (Math.round(v / step) * step).toLocaleString('uk-UA');

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
    add('no-ignition', 'fatal', 'Дизель не заведеться', `При стисненні ${d.compression} : 1 повітря нагрівається лише до ${Math.round(perf.coldCompressionK - 273)} °C, а цього замало, щоб паливо спалахнуло саме.`, 'Підніми ступінь стиснення приблизно до 13–14 або вище.');
  }
  if (perf.peakTorque.torqueNm <= 0) {
    add('no-torque', 'fatal', 'Двигун не може крутити сам себе', 'Втрати на тертя й прокачування більші за роботу згоряння на всіх обертах, тому після стартера він зупиняється.', 'Найчастіше допомагають більший об’єм, вище стиснення або менше обмежень на впуску й випуску.');
  }
  if (!rotary && perf.failureRpm < d.rpmLimit) {
    add('rod-failure', 'fatal', `Шатуни не витримають після ${round(perf.failureRpm)} об/хв`, `На межі обертів сила інерції дає в шатуні близько ${Math.round(perf.rodStressMpa)} МПа. Двигун зруйнується, якщо доведеш його туди.`, 'Зменш хід або межу обертів, полегши поршень чи постав титанові шатуни.');
  } else if (!rotary && perf.failureRpm < d.rpmLimit * 1.12) {
    add('rod-margin', 'warning', 'Запас міцності шатунів малий', `Руйнування очікується близько ${round(perf.failureRpm)} об/хв, лише трохи вище межі обертів.`, 'Менший хід або легший поршень дадуть більший запас.');
  }
  if (rotary && perf.failureRpm < d.rpmLimit) {
    add('rotor-failure', 'fatal', `Ротор не витримає після ${round(perf.failureRpm)} об/хв`, 'Ексцентрик і підшипники навантажуються відцентровою силою ротора.', 'Зменш межу обертів або ексцентриситет.');
  }
  if (!rotary && perf.valveClearance < 0) {
    add('valve-hit', 'fatal', 'Клапан б’є по поршню', `У перекритті фаз клапан заходить на ${Math.abs(perf.valveClearance).toFixed(1)} мм туди, де вже стоїть поршень. Так двигун згинає клапани вже на першому оберті.`, 'Зменш ступінь стиснення, підйом або тривалість фаз, або збільш кут між кулачками.');
  } else if (!rotary && perf.valveClearance < 1.2) {
    add('valve-close', 'warning', 'Клапан майже торкається поршня', `Мінімальний зазор лише ${perf.valveClearance.toFixed(1)} мм, а на нагрітому двигуні він ще менший.`);
  }
  if (!rotary && perf.floatRpm < d.rpmLimit) {
    add('valve-float', 'warning', `Клапани зависають після ${round(perf.floatRpm)} об/хв`, 'Пружина вже не встигає повертати клапан услід за кулачком, тому наповнення різко падає і крива на графіку обривається.', 'Жорсткіша пружина, менший підйом або ширші фази допоможуть.');
  }
  if (!rotary && atLimit.pistonSpeed > 28) {
    add('piston-speed', 'warning', `Поршень рухається надто швидко: ${atLimit.pistonSpeed.toFixed(1)} м/с`, 'Середня швидкість понад 25 м/с — територія гоночних двигунів, а понад 28 м/с швидко зношує кільця й підшипники.', 'Зменш хід або межу обертів.');
  }
  if (worstKnock.knockSeverity > 1.1 || mostRetard.knockRetard >= 22) {
    add('knock', 'fatal', `Сильна детонація близько ${round(worstKnock.knockSeverity > 1.1 ? worstKnock.rpm : mostRetard.rpm)} об/хв`, 'Паливо вибухає до приходу фронту полум’я навіть із максимально пізнім запалюванням. Поршень і прокладка такого довго не витримають.', 'Вищий октан, менше стиснення чи наддуву або кращий інтеркулер.');
  } else if (mostRetard.knockRetard >= 8) {
    add('knock-limited', 'warning', `Запалювання відкочено на ${mostRetard.knockRetard}° через детонацію`, `Близько ${round(mostRetard.rpm)} об/хв блок керування запалює суміш пізніше, щоб не було детонації. Двигун уцілів, але віддає менше момента і гріється сильніше.`, 'Вищий октан або менше стиснення повернуть цю втрату.');
  }
  if (fuel.diesel && d.lambda < 1.25) {
    add('smoke', 'warning', 'Двигун сильно чадить', `При λ = ${d.lambda.toFixed(2)} дизелю бракує повітря: паливо згоряє не повністю, а з труби йде чорний дим.`, 'Дизелям потрібно λ не менше 1,25–1,3.');
  }
  const pressureWarn = fuel.diesel ? 200 : 165;
  const pressureFatal = fuel.diesel ? 280 : 220;
  if (highestPressure.peakPressureBar > pressureFatal) {
    add('cylinder-pressure', 'fatal', `Тиск у циліндрі ${Math.round(highestPressure.peakPressureBar)} бар`, 'Такого не витримає ні прокладка головки, ні поршень. Двигун зруйнується від першого ж повного газу.', 'Зменш наддув або ступінь стиснення.');
  } else if (highestPressure.peakPressureBar > pressureWarn) {
    add('cylinder-pressure-high', 'warning', `Тиск у циліндрі ${Math.round(highestPressure.peakPressureBar)} бар`, 'Це багато для такого двигуна: блок, шатуни й підшипники треба робити значно міцнішими.');
  }
  if (!fuel.diesel && d.lambda > 1.25) {
    add('lean-misfire', 'warning', 'Суміш надто бідна', 'Бензинова суміш при такому λ горить повільно й нерівно: можливі пропуски спалахів, а гази виходять дуже гарячими.', 'Для найбільшої потужності тримай λ близько 0,88, для економії близько 1,05.');
  }
  if (!fuel.diesel && d.lambda < 0.78) {
    add('too-rich', 'note', 'Суміш багатша, ніж потрібно', 'Понад найкращу потужність паливо вже не додає момента. Тепер воно просто летить у випуск і охолоджує циліндр.');
  }
  if (hottest.egtC > 1020) {
    add('egt', 'warning', `Вихлопні гази ${Math.round(hottest.egtC)} °C`, 'Випускні клапани, турбіна й каталізатор такого довго не витримають.', 'Трохи багатша суміш або менший наддув знизять температуру.');
  }
  if (isTurbo(d)) {
    // Only what the turbine itself adds: a choked pipe further along is a different problem.
    const overBoost = (p: (typeof perf.points)[number]): number => p.backpressureBar - p.pipeBackBar - p.boostBar;
    const worstBack = perf.points.reduce((a, b) => (overBoost(b) > overBoost(a) ? b : a), perf.points[0]!);
    if (overBoost(worstBack) > 0.8) {
      add('turbo-small', 'warning', 'Турбіна замала для такого двигуна', `На ${round(worstBack.rpm)} об/хв тиск перед турбіною на ${overBoost(worstBack).toFixed(1)} бар вищий за наддув, і двигун уже душиться.`, 'Більша турбіна підніме верхню потужність, але запізнюватиметься на низах.');
    }
    const spooled = perf.points.find((p) => p.boostBar > d.boostBar * 0.85);
    if (!spooled) {
      add('turbo-big', 'warning', 'Турбіна не виходить на заданий наддув', 'Вихлопних газів не вистачає, щоб розкрутити її до цільового тиску на жодних обертах.', 'Менша турбіна розкрутиться раніше.');
    } else if (spooled.rpm > d.rpmLimit * 0.62) {
      add('turbo-lag', 'note', `Наддув з’являється лише після ${round(spooled.rpm)} об/хв`, 'Турбіна розрахована на більший потік, тому на низах двигун працює майже як атмосферний.', 'Менша турбіна розкрутиться раніше, але на верхах давитиме сильніше.');
    }
  }
  if (isBoosted(d) && d.intercooler < 0.3 && d.boostBar > 0.5) {
    add('no-intercooler', 'note', 'Інтеркулера майже немає', 'Стиснене повітря гаряче й менш щільне, а ризик детонації вищий.', 'Навіть простий інтеркулер дає помітний приріст.');
  }
  // At the rev limit, not at peak power: peak power itself slides down the range as breathing gets worse.
  if (atLimit.machIndex > 0.72) {
    add('valve-choke', 'warning', 'Клапани не встигають пропускати повітря', `Індекс Маха на впуску на межі обертів ${atLimit.machIndex.toFixed(2)}, а наповнення падає вже після 0,6. На високих обертах двигун просто задихається.`, 'Більші клапани, більший підйом або більше клапанів на циліндр.');
  }
  if (atLimit.runnerMach > 0.72) {
    add('runner-choke', 'warning', 'Впускний патрубок завузький', `Повітря в ньому рухається зі швидкістю ${atLimit.runnerMach.toFixed(2)} Маха, і значна частина тиску йде на подолання опору.`, 'Ширший патрубок прибере ці втрати.');
  }
  // With a turbo the turbine's own pressure is judged above; here only what follows it counts.
  const exhaustLoss = (p: (typeof perf.points)[number]): number => (isTurbo(d) ? p.pipeBackBar : p.backpressureBar);
  const worstExhaust = perf.points.reduce((a, b) => (exhaustLoss(b) > exhaustLoss(a) ? b : a), perf.points[0]!);
  if (exhaustLoss(worstExhaust) > 0.35) {
    add('exhaust-choke', 'warning', 'Випуск душить двигун', `Протитиск вихлопної системи сягає ${exhaustLoss(worstExhaust).toFixed(2)} бар. Поршень витрачає потужність, щоб виштовхнути гази.`, 'Ширша труба, менш щільний глушник, більший випускний клапан або окрема труба на кожен ряд.');
  }
  const ratio = d.rodLength / d.stroke;
  if (!rotary && ratio < 1.45) {
    add('short-rod', 'note', 'Шатун короткий відносно ходу', `Співвідношення ${ratio.toFixed(2)}: шатун сильніше тисне поршень на стінку, а вібрації другого порядку зростають.`);
  }
  if (!rotary) {
    const shake = designBalance(d, perf);
    const total = shake.force1 + shake.force2 + shake.couple1 * 0.6 + shake.couple2 * 0.5;
    if (total > 2.2) {
      add('shake', 'warning', 'Двигун сильно трусить', 'Сили інерції поршнів майже не гасять одна одну. На кронштейнах такий двигун довго не проживе.', 'Спробуй рівні спалахи, інший кут розвалу або балансирні вали.');
    } else if (total < 0.05) {
      add('balanced', 'note', 'Двигун зрівноважений майже ідеально', 'Сили й моменти першого та другого порядку взаємно гасяться.');
    }
    const iv = perf.firingIntervals;
    if (iv.length > 1) {
      const low = Math.min(...iv);
      const high = Math.max(...iv);
      if (high - low > 60) {
        add('uneven', 'note', 'Спалахи нерівні', `Проміжки між спалахами від ${Math.round(low)}° до ${Math.round(high)}°. Це дає характерний ритм, але навантажує вал крутильними коливаннями.`);
      }
    }
    if (d.cylinders <= 2 && d.flywheelKg < 7) {
      add('light-flywheel', 'note', 'Маховик замалий для такої кількості циліндрів', 'Між спалахами вал суттєво сповільнюється, тому на холостому двигун трусить або глохне.', 'Важчий маховик згладжує оберти, але сповільнює їхній набір.');
    }
    if (perf.events.overlap > 70) {
      add('overlap', 'note', 'Велике перекриття фаз', 'Двигун дихає на високих обертах, а на низьких частина суміші йде прямо у випуск. Холостий хід нерівний і витрата більша.');
    }
  }
  if (!perf.cruise.reachable) {
    add('weak', 'note', 'Цей двигун не витягує круїз', 'Для їзди 100 км/год потрібно близько 30 кВт при 2500 об/хв, а він стільки там не дає.');
  }
  const order: Record<Severity, number> = { fatal: 0, warning: 1, note: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
