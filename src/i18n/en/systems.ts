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
  'Як двигун позбувається тепла і як олива доходить до підшипників. Усе це видно в шарах оливи й охолодження в рентгені. На цифри двигуна впливають лише картер і кількість оливи.':
    'How the engine gets rid of its heat and how oil reaches the bearings. All of it shows in the oil and cooling layers of the X-ray. Only the sump and the amount of oil change the engine’s figures.',
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
  // Coolant layer
  'Насос охолоджувальної рідини': 'Water pump',
  'Відцентровий насос: крильчатка відкидає рідину до стінок і жене її в сорочку блока. Подача росте разом з обертами. Приводить його ремінь від колінвала або ремінь чи ланцюг ГРМ.':
    'A centrifugal pump: its impeller flings the coolant outward and drives it into the water jacket. Its flow rises with rpm. A belt from the crank, or the timing belt or chain, drives it.',
  'Сорочка охолодження': 'Water jacket',
  'Порожнини в литві блока й головки навколо циліндрів і камер згоряння. Рідина йде вздовж циліндрів, піднімається крізь отвори прокладки в головку і найбільше тепла забирає біля випускних клапанів.':
    'Passages cast into the block and head around the cylinders and combustion chambers. Coolant runs along the cylinders, rises through holes in the head gasket and picks up most heat around the exhaust valves.',
  'Термостат': 'Thermostat',
  'Восковий клапан між двигуном і радіатором. Поки рідина холодна, він закритий, і вона ходить малим колом через обвідний шланг, тож двигун прогрівається швидше. Близько 88 °C віск плавиться, тарілка піднімається і відкриває шлях у радіатор.':
    'A wax valve between the engine and the radiator. While the coolant is cold it stays shut and the coolant goes round the bypass circuit, so the engine warms up sooner. At about 88 °C the wax melts, the valve lifts and opens the way to the radiator.',
  'Обвідний шланг': 'Bypass hose',
  'Мале коло: поки термостат закритий, рідина з головки одразу повертається в насос, минаючи радіатор. Тепло лишається в двигуні, і він швидше доходить до робочої температури.':
    'The bypass circuit: while the thermostat is shut, coolant from the head goes straight back to the pump, past the radiator. The heat stays in the engine and it reaches its working temperature sooner.',
  'Патрубок радіатора': 'Radiator hose',
  'Товстий шланг до радіатора: верхній несе гарячу рідину від термостата, нижній повертає охолоджену до насоса. Сам радіатор стоїть перед двигуном і тут не намальований.':
    'A fat hose to the radiator: the upper one carries hot coolant from the thermostat, the lower one brings it back cooled to the pump. The radiator itself sits ahead of the engine and is not drawn here.',
  'Патрубок пічки': 'Heater hose',
  'Частина гарячої рідини йде в маленький радіатор пічки в салоні й повертається до насоса. Кран пічки зазвичай прикритий, тому потік тут слабкий. Самої пічки тут не намальовано.':
    'Some hot coolant goes to the small heater core in the cabin and returns to the pump. The heater valve is usually half shut, so the flow here is weak. The heater itself is not drawn.',
  'Охолодження турбіни рідиною': 'Turbo water cooling',
  'Корпус підшипників бензинової турбіни обмиває охолоджувальна рідина. Після вимкнення гарячого двигуна вона ще кипить у корпусі й сама циркулює, не даючи оливі в підшипниках закоксуватися.':
    'Coolant washes round the bearing housing of a gasoline turbo. After a hot engine is switched off it keeps boiling in the housing and circulates by itself, so the oil in the bearings does not coke.',
  'Ребра охолодження': 'Cooling fins',
  'Двигун повітряного охолодження не має сорочки з рідиною: тепло з циліндрів і головок забирають тонкі ребра, які обдуває повітря. Що більше ребер і швидший потік, то менше гріється метал.':
    'An air-cooled engine has no water jacket: thin fins blown by air carry the heat away from the cylinders and heads. The more fins and the faster the air, the cooler the metal.',
  'Вентилятор охолодження': 'Cooling fan',
  'Гонить повітря крізь ребра циліндрів і головок, навіть коли авто стоїть. Тут він на носку колінвала, як у Citroën 2CV, а в Beetle і Porsche 911 він сидить окремо і приводиться ременем.':
    'Blows air through the fins of the cylinders and heads, even when the car is standing still. Here it sits on the crank nose, as on the Citroën 2CV; on the Beetle and the Porsche 911 it sits apart and is belt-driven.',
  'Рідина в корпусі ротора': 'Coolant in the rotor housing',
  'У роторного двигуна рідина йде каналами в стінках корпусів роторів і бічних корпусів уздовж усього двигуна. Найгарячіше місце біля свічок, де відбуваються спалахи.':
    'In a rotary engine the coolant runs through passages in the walls of the rotor housings and side housings along the whole engine. The hottest spot is by the plugs, where combustion happens.',
  'Охолодження: насос, сорочка, термостат, патрубки радіатора': 'Cooling: pump, water jacket, thermostat, radiator hoses',
  'Рідина {t} °C': 'Coolant {t} °C',
  'термостат {s} %': 'thermostat {s} %',
  'Повітряне охолодження · олива {t} °C': 'Air cooling · oil {t} °C',
  'велике коло: через радіатор': 'radiator circuit: through the radiator',
  'мале коло: радіатор закритий': 'bypass circuit: radiator shut',
  'термостат відкривається: частина йде в радіатор': 'thermostat opening: some goes to the radiator',
  'Перегрів': 'Overheating',
  // Fuel and ignition layer
  'Паливна магістраль': 'Fuel line',
  'Трубка від бака. Електричний насос у баку гонить паливо до двигуна, а надлишок повертається назад. Бака тут не намальовано.':
    'The line from the tank. An electric pump in the tank sends fuel to the engine, and what is not used goes back. The tank is not drawn.',
  'Паливна рампа': 'Fuel rail',
  'Труба, з якої паливо під тиском розходиться по форсунках. Для впускних каналів тиск 3–4 бар, для безпосереднього упорскування до 200 бар, у дизельному Common Rail до 1600–2000 бар.':
    'A pipe that holds fuel under pressure and feeds every injector. About 3-4 bar for port injection, up to 200 bar for direct injection, 1,600-2,000 bar in a diesel common rail.',
  'Форсунка у впускному каналі': 'Port injector',
  'Електромагнітний клапан, що бризкає паливо в канал на закритий впускний клапан. Суміш встигає випаруватись, поки клапан відкриється. Блок керування рахує, скільки мілісекунд тримати форсунку відкритою.':
    'A solenoid valve that sprays fuel into the port onto the closed intake valve. The mixture has time to evaporate before the valve opens. The control unit works out how many milliseconds to hold it open.',
  'Форсунка безпосереднього упорскування': 'Direct injector',
  'Бризкає паливо прямо в циліндр під тиском до 200 бар, найчастіше на такті впуску. Випаровуючись у циліндрі, паливо охолоджує заряд, тож можна більше стиснення без детонації.':
    'Sprays fuel straight into the cylinder at up to 200 bar, mostly during the intake stroke. Evaporating in the cylinder, the fuel cools the charge, which allows more compression without knock.',
  'Паливний насос високого тиску': 'High-pressure fuel pump',
  'Плунжерний насос на кінці розподільчого вала. Кулачок штовхає плунжер, і кожен його хід дотискає паливо в рампу безпосереднього упорскування.':
    'A plunger pump on the end of a camshaft. A cam lobe pushes the plunger, and each stroke tops up the pressure in the direct-injection rail.',
  'Карбюратор': 'Carburetor',
  'Повітря прискорюється у звуженні, дифузорі, і розрідження там висмоктує паливо з поплавкової камери. Що більше повітря, то більше палива: суміш складається сама, без електроніки.':
    'Air speeds up in a narrowing, the venturi, and the low pressure there draws fuel from the float bowl. More air brings more fuel: the mixture makes itself, without electronics.',
  'Механічний паливний насос': 'Mechanical fuel pump',
  'Діафрагмовий насос на блоці, який приводить ексцентрик розподільчого вала. Він подає паливо в поплавкову камеру карбюратора під невеликим тиском.':
    'A diaphragm pump on the block, worked by an eccentric on the camshaft. It feeds fuel to the carburetor float bowl at low pressure.',
  'Дозатор механічного упорскування': 'Mechanical fuel distributor',
  'У системах на зразок Bosch K-Jetronic заслінка в потоці повітря рухає плунжер дозатора, і він ділить паливо між форсунками. Форсунки бризкають безперервно, а не імпульсами.':
    'In systems like the Bosch K-Jetronic, a plate in the airflow moves the distributor plunger, which shares the fuel among the injectors. The injectors spray all the time, not in pulses.',
  'Дизельна форсунка': 'Diesel injector',
  'Впорскує паливо в гаряче стиснене повітря біля верхньої мертвої точки, і воно спалахує саме. Сучасна форсунка робить кілька коротких упорскувань за цикл: пілотне згладжує стукіт, основне дає роботу.':
    'Injects fuel into the hot compressed air near top dead centre, where it lights by itself. A modern injector makes several short shots per cycle: the pilot softens the knock, the main one does the work.',
  'Насос-форсунка': 'Unit injector',
  'Насос і форсунка в одному корпусі, по одній на циліндр. Окремий кулачок розподільчого вала через коромисло тисне на плунжер і створює тиск понад 2000 бар просто над камерою.':
    'Pump and injector in one body, one per cylinder. Its own cam lobe presses the plunger through a rocker and makes over 2,000 bar right above the chamber.',
  'Насос високого тиску дизеля': 'Diesel injection pump',
  'Рядний насос має по плунжеру на циліндр і окрему трубку до кожної форсунки; насос Common Rail тримає тиск у спільній рампі. Приводить його шестерня або ремінь ГРМ.':
    'An inline pump has a plunger per cylinder and its own line to each injector; a common-rail pump keeps the pressure in a shared rail. A gear or the timing belt drives it.',
  'Трубка високого тиску': 'High-pressure line',
  'Товстостінна сталева трубка від насоса до форсунки. На рядному насосі вони однакової довжини, щоб імпульс тиску приходив до кожної форсунки за той самий час.':
    'A thick-walled steel line from the pump to an injector. On an inline pump they are of equal length so the pressure pulse reaches every injector in the same time.',
  'Форкамера': 'Prechamber',
  'Маленька камера в головці над циліндром. Паливо впорскується в неї, займається там і гарячим струменем вилітає в циліндр. Такий дизель м’якший, але гірше заводиться на холодну і витрачає більше.':
    'A small chamber in the head above the cylinder. Fuel is injected into it, lights there and bursts into the cylinder as a hot jet. Such a diesel is smoother, but starts worse when cold and uses more fuel.',
  'Свічка розжарювання': 'Glow plug',
  'Тонкий стрижень, що розжарюється в камері на холодному пуску дизеля. Поки стиснення ще не гріє повітря досить, він допомагає паливу спалахнути.':
    'A thin rod that glows hot in the chamber when a diesel starts from cold. Until compression heats the air enough, it helps the fuel light.',
  'Свічка запалювання': 'Spark plug',
  'Іскра між її електродами підпалює суміш трохи раніше за верхню мертву точку: полум’ю потрібен час, щоб тиск піднявся саме тоді, коли поршень почне йти вниз.':
    'A spark between its electrodes lights the mixture a little before top dead centre: the flame needs time, so the pressure rises just as the piston starts down.',
  'Розподільник запалювання': 'Distributor',
  'Обертається вдвічі повільніше за колінвал і по черзі з’єднує одну котушку з дротом кожної свічки. Бігунок під кришкою вказує на того, хто зараз отримає іскру.':
    'Turns at half crank speed and connects one coil in turn to each plug lead. The rotor arm under the cap points at the plug that gets the spark next.',
  'Високовольтний дріт': 'Ignition lead',
  'Несе десятки тисяч вольт від котушки чи розподільника до свічки.':
    'Carries tens of thousands of volts from the coil or distributor to the plug.',
  'Провідна свічка': 'Leading plug',
  'Нижня свічка роторного двигуна. Вона спалахує першою і запалює суміш у передній за ходом ротора частині камери.':
    'The lower plug of a rotary engine. It fires first and lights the mixture in the part of the chamber ahead in the rotor’s travel.',
  'Відстаюча свічка': 'Trailing plug',
  'Верхня свічка роторного двигуна. Вона іскрить на 10–15° пізніше за провідну і допалює суміш у задній частині довгої камери.':
    'The upper plug of a rotary engine. It fires 10-15° after the leading one and burns the mixture at the rear of the long chamber.',
  'Паливо і запалювання: форсунки, свічки, котушки': 'Fuel and ignition: injectors, plugs, coils',
  '{deg}° до ВМТ': '{deg}° before TDC',
  '{deg}° після ВМТ': '{deg}° after TDC',
  'Карбюратор: потік повітря підхоплює паливо в дифузорі': 'Carburetor: the airflow draws fuel in the venturi',
  'Безперервне упорскування: форсунки бризкають весь час': 'Continuous injection: the injectors spray all the time',
  'основне упорскування {a}': 'main injection {a}',
  'Тиск у рампі {p} бар': 'Rail pressure {p} bar',
  'пілотне перед ним': 'a pilot before it',
  'Упорскування': 'Injection',
  'Іскра': 'Spark',
  'Упорскування {ms} мс, закінчується за {deg}° до відкриття впускного клапана': 'Injection {ms} ms, ending {deg}° before the intake valve opens',
  'Упорскування {ms} мс, закінчується за {deg}° до відкриття впускного вікна': 'Injection {ms} ms, ending {deg}° before the intake port opens',
  'Електромагнітний клапан, що бризкає паливо в канал перед впускним вікном. Клапанів у роторного двигуна немає: вікно відкриває і закриває сама грань ротора, яка проходить повз нього. Блок керування рахує, скільки мілісекунд тримати форсунку відкритою.':
    'A solenoid valve that sprays fuel into the runner ahead of the intake port. A rotary has no valves: the rotor face sweeping past opens and closes the port itself. The control unit works out how many milliseconds to hold it open.',
  'Тиск {p} бар': 'Pressure {p} bar',
  'упорскування на такті впуску, {ms} мс': 'injection on the intake stroke, {ms} ms',
  'У канали {share} %, решта в циліндри': 'Ports {share} %, the rest into the cylinders',
  'Двигун стоїть: палива немає': 'Engine stopped: no fuel',
  'Свічки розжарювання ввімкнено': 'Glow plugs on',
  'Провідна свічка {a}, відстаюча {b}': 'Leading plug {a}, trailing {b}',
  'Іскра {a}': 'Spark {a}',
  // Air layer
  'Повітря': 'Air',
  'Повітряний фільтр': 'Air filter',
  'Коробка з паперовим фільтром, крізь яку двигун вдихає повітря. Забірний патрубок зазвичай бере холодне повітря подалі від гарячого двигуна.':
    'A box with a paper filter that the engine breathes through. Its snorkel usually draws cool air from away from the hot engine.',
  'Датчик витрати повітря': 'Mass airflow sensor',
  'Нагріта плівка в потоці охолоджується тим сильніше, чим більше повітря проходить. За цим блок керування знає, скільки грамів повітря на секунду вдихає двигун, і дозує паливо.':
    'A heated film in the airflow cools the more air passes it. From that the control unit knows how many grams of air per second the engine takes in, and meters the fuel.',
  'Дросельна заслінка': 'Throttle plate',
  'Поворотна заслінка, яку відкриває педаль газу. Вона не дає двигуну більше палива, а пропускає більше повітря; паливо додає блок керування слідом. У дизеля заслінки немає: він регулюється кількістю палива.':
    'A turning plate that the gas pedal opens. It does not give the engine fuel; it lets in more air, and the control unit adds fuel to match. A diesel has none: it is controlled by the amount of fuel.',
  'Виходи до інтеркулера': 'To and from the intercooler',
  'Стиснене повітря виходить із компресора гарячим і йде до інтеркулера перед радіатором, а повертається охолодженим і щільнішим. Сам інтеркулер тут не намальовано.':
    'Compressed air leaves the compressor hot and goes out to the intercooler ahead of the radiator, coming back cooler and denser. The intercooler itself is not drawn.',
  'Повітропровід': 'Air intake duct',
  'Труба від повітряного фільтра до дросельної заслінки або до компресора турбіни.':
    'The pipe from the air filter to the throttle body or to the turbo compressor.',
  'Механічний нагнітач': 'Supercharger',
  'Насос, який крутить ремінь від колінвала, нагнітає повітря у впуск. Тиск є вже з низів, але нагнітач забирає частину потужності і гріє повітря.':
    'A pump turned by a belt from the crank forces air into the intake. It gives boost from low rpm, but takes some power and heats the air.',
  'Повітря: фільтр, дросель, ресивер, патрубки, наддув': 'Air: filter, throttle, plenum, runners, boost',
  'Повітря {g} г/с': 'Air {g} g/s',
  'Двигун стоїть: повітря не йде': 'Engine stopped: no air flows',
  'Наддув {b} бар · після компресора {t2} °C · після інтеркулера {t3} °C': 'Boost {b} bar · after the compressor {t2} °C · after the intercooler {t3} °C',
  'Дроселя немає: дизелем керує кількість палива': 'No throttle: a diesel is run by the amount of fuel',
  'Тиск у ресивері {p} бар': 'Plenum pressure {p} bar',
  'Наддув {b} бар · після компресора {t2} °C': 'Boost {b} bar · after the compressor {t2} °C',
};
