// The card of each system of the car in focus (the whole-car plan, what the visitor sees, item 3): what it is in two or
// three sentences and the key figures from its section's data, the same records the section's page reads. A figure
// resting on a field the record marks unverified says so. Every text goes through t(); the English is in en/car.ts.

import { CHASSIS_CARS } from '../../data/chassis.ts';
import { DRIVE_CARS } from '../../data/drive-cars.ts';
import { engineFacts } from '../../data/engines.ts';
import { gearboxById } from '../../data/gearboxes.ts';
import { gearboxSpec } from '../../drivetrain/catalogue.ts';
import type { DifferentialDef } from '../../drivetrain/spec.ts';
import { systemsOf } from '../../engine/systems-spec.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { CarAssembly } from '../../scene/car/assembly.ts';
import { SPLIT_KNUCKLE_DEFAULTS } from '../../suspension/templates/macpherson.ts';
import type { CarRecord } from '../../vehicle/car.ts';
import type { CarSystem } from '../../vehicle/car-systems.ts';
import { parseTyreSize, rollingRadiusM } from '../../vehicle/tyre-size.ts';

export interface SystemCard {
  /** The chip's and the card's name. */
  name: string;
  /** A few words about this car's one, after the name in the pointer's hint: "manual, 6-speed". */
  kind: string | null;
  /** Two or three sentences. */
  text: string;
  /** Key figures: a label and its value, as markup (escaped). */
  rows: Array<[string, string]>;
  /** What the figures rest on, when some are estimates or not published. */
  note: string | null;
}

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
/** A ratio to as many places as it was published with, two to three. */
const ratio = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 3, minimumFractionDigits: 2 });
const DEG = 180 / Math.PI;
const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A figure the model estimates, not one from a source. */
const estimate = (value: string): string => t('{value} (оцінка)', { value });

/** The chips' names, in the plan's words. */
export const systemName = (system: CarSystem): string =>
  ({
    engine: t('Двигун'),
    gearbox: t('Зчеплення й коробка'),
    'final-drive': t('Головна передача й диференціал'),
    halfshafts: t('Піввісі'),
    'front-suspension': t('Передня підвіска'),
    'rear-suspension': t('Задня підвіска'),
    steering: t('Кермо'),
    wheels: t('Колеса й шини'),
    brakes: t('Гальмівна система'),
    exhaust: t('Вихлоп'),
    oil: t('Олива'),
    cooling: t('Охолодження'),
    fuel: t('Паливо'),
    air: t('Повітря'),
    body: t('Кузов'),
  })[system];

const DIFFERENTIAL: Record<DifferentialDef['kind'], () => string> = {
  open: () => t('вільний'),
  plate: () => t('дисковий самоблок'),
  torsen: () => t('самоблок Torsen'),
  helical: () => t('гвинтовий самоблок'),
  viscous: () => t('в’язкісна муфта'),
  locked: () => t('заблокований'),
  coupling: () => t('керована муфта'),
};

const SUSPENSION: Record<string, () => string> = {
  macpherson: () => t('стійка Макферсон'),
  multilink: () => t('багаторичажна'),
  'double-wishbone': () => t('подвійні поперечні важелі'),
};

const SUMP: Record<string, () => string> = {
  wet: () => t('мокрий картер'),
  baffled: () => t('картер з перегородками'),
  'integrated-dry': () => t('інтегрований сухий картер'),
  dry: () => t('сухий картер з окремим баком'),
};

const FUEL: Record<string, () => string> = {
  carburettor: () => t('карбюратор'),
  mechanical: () => t('механічне упорскування'),
  port: () => t('упорскування у впускні канали'),
  direct: () => t('безпосереднє упорскування'),
  dual: () => t('упорскування в канали й у циліндри'),
};

/** Built once per car: the figures do not change while the car is shown. */
export function systemCards(car: CarRecord, assembly: CarAssembly): Record<CarSystem, SystemCard> {
  const spec = assembly.engine.spec;
  const facts = engineFacts(car.engine);
  const systems = systemsOf(spec);
  const drive = DRIVE_CARS[car.id];
  const chassis = CHASSIS_CARS[car.id];
  const record = car.gearbox ? gearboxById(car.gearbox) : undefined;
  const box = record ? gearboxSpec(record) : null;
  const anchors = assembly.anchors();
  const transverse = car.mount.axis === 'transverse';
  const card = (system: CarSystem, kind: string | null, text: string, rows: Array<[string, string]> = [], note: string | null = null): SystemCard => ({ name: systemName(system), kind, text, rows, note });

  // ---- Engine ----
  const litres = num(assembly.engine.displacementCc / 1000, 1);
  const power = facts?.powerHp ? (facts.powerRpm ? t('{hp} к.с. при {rpm} об/хв', { hp: num(facts.powerHp), rpm: num(facts.powerRpm) }) : t('{hp} к.с.', { hp: num(facts.powerHp) })) : null;
  const torque = facts?.torqueNm ? (facts.torqueRpm ? t('{nm} Н·м при {rpm} об/хв', { nm: num(facts.torqueNm), rpm: num(facts.torqueRpm) }) : t('{nm} Н·м', { nm: num(facts.torqueNm) })) : null;
  const engineRows: Array<[string, string]> = [
    [t('Робочий об’єм'), t('{litres} л, циліндрів: {n}', { litres, n: spec.cylinders })],
    ...(power ? [[t('Потужність'), power] as [string, string]] : []),
    ...(torque ? [[t('Момент'), torque] as [string, string]] : []),
    [t('Як стоїть'), transverse ? t('поперек, колінвал уздовж осі коліс') : t('уздовж, колінвал уздовж авто')],
  ];
  const engine = card(
    'engine',
    [facts?.engineCode, facts?.powerHp ? t('{hp} к.с.', { hp: num(facts.powerHp) }) : null].filter(Boolean).join(', ') || null,
    transverse
      ? t('Той самий двигун, що на його сторінці, у тому самому масштабі. Він стоїть поперек, тож коробка прикручена збоку, на одній лінії з колінвалом, і весь силовий агрегат уміщується між передніми колесами, звільняючи салон.')
      : t('Той самий двигун, що на його сторінці, у тому самому масштабі. Він стоїть уздовж, а коробка прикручена позаду нього, на одній лінії з колінвалом.'),
    engineRows,
  );

  // ---- Gearbox and final drive ----
  const ratios = record?.published.ratios ?? [];
  const manual = box ? box.kind === 'layshaft' || box.kind === 'transaxle' : true;
  const speeds = ratios.length || null;
  const gearbox = card(
    'gearbox',
    speeds ? (manual ? t('механічна, {n}-ступенева', { n: speeds }) : t('автоматична, {n}-ступенева', { n: speeds })) : null,
    box?.kind === 'transaxle'
      ? t('Зчеплення сидить на маховику, за ним двовальна коробка: первинний вал від зчеплення, вторинний поруч. Головна пара й диференціал стоять у тому самому картері, тож від коробки одразу йдуть піввісі до коліс.')
      : t('Зчеплення сидить на маховику, за ним коробка передач, від якої обертання йде далі до ведучих коліс.'),
    [
      ...(ratios.length ? [[t('Передаточні числа'), ratios.map(ratio).join(' · ')] as [string, string]] : []),
      ...(record?.published.reverse ? [[t('Задній хід'), ratio(record.published.reverse)] as [string, string]] : []),
      ...(record ? [[t('Коробка'), escapeHtml(record.name)] as [string, string]] : []),
    ],
  );
  const finalRatio = drive?.finalDrive.ratio ?? record?.published.finalDrive ?? null;
  const diff = drive?.differential;
  const unpublishedDiff = drive?.unverified.some((f) => f.startsWith('differential.')) ?? false;
  const finalDrive = card(
    'final-drive',
    diff ? DIFFERENTIAL[diff.kind]() : null,
    diff?.kind === 'helical' || diff?.kind === 'torsen'
      ? t('Остання пара шестерень зменшує оберти ще раз перед колесами, а диференціал дає колесам крутитися з різною швидкістю в повороті. Гвинтовий самоблок тертям своїх косозубих сателітів подає більше моменту колесу, що тримає дорогу краще. Колесо в повітрі опору не має, і тоді його тримає лише попереднє стиснення.')
      : t('Остання пара шестерень зменшує оберти ще раз перед колесами, а диференціал дає колесам крутитися з різною швидкістю в повороті.'),
    [...(finalRatio ? [[t('Головна передача'), ratio(finalRatio)] as [string, string]] : []), ...(diff ? [[t('Диференціал'), DIFFERENTIAL[diff.kind]()] as [string, string]] : [])],
    unpublishedDiff ? t('Коефіцієнт блокування й попереднє стиснення самоблока виробник не публікує.') : null,
  );

  // ---- Halfshafts: inner joint to wheel centre, both sides ----
  const end = car.drive === 'rwd' ? 'rear' : 'front';
  const shaftMm = (side: 'left' | 'right'): number | null => {
    const inner = anchors[`${end}.${side}.diffOutput`];
    const wheel = anchors[`${end}.${side}.wheelCentre`];
    return inner && wheel ? inner.distanceTo(wheel) * 100 : null;
  };
  const left = shaftMm('left');
  const right = shaftMm('right');
  const estimatedShafts = drive?.unverified.includes('driveline.diffOutputs') ?? true;
  const shaftValue = (mm: number): string => (estimatedShafts ? estimate(t('{mm} мм', { mm: num(mm) })) : t('{mm} мм', { mm: num(mm) }));
  const halfshafts = card(
    'halfshafts',
    left !== null && right !== null && Math.abs(left - right) < 5 ? t('однакової довжини') : null,
    transverse
      ? t('Вали від диференціала до коліс, з шарнірами рівних кутових швидкостей на обох кінцях: внутрішній дає валу ходити разом із підвіскою, зовнішній ще й повертатися з колесом. Диференціал стоїть не посередині, тож без проміжного вала піввісі були б різної довжини, а різні кути шарнірів смикали б кермо під газом.')
      : t('Вали від диференціала до коліс, з шарнірами рівних кутових швидкостей на обох кінцях: вони дають валу ходити разом із підвіскою.'),
    [...(left !== null ? [[t('Ліва, від шарніра до колеса'), shaftValue(left)] as [string, string]] : []), ...(right !== null ? [[t('Права, від шарніра до колеса'), shaftValue(right)] as [string, string]] : [])],
    estimatedShafts ? t('Де саме стоять внутрішні шарніри, виробник не публікує: їх виведено з того, де стоїть коробка.') : null,
  );

  // ---- Suspension, steering, wheels, brakes ----
  const front = car.suspension?.front;
  const rear = car.suspension?.rear;
  const split = chassis?.front.layout === 'macpherson' && chassis.front.knuckle !== 'plain' ? chassis.front.knuckle : null;
  const frontKind = front ? (split === 'dual-axis' ? t('стійка Макферсон з розщепленою віссю повороту') : (SUSPENSION[front]?.() ?? front)) : null;
  const frontRows: Array<[string, string]> = [];
  if (frontKind) frontRows.push([t('Тип'), frontKind]);
  if (split) {
    frontRows.push(
      [t('Плече осі повороту на висоті центра колеса'), t('звичайна стійка {plain} мм, розщеплені осі {split} мм', { plain: '60–80', split: '20–40' })],
      [t('У моделі'), estimate(t('{mm} мм', { mm: num(SPLIT_KNUCKLE_DEFAULTS[split].kingpinOffsetM * 1000) }))],
    );
  }
  if (chassis) frontRows.push([t('Стабілізатор'), chassis.antiRollBars.front ? t('є') : t('немає')]);
  const frontSuspension = card(
    'front-suspension',
    frontKind,
    split
      ? t('У звичайної стійки колесо повертається разом з усією стійкою навколо лінії від верхньої опори до кульової опори, і ця лінія проходить далеко від колеса. Тут поворотний кулак крутиться на власній осі в носії, а стійка лишається нерухомою. Вісь повороту стоїть ближче до середини колеса, тож тяга під газом менше смикає кермо.')
      : t('Підвіска передніх коліс разом із піввісями: геометрія та сама, що на сторінці підвісок.'),
    frontRows,
    split ? t('Плече звичайної стійки взято з патенту Honda US8205900B1, розщеплених осей з того самого патенту (30–40 мм) і з даних Ford про RevoKnuckle (20–30 мм). Свого числа для Civic Type R Honda не публікує.') : null,
  );
  const rearKind = rear ? (SUSPENSION[rear]?.() ?? rear) : null;
  const rearSuspension = card(
    'rear-suspension',
    rearKind,
    rear === 'multilink'
      ? t('Кожне колесо тримають кілька окремих тяг, і кожна задає свій рух: одні тримають розвал, інша сходження. Так можна налаштувати, як колесо повертається на ході й під бічною силою, окремо від того, як воно ходить угору й униз.')
      : t('Підвіска задніх коліс: геометрія та сама, що на сторінці підвісок.'),
    [...(rearKind ? [[t('Тип'), rearKind] as [string, string]] : []), ...(chassis ? [[t('Стабілізатор'), chassis.antiRollBars.rear ? t('є') : t('немає')] as [string, string]] : [])],
  );
  const lock = assembly.chassisModel.chassis.front.lock;
  const turning = chassis?.turning;
  const steering = card(
    'steering',
    t('рейка'),
    t('Рейка йде поперек авто, а рульові тяги з’єднують її кінці з поворотними кулаками обох коліс. Внутрішнє колесо в повороті повертається на більший кут, ніж зовнішнє, бо описує менше коло.'),
    [
      ...(turning?.kind === 'radius' ? [[t('Радіус розвороту'), t('{m} м', { m: num(turning.m, 1) })] as [string, string]] : []),
      // The outer wheel's lock alone: it follows from the published turning radius and the wheelbase (sin δ = L / R).
      // The inner one would come from the typical linkage of the suspension's template, whose steering arms are not
      // the car's, and it could even contradict the text above.
      ...(lock ? [[t('Повний поворот зовнішнього колеса'), estimate(`${num(lock.outerRad * DEG, 1)}°`)] as [string, string]] : []),
    ],
    lock ? t('Кут повного повороту виведено з опублікованого радіуса розвороту й колісної бази.') : null,
  );
  const sizeF = car.tyre.size;
  const sizeR = car.tyre.sizeRear ?? car.tyre.size;
  const radiusMm = (size: string): string => num(rollingRadiusM(parseTyreSize(size)) * 1000);
  const wheels = card(
    'wheels',
    sizeF === sizeR ? sizeF : `${sizeF} / ${sizeR}`,
    t('Колесо крутиться на маточині, у ній підшипник. Від розміру шини залежить радіус кочення, а з ним і те, скільки обертів двигуна припадає на кілометр за годину на кожній передачі.'),
    [
      [sizeF === sizeR ? t('Шини') : t('Шини спереду'), escapeHtml(sizeF)],
      ...(sizeF === sizeR ? [] : [[t('Шини ззаду'), escapeHtml(sizeR)] as [string, string]]),
      // Inches, as tyre sizes print them.
      [t('Посадковий діаметр дисків'), `${num(parseTyreSize(sizeF).rimIn)}″${sizeF === sizeR ? '' : ` / ${num(parseTyreSize(sizeR).rimIn)}″`}`],
      [t('Радіус кочення'), sizeF === sizeR ? t('{mm} мм', { mm: radiusMm(sizeF) }) : t('{front} мм спереду, {rear} мм ззаду', { front: radiusMm(sizeF), rear: radiusMm(sizeR) })],
    ],
  );
  const brakes = card(
    'brakes',
    t('дискові'),
    t('Супорт колодками стискає диск, що крутиться разом із колесом, і тертя перетворює рух авто на тепло. Розміри дисків і супортів тут типові.'),
    [],
    t('Окремого розділу про гальма на сайті поки немає.'),
  );

  // ---- The car's own bodies ----
  const route = assembly.exhaust.route;
  const pipeM = spec.exhaust.pipeM;
  const exhaust = card(
    'exhaust',
    spec.aspiration === 'turbo' ? t('від турбіни до зрізу') : t('від колектора до зрізу'),
    t('Лінія від двигуна під днищем до зрізу ззаду: каталізатор одразу за двигуном, далі глушник. Довжину труб у синтезі звуку підібрано під звук двигуна, а не під це авто, тож вона розходиться з лінією, яку задає компоновка.'),
    [
      [t('Лінія в авто'), estimate(t('{m} м', { m: num(route.lengthM, 1) }))],
      [t('До глушника в синтезі звуку'), t('{m} м', { m: num(pipeM, 1) })],
      [t('Глушник'), route.muffler.alongPipe ? t('там, куди його ставить синтез') : t('на своєму місці під задньою частиною')],
    ],
    t('Як вихлоп формує звук, пояснює стаття двигуна.'),
  );
  const oilUnverified = facts?.unverified?.includes('oilL') ?? false;
  const litresOil = t('{litres} л', { litres: num(systems.oilL, systems.oilL % 1 ? 1 : 0) });
  const oil = card(
    'oil',
    SUMP[systems.sump]?.() ?? null,
    systems.sump === 'wet'
      ? t('Олива стікає в піддон під колінвалом, а насос бере її звідти через заборник. У довгому повороті чи на гальмуванні олива хлюпає до стінки піддона, і заборник може хапнути повітря: що з цього виходить на треку, показує сторінка оливи.')
      : t('Олива збирається в картері, а насос бере її звідти. Що з нею відбувається в поворотах на треку, показує сторінка оливи.'),
    [
      [t('Картер'), SUMP[systems.sump]?.() ?? systems.sump],
      [t('Олива з фільтром'), oilUnverified ? estimate(litresOil) : litresOil],
    ],
  );
  const cooling = card(
    'cooling',
    systems.cooling === 'liquid' ? t('рідинне') : t('повітряне'),
    t('Радіатор стоїть у носі, де повітря найбільше. Гаряча рідина від двигуна йде верхнім патрубком у радіатор, а охолоджена нижнім повертається до насоса. Розмір радіатора тут типовий.'),
    [[t('Охолодження'), systems.cooling === 'liquid' ? t('рідинне') : t('повітряне')]],
  );
  const air = card(
    'air',
    systems.intercooler > 0 ? t('з інтеркулером') : null,
    t('Стиснене турбіною повітря гаряче. Інтеркулер перед радіатором охолоджує його зустрічним потоком, і в циліндри заходить щільніше повітря, а з ним більше кисню. Розмір інтеркулера тут типовий.'),
    systems.boostBar > 0 ? [[t('Наддув'), t('{bar} бар', { bar: num(systems.boostBar, 1) })]] : [],
  );
  const fuel = card(
    'fuel',
    FUEL[systems.fuelSystem]?.() ?? null,
    t('Бак лежить під заднім сидінням, між колесами: там він найкраще захищений від удару і менше зсуває центр мас, коли порожніє. Форма бака тут умовна, а паливну лінію до двигуна ще не намальовано.'),
    FUEL[systems.fuelSystem] ? [[t('Подача палива'), FUEL[systems.fuelSystem]!()]] : [],
  );
  const d = car.dimensions;
  const body = card(
    'body',
    null,
    t('Оболонка за розмірами справжнього авто. Капот побудовано з того самого моторного відсіку, за яким перевіряють, чи вміщується двигун, тож картинка й перевірка завжди кажуть одне. Дверей, ручок і фар немає: кузов тут лише показує, де все стоїть.'),
    d
      ? [
          [t('Довжина, ширина, висота'), t('{l} × {w} × {h} мм', { l: num(d.lengthM * 1000), w: num(d.widthM * 1000), h: num(d.heightM * 1000) })],
          [t('Колісна база'), t('{mm} мм', { mm: num(car.body.wheelbaseM * 1000) })],
          [t('Колія спереду, ззаду'), t('{front} мм, {rear} мм', { front: num(car.body.trackFrontM * 1000), rear: num(car.body.trackRearM * 1000) })],
          [t('Дорожній просвіт'), t('{mm} мм', { mm: num(d.groundClearanceM * 1000) })],
        ]
      : [],
  );
  return {
    engine,
    gearbox,
    'final-drive': finalDrive,
    halfshafts,
    'front-suspension': frontSuspension,
    'rear-suspension': rearSuspension,
    steering,
    wheels,
    brakes,
    exhaust,
    oil,
    cooling,
    fuel,
    air,
    body,
  };
}
