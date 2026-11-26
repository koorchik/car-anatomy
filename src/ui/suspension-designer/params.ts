// What the suspension designer's page says about each control (src/suspension-designer/controls.ts): its name, unit,
// how it is shown, a line of help, the names of its choices, and the groups of the panel. The model holds no text; the
// limits come from paramRange and the reasons for them are named here (LimitReason).

import { t } from '../../i18n/t.ts';
import type { LimitReason } from '../../suspension-designer/constraints.ts';
import type { AxleKey, CarParams } from '../../suspension-designer/design.ts';

export interface ParamInfo {
  label: string;
  /** Unit as shown after the value; '' for none. */
  unit: string;
  /** Shown value = design value × scale (a share as a percentage). */
  scale?: number;
  digits: number;
  /** Slider step in shown units. */
  step: number;
  /** A logarithmic slider: a range over decades (a spring rate). */
  log?: boolean;
  help: string;
}

const mm = t('мм');
const deg = '°';
const kg = t('кг');

/** By the bare key: a car's, or an axle's without its F or R. */
export const PARAMS: Record<keyof CarParams | AxleKey, ParamInfo> = {
  car: { label: t('Авто-донор'), unit: '', digits: 0, step: 1, help: '' },
  massKg: { label: t('Маса з водієм'), unit: kg, digits: 0, step: 10, help: t('Більша маса м’якше сідає на ті самі пружини: частота кузова падає, гальмівний шлях і перенесення ваги ростуть.') },
  frontShare: { label: t('Частка маси спереду'), unit: '%', scale: 100, digits: 0, step: 1, help: t('Скільки ваги лежить на передній осі. Важкий перед зазвичай дає недостатню поворотність.') },
  cgHeightMm: { label: t('Висота центра мас'), unit: mm, digits: 0, step: 5, help: t('Що вище центр мас, то більше ваги переходить на зовнішні колеса в повороті й на передні при гальмуванні.') },
  wheelbaseMm: { label: t('База'), unit: mm, digits: 0, step: 10, help: t('Відстань між осями. Довша база спокійніша по тангажу й на прямій, коротша спритніша.') },
  drive: { label: t('Привід'), unit: '', digits: 0, step: 1, help: t('Які колеса ведучі. Від цього залежать піввісі, анти-присідання й сили на кермі.') },
  brakeFront: { label: t('Частка гальм спереду'), unit: '%', scale: 100, digits: 0, step: 1, help: t('Яку частку гальмівної сили бере передня вісь. Від неї залежить, яка вісь заблокується першою без ABS.') },
  driveFront: { label: t('Частка тяги спереду'), unit: '%', scale: 100, digits: 0, step: 1, help: t('Як повний привід ділить тягу між осями.') },
  finalDrive: { label: t('Головна передача'), unit: '', digits: 2, step: 0.05, help: t('Нерозрізний міст сприймає момент карданного вала, і він розвантажує одне заднє колесо: що більше число, то менший момент на кардані.') },
  tyre: { label: t('Шини'), unit: '', digits: 0, step: 1, help: t('Тип шин задає зчеплення й те, як воно падає з навантаженням.') },
  dampers: { label: t('Система амортизаторів'), unit: '', digits: 0, step: 1, help: t('Пасивні мають одну характеристику; адаптивні перемикаються під дорогу; MagneRide і активні тримають кузов, як скайхук.') },

  layout: { label: t('Тип підвіски'), unit: '', digits: 0, step: 1, help: t('Інша компоновка приносить свою типову геометрію й типову пружину.') },
  trackMm: { label: t('Колія'), unit: mm, digits: 0, step: 5, help: t('Ширша колія менше переносить вагу в повороті й піднімає поріг перекидання.') },
  knuckle: { label: t('Кулак'), unit: '', digits: 0, step: 1, help: t('Кулак на двох осях або RevoKnuckle повертає колесо на власній осі ближче до колеса: менше плече й менше смикає кермо під тягою.') },
  kingpinOffsetMm: { label: t('Плече на осі колеса'), unit: mm, digits: 0, step: 1, help: t('Відстань від осі повороту до середини колеса на висоті маточини. Тяга на цьому плечі крутить кермо.') },
  kpiDeg: { label: t('Нахил осі повороту'), unit: deg, digits: 1, step: 0.1, help: t('Нахил осі повороту в виді спереду. Повертає кермо в нуль і зменшує плече обкатки.') },
  casterDeg: { label: t('Кастер'), unit: deg, digits: 1, step: 0.1, help: t('Нахил осі повороту в виді збоку. Дає винос, тож кермо тримає прямо, і додає розвалу зовнішньому колесу на повороті керма.') },
  scrubMm: { label: t('Плече обкатки'), unit: mm, digits: 0, step: 1, help: t('Де вісь повороту зустрічає дорогу відносно середини плями. Додатне плече тягне кермо при гальмуванні на різному покритті.') },
  lowerArmMm: { label: t('Нижній важіль'), unit: mm, digits: 0, step: 5, help: t('Довжина нижнього важеля. Що довші важелі, то менше колесо міняє розвал і колію на ході.') },
  upperArmMm: { label: t('Верхній важіль'), unit: mm, digits: 0, step: 5, help: t('Коротший верхній важіль додає від’ємного розвалу на стиску: зовнішнє колесо стоїть рівніше на крені.') },
  upperAngleDeg: { label: t('Нахил верхнього важеля'), unit: deg, digits: 1, step: 0.5, help: t('Нахил верхнього важеля в виді спереду. Разом із нижнім він ставить миттєвий центр, а з ним і центр крену.') },
  lowerPivotZMm: { label: t('Висота внутрішніх опор нижнього важеля'), unit: mm, digits: 0, step: 1, help: t('Опори вище кульової опори піднімають центр крену.') },
  lowerBallZMm: { label: t('Висота нижньої кульової опори'), unit: mm, digits: 0, step: 1, help: t('Висота нижньої кульової опори над дорогою.') },
  upperBallZMm: { label: t('Висота верхньої кульової опори'), unit: mm, digits: 0, step: 1, help: t('Висота верхньої кульової опори над дорогою. Відстань між опорами — це «висота кулака».') },
  svAngleDeg: { label: t('Нахил осей важелів збоку'), unit: deg, digits: 1, step: 0.5, help: t('Нахил осей важелів у виді збоку дає анти-клювання спереду й анти-присідання ззаду.') },
  tieRodDzMm: { label: t('Зсув внутрішнього шарніра тяги'), unit: mm, digits: 0, step: 1, help: t('Висота внутрішнього шарніра рульової тяги або тяги сходження від точки без підрулювання. Кілька міліметрів дають помітне підрулювання на ході.') },
  sweepDeg: { label: t('Кут осі важеля'), unit: deg, digits: 0, step: 1, help: t('Кут осі косого важеля до поперечної осі авто: 0° поздовжній важіль, 90° хитний міст.') },
  pivotArmMm: { label: t('Довжина важеля'), unit: mm, digits: 0, step: 5, help: t('Відстань від осі важеля до центра колеса вздовж авто.') },
  pivotYMm: { label: t('Внутрішня опора від осі авто'), unit: mm, digits: 0, step: 5, help: t('Де вісь важеля перетинає поздовжню площину: від неї залежить, наскільки колесо міняє розвал.') },
  pivotDzMm: { label: t('Опора над центром колеса'), unit: mm, digits: 0, step: 5, help: t('Висота осі важеля над центром колеса. Вища вісь піднімає центр крену.') },
  pivotSvDeg: { label: t('Нахил осі збоку'), unit: deg, digits: 1, step: 0.5, help: t('Нахил осі важеля в виді збоку: дає підрулювання на ході й анти-ефекти.') },
  beamPos: { label: t('Положення балки'), unit: '%', scale: 100, digits: 0, step: 1, help: t('Де балка з’єднує важелі: 0 біля опор, 100 % на осі коліс. Ближче до коліс — більше схожа на нерозрізний міст.') },
  shearDzMm: { label: t('Центр згину балки над лінією опор'), unit: mm, digits: 0, step: 5, help: t('Висота центра згину перерізу балки. Від нього залежить, як колеса підрулюють на крені.') },
  beamArmMm: { label: t('Довжина важелів балки'), unit: mm, digits: 0, step: 5, help: t('Відстань від опори до центра колеса.') },
  beamBushInMm: { label: t('Опора балки всередину від колеса'), unit: mm, digits: 0, step: 5, help: t('Наскільки опори балки стоять ближче до осі авто, ніж колеса.') },
  beamBushDzMm: { label: t('Опора балки над центром колеса'), unit: mm, digits: 0, step: 5, help: t('Висота опори над центром колеса. Вища опора піднімає центр крену й дає анти-ефект.') },
  beamTorsionNmRad: { label: t('Жорсткість балки на скручування'), unit: t('Н·м/рад'), digits: 0, step: 100, help: t('Балка, що скручується, працює як стабілізатор.') },
  rockerRatio: { label: t('Плечі коромисла'), unit: '', digits: 2, step: 0.01, help: t('Плече до пружини, поділене на плече до штовхача. Більше число — м’якша пружина на колесі.') },
  rockerProgressionDeg: { label: t('Прогресія коромисла'), unit: deg, digits: 0, step: 1, help: t('Наскільки плече до пружини не дотягує до прямого кута: пружина на колесі твердне на стиску.') },
  thirdSpringNmm: { label: t('Третя пружина'), unit: t('Н/мм'), digits: 0, step: 1, help: t('Пружина між коромислами працює лише коли обидва колеса стискаються разом: тримає висоту, а крену не заважає.') },
  solidLateral: { label: t('Поперечна тяга моста'), unit: '', digits: 0, step: 1, help: t('Що тримає міст поперек: тяга Панара, механізм Ватта, косі тяги або самі ресори.') },
  solidLinks: { label: t('Поздовжні тяги'), unit: '', digits: 0, step: 1, help: t('Дві пари тяг або нижня пара з однією верхньою.') },
  lowerLinkMm: { label: t('Нижні тяги'), unit: mm, digits: 0, step: 5, help: t('Довжина нижніх поздовжніх тяг.') },
  upperLinkMm: { label: t('Верхні тяги'), unit: mm, digits: 0, step: 5, help: t('Довжина верхніх поздовжніх тяг.') },
  linkAngleDeg: { label: t('Нахил нижніх тяг'), unit: deg, digits: 1, step: 0.5, help: t('Нахил нижніх тяг у виді збоку: дає анти-присідання й підрулювання моста на крені.') },
  upperLinkAngleDeg: { label: t('Нахил верхніх тяг'), unit: deg, digits: 1, step: 0.5, help: t('Нахил верхніх тяг у виді збоку.') },
  lateralZMm: { label: t('Висота поперечної тяги'), unit: mm, digits: 0, step: 5, help: t('Центр крену моста лежить на висоті тяги Панара або осі механізму Ватта.') },
  diffOutputYMm: { label: t('Вихід диференціала від осі авто'), unit: mm, digits: 0, step: 5, help: t('Де стоїть внутрішній ШРУС. Коротша піввісь ламається на більший кут на ході.') },
  diffOutputDzMm: { label: t('Вихід диференціала над центром колеса'), unit: mm, digits: 0, step: 5, help: t('Висота внутрішнього ШРУСа відносно центра колеса.') },
  camberDeg: { label: t('Розвал у статиці'), unit: deg, digits: 2, step: 0.05, help: t('Від’ємний розвал нахиляє верх колеса до кузова. Зовнішнє колесо на крені тоді стоїть рівніше до дороги.') },
  toeDeg: { label: t('Сходження в статиці'), unit: deg, digits: 2, step: 0.01, help: t('Додатне сходження повертає перед колеса до середини авто. Тримає прямо, але коштує опору кочення.') },
  springNmm: { label: t('Жорсткість пружини'), unit: t('Н/мм'), digits: 0, step: 0.01, log: true, help: t('Жорсткість уздовж пружини. Типова дає кузову звичайну частоту для цієї маси й важелів.') },
  springKind: { label: t('Пружний елемент'), unit: '', digits: 0, step: 1, help: t('Пневмоподушка й гідропневматика тримають висоту з вантажем і твердішають із тиском.') },
  damper: { label: t('Амортизатор'), unit: '', digits: 0, step: 1, help: t('Пресет задає ступінь демпфування на колесі; «Свій» відкриває коефіцієнти.') },
  damperCompression: { label: t('Стиск до перелому'), unit: t('Н·с/м'), digits: 0, step: 50, help: t('Опір амортизатора на стиску на малій швидкості штока.') },
  damperRebound: { label: t('Відбій до перелому'), unit: t('Н·с/м'), digits: 0, step: 50, help: t('Опір на відбої. Зазвичай він у два-три рази більший за стиск.') },
  damperKneeMs: { label: t('Перелом характеристики'), unit: t('м/с'), digits: 2, step: 0.01, help: t('Швидкість штока, після якої клапани відкриваються і характеристика стає положистішою.') },
  damperHighRatio: { label: t('Нахил після перелому'), unit: '', digits: 2, step: 0.05, help: t('Частка нахилу до перелому. Менше одиниці — амортизатор м’якшає на ударах.') },
  barMm: { label: t('Діаметр стабілізатора'), unit: mm, digits: 0, step: 1, help: t('Стабілізатор тримає крен і переносить вагу на цій осі. Товстий передній дає недостатню поворотність.') },
  barWallMm: { label: t('Стінка порожнистого стабілізатора'), unit: mm, digits: 1, step: 0.5, help: t('0 — суцільний пруток. Труба легша й трохи м’якша.') },
  barArmMm: { label: t('Плече стабілізатора'), unit: mm, digits: 0, step: 5, help: t('Довше плече робить той самий стабілізатор м’якшим.') },
  unsprungKg: { label: t('Непідресорена маса кута'), unit: kg, digits: 0, step: 1, help: t('Колесо, гальмо, кулак і частина важелів. Що легше, то краще колесо тримає дорогу на нерівностях.') },
  tyreWidthMm: { label: t('Ширина шини'), unit: mm, digits: 0, step: 5, help: t('Ширина профілю шини.') },
  tyreAspect: { label: t('Висота профілю'), unit: '%', digits: 0, step: 5, help: t('Висота боковини як частка ширини.') },
  rimIn: { label: t('Діаметр колісного диска'), unit: '″', digits: 0, step: 1, help: t('Більший диск лишає більше місця гальму й кульовим опорам.') },
  brakeInboard: { label: t('Гальма біля диференціала'), unit: '', digits: 0, step: 1, help: t('Гальмо на виході диференціала зменшує непідресорену масу, а момент іде через піввісь.') },
  steeringGear: { label: t('Рульовий механізм'), unit: '', digits: 0, step: 1, help: t('Рейка, або черв’як-ролик і кульова гайка із сошкою.') },
  rackMmPerRev: { label: t('Хід рейки на оберт керма'), unit: mm, digits: 0, step: 1, help: t('Більший хід на оберт — гостріше кермо й менше обертів від упору до упору.') },
  boxRatio: { label: t('Передатне число механізму'), unit: '', digits: 1, step: 0.5, help: t('Кут керма на кут сошки.') },
  variableRatio: { label: t('Змінне передатне число'), unit: '', digits: 2, step: 0.05, help: t('У скільки разів механізм гостріший біля упору, ніж у нулі. 1 — стале число.') },
  assist: { label: t('Підсилювач'), unit: '', digits: 0, step: 1, help: t('Без підсилювача кермо важке на місці; підсилювач знімає більшу частину зусилля.') },
  ackermann: { label: t('Частка Аккермана'), unit: '%', scale: 100, digits: 0, step: 1, help: t('Наскільки внутрішнє колесо повертає більше за зовнішнє: 100 % — обидва котяться навколо одного центра.') },
  dragLinkDeg: { label: t('Нахил поздовжньої тяги'), unit: deg, digits: 1, step: 0.5, help: t('Нахил тяги від сошки до кулака в виді спереду. Коли він не збігається з тягою Панара, міст підрулює на ході.') },
};

/** Names of a choice's values. */
const OPTIONS: Record<string, () => Record<string, string>> = {
  drive: () => ({ fwd: t('Передній'), rwd: t('Задній'), awd: t('Повний') }),
  tyre: () => ({ street: t('Дорожні'), semi: t('Напівсліки'), slick: t('Сліки'), classic: t('Класичні вузькі') }),
  dampers: () => ({ passive: t('Пасивні'), adaptive: t('Адаптивні'), magneride: 'MagneRide', active: t('Активні') }),
  layout: () => ({
    macpherson: t('Стійка Макферсон'),
    'double-wishbone': t('Подвійні важелі'),
    multilink: t('Багаторичажна'),
    pushrod: t('Штовхач і коромисло'),
    'trailing-arm': t('Поздовжні важелі'),
    'semi-trailing': t('Косі важелі'),
    'swing-axle': t('Хитний міст'),
    'twist-beam': t('Скручувана балка'),
    'live-axle': t('Нерозрізний міст'),
    'de-dion': t('Де Діон'),
  }),
  knuckle: () => ({ plain: t('Звичайний'), 'dual-axis': t('На двох осях'), revoknuckle: 'RevoKnuckle' }),
  solidLateral: () => ({ panhard: t('Тяга Панара'), watt: t('Механізм Ватта'), triangulated: t('Косі тяги'), leaf: t('Ресори') }),
  solidLinks: () => ({ four: t('Чотири'), three: t('Три') }),
  springKind: () => ({ coil: t('Сталева'), air: t('Пневмоподушка'), hydro: t('Гідропневматика') }),
  damper: () => ({ worn: t('Зношений'), comfort: t('Комфорт'), sport: t('Спорт'), track: t('Трек'), custom: t('Свій') }),
  steeringGear: () => ({ rack: t('Рейка'), 'worm-roller': t('Черв’як-ролик'), 'recirculating-ball': t('Кульова гайка') }),
  assist: () => ({
    none: t('Немає'),
    hydraulic: t('Гідравлічний'),
    'electro-hydraulic': t('Електрогідравлічний'),
    'electric-column': t('Електро на колонці'),
    'electric-pinion': t('Електро на шестерні'),
    'electric-rack': t('Електро на рейці'),
    'by-wire': t('Кермо по дроту'),
  }),
};

/** The name of a choice's value; the value itself when it has none. */
export function optionLabel(bare: string, value: string | number): string {
  return OPTIONS[bare]?.()[String(value)] ?? String(value);
}

/** Why a limit sits where it does, for the line under a slider at its end. */
export function limitText(reason: LimitReason): string {
  return {
    subframe: t('важіль не довший за пів колії мінус місце для підрамника'),
    'arm-ratio': t('верхній важіль від 0,4 до 1,2 нижнього'),
    rim: t('кульові опори всередині обода, з зазором до гальма'),
    ground: t('опори над дорогою'),
    'tyre-size': t('шина від 0,5 до 0,85 м заввишки'),
    halfshaft: t('вихід диференціала не ближче 60 мм до осі авто й з місцем для піввісі'),
    'ride-frequency': t('частота кузова від 0,6 до 6 Гц'),
    unsprung: t('кути досить легкі, щоб авто стояло на пружинах'),
    'no-adjuster': t('у хитного моста немає регулювання'),
    'layout-fixed': t('кут осі задає сама компоновка'),
    'bar-wall': t('стінка тонша за половину діаметра'),
    'drag-link': t('поздовжня тяга не крутіша за 25°'),
  }[reason];
}

export type GroupId = 'car' | 'tyres' | 'layout' | 'geometry' | 'alignment' | 'spring' | 'damper' | 'bar' | 'wheels' | 'steering' | 'shafts';

export interface ParamGroup {
  id: GroupId;
  title: string;
  /** 'car' groups hold car keys; 'axle' groups bare axle keys, shown for the end the panel shows. */
  scope: 'car' | 'axle';
  keys: readonly string[];
}

export const GROUPS: readonly ParamGroup[] = [
  { id: 'car', title: t('Автомобіль'), scope: 'car', keys: ['massKg', 'frontShare', 'cgHeightMm', 'wheelbaseMm', 'drive', 'driveFront', 'brakeFront', 'finalDrive'] },
  { id: 'tyres', title: t('Шини й амортизатори'), scope: 'car', keys: ['tyre', 'dampers'] },
  { id: 'layout', title: t('Компоновка'), scope: 'axle', keys: ['layout', 'knuckle', 'solidLateral', 'solidLinks'] },
  {
    id: 'geometry',
    title: t('Геометрія'),
    scope: 'axle',
    keys: [
      'trackMm', 'kingpinOffsetMm', 'kpiDeg', 'casterDeg', 'scrubMm', 'lowerArmMm', 'upperArmMm', 'upperAngleDeg', 'lowerPivotZMm',
      'lowerBallZMm', 'upperBallZMm', 'svAngleDeg', 'tieRodDzMm', 'sweepDeg', 'pivotArmMm', 'pivotYMm', 'pivotDzMm', 'pivotSvDeg',
      'beamPos', 'shearDzMm', 'beamArmMm', 'beamBushInMm', 'beamBushDzMm', 'beamTorsionNmRad', 'lowerLinkMm', 'upperLinkMm',
      'linkAngleDeg', 'upperLinkAngleDeg', 'lateralZMm',
    ],
  },
  { id: 'alignment', title: t('Регулювання'), scope: 'axle', keys: ['camberDeg', 'toeDeg'] },
  { id: 'spring', title: t('Пружина'), scope: 'axle', keys: ['springNmm', 'springKind', 'rockerRatio', 'rockerProgressionDeg', 'thirdSpringNmm'] },
  { id: 'damper', title: t('Амортизатор'), scope: 'axle', keys: ['damper', 'damperCompression', 'damperRebound', 'damperKneeMs', 'damperHighRatio'] },
  { id: 'bar', title: t('Стабілізатор'), scope: 'axle', keys: ['barMm', 'barWallMm', 'barArmMm'] },
  { id: 'wheels', title: t('Колеса й гальма'), scope: 'axle', keys: ['tyreWidthMm', 'tyreAspect', 'rimIn', 'unsprungKg', 'brakeInboard'] },
  { id: 'steering', title: t('Кермо'), scope: 'axle', keys: ['steeringGear', 'rackMmPerRev', 'boxRatio', 'variableRatio', 'assist', 'ackermann', 'dragLinkDeg'] },
  { id: 'shafts', title: t('Піввісі'), scope: 'axle', keys: ['diffOutputYMm', 'diffOutputDzMm'] },
];
