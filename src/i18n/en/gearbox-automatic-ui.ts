// The planetary automatic's page (stage K11): its dash, lever diagram, shift matrix, demonstration 8 and the part
// cards of its model. Words it shares with the manual pages come from gearbox-ui.ts; the record and the article
// about the layout from gearbox-automatic.ts.

export const GEARBOX_AUTOMATIC_UI_EN: Record<string, string> = {
  'Ряди: зубці сонячної / коронної': 'Gearsets: sun / ring teeth',
  'Сателітів у рядах': 'Planets per gearset',
  'Опубліковані числа: {ratios}, задній {reverse}. Зубці рядів дають їх до останнього знака.':
    'Published ratios: {ratios}, reverse {reverse}. The gearset teeth give them to the last digit.',
  'Показати: матриця 8HP': 'Show: the 8HP shift matrix',
  'На столі коробка крутиться без авто й поки без гідротрансформатора: двигун крутить вхідний вал напряму, вихід крутиться вільно, а муфти й гальма замикаються одразу. Замикайте елементи кнопками A–E, і модель та номограма покажуть, що вони лишають.':
    'On the table the transmission turns without the car and, for now, without the torque converter: the engine turns the input shaft directly, the output turns freely, and the clutches and brakes close at once. Close the elements with the A–E buttons, and the model and the lever diagram show what they leave.',
  'Три з п’яти': 'Three of five',
  'Чотири ряди, з’єднані між собою, мають чотири ступені свободи. Кожен замкнений елемент забирає один, тож три лишають рівно один рух: це передача. Перша — {closed}, число {ratio}. На номограмі праворуч швидкість кожного ряду лежить на прямій, а вихід стоїть на висоті 1/{ratio}.':
    'Four gearsets joined to each other have four degrees of freedom. Each closed element takes one away, so three leave exactly one motion: a gear. First is {closed}, ratio {ratio}. On the lever diagram the speeds of each set lie on a straight line, and the output stands at a height of 1/{ratio}.',
  'Друга: один елемент': 'Second: one element',
  '{off} відпускає, {on} замикає, решта лишаються. Так влаштоване кожне послідовне перемикання 8HP: момент переходить з однієї муфти на другу без розриву. Число {ratio}.':
    '{off} lets go, {on} closes, the rest stay. Every sequential shift of the 8HP works this way: the torque passes from one clutch to the other without a break. Ratio {ratio}.',
  'Шоста: усе як одне ціле': 'Sixth: all as one piece',
  '{closed}: усі прямі номограми лежать на висоті входу, і весь механізм крутиться як одна деталь. Число 1, жодне зачеплення не котиться, тому втрат у зачепленнях немає.':
    '{closed}: every line of the lever diagram lies at the input\'s height, and the whole mechanism turns as one piece. The ratio is 1, no mesh rolls, so there is no mesh loss.',
  'Восьма: вихід швидший за вхід': 'Eighth: the output faster than the input',
  '{closed}: вихід стоїть на номограмі вище за вхід, число {ratio}. На трасі двигун крутиться повільніше, ніж колеса.':
    '{closed}: the output stands above the input on the lever diagram, ratio {ratio}. On the highway the engine turns slower than the driveshaft.',
  'З восьмої на другу': 'From eighth to second',
  'Навіть цей стрибок через шість передач міняє лише один елемент: {off} відпускає, {on} замикає. Тому автомат може скинути кілька передач одним перемиканням, коли водій тисне газ до підлоги.':
    'Even this jump across six gears changes only one element: {off} lets go, {on} closes. So the automatic can drop several gears in one shift when the driver floors the gas.',
  '{closed}: вихід опускається нижче нуля й крутиться назад, число −{ratio}.': '{closed}: the output drops below zero and turns backward, ratio −{ratio}.',
  'Два елементи: нейтраль': 'Two elements: neutral',
  '{closed} лишають два ступені свободи. Вихід ні до чого не прив’язаний: на номограмі прямі вільно хитаються, а на столі вихід просто стоїть, поки вхід крутиться.':
    '{closed} leave two degrees of freedom. The output is tied to nothing: on the lever diagram the lines swing freely, and on the table the output just stands while the input turns.',
  'A + C + E: десята трійка': 'A + C + E: the tenth triple',
  'Ця трійка теж лишає один рух, але не передачу: вхід тримається на картері, а вихід вільно крутиться. Тобто двигун заблоковано, а авто котиться. Тому в матриці її немає.':
    'This triple also leaves one motion, but not a gear: the input is held to the case while the output turns freely. The engine is locked and the car rolls. That is why it is not in the matrix.',
  'Чотири: заклинило': 'Four: jammed',
  '{closed}: рухів не лишилося, стоять і вхід, і вихід. Справжній блок керування ніколи не замикає чотири елементи разом.':
    '{closed}: no motion is left, both the input and the output stand. A real control unit never closes four elements at once.',
  'двигун крутить вхідний вал, вихід вільний': 'the engine turns the input shaft, the output is free',
  'Номограма': 'Lever diagram',
  'матриця 8HP': 'the 8HP shift matrix',
  'Номограма важелів: кожен ряд — важіль із сонячною (S), водилом (C) і коронною (R) на відстанях, пропорційних зубцям. Висота точки — швидкість відносно входу, тож три точки ряду завжди на одній прямій. Однаковий колір — одна деталь, як у моделі.':
    'Lever diagram: each gearset is a lever with the sun (S), the carrier (C) and the ring (R) at distances proportional to the teeth. A point\'s height is its speed relative to the input, so the three points of a set always lie on one straight line. One color is one part, as in the model.',
  'Матриця перемикань': 'Shift matrix',
  'Муфти й гальма': 'Clutches and brakes',
  'Вхідний вал': 'Input shaft',
  'Вихідний вал': 'Output shaft',
  'Номограма швидкостей': 'Speed lever diagram',
  'вхід': 'input',
  'ряд {k}': 'set {k}',
  'вихід 1/{ratio}': 'output 1/{ratio}',
  'вихід': 'output',
  'Гідромеханічний автомат': 'Torque-converter automatic',
  'нічого': 'nothing',
  'передача {gear}, число {ratio}': 'gear {gear}, ratio {ratio}',
  'передача, число {ratio}': 'a gear, ratio {ratio}',
  'нейтраль: {dof} ступені свободи, вихід вільний': 'neutral: {dof} degrees of freedom, the output is free',
  'вхід тримається на картері, вихід вільно крутиться': 'the input is held to the case, the output turns freely',
  'заклинило: стоять і вхід, і вихід': 'jammed: both the input and the output stand',
  'Замкнено: {list} — {what}': 'Closed: {list} — {what}',
  'Матриця 8HP · {n} з {count}': 'The 8HP matrix · {n} of {count}',
  'котиться, {rpm} об/хв': 'rolling, {rpm} rpm',
  '{from} → {to}: {off} відпускає, {on} замикає': '{from} → {to}: {off} lets go, {on} closes',
  'Три замкнені елементи лишають один рух': 'Three closed elements leave one motion',
  'Цієї трійки немає в матриці, але вона теж дає передачу': 'This triple is not in the matrix, but it gives a gear too',
  'Замкніть три елементи, щоб увімкнути передачу': 'Close three elements to engage a gear',
  'Двигун заглух: вхід тримається на картері, а вихід вільно крутиться': 'The engine stalled: the input is held to the case, and the output turns freely',
  'Вхід тримається на картері, а вихід вільно крутиться: двигун заблоковано, авто котиться': 'The input is held to the case and the output turns freely: the engine is locked, the car rolls',
  'Двигун заглух: чотири елементи заклинили коробку': 'The engine stalled: four elements jammed the transmission',
  'Чотири елементи заклинили коробку: стоять і вхід, і вихід': 'Four elements jammed the transmission: both the input and the output stand',
  'Сонячна шестерня': 'Sun gear',
  'Шестерня в центрі планетарного ряду. Сателіти котяться по ній зовні. У 8HP сонячні шестерні рядів 1 і 2 — одна деталь, а сонячна ряду 3 з’єднана з коронною ряду 2.':
    'The gear in the middle of a planetary gearset. The planets roll around it. In the 8HP the sun gears of sets 1 and 2 are one part, and the sun of set 3 is joined to the ring of set 2.',
  'Сателіт': 'Planet gear',
  'Крутиться на осі водила й одночасно зачеплений із сонячною шестернею і з коронною. Кількох сателітів ставлять, щоб розділити між ними момент. Їх можна розставити рівно лише тоді, коли сума зубців сонячної й коронної ділиться на їхню кількість.':
    'Turns on a pin of the carrier and meshes with the sun gear and the ring gear at once. Several planets share the torque. They can be spaced evenly only when the sun and ring teeth add up to a multiple of their number.',
  'Водило': 'Planet carrier',
  'Дві пластини з осями сателітів. Крутиться зі швидкістю між швидкостями сонячної й коронної: z_с·ω_с + z_к·ω_к = (z_с + z_к)·ω_в. Водило ряду 2 — вхід коробки від турбіни, водило ряду 4 — вихід.':
    'Two plates holding the planets\' pins. It turns at a speed between those of the sun and the ring: z_s·ω_s + z_r·ω_r = (z_s + z_r)·ω_c. The carrier of set 2 is the input from the turbine, the carrier of set 4 the output.',
  'Коронна шестерня': 'Ring gear',
  'Шестерня з зубцями всередині, яка оточує сателіти. Якщо тримати водило, коронна крутиться назад відносно сонячної, повільніше в z_к/z_с разів.':
    'A gear with its teeth inside that surrounds the planets. With the carrier held, the ring turns backward relative to the sun, z_r/z_s times slower.',
  'Барабан і вал зв’язку': 'Drum and connecting shaft',
  'Постійно з’єднує частини двох рядів, і вони крутяться як одна деталь. Одним кольором позначено все, що крутиться разом.':
    'Joins parts of two gearsets for good, so they turn as one part. Everything that turns together has one color.',
  'Гальмо коробки': 'Brake',
  'Пакет фрикційних і сталевих дисків: одні сидять на шліцах картера, другі на шліцах частини ряду. Тиск оливи стискає пакет, і частина ряду стоїть. У 8HP гальм два: A тримає сонячні шестерні рядів 1 і 2, B — коронну ряду 1.':
    'A pack of friction and steel plates: some on splines of the case, the others on splines of a gearset part. Oil pressure squeezes the pack, and that part stands still. The 8HP has two brakes: A holds the sun gears of sets 1 and 2, B the ring of set 1.',
  'Муфта': 'Clutch',
  'Пакет дисків між двома частинами, що крутяться. Стиснутий пакет змушує їх крутитися разом. У 8HP муфт три: C з’єднує вхід із коронною ряду 3, D — водила рядів 3 і 4, E — коронні рядів 2 і 3.':
    'A pack of plates between two turning parts. Squeezed, the pack makes them turn together. The 8HP has three clutches: C joins the input to the ring of set 3, D the carriers of sets 3 and 4, E the rings of sets 2 and 3.',
  'Крутиться від турбіни гідротрансформатора й веде водило ряду 2, а через муфту C — ще й коронну ряду 3. На цій сторінці гідротрансформатора поки немає: вал крутить двигун напряму.':
    'Driven by the torque converter\'s turbine, it turns the carrier of set 2 and, through clutch C, the ring of set 3 too. This page has no torque converter yet: the engine turns the shaft directly.',
  'Водило ряду 4 і вал до кардана. Його швидкість, поділена на швидкість входу, — це одиниця, поділена на число передачі.':
    'The carrier of set 4 and the shaft to the driveshaft. Its speed divided by the input\'s is one over the gear ratio.',
  'Картер коробки': 'Transmission case',
  'Нерухомий корпус коробки. Гальма тримають частини рядів саме на ньому.': 'The fixed housing of the transmission. The brakes hold gearset parts against it.',
};
