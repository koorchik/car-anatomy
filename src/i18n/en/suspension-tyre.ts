// English for the tyre scene of the suspension page (src/ui/suspensions/tyre-scene.ts, tyre-article.ts) and the cards of
// the cut tyre's layers (src/scene/suspension/tyre-parts.ts). The section's loader registers it with the section's own.

export const SUSPENSION_TYRE_EN: Record<string, string> = {
  // The tyre choices, as the oil page names them.
  'Класичні': 'Classic',
  'Дорожні': 'Street',
  'Напівсліки': 'Semi-slicks',
  'Сліки': 'Slicks',
  'Шини': 'Tires',
  // The dash.
  'Протектор прилип': 'Tread sticks',
  'Протектор ковзає': 'Tread slides',
  'Ковзає {slide} % плями': '{slide}% of the patch slides',
  'Одна шина на скляній дорозі: сили, пляма контакту й будова': 'One tire on a glass road: its forces, contact patch and construction',
  'Пляма контакту згори: рух праворуч, зелена зона зчеплення від передньої кромки, червона зона ковзання від задньої':
    'The contact patch from above: travel to the right, the green zone where the tread sticks from the leading edge, the red zone where it slides from the trailing edge',
  'Бічна сила від кута відведення на чотирьох навантаженнях': 'Lateral force against slip angle at four loads',
  // The panel.
  'Навантаження': 'Load',
  'Кут відведення': 'Slip angle',
  'Поздовжнє ковзання': 'Slip ratio',
  'Бічна сила': 'Lateral force',
  'Поздовжня сила': 'Longitudinal force',
  'Стабілізуючий момент': 'Aligning torque',
  'Пляма в зчепленні': 'Patch sticking',
  'Пляма, довжина × ширина': 'Patch, length × width',
  '{length} × {width} мм': '{length} × {width} mm',
  '{value} Н·м': '{value} N·m',
  '{value} кН/м': '{value} kN/m',
  '{bar} бар ({pct} %)': '{bar} bar ({pct}%)',
  'Ковзає вся пляма: шина на межі, і більший кут уже не дає більшої сили.':
    'The whole patch slides: the tire is at its limit, and a larger angle gives no more force.',
  'Протектор майже всюди прилиплий: шина котиться без помітного ковзання.': 'The tread sticks nearly everywhere: the tire rolls without noticeable sliding.',
  'Протектор прилип у передніх {stick} % плями й ковзає в задніх {slide} %. З ростом кута червона зона росте від задньої кромки.':
    'The tread sticks in the front {stick}% of the patch and slides in the rear {slide}%. As the angle grows, the red zone grows from the trailing edge.',
  'Сила вздовж і еліпс тертя': 'Longitudinal force and the friction ellipse',
  'Поздовжня сила від ковзання': 'Longitudinal force against slip ratio',
  'Еліпс тертя: найбільша сила в кожному напрямку й поточна точка': 'Friction ellipse: the largest force in each direction and the current point',
  'Еліпс — найбільша сила, яку шина дає в кожному напрямку на цьому навантаженні. Точка — сила зараз: що більше ковзання вздовж, то менше лишається вбік.':
    'The ellipse is the largest force the tire makes in each direction at this load. The dot is the force now: the more longitudinal slip, the less is left for cornering.',
  'Стабілізуючий момент від кута відведення': 'Aligning torque against slip angle',
  'α, °': 'α, °',
  'κ, %': 'κ, %',
  'F_x, кН': 'F_x, kN',
  'F_y, кН': 'F_y, kN',
  'M_z, Н·м': 'M_z, N·m',
  'пік моменту': 'torque peak',
  'пік сили': 'force peak',
  'Момент досягає піку на {mz}°, а бічна сила лише на {fy}°. Далі момент падає, і кермо легшає ще до того, як шина зірветься: так водій відчуває межу.':
    'The torque peaks at {mz}°, the lateral force only at {fy}°. Past its peak the torque falls, and the steering goes light before the tire lets go: this is how a driver feels the limit.',
  'Розвал у числах моделі': 'Camber in the model’s numbers',
  '1° розвалу дає стільки ж бічної сили, скільки {slip}° кута відведення. −2° на зовнішньому колесі, тобто нахил у бік сили: пік бічної сили {gain} %. Ті самі 2° від сили, як у внутрішнього колеса: {loss} %. На {load} кН, шина «{tyre}».':
    '1° of camber makes as much lateral force as {slip}° of slip angle. −2° on the outer wheel, a lean toward the force: peak lateral force {gain}%. The same 2° away from the force, as on the inner wheel: {loss}%. At {load} kN, “{tyre}” tires.',
  'Напис на боковині': 'Sidewall code',
  'Розмір і індекси': 'Size and indices',
  '3D-колесо будується саме з цих чисел. Ширина обода й протектора — наша оцінка для малюнка.':
    'The 3D wheel is built from exactly these numbers. The rim and tread widths are our estimate for the drawing.',
  'Ширина профілю': 'Section width',
  'Висота профілю': 'Sidewall height',
  '{value} мм ({aspect} % ширини)': '{value} mm ({aspect}% of the width)',
  'Будова каркаса': 'Carcass',
  'R — радіальна': 'R: radial',
  'B — діагональна з брекером': 'B: bias-belted',
  'D — діагональна': 'D: bias-ply',
  'Діаметр обода': 'Rim diameter',
  '{inch}″ = {value} мм': '{inch}″ = {value} mm',
  'Повний діаметр колеса': 'Overall wheel diameter',
  'Індекс навантаження': 'Load index',
  '{index}: до {kg} кг на шину': '{index}: up to {kg} kg per tire',
  'Індекс швидкості': 'Speed rating',
  '{symbol}: до {kmh} км/год': '{symbol}: up to {kmh} km/h',
  '{symbol}: понад {kmh} км/год': '{symbol}: above {kmh} km/h',
  'Не схоже на розмір шини; показано {code}': 'Not a tire size; showing {code}',
  'Будова шини': 'Tire construction',
  'Каркас': 'Carcass',
  'Радіальна': 'Radial',
  'Діагональна': 'Bias-ply',
  'У «Рентгені» шину розрізано: протектор, сталевий брекер, каркас із нитками, борт із бортовим дротом, боковина й герметичний шар. Клацни шар, щоб дізнатися, що він робить.':
    'In the “X-ray” the tire is cut open: the tread, the steel belt, the carcass with its cords, the bead with its bead wire, the sidewall and the inner liner. Click a layer to find out what it does.',
  'Показати розріз': 'Show the cutaway',
  'Радіальна: нитки каркаса йдуть поперек, під 90° до напрямку кочення, а протектор тримає сталевий брекер. Так зроблено майже всі сучасні легкові шини.':
    'Radial: the carcass cords run across, at 90° to the direction of rolling, and a steel belt holds the tread. Nearly all modern car tires are built this way.',
  'Діагональна: два шари ниток перехрещуються під кутом близько {deg}° до напрямку кочення (оцінка, у різних шин 30–40°), брекера немає. Боковина й протектор гнуться разом, тому пляма мнеться більше.':
    'Bias-ply: two layers of cords cross at about {deg}° to the direction of rolling (an estimate; 30–40° on different tires), and there is no belt. The sidewall and the tread flex together, so the patch distorts more.',
  'Тиск': 'Pressure',
  'Вертикальна жорсткість': 'Vertical stiffness',
  'Прогин шини': 'Tire deflection',
  'Довжина плями': 'Patch length',
  'Оцінка: жорсткість росте лінійно з тиском, k = k₀·(1 + 0,8·Δp/p₀), а довжина плями ℓ ≈ 2·√(2·r·F/k). Як тиск змінює бічну й поздовжню силу, модель не знає. Тиск спільний зі сценою «Перешкода» й панеллю «Налаштувати».':
    'An estimate: the stiffness grows linearly with pressure, k = k₀·(1 + 0.8·Δp/p₀), and the patch length is ℓ ≈ 2·√(2·r·F/k). How pressure changes the lateral and longitudinal forces the model does not know. The pressure is shared with the Obstacle scene and the Setup panel.',
  // The article (src/ui/suspensions/tyre-article.ts).
  '[П]': '[R]',
  '[В]': '[S]',
  '[Р]': '[C]',
  '[Н]': '[U]',
  'перевірено в джерелі': 'checked in the source',
  'вторинне джерело': 'secondary source',
  'наш розрахунок': 'our calculation',
  'не перевірено': 'not verified',
  'Чи є сенс від розвалу й сходження': 'Is there any point to camber and toe',
  'Розвал — це нахил колеса до кузова чи від нього, сходження — поворот передньої кромки коліс одне до одного. Обидва кути малі, десяті частки градуса чи пара градусів, і обидва змінюють лише те, як шина лежить на дорозі. Тому відповідь на питання дає сама шина.':
    'Camber is the lean of a wheel toward the body or away from it; toe is how far the fronts of the wheels turn toward each other. Both angles are small, tenths of a degree or a couple of degrees, and both change only how the tire lies on the road. So the answer comes from the tire itself.',
  'Що розвал робить із шиною': 'What camber does to a tire',
  'Нахилене колесо тягне вбік навіть тоді, коли котиться прямо: це розвальна сила. У моделі дорожньої шини сайту 1° розвалу дає стільки ж бічної сили, скільки {slip}° кута відведення':
    'A leaning wheel pulls sideways even when it rolls straight: this is camber thrust. In the site’s model of a street tire, 1° of camber makes as much lateral force as {slip}° of slip angle',
  'За вимірами шин розвальна сила становить 5–10 % від жорсткості на відведення': 'Tire measurements put camber stiffness at 5–10% of cornering stiffness',
  'На межі зчеплення розвал зсуває пік. На {load} кН дорожня шина дає найбільше {peak} кН бічної сили при {angle}° кута відведення. Нахил на 2° у бік сили, як у зовнішнього колеса з негативним розвалом, піднімає цей пік на {gain} %, а такий самий нахил від сили, як у внутрішнього, знижує на {loss} %':
    'At the limit of grip, camber moves the peak. At {load} kN the street tire makes at most {peak} kN of lateral force, at {angle}° of slip angle. A 2° lean toward the force, as on an outer wheel with negative camber, raises that peak by {gain}%, and the same lean away from the force, as on the inner wheel, lowers it by {loss}%',
  'Знак ефекту збігається з вимірами шин KIT 2006: нахил у бік сили піднімає пік, а від сили знижує':
    'The sign of the effect matches the KIT 2006 tire measurements: a lean towards the force raises the peak and a lean away from it lowers it',
  'Сам відсоток залежить від шини: більшість відкритих підгонок для дорожніх шин цього члена не має зовсім':
    'The percentage itself depends on the tire: most public fits for street tires lack this term altogether',
  'Колесо, жорстко прикручене до кузова, губило б градус розвалу на кожен градус крену. Стійка Макферсон повертає з цього мало, тому статичний негативний розвал найбільше потрібен саме їй, а нерозрізний міст у чистому крені зовсім не нахиляє колеса відносно дороги':
    'A wheel bolted rigidly to the body would lose a degree of camber for every degree of roll. A MacPherson strut wins little of that back, so it needs static negative camber the most, while a live axle in pure roll does not tilt its wheels relative to the road at all',
  'Єдиний вимір на дорожньому авто, який вдалося знайти: MINI зі стійками на −2° розвалу проходив коло в середньому майже на секунду швидше':
    'The only measurement on a road car we could find: a strut-suspended MINI at −2° of camber lapped nearly a second faster on average',
  'прочитано лише уривок': 'only an excerpt was read',
  'Ціна розвалу — гальмування й знос. Нахилене колесо гальмує меншою плямою, і саме це зазвичай ставить межу трековому розвалу':
    'The price of camber is braking and wear. A leaning wheel brakes on a smaller patch, and that is usually what limits track camber',
  'Внутрішня кромка зношується швидше, але виміряних чисел зносу від розвалу ми не знайшли': 'The inner edge wears faster, but we found no measured figures for wear from camber',
  'Що робить сходження': 'What toe does',
  'Кожне колесо зі сходженням котиться під малим кутом відведення. 1 мм сумарного сходження на шині діаметром 653 мм — це {deg}° на колесо, і без пружності протектора колесо зсунулося б убік на {scrub} мм за кожен кілометр':
    'Every wheel with toe rolls at a small slip angle. 1 mm of total toe on a tire 653 mm across is {deg}° per wheel, and without the give of the tread the wheel would be carried sideways {scrub} mm every kilometer',
  'Це верхня межа: більшу частину цього зсуву забирає пружна деформація протектора, і шина в плямі не ковзає. Але знос від сходження реальний, і саме він — головна причина його виставляти.':
    'That is an upper bound: the elastic flex of the tread takes up most of it, and the tire does not slide in the patch. But the wear from toe is real, and it is the main reason to set toe.',
  'Опір від сходження росте з квадратом кута. У моделі на {load} кН одне колесо гальмує з силою {d1} Н при 1 мм сумарного сходження, {d5} Н при 5 мм і {d10} Н при 10 мм. Опір кочення того самого колеса близько {roll} Н, тож це {s1} %, {s5} % і {s10} % від нього':
    'The drag from toe grows with the square of the angle. In the model at {load} kN one wheel drags with {d1} N at 1 mm of total toe, {d5} N at 5 mm and {d10} N at 10 mm. The same wheel’s rolling resistance is about {roll} N, so these are {s1}%, {s5}% and {s10}% of it',
  'Тому твердження «1 мм сходження коштує стільки-то відсотків пального» хибне за формою, і первинного джерела для нього немає':
    'So the claim “1 mm of toe costs so many percent of fuel” is wrong in its form, and it has no primary source',
  'Найкращий справжній вимір — Volvo і Michelin на вантажівках: регулювання дало «до 2,5 %» пального, але які відхилення виправляли, не сказано':
    'The best real measurement is Volvo and Michelin’s on trucks: alignment saved “up to 2.5%” of fuel, but they do not say what misalignment was corrected',
  'Висновок': 'Conclusion',
  'Сходження варто виправити, коли воно справді збилося: інакше шина зноситься, а пальне тут майже ні до чого. Трековий негативний розвал має сенс лише на треку і найбільше на стійках Макферсон; на дорозі він дає трохи зчеплення на межі й забирає трохи гальм і шини. Звичайному авто досить заводських кутів. Це наше судження з наведених фактів, а не виміряний висновок.':
    'Toe is worth correcting when it has really drifted: otherwise the tire wears out, and fuel has little to do with it. Track negative camber makes sense only on a track, and most of all on MacPherson struts; on the road it gives a little grip at the limit and takes a little braking and tire life. An ordinary car is fine with the factory angles. This is our judgment from the facts above, not a measured conclusion.',
  'Межі моделі': 'Limits of the model',
  'Шина — Magic Formula PAC2002 з набором Chrono Sedan (245/40 R18), підігнаним до навантаження 4 кН і μ = 1. Повзунок розвалу має межі −5…+3,5°: за ними крива цього набору втрачає фізичну форму, тому більший позитивний розвал зовнішнього колеса (хитний міст на межі) модель обмежує. Картинка плями — щіткова модель з тими самими жорсткістю й піком; комбіноване ковзання в ній лише ілюстрація. Тиск змінює тільки вертикальну жорсткість шини (оцінка): залежність сил від тиску не моделюємо.':
    'The tire is the Magic Formula PAC2002 with the Chrono Sedan set (245/40 R18), fitted to a 4 kN load and μ = 1. The camber slider stops at −5…+3.5°: beyond that this set’s curve loses its physical shape, so the model limits a larger positive camber of an outer wheel (a swing axle at the limit). The patch picture is a brush model with the same stiffness and peak; combined slip in it is only an illustration. Pressure changes only the tire’s vertical stiffness (an estimate): we do not model how the forces depend on pressure.',
  'Позначки: [П] — прочитано в самому джерелі, [В] — вторинне джерело, [Р] — наш розрахунок моделлю сайту, [Н] — не перевірено. Індекси навантаження й швидкості — таблиці ETRTO у переказі Вікіпедії':
    'Marks: [R] read in the source itself, [S] secondary source, [C] our calculation with the site’s model, [U] not verified. The load and speed indices are the ETRTO tables as Wikipedia gives them',
  // Cards of the cut tyre's layers (src/scene/suspension/tyre-parts.ts).
  'Протектор': 'Tread',
  'Товстий шар гуми, яким шина торкається дороги. Канавки відводять воду з плями контакту, а сама гума тут найм’якша й найлипкіша. Саме протектор деформується в плямі: він прилипає до дороги й зсувається, поки тертя його тримає.':
    'The thick layer of rubber the tire touches the road with. The grooves carry water out of the contact patch, and the rubber here is the softest and stickiest. It is the tread that deforms in the patch: it sticks to the road and shears for as long as friction holds it.',
  'Сталевий брекер': 'Steel belt',
  'Два шари сталевого корду під протектором, нитки яких перехрещуються під невеликим кутом до кола шини. Брекер тримає протектор пласким і жорстким, тому пляма менше мнеться й шина менше гріється. У діагональній шині його немає.':
    'Two layers of steel cord under the tread, their cords crossing at a small angle to the tire’s circumference. The belt keeps the tread flat and stiff, so the patch distorts less and the tire runs cooler. A bias-ply tire has none.',
  'Шари текстильного корду в гумі від борту до борту: саме вони тримають тиск повітря. У радіальній шині нитки йдуть поперек, під 90° до напрямку кочення, тож боковина гнеться легко, а протектор тримає брекер. У діагональній кілька шарів перехрещуються під кутом, і боковина з протектором працюють разом.':
    'Layers of textile cord in rubber from bead to bead: they are what holds the air pressure. In a radial tire the cords run across, at 90° to the direction of rolling, so the sidewall flexes easily while the belt holds the tread. In a bias-ply tire several layers cross at an angle, and the sidewall and the tread work together.',
  'Борт і бортовий дріт': 'Bead and bead wire',
  'Кільце з багатьох витків сталевого дроту в краю шини, на яке загорнуто каркас. Воно не розтягується, тому тиск притискає борт до полички обода, і шина не зіскакує й не провертається на диску.':
    'A ring of many turns of steel wire in the edge of the tire, with the carcass wrapped around it. It does not stretch, so the pressure holds the bead against the rim’s seat, and the tire neither comes off nor slips on the wheel.',
  'Боковина': 'Sidewall',
  'Гнучка гума збоку, що захищає каркас від ударів і сонця. Вона прогинається під навантаженням, тому висота профілю впливає на м’якість і на те, як швидко шина відповідає на кермо. На боковині відлито її розмір і індекси.':
    'The flexible rubber on the side that protects the carcass from knocks and sunlight. It bends under load, so the sidewall height affects the ride and how quickly the tire answers the steering. The size and indices are molded on it.',
  'Герметичний шар': 'Inner liner',
  'Тонкий шар бутилкаучуку на внутрішній поверхні безкамерної шини. Він майже не пропускає повітря, тож шина тримає тиск без камери.':
    'A thin layer of butyl rubber on the inside of a tubeless tire. It lets almost no air through, so the tire holds pressure without an inner tube.',
  'Пляма контакту': 'Contact patch',
  'Частина протектора, що зараз лежить на дорозі. Зелена зона — там, де протектор прилип і лише пружно зсувається; червона — де він уже ковзає. З ростом кута відведення червона зона росте від задньої кромки, а на піку сили ковзає вся пляма.':
    'The part of the tread lying on the road right now. The green zone is where the tread sticks and only shears elastically; the red, where it already slides. As the slip angle grows, the red zone grows from the trailing edge, and at the force peak the whole patch slides.',
};
