// English for the car section: the overview's page and the cards of the car's own bodies and systems
// (src/scene/car/parts.ts). The section's chunk registers it before it loads (src/ui/car/load.ts).

export const CAR_EN: Record<string, string> = {
  // The page (src/ui/car/).
  'Ціле авто': 'Whole car',
  'Авто цілком. Анатомія авто': 'The whole car. Car Anatomy',
  'Тривимірна модель авто. Перетягуй, щоб обертати, коліщатком наближай, клацни частину, щоб побачити її систему.':
    '3D model of the car. Drag to turn it, scroll to zoom, click a part to see its system.',
  'Довжина цього відрізка в натурі': 'The real length of this bar',
  'Про це авто': 'About this car',
  'Передній привід': 'Front-wheel drive',
  'Задній привід': 'Rear-wheel drive',
  'Повний привід': 'All-wheel drive',
  'двигун поперек спереду': 'transverse front engine',
  'двигун уздовж спереду': 'longitudinal front engine',
  'двигун поперек посередині': 'transverse mid engine',
  'двигун уздовж посередині': 'longitudinal mid engine',
  'двигун поперек ззаду': 'transverse rear engine',
  'двигун уздовж ззаду': 'longitudinal rear engine',
  '{value} кг': '{value} kg',

  // The car's own bodies (CAR_PARTS).
  'Вихлопна труба': 'Exhaust pipe',
  'Труба від турбіни (або від колектора в двигуна без турбіни) під днищем до зрізу ззаду. Її шлях задає компоновка авто, а не звук: довжину для звуку підібрано окремо, тож глушник стоїть там, куди її доводить звук, якщо лінія це дозволяє.':
    'The pipe from the turbine (or from the manifold on an engine without one) under the floor to the tailpipe at the back. Its path is set by the layout of the car, not by the sound: the length for the sound is tuned separately, so the muffler sits where the sound puts it, if the line has room.',
  'Каталізатор': 'Catalytic converter',
  'Кераміка з тонкими каналами, вкритими платиною й родієм, допалює те, що не згоріло в циліндрах. Стоїть одразу за двигуном, бо працює лише гарячим. Розмір тут типовий.':
    'A ceramic block of fine channels coated with platinum and rhodium burns what did not burn in the cylinders. It sits right behind the engine because it only works hot. The size here is typical.',
  'Глушник': 'Muffler',
  'Камери й перфоровані труби гасять імпульси вихлопу, перш ніж вони вийдуть назовні. Від того, як далеко він від колектора, залежить, які частоти чути найбільше. Розмір і форма тут типові.':
    'Chambers and perforated tubes damp the exhaust pulses before they get out. How far it is from the manifold decides which frequencies are heard most. The size and shape here are typical.',
  'Радіатор': 'Radiator',
  'Гаряча рідина з двигуна йде тонкими трубками між ребрами, а зустрічне повітря її охолоджує. Стоїть у носі, де повітря найбільше. Розмір тут типовий.':
    'Hot coolant from the engine runs through thin tubes between fins, and the oncoming air cools it. It sits in the nose, where the air is. The size here is typical.',
  'Патрубок радіатора': 'Radiator hose',
  'Верхній патрубок несе гарячу рідину від термостата в радіатор, нижній повертає охолоджену до насоса.':
    'The upper hose carries hot coolant from the thermostat to the radiator, the lower one brings it back cooled to the pump.',
  'Інтеркулер': 'Intercooler',
  'Повітря після компресора турбіни гаряче. Інтеркулер охолоджує його зустрічним потоком, тож у циліндри заходить щільніше повітря і більше кисню. Розмір тут типовий.':
    'Air leaving the turbo’s compressor is hot. The intercooler cools it with the oncoming flow, so denser air with more oxygen goes into the cylinders. The size here is typical.',
  'Труба, якою стиснене повітря йде від компресора до інтеркулера, а охолоджене повертається до дросельної заслінки.':
    'The pipe that takes compressed air from the compressor to the intercooler and the cooled air back to the throttle.',
  'Паливний бак': 'Fuel tank',
  'Бак лежить під заднім сидінням, між колесами: там він найкраще захищений від удару і менше зсуває центр мас, коли порожніє. Форма тут умовна.':
    'The tank lies under the rear seat, between the wheels: there it is best protected in a crash and moves the center of mass least as it empties. Its shape here is schematic.',

  // The systems (SYSTEM_CARDS).
  'Той самий двигун, що на його сторінці, у тому самому масштабі: тут видно, як він стоїть в авто і як з’єднується з коробкою передач.':
    'The same engine as on its page, at the same scale: here you see how it sits in the car and how it joins the transmission.',
  'Коробка передач і головна передача': 'Transmission and final drive',
  'Коробка прикручена до задньої площини блока, де обертається маховик. У поперечній коробці в одному картері стоять і передачі, і головна пара з диференціалом, від якого йдуть піввісі до коліс.':
    'The transmission is bolted to the back face of the block, where the flywheel turns. A transverse transmission holds the gears, the final drive and the differential in one case, and the halfshafts run from the differential to the wheels.',
  'Передня підвіска': 'Front suspension',
  'Підвіска й кермо передніх коліс разом із піввісями: геометрія та сама, що на сторінці підвісок.':
    'The suspension and steering of the front wheels with the halfshafts: the same geometry as on the suspension page.',
  'Задня підвіска': 'Rear suspension',
  'Підвіска задніх коліс: геометрія та сама, що на сторінці підвісок.': 'The suspension of the rear wheels: the same geometry as on the suspension page.',
  'Кузов': 'Body',
  'Оболонка за розмірами справжнього авто. Капот побудовано з того самого моторного відсіку, за яким перевіряють, чи вміщується двигун, тож картинка й перевірка завжди кажуть одне.':
    'A shell to the real car’s dimensions. The hood is built from the same engine bay the fit check uses, so the picture and the check always agree.',
  'Вихлоп': 'Exhaust',
  'Лінія від двигуна під днищем до зрізу ззаду: каталізатор одразу за двигуном, далі глушник.': 'The line from the engine under the floor to the tailpipe at the back: the catalytic converter right behind the engine, then the muffler.',
  'Охолодження': 'Cooling',
  'Радіатор у носі й патрубки до двигуна: гаряча рідина йде в радіатор, охолоджена повертається до насоса.':
    'The radiator in the nose and its hoses to the engine: hot coolant goes to the radiator and comes back cooled to the pump.',
  'Повітря': 'Air',
  'Інтеркулер перед радіатором і патрубки наддуву: стиснене турбіною повітря охолоджується, перш ніж зайти в циліндри.':
    'The intercooler in front of the radiator and the charge pipes: the air the turbo compresses is cooled before it goes into the cylinders.',
  'Паливо': 'Fuel',
  'Паливний бак під заднім сидінням.': 'The fuel tank under the rear seat.',
};
