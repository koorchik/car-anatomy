// The article's section on valve control: what this engine's phasers, cams, valves and resting cylinders do,
// with its own numbers. Only for engines that have any of them.

import { groupIntervals, type Engine } from '../engine/kinematics.ts';
import type { VariableValves } from '../engine/valve-control.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { intervalPattern } from './article.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Names of the valve gear fields that could not be confirmed, as a variant's `unverified` lists them. */
export const VALVETRAIN_FIELD_NAMES: Record<string, string> = {
  camPhaser: t('бік фазообертача'),
  phaseRange: t('діапазон фазообертача'),
  camSwitch: t('перемикання кулачків'),
  switchRpm: t('оберти перемикання'),
  lowCam: t('низький кулачок'),
  liftControl: t('керування підйомом'),
  deactivation: t('спосіб вимкнення циліндрів'),
};

/** Compression from the intake closing with the cam in the middle of its travel, as the designer counts it. */
function effectiveCompression(engine: Engine, vvt: VariableValves): number {
  const s = engine.spec;
  const middle = vvt.phaser === 'coupled' ? vvt.intakeRange / 2 : vvt.phaser === 'none' ? 0 : -vvt.intakeRange / 2;
  const ivc = engine.timing.intakeClose - 540 + middle;
  const g = ((180 - Math.min(180, Math.abs(ivc))) * Math.PI) / 180;
  const rod = s.rodRatio;
  const travel = 0.5 + rod - (0.5 * Math.cos(g) + Math.sqrt(rod * rod - (0.5 * Math.sin(g)) ** 2));
  return 1 + (s.compression - 1) * travel;
}

/** What rests: the cylinder numbers and the rhythm of those left. */
function restingText(engine: Engine, set: number[]): string {
  const left = engine.cylinders.map((c) => c.n).filter((n) => !set.includes(n));
  return t('{list}: решта спалахує через {interval}', { list: set.join(', '), interval: intervalPattern(groupIntervals(engine, left)) });
}

export function valvetrainFigures(engine: Engine): Array<[string, string]> {
  const v = engine.spec.vvt;
  if (!v) return [];
  const rows: Array<[string, string]> = [];
  if (v.phaser === 'coupled') rows.push([t('Фази'), t('весь вал пізніше до {deg}°', { deg: num(v.intakeRange) })]);
  else if (v.phaser === 'intake') rows.push([t('Фази'), t('впуск раніше до {deg}°', { deg: num(v.intakeRange) })]);
  else if (v.phaser === 'dual') rows.push([t('Фази'), t('впуск раніше до {intake}°, випуск пізніше до {exhaust}°', { intake: num(v.intakeRange), exhaust: num(v.exhaustRange) })]);
  if (v.switching) rows.push([t('Кулачки'), t('перемикання на {rpm} об/хв', { rpm: num(v.switching.rpm) })]);
  if (v.lift) rows.push([t('Підйом впуску'), v.lift.kind === 'continuous' ? t('плавний, без дроселя') : t('гідравлічний, MultiAir')]);
  if (v.deactivation) rows.push([t('Вимкнення'), v.deactivation.sets.map((set) => restingText(engine, set)).join('; ')]);
  return rows;
}

export function valvetrainArticleHtml(engine: Engine): string {
  const v = engine.spec.vvt;
  if (!v) return '';
  const parts: string[] = [`<h3>${t('Керування клапанами')}</h3>`];
  const p = (text: string): void => {
    parts.push(`<p>${text}</p>`);
  };
  const hints: string[] = [];

  if (v.phaser !== 'none') {
    const range =
      v.phaser === 'coupled'
        ? t('Тут обидва кулачки на одному валу, і фазообертач повертає його весь, до {deg}°: перекриття не змінюється, змінюється момент закриття впуску.', { deg: num(v.intakeRange) })
        : v.phaser === 'dual'
          ? t('У цього двигуна впуск рухається раніше до {intake}°, а випуск пізніше до {exhaust}°.', { intake: num(v.intakeRange), exhaust: num(v.exhaustRange) })
          : t('У цього двигуна впуск рухається раніше до {intake}°, випуск стоїть.', { intake: num(v.intakeRange) });
    p(
      t('Кулачок відкриває клапан на однаковий кут щоразу, а найкращий момент залежить від обертів. На низах впуск варто закрити раніше, щоб поршень не виштовхнув свіжий заряд назад. На верхах пізніше, бо повітря за інерцією ще йде в циліндр. Фазообертач — це лопатевий ротор усередині зірочки: тиск оливи з двох боків лопатей повертає вал відносно зірочки на ходу.') +
        ' ' +
        range +
        ' ' +
        (v.phaser === 'coupled'
          ? t('На холостому ходу й малому навантаженні вал стоїть у вихідному положенні, найраніше, і двигун працює рівно. На середньому навантаженні блок керування повертає весь вал пізніше: випуск закривається вже на такті впуску, і поршень втягує частину газів назад. Дросель відкривається ширше, і втрат на прокачування менше.')
          : t('На холостому ходу й малому навантаженні вали стоять у вихідному положенні з найменшим перекриттям, і двигун працює рівно. На середньому навантаженні блок керування збільшує перекриття: частина газів лишається в циліндрі, дросель відкривається ширше, і втрат на прокачування менше.')),
    );
    hints.push(t('мітка на роторі фазообертача відходить від мітки на зірочці'));
  }

  if (v.switching) {
    const kind =
      v.switching.kind === 'pin'
        ? t('Тиск оливи заганяє штифт у середнє коромисло, і клапани йдуть за третім, високим кулачком.')
        : t('Кулачковий блок зсувається вздовж вала, і під штовхачем опиняється інший профіль.');
    p(
      t('На валу два профілі. Низький дає рівний холостий хід і економію, високий наповнює циліндр на верхах. Блок керування перемикає їх на {rpm} об/хв під навантаженням, близько до того, де криві моменту двох кулачків перетинаються.', { rpm: num(v.switching.rpm) }) +
        ' ' +
        kind +
        ' ' +
        (v.switching.cams === 'intake'
          ? t('Після перемикання в циліндр потрапляє більше заряду, тому звук стає голоснішим. Toyota на 2ZZ-GE перемикає впуск із кулачка 228° і 7,6 мм на 292° і 11,2 мм.')
          : t('Після перемикання випуск відкривається раніше, коли тиск у циліндрі ще вищий, тому звук стає голоснішим і жорсткішим. Toyota на 2ZZ-GE перемикає впуск із кулачка 228° і 7,6 мм на 292° і 11,2 мм.')),
    );
    hints.push(v.switching.kind === 'pin' ? t('після {rpm} об/хв штифт в’їжджає в середнє коромисло', { rpm: num(v.switching.rpm) }) : t('після {rpm} об/хв кулачкові блоки зсуваються', { rpm: num(v.switching.rpm) }));
  }

  if (v.lift?.kind === 'continuous') {
    p(
      t('Дросельна заслінка створює розрідження, і поршень на кожному такті впуску тягне проти нього. Плавна зміна підйому, як Valvetronic у BMW чи VVEL у Nissan, замість цього менше відкриває впускні клапани: ексцентриковий вал через проміжний важіль передає клапану лише частину ходу кулачка, від частки міліметра до {lift} мм. Повітря стільки ж, а розрідження майже немає. BMW заявляє близько 10% економії.', { lift: num(v.lift.maxLift, 1) }),
    );
    hints.push(t('ексцентриковий вал повертається з педаллю, і впускні клапани відкриваються більше'));
  } else if (v.lift?.kind === 'multiair') {
    p(
      t('Кулачок тут не відкриває клапан сам, а качає оливу в камеру над ним. Електромагніт вирішує, коли цю оливу скинути. Повний газ: клапан іде за кулачком. Часткове навантаження: клапан закривається раніше, ніж закінчився кулачок, і навантаження задає момент закриття, а не дросель. Холостий хід і малі оберти: клапан відкривається пізно і лише трохи, тож перекриття немає. Fiat обіцяв до 10% потужності, до 15% моменту на низах і до 10% економії.'),
    );
    hints.push(t('на холостому ходу впускні клапани ледь відкриваються, а на повному газу йдуть на весь хід'));
  }

  const eff = effectiveCompression(engine, v);
  if (eff < 0.8 * engine.spec.compression) {
    p(
      t('Якщо впускний клапан закривається пізно, поршень встигає виштовхнути частину заряду назад, і стискається менший об’єм, а розширюється повний. У цього двигуна стиснення близько {eff} : 1 при розширенні {geo} : 1. Менше стиснення означає менший ризик детонації, а більше розширення вищий ККД. Тому Toyota в гібридах і Mazda у Skyactiv-G ставлять 13–14 : 1 на звичайний бензин. Цикл Міллера робить те саме раннім закриттям, як Volkswagen 1.5 TSI evo на 12,5 : 1.', { eff: num(eff, 1), geo: num(engine.spec.compression, 1) }),
    );
  }

  if (v.deactivation) {
    const how =
      v.deactivation.kind === 'valves'
        ? t('Спеціальні штовхачі складаються, і клапани стоять закриті. Газ у циліндрі працює як пружина й майже не забирає енергії.')
        : t('Тут вимикається лише упорскування, а клапани продовжують прокачувати повітря.') + (v.deactivation.sets.length > 1 ? ' ' + t('Porsche кожні 20 секунд міняє ряди, щоб обидва каталізатори гріліся рівно.') : '');
    const range = { min: num(v.deactivation.rpmMin), max: num(v.deactivation.rpmMax) };
    p(
      t('На малому навантаженні частина циліндрів відпочиває: {sets}.', { sets: v.deactivation.sets.map((set) => restingText(engine, set)).join('; ') }) +
        ' ' +
        how +
        ' ' +
        (v.deactivation.documented ? t('Тут це вікно {min}–{max} об/хв.', range) : t('Тут це вікно {min}–{max} об/хв, але це оцінка: даних виробника для цього двигуна не звірено.', range)) +
        ' ' +
        t('Решта працює з ширшим дроселем і меншими втратами на прокачування. Вимикають кожен другий за порядком запалювання, тому залишок спалахує рівно, але в кожному ряду ритм інший, і звук стає рідшим. Усі циліндри вмикаються одразу, щойно потрібна сила. GM вимикає 1, 7, 6 і 4 й заявляє 5,5–7,5% економії в циклі EPA, Volkswagen на 1.4 TSI ACT вимикає 2 і 3 між 1400 і 4000 об/хв.'),
    );
    hints.push(t('тримай педаль трохи натиснутою: за півтори секунди частина циліндрів стане сірою, а звук рідшим'));
  }

  if (hints.length) p(t('Що спробувати: увімкни вигляд «Механізм», швидкість «Наочно» і запусти двигун: {hints}.', { hints: hints.join('; ') }));
  return parts.join('');
}
