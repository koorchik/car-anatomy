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
};
