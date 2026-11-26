// The tyre scene's article, «Is there any point to camber and toe» (suspensions plan, the tyre scene, step 8): what the
// two angles do to a tyre, with the model's own numbers, and what is known about them on real cars, each claim with
// the evidence mark of docs/research/suspensions.md (read in the source, secondary, our calculation, not verified).
// Sources: docs/research/suspensions.md §4.2 and §7, docs/suspension-research/alignment_evidence.md.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { tyreAt } from '../../vehicle/tyre.ts';
import { camberNumbers, lateralPeak, toeNumbers } from '../../vehicle/tyre-curves.ts';

/** The load and tyre the article's numbers are for: the street set on a 4 kN wheel (a car of about 1630 kg). */
export const ARTICLE_LOAD_N = 4000;
/** Diameter of the tyre the toe is measured across, m: 245/40 R18. */
const TOE_DIAMETER_M = 0.653;
/** Rolling resistance of one wheel at 4 kN, N: a coefficient of 0.01 (our estimate). */
const ROLLING_N = 40;

const fmt = (v: number, digits: number): string => v.toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const source = (href: string, text: string): string => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

type Evidence = 'read' | 'secondary' | 'calc' | 'unverified';

/** An evidence mark with its meaning on hover. */
const mark = (level: Evidence): string => {
  const [label, title] = {
    read: [t('[П]'), t('перевірено в джерелі')],
    secondary: [t('[В]'), t('вторинне джерело')],
    calc: [t('[Р]'), t('наш розрахунок')],
    unverified: [t('[Н]'), t('не перевірено')],
  }[level];
  return `<span class="susp-ev" title="${title}">${label}</span>`;
};

export function tyreArticleHtml(): string {
  const tyre = tyreAt('street', ARTICLE_LOAD_N);
  const cam = camberNumbers(tyre.set, ARTICLE_LOAD_N, 2);
  const peak = lateralPeak(tyre.set, ARTICLE_LOAD_N);
  const toe = [1, 5, 10].map((mm) => toeNumbers(tyre.set, ARTICLE_LOAD_N, mm, TOE_DIAMETER_M));
  const share = (n: number): string => fmt((n / ROLLING_N) * 100, 1);
  return `<section class="susp-article susp-tyre-article">
      <h3>${t('Чи є сенс від розвалу й сходження')}</h3>
      <p>${t('Розвал — це нахил колеса до кузова чи від нього, сходження — поворот передньої кромки коліс одне до одного. Обидва кути малі, десяті частки градуса чи пара градусів, і обидва змінюють лише те, як шина лежить на дорозі. Тому відповідь на питання дає сама шина.')}</p>
      <h3>${t('Що розвал робить із шиною')}</h3>
      <p>${t('Нахилене колесо тягне вбік навіть тоді, коли котиться прямо: це розвальна сила. У моделі дорожньої шини сайту 1° розвалу дає стільки ж бічної сили, скільки {slip}° кута відведення', { slip: fmt(cam.slipPerCamber, 2) })} ${mark('calc')}. ${t('За вимірами шин розвальна сила становить 5–10 % від жорсткості на відведення')} ${mark('read')}.</p>
      <p>${t('На межі зчеплення розвал зсуває пік. На {load} кН дорожня шина дає найбільше {peak} кН бічної сили при {angle}° кута відведення. Нахил на 2° у бік сили, як у зовнішнього колеса з негативним розвалом, піднімає цей пік на {gain} %, а такий самий нахил від сили, як у внутрішнього, знижує на {loss} %', { load: fmt(ARTICLE_LOAD_N / 1000, 0), peak: fmt(peak.fy / 1000, 2), angle: fmt(peak.alphaDeg, 1), gain: fmt(cam.gainPct, 1), loss: fmt(-cam.lossPct, 1) })} ${mark('calc')}. ${t('Знак ефекту збігається з вимірами шин KIT 2006, а сам відсоток залежить від шини: більшість відкритих підгонок для дорожніх шин цього члена не має зовсім')} ${mark('calc')}.</p>
      <p>${t('Колесо, жорстко прикручене до кузова, губило б градус розвалу на кожен градус крену. Стійка Макферсон повертає з цього мало, тому статичний негативний розвал найбільше потрібен саме їй, а нерозрізний міст у чистому крені зовсім не нахиляє колеса відносно дороги')} ${mark('secondary')}. ${t('Єдиний вимір на дорожньому авто, який вдалося знайти: MINI зі стійками на −2° розвалу проходив коло в середньому майже на секунду швидше')} ${mark('secondary')} (${source('https://grassrootsmotorsports.com/articles/tilt-how-get-faster-lap-times-adding-negative-camb', 'Grassroots Motorsports, «Tilt!»')}; ${t('прочитано лише уривок')}).</p>
      <p>${t('Ціна розвалу — гальмування й знос. Нахилене колесо гальмує меншою плямою, і саме це зазвичай ставить межу трековому розвалу')} ${mark('secondary')}. ${t('Внутрішня кромка зношується швидше, але виміряних чисел зносу від розвалу ми не знайшли')} ${mark('unverified')}.</p>
      <h3>${t('Що робить сходження')}</h3>
      <p>${t('Кожне колесо зі сходженням котиться під малим кутом відведення. 1 мм сумарного сходження на шині діаметром 653 мм — це {deg}° на колесо, і без пружності протектора колесо зсунулося б убік на {scrub} мм за кожен кілометр', { deg: fmt(toe[0]!.perWheelDeg, 3), scrub: fmt(Math.round(toe[0]!.scrubMmPerKm / 10) * 10, 0) })} ${mark('calc')}. ${t('Це верхня межа: більшу частину цього зсуву забирає пружна деформація протектора, і шина в плямі не ковзає. Але знос від сходження реальний, і саме він — головна причина його виставляти.')}</p>
      <p>${t('Опір від сходження росте з квадратом кута. У моделі на {load} кН одне колесо гальмує з силою {d1} Н при 1 мм сумарного сходження, {d5} Н при 5 мм і {d10} Н при 10 мм. Опір кочення того самого колеса близько {roll} Н, тож це {s1} %, {s5} % і {s10} % від нього', { load: fmt(ARTICLE_LOAD_N / 1000, 0), d1: fmt(toe[0]!.dragN, 2), d5: fmt(toe[1]!.dragN, 1), d10: fmt(toe[2]!.dragN, 1), roll: fmt(ROLLING_N, 0), s1: share(toe[0]!.dragN), s5: share(toe[1]!.dragN), s10: share(toe[2]!.dragN) })} ${mark('calc')}. ${t('Тому твердження «1 мм сходження коштує стільки-то відсотків пального» хибне за формою, і первинного джерела для нього немає')} ${mark('unverified')}. ${t('Найкращий справжній вимір — Volvo і Michelin на вантажівках: регулювання дало «до 2,5 %» пального, але які відхилення виправляли, не сказано')} ${mark('read')} (${source('https://www.volvogroup.com/en/news-and-media/news/2010/sep/news-87944.html', 'Volvo Group, 2010')}).</p>
      <h3>${t('Висновок')}</h3>
      <p>${t('Сходження варто виправити, коли воно справді збилося: інакше шина зноситься, а пальне тут майже ні до чого. Трековий негативний розвал має сенс лише на треку і найбільше на стійках Макферсон; на дорозі він дає трохи зчеплення на межі й забирає трохи гальм і шини. Звичайному авто досить заводських кутів. Це наше судження з наведених фактів, а не виміряний висновок.')}</p>
      <h3>${t('Межі моделі')}</h3>
      <p class="susp-note">${t('Шина — Magic Formula PAC2002 з набором Chrono Sedan (245/40 R18), підігнаним до навантаження 4 кН і μ = 1. Повзунок розвалу має межі −5…+3,5°: за ними крива цього набору втрачає фізичну форму, тому більший позитивний розвал зовнішнього колеса (хитний міст на межі) модель обмежує. Картинка плями — щіткова модель з тими самими жорсткістю й піком; комбіноване ковзання в ній лише ілюстрація. Тиск змінює тільки вертикальну жорсткість шини (оцінка): залежність сил від тиску не моделюємо.')}</p>
      <p class="susp-note">${t('Позначки: [П] — прочитано в самому джерелі, [В] — вторинне джерело, [Р] — наш розрахунок моделлю сайту, [Н] — не перевірено. Індекси навантаження й швидкості — таблиці ETRTO у переказі Вікіпедії')} ${mark('secondary')} (${source('https://en.wikipedia.org/wiki/Tire_code', t('Вікіпедія'))}).</p>
    </section>`;
}
