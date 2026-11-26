// Demonstrations 2 and 3 of the gearboxes plan, in the car (stage K3b): pulling away, and shifting and revs. Each
// step is one idea and drives the car itself, as a driver would: the pedals, the lever and the helpers, step by step
// against what the car does (the shown snapshot), and then says what came of it in the model's own numbers. The
// figures in the text come from the box and the engine on the page (demonstration 3 on the E30: at 6750 rpm a 1→2
// drops the engine to 6750·2.404/3.717 ≈ 4366 rpm). No DOM: the section shows the words and lends the controls.

import type { CarDrive } from '../../drivetrain/car-model.ts';
import type { ShiftPhase } from '../../drivetrain/control/manual.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { DriveSettings } from './drive-panel.ts';

export const CAR_DEMO_IDS = ['pull-away', 'shifting'] as const;
export type CarDemoId = (typeof CAR_DEMO_IDS)[number];

/** What a step's driver sees each frame. */
export interface DemoView {
  rpm: number;
  /** Road speed, m/s, forward positive. */
  speed: number;
  /** The gear that holds, the shift's phase and the body's acceleration, m/s². */
  gear: string;
  shift: ShiftPhase;
  accel: number;
  running: boolean;
  /** The clutch's heat since the last standstill and in all, J, and the plate's temperature, °C. */
  launchJ: number;
  clutchJ: number;
  clutchC: number;
  /** A driven wheel's slip: positive spins (wheel-road.ts, wheelSlip). */
  slip: number;
}

/** What a step's driver may do. */
export interface DemoControls {
  gas(value: number): void;
  /** The driver's clutch pedal, 0 up … 1 floored. */
  clutch(value: number): void;
  gear(name: string): void;
  brake(value: number): void;
  settings(patch: Partial<DriveSettings>): void;
  /** Starts the engine if it stands (the clutch is down by then). */
  start(): void;
}

export interface CarDemoStep {
  title: string;
  text: string;
  /** Called every frame from the step's start: true once the step has done its part. */
  frame(view: DemoView, controls: DemoControls, dt: number): boolean;
  /** What came of it, once done (and as it goes), in numbers. */
  result(): string;
}

export interface CarDemo {
  id: CarDemoId;
  title: string;
  steps: CarDemoStep[];
}

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Demonstration 3's upshift speed: the S14's power peak, 6750 rpm (the gearboxes plan's numbers for the E30). */
export const SHIFT_DEMO_RPM = 6750;

/** How deep the acceleration fell below where it was, m/s², from the lowest change (negative for a dip). */
const dip = (change: number): number => Math.max(0, -change);

/** Engine speed right after an upshift at `rpm` from a gear of ratio `from` into one of `to`: the classic drop. */
export const shiftDrop = (rpm: number, from: number, to: number): number => (rpm * to) / from;

/**
 * A driver's script as phases: each runs every frame until it returns true, then the next one starts. The time in the
 * phase, s, is passed along.
 */
type Phase = (view: DemoView, c: DemoControls, t: number, dt: number) => boolean;

function scripted(phases: Phase[]): (view: DemoView, c: DemoControls, dt: number) => boolean {
  let at = 0;
  let time = 0;
  return (view, c, dt) => {
    while (at < phases.length) {
      if (!phases[at]!(view, c, time, dt)) {
        time += dt;
        return false;
      }
      at++;
      time = 0;
    }
    return true;
  };
}

/** Phases that bring the car to rest in neutral with the engine running and the clutch down, on the level or a grade. */
function standStill(patch: Partial<DriveSettings>): Phase[] {
  return [
    (_v, c) => {
      c.settings({ revMatch: false, ...patch });
      c.gas(0);
      c.clutch(1);
      c.brake(0.7);
      c.gear('N');
      return true;
    },
    (v, c, time) => {
      if (!v.running) c.start();
      return v.running && Math.abs(v.speed) < 0.05 && v.rpm > 600 && time > 0.6;
    },
  ];
}

/** Waits `s` seconds. */
const wait = (s: number): Phase => (_v, _c, time) => time >= s;

/**
 * The driver's foot on the gas holding the engine near `rpm`, never past `most`: the pedal asks for torque, so a fixed
 * pedal with the clutch down would run the engine to its limiter.
 */
const gasFor = (v: DemoView, c: DemoControls, rpm: number, most: number): void => c.gas(Math.min(most, Math.max(0, (rpm - v.rpm) / 1500)));

/** The pedal where the clutch starts to bite and where it holds fully (pedalClamp in elements.ts: 0.75 and 0.35). */
const BITE: readonly [number, number] = [0.72, 0.4];

/**
 * A careful foot: the pedal comes up to the bite at once, through the bite over `s` seconds, then the rest of the way
 * in a quarter second.
 */
export function bitePedal(time: number, s: number): number {
  if (time < 0.2) return 1 - ((1 - BITE[0]) * time) / 0.2;
  if (time < 0.2 + s) return BITE[0] - ((BITE[0] - BITE[1]) * (time - 0.2)) / s;
  return Math.max(0, BITE[1] * (1 - (time - 0.2 - s) / 0.25));
}

/** The slip a quick driver allows the driven tyres under power, and how fast the foot moves, 1/s [estimates]. */
const SLIP_LIMIT = 0.08;
const FOOT_UP = 1.5;
const FOOT_DOWN = 6;

/**
 * A foot that floors the gas as far as the tyres take it: up while the driven wheels grip, back while they spin, as
 * a quick driver's foot or a traction control does. Without it a floored E30 in first spins its tyres to the limiter.
 */
function gripFoot(): (v: DemoView, c: DemoControls, dt: number) => void {
  let gas = 0.4;
  return (v, c, dt) => {
    gas = Math.min(1, Math.max(0.15, gas + (v.slip > SLIP_LIMIT ? -FOOT_DOWN : FOOT_UP) * dt));
    c.gas(gas);
  };
}

/** Pulling away: the clutch let up slowly, dropped with no gas, fed with a lot of gas, and a 15 % hill both ways. */
export function pullAwayDemo(): CarDemo {
  const slow = { minRpm: Number.POSITIVE_INFINITY, kj: 0 };
  const drop = { time: 0, stalled: false, at: 0 };
  const lots = { kj: 0, c: 0 };
  const back = { kmh: 0 };
  const up = { kmh: 0, kj: 0 };
  return {
    id: 'pull-away',
    title: t('Рушаємо'),
    steps: [
      {
        title: t('Зчеплення відпускаємо повільно'),
        text: t('Автозчеплення вимкнено: педаль тепер у водія. Трохи газу, близько 2000 об/хв, і педаль повільно, за дві з половиною секунди, проходить місце, де диск починає тримати. Диск ковзає, оберти просідають, авто повзе, а лічильник енергії зчеплення в панелі «Дорога й графіки» росте.'),
        frame: scripted([
          ...standStill({ autoClutch: false, gradePct: 0 }),
          (_v, c) => (c.gear('1'), c.brake(0), true),
          (v, c, time) => (gasFor(v, c, 2000, 0.7), time >= 0.8),
          (v, c, time) => {
            gasFor(v, c, 2000, 0.7);
            c.clutch(bitePedal(time, 2.5));
            if (time > 0.4) slow.minRpm = Math.min(slow.minRpm, v.rpm);
            slow.kj = v.launchJ / 1000;
            return time >= 3.5;
          },
        ]),
        result: () =>
          Number.isFinite(slow.minRpm) ? t('Оберти просіли до {rpm} об/хв, у диск пішло {kj} кДж.', { rpm: num(slow.minRpm), kj: num(slow.kj, 1) }) : '',
      },
      {
        title: t('Різко й без газу'),
        text: t('Та сама перша передача, але педаль кинуто одразу і без газу. Зчеплення замикається миттєво, двигун мусить одразу зрушити авто вагою понад тонну — і глухне.'),
        frame: scripted([
          ...standStill({ autoClutch: false, gradePct: 0 }),
          (_v, c) => (c.gear('1'), c.brake(0), true),
          wait(0.6),
          (_v, c) => (c.clutch(0), true),
          (v, _c, time) => {
            if (!v.running && !drop.stalled) {
              drop.stalled = true;
              drop.time = time;
            }
            return drop.stalled ? time >= drop.time + 1 : time >= 3;
          },
        ]),
        result: () => (drop.stalled ? t('Двигун заглух за {s} с після того, як зчеплення замкнулося.', { s: num(drop.time, 1) }) : ''),
      },
      {
        title: t('Багато газу'),
        text: t('Тепер 4500 об/хв і газ майже до підлоги, а педаль іде вгору за секунду. Двигун тримає високі оберти, диск довго ковзає, і вся різниця швидкостей іде в тепло: кілоджоулі в диск і градуси на ньому.'),
        frame: scripted([
          ...standStill({ autoClutch: false, gradePct: 0 }),
          (_v, c) => (c.gear('1'), c.brake(0), true),
          (v, c, time) => (gasFor(v, c, 4500, 1), time >= 1),
          (_v, c, time) => {
            c.gas(0.9);
            c.clutch(Math.max(0, 1 - time / 1));
            return time >= 1;
          },
          (v, c, time) => {
            lots.kj = v.launchJ / 1000;
            lots.c = v.clutchC;
            if (time > 1.5) c.gas(0);
            return time >= 1.6;
          },
        ]),
        result: () => (lots.kj > 0 ? t('{kj} кДж у диск, диск нагрівся до {c} °C.', { kj: num(lots.kj, 1), c: num(lots.c) }) : ''),
      },
      {
        title: t('Підйом 15 %, без газу'),
        text: t('Ухил 15 %: на кожні 100 м уперед дорога піднімається на 15 м. Зчеплення вичавлене, гальмо відпускаємо — і без газу авто котиться назад.'),
        frame: scripted([
          ...standStill({ autoClutch: false, gradePct: 15 }),
          (_v, c) => (c.gear('1'), true),
          wait(0.6),
          (_v, c) => (c.brake(0), true),
          (v, _c, time) => {
            back.kmh = Math.min(back.kmh, v.speed * 3.6);
            return time >= 2;
          },
          (_v, c) => (c.brake(0.8), true),
        ]),
        result: () => (back.kmh < -0.5 ? t('За дві секунди авто покотилося назад до {kmh} км/год.', { kmh: num(-back.kmh, 1) }) : ''),
      },
      {
        title: t('Підйом 15 %, з газом'),
        text: t('Той самий підйом. Газ, зчеплення потроху вгору, і гальмо відпускаємо, коли диск уже тримає: авто їде вгору, а не назад. Диск ковзає довше, ніж на рівному, бо тримає ще й вагу авто на схилі.'),
        frame: scripted([
          ...standStill({ autoClutch: false, gradePct: 15 }),
          (_v, c) => (c.gear('1'), true),
          (v, c, time) => (gasFor(v, c, 2500, 0.7), time >= 0.8),
          (v, c, time) => {
            gasFor(v, c, 2500, 0.7);
            c.clutch(Math.max(0, 1 - time / 1.8));
            if (time > 0.7) c.brake(0);
            return time >= 1.8;
          },
          (v, c, time) => {
            gasFor(v, c, 3500, 0.7);
            up.kmh = v.speed * 3.6;
            up.kj = v.launchJ / 1000;
            return time >= 2.5;
          },
          (_v, c) => (c.gas(0), c.clutch(1), c.brake(0.8), true),
        ]),
        result: () => (up.kmh > 0.5 ? t('Авто їде вгору {kmh} км/год, у диск пішло {kj} кДж.', { kmh: num(up.kmh, 1), kj: num(up.kj, 1) }) : ''),
      },
    ],
  };
}

/** Shifting and revs: 1→2 at the power peak, then a downshift without and with rev matching. */
export function shiftingDemo(cd: CarDrive): CarDemo {
  // The ratios as the text prints them, to three places, so the sum the visitor reads is the sum the text works out:
  // the E30's teeth give 3.71739 and 2.40373, whose own quotient would print 4365 under «6 750 · 2,404/3,717».
  const ratio = (name: string): number => Math.round((cd.gears.find((g) => g.name === name)?.ratio ?? Number.NaN) * 1000) / 1000;
  const r1 = ratio('1');
  const r2 = ratio('2');
  const r3 = ratio('3');
  const rpm = Math.min(SHIFT_DEMO_RPM, cd.map.limitRpm - 100);
  const drop = shiftDrop(rpm, r1, r2);
  const up = { before: 0, after: 0 };
  const foot = gripFoot();
  const downshift = (revMatch: boolean, out: { accel: number; kj: number; peak: number }): CarDemoStep['frame'] => {
    const foot = gripFoot();
    let j0 = 0;
    let a0 = 0;
    return scripted([
      ...standStill({ autoClutch: true, gradePct: 0, revMatch }),
      (_v, c) => (c.brake(0), c.clutch(0), c.gear('1'), true),
      wait(0.5),
      (v, c, _t, dt) => (foot(v, c, dt), v.rpm > 4500 ? (c.gear('2'), true) : false),
      (v, c, _t, dt) => (foot(v, c, dt), v.gear === '2' && v.shift === 'engaged'),
      (v, c, _t, dt) => (foot(v, c, dt), v.rpm > 4500 ? (c.gear('3'), true) : false),
      (v, c, time) => {
        if (v.gear === '3' && v.shift === 'engaged') c.gas(0.25);
        return v.gear === '3' && v.shift === 'engaged' && time > 1.2;
      },
      (v, c, time) => {
        c.gas(0);
        a0 = v.accel;
        j0 = v.clutchJ;
        return time > 0.4;
      },
      (v, c) => {
        c.gear('2');
        out.accel = v.accel - a0;
        out.peak = v.rpm;
        return true;
      },
      (v, _c, time) => {
        out.accel = Math.min(out.accel, v.accel - a0);
        out.peak = Math.max(out.peak, v.rpm);
        out.kj = (v.clutchJ - j0) / 1000;
        return time > 1.3;
      },
      (_v, c) => (c.brake(0.4), true),
    ]);
  };
  const without = { accel: 0, kj: 0, peak: 0 };
  const withBlip = { accel: 0, kj: 0, peak: 0 };
  return {
    id: 'shifting',
    title: t('Перемикання і оберти'),
    steps: [
      {
        title: t('1→2 на {rpm} об/хв', { rpm: num(rpm) }),
        text: t(
          'Газ у підлогу в першій, скільки тримають шини, до {rpm} об/хв, і вгору. Швидкість за мить перемикання майже та сама, тож оберти падають у відношенні чисел передач: {rpm} · {r2}/{r1} ≈ {drop} об/хв. На графіку «Тяга» точка перескакує з кривої першої на криву другої.',
          { rpm: num(rpm), r1: num(r1, 3), r2: num(r2, 3), drop: num(drop) },
        ),
        frame: scripted([
          ...standStill({ autoClutch: true, gradePct: 0 }),
          (_v, c) => (c.brake(0), c.clutch(0), c.gear('1'), true),
          wait(0.5),
          (v, c, _t, dt) => {
            foot(v, c, dt);
            if (v.rpm < rpm) return false;
            up.before = v.rpm;
            c.gas(0);
            c.gear('2');
            return true;
          },
          (v) => {
            // The clutch has locked in second: the engine turns with the wheels again.
            if (v.gear !== '2' || v.shift !== 'engaged') return false;
            up.after = v.rpm;
            return true;
          },
          (v, c, time, dt) => (foot(v, c, dt), time >= 1.2),
          (_v, c) => (c.gas(0), c.brake(0.5), true),
        ]),
        result: () =>
          up.after > 0 ? t('У моделі: перед перемиканням {before} об/хв, і {before} · {r2}/{r1} = {expected}; коли зчеплення замкнулося на другій — {after} об/хв.', {
                before: num(up.before),
                r1: num(r1, 3),
                r2: num(r2, 3),
                expected: num(shiftDrop(up.before, r1, r2)),
                after: num(up.after),
              }) : '',
      },
      {
        title: t('Униз без підгазовки'),
        text: t(
          'Третя, газ скинуто, і вниз на другу. Друга потребує обертів у {k} раза більших, ніж третя на тій самій швидкості. Без підгазовки зчеплення замикається, коли двигун ще повільніший за первинний вал, і різниця гаситься об авто: воно смикається, на стрічці провал прискорення.',
          { k: num(r2 / r3, 2) },
        ),
        frame: downshift(false, without),
        result: () => (without.kj > 0 ? t('Провал прискорення {a} м/с², у диск {kj} кДж.', { a: num(dip(without.accel), 1), kj: num(without.kj, 2) }) : ''),
      },
      {
        title: t('Униз з підгазовкою'),
        text: t('Те саме перемикання з підгазовкою: поки зчеплення розімкнене, система відкриває дросель і доганяє оберти двигуна до обертів первинного вала на другій. Зчеплення замикається майже без ковзання, і ривка немає.'),
        frame: downshift(true, withBlip),
        result: () =>
          withBlip.kj > 0 || withBlip.peak > 0
            ? t('Провал прискорення {a} м/с², у диск {kj} кДж, оберти піднялися до {rpm} об/хв ще до замикання.', { a: num(dip(withBlip.accel), 1), kj: num(withBlip.kj, 2), rpm: num(withBlip.peak) })
            : '',
      },
    ],
  };
}
