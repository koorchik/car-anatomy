// English for the car builder's model (src/car-designer/): its controls, the notes of resolveBuild, the diagnoses, the
// names of its figures and the odd presets. The page (stage C5) brings the rest.

export const CAR_DESIGNER_EN: Record<string, string> = {
  // controls.ts
  'Авто-донор': 'Donor car',
  'Донор': 'Donor car',
  'Коробка передач': 'Transmission',
  'Двигун із конструктора': 'Engine from the designer',
  'Власна коробка авто': "The car's own transmission",
  'Ідеальна коробка': 'Ideal transmission',
  'Коробка з конструктора': 'Transmission from the designer',
  'Число передач': 'Number of gears',
  'Розкид передач': 'Gear spread',
  'Власна підвіска авто': "The car's own suspension",
  'Підвіска з конструктора': 'Suspension from the designer',
  'Розмір шин ведучої осі': 'Tire size on the driven axle',

  // diagnostics.ts: what resolveBuild changed
  'Такого авто немає': 'No such car',
  'В посиланні авто «{id}», якого немає серед донорів. Збірка починається з Civic Type R.':
    'The link names the car "{id}", which is not among the donor cars. The build starts from the Civic Type R.',
  'Такого двигуна немає': 'No such engine',
  'Двигуна «{id}» немає в каталозі, тож в авто стоїть його власний.': 'The engine "{id}" is not in the catalog, so the car keeps its own.',
  'Такої коробки немає': 'No such transmission',
  'Коробки «{id}» немає серед тих, що пасують цьому авто, тож стоїть його власна.':
    'The transmission "{id}" is not among those that fit this car, so it keeps its own.',
  'Коробку замінено': 'Transmission replaced',
  'Поздовжня коробка не стане біля поперечного двигуна чи на задній осі: стоїть власна коробка авто.':
    "An in-line transmission does not fit beside a transverse engine or on the rear axle: the car keeps its own.",
  'Двовальна коробка з головною передачею в картері не стане за поздовжнім двигуном спереду: стоїть власна коробка авто.':
    "A two-shaft transmission with the final drive in its case does not fit behind a front longitudinal engine: the car keeps its own.",
  'Такої підвіски немає': 'No such suspension',
  'Підвіски «{id}» немає в каталозі, тож стоїть власна підвіска авто.': 'The suspension "{id}" is not in the catalog, so the car keeps its own.',
  'Шини не прочитано': 'Tires not read',
  'Розмір шин у посиланні не прочитався, тож стоять шини авто.': "The tire size in the link could not be read, so the car keeps its own tires.",
  'Картер не змінюється': 'Sump unchanged',
  'Модель картера охоплює лише поршневі двигуни, тож роторний лишається зі своїм мащенням.':
    'The sump model covers piston engines only, so a rotary keeps its own lubrication.',

  // diagnostics.ts: the engine
  'Двигун не переживе першого повного газу': 'The engine will not survive its first full throttle',
  'Конструктор двигуна дає йому вирок «{verdict}»: {part}.': 'The engine designer rates it "{verdict}": {part}.',
  'Виправте двигун у конструкторі двигуна.': 'Fix the engine in the engine designer.',
  'Двигун на хвилини повного газу': 'An engine for minutes of full throttle',

  // diagnostics.ts: the engine bay
  'Двигун на {mm} мм довший за моторний відсік уздовж авто.': 'The engine is {mm} mm longer than the engine bay along the car.',
  'Двигун на {mm} мм ширший за моторний відсік.': 'The engine is {mm} mm wider than the engine bay.',
  'Двигун на {mm} мм вищий за моторний відсік: він стирчить крізь капот.': 'The engine is {mm} mm taller than the engine bay: it sticks out through the hood.',
  'Двигун на {mm} мм опускається нижче моторного відсіку.': 'The engine reaches {mm} mm below the engine bay.',
  'Двигун не вміщується': 'The engine does not fit',
  'Габарит без колекторів і навісного, тож насправді місця треба ще більше.':
    'The outline leaves out the manifolds and accessories, so the real engine needs even more room.',
  'Інше авто-донор або менший двигун.': 'Another donor car or a smaller engine.',
  'Піддон нижче за просвіт': 'Oil pan below the ground clearance',
  'Найнижча точка двигуна на {mm} мм нижче за дорожній просвіт авто.': "The engine's lowest point is {mm} mm below the car's ground clearance.",
  'Сухий картер, у нього мілкий піддон.': 'A dry sump: its pan is shallow.',

  // diagnostics.ts: the transmission
  'Коробка не витримає цього двигуна': 'The transmission will not survive this engine',
  'Конструктор коробки дає їй вирок «{verdict}»: {part}.': 'The gearbox designer rates it "{verdict}": {part}.',
  'Міцніша коробка або двигун з меншим моментом.': 'A stronger transmission or an engine with less torque.',
  'Коробці важче, ніж із заводським двигуном': 'The transmission has a harder time than with the factory engine',
  'Момент вищий за той, під який зроблено коробку': 'More torque than the transmission was built for',
  'Момент двигуна {nm} Н·м у {k} раза вищий, ніж у заводського двигуна цього авто ({donor} Н·м).':
    "The engine's {nm} N·m is {k} times the torque of this car's factory engine ({donor} N·m).",
  'Зчеплення ковзатиме на повному газу': 'The clutch will slip at full throttle',
  'Зчеплення тримає {cap} Н·м, а двигун дає {nm} Н·м.': 'The clutch holds {cap} N·m and the engine makes {nm} N·m.',
  'Більше зусилля притискання або більший диск у конструкторі коробки.': 'More clamp force or a larger disc in the gearbox designer.',

  // diagnostics.ts: grip, springs, balance, gearing
  'Передні колеса': 'The front wheels',
  'Задні колеса': 'The rear wheels',
  'Колеса': 'The wheels',
  'Колеса буксують': 'Wheelspin',
  '{axle} буксують на першій передачі на повному газу до {kmh} км/год.': '{axle} spin in first gear at full throttle up to {kmh} km/h.',
  'Ширші або липкіші шини, довша перша передача.': 'Wider or stickier tires, a taller first gear.',
  'Передня': 'Front',
  'Задня': 'Rear',
  'Пружини підібрано під легше авто': 'Springs chosen for a lighter car',
  'Пружини підібрано під важче авто': 'Springs chosen for a heavier car',
  '{axle} частота кузова {hz} Гц замість {was} Гц.': '{axle} body frequency {hz} Hz instead of {was} Hz.',
  'Підберіть пружини в конструкторі підвіски.': 'Choose the springs in the suspension designer.',
  'Немає моделі підвіски': 'No suspension model',
  'Для цієї підвіски ще немає моделі, тож гальмування й поворот не пораховано.':
    'There is no model of this suspension yet, so braking and cornering are not worked out.',
  'Розподіл маси змінився': 'Weight distribution changed',
  'На передню вісь припадає {now}% ваги замість {was}%.': 'The front axle carries {now}% of the weight instead of {was}%.',
  'Найвища передача впирається у відсічку': 'Top gear runs into the rev limiter',
  'На {kmh} км/год двигун доходить до межі обертів раніше, ніж опір повітря зупиняє розгін.':
    'At {kmh} km/h the engine reaches its rev limit before the drag stops the car gaining speed.',
  'Довша головна передача.': 'A taller final drive.',
  'Обмежувач швидкості не перенесено': 'Speed limiter not carried over',
  'Заводське авто обмежене на {kmh} км/год електронікою; збірка показує, скільки дає сам опір.':
    'The factory car is limited electronically to {kmh} km/h; the build shows what the drag alone allows.',
  'Інший картер': 'A different sump',
  'У двигуні {sump}: піддон мілкіший, тож двигун сидить на {mm} мм нижче.':
    'The engine has a {sump}: its pan is shallower, so it sits {mm} mm lower.',
  'У двигуні {sump}. Двигун не опускається: до нього прикручено коробку з головною передачею, а її півосі мають лишатися на рівні маточин.':
    'The engine has a {sump}. It does not go any lower: the transaxle is bolted to it, and its half-shafts have to stay level with the hubs.',
  'У двигуні {sump}.': 'The engine has a {sump}.',
  'Центр мас опустився на {mm} мм.': 'The center of mass is {mm} mm lower.',
  'Центр мас піднявся на {mm} мм.': 'The center of mass is {mm} mm higher.',

  // metrics.ts
  'с': 's',
  'Висота центру мас': 'Center of mass height',
  '0–100 км/год': '0–100 km/h',
  '0–400 м': '0–400 m',
  "80–120 км/год на п'ятій": '80–120 km/h in fifth',
  'Максимальна швидкість': 'Top speed',
  'км/год': 'km/h',
  'Час кола': 'Lap time',
  'Витрата на 90 км/год': 'Fuel at 90 km/h',
  'Витрата на 120 км/год': 'Fuel at 120 km/h',
  'Навантаження зубців коробки': 'Load on the transmission gear teeth',
  'Буксування до': 'Wheelspin up to',
  'Двигун виходить за відсік': 'Engine outside the bay',
  'Двигун нижче, ніж у донора': "Engine lower than the donor's",

  // presets.ts
  'W16 у Civic': 'W16 in the Civic',
  'BMW M3 E30 з двигуном Civic Type R': 'BMW M3 E30 with the Civic Type R engine',
  'Civic на сліках із сухим картером': 'Civic on slicks with a dry sump',
};
