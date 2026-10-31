// How close a design runs to what its parts can take. Every limit is a load from 0 to 1 and beyond, at a given
// speed and throttle, so one set of numbers drives the verdict, the rev zones, the wear and the final breakage.
//
// Limits are calibrated so factory engines land where their reputation puts them. They are not engineering
// allowables: see docs/engine-designer-model.md.

import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { designBalance } from './diagnostics.ts';
import { isRotary, isTurbo, type Design } from './design.ts';
import { FUELS } from './fuels.ts';
import { rodFailStress, rodStressAt, type Performance, type RpmPoint } from './physics.ts';

/** Which part to show as broken. */
export type FailedPart = 'rod' | 'piston' | 'valve' | 'gasket' | 'turbo' | 'rotor' | 'exhaust' | 'mounts';

export interface LimitItem {
  id: string;
  name: string;
  /** Load at the worst point the engine can reach. Over 1 means it fails. */
  load: number;
  /** The causes in numbers. */
  detail: string;
  /** Plain words on what would ease it. */
  fix: string;
  /** Said when this is what killed the engine. */
  failure: string;
  part: FailedPart;
  /** Load at a given speed and throttle share, for wear while driving. */
  at: (rpm: number, throttle: number) => number;
}

export type VerdictId = 'solid' | 'sport' | 'race' | 'oneshot' | 'doomed';

export interface Reliability {
  items: LimitItem[];
  worst: LimitItem;
  verdict: VerdictId;
  verdictName: string;
  lifeText: string;
  /** Up to here wear is negligible. */
  safeRpm: number;
  /** Above this a rod or rotor lets go at once. */
  failureRpm: number;
}

const VERDICTS: Record<VerdictId, { name: string; life: string; upTo: number }> = {
  solid: { name: t('Надійний'), life: t('Сотні тисяч кілометрів'), upTo: 0.75 },
  sport: { name: t('Спортивний'), life: t('Десятки тисяч кілометрів, якщо не зловживати'), upTo: 0.88 },
  race: { name: t('Гоночний'), life: t('Десятки годин між ремонтами'), upTo: 1 },
  oneshot: { name: t('Одноразовий'), life: t('Хвилини на повному газу'), upTo: 1.15 },
  doomed: { name: t('Приречений'), life: t('Не переживе першого повного газу'), upTo: Infinity },
};

const verdictFor = (load: number): VerdictId => {
  const order: VerdictId[] = ['solid', 'sport', 'race', 'oneshot', 'doomed'];
  return order.find((v) => load <= VERDICTS[v].upTo)!;
};

const nearest = (points: RpmPoint[], rpm: number): RpmPoint => {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const share = (rpm - first.rpm) / Math.max(last.rpm - first.rpm, 1);
  return points[Math.max(0, Math.min(points.length - 1, Math.round(share * (points.length - 1))))]!;
};

const n1 = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n0 = (v: number): string => Math.round(v).toLocaleString(numberLocale);

// Materials decide what the parts can take. Peak cylinder pressure each can live with, bar.
const PISTON_BAR = { cast: 200, light: 230, forged: 285 };
// A cast piston is hard but brittle, so knock finds it first. A forged one bends before it breaks.
const PISTON_KNOCK = { cast: 1.2, light: 1.05, forged: 0.8 };
const GASKET_BAR = { aluminium: 195, iron: 235 };

export function assessReliability(d: Design, perf: Performance): Reliability {
  const points = perf.points;
  const diesel = FUELS[d.fuel].diesel;
  const items: Array<Omit<LimitItem, 'load'> & { reach?: number }> = [];
  const rotary = isRotary(d);
  const worstPressure = (): RpmPoint => points.reduce((a, b) => (b.peakPressureBar > a.peakPressureBar ? b : a), points[0]!);
  // Diesel parts are built for much higher peak pressure.
  const dieselStrength = diesel ? 1.4 : 1;

  if (!rotary) {
    const strength = rodFailStress(d);
    const stress = rodStressAt(d, d.rpmLimit);
    items.push({
      id: 'rod-tension',
      name: t('Шатун на розрив'),
      detail: t('Поршень {mass} кг розганяється до {accel} тис. м/с² і рветься з шатуна: {stress} МПа з {limit}. Сила росте з квадратом обертів.', { mass: n1(perf.reciprocatingKg), accel: n1(perf.pistonAccel / 1000), stress: n0(stress), limit: n0(strength) }),
      fix: t('Менші оберти чи хід, легший поршень, титановий шатун.'),
      failure: t('Обірвало шатун: він не витримав сили інерції поршня.'),
      part: 'rod',
      at: (rpm) => rodStressAt(d, rpm) / strength,
    });
    const rodStrength = (d.rodMaterial === 'titanium' ? 560 : 650) * Math.min(1, (1.7 * d.bore) / d.rodLength) ** 0.5;
    const compressed = (bar: number): number => (bar / 10) * 28;
    const pressurePeak = worstPressure();
    items.push({
      id: 'rod-buckling',
      name: t('Шатун на згин'),
      detail: t('Тиск {bar} бар давить поршнем на шатун: {stress} МПа з {limit}. Довгий і тонкий шатун гнеться легше.', { bar: n0(pressurePeak.peakPressureBar), stress: n0(compressed(pressurePeak.peakPressureBar)), limit: n0(rodStrength) }),
      fix: t('Менший наддув чи стиснення, коротший шатун.'),
      failure: t('Зігнуло шатун: тиск згоряння виявився сильнішим за нього.'),
      part: 'rod',
      at: (rpm, throttle) => compressed(nearest(points, rpm).peakPressureBar * (0.3 + 0.7 * throttle)) / rodStrength,
    });
    const pistonBar = PISTON_BAR[d.pistonMaterial] * dieselStrength;
    const pistonValues = { bar: n0(pressurePeak.peakPressureBar), limit: n0(pistonBar) };
    items.push({
      id: 'piston',
      name: t('Поршень'),
      detail: {
        cast: t('Тиск у циліндрі {bar} бар, а литий поршень витримує близько {limit}.', pistonValues),
        light: t('Тиск у циліндрі {bar} бар, а полегшений поршень витримує близько {limit}.', pistonValues),
        forged: t('Тиск у циліндрі {bar} бар, а кований поршень витримує близько {limit}.', pistonValues),
      }[d.pistonMaterial],
      fix: t('Кований поршень, менший наддув чи стиснення.'),
      failure: t('Тріснув поршень: тиск згоряння зруйнував перемичку кілець.'),
      part: 'piston',
      at: (rpm, throttle) => (nearest(points, rpm).peakPressureBar * (0.3 + 0.7 * throttle)) / pistonBar,
    });
    const speedLimit = 30;
    const atLimit = points[points.length - 1]!;
    items.push({
      id: 'piston-speed',
      name: t('Швидкість поршня'),
      detail: t('{speed} м/с на межі обертів. До 25 м/с кільця й вкладиші живуть довго, далі зношуються дедалі швидше.', { speed: n1(atLimit.pistonSpeed) }),
      fix: t('Менший хід або нижча межа обертів.'),
      failure: t('Заклинило поршень: кільця й оливна плівка не витримали такої швидкості.'),
      part: 'piston',
      at: (rpm) => (2 * (d.stroke / 1000) * rpm) / 60 / speedLimit,
    });
    items.push({
      id: 'valve-float',
      name: t('Клапанні пружини'),
      detail: t('Пружина {force} Н утримує клапан до {rpm} об/хв. Далі клапан не встигає за кулачком.', { force: n0(d.springForce), rpm: n0(perf.floatRpm) }),
      fix: t('Сильніша пружина, менший підйом, легший привод.'),
      failure: t('Клапан завис і зустрівся з поршнем: пружина не встигла його повернути.'),
      part: 'valve',
      at: (rpm) => rpm / perf.floatRpm,
    });
    const clearanceLoad = (clearance: number): number => 1.02 - clearance / 4;
    items.push({
      id: 'valve-clearance',
      name: t('Зазор клапан-поршень'),
      detail: t('Найменший зазор {gap} мм у перекритті фаз. Він залежить від стиснення, підйому й фаз.', { gap: n1(perf.valveClearance) }),
      fix: t('Менше стиснення, менший підйом або менше перекриття.'),
      failure: t('Клапан ударив по поршню: у перекритті фаз їм не вистачило місця.'),
      part: 'valve',
      at: () => clearanceLoad(perf.valveClearance),
    });
    const gasketBar = GASKET_BAR[d.blockMaterial] * dieselStrength;
    const gasketValues = { bar: n0(pressurePeak.peakPressureBar), limit: n0(gasketBar) };
    items.push({
      id: 'gasket',
      name: t('Прокладка й блок'),
      detail: d.blockMaterial === 'iron'
        ? t('Тиск {bar} бар відриває головку від блока. Чавунний блок тримає близько {limit}.', gasketValues)
        : t('Тиск {bar} бар відриває головку від блока. Алюмінієвий блок тримає близько {limit}.', gasketValues),
      fix: t('Чавунний блок, менший наддув чи стиснення.'),
      failure: t('Пробило прокладку головки: тиск вирвався між блоком і головкою.'),
      part: 'gasket',
      at: (rpm, throttle) => (nearest(points, rpm).peakPressureBar * (0.3 + 0.7 * throttle)) / gasketBar,
    });
    const shake = designBalance(d, perf);
    const shakeTotal = shake.force1 + shake.force2 + shake.couple1 * 0.6 + shake.couple2 * 0.5;
    items.push({
      id: 'shake',
      name: t('Вібрації'),
      detail: t('Незрівноважені сили й моменти: {value}. Вони розхитують кронштейни й підшипники, тим більше що вище оберти.', { value: n1(shakeTotal) }),
      fix: t('Рівні спалахи, інший кут розвалу, балансирні вали.'),
      failure: t('Вібрації зруйнували опори двигуна.'),
      part: 'mounts',
      at: (rpm) => (shakeTotal / 4.2) * Math.min(1.2, 0.5 + 0.7 * (rpm / d.rpmLimit)),
    });
  } else {
    items.push({
      id: 'rotor',
      name: t('Вал і підшипники ротора'),
      detail: t('Відцентрова сила ротора росте з квадратом обертів. Запас приблизно до {rpm} об/хв.', { rpm: n0(perf.failureRpm) }),
      fix: t('Нижча межа обертів або менший ексцентриситет.'),
      failure: t('Вийшов з ладу підшипник ексцентрикового вала.'),
      part: 'rotor',
      at: (rpm) => (rpm / perf.failureRpm) ** 2,
    });
    const rotorBar = 170 * dieselStrength;
    const peak = worstPressure();
    items.push({
      id: 'apex',
      name: t('Апексні ущільнення'),
      detail: t('Тиск {bar} бар притискає ущільнення до корпусу, вони витримують близько {limit}.', { bar: n0(peak.peakPressureBar), limit: n0(rotorBar) }),
      fix: t('Менший наддув чи стиснення.'),
      failure: t('Зруйнувалось апексне ущільнення: ротор втратив компресію.'),
      part: 'rotor',
      at: (rpm, throttle) => (nearest(points, rpm).peakPressureBar * (0.3 + 0.7 * throttle)) / rotorBar,
    });
  }

  if (!diesel) {
    const hardness = rotary ? 1 : PISTON_KNOCK[d.pistonMaterial];
    const knockLoad = (p: RpmPoint): number => (p.knockSeverity > 0 ? 1 + (p.knockSeverity - 1) * 0.8 : p.knockRetard / 25) * hardness;
    const worstKnock = points.reduce((a, b) => (knockLoad(b) > knockLoad(a) ? b : a), points[0]!);
    items.push({
      id: 'knock',
      name: t('Детонація'),
      detail: worstKnock.knockRetard > 0
        ? t('Близько {rpm} об/хв блок керування відкочує запалювання на {deg}° із 25 можливих. {piston}', {
            rpm: n0(worstKnock.rpm),
            deg: worstKnock.knockRetard,
            piston: rotary ? '' : d.pistonMaterial === 'forged' ? t('Кований поршень терпить це краще.') : d.pistonMaterial === 'light' ? t('Полегшений поршень має менший запас і від детонації страждає першим.') : t('Литий поршень крихкий і від детонації тріскає.'),
          })
        : t('Паливо горить рівно на всіх обертах, запалювання не відкочується.'),
      fix: t('Вищий октан, менше стиснення чи наддуву, кращий інтеркулер.'),
      failure: t('Прогорів поршень: детонація вибила кромку й кільця.'),
      part: 'piston',
      at: (rpm, throttle) => knockLoad(nearest(points, rpm)) * throttle * throttle,
    });
  }

  const egtLoad = (celsius: number): number => (celsius - 300) / 900;
  const hottest = points.reduce((a, b) => (b.egtC > a.egtC ? b : a), points[0]!);
  items.push({
    id: 'exhaust-heat',
    name: t('Температура газів'),
    detail: isTurbo(d)
      ? t('До {temp} °C. Випускні клапани і турбіна живуть до приблизно 1200 °C.', { temp: n0(hottest.egtC) })
      : t('До {temp} °C. Випускні клапани живуть до приблизно 1200 °C.', { temp: n0(hottest.egtC) }),
    fix: t('Багатша суміш, менший наддув.'),
    failure: t('Прогоріли випускні клапани: гази були надто гарячими.'),
    part: 'exhaust',
    at: (rpm, throttle) => egtLoad(nearest(points, rpm).egtC * (0.6 + 0.4 * throttle)),
  });

  if (isTurbo(d)) {
    const ratio = 1 + d.boostBar;
    items.push({
      id: 'turbo',
      name: t('Турбіна'),
      detail: t('Ступінь підвищення тиску компресора {ratio} із приблизно 4,5 можливих для одного ступеня.', { ratio: n1(ratio) }),
      fix: t('Менший наддув.'),
      failure: t('Розірвало колесо турбіни: воно перевищило граничні оберти.'),
      part: 'turbo',
      at: (rpm, throttle) => ((1 + Math.max(0, nearest(points, rpm).boostBar)) / 4.5) * (0.4 + 0.6 * throttle),
    });
  }

  const finished: LimitItem[] = items.map((item) => {
    let load = 0;
    for (const p of points) load = Math.max(load, item.at(p.rpm, 1));
    return { ...item, load };
  });
  const worst = finished.reduce((a, b) => (b.load > a.load ? b : a), finished[0]!);
  const verdict = verdictFor(worst.load);

  // Rev zones come only from what speed itself breaks.
  const speedBound = finished.filter((i) => ['rod-tension', 'piston-speed', 'valve-float', 'rotor'].includes(i.id));
  let safeRpm = d.rpmLimit;
  for (let rpm = 800; rpm <= 25000; rpm += 25) {
    if (speedBound.some((i) => i.at(rpm, 1) >= SAFE_LOAD)) {
      safeRpm = rpm;
      break;
    }
  }
  return {
    items: finished,
    worst,
    verdict,
    verdictName: VERDICTS[verdict].name,
    lifeText: VERDICTS[verdict].life,
    safeRpm,
    failureRpm: perf.failureRpm,
  };
}

/** Below this load a part doesn't wear in any way worth showing. */
export const SAFE_LOAD = 0.88;

/** A part at load 1 lasts about this long, seconds. Compressed so wear shows in minutes rather than years. */
const SECONDS_AT_LIMIT = 30;

export interface WearStep {
  /** Share of the engine's life used per second, right now. */
  rate: number;
  /** The part suffering most right now, if any. */
  worst: LimitItem | null;
}

export type RestartOutlook = 'idle' | 'throttle' | 'revs' | 'fine';

/** What happens if this engine is simply started again as it is, so that the page doesn't promise a repair that won't last. */
export function restartOutlook(reliability: Reliability, idleRpm: number, rpmLimit: number): RestartOutlook {
  if (wearNow(reliability, idleRpm, 0.15).rate > 1 / 30) return 'idle';
  if (wearNow(reliability, idleRpm * 2.5, 1).rate > 1 / 3) return 'throttle';
  if (rpmLimit > reliability.failureRpm) return 'revs';
  return 'fine';
}

export function wearNow(reliability: Reliability, rpm: number, throttle: number): WearStep {
  let rate = 0;
  let worst: LimitItem | null = null;
  let highest = SAFE_LOAD;
  for (const item of reliability.items) {
    const load = item.at(rpm, throttle);
    if (load <= SAFE_LOAD) continue;
    const over = (load - SAFE_LOAD) / (1 - SAFE_LOAD);
    rate += (over * over) / SECONDS_AT_LIMIT;
    if (load > highest) {
      highest = load;
      worst = item;
    }
  }
  return { rate, worst };
}
