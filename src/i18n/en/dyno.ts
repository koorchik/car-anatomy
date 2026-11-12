// English for the engine dyno and the published figures beside the designer's own.

export const DYNO_EN: Record<string, string> = {
  'Цифри вище рахує модель, тому кожна зміна дає фізичну різницю.': 'The figures above come from the model, so every change makes a physical difference.',
  'Гальмо стенда': 'Dyno absorber',
  'Ротор, який крутить двигун, гальмують вихрові струми або вода. Корпус гальма підвішено на опорах, тому момент, з яким ротор тягне його за собою, і є моментом двигуна. Уся потужність двигуна стає тут теплом в охолодній воді.':
    'The rotor the engine turns is braked by eddy currents or by water. The absorber casing hangs on bearings, so the torque with which the rotor drags it along is the engine\'s torque. All of the engine\'s power becomes heat in the cooling water here.',
  'Карданний вал стенда': 'Dyno driveshaft',
  'З’єднує маховик із ротором гальма. Шарніри прощають невелике зміщення осей, а сам вал витримує весь момент двигуна.':
    'Connects the flywheel to the absorber rotor. Its joints forgive a small misalignment, and the shaft carries all of the engine\'s torque.',
  'Тензодатчик': 'Load cell',
  'Корпус гальма спирається важелем на датчик сили. Сила, помножена на довжину важеля, дає момент. Так стенд і міряє двигун.':
    'The absorber casing rests on a force sensor through a lever. Force times the lever length gives the torque. That is how the dyno measures the engine.',
  'Вихрострумове': 'Eddy-current',
  'Гідравлічне': 'Water',
  'Двигун зламався на {rpm} об/хв.': 'The engine broke at {rpm} rpm.',
  'Замір зупинено на {rpm} об/хв.': 'Run stopped at {rpm} rpm.',
  'Двигун змінився, замір перервано на {rpm} об/хв.': 'The engine changed, so the run stopped at {rpm} rpm.',
  'Звук увімкнувся або вкладку ховали посеред заміру, тому його перервано на {rpm} об/хв.': 'Sound came on or the tab was hidden during the run, so it stopped at {rpm} rpm.',
  'Двигун більше не тягне на {rpm} об/хв.': 'The engine stops pulling at {rpm} rpm.',
  'Момент на стенді за обертами': 'Torque on the dyno by engine speed',
  'Потужність на стенді за обертами': 'Power on the dyno by engine speed',
  'На стенд': 'On the dyno',
  'Динамометричний стенд': 'Engine dynamometer',
  'Графік': 'Chart',
  'Покази': 'Readings',
  'Який графік': 'Which chart',
  'Момент, Н·м': 'Torque, N·m',
  'Потужність, к.с.': 'Power, hp',
  'кВт': 'kW',
  'Колектор, бар': 'Manifold, bar',
  'Гальмо': 'Absorber',
  'Режим гальма': 'Absorber mode',
  'Вимкнене': 'Off',
  'Утримання': 'Hold speed',
  'Розгін': 'Sweep',
  'На 250 об/хв менше': '250 rpm lower',
  'Оберти, які тримає гальмо': 'Speed the absorber holds',
  'На 250 об/хв більше': '250 rpm higher',
  'Записати точку': 'Record point',
  'Пройти точки': 'Step test',
  'Газ для точок': 'Throttle for the step test',
  'Послухати без навантаження': 'Listen without load',
  'Темп розгону': 'Sweep rate',
  '{rate} об/хв за с': '{rate} rpm/s',
  'Пуск': 'Start',
  'Тип гальма': 'Absorber type',
  'Очистити': 'Clear',
  'Як читати стенд': 'How to read the dyno',
  'Зняти зі стенда': 'Off the dyno',
  'авто': 'auto',
  '{kw} кВт = {nm} Н·м × {rpm} об/хв ÷ 9549 = {hp} к.с.': '{kw} kW = {nm} N·m × {rpm} rpm ÷ 9549 = {hp} hp',
  'Датчик: {n} Н ({kg} кг) на важелі {arm} м. Тепло у воду: {kw} кВт, як {kettles} чайників; на {rise} °C нагріву це {litres} л/хв.':
    'Load cell: {n} N ({kg} kg) on a {arm} m arm. Heat into the water: {kw} kW, as much as {kettles} kettles; warmed by {rise} °C that is {litres} L/min.',
  'Збігається з заводськими {figures}.': 'Matches the published {figures}.',
  'Запусти двигун, щоб почати замір.': 'Start the engine to begin a run.',
  '{absorber} гальмо не втримує стільки моменту на цих обертах.': '{absorber} absorber cannot hold this much torque at this speed.',
  'Двигун не тягне на цих обертах: гальмо вже відпущене до мінімуму.': 'The engine cannot pull at this speed: the absorber is already at its minimum.',
  'Точка {index} з {count}: стенд чекає, поки все встоїться.': 'Point {index} of {count}: the dyno waits for everything to settle.',
  'Розгін іде: газ відкриває автоматика.': 'Sweep running: the automation opens the throttle.',
  'Гальмо вимкнене: двигун крутить ще й ротор гальма, тому розганяється в {ratio} раза повільніше, а стенд нічого не міряє.':
    'Absorber off: the engine also turns the absorber rotor, so it revs {ratio} times slower, and the dyno measures nothing.',
  'Гальмо відпустило двигун, а газ тримає ті самі оберти без навантаження. Порівняй звук.':
    'The absorber has let go, and the throttle holds the same speed with no load. Compare the sound.',
  'Педаль задає газ: у боксі заслінку відкриває привод, повний хід за секунду.':
    'The pedal sets the throttle: in a test cell an actuator opens it, full travel in a second.',
  'Модель без цього дає {hp} к.с. і {nm} Н·м.': 'Without this the model gives {hp} hp and {nm} N·m.',
  'Модель надто далека від заводських цифр ({figures}), тому їх досягнуто лише частково.':
    'The model is too far from the published figures ({figures}), so they are only partly reached.',
  'Приведено до заводських {figures}.': 'Brought to the published {figures}.',
  'Стенд показує модель конструктора, кола на графіку — заводські дані ({figures}).': 'The dyno shows the designer\'s model; the rings on the chart are the published figures ({figures}).',
  'Стенд показує модель конструктора.': 'The dyno shows the designer\'s model.',
  'Пунктир: попередній замір, {engine}.': 'Dashed: the previous run, {engine}.',
  'Виміряно {nm} Н·м при {rpm} об/хв; ще {inertia} Н·м пішло на розгін маховика (J·ε); з поправкою {corrected} Н·м.':
    'Measured {nm} N·m at {rpm} rpm; another {inertia} N·m went into speeding up the flywheel (J·ε); corrected, {corrected} N·m.',
  '{hp} к.с. при {rpm} об/хв.': '{hp} hp at {rpm} rpm.',
  'На такому темпі турбіна не встигає: усталена крива вища на {share}%.': 'At this rate the turbo cannot keep up: the steady curve is {share}% higher.',
  'Найбільше {nm} Н·м при {rpm1} об/хв, {hp} к.с. при {rpm2} об/хв.': 'Peak {nm} N·m at {rpm1} rpm, {hp} hp at {rpm2} rpm.',
  'Порожні точки не встигли встоятися.': 'Open points did not have time to settle.',
  'Стоп': 'Stop',
  'Повернути гальмо': 'Load it again',
  'з {from} до {to} об/хв': 'from {from} to {to} rpm',
  'Поправка на інерцію, J = {j} кг·м²': 'Inertia correction, J = {j} kg·m²',
  'Листок цього стенда: {absorber} гальмо, {nm} Н·м, {kw} кВт, до {rpm} об/хв, ротор {j} кг·м². Умови 25 °C і 99 кПа сухого повітря, поправка 1,00. Згладжування 25 об/хв.':
    'This dyno\'s sheet: {absorber} absorber, {nm} N·m, {kw} kW, up to {rpm} rpm, rotor {j} kg·m². Conditions 25 °C and 99 kPa dry air, correction factor 1.00. Smoothing 25 rpm.',
  'Двигун крутить ротор гальма. Корпус гальма підвішено на опорах, і момент, з яким ротор тягне його за собою, тримає тензодатчик на важелі. Це і є виміряний момент. Потужність стенд не міряє, а рахує: P = M × n ÷ 9549, у кіловатах, а 1 к.с. дорівнює 0,7355 кВт.':
    'The engine turns the absorber\'s rotor. The absorber casing hangs on bearings, and the torque with which the rotor drags it along is held by a load cell on a lever. That is the measured torque. The dyno does not measure power, it calculates it: P = M × n ÷ 9549, in kilowatts, and 1 hp is 0.7355 kW.',
  'Вихрострумове гальмо: у роторі, що обертається в полі котушок, виникають вихрові струми й гальмують його. Струм котушок змінюється за десяті частки секунди, тому стенд швидко тримає задані оберти. Крутити двигун таке гальмо не вміє, лише гальмує. На дуже низьких обертах сили в нього мало, далі межу ставить найбільший момент, а ще вище найбільша потужність, яку встигає відвести охолодна вода.':
    'Eddy-current absorber: a rotor turning in the field of coils carries eddy currents that brake it. The coil current changes within tenths of a second, so the dyno holds a speed quickly. Such an absorber cannot turn the engine, only brake it. At very low speed it has little force, above that the limit is its torque rating, and higher still the most power its cooling water can carry away.',
  'Гідравлічне гальмо: ротор збиває воду в корпусі. Повне води гальмо тримає момент, що росте з квадратом обертів, тому на низьких обертах воно слабке, і повний газ на 1500 об/хв воно не втримає. Воду додають і зливають клапаном, тому гальмо відповідає повільніше, і регулятор стенда мусить випереджати його. Зате воно легше й дешевше на ту саму потужність.':
    'Water brake: the rotor churns water in the casing. Full of water, it holds a torque that grows with the square of speed, so it is weak at low speed and cannot hold full throttle at 1500 rpm. Water is let in and out through a valve, so it responds more slowly and the dyno\'s controller has to lead it. In return it is lighter and cheaper for the same power.',
  'Зараз на {rpm} об/хв це гальмо втримає щонайбільше {nm} Н·м.': 'At {rpm} rpm this absorber can hold at most {nm} N·m.',
  'Утримання обертів: гальмо тримає оберти, а газ задаєш ти. Коли все встоялося, момент двигуна дорівнює моменту гальма. Так знімають точні точки, і саме так видно, як турбіна за секунду-дві набирає тиск, на низьких обертах довше.':
    'Hold speed: the absorber holds the speed and you set the throttle. Once everything has settled, the engine torque equals the absorber torque. This is how exact points are taken, and how you see a turbo build its boost in a second or two, longer at low speed.',
  'Розгін: стенд піднімає оберти з однаковим темпом, найчастіше від 300 до 600 об/хв за секунду. Частина моменту йде на розкручування маховика й колінвала, тому крива виходить нижчою, ніж в усталеному режимі, на J × ε. Програма стенда може повернути цю частку, якщо знає інерцію. Турбодвигун на швидкому розгоні ще й не встигає набрати наддув.':
    'Sweep: the dyno raises the speed at a steady rate, most often 300 to 600 rpm per second. Part of the torque goes into spinning up the flywheel and crankshaft, so the curve comes out lower than at steady state by J × ε. The dyno software can add that back if it knows the inertia. On a fast sweep a turbo engine also has no time to build its boost.',
  'Чому пік потужності завжди на вищих обертах, ніж пік моменту: там, де момент перестає рости, потужність ще росте, бо оберти далі збільшуються.':
    'Why peak power always comes at a higher speed than peak torque: where the torque stops rising, power still grows, because the speed keeps going up.',
  'Чому двигун нахиляється: гальмо тримає ротор, а двигун так само сильно тягне назад свій корпус. Тому корпус гальма тисне на датчик, а двигун хитається на опорах у протилежний бік. Це третій закон Ньютона.':
    'Why the engine leans: the absorber holds back the rotor, and the engine pulls back on its own block just as hard. So the absorber casing presses on the load cell, and the engine rocks on its mounts the other way. That is Newton\'s third law.',
  'Куди йде потужність: гальмо перетворює всю потужність двигуна на тепло в охолодній воді. 200 кВт — це сто електрочайників, увімкнених разом.':
    'Where the power goes: the absorber turns all of the engine\'s power into heat in its cooling water. 200 kW is a hundred electric kettles switched on together.',
  'Поправка на погоду: потужність залежить від тиску й температури повітря, тому результат приводять до стандартних умов. SAE J1349 і ISO 1585, на якому стоять правила ООН R85, беруть 25 °C і 99 кПа сухого повітря. Старий німецький DIN 70020 бере 20 °C і 1013 гПа, тому за DIN той самий замір дає приблизно на 2% більше. Наш бокс завжди має стандартні умови, тому поправка тут дорівнює 1.':
    'Weather correction: power depends on air pressure and temperature, so results are brought to standard conditions. SAE J1349 and ISO 1585, which UN Regulation 85 builds on, use 25 °C and 99 kPa of dry air. The old German DIN 70020 uses 20 °C and 1013 hPa, so the same run reads about 2% higher by DIN. Our cell always has standard conditions, so the correction factor here is 1.',
  'Що є на листку стенда: криві моменту й потужності за обертами, стандарт поправки та її значення, тиск, температура й вологість у боксі, тип гальма, тип і темп заміру, згладжування. Без цих рядків цифри з різних стендів порівнювати не можна.':
    'What a dyno sheet shows: torque and power curves by speed, the correction standard and its factor, pressure, temperature and humidity in the cell, the absorber type, the kind and rate of the run, the smoothing. Without these lines, figures from different dynos cannot be compared.',
  'Лінії на графіку: суцільна — цей замір, пунктир — попередній, тонкий пунктир — розрахунок усталеного повного газу, порожні кола — заводські дані. Точки утримання заповнені, а порожня точка означає, що двигун не встиг устоятися.':
    'Lines on the chart: solid is this run, dashed the previous one, thin dashed the calculated steady full-load curve, open rings the published figures. Held points are filled; an open point means the engine had no time to settle.',
  'Звідки цифри: криву дає та сама модель, що й конструктор. На сторінці двигуна її масштаб приведено до заводських цифр зі статті, а оберти піків лишаються модельними. У конструкторі стенд показує саму модель, і порожні кола там показують заводські цифри для порівняння.':
    'Where the figures come from: the curve comes from the same model as the designer. On an engine\'s page it is scaled to the published figures in the article, while the peak speeds stay the model\'s. In the designer the dyno shows the model itself, and the open rings there show the published figures for comparison.',
};
