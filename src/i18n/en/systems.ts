// English for the engine systems layers and their designer controls: Ukrainian source text to English.
export const SYSTEMS_EN: Record<string, string> = {
  // Hardware names (src/designer/systems.ts)
  'карбюратор': 'carburetor',
  'механічне безперервне упорскування': 'mechanical continuous injection',
  'упорскування у впускні канали': 'port injection',
  'безпосереднє упорскування': 'direct injection',
  'упорскування в канали й у циліндри': 'port and direct injection',
  'дизель із форкамерою': 'prechamber diesel',
  'дизель із насосом високого тиску': 'diesel with an injection pump',
  'насос-форсунки': 'unit injectors',
  'Common Rail': 'common rail',
  'рідинне': 'liquid',
  'повітряне, вентилятором': 'air, by a fan',
  'повітряне, набігаючим потоком': 'air, by ram air',
  'теплообмінник у рідину': 'oil-to-coolant heat exchanger',
  'радіатор у потоці повітря': 'air-cooled oil cooler',
  'котушка на кожній свічці': 'coil-on-plug',
  'холоста іскра': 'wasted spark',
  'розподільник': 'distributor',
  'на носку колінвала': 'on the crank nose',
  'у піддоні, ланцюгом': 'in the pan, chain-driven',
  'у піддоні, валиком': 'in the pan, shaft-driven',
  // Article
  'Подача палива': 'Fuel delivery',
  'Охолодження': 'Cooling',
  'систему живлення': 'fuel system',
  'тип охолодження': 'cooling type',
  'оливний радіатор': 'oil cooler',
  'охолодження поршнів оливою': 'piston cooling jets',
  'кількість свічок': 'number of spark plugs',
  'систему запалювання': 'ignition system',
  'свічки розжарювання': 'glow plugs',
  'привід оливного насоса': 'oil pump drive',
  'оливний фільтр': 'oil filter',
  // Designer controls
  'Яке саме обладнання подає паливо: карбюратор, форсунки в каналах чи в циліндрах, насос-форсунки дизеля. Видно в шарі палива в рентгені. Модель потужності знає лише, чи упорскування безпосереднє.':
    'Which hardware delivers the fuel: a carburetor, injectors in the ports or in the cylinders, diesel unit injectors. Shown in the fuel layer of the X-ray. The power model only knows whether injection is direct.',
  'Запалювання': 'Ignition',
  'Котушка на свічці': 'Coil-on-plug',
  'Холоста іскра': 'Wasted spark',
  'Розподільник': 'Distributor',
  'Окрема котушка над кожною свічкою, одна котушка на пару циліндрів, яка іскрить в обох щоразу, або одна котушка з розподільником, що роздає іскру дротами. Видно в шарі палива. У моделі потужності не враховано.':
    'A coil over every plug, one coil per pair of cylinders that sparks in both every time, or one coil with a distributor that hands the spark out through leads. Shown in the fuel layer. Not part of the power model.',
  'Свічок на циліндр': 'Spark plugs per cylinder',
  "Дві свічки підпалюють суміш з двох боків, і полум'я швидше проходить велику камеру. Так роблять у великих циліндрах і на старих авіаційних та гоночних двигунах. Видно в шарі палива. У моделі потужності не враховано.":
    'Two plugs light the mixture from two sides, so the flame crosses a large chamber sooner. Large cylinders and old aircraft and racing engines do this. Shown in the fuel layer. Not part of the power model.',
  'Свічки розжарювання': 'Glow plugs',
  'Розжарені стрижні в камерах допомагають холодному дизелю запуститися, поки стиснення ще не гріє повітря досить. Видно в шарі палива. У моделі потужності не враховано.':
    'Glowing rods in the chambers help a cold diesel start while compression does not yet heat the air enough. Shown in the fuel layer. Not part of the power model.',
  'Охолодження і мащення': 'Cooling and lubrication',
  'Як двигун позбувається тепла і як олива доходить до підшипників. Усе це видно в шарах оливи й охолодження в рентгені, а на потужність у моделі не впливає.':
    'How the engine gets rid of its heat and how oil reaches the bearings. All of it shows in the oil and cooling layers of the X-ray and does not change the power model.',
  'Рідина': 'Liquid',
  'Вентилятор': 'Fan',
  'Набігаючий потік': 'Ram air',
  'Рідина відводить тепло від сорочки в радіатор. Повітряний двигун має ребра на циліндрах і головках, і їх обдуває вентилятор або, як на мотоциклі, зустрічний потік. Видно в шарі охолодження.':
    'Coolant carries the heat from the water jacket to the radiator. An air-cooled engine has fins on its cylinders and heads, blown by a fan or, as on a motorcycle, by the oncoming air. Shown in the cooling layer.',
  'Оливний радіатор': 'Oil cooler',
  'У рідину': 'Into coolant',
  'У повітря': 'Into air',
  'Теплообмінник віддає тепло оливи охолоджувальній рідині, а радіатор у потоці повітря віддає його прямо повітрю. Двигунам з турбіною, дизелям і повітряним він потрібен найбільше. Видно в шарі оливи.':
    'A heat exchanger passes the oil’s heat to the coolant, and a cooler in the airflow gives it straight to the air. Turbocharged, diesel and air-cooled engines need one most. Shown in the oil layer.',
  'Охолодження поршнів оливою': 'Piston cooling jets',
  'Форсунки знизу циліндрів бризкають оливою на днище поршня і забирають тепло. Потрібні двигунам з наддувом і дизелям. Видно в шарі оливи: тиск після їх відкриття росте повільніше. У моделі потужності не враховано.':
    'Jets under the cylinders spray oil at the underside of the piston crown and carry heat away. Boosted engines and diesels need them. Shown in the oil layer: once they open, the pressure rises more slowly. Not part of the power model.',
  'Привід оливного насоса': 'Oil pump drive',
  'Від колінвала': 'From the crank',
  'Ланцюгом': 'By chain',
  'Валиком': 'By shaft',
  'Насос на носку колінвала крутиться з ним разом. Насос у піддоні приводить окремий ланцюг або валик від розподільчого чи допоміжного вала. Видно в шарі оливи.':
    'A pump on the crank nose turns with the crank. A pump in the pan is driven by its own chain, or by a shaft from the camshaft or an auxiliary shaft. Shown in the oil layer.',
  'Повнопотоковий оливний фільтр': 'Full-flow oil filter',
  'Уся олива від насоса проходить крізь паперовий фільтр. Старі двигуни, як Beetle, мали лише сітку на забірнику. Видно в шарі оливи.':
    'All the oil from the pump passes through a paper filter. Old engines like the Beetle had only a screen on the pickup. Shown in the oil layer.',
};
