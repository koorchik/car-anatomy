// Every control on the designer's panel: what it changes, its unit, and in plain words what it does to the engine.

import { cylinderChoices, type NumericKey } from '../../designer/constraints.ts';
import { effectiveOpen, effectivePops, effectiveRasp, isBoosted, isRotary, isTurbo, type Design } from '../../designer/design.ts';
import { FUELS, type FuelId } from '../../designer/fuels.ts';
import type { Performance } from '../../designer/physics.ts';
import { FUEL_SYSTEM_NAMES, fuelSystemsFor, shownSystems } from '../../designer/systems.ts';
import { derivedDesignOilL, effectiveSump } from '../../designer/lubrication.ts';
import { lubricationFigures } from '../../designer/lubrication-figures.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';

export interface NumberParam {
  kind: 'number';
  key: NumericKey;
  label: string;
  unit: string;
  step: number;
  /** Decimal places shown. */
  digits?: number;
  /** Fraction shown as percent. */
  percent?: boolean;
  /** Slider moves on a log scale, for ranges spanning decades. */
  log?: boolean;
  /** For optional fields: what to show while the field itself is null. */
  shown?: (d: Design) => number;
  /** Changes only this, not the engine's figures. Said plainly so no control seems broken. */
  only?: 'sound' | 'looks';
  help: string;
  applies?: (d: Design) => boolean;
}

export interface ChoiceParam {
  kind: 'choice';
  key: 'layout' | 'cylinders' | 'pistonMaterial' | 'rodMaterial' | 'blockMaterial' | 'crankPreset' | 'balanceShafts' | 'valvetrain' | 'valvesPerCyl' | 'charger' | 'fuel' | 'collector' | 'muffler' | 'blowoff'
    | 'fuelSystem' | 'cooling' | 'oilCooler' | 'ignition' | 'oilPump' | 'sparkPlugs' | 'sump';
  label: string;
  /** Options, or a function when they depend on the rest of the design. */
  options: Array<[string | number, string]> | ((d: Design) => Array<[string | number, string]>);
  help: string;
  /** Set when the choice changes nothing but the sound, or nothing but the systems layers. */
  only?: 'sound' | 'looks';
  /** For optional fields: what to show while the field itself is null. */
  shown?: (d: Design) => string | number;
  applies?: (d: Design) => boolean;
  /** Dropdown instead of buttons, when options won't fit in a row. */
  select?: boolean;
}

export interface ToggleParam {
  kind: 'toggle';
  key: 'catalyst' | 'directInjection' | 'pistonJets' | 'glowPlugs' | 'oilFilter';
  label: string;
  help: string;
  only?: 'looks';
  /** For optional fields: what to show while the field itself is null. */
  shown?: (d: Design) => boolean;
  applies?: (d: Design) => boolean;
}

export interface ColorParam {
  kind: 'color';
  key: 'coverColor';
  label: string;
  help: string;
  shown: (d: Design) => string;
  applies?: (d: Design) => boolean;
  only: 'looks';
}

export type Param = NumberParam | ChoiceParam | ToggleParam | ColorParam;

export interface ParamGroup {
  id: string;
  title: string;
  /** One sentence on why this group matters. */
  intro: string;
  params: Param[];
  /** Figures that follow from this group, computed by the model. */
  readouts?: (d: Design, perf: Performance) => Array<[string, string]>;
  applies?: (d: Design) => boolean;
  /** Extra widget rendered under the controls. */
  widget?: 'crank' | 'pipes' | 'revs';
}

const notRotary = (d: Design): boolean => !isRotary(d);
const notDiesel = (d: Design): boolean => !FUELS[d.fuel].diesel;
const capital = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const rpm = (v: number): string => t('{rpm} об/хв', { rpm: (Math.round(v / 50) * 50).toLocaleString(numberLocale) });

export const PARAM_GROUPS: ParamGroup[] = [
  {
    id: 'layout',
    title: t('Компоновка'),
    intro: t('Як циліндри розташовані навколо вала. Від цього залежать габарити й баланс. Звук формує насамперед вихлоп, тому зміна компоновки ставить типову для неї вихлопну систему.'),
    params: [
      {
        kind: 'choice',
        key: 'layout',
        label: t('Тип'),
        select: true,
        options: [
          ['inline', t('Рядний')],
          ['vee', t('V-подібний')],
          ['boxer', t('Опозитний')],
          ['flatvee', t('Плоский V (180°)')],
          ['vr', t('VR, вузький зигзаг')],
          ['w', t('W, два VR')],
          ['rotary', t('Роторний Ванкеля')],
        ],
        help: t('Рядний простий і вузький. V короткий. В опозитному поршні рухаються назустріч і гасять сили. У плоскому V180 поршні навпроти рухаються разом, бо сидять на одній шийці.'),
      },
      {
        kind: 'choice',
        key: 'cylinders',
        label: t('Кількість'),
        select: true,
        options: (d) => CYLINDER_OPTIONS(d),
        help: t('Більше циліндрів дає рівніший момент і вищі оберти за того самого об’єму, але більше тертя, маси й ціни.'),
      },
      { kind: 'number', key: 'veeAngle', label: t('Кут розвалу'), unit: '°', step: 1, help: t('Кут між рядами. Для рівних спалахів на спільних шийках кут дорівнює 720° поділити на кількість циліндрів. Менший кут робить двигун вужчим.'), applies: (d) => d.layout === 'vee' },
      { kind: 'number', key: 'wAngle', label: t('Кут між блоками W'), unit: '°', step: 1, help: t('Кут між двома вузькими блоками.'), applies: (d) => d.layout === 'w' },
      { kind: 'number', key: 'narrowAngle', label: t('Вузький кут'), unit: '°', step: 1, help: t('Кут між сусідніми циліндрами в зигзагу. Що менший, то компактніша одна спільна головка.'), applies: (d) => d.layout === 'vr' || d.layout === 'w' },
      { kind: 'number', key: 'tilt', label: t('Нахил двигуна'), unit: '°', step: 1, only: 'looks', help: t('Нахил рядного двигуна, щоб опустити капот. На механіку майже не впливає.'), applies: (d) => d.layout === 'inline' },
      { kind: 'choice', key: 'blockMaterial', label: t('Блок'), options: [['aluminium', t('Алюміній')], ['iron', t('Чавун')]], help: t('Алюміній легший, чавун міцніший і дешевший.') },
      { kind: 'color', key: 'coverColor', label: t('Колір кришок'), help: t('На роботу не впливає, зате легко впізнати свій двигун.'), only: 'looks', shown: (d) => d.coverColor ?? '#a81c20' },
    ],
  },
  {
    id: 'rotor',
    title: t('Ротор'),
    intro: t('Замість поршня трикутний ротор. Об’єм камери задають радіус, ексцентриситет і ширина.'),
    applies: isRotary,
    params: [
      { kind: 'number', key: 'rotorR', label: t('Радіус ротора'), unit: t('мм'), step: 1, help: t('Від центра ротора до вершини. Разом з ексцентриситетом задає розмір камери.') },
      { kind: 'number', key: 'rotorE', label: t('Ексцентриситет'), unit: t('мм'), step: 0.5, digits: 1, help: t('Зміщення ротора від осі вала. Більший означає більший об’єм і момент, але ротор важче розводиться з корпусом.') },
      { kind: 'number', key: 'rotorWidth', label: t('Ширина'), unit: t('мм'), step: 1, help: t('Ширша секція дає більший об’єм, але гірше співвідношення поверхні до об’єму.') },
    ],
    readouts: (d) => [['R / e', (d.rotorR / d.rotorE).toFixed(1)]],
  },
  {
    id: 'cylinder',
    title: t('Циліндр і поршень'),
    intro: t('Розміри, які визначають об’єм і те, на яких обертах двигуну комфортно.'),
    applies: notRotary,
    params: [
      { kind: 'number', key: 'bore', label: t('Діаметр циліндра'), unit: t('мм'), step: 0.5, digits: 1, help: t('Більший діаметр вміщує більші клапани, тому двигун краще дихає на верхах. Але важчий поршень і повільніше проходження полум’я підвищують ризик детонації.') },
      { kind: 'number', key: 'stroke', label: t('Хід поршня'), unit: t('мм'), step: 0.5, digits: 1, help: t('Довший хід дає більше моменту внизу, але поршень рухається швидше і раніше впирається в межу обертів.') },
      { kind: 'number', key: 'rodLength', label: t('Довжина шатуна'), unit: t('мм'), step: 1, help: t('Довший шатун менше тисне поршнем на стінку і зменшує вібрації другого порядку, але блок стає вищим.') },
      { kind: 'choice', key: 'pistonMaterial', label: t('Поршень'), options: [['cast', t('Литий')], ['forged', t('Кований')], ['light', t('Полегшений')]], help: t('Кований міцніший, полегшений дозволяє вищі оберти, бо менша сила інерції.') },
      { kind: 'choice', key: 'rodMaterial', label: t('Шатун'), options: [['steel', t('Сталь')], ['titanium', t('Титан')]], help: t('Титан набагато легший, тому шатуни витримують значно вищі оберти.') },
    ],
    readouts: (d, perf) => [
      [t('Хід / діаметр'), (d.stroke / d.bore).toFixed(2)],
      [t('Шатун / хід'), (d.rodLength / d.stroke).toFixed(2)],
      [t('Швидкість поршня на межі'), t('{speed} м/с', { speed: perf.points[perf.points.length - 1]!.pistonSpeed.toFixed(1) })],
      [t('Прискорення поршня'), t('{value} тис. м/с²', { value: Math.round(perf.pistonAccel / 100) / 10 })],
    ],
  },
  {
    id: 'revs',
    title: t('Стиснення і відсічка'),
    intro: t('Відсічка сама по собі двигун не береже. Вона лише каже, де обрізати паливо, а чи витримають деталі, вирішує їхня міцність.'),
    widget: 'revs',
    params: [
      { kind: 'number', key: 'compression', label: t('Ступінь стиснення'), unit: ': 1', step: 0.1, digits: 1, help: t('Вище стиснення дає кращий ККД і момент, але бензин може здетонувати. Дизелю без нього не вистачає тепла, щоб паливо спалахнуло.') },
      { kind: 'number', key: 'rpmLimit', label: t('Відсічка'), unit: t('об/хв'), step: 50, log: true, help: t('Оберти, на яких блок керування обрізає паливо. Сама вона двигун не береже: якщо поставити її вище запасу міцності, він дійде туди й зруйнується.') },
    ],
    readouts: (_d, perf) => [[t('Сам докрутиться до'), rpm(perf.topRpm)]],
  },
  {
    id: 'crank',
    title: t('Колінвал'),
    intro: t('Кути шийок задають порядок спалахів, баланс і ритм звуку. Можна виставити геть будь-які.'),
    applies: notRotary,
    widget: 'crank',
    params: [
      {
        kind: 'choice',
        key: 'crankPreset',
        label: t('Схема'),
        select: true,
        options: [
          ['even', t('Рівні спалахи, найкращий баланс')],
          ['flat', t('Плоский вал')],
          ['cross', t('Хрестовий вал')],
          ['bigbang', t('«Великий удар»')],
          ['custom', t('Власні кути')],
        ],
        help: t('Рівні спалахи підбирають порядок із найменшою вібрацією. Плоский дає рівний ритм у кожному ряді, хрестовий бурчить, а «великий удар» скупчує спалахи докупи.'),
      },
      { kind: 'number', key: 'flywheelKg', label: t('Маховик'), unit: t('кг'), step: 0.5, digits: 1, help: t('Важкий маховик згладжує оберти між спалахами, особливо на малій кількості циліндрів, але двигун повільніше реагує на газ.') },
      { kind: 'choice', key: 'balanceShafts', label: t('Балансирні вали'), options: [[0, t('Немає')], [1, t('Один')], [2, t('Два')]], help: t('Один гасить коливання першого порядку, два ще й другого. Вони ж забирають трохи потужності й додають масу.') },
    ],
  },
  {
    id: 'valves',
    title: t('Клапани і фази'),
    intro: t('Двигун є повітряним насосом: скільки він вдихне, стільки палива зможе спалити.'),
    applies: notRotary,
    params: [
      { kind: 'choice', key: 'valvetrain', label: t('Привод'), options: [['dohc', t('Два вали')], ['sohc', t('Один вал')], ['ohv', t('Штанги')]], help: t('Два вали у головці дають найкращі оберти. Штовхачі роблять двигун нижчим і простішим, але їхня маса раніше обмежує оберти.') },
      {
        kind: 'choice',
        key: 'valvesPerCyl',
        label: t('Клапанів на циліндр'),
        options: (d) => (d.valvetrain === 'dohc' ? [[2, '2'], [3, '3'], [4, '4'], [5, '5']] : [[2, '2'], [3, '3'], [4, '4']]),
        help: t('Більше клапанів дає більшу площу прохідного перерізу, але кожен із них менший, а головка складніша.'),
      },
      { kind: 'number', key: 'intakeValve', label: t('Впускний клапан'), unit: t('мм'), step: 0.5, digits: 1, help: t('Більша площа впуску дає двигуну дихати на вищих обертах.') },
      { kind: 'number', key: 'exhaustValve', label: t('Випускний клапан'), unit: t('мм'), step: 0.5, digits: 1, help: t('Зазвичай менший за впускний, бо гарячі гази виходять під тиском.') },
      { kind: 'number', key: 'lift', label: t('Підйом клапана'), unit: t('мм'), step: 0.25, digits: 2, help: t('Понад чверть діаметра клапана виграш уже малий, а пружині стає важче.') },
      { kind: 'number', key: 'intakeDuration', label: t('Фаза впуску'), unit: '°', step: 1, help: t('Довша фаза наповнює циліндр на високих обертах, але на низьких частина заряду виштовхується назад.') },
      { kind: 'number', key: 'exhaustDuration', label: t('Фаза випуску'), unit: '°', step: 1, help: t('Як довго відкритий випускний клапан.') },
      { kind: 'number', key: 'lobeSeparation', label: t('Кут між кулачками'), unit: '°', step: 1, help: t('Менший кут дає більше перекриття клапанів: сильніший момент у вузькому діапазоні й нерівний холостий хід.') },
      { kind: 'number', key: 'springForce', label: t('Сила пружини'), unit: t('Н'), step: 10, help: t('Сильніша пружина утримує клапан на вищих обертах, зате додає тертя.') },
    ],
    readouts: (_d, perf) => [
      [t('Перекриття клапанів'), `${Math.round(perf.events.overlap)}°`],
      [t('Закриття впуску після НМТ'), `${Math.round(perf.events.ivcAbdc)}°`],
      [t('Індекс Маха на межі'), perf.points[perf.points.length - 1]!.machIndex.toFixed(2)],
      [t('Клапани зависають після'), Number.isFinite(perf.floatRpm) ? rpm(perf.floatRpm) : t('немає')],
      [t('Зазор клапан-поршень'), t('{value} мм', { value: perf.valveClearance.toFixed(1) })],
    ],
  },
  {
    id: 'intake',
    title: t('Впуск'),
    intro: t('Довжина патрубка працює як настройка духового інструмента: тиск сам допомагає наповненню.'),
    params: [
      { kind: 'number', key: 'runnerLength', label: t('Довжина патрубка'), unit: t('мм'), step: 5, log: true, help: t('Довгий патрубок налаштований на нижчі оберти, короткий на вищі.') },
      { kind: 'number', key: 'runnerDia', label: t('Діаметр патрубка'), unit: t('мм'), step: 1, help: t('Вузький дає сильнішу хвилю і гарний низ, але на верхах душить. У роторному двигуні це ще й розмір порту.') },
    ],
    readouts: (_d, perf) => [[t('Настройка впуску'), rpm(perf.intakeTuneRpm)]],
  },
  {
    id: 'charger',
    title: t('Наддув'),
    intro: t('Більше повітря означає більше палива. Турбіна бере енергію з випуску, нагнітач із вала.'),
    params: [
      {
        kind: 'choice',
        key: 'charger',
        label: t('Тип'),
        select: true,
        options: [
          ['none', t('Атмосферний')],
          ['turbo', t('Одна турбіна')],
          ['twinturbo', t('Дві турбіни')],
          ['quadturbo', t('Чотири турбіни')],
          ['roots', t('Об’ємний нагнітач (Roots)')],
          ['centrifugal', t('Відцентровий нагнітач')],
        ],
        help: t('Об’ємний нагнітач тисне вже на низах і помітно гріє повітря. Відцентровий набирає тиск з обертами. Турбіна майже безкоштовна щодо потужності, але спершу має розкрутитися.'),
      },
      { kind: 'number', key: 'boostBar', label: t('Наддув'), unit: t('бар'), step: 0.05, digits: 2, help: t('Надлишковий тиск у впуску. Більше тиску дає більше моменту, але різко підвищує навантаження і ризик детонації.'), applies: isBoosted },
      { kind: 'number', key: 'turboSizeHp', label: t('Турбіна розрахована на'), unit: t('к.с.'), step: 5, log: true, help: t('Мала турбіна розкручується рано і душить на верхах. Велика запізнюється, але дає більше зверху.'), applies: isTurbo },
      { kind: 'number', key: 'intercooler', label: t('Інтеркулер'), unit: '%', step: 0.01, percent: true, help: t('Охолоджує стиснене повітря, робить його щільнішим і знижує ризик детонації. Нуль означає, що його немає.'), applies: isBoosted },
      { kind: 'number', key: 'turboWhine', label: t('Чутність свисту турбіни'), unit: '%', step: 0.01, percent: true, only: 'sound', applies: isTurbo, help: t('Скільки свисту турбіни доходить до вуха. Заводський впуск із коробом фільтра ховає більшу частину, відкритий фільтр робить свист гучним. Потужності не змінює.') },
      {
        kind: 'choice',
        key: 'blowoff',
        label: t('Скид тиску при закритті дроселя'),
        only: 'sound',
        applies: (d) => isTurbo(d) && d.fuel !== 'diesel',
        options: [['recirculated', t('Назад у впуск')], ['soft', t('Тихий')], ['vented', t('В атмосферу')]],
        help: t('Коли дросель закривається, стиснутому повітрю треба кудись подітись. Більшість заводських турбомоторів повертають його у впуск, тому пшику не чути. Клапан в атмосферу дає той самий гучний пшик, але таке майже не буває на заводських авто.'),
      },
    ],
    readouts: (d, perf) =>
      isBoosted(d)
        ? [
            [t('Наддув на піку потужності'), t('{value} бар', { value: perf.peakPower.boostBar.toFixed(2) })],
            [t('Протитиск там само'), t('{value} бар', { value: perf.peakPower.backpressureBar.toFixed(2) })],
            [t('Наддув з’являється'), spoolText(d, perf)],
          ]
        : [],
  },
  {
    id: 'fuel',
    title: t('Паливо і запалювання'),
    intro: t('Яке паливо, скільки його і коли запалити. Від цього залежать потужність, витрата і детонація.'),
    params: [
      {
        kind: 'choice',
        key: 'fuel',
        label: t('Паливо'),
        select: true,
        options: (Object.keys(FUELS) as FuelId[]).map((id) => [id, FUELS[id].name]),
        help: t('Вищий октан стійкіший до детонації. E85 і метанол енергетично бідніші, тому витрачаються у рази швидше, зате охолоджують заряд. Дизель спалахує від стиснення.'),
      },
      { kind: 'number', key: 'lambda', label: t('Склад суміші λ'), unit: '', step: 0.01, digits: 2, help: t('Менше 1 означає багату суміш, більше 1 бідну. Найбільша потужність близько 0,88, найкраща економія близько 1,05. Дизель працює бідно завжди.') },
      { kind: 'number', key: 'ignitionOffset', label: t('Запалювання від оптимуму'), unit: '°', step: 1, help: t('Плюс означає раніше, мінус пізніше. Далі від оптимуму момент падає. Раннє запалювання підвищує тиск і детонацію.') },
      { kind: 'toggle', key: 'directInjection', label: t('Безпосереднє упорскування'), help: t('Паливо подається прямо в циліндр. Заряд холодніший, суміш менше часу проводить під тиском, тому можна більше стиснення. Насос забирає трохи потужності.') },
      {
        kind: 'choice',
        key: 'fuelSystem',
        label: t('Подача палива'),
        select: true,
        only: 'looks',
        applies: (d) => fuelSystemsFor(d).length > 1,
        options: (d) => fuelSystemsFor(d).map((f) => [f, capital(FUEL_SYSTEM_NAMES[f])]),
        shown: (d) => shownSystems(d).fuelSystem,
        help: t('Яке саме обладнання подає паливо: карбюратор, форсунки в каналах чи в циліндрах, насос-форсунки дизеля. Видно в шарі палива в рентгені. Модель потужності знає лише, чи упорскування безпосереднє.'),
      },
      {
        kind: 'choice',
        key: 'ignition',
        label: t('Запалювання'),
        only: 'looks',
        applies: notDiesel,
        options: [['coil-on-plug', t('Котушка на свічці')], ['wasted-spark', t('Холоста іскра')], ['distributor', t('Розподільник')]],
        shown: (d) => shownSystems(d).ignition,
        help: t('Окрема котушка над кожною свічкою, одна котушка на пару циліндрів, яка іскрить в обох щоразу, або одна котушка з розподільником, що роздає іскру дротами. Видно в шарі палива. У моделі потужності не враховано.'),
      },
      { kind: 'choice', key: 'sparkPlugs', label: t('Свічок на циліндр'), only: 'looks', applies: (d) => notDiesel(d) && notRotary(d), options: [[1, '1'], [2, '2']], shown: (d) => shownSystems(d).sparkPlugs, help: t('Дві свічки підпалюють суміш з двох боків, і полум\'я швидше проходить велику камеру. Так роблять у великих циліндрах і на старих авіаційних та гоночних двигунах. Видно в шарі палива. У моделі потужності не враховано.') },
      { kind: 'toggle', key: 'glowPlugs', label: t('Свічки розжарювання'), only: 'looks', applies: (d) => !notDiesel(d), shown: (d) => shownSystems(d).glowPlugs, help: t('Розжарені стрижні в камерах допомагають холодному дизелю запуститися, поки стиснення ще не гріє повітря досить. Видно в шарі палива. У моделі потужності не враховано.') },
    ],
    readouts: (d, perf) => {
      const worst = perf.points.reduce((a, b) => (b.knockRetard > a.knockRetard ? b : a), perf.points[0]!);
      return FUELS[d.fuel].diesel
        ? [[t('Нагрів при холодному пуску'), `${Math.round(perf.coldCompressionK - 273)} °C`]]
        : [
            [t('Найбільший відкат запалювання'), worst.knockRetard > 0 ? t('{deg}° на {rpm}', { deg: worst.knockRetard, rpm: rpm(worst.rpm) }) : t('немає')],
            [t('Найвищий тиск у циліндрі'), t('{value} бар', { value: Math.round(perf.points.reduce((a, b) => Math.max(a, b.peakPressureBar), 0)) })],
          ];
    },
  },
  {
    id: 'cooling',
    title: t('Охолодження і мащення'),
    intro: t('Як двигун позбувається тепла і як олива доходить до підшипників. Усе це видно в шарах оливи й охолодження в рентгені. На цифри двигуна впливають лише картер і кількість оливи.'),
    params: [
      { kind: 'choice', key: 'cooling', label: t('Охолодження'), only: 'looks', applies: notRotary, options: [['liquid', t('Рідина')], ['fan', t('Вентилятор')], ['ram', t('Набігаючий потік')]], shown: (d) => shownSystems(d).cooling, help: t('Рідина відводить тепло від сорочки в радіатор. Повітряний двигун має ребра на циліндрах і головках, і їх обдуває вентилятор або, як на мотоциклі, зустрічний потік. Видно в шарі охолодження.') },
      { kind: 'choice', key: 'oilCooler', label: t('Оливний радіатор'), only: 'looks', options: [['none', t('Немає')], ['coolant', t('У рідину')], ['air', t('У повітря')]], shown: (d) => shownSystems(d).oilCooler, help: t('Теплообмінник віддає тепло оливи охолоджувальній рідині, а радіатор у потоці повітря віддає його прямо повітрю. Двигунам з турбіною, дизелям і повітряним він потрібен найбільше. Видно в шарі оливи.') },
      { kind: 'toggle', key: 'pistonJets', label: t('Охолодження поршнів оливою'), only: 'looks', applies: notRotary, shown: (d) => shownSystems(d).pistonJets, help: t('Форсунки знизу циліндрів бризкають оливою на днище поршня і забирають тепло. Потрібні двигунам з наддувом і дизелям. Видно в шарі оливи: тиск після їх відкриття росте повільніше. У моделі потужності не враховано.') },
      { kind: 'choice', key: 'oilPump', label: t('Привід оливного насоса'), only: 'looks', applies: notRotary, options: [['crank', t('Від колінвала')], ['chain', t('Ланцюгом')], ['shaft', t('Валиком')]], shown: (d) => shownSystems(d).oilPump, help: t('Насос на носку колінвала крутиться з ним разом. Насос у піддоні приводить окремий ланцюг або валик від розподільчого чи допоміжного вала. Видно в шарі оливи.') },
      { kind: 'toggle', key: 'oilFilter', label: t('Повнопотоковий оливний фільтр'), only: 'looks', shown: (d) => shownSystems(d).oilFilter, help: t('Уся олива від насоса проходить крізь паперовий фільтр. Старі двигуни, як Beetle, мали лише сітку на забірнику. Видно в шарі оливи.') },
      {
        kind: 'choice',
        key: 'sump',
        label: t('Картер'),
        applies: notRotary,
        options: [['wet', t('Мокрий')], ['baffled', t('З перегородками')], ['integrated-dry', t('Інтегрований сухий')], ['dry', t('Сухий')]],
        shown: effectiveSump,
        help: t('Як олива повертається до насоса. Сухий картер дає мілкий піддон і нижчий колінвал, менше втрат на розбризкування оливи, але важчий. Мокрий найпростіший, але на треку забірник може опинитися над оливою. Перегородки й відкачування головок тримають оливу біля забірника.'),
      },
      { kind: 'number', key: 'oilL', label: t('Олива'), unit: t('л'), step: 0.1, digits: 1, shown: derivedDesignOilL, applies: notRotary, help: t('Більше оливи дає глибший піддон: колінвал стоїть вище, зате на виражах забірнику є з чого брати. У сухого картера олива живе в баку, тому висота від неї не залежить.') },
    ],
    readouts: (d) => {
      if (isRotary(d)) return [];
      const lube = lubricationFigures(d);
      const rows: Array<[string, string]> = [[t('Колінвал над дном піддона'), t('{mm} мм', { mm: Math.round(lube.crankHeightMm) })]];
      if (lube.tankL !== null) rows.push([t('Бак оливи'), t('{litres} л', { litres: lube.tankL.toLocaleString(numberLocale, { maximumFractionDigits: 1 }) })]);
      else rows.push([t('Оливи в піддоні'), t('{litres} л', { litres: lube.panOilL.toLocaleString(numberLocale, { maximumFractionDigits: 1 }) })]);
      if (lube.massKg > 0) rows.push([t('Маса мащення'), t('+{kg} кг', { kg: lube.massKg.toLocaleString(numberLocale, { maximumFractionDigits: 1 }) })]);
      return rows;
    },
  },
  {
    id: 'exhaust',
    title: t('Вихлопна система'),
    intro: t('Вона впливає на потужність через протитиск і настройку, і саме вона майже повністю формує звук.'),
    widget: 'pipes',
    params: [
      { kind: 'number', key: 'headerLength', label: t('Довжина первинних труб'), unit: t('мм'), step: 10, log: true, help: t('Хвиля розрідження повертається до клапана і допомагає витягнути гази. Довгі труби налаштовані на нижчі оберти. Ще довжина змінює висоту звуку.') },
      { kind: 'number', key: 'headerDia', label: t('Діаметр первинних труб'), unit: t('мм'), step: 1, help: t('Вузькі труби тримають швидкість газів і момент внизу, широкі менше душать на верхах.') },
      { kind: 'number', key: 'headerSpread', label: t('Різниця довжин труб'), unit: '%', step: 0.01, percent: true, only: 'sound', help: t('Труби різної довжини зсувають імпульси в часі. Саме так Subaru отримує своє бурчання при рівних спалахах.') },
      {
        kind: 'choice',
        key: 'collector',
        label: t('Збірник'),
        options: (d) => (['vee', 'flatvee', 'boxer', 'w'].includes(d.layout) ? [['single', t('Один')], ['bybank', t('На кожен ряд')]] : [['single', t('Один')]]),
        help: t('Окрема труба на ряд дає менший протитиск, а кожен канал отримує власний ритм спалахів. Зі спільним збірником і рівними спалахами звук майже не залежить від компоновки: у трубу приходять ті самі імпульси.'),
      },
      { kind: 'number', key: 'pipeDia', label: t('Діаметр труби'), unit: t('мм'), step: 1, help: t('Занадто вузька душить верхи. Дивись на протитиск нижче.') },
      { kind: 'number', key: 'pipeLength', label: t('Довжина труби'), unit: t('мм'), step: 50, log: true, help: t('Трохи додає опору. Більше впливає на тон звуку, ніж на потужність.') },
      { kind: 'toggle', key: 'catalyst', label: t('Каталізатор'), help: t('Очищає гази, але додає опору потоку.') },
      { kind: 'choice', key: 'muffler', label: t('Глушник'), options: [['road', t('Дорожній')], ['sport', t('Спортивний')], ['open', t('Прямоток')]], help: t('Прямоток дає найменше втрат і найбільше шуму. Вибір типу ставить типову для нього відкритість і різкість.') },
      { kind: 'number', key: 'mufflerOpen', label: t('Відкритість глушника'), unit: '%', step: 0.01, percent: true, shown: effectiveOpen, help: t('Плавне налаштування замість трьох типів. Що більше відкрито, то менший опір і гучніший, яскравіший звук.') },
      { kind: 'number', key: 'rasp', label: t('Різкість звуку'), unit: '%', step: 0.01, percent: true, only: 'sound', shown: effectiveRasp, help: t('Наскільки хрипить вихлоп на великому газі. Потужності не змінює.') },
      { kind: 'number', key: 'pops', label: t('Прострели при скиданні газу'), unit: '%', step: 0.01, percent: true, only: 'sound', shown: effectivePops, applies: (d) => d.fuel !== 'diesel', help: t('Дорожній двигун на скиданні газу перекриває паливо, тому в трубі нема чому спалахувати. Прострели з’являються, коли блок керування навмисно лишає паливо, як у спортивних режимах, або на гоночних і старих карбюраторних моторах. Потужності не змінює.') },
    ],
    readouts: (d, perf) => [
      [t('Настройка випуску'), isTurbo(d) ? t('гасить турбіна') : rpm(perf.exhaustTuneRpm)],
      [t('Протитиск на піку'), t('{value} бар', { value: perf.peakPower.backpressureBar.toFixed(2) })],
    ],
  },
];

const CYLINDER_OPTIONS = (d: Design): Array<[number, string]> => {
  const list = CYLINDER_CHOICES(d);
  return list.map((n) => [n, isRotary(d) ? (n === 1 ? t('1 секція') : t('{n} секції', { n })) : String(n)]);
};

const CYLINDER_CHOICES = (d: Design): number[] => cylinderChoices(d.layout);

const spoolText = (d: Design, perf: Performance): string => {
  const point = perf.points.find((p) => p.boostBar > d.boostBar * 0.85);
  return point ? t('від {rpm}', { rpm: rpm(point.rpm) }) : t('не виходить на ціль');
};
