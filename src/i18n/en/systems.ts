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
  // Oil layer parts (src/scene/systems/parts.ts)
  'Оливоприймач': 'Oil pickup',
  'Трубка із сіткою на кінці, опущена під рівень оливи в піддоні. Через неї насос засмоктує оливу. Якщо олива відхлюпне від сітки в повороті, насос хапне повітря, і тиск упаде.':
    'A tube with a screen on its end, dipped below the oil in the pan. The pump draws its oil through it. If the oil sloshes away from the screen in a corner, the pump gulps air and the pressure drops.',
  'Оливний насос': 'Oil pump',
  'Об’ємний насос: за кожен оберт він подає той самий об’єм оливи, тому подача росте разом з обертами. Найчастіше це героторний насос на носку колінвала, а буває і насос у піддоні з власним ланцюгом чи валиком.':
    'A positive-displacement pump: every turn it delivers the same volume of oil, so its delivery rises with rpm. Most often it is a gerotor pump on the crank nose; some engines have a pump in the pan with its own chain or shaft.',
  'Редукційний клапан': 'Pressure relief valve',
  'Пружинний клапан на виході насоса. Насос подає тим більше оливи, чим швидше крутиться, тому приблизно від 5 бар клапан відкривається і повертає надлишок назад на вхід насоса. Без нього на холодній оливі тиск розірвав би фільтр.':
    'A spring-loaded valve at the pump outlet. The faster the pump turns, the more oil it delivers, so at about 5 bar the valve opens and returns the surplus to the pump inlet. Without it, cold oil would burst the filter.',
  'Оливний фільтр': 'Oil filter',
  'Уся олива від насоса проходить крізь паперовий фільтр, перш ніж дістатися підшипників. Його перепускний клапан відкривається, коли фільтр забився або олива дуже густа: краще брудна олива, ніж жодної.':
    'All the oil from the pump passes through a paper filter before it reaches the bearings. Its bypass valve opens when the filter is clogged or the oil is very thick: dirty oil is better than none.',
  'Охолоджує оливу. Пакет пластин між фільтром і блоком віддає тепло охолоджувальній рідині, а радіатор спереду в потоці повітря віддає його повітрю. Сам радіатор спереду авто тут не намальовано, лише патрубки до нього.':
    'Cools the oil. A plate pack between the filter and the block hands the heat to the coolant, and a cooler up front in the airflow gives it to the air. The cooler at the front of the car is not drawn here, only the lines to it.',
  'Головна оливна магістраль': 'Main oil gallery',
  'Довгий канал, просвердлений уздовж блока. Від нього короткі свердління ведуть до кожного корінного підшипника, а звідти олива йде далі в колінвал і в головку.':
    'A long passage drilled along the block. Short drillings lead from it to every main bearing, and from there the oil goes on into the crankshaft and up to the head.',
  'Канали в колінвалі': 'Crankshaft oil drillings',
  'Скісні свердління від корінних шийок до шатунних. Олива з корінного підшипника йде всередину вала й виходить на шатунній шийці, тому шатунні підшипники мащені, хоча самі ні до чого не прикручені. Свердління обертаються разом із валом.':
    'Angled drillings from the main journals to the crankpins. Oil from a main bearing enters the shaft and comes out at the crankpin, so the rod bearings are oiled although nothing is plumbed to them. The drillings turn with the shaft.',
  'Подача оливи в головку': 'Oil feed to the head',
  'Вертикальний канал піднімає оливу в головку, а там вона йде вздовж головки до шийок розподільчих валів, гідрокомпенсаторів і коромисел. У двигуні зі штангами олива йде від штовхачів угору порожнистими штангами.':
    'A vertical passage takes the oil up to the head, where it runs along to the camshaft journals, the hydraulic lifters and the rockers. In a pushrod engine the oil goes from the lifters up through hollow pushrods.',
  'Форсунка охолодження поршня': 'Piston cooling jet',
  'Тонке сопло знизу циліндра бризкає оливою на днище поршня. Клапан у форсунці відкривається лише при тиску близько 2 бар, щоб на холостому оливи вистачало підшипникам. Такі форсунки потрібні двигунам із наддувом і дизелям.':
    'A thin nozzle under the cylinder sprays oil at the underside of the piston crown. Its valve opens only at about 2 bar, so the bearings get enough oil at idle. Boosted engines and diesels need these jets.',
  'Мащення турбіни': 'Turbo oil supply',
  'Вал турбіни крутиться до 200 тисяч обертів за хвилину на плівці оливи. Тонка трубка подає оливу згори, а товста зливна йде круто вниз: олива стікає самопливом, і будь-який підйом на зливі заллє турбіну оливою.':
    'The turbo shaft spins at up to 200,000 rpm on a film of oil. A thin line feeds oil from above, and a fat drain falls steeply away: the oil runs out by gravity, and any rise in the drain would flood the turbo with oil.',
  'Відкачувальний насос турбіни': 'Turbo scavenge pump',
  'Якщо турбіна стоїть нижче за рівень оливи в картері, олива з неї самопливом не стече. Тоді її відкачує окремий маленький насос або окрема секція оливного насоса і повертає в картер.':
    'If the turbo sits below the oil level in the crankcase, its oil cannot drain by gravity. A small pump of its own, or a section of the oil pump, then scavenges it back to the crankcase.',
  'Злив оливи': 'Oil drain',
  'Олива з головки стікає каналами в стінках блока назад у піддон. Зливи виходять вище рівня оливи, щоб колінвал її не збивав у піну.':
    'Oil from the head runs back down passages in the block walls into the pan. The drains come out above the oil level so the crank does not whip it into foam.',
  'Рівень оливи': 'Oil level',
  'Олива в піддоні. Колінвал крутиться над нею, не торкаючись, а забірник насоса лежить на дні. На сухому картері оливи в піддоні майже немає, її тримає окремий бак.':
    'The oil in the pan. The crank turns above it without touching, and the pump pickup lies near the bottom. A dry sump keeps almost no oil in the pan: a separate tank holds it.',
  'Оливний бак сухого картера': 'Dry-sump oil tank',
  'Окремий бак, куди відкачувальні ступені насоса зганяють оливу з картера. Насос тиску бере оливу з бака, тож на перевантаженнях у повороті він не хапає повітря.':
    'A separate tank the scavenge stages pump the oil into from the crankcase. The pressure stage draws from the tank, so it does not gulp air under cornering loads.',
  'Охолодження ротора оливою': 'Rotor oil cooling',
  'Ротор гріється від спалахів з усіх боків, а рідина до нього не дістає. Тому жиклери в ексцентриковому валу бризкають оливою всередину ротора, і вона забирає тепло.':
    'The rotor is heated by combustion on every side, and coolant cannot reach it. So jets in the eccentric shaft spray oil inside the rotor, and the oil carries the heat away.',
  'Дозувальний оливний насос': 'Metering oil pump',
  'Маленький насос, що подає крапельки оливи прямо в камери роторного двигуна. Вона змащує апексні ущільнення і згоряє разом із сумішшю, тому роторний двигун завжди трохи витрачає оливу.':
    'A small pump that feeds drops of oil straight into the chambers of a rotary engine. It lubricates the apex seals and burns with the mixture, which is why a rotary always uses a little oil.',
  'Оливна форсунка ротора': 'Rotor oil nozzle',
  'Сопло дозувального насоса. На 13B одне стоїть у впускному каналі, друге вгорі корпусу ротора: олива потрапляє до ущільнень разом із сумішшю.':
    'A nozzle of the metering pump. On the 13B one sits in the intake port and another at the top of the rotor housing: the oil reaches the seals with the mixture.',
  // Systems switches and readout (src/ui/systems-view.ts)
  'Олива': 'Oil',
  'Шлях оливи: насос, фільтр, магістраль, підшипники, головка': 'Oil path: pump, filter, gallery, bearings, head',
  'Системи': 'Systems',
  'Шари систем у рентгені': 'System layers in the X-ray',
  'Стан систем двигуна': 'Engine systems status',
  'Холодний пуск': 'Cold start',
  'Прогріти': 'Warm up',
  'Прогрів показано у {n} разів швидше': 'Warm-up shown {n} times faster',
  'Шари систем видно в рентгені': 'System layers show in the X-ray',
  'Двигун не заведено: показано холостий хід': 'Engine not started: showing idle',
  'Сповільнено: як на холостому ходу': 'Slowed down: as at idle',
  'Тиск оливи {p} бар': 'Oil pressure {p} bar',
  'олива {t} °C': 'oil {t} °C',
  'Редукційний клапан відкритий': 'Relief valve open',
  'Форсунки поршнів працюють': 'Piston jets spraying',
  'Тиск оливи майже нуль': 'Oil pressure almost zero',
  'Редукційний клапан відкрився': 'Relief valve opened',
};
