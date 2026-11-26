// Demonstration 1 of the gearboxes plan, why the gears always turn: a few steps, one idea each, on the box as
// it is set now. The engine idles; every number comes from the teeth of the box shown, so a box changed on the panel
// tells its own figures.

import type { Gearbox } from '../../drivetrain/topology.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';

export interface DemoStep {
  /** The state of the shift matrix the step selects: 'N', '1', 'R'… */
  gear: string;
  title: string;
  text: string;
  /** A gear the camera turns to, by its id in the spec. */
  focus?: string;
}

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function alwaysTurningSteps(box: Gearbox, idleRpm: number): DemoStep[] {
  const teeth = (id: string): number => box.spec.gears.find((g) => g.id === id)?.teeth ?? NaN;
  const zIn = teeth('input-main');
  const zCm = teeth('counter-main');
  const z1c = teeth('counter-1');
  const z1 = teeth('main-1');
  const first = box.states.find((s) => s.name === '1');
  const direct = box.states.find((s) => s.kind === 'gear' && s.meshLoads?.every((m) => m.power === 0));
  const reverse = box.states.find((s) => s.name === 'R');
  const idle = num(idleRpm);
  const steps: DemoStep[] = [
    {
      gear: 'N',
      title: t('Нейтраль'),
      text: t('Двигун крутить первинний вал, а той через головну пару {zIn} → {zCm} — проміжний вал і всі шестерні передач на вторинному валу. Сам вторинний вал стоїть: шестерні в зачепленні постійно, вони просто вільно крутяться на ньому.', { zIn, zCm }),
    },
    {
      gear: 'N',
      title: t('Шестерня першої передачі'),
      text: t('{z} зубців, {rpm} об/хв на холостих {idle} об/хв, а вал під нею стоїть: {idle} · {zIn}/{zCm} · {z1c}/{z} = {rpm}.', { z: z1, rpm: num((idleRpm * zIn * z1c) / (zCm * z1)), idle, zIn, zCm, z1c }),
      focus: 'main-1',
    },
  ];
  if (first?.ratio) {
    steps.push({
      gear: '1',
      title: t('Перша'),
      text: t('Муфта їде до шестерні першої, її шліци насуваються на вінець шестерні й з’єднують її з валом, і вал рушає. Світяться головна пара й пара першої: {zCm}/{zIn} · {z}/{z1c} = {ratio}. Двигун робить {ratio} оберту на один оберт вала, на холостих вал крутиться з {rpm} об/хв.', {
        zCm, zIn, z: z1, z1c, ratio: num(first.ratio, 3), rpm: num(idleRpm / first.ratio),
      }),
    });
  }
  if (direct) {
    steps.push({
      gear: direct.name,
      title: t('{n}-а, пряма', { n: direct.name }),
      text: t('Муфта з’єднує первинний вал із вторинним, і жодне зачеплення не світиться. Момент іде крізь муфту, без зубців, тому пряма передача найтихіша й втрачає найменше. Проміжний вал і шестерні крутяться далі вхолосту.'),
    });
  }
  if (reverse?.ratio) {
    const zRc = teeth('counter-R');
    const zIdler = teeth('idler-R');
    const zR = teeth('main-R');
    steps.push({
      gear: 'R',
      title: t('Задній хід'),
      text: t('Проміжна шестерня на {zIdler} зубців стоїть між шестернями проміжного й вторинного валів і розвертає напрям, тож світяться три зачеплення: {zCm}/{zIn} · {zR}/{zRc} = {ratio}. Вал крутиться назад, на холостих з {rpm} об/хв.', {
        zIdler, zCm, zIn, zR, zRc, ratio: num(Math.abs(reverse.ratio), 3), rpm: num(idleRpm / Math.abs(reverse.ratio)),
      }),
      focus: 'idler-R',
    });
  }
  return steps;
}
