// Turns the suspension designer's numbers into plain explanations (suspensions plan, the designer's engineering
// diagnoses): what the car will do, why, and what would help. Nothing here forbids a design; a car of the catalogue gets
// no fatal diagnosis (tests). The thresholds are the plan's table; where the plan names a figure without a bound, the
// bound is ours and says so.
//
// The character of the ride is three normalised figures, comfort, grip and body control, and a verdict in words. There
// is no single score: the research found no scientific basis for one (suspensions plan, results). The normalisations
// are our construction, illustrative: comfort by the ISO 2631-1 bands of the weighted acceleration, grip by the grip
// left on a bad road, body control by the roll gradient and the body's damping.

import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';
import { G } from '../suspension/forces.ts';
import type { ChassisPerformance } from '../suspension/evaluate-chassis.ts';
import type { SteeringPerformance } from '../suspension/evaluate-steering.ts';
import { isSolid, type ChassisDesign } from './design.ts';

export type Severity = 'fatal' | 'warning' | 'note';

export interface ChassisDiagnostic {
  id: string;
  severity: Severity;
  title: string;
  text: string;
  fix?: string;
}

const DEG = 180 / Math.PI;

/** Thresholds of the plan's table. */
export const DIAGNOSIS_LIMITS = {
  /** An oversteering car below this critical speed is unstable, m/s (160 km/h). */
  criticalSpeedMs: 160 / 3.6,
  /** Bump steer of a front wheel, rad/m (10°/m). */
  bumpSteer: 10 / DEG,
  /** A steered solid axle's turn of the wheels from its drag link per 50 mm of axle travel, rad (0.5°). */
  axleSteer: 0.5 / DEG,
  /** Rear roll steer toward the outside of the turn that counts, rad per g of lateral acceleration (ours: 0.1°/g). */
  rearRollSteer: 0.1 / DEG,
  zetaLow: 0.15,
  zetaHigh: 0.8,
  /** Dynamic load coefficient on the class B road at 25 m/s. */
  dlc: 0.3,
  /** Outer wheel's camber to the road at 0.8 g, rad (positive: top out). */
  shoulderCamber: 0.5 / DEG,
  /** Roll centre heights, m. */
  rollCentreHigh: 0.25,
  rollCentreLow: 0,
  /** Scrub radius, m. */
  scrub: 0.02,
  /** Front ride frequency over the rear's. */
  pitchRatio: 1.1,
  /** Unsprung mass over the car's. */
  unsprung: 0.15,
  /** Anti-dive, %. */
  antiDive: 60,
} as const;

const fmt = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** The engineering diagnoses of a design, worst first; the steering's figures (evaluateSteering) add its own. */
export function diagnoseChassis(d: ChassisDesign, perf: ChassisPerformance, steering: SteeringPerformance | null = null): ChassisDiagnostic[] {
  const out: ChassisDiagnostic[] = [];
  const add = (id: string, severity: Severity, title: string, text: string, fix?: string): void => {
    out.push({ id, severity, title, text, fix });
  };
  const L = DIAGNOSIS_LIMITS;
  const axleName = (k: number): string => (k === 0 ? t('спереду') : t('ззаду'));
  const [front, rear] = perf.axles;

  if (perf.rolloverAcc < perf.skidpadAcc) {
    add(
      'rollover',
      'fatal',
      t('Перекинеться раніше, ніж зісковзне'),
      t('Шини тримають до {grip} g, а авто перекидається вже на {roll} g: центр мас надто високо для такої колії.', { grip: fmt(perf.skidpadAcc / G, 2), roll: fmt(perf.rolloverAcc / G, 2) }),
      t('Опусти центр мас або розшир колію.'),
    );
  }
  if (perf.criticalSpeedMs < L.criticalSpeedMs) {
    add(
      'unstable',
      'fatal',
      t('Авто нестійке на швидкості'),
      t('Задня вісь ковзає раніше за передню: надмірна поворотність {us}°/g. Понад {v} км/год авто саме йде в занос від найменшого збурення.', { us: fmt(-perf.understeerPerG * DEG, 1), v: fmt(perf.criticalSpeedMs * 3.6) }),
      t('Збільш частку перенесення ваги спереду: жорсткіший передній стабілізатор або м’якший задній.'),
    );
  }
  if (Math.abs(front.bumpSteer) > L.bumpSteer) {
    add(
      'bump-steer',
      'warning',
      t('Кермо смикає на нерівностях'),
      t('Кожне переднє колесо повертається на {deg}° на 100 мм ходу: на нерівній дорозі авто саме змінює напрямок.', { deg: fmt(Math.abs(front.bumpSteer) * DEG * 0.1, 1) }),
      t('Постав внутрішній шарнір рульової тяги на висоту, де тяга не підрулює.'),
    );
  }
  if (steering && Math.abs(steering.axleSteer) > L.axleSteer) {
    add(
      'axle-steer',
      'warning',
      t('Кермо смикає на нерівностях'),
      t('Коли міст піднімається на 50 мм, колеса самі повертаються на {deg}°: кінець поздовжньої тяги йде своєю дугою, а міст своєю.', { deg: fmt(Math.abs(steering.axleSteer) * DEG, 1) }),
      t('Постав поздовжню рульову тягу паралельно поперечній тязі моста.'),
    );
  }
  const rearSteerPerG = rear.rollSteer * perf.roll.suspensionGradient[1] * G;
  if (rearSteerPerG < -L.rearRollSteer) {
    add(
      'rear-roll-steer',
      'warning',
      t('Задня вісь підрулює назовні повороту'),
      t('На крені задні колеса повертаються назовні на {deg}° на кожне g: задня вісь сама додає надмірної поворотності.', { deg: fmt(-rearSteerPerG * DEG, 2) }),
      t('Зміни геометрію задньої осі так, щоб на стиску колесо йшло в сходження.'),
    );
  }
  const zetas = perf.axles.map((a) => a.body.zeta);
  const low = zetas.findIndex((z) => z < L.zetaLow);
  if (low >= 0) {
    add(
      'floaty',
      'warning',
      t('Підвіска розгойдується'),
      t('Демпфування кузова {axle} лише {zeta}: після нерівності кузов гойдається кілька разів, перш ніж заспокоїться.', { axle: axleName(low), zeta: fmt(zetas[low], 2) }),
      t('Жорсткіші амортизатори або м’якші пружини.'),
    );
  }
  const high = zetas.findIndex((z) => z > L.zetaHigh);
  if (high >= 0) {
    add(
      'harsh',
      'warning',
      t('Б’є на нерівностях'),
      t('Демпфування кузова {axle} {zeta}: на малих швидкостях амортизатор майже не пускає колесо, і кожна нерівність іде в кузов.', { axle: axleName(high), zeta: fmt(zetas[high], 2) }),
      t('Зменш демпфування амортизатора на стиску.'),
    );
  }
  const hop = perf.axles.findIndex((a) => a.smooth.dlc > L.dlc);
  if (hop >= 0) {
    add(
      'wheel-hop',
      'warning',
      t('Колесо втрачає дорогу'),
      t('На дорозі класу B на 90 км/год притискання коліс {axle} коливається на {dlc} % від ваги: на хвилях колесо ледь торкається дороги.', { axle: axleName(hop), dlc: fmt(perf.axles[hop].smooth.dlc * 100) }),
      t('Полегши колесо або додай демпфування.'),
    );
  }
  const bottom = perf.axles.findIndex((a) => a.travelReserveM < 0);
  if (bottom >= 0) {
    const a = perf.axles[bottom];
    add(
      'bottoming',
      'warning',
      t('Пробиває відбійники'),
      t('На поганій дорозі (клас C, 54 км/год) колеса {axle} ходять на ±{travel} мм, а до відбійника лише {room} мм.', { axle: axleName(bottom), travel: fmt(3 * a.rough.travelRmsM * 1000), room: fmt((a.travelReserveM + 3 * a.rough.travelRmsM) * 1000) }),
      t('Жорсткіші пружини або сильніші амортизатори.'),
    );
  }
  const shoulder = perf.axles.findIndex((a) => a.outerCamberRoad > L.shoulderCamber);
  if (shoulder >= 0) {
    add(
      'shoulder',
      'warning',
      t('Шина працює на плечі'),
      t('На 0,8 g зовнішнє колесо {axle} нахилене назовні на {deg}°: шина спирається на зовнішнє плече й тримає гірше.', { axle: axleName(shoulder), deg: fmt(perf.axles[shoulder].outerCamberRoad * DEG, 1) }),
      t('Більший від’ємний розвал, більший набір розвалу на стиску або менший крен.'),
    );
  }
  // Jacking and a sinking body are about independent wheels, whose links tilt the side force: a beam or a solid axle
  // takes it through a level rod or bush, its roll centre only sets how the load transfers, and its camber does not
  // follow the body.
  const independent = [d.layoutF, d.layoutR].map((l) => !isSolid(l) && l !== 'twist-beam');
  const jacking = perf.axles.findIndex((a, k) => independent[k] && a.rollCentreM > L.rollCentreHigh);
  if (jacking >= 0) {
    add(
      'jacking',
      'warning',
      t('Кузов підкидає в повороті'),
      t('Центр крену {axle} на висоті {h} мм: бічна сила шин піднімає кузов, а розвал колеса в повороті різко змінюється.', { axle: axleName(jacking), h: fmt(perf.axles[jacking].rollCentreM * 1000) }),
      t('Опусти внутрішні опори важелів.'),
    );
  }
  const sinking = perf.axles.findIndex((a, k) => independent[k] && a.rollCentreM < L.rollCentreLow);
  if (sinking >= 0) {
    add(
      'roll-centre-below',
      'warning',
      t('Кузов осідає в повороті'),
      t('Центр крену {axle} на {h} мм нижче дороги: бічна сила тягне кузов донизу, а крен більшає.', { axle: axleName(sinking), h: fmt(-perf.axles[sinking].rollCentreM * 1000) }),
      t('Підніми внутрішні опори нижнього важеля.'),
    );
  }
  if (front.scrubM > L.scrub) {
    add(
      'scrub',
      'warning',
      t('Тягне на гальмах на різному покритті'),
      t('Плече обкатки {mm} мм: коли під лівими й правими колесами різне зчеплення, гальмівна сила повертає кермо.', { mm: fmt(front.scrubM * 1000) }),
      t('Зменш плече обкатки.'),
    );
  }
  if (perf.frontTransferShare < d.frontShare) {
    add(
      'snap',
      'warning',
      t('Схильне до заносу'),
      t('Спереду лише {lltd} % перенесення ваги в повороті при {share} % ваги на передній осі: на межі першою зісковзує задня вісь.', { lltd: fmt(perf.frontTransferShare * 100), share: fmt(d.frontShare * 100) }),
      t('Жорсткіший передній стабілізатор або м’якший задній.'),
    );
  }
  if (front.rideHz > rear.rideHz * L.pitchRatio) {
    add(
      'pitch',
      'note',
      t('Гойдає по тангажу після нерівності'),
      t('Частота кузова спереду {f} Гц, ззаду {r} Гц: нерівність, яку першою проходить передня вісь, розгойдує кузов уперед і назад.', { f: fmt(front.rideHz, 2), r: fmt(rear.rideHz, 2) }),
      t('Зроби задні пружини трохи жорсткішими за передні.'),
    );
  }
  if (perf.unsprungShare > L.unsprung) {
    add(
      'heavy-wheels',
      'note',
      t('Важкі колеса'),
      t('Непідресорені частини важать {share} % маси авто: колесам важче стежити за дорогою.', { share: fmt(perf.unsprungShare * 100) }),
      t('Легші колеса й гальма або внутрішні гальма.'),
    );
  }
  if (perf.anti.braking[0] > L.antiDive) {
    add(
      'anti-dive',
      'note',
      t('Гальмування жорстке на кермі'),
      t('Анти-клювання {pct} %: кузов майже не опускається на гальмах, зате гальмівна сила йде через важелі, і підвіска на гальмах жорсткішає.', { pct: fmt(perf.anti.braking[0]) }),
      t('Зменш нахил осей важелів у боковому виді.'),
    );
  }
  // Toe-out the page can show: a solver's −0.000° is a zero toe, not a nervous axle.
  if (rear.toe * DEG <= -0.005) {
    add(
      'rear-toe-out',
      'note',
      t('Нервова задня вісь'),
      t('Задні колеса стоять із розходженням {deg}°: задня вісь підрулює сама від найменшого збурення.', { deg: fmt(-rear.toe * DEG, 2) }),
      t('Постав задні колеса зі сходженням.'),
    );
  }
  const joint = perf.axles.findIndex((a) => a.jointUse > 1);
  if (joint >= 0) {
    add(
      'joint',
      'warning',
      t('Шарнір піввісі виходить за межу'),
      t('На повному ході кут або осьовий хід шарніра піввісі {axle} перевищує межу виробника: шарнір зноситься або заклинить.', { axle: axleName(joint) }),
      t('Посунь внутрішній шарнір так, щоб піввісь стала довшою й рівнішою.'),
    );
  }
  const rank: Record<Severity, number> = { fatal: 0, warning: 1, note: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** The character of the ride: three normalised figures and a verdict. */
export interface ChassisCharacter {
  /** 0..1, higher is better. */
  comfort: number;
  grip: number;
  control: number;
  verdict: 'soft' | 'composed' | 'stiff' | 'floaty';
  label: string;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Weighted acceleration that counts as fully comfortable and as not at all, m/s² (ISO 2631-1's bands). */
const COMFORT_AW: readonly [number, number] = [0.315, 1.25];
/** Grip left on a bad road that counts as none and as all of it (ours). */
const GRIP_RANGE: readonly [number, number] = [0.9, 1];
/** Roll gradients that count as full control and as none, rad per g (ours: 1.5 and 6°/g). */
const ROLL_RANGE: readonly [number, number] = [1.5 / DEG, 6 / DEG];
/** Body damping that counts as no control and as full (ours). */
const ZETA_RANGE: readonly [number, number] = [0.1, 0.3];

export function chassisCharacter(perf: ChassisPerformance): ChassisCharacter {
  const comfort = clamp01(Math.log(COMFORT_AW[1] / perf.comfortAw) / Math.log(COMFORT_AW[1] / COMFORT_AW[0]));
  const grip = clamp01((perf.roughGrip - GRIP_RANGE[0]) / (GRIP_RANGE[1] - GRIP_RANGE[0]));
  const zeta = Math.min(perf.axles[0].body.zeta, perf.axles[1].body.zeta);
  const roll = clamp01((ROLL_RANGE[1] - perf.rollPerG) / (ROLL_RANGE[1] - ROLL_RANGE[0]));
  const damping = clamp01((zeta - ZETA_RANGE[0]) / (ZETA_RANGE[1] - ZETA_RANGE[0]));
  const control = Math.min(roll, damping);
  // A body that is barely held cannot be composed: with a gentle ride it is soft, with a rough one it wallows.
  let verdict: ChassisCharacter['verdict'];
  if (zeta < DIAGNOSIS_LIMITS.zetaLow) verdict = 'floaty';
  else if (control < 0.5) verdict = comfort >= 0.4 ? 'soft' : 'floaty';
  else if (control >= 0.6 && comfort < 0.4) verdict = 'stiff';
  else verdict = 'composed';
  const labels: Record<ChassisCharacter['verdict'], string> = {
    soft: t('м’яка й плавна'),
    composed: t('зібрана'),
    stiff: t('жорстка'),
    floaty: t('розгойдується'),
  };
  return { comfort, grip, control, verdict, label: labels[verdict] };
}
