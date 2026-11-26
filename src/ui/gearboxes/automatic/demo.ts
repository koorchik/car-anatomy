// Demonstration 8 of the gearboxes plan, the 8HP's matrix: five elements, three closed make a gear, one element
// changes per shift (8 → 2 too), two make a neutral, A+C+E holds the input while the output rolls, four jam the box.
// Every number comes from the teeth of the box shown.

import { analyseState, type Gearbox } from '../../../drivetrain/topology.ts';
import { numberLocale } from '../../../i18n/locale.ts';
import { t } from '../../../i18n/t.ts';

export interface MatrixStep {
  /** Elements the step closes. */
  closed: string[];
  title: string;
  text: string;
}

const num = (v: number, digits = 3): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** What one shift changes: the element let go and the one closed. */
export function shiftChange(box: Gearbox, from: string, to: string): { off: string[]; on: string[] } {
  const a = box.spec.states.find((s) => s.name === from)?.closed ?? [];
  const b = box.spec.states.find((s) => s.name === to)?.closed ?? [];
  return { off: a.filter((e) => !b.includes(e)), on: b.filter((e) => !a.includes(e)) };
}

export function matrixSteps(box: Gearbox): MatrixStep[] {
  const gear = (name: string) => box.states.find((s) => s.name === name)!;
  const ratio = (name: string) => num(Math.abs(gear(name).ratio!));
  const join = (ids: string[]) => ids.join(' + ');
  const steps: MatrixStep[] = [
    {
      closed: gear('1').closed,
      title: t('Три з п’яти'),
      text: t('Чотири ряди, з’єднані між собою, мають чотири ступені свободи. Кожен замкнений елемент забирає один, тож три лишають рівно один рух: це передача. Перша — {closed}, число {ratio}. На номограмі швидкість кожного ряду лежить на прямій, а вихід стоїть на висоті 1/{ratio}.', { closed: join(gear('1').closed), ratio: ratio('1') }),
    },
  ];
  const one = shiftChange(box, '1', '2');
  steps.push({
    closed: gear('2').closed,
    title: t('Друга: один елемент'),
    text: t('{off} відпускає, {on} замикає, решта лишаються. Так влаштоване кожне послідовне перемикання 8HP: момент переходить з однієї муфти на другу без розриву. Число {ratio}.', { off: join(one.off), on: join(one.on), ratio: ratio('2') }),
  });
  steps.push({
    closed: gear('6').closed,
    title: t('Шоста: усе як одне ціле'),
    text: t('{closed}: усі прямі номограми лежать на висоті входу, і весь механізм крутиться як одна деталь. Число 1, жодне зачеплення не котиться, тому втрат у зачепленнях немає.', { closed: join(gear('6').closed) }),
  });
  steps.push({
    closed: gear('8').closed,
    title: t('Восьма: вихід швидший за вхід'),
    text: t('{closed}: вихід стоїть на номограмі вище за вхід, число {ratio}. На трасі двигун крутиться повільніше за карданний вал.', { closed: join(gear('8').closed), ratio: ratio('8') }),
  });
  const skip = shiftChange(box, '8', '2');
  steps.push({
    closed: gear('2').closed,
    title: t('З восьмої на другу'),
    text: t('Навіть цей стрибок на шість передач вниз міняє лише один елемент: {off} відпускає, {on} замикає. Тому автомат може скинути кілька передач одним перемиканням, коли водій тисне газ до підлоги.', { off: join(skip.off), on: join(skip.on) }),
  });
  steps.push({
    closed: gear('R').closed,
    title: t('Задній хід'),
    text: t('{closed}: вихід опускається нижче нуля й крутиться назад, число −{ratio}.', { closed: join(gear('R').closed), ratio: ratio('R') }),
  });
  const pair = ['A', 'B'];
  steps.push({
    closed: pair,
    title: t('Два елементи: нейтраль'),
    text: t('{closed} лишають два ступені свободи. Вихід ні до чого не прив’язаний: на номограмі прямі вільно хитаються, а на столі вихід просто стоїть, поки вхід крутиться.', { closed: join(pair) }),
  });
  const ace = ['A', 'C', 'E'];
  if (analyseState(box, ace).kind === 'input-locked') {
    steps.push({
      closed: ace,
      title: t('A + C + E: десята трійка'),
      text: t('Ця трійка теж лишає один рух, але не передачу: вхід тримається на картері, а вихід вільно крутиться. Тобто двигун заблоковано, а авто котиться. Тому в матриці її немає.'),
    });
  }
  const four = ['A', 'B', 'C', 'D'];
  steps.push({
    closed: four,
    title: t('Чотири: заклинило'),
    text: t('{closed}: рухів не лишилося, стоять і вхід, і вихід. Справжній блок керування ніколи не замикає чотири елементи разом.', { closed: join(four) }),
  });
  return steps;
}
