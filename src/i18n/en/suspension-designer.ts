// English for the suspension designer (src/suspension-designer/): the names and notes of its starting designs, its
// diagnoses and the character of the ride (diagnostics.ts), and the figures of "what this changes" (sensitivity.ts). The
// model of the chassis itself holds no text; the page of the designer (P8c) registers this with its own words.
export const SUSPENSION_DESIGNER_EN: Record<string, string> = {
  'Справжнє авто каталогу: компоновка, маси й розміри від виробника, а точки кріплення, пружини й амортизатори типові.':
    'A real car from the catalog: layout, masses and dimensions from the maker; the hardpoints, springs and shock absorbers are typical.',
  'Комфортний седан': 'Comfortable sedan',
  "Задній привід, подвійні важелі спереду й багаторичажна ззаду, м'які амортизатори.":
    'Rear-wheel drive, double wishbones in front and a multilink at the rear, soft shock absorbers.',
  'Хот-хетч': 'Hot hatch',
  'Передній привід, стійки спереду й скручувана балка ззаду, спортивні амортизатори.':
    'Front-wheel drive, struts in front and a twist beam at the rear, sport shock absorbers.',
  'Родстер': 'Roadster',
  'Легкий задньопривідний на подвійних важелях, центр мас низько, вага порівну.':
    'Light and rear-wheel drive on double wishbones, a low center of mass, weight split evenly.',
  'Трековий': 'Track car',
  "Жорсткі пружини й стабілізатори, напівсліки, великий від'ємний розвал.":
    'Stiff springs and anti-roll bars, semi-slicks, plenty of negative camber.',
  'Позашляховик на ресорах': 'Off-roader on leaf springs',
  'Високий і важкий: подвійні важелі спереду, нерозрізний міст на ресорах ззаду.':
    'Tall and heavy: double wishbones in front, a live axle on leaf springs at the rear.',
  "Надто м'яка": 'Far too soft',
  'Пружини на межі й зношені амортизатори: кузов розгойдується й пробиває відбійники.':
    'Springs at the limit and worn-out shock absorbers: the body wallows and hits the bump stops.',
  'Кермо смикає': 'Twitchy steering',
  'Внутрішній шарнір рульової тяги піднято на 30 мм: колесо підрулює на кожній нерівності.':
    'The inner tie rod joint raised by 30 mm: the wheel steers itself over every bump.',
  'Високий центр крену': 'High roll center',
  'Внутрішні опори важелів підняті: центр крену вище 300 мм, кузов підкидає в повороті.':
    'The arms\' inner pivots raised: the roll center sits above 300 mm and the body jacks up in a turn.',
  'Хитний міст Corvair': 'Corvair swing axle',
  'Двигун ззаду, хитний міст: на відбої колесо йде в позитивний розвал. Числа типові, не самого Corvair.':
    'Engine at the rear, swing axle: in droop the wheel goes into positive camber. Typical numbers, not the Corvair\'s own.',

  // diagnostics.ts
  'спереду': 'at the front',
  'ззаду': 'at the rear',
  'Перекинеться раніше, ніж зісковзне': 'Rolls over before it slides',
  'Шини тримають до {grip} g, а авто перекидається вже на {roll} g: центр мас надто високо для такої колії.':
    'The tires hold up to {grip} g, but the car tips over at {roll} g: the center of mass is too high for this track width.',
  'Опусти центр мас або розшир колію.': 'Lower the center of mass or widen the track.',
  'Авто нестійке на швидкості': 'Unstable at speed',
  'Задня вісь ковзає раніше за передню: надмірна поворотність {us}°/g. Понад {v} км/год авто саме йде в занос від найменшого збурення.':
    'The rear axle slides before the front: {us}°/g of oversteer. Above {v} km/h the slightest disturbance sends the car into a spin.',
  'Збільш частку перенесення ваги спереду: жорсткіший передній стабілізатор або м’якший задній.':
    'Move more of the load transfer to the front: a stiffer front anti-roll bar or a softer rear one.',
  'Кермо смикає на нерівностях': 'The steering tugs over bumps',
  'Кожне переднє колесо повертається на {deg}° на 100 мм ходу: на нерівній дорозі авто саме змінює напрямок.':
    'Each front wheel steers {deg}° per 100 mm of travel: on a rough road the car changes direction by itself.',
  'Постав внутрішній шарнір рульової тяги на висоту, де тяга не підрулює.':
    'Put the inner tie rod joint at the height where the rod does not steer the wheel.',
  'Задня вісь підрулює назовні повороту': 'The rear axle steers out of the turn',
  'На крені задні колеса повертаються назовні на {deg}° на кожне g: задня вісь сама додає надмірної поворотності.':
    'In roll the rear wheels steer outward by {deg}° per g: the rear axle adds oversteer by itself.',
  'Зміни геометрію задньої осі так, щоб на стиску колесо йшло в сходження.':
    'Change the rear geometry so that the wheel toes in when it moves up.',
  'Підвіска розгойдується': 'The suspension wallows',
  'Демпфування кузова {axle} лише {zeta}: після нерівності кузов гойдається кілька разів, перш ніж заспокоїться.':
    'Body damping {axle} is only {zeta}: after a bump the body bounces several times before it settles.',
  'Жорсткіші амортизатори або м’якші пружини.': 'Firmer shock absorbers or softer springs.',
  'Б’є на нерівностях': 'Harsh over bumps',
  'Демпфування кузова {axle} {zeta}: на малих швидкостях амортизатор майже не пускає колесо, і кожна нерівність іде в кузов.':
    'Body damping {axle} is {zeta}: at low speeds the shock absorber barely lets the wheel move, and every bump goes into the body.',
  'Зменш демпфування амортизатора на стиску.': 'Reduce the shock absorber\'s compression damping.',
  'Колесо втрачає дорогу': 'The wheel loses the road',
  'На дорозі класу B на 90 км/год притискання коліс {axle} коливається на {dlc} % від ваги: на хвилях колесо ледь торкається дороги.':
    'On a class B road at 90 km/h the load on the wheels {axle} swings by {dlc} % of their weight: on the undulations the wheel barely touches the road.',
  'Полегши колесо або додай демпфування.': 'Make the wheel lighter or add damping.',
  'Пробиває відбійники': 'Hits the bump stops',
  'На поганій дорозі (клас C, 54 км/год) колеса {axle} ходять на ±{travel} мм, а до відбійника лише {room} мм.':
    'On a bad road (class C, 54 km/h) the wheels {axle} travel ±{travel} mm, with only {room} mm to the bump stop.',
  'Жорсткіші пружини або сильніші амортизатори.': 'Stiffer springs or firmer shock absorbers.',
  'Шина працює на плечі': 'The tire runs on its shoulder',
  'На 0,8 g зовнішнє колесо {axle} нахилене назовні на {deg}°: шина спирається на зовнішнє плече й тримає гірше.':
    'At 0.8 g the outer wheel {axle} leans out by {deg}°: the tire rides on its outer shoulder and grips less.',
  'Більший від’ємний розвал, більший набір розвалу на стиску або менший крен.':
    'More negative camber, more camber gain in bump, or less roll.',
  'Кузов підкидає в повороті': 'The body jacks up in a turn',
  'Центр крену {axle} на висоті {h} мм: бічна сила шин піднімає кузов, а розвал колеса в повороті різко змінюється.':
    'The roll center {axle} sits {h} mm up: the tires\' side force lifts the body, and the wheel\'s camber changes sharply in a turn.',
  'Опусти внутрішні опори важелів.': 'Lower the arms\' inner pivots.',
  'Кузов осідає в повороті': 'The body squats in a turn',
  'Центр крену {axle} на {h} мм нижче дороги: бічна сила тягне кузов донизу, а крен більшає.':
    'The roll center {axle} is {h} mm below the road: the side force pulls the body down, and it rolls more.',
  'Підніми внутрішні опори нижнього важеля.': 'Raise the lower arm\'s inner pivots.',
  'Тягне на гальмах на різному покритті': 'Pulls under braking on mixed surfaces',
  'Плече обкатки {mm} мм: коли під лівими й правими колесами різне зчеплення, гальмівна сила повертає кермо.':
    'Scrub radius {mm} mm: when the left and right wheels have different grip, the braking force turns the steering.',
  'Зменш плече обкатки.': 'Reduce the scrub radius.',
  'Схильне до заносу': 'Prone to spinning',
  'Спереду лише {lltd} % перенесення ваги в повороті при {share} % ваги на передній осі: на межі першою зісковзує задня вісь.':
    'Only {lltd} % of the load transfer in a turn is at the front, with {share} % of the weight on the front axle: at the limit the rear axle slides first.',
  'Жорсткіший передній стабілізатор або м’якший задній.': 'A stiffer front anti-roll bar or a softer rear one.',
  'Гойдає по тангажу після нерівності': 'Pitches after a bump',
  'Частота кузова спереду {f} Гц, ззаду {r} Гц: нерівність, яку першою проходить передня вісь, розгойдує кузов уперед і назад.':
    'Body frequency {f} Hz at the front and {r} Hz at the rear: a bump the front axle meets first rocks the body back and forth.',
  'Зроби задні пружини трохи жорсткішими за передні.': 'Make the rear springs a little stiffer than the front ones.',
  'Важкі колеса': 'Heavy wheels',
  'Непідресорені частини важать {share} % маси авто: колесам важче стежити за дорогою.':
    'The unsprung parts weigh {share} % of the car: the wheels struggle to follow the road.',
  'Легші колеса й гальма або внутрішні гальма.': 'Lighter wheels and brakes, or inboard brakes.',
  'Гальмування жорстке на кермі': 'Braking feels stiff',
  'Анти-клювання {pct} %: кузов майже не опускається на гальмах, зате гальмівна сила йде через важелі, і підвіска на гальмах жорсткішає.':
    '{pct} % anti-dive: the body barely dips under braking, but the braking force goes through the arms and the suspension stiffens.',
  'Зменш нахил осей важелів у боковому виді.': 'Reduce the tilt of the arm axes in side view.',
  'Нервова задня вісь': 'A nervous rear axle',
  'Задні колеса стоять із розходженням {deg}°: задня вісь підрулює сама від найменшого збурення.':
    'The rear wheels have {deg}° of toe-out: the rear axle steers itself at the slightest disturbance.',
  'Постав задні колеса зі сходженням.': 'Give the rear wheels some toe-in.',
  'Шарнір піввісі виходить за межу': 'A half-shaft joint goes past its limit',
  'На повному ході кут або осьовий хід шарніра піввісі {axle} перевищує межу виробника: шарнір зноситься або заклинить.':
    'At full travel the angle or plunge of a half-shaft joint {axle} exceeds the maker\'s limit: the joint will wear out or bind.',
  'Посунь внутрішній шарнір так, щоб піввісь стала довшою й рівнішою.':
    'Move the inner joint so that the half-shaft gets longer and straighter.',
  'м’яка й плавна': 'soft and smooth',
  'зібрана': 'composed',
  'жорстка': 'stiff',
  'розгойдується': 'wallowing',

  // sensitivity.ts
  '°/g': '°/g',
  '°/м': '°/m',
  'навпаки': 'the other way',
  // The same words as the engine designer's (en/designer.ts), for a page that registers only this dictionary.
  'більше': 'increase',
  'менше': 'decrease',
  'мм': 'mm',
  'Частота кузова спереду': 'Front body frequency',
  'Частота кузова ззаду': 'Rear body frequency',
  'Демпфування кузова спереду': 'Front body damping',
  'Демпфування кузова ззаду': 'Rear body damping',
  'Прискорення кузова на дорозі': 'Body acceleration on the road',
  'Зчеплення на поганій дорозі': 'Grip on a bad road',
  'Крен': 'Roll',
  'Частка перенесення спереду': 'Front share of the load transfer',
  'Недостатня поворотність': 'Understeer',
  'Межа на скідпеді': 'Skidpad limit',
  'Гальмівний шлях 100–0': 'Braking distance 100–0',
  'Тангаж на гальмах': 'Pitch under braking',
  'Поріг перекидання': 'Rollover threshold',
  'Розвал зовнішнього колеса на 0,8 g спереду': 'Front outer wheel camber at 0.8 g',
  'Розвал зовнішнього колеса на 0,8 g ззаду': 'Rear outer wheel camber at 0.8 g',
  'Центр крену спереду': 'Front roll center',
  'Центр крену ззаду': 'Rear roll center',
  'Центр крену спереду на крені 3°': 'Front roll center at 3° of roll',
  'Центр крену ззаду на крені 3°': 'Rear roll center at 3° of roll',
  'Підрулювання на ходу спереду': 'Front bump steer',
  'Підрулювання на ходу ззаду': 'Rear bump steer',
  'Набір розвалу спереду': 'Front camber gain',
  'Набір розвалу ззаду': 'Rear camber gain',
  'Плече обкатки': 'Scrub radius',
  'Винос': 'Mechanical trail',
  'Нахил осі повороту': 'Kingpin inclination',
  'Анти-клювання': 'Anti-dive',
  'Анти-підйом ззаду на гальмах': 'Rear anti-lift under braking',
  'Анти-підйом спереду під газом': 'Front anti-lift under power',
  'Анти-присідання': 'Anti-squat',
  'Опір від сходження': 'Drag from toe',
  'Навантаження шарніра піввісі спереду': 'Front half-shaft joint use',
  'Навантаження шарніра піввісі ззаду': 'Rear half-shaft joint use',
  'Запас ходу до відбійника спереду': 'Front travel left to the bump stop',
  'Запас ходу до відбійника ззаду': 'Rear travel left to the bump stop',
  'Непідресорена маса': 'Unsprung mass',
  'Розвантаження заднього колеса під газом': 'Rear wheel unloading under power',
};
