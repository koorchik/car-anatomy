// Every control on the designer's panel: what it changes, its unit, and in plain words what it does to the engine.

import { cylinderChoices, type NumericKey } from '../../designer/constraints.ts';
import { effectiveOpen, effectivePops, effectiveRasp, isBoosted, isRotary, isTurbo, type Design } from '../../designer/design.ts';
import { FUELS, type FuelId } from '../../designer/fuels.ts';
import type { Performance } from '../../designer/physics.ts';

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
  key: 'layout' | 'cylinders' | 'pistonMaterial' | 'rodMaterial' | 'blockMaterial' | 'crankPreset' | 'balanceShafts' | 'valvetrain' | 'valvesPerCyl' | 'charger' | 'fuel' | 'collector' | 'muffler' | 'blowoff';
  label: string;
  /** Options, or a function when they depend on the rest of the design. */
  options: Array<[string | number, string]> | ((d: Design) => Array<[string | number, string]>);
  help: string;
  /** Set when the choice changes nothing but the sound. */
  only?: 'sound';
  applies?: (d: Design) => boolean;
  /** Dropdown instead of buttons, when options won't fit in a row. */
  select?: boolean;
}

export interface ToggleParam {
  kind: 'toggle';
  key: 'catalyst' | 'directInjection';
  label: string;
  help: string;
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
const rpm = (v: number): string => `${(Math.round(v / 50) * 50).toLocaleString('uk-UA')} об/хв`;

export const PARAM_GROUPS: ParamGroup[] = [
  {
    id: 'layout',
    title: 'Компоновка',
    intro: 'Як циліндри розташовані навколо вала. Від цього залежать габарити й баланс. Звук формує насамперед вихлоп, тому зміна компоновки ставить типову для неї вихлопну систему.',
    params: [
      {
        kind: 'choice',
        key: 'layout',
        label: 'Тип',
        select: true,
        options: [
          ['inline', 'Рядний'],
          ['vee', 'V-подібний'],
          ['boxer', 'Опозитний'],
          ['flatvee', 'Плоский V (180°)'],
          ['vr', 'VR, вузький зигзаг'],
          ['w', 'W, два VR'],
          ['rotary', 'Роторний Ванкеля'],
        ],
        help: 'Рядний простий і вузький. V короткий. В опозитному поршні рухаються назустріч і гасять сили. У плоскому V180 поршні навпроти рухаються разом, бо сидять на одній шийці.',
      },
      {
        kind: 'choice',
        key: 'cylinders',
        label: 'Кількість',
        select: true,
        options: (d) => CYLINDER_OPTIONS(d),
        help: 'Більше циліндрів дає рівніший момент і вищі оберти за того самого об’єму, але більше тертя, маси й ціни.',
      },
      { kind: 'number', key: 'veeAngle', label: 'Кут розвалу', unit: '°', step: 1, help: 'Кут між рядами. Для рівних спалахів на спільних шийках кут дорівнює 720° поділити на кількість циліндрів. Менший кут робить двигун вужчим.', applies: (d) => d.layout === 'vee' },
      { kind: 'number', key: 'wAngle', label: 'Кут між блоками W', unit: '°', step: 1, help: 'Кут між двома вузькими блоками.', applies: (d) => d.layout === 'w' },
      { kind: 'number', key: 'narrowAngle', label: 'Вузький кут', unit: '°', step: 1, help: 'Кут між сусідніми циліндрами в зигзагу. Що менший, то компактніша одна спільна головка.', applies: (d) => d.layout === 'vr' || d.layout === 'w' },
      { kind: 'number', key: 'tilt', label: 'Нахил двигуна', unit: '°', step: 1, only: 'looks', help: 'Нахил рядного двигуна, щоб опустити капот. На механіку майже не впливає.', applies: (d) => d.layout === 'inline' },
      { kind: 'choice', key: 'blockMaterial', label: 'Блок', options: [['aluminium', 'Алюміній'], ['iron', 'Чавун']], help: 'Алюміній легший, чавун міцніший і дешевший.' },
      { kind: 'color', key: 'coverColor', label: 'Колір кришок', help: 'На роботу не впливає, зате легко впізнати свій двигун.', only: 'looks', shown: (d) => d.coverColor ?? '#a81c20' },
    ],
  },
  {
    id: 'rotor',
    title: 'Ротор',
    intro: 'Замість поршня трикутний ротор. Об’єм камери задають радіус, ексцентриситет і ширина.',
    applies: isRotary,
    params: [
      { kind: 'number', key: 'rotorR', label: 'Радіус ротора', unit: 'мм', step: 1, help: 'Від центра ротора до вершини. Разом з ексцентриситетом задає розмір камери.' },
      { kind: 'number', key: 'rotorE', label: 'Ексцентриситет', unit: 'мм', step: 0.5, digits: 1, help: 'Зміщення ротора від осі вала. Більший означає більший об’єм і момент, але ротор важче розводиться з корпусом.' },
      { kind: 'number', key: 'rotorWidth', label: 'Ширина', unit: 'мм', step: 1, help: 'Ширша секція дає більший об’єм, але гірше співвідношення поверхні до об’єму.' },
    ],
    readouts: (d) => [['R / e', (d.rotorR / d.rotorE).toFixed(1)]],
  },
  {
    id: 'cylinder',
    title: 'Циліндр і поршень',
    intro: 'Розміри, які визначають об’єм і те, на яких обертах двигуну комфортно.',
    applies: notRotary,
    params: [
      { kind: 'number', key: 'bore', label: 'Діаметр циліндра', unit: 'мм', step: 0.5, digits: 1, help: 'Більший діаметр вміщує більші клапани, тому двигун краще дихає на верхах. Але важчий поршень і повільніше проходження полум’я підвищують ризик детонації.' },
      { kind: 'number', key: 'stroke', label: 'Хід поршня', unit: 'мм', step: 0.5, digits: 1, help: 'Довший хід дає більше момента внизу, але поршень рухається швидше і раніше впирається в межу обертів.' },
      { kind: 'number', key: 'rodLength', label: 'Довжина шатуна', unit: 'мм', step: 1, help: 'Довший шатун менше тисне поршнем на стінку і зменшує вібрації другого порядку, але блок стає вищим.' },
      { kind: 'choice', key: 'pistonMaterial', label: 'Поршень', options: [['cast', 'Литий'], ['forged', 'Кований'], ['light', 'Полегшений']], help: 'Кований міцніший, полегшений дозволяє вищі оберти, бо менша сила інерції.' },
      { kind: 'choice', key: 'rodMaterial', label: 'Шатун', options: [['steel', 'Сталь'], ['titanium', 'Титан']], help: 'Титан набагато легший, тому шатуни витримують значно вищі оберти.' },
    ],
    readouts: (d, perf) => [
      ['Хід / діаметр', (d.stroke / d.bore).toFixed(2)],
      ['Шатун / хід', (d.rodLength / d.stroke).toFixed(2)],
      ['Швидкість поршня на межі', `${perf.points[perf.points.length - 1]!.pistonSpeed.toFixed(1)} м/с`],
      ['Прискорення поршня', `${Math.round(perf.pistonAccel / 100) / 10} тис. м/с²`],
    ],
  },
  {
    id: 'revs',
    title: 'Стиснення і відсічка',
    intro: 'Відсічка сама по собі двигун не береже. Вона лише каже, де обрізати паливо, а чи витримають деталі, вирішує їхня міцність.',
    widget: 'revs',
    params: [
      { kind: 'number', key: 'compression', label: 'Ступінь стиснення', unit: ': 1', step: 0.1, digits: 1, help: 'Вище стиснення дає кращий ККД і момент, але бензин може здетонувати. Дизелю без нього не вистачає тепла, щоб паливо спалахнуло.' },
      { kind: 'number', key: 'rpmLimit', label: 'Відсічка', unit: 'об/хв', step: 50, log: true, help: 'Оберти, на яких блок керування обрізає паливо. Сама вона двигун не береже: якщо поставити її вище запасу міцності, він дійде туди й зруйнується.' },
    ],
    readouts: (_d, perf) => [['Сам докрутиться до', rpm(perf.topRpm)]],
  },
  {
    id: 'crank',
    title: 'Колінвал',
    intro: 'Кути шийок задають порядок спалахів, баланс і ритм звуку. Можна виставити геть будь-які.',
    applies: notRotary,
    widget: 'crank',
    params: [
      {
        kind: 'choice',
        key: 'crankPreset',
        label: 'Схема',
        select: true,
        options: [
          ['even', 'Рівні спалахи, найкращий баланс'],
          ['flat', 'Плоский вал'],
          ['cross', 'Хрестовий вал'],
          ['bigbang', '«Великий удар»'],
          ['custom', 'Власні кути'],
        ],
        help: 'Рівні спалахи підбирають порядок із найменшою вібрацією. Плоский дає рівний ритм у кожному ряді, хрестовий бурчить, а «великий удар» скупчує спалахи докупи.',
      },
      { kind: 'number', key: 'flywheelKg', label: 'Маховик', unit: 'кг', step: 0.5, digits: 1, help: 'Важкий маховик згладжує оберти між спалахами, особливо на малій кількості циліндрів, але двигун повільніше реагує на газ.' },
      { kind: 'choice', key: 'balanceShafts', label: 'Балансирні вали', options: [[0, 'Немає'], [1, 'Один'], [2, 'Два']], help: 'Один гасить коливання першого порядку, два ще й другого. Вони ж забирають трохи потужності й додають масу.' },
    ],
  },
  {
    id: 'valves',
    title: 'Клапани і фази',
    intro: 'Двигун є повітряним насосом: скільки він вдихне, стільки палива зможе спалити.',
    applies: notRotary,
    params: [
      { kind: 'choice', key: 'valvetrain', label: 'Привод', options: [['dohc', 'Два вали'], ['sohc', 'Один вал'], ['ohv', 'Штовхачі']], help: 'Два вали у головці дають найкращі оберти. Штовхачі роблять двигун нижчим і простішим, але їхня маса раніше обмежує оберти.' },
      {
        kind: 'choice',
        key: 'valvesPerCyl',
        label: 'Клапанів на циліндр',
        options: (d) => (d.valvetrain === 'dohc' ? [[2, '2'], [3, '3'], [4, '4'], [5, '5']] : [[2, '2'], [3, '3'], [4, '4']]),
        help: 'Більше клапанів дає більшу площу прохідного перерізу, але кожен із них менший, а головка складніша.',
      },
      { kind: 'number', key: 'intakeValve', label: 'Впускний клапан', unit: 'мм', step: 0.5, digits: 1, help: 'Більша площа впуску дає двигуну дихати на вищих обертах.' },
      { kind: 'number', key: 'exhaustValve', label: 'Випускний клапан', unit: 'мм', step: 0.5, digits: 1, help: 'Зазвичай менший за впускний, бо гарячі гази виходять під тиском.' },
      { kind: 'number', key: 'lift', label: 'Підйом клапана', unit: 'мм', step: 0.25, digits: 2, help: 'Понад чверть діаметра клапана виграш уже малий, а пружині стає важче.' },
      { kind: 'number', key: 'intakeDuration', label: 'Фаза впуску', unit: '°', step: 1, help: 'Довша фаза наповнює циліндр на високих обертах, але на низьких частина заряду виштовхується назад.' },
      { kind: 'number', key: 'exhaustDuration', label: 'Фаза випуску', unit: '°', step: 1, help: 'Як довго відкритий випускний клапан.' },
      { kind: 'number', key: 'lobeSeparation', label: 'Кут між кулачками', unit: '°', step: 1, help: 'Менший кут дає більше перекриття клапанів: сильніший момент у вузькому діапазоні й нерівний холостий хід.' },
      { kind: 'number', key: 'springForce', label: 'Сила пружини', unit: 'Н', step: 10, help: 'Сильніша пружина утримує клапан на вищих обертах, зате додає тертя.' },
    ],
    readouts: (_d, perf) => [
      ['Перекриття клапанів', `${Math.round(perf.events.overlap)}°`],
      ['Закриття впуску після НМТ', `${Math.round(perf.events.ivcAbdc)}°`],
      ['Індекс Маха на межі', perf.points[perf.points.length - 1]!.machIndex.toFixed(2)],
      ['Клапани зависають після', Number.isFinite(perf.floatRpm) ? rpm(perf.floatRpm) : 'немає'],
      ['Зазор клапан-поршень', `${perf.valveClearance.toFixed(1)} мм`],
    ],
  },
  {
    id: 'intake',
    title: 'Впуск',
    intro: 'Довжина патрубка працює як настройка духового інструмента: тиск сам допомагає наповненню.',
    params: [
      { kind: 'number', key: 'runnerLength', label: 'Довжина патрубка', unit: 'мм', step: 5, log: true, help: 'Довгий патрубок налаштований на нижчі оберти, короткий на вищі.' },
      { kind: 'number', key: 'runnerDia', label: 'Діаметр патрубка', unit: 'мм', step: 1, help: 'Вузький дає сильнішу хвилю і гарний низ, але на верхах душить. У роторному двигуні це ще й розмір порту.' },
    ],
    readouts: (_d, perf) => [['Настройка впуску', rpm(perf.intakeTuneRpm)]],
  },
  {
    id: 'charger',
    title: 'Наддув',
    intro: 'Більше повітря означає більше палива. Турбіна бере енергію з випуску, нагнітач із вала.',
    params: [
      {
        kind: 'choice',
        key: 'charger',
        label: 'Тип',
        select: true,
        options: [
          ['none', 'Атмосферний'],
          ['turbo', 'Одна турбіна'],
          ['twinturbo', 'Дві турбіни'],
          ['quadturbo', 'Чотири турбіни'],
          ['roots', 'Об’ємний нагнітач (Roots)'],
          ['centrifugal', 'Відцентровий нагнітач'],
        ],
        help: 'Об’ємний нагнітач тисне вже на низах і помітно гріє повітря. Відцентровий набирає тиск з обертами. Турбіна майже безкоштовна щодо потужності, але спершу має розкрутитися.',
      },
      { kind: 'number', key: 'boostBar', label: 'Наддув', unit: 'бар', step: 0.05, digits: 2, help: 'Надлишковий тиск у впуску. Більше тиску дає більше момента, але різко підвищує навантаження і ризик детонації.', applies: isBoosted },
      { kind: 'number', key: 'turboSizeHp', label: 'Турбіна розрахована на', unit: 'к.с.', step: 5, log: true, help: 'Мала турбіна розкручується рано і душить на верхах. Велика запізнюється, але дає більше зверху.', applies: isTurbo },
      { kind: 'number', key: 'intercooler', label: 'Інтеркулер', unit: '%', step: 0.01, percent: true, help: 'Охолоджує стиснене повітря, робить його щільнішим і знижує ризик детонації. Нуль означає, що його немає.', applies: isBoosted },
      { kind: 'number', key: 'turboWhine', label: 'Чутність свисту турбіни', unit: '%', step: 0.01, percent: true, only: 'sound', applies: isTurbo, help: 'Скільки свисту турбіни доходить до вуха. Заводський впуск із коробом фільтра ховає більшу частину, відкритий фільтр робить свист гучним. Потужності не змінює.' },
      {
        kind: 'choice',
        key: 'blowoff',
        label: 'Скид тиску при закритті дроселя',
        only: 'sound',
        applies: (d) => isTurbo(d) && d.fuel !== 'diesel',
        options: [['recirculated', 'Назад у впуск'], ['soft', 'Тихий'], ['vented', 'В атмосферу']],
        help: 'Коли дросель закривається, стиснутому повітрю треба кудись подітись. Більшість заводських турбомоторів повертають його у впуск, тому пшику не чути. Клапан в атмосферу дає той самий гучний пшик, але таке майже не буває на заводських авто.',
      },
    ],
    readouts: (d, perf) =>
      isBoosted(d)
        ? [
            ['Наддув на піку потужності', `${perf.peakPower.boostBar.toFixed(2)} бар`],
            ['Протитиск там само', `${perf.peakPower.backpressureBar.toFixed(2)} бар`],
            ['Наддув з’являється', spoolText(d, perf)],
          ]
        : [],
  },
  {
    id: 'fuel',
    title: 'Паливо і запалювання',
    intro: 'Яке паливо, скільки його і коли запалити. Від цього залежать потужність, витрата і детонація.',
    params: [
      {
        kind: 'choice',
        key: 'fuel',
        label: 'Паливо',
        select: true,
        options: (Object.keys(FUELS) as FuelId[]).map((id) => [id, FUELS[id].name]),
        help: 'Вищий октан стійкіший до детонації. E85 і метанол енергетично бідніші, тому витрачаються у рази швидше, зате охолоджують заряд. Дизель спалахує від стиснення.',
      },
      { kind: 'number', key: 'lambda', label: 'Склад суміші λ', unit: '', step: 0.01, digits: 2, help: 'Менше 1 означає багату суміш, більше 1 бідну. Найбільша потужність близько 0,88, найкраща економія близько 1,05. Дизель працює бідно завжди.' },
      { kind: 'number', key: 'ignitionOffset', label: 'Запалювання від оптимуму', unit: '°', step: 1, help: 'Плюс означає раніше, мінус пізніше. Далі від оптимуму момент падає. Раннє запалювання підвищує тиск і детонацію.' },
      { kind: 'toggle', key: 'directInjection', label: 'Безпосередній впорск', help: 'Паливо подається прямо в циліндр. Заряд холодніший, суміш менше часу проводить під тиском, тому можна більше стиснення. Насос забирає трохи потужності.' },
    ],
    readouts: (d, perf) => {
      const worst = perf.points.reduce((a, b) => (b.knockRetard > a.knockRetard ? b : a), perf.points[0]!);
      return FUELS[d.fuel].diesel
        ? [['Нагрів при холодному пуску', `${Math.round(perf.coldCompressionK - 273)} °C`]]
        : [
            ['Найбільший відкат запалювання', worst.knockRetard > 0 ? `${worst.knockRetard}° на ${rpm(worst.rpm)}` : 'немає'],
            ['Найвищий тиск у циліндрі', `${Math.round(perf.points.reduce((a, b) => Math.max(a, b.peakPressureBar), 0))} бар`],
          ];
    },
  },
  {
    id: 'exhaust',
    title: 'Вихлопна система',
    intro: 'Вона впливає на потужність через протитиск і настройку, і саме вона майже повністю формує звук.',
    widget: 'pipes',
    params: [
      { kind: 'number', key: 'headerLength', label: 'Довжина первинних труб', unit: 'мм', step: 10, log: true, help: 'Хвиля розрідження повертається до клапана і допомагає витягнути гази. Довгі труби налаштовані на нижчі оберти. Ще довжина змінює висоту звуку.' },
      { kind: 'number', key: 'headerDia', label: 'Діаметр первинних труб', unit: 'мм', step: 1, help: 'Вузькі труби тримають швидкість газів і момент внизу, широкі менше душать на верхах.' },
      { kind: 'number', key: 'headerSpread', label: 'Різниця довжин труб', unit: '%', step: 0.01, percent: true, only: 'sound', help: 'Труби різної довжини зсувають імпульси в часі. Саме так Subaru отримує своє бурчання при рівних спалахах.' },
      {
        kind: 'choice',
        key: 'collector',
        label: 'Збірник',
        options: (d) => (['vee', 'flatvee', 'boxer', 'w'].includes(d.layout) ? [['single', 'Один'], ['bybank', 'На кожен ряд']] : [['single', 'Один']]),
        help: 'Окрема труба на ряд дає менший протитиск, а кожен канал отримує власний ритм спалахів. Зі спільним збірником і рівними спалахами звук майже не залежить від компоновки: у трубу приходять ті самі імпульси.',
      },
      { kind: 'number', key: 'pipeDia', label: 'Діаметр труби', unit: 'мм', step: 1, help: 'Занадто вузька душить верхи. Дивись на протитиск нижче.' },
      { kind: 'number', key: 'pipeLength', label: 'Довжина труби', unit: 'мм', step: 50, log: true, help: 'Трохи додає опору. Більше впливає на тон звуку, ніж на потужність.' },
      { kind: 'toggle', key: 'catalyst', label: 'Каталізатор', help: 'Очищає гази, але додає опору потоку.' },
      { kind: 'choice', key: 'muffler', label: 'Глушник', options: [['road', 'Дорожній'], ['sport', 'Спортивний'], ['open', 'Прямоток']], help: 'Прямоток дає найменше втрат і найбільше шуму. Вибір типу ставить типову для нього відкритість і різкість.' },
      { kind: 'number', key: 'mufflerOpen', label: 'Відкритість глушника', unit: '%', step: 0.01, percent: true, shown: effectiveOpen, help: 'Плавне налаштування замість трьох типів. Що більше відкрито, то менший опір і гучніший, яскравіший звук.' },
      { kind: 'number', key: 'rasp', label: 'Різкість звуку', unit: '%', step: 0.01, percent: true, only: 'sound', shown: effectiveRasp, help: 'Наскільки хрипить вихлоп на великому газі. Потужності не змінює.' },
      { kind: 'number', key: 'pops', label: 'Прострели при скиданні газу', unit: '%', step: 0.01, percent: true, only: 'sound', shown: effectivePops, applies: (d) => d.fuel !== 'diesel', help: 'Дорожній двигун на скиданні газу перекриває паливо, тому в трубі нема чому спалахувати. Прострели з’являються, коли блок керування навмисно лишає паливо, як у спортивних режимах, або на гоночних і старих карбюраторних моторах. Потужності не змінює.' },
    ],
    readouts: (d, perf) => [
      ['Настройка випуску', isTurbo(d) ? 'гасить турбіна' : rpm(perf.exhaustTuneRpm)],
      ['Протитиск на піку', `${perf.peakPower.backpressureBar.toFixed(2)} бар`],
    ],
  },
];

const CYLINDER_OPTIONS = (d: Design): Array<[number, string]> => {
  const list = CYLINDER_CHOICES(d);
  return list.map((n) => [n, isRotary(d) ? (n === 1 ? '1 секція' : `${n} секції`) : String(n)]);
};

const CYLINDER_CHOICES = (d: Design): number[] => cylinderChoices(d.layout);

const spoolText = (d: Design, perf: Performance): string => {
  const point = perf.points.find((p) => p.boostBar > d.boostBar * 0.85);
  return point ? `від ${rpm(point.rpm)}` : 'не виходить на ціль';
};
