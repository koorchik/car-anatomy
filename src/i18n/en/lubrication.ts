// English for the oil sump page, the lap and the lubrication controls: Ukrainian source text to English.
export const LUBRICATION_EN: Record<string, string> = {
  // The test circuit (src/vehicle/track.ts)
  'Тестове коло': 'Test circuit',
  'Пряма старт-фініш': 'Start-finish straight',
  'Шпилька': 'Hairpin',
  'Шикана': 'Chicane',
  'Слалом': 'Slalom',
  'Швидка дуга': 'Fast sweeper',
  'Задня пряма з горбом': 'Back straight with a crest',
  'Карусель': 'Carousel',
  'Правий': 'Right-hander',
  // Tyres (src/vehicle/vehicle.ts)
  'Дорожні': 'Street',
  'Напівсліки': 'Semi-slicks',
  'Сліки': 'Slicks',
  // Sump kinds and the article (src/designer/lubrication.ts, src/ui/article.ts)
  'мокрий картер': 'wet sump',
  'мокрий картер із перегородками': 'baffled wet sump',
  'інтегрований сухий картер': 'integrated dry sump',
  'сухий картер': 'dry sump',
  'Мащення': 'Lubrication',
  '{kind}, {litres} л оливи': '{kind}, {litres} L of oil',
  'тип мащення': 'the lubrication system',
  'об’єм оливи': 'the oil capacity',
  '{link}: як олива в піддоні поводиться на треку і чи дістане її насос.': '{link}: how the oil in the pan behaves on track and whether the pump can still reach it.',
  'Мащення на треку': 'Oil on track',
  // Designer limits (src/designer/constraints.ts)
  'З меншою кількістю оливи забірник не буде під нею навіть на стоянці.': 'With less oil the pickup would not be covered even at rest.',
  'Більше оливи вже не вміститься в розумний піддон чи бак.': 'More oil would no longer fit a sensible pan or tank.',
  // Designer controls, figures and diagnosis (src/ui/designer/params.ts, src/designer/*.ts)
  'Картер': 'Sump',
  'Мокрий': 'Wet',
  'З перегородками': 'Baffled',
  'Інтегрований сухий': 'Integrated dry',
  'Сухий': 'Dry',
  'Як олива повертається до насоса. Сухий картер дає мілкий піддон і нижчий колінвал, менше втрат на розбризкування оливи, але важчий. Мокрий найпростіший, але на треку забірник може опинитися над оливою. Перегородки й відкачування головок тримають оливу біля забірника.':
    'How the oil gets back to the pump. A dry sump gives a shallow pan and a lower crank and loses less to oil churned by the crank, but weighs more. A wet sump is simplest, but on track its pickup can end up above the oil. Baffles and head scavenging keep the oil at the pickup.',
  'л': 'L',
  'Більше оливи дає глибший піддон: колінвал стоїть вище, зате на виражах забірнику є з чого брати. У сухого картера олива живе в баку, тому висота від неї не залежить.':
    'More oil needs a deeper pan, so the crank sits higher, but the pickup has more to draw from in long corners. A dry sump keeps its oil in the tank, so its height does not depend on it.',
  'Колінвал над дном піддона': 'Crank over the pan floor',
  '{mm} мм': '{mm} mm',
  'Бак оливи': 'Oil tank',
  'Оливи в піддоні': 'Oil in the pan',
  'Маса мащення': 'Lubrication mass',
  '+{kg} кг': '+{kg} kg',
  'Висота колінвала над дном піддона': 'Crank height over the pan floor',
  'Об’єм оливи': 'Oil capacity',
  'Глибокий піддон': 'Deep oil pan',
  'Вісь колінвала стоїть на {mm} мм над дном піддона: двигун доведеться посадити вище, або піддон зачепить дорогу.':
    'The crank axis is {mm} mm above the pan floor: the engine has to sit higher, or the pan will hit the road.',
  'Менше оливи або сухий картер з окремим баком.': 'Less oil, or a dry sump with a separate tank.',
  'Замало оливи': 'Too little oil',
  'Навіть на прямій на межі обертів забірник лише на {mm} мм під оливою: решта в головках і на стінках.':
    'Even on a straight at the rev limit the pickup is only {mm} mm under the oil: the rest is in the heads and on the walls.',
  'Більше оливи, глибший піддон або сухий картер.': 'More oil, a deeper pan or a dry sump.',
  // The bearing failure (src/designer/reliability.ts)
  'Голодування вкладишів': 'Bearing oil starvation',
  'Олива не доходить до шатунних шийок, коли тиск у магістралі падає нижче потрібного.': 'Oil does not reach the crankpins when the gallery pressure falls below what they need.',
  'Більше оливи, перегородки в піддоні або сухий картер.': 'More oil, baffles in the pan or a dry sump.',
  'Провернуло шатунний вкладиш: олива не дійшла до підшипника.': 'A rod bearing spun: the oil did not reach it.',
  // The car selection (src/data/sump-cars.ts)
  'Заводський мокрий картер великого V8: багато оливи, але й багато її в обігу на високих обертах.': 'The factory wet sump of a big V8: plenty of oil, but plenty of it in circulation at high revs too.',
  'Опозитний мокрий картер: на довгому повороті олива збирається в головці на зовнішньому боці.': 'A boxer’s wet sump: in a long corner the oil collects in the head on the outside.',
  'Поперечний двигун: у повороті олива тече вздовж колінвала, а на гальмуванні поперек піддона.': 'A transverse engine: in a corner the oil runs along the crank, under braking across the pan.',
  'Інтегрований сухий картер 9A1: олива в самому двигуні, але ступені відкачування забирають її з головок.': 'The 9A1’s integrated dry sump: the oil stays in the engine, but scavenge stages pull it out of the heads.',
  'Сухий картер з окремим баком. Двигун стоїть шківом назад, тож гальмування жене оливу до маховика.': 'A dry sump with a separate tank. The engine sits pulley rearward, so braking drives the oil toward the flywheel.',
  'Шестиступінчастий сухий картер з окремим відкачуванням кожного відсіку колінвала.': 'A six-stage dry sump that scavenges every crank bay separately.',
  // Parts of the page's 3D (src/scene/lubrication/parts.ts)
  'Олива в піддоні': 'Oil in the pan',
  'На гальмуванні й у поворотах олива відкочується до стінки піддона, а її поверхня нахиляється і хлюпає. Якщо вона відійде від сітки забірника, насос засмокче повітря.':
    'Under braking and in corners the oil runs to one wall of the pan, and its surface tilts and sloshes. If it leaves the pickup screen, the pump draws air.',
  'Перегородка заводського піддона': 'Factory pan baffle',
  'Невисокі стінки навколо колодязя з вирізами. Вони гасять хлюпання і трохи затримують оливу біля забірника, але в довгому повороті олива все одно переливається через них.':
    'Low walls with cut-outs round the well. They calm the sloshing and hold the oil by the pickup for a moment, but in a long corner it still spills over them.',
  'Коробка навколо забірника': 'Box round the pickup',
  'Трековий піддон тримає оливу біля забірника в закритій коробці. Олива заходить усередину крізь дверцята, а назовні виходить лише щілинами, тож коробка лишається повною довше за поворот.':
    'A track pan keeps the oil by the pickup in a closed box. Oil comes in through trap doors and leaks out only through gaps, so the box stays full longer than a corner lasts.',
  'Дверцята перегородки': 'Trap door',
  'Пластинки на завісах, що відкриваються лише всередину коробки. Коли олива набігає на стінку, вони пропускають її до забірника, а коли вона відкочується назад, закриваються.':
    'Hinged flaps that open only into the box. When the oil surges against the wall they let it through to the pickup, and when it runs back they close.',
  'Сітка від розбризкування': 'Windage screen',
  'Сітка між колінвалом і оливою. Вона знімає краплі, які відкидають противаги, і не дає валу збивати оливу в піну. Це дає трохи потужності на високих обертах і менше повітря в оливі.':
    'A screen between the crank and the oil. It strips the drops the counterweights throw and keeps the crank from whipping the oil into foam: a little more power at high revs and less air in the oil.',
  'Скребок колінвала': 'Crank scraper',
  'Пластина за кілька міліметрів від противаг. Вона знімає оливу, яку вал тягне за собою, і відправляє її в піддон.':
    'A blade a few millimeters off the counterweights. It strips the oil the crank drags round with it and sends it down to the pan.',
  'Камера відділення повітря': 'Deaeration chamber',
  'Сюди ступені відкачування зганяють спінену оливу з головок і картера. Олива закручується, повітря виходить, і насос тиску бере вже чисту оливу.':
    'The scavenge stages send the foamy oil from the heads and the crankcase here. It swirls, the air escapes, and the pressure stage draws clean oil.',
  'Відкачування з головок': 'Head scavenging',
  'Окремі ступені насоса висмоктують оливу з головок. Без них олива в повороті збирається в головці на зовнішньому боці й повертається в піддон занадто повільно.':
    'Separate pump stages suck the oil out of the heads. Without them, in a corner the oil collects in the outer head and returns to the pan too slowly.',
  'Олива в головці': 'Oil in the head',
  'Частина оливи завжди в дорозі: у головках, на стінках картера, у каналах. На високих обертах її більше, а в піддоні відповідно менше.':
    'Some of the oil is always on its way: in the heads, on the crankcase walls, in the passages. At high revs there is more of it, and so less in the pan.',
  'Рівень у баку': 'Tank level',
  'Скільки оливи в баку сухого картера. Вихід знизу по центру бака, тому нахил оливи в баку насосу не страшний, поки рівень не впаде майже до дна.':
    'How much oil the dry sump’s tank holds. Its outlet is at the bottom center, so the oil tilting in the tank does not bother the pump until the level falls almost to the bottom.',
  'Акумулятор оливи': 'Oil accumulator',
  'Циліндр з поршнем: з одного боку олива, з другого стиснене повітря. Поки тиск у магістралі високий, він набирає оливу, а коли тиск падає, віддає її назад. Рятує на короткі провали, але не на довгі.':
    'A cylinder with a piston: oil on one side, compressed air on the other. While the gallery pressure is high it takes oil in, and when the pressure drops it gives it back. It saves short dips, not long ones.',
  'Висота колінвала': 'Crank height',
  'Відстань від осі колінвала до найнижчої точки піддона. Що глибший піддон, то вище доводиться ставити двигун. Сухий картер дозволяє посадити його нижче.':
    'From the crank axis to the lowest point of the pan. The deeper the pan, the higher the engine has to sit. A dry sump lets it sit lower.',
};
