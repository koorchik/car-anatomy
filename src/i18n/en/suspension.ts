// English for the suspension section: part cards for now. t.ts takes it in with the other dictionaries until the
// shell's registerDictionary lets the section's lazy chunk register it instead (suspensions plan, «Переклад»).

export const SUSPENSION_EN: Record<string, string> = {
  'Поворотний кулак': 'Steering knuckle',
  'Литий кулак, на якому обертається маточина колеса. До нього сходяться всі ланки: стійка, кульова опора важеля й рульова тяга, тож саме він визначає, як колесо ходить і повертається.':
    'A cast knuckle the wheel hub turns in. Every link meets here: the strut, the control arm’s ball joint and the tie rod, so the knuckle decides how the wheel moves and steers.',
  'Нижній важіль': 'Lower control arm',
  'Тримає низ кулака й передає на кузов поздовжні й бічні сили від колеса. Хитається на двох сайлентблоках, а з кулаком з’єднаний кульовою опорою.':
    'Holds the bottom of the knuckle and passes the wheel’s fore-aft and side forces to the body. It pivots on two bushings and joins the knuckle through a ball joint.',
  'Сайлентблок': 'Bushing',
  'Гумова втулка між важелем і кузовом. Дає важелю хитатися без мастила й гасить дрібну вібрацію від дороги. Податливість сайлентблоків модель поки не враховує.':
    'A rubber bushing between the arm and the body. It lets the arm pivot without grease and soaks up fine vibration from the road. The model does not account for bushing compliance yet.',
  'Кульова опора': 'Ball joint',
  'Шарнір між важелем і кулаком: кулька в обоймі дає кулаку і хитатися разом із важелем, і повертатися з кермом. Разом із верхньою опорою стійки вона задає вісь повороту колеса.':
    'The joint between the arm and the knuckle: a ball in a socket lets the knuckle both swing with the arm and turn with the steering. Together with the strut mount it sets the steering axis.',
  'Стійка': 'Strut',
  'Корпус амортизатора, жорстко з’єднаний з кулаком. У підвісці Макферсона він сам працює ланкою: його вісь тримає верх кулака, тому шток згинають бічні сили від колеса.':
    'The shock absorber body, fixed rigidly to the knuckle. In a MacPherson strut it is a link itself: its axis holds the top of the knuckle, so the wheel’s side forces bend the piston rod.',
  'Шток амортизатора': 'Piston rod',
  'Хромований стрижень, закріплений у верхній опорі. Ковзає в корпусі, коли колесо ходить, і несе на нижньому кінці поршень.':
    'A chrome rod fixed in the strut mount. It slides in the body as the wheel moves and carries the piston on its lower end.',
  'Поршень амортизатора': 'Shock absorber piston',
  'Поршень з пакетами тонких шайб-клапанів. Олива протискається крізь його канали, і цей опір гасить коливання кузова й колеса. Окремі пакети працюють на стиск і на відбій, тому відбій буває жорсткішим.':
    'A piston with stacks of thin valve shims. Oil is forced through its passages, and that resistance damps the motion of the body and the wheel. Separate stacks work in compression and in rebound, which is why rebound can be firmer.',
  'Олива амортизатора': 'Shock absorber oil',
  'Заповнює корпус. Її в’язкий опір у клапанах поршня перетворює енергію коливань на тепло.':
    'Fills the body. Its viscous resistance in the piston valves turns the energy of the motion into heat.',
  'Пружина': 'Coil spring',
  'Тримає вагу авто й приймає удари від дороги. Від її жорсткості залежать висота кузова й частота його коливань. Тут вона навита на стійку, тож стискається майже на стільки ж, на скільки піднімається колесо.':
    'Carries the car’s weight and takes the blows from the road. Its rate sets the ride height and how fast the body bounces. Here it sits around the strut, so it compresses almost as much as the wheel rises.',
  'Відбійник': 'Bump stop',
  'Пружний упор на штоку. Наприкінці ходу стиску він різко твердне й не дає металу вдаритися в метал. Червоніє, коли стиснутий більш ніж на п’яту частину.':
    'A flexible stop on the piston rod. At the end of bump travel it stiffens sharply and keeps metal from hitting metal. It turns red when squeezed by more than a fifth.',
  'Верхня опора': 'Strut mount',
  'Кріпить шток до чашки кузова через гуму, яка гасить шум. Підшипник у ній дає всій стійці повертатися разом із кермом. Зсув опори вбік змінює розвал.':
    'Fixes the piston rod to the strut tower through rubber that keeps noise out. A bearing in it lets the whole strut turn with the steering. Moving the mount sideways changes the camber.',
  'Рульова тяга': 'Tie rod',
  'Штовхає й тягне поворотний важіль кулака, повертаючи колесо. Її довжиною виставляють сходження.':
    'Pushes and pulls the knuckle’s steering arm to turn the wheel. Its length sets the toe.',
  'Рульова рейка': 'Steering rack',
  'Зубчаста рейка в картері рухається вбік, коли крутять кермо, і тягне за собою обидві рульові тяги. Гофрований пильник захищає її внутрішній шарнір. Тут показано лише край рейки біля колеса.':
    'A toothed rack in its housing slides sideways when the steering wheel is turned and pulls both tie rods with it. A bellows boot protects its inner joint. Only the end of the rack near the wheel is shown here.',
  'Маточина': 'Hub',
  'Обертається на підшипнику в кулаці. До її фланця кріпляться гальмівний диск і колесо, а всередину заходить шліцьований хвостовик ШРУСа.':
    'Turns on a bearing in the knuckle. The brake rotor and the wheel bolt to its flange, and the splined stub of the CV joint goes into it.',
  'Гальмівний диск': 'Brake rotor',
  'Обертається разом із колесом. Колодки супорта стискають його, і тертя перетворює рух на тепло. Канали між двома половинами диска продувають його повітрям.':
    'Turns with the wheel. The caliper’s pads clamp it, and friction turns motion into heat. Vanes between its two halves pump air through it.',
  'Супорт': 'Brake caliper',
  'Закріплений на кулаці й охоплює диск. Тиск гальмівної рідини притискає колодки до диска.':
    'Bolted to the knuckle and straddling the rotor. Brake fluid pressure presses the pads against the rotor.',
  'Колісний диск': 'Wheel',
  'Тримає шину й кріпиться до маточини гайками. Виліт диска задає, де стоїть середина колеса відносно маточини, а від цього залежить плече обкатки.':
    'Holds the tire and bolts to the hub with lug nuts. The wheel offset sets where the middle of the wheel sits relative to the hub, and the scrub radius depends on it.',
  'Шина': 'Tire',
  'Єдине, що торкається дороги: усі сили проходять через пляму контакту завбільшки з долоню. Шина ще й працює пружиною, набагато жорсткішою за пружину підвіски.':
    'The only thing that touches the road: every force goes through a contact patch the size of a hand. The tire is also a spring, much stiffer than the suspension spring.',
  'Піввісь': 'Halfshaft',
  'Передає момент від диференціала до колеса. На її кінцях стоять шарніри рівних кутових швидкостей, тож колесо крутиться рівномірно, хоч піввісь нахиляється з ходом підвіски й поворотом керма. Біля коробки передач її обрізано.':
    'Carries torque from the differential to the wheel. Constant-velocity joints at its ends keep the wheel turning evenly while the shaft tilts with suspension travel and steering. It is cut off near the transmission.',
  'Внутрішній ШРУС (трипод)': 'Inner CV joint (tripod joint)',
  'Хрестовина з трьома роликами ковзає в пазах корпусу-тюльпана. Тому піввісь може і нахилятися, і змінювати довжину, коли колесо ходить угору й униз.':
    'A spider with three rollers slides in the grooves of a tulip-shaped housing. So the halfshaft can both tilt and change length as the wheel moves up and down.',
  'Зовнішній ШРУС': 'Outer CV joint',
  'Кульковий шарнір рівних кутових швидкостей біля маточини. Працює на великих кутах, бо колесо ще й повертається кермом, а довжини не змінює.':
    'A ball-type constant-velocity joint at the hub. It works at large angles because the wheel also steers, and it does not change length.',
  'Пильник ШРУСа': 'CV boot',
  'Гумова гармошка тримає мастило в шарнірі й не пускає туди бруд. Без неї шарнір швидко зношується.':
    'A rubber bellows keeps the grease in the joint and the dirt out. Without it the joint wears out quickly.',
  'Кузов': 'Body',
  'Чашка стійки, бризковик і лонжерон. Сюди приходять усі сили від колеса, а вагу авто пружина передає через верхню опору стійки.':
    'The strut tower, the inner fender and the frame rail. Every force from the wheel ends up here, and the spring passes the car’s weight on through the strut mount.',
  'Підрамник': 'Subframe',
  'Рама, на якій тримаються важелі, а часто й рульова рейка. Здебільшого кріпиться до кузова через гумові опори, щоб у салон ішло менше шуму.':
    'A frame that carries the control arms and often the steering rack. It is usually mounted to the body through rubber, so less noise reaches the cabin.',
  'Дорога': 'Road',
  'Смуга дороги під колесом з нерівностями сцени.': 'A strip of road under the wheel, with the scene’s bumps on it.',
  'Верхній важіль': 'Upper control arm',
  'Тримає верх кулака. Він коротший за нижній, тож на стиску тягне верх колеса всередину, і в повороті зовнішнє колесо менше завалюється разом із кузовом. Хитається на двох сайлентблоках, а з кулаком з’єднаний кульовою опорою.':
    'Holds the top of the knuckle. It is shorter than the lower arm, so in bump it pulls the top of the wheel inward, and in a turn the outside wheel leans less with the body. It pivots on two bushings and joins the knuckle through a ball joint.',
  'Тяга сходження': 'Toe link',
  'Тримає задню частину кулака, щоб колесо не поверталося від бічних і гальмівних сил. Її довжиною виставляють сходження заднього колеса, а висотою внутрішнього шарніра задають, як воно змінюється на ходу.':
    'Holds the back of the knuckle so side and braking forces cannot steer the wheel. Its length sets the rear wheel’s toe, and the height of its inner joint sets how the toe changes with suspension travel.',
  'Нижня тяга': 'Lower link',
  'Одна з двох нижніх тяг. Кожна тримає кулак лише вздовж себе, а пара разом працює як нижній важіль з уявною кульовою опорою там, де сходяться їхні лінії. Тому й вісь повороту колеса тут уявна й рухається на ходу.':
    'One of the two lower links. Each holds the knuckle only along itself, and together the pair works as a lower arm with a virtual ball joint where their lines meet. That is why the steering axis is virtual here too and moves with suspension travel.',
  'Верхня тяга': 'Upper link',
  'Одна з двох верхніх тяг. Разом вони працюють як верхній важіль з уявною кульовою опорою за межами кулака. П’ять тяг лишають кулаку один рух, хід колеса, а їхні довжини й кути задають, як колесо змінює розвал і сходження на ходу.':
    'One of the two upper links. Together they work as an upper arm with a virtual ball joint outside the knuckle. Five links leave the knuckle a single motion, the wheel’s travel, and their lengths and angles set how camber and toe change along it.',
  'Носій стійки': 'Strut carrier',
  'Литий носій, жорстко з’єднаний зі стійкою, стоїть на нижньому важелі. Колісний кулак повертається в ньому навколо власної осі, ближчої до колеса, тож сама стійка з кермом не повертається. Вісь повороту підходить до середини колеса, і момент на ведених колесах менше смикає кермо.':
    'A cast carrier fixed rigidly to the strut, standing on the lower control arm. The steering knuckle turns in it about its own axis, closer to the wheel, so the strut itself does not steer. The steering axis comes nearer the middle of the wheel, and torque at the driven wheels tugs at the steering wheel less.',
  'Колісний кулак': 'Steering knuckle',
  'Несе маточину й гальмо, а з кермом повертається в носії стійки на двох опорах, зверху й знизу. Лінія через них і є віссю повороту колеса. Рульова тяга тягне саме цей кулак.':
    'Carries the hub and the brake, and turns with the steering in the strut carrier on two bearings, one above and one below. The line through them is the steering axis. The tie rod pulls on this knuckle.',
  'Амортизатор': 'Shock absorber',
  'Корпус з оливою й поршнем, на який навито пружину. Нижнім вушком стоїть на важелі чи тязі, верхнім кінцем кріпиться до кузова. Ланкою він не працює: кулак тримають важелі чи тяги, тож бічні сили шток не згинають.':
    'A body with oil and a piston, the coil spring wound around it. Its lower eye sits on an arm or a link, its top end is fixed to the body. It is not a link: the arms or links hold the knuckle, so side forces do not bend the piston rod.',
  'Литий кулак з маточиною. Його тримають дві кульові опори, верхня й нижня, і рульова тяга. Лінія через дві кульові опори і є віссю повороту колеса.':
    'A cast knuckle with the hub. Two ball joints, upper and lower, and a tie rod hold it. The line through the two ball joints is the steering axis.',
  'Шарнір між важелем і кулаком: кулька в обоймі дає кулаку і хитатися разом із важелем, і повертатися з кермом. Верхня й нижня кульові опори разом задають вісь повороту колеса.':
    'The joint between the arm and the knuckle: a ball in a socket lets the knuckle both swing with the arm and turn with the steering. The upper and lower ball joints together set the steering axis.',
  'Литий кулак з маточиною. Його тримають п’ять тяг, кожна на своєму шарнірі. Кульових опор, через які йде вісь повороту, тут немає: вісь проходить через точки, де сходяться лінії пар тяг.':
    'A cast knuckle with the hub. Five links hold it, each on its own joint. There are no ball joints for the steering axis to run through: it passes through the points where the lines of each pair of links meet.',
  'Тримає вагу авто й приймає удари від дороги. Від її жорсткості залежать висота кузова й частота його коливань. Тут вона стоїть на важелі ближче до кузова, ніж колесо, тож стискається менше, ніж піднімається колесо, і мусить бути жорсткішою.':
    'Carries the car’s weight and takes the blows from the road. Its rate sets the ride height and how fast the body bounces. Here it sits on the arm nearer the body than the wheel, so it compresses less than the wheel rises and has to be stiffer.',
  'Кріпить шток амортизатора до кузова через гуму, яка гасить шум і дає амортизатору трохи хитатися, коли колесо ходить.':
    'Fixes the shock absorber’s piston rod to the body through rubber, which damps noise and lets the shock absorber tilt a little as the wheel moves.',
  'Опора амортизатора, лонжерон і кронштейн, на якому хитаються верхні ланки. Сюди приходять сили від колеса, а вагу авто пружина передає через верхню опору амортизатора.':
    'The shock absorber’s tower, the frame rail and the bracket the upper links pivot on. The forces from the wheel end up here, and the spring passes the car’s weight on through the shock absorber’s upper mount.',
  'Корпус амортизатора, жорстко з’єднаний з носієм. Як у звичайній стійці Макферсона, він працює ланкою: його вісь тримає верх носія, тому шток згинають бічні сили від колеса.':
    'The shock absorber body, fixed rigidly to the carrier. As in a plain MacPherson strut it is a link itself: its axis holds the top of the carrier, so the wheel’s side forces bend the piston rod.',
  'Кріпить шток до чашки кузова через гуму, яка гасить шум. Стійка тут з кермом не повертається: повертається лише колісний кулак у носії.':
    'Fixes the piston rod to the strut tower through rubber, which damps noise. The strut does not steer here: only the steering knuckle turns in the carrier.',
  'Шарнір носія': 'Carrier joint',
  'З’єднує нижній важіль з носієм стійки. Носій з кермом не повертається, тож шарнір лише дає йому хитатися разом із важелем. У RevoKnuckle тут втулка.':
    'Joins the lower control arm to the strut carrier. The carrier does not steer, so the joint only lets it swing with the arm. On the RevoKnuckle it is a sleeve joint.',
  'Тримає низ носія стійки й передає на кузов поздовжні й бічні сили від колеса. Хитається на двох сайлентблоках.':
    'Holds the bottom of the strut carrier and passes the wheel’s fore-aft and side forces to the body. It pivots on two bushings.',
  'Обертається на підшипнику в кулаці. До її фланця кріпляться гальмівний диск і колесо. Це колесо не ведуче, тож піввісі до маточини немає.':
    'Turns on a bearing in the knuckle. The brake rotor and the wheel bolt to its flange. This wheel is not driven, so no halfshaft comes to the hub.',
  'Кулак': 'Knuckle',
  'Литий кулак з маточиною. Його тримають дві кульові опори, верхня й нижня, і тяга сходження: без неї кулак повертався б навколо лінії через кульові опори, а так колесо лише ходить угору й униз.':
    'A cast knuckle with the hub. Two ball joints, upper and lower, and a toe link hold it: without the link the knuckle would turn about the line through the ball joints, and with it the wheel only moves up and down.',
  'Шарнір між важелем і кулаком: кулька в обоймі дає кулаку хитатися разом із важелем. Повертатися навколо лінії через обидві кульові опори кулаку не дає тяга сходження.':
    'The joint between the arm and the knuckle: a ball in a socket lets the knuckle swing with the arm. The toe link keeps the knuckle from turning about the line through both ball joints.',
  'Литий кулак з маточиною. Його тримають п’ять тяг, кожна на своєму шарнірі, і кожна забирає в нього одну можливість рухатися. Лишається одна, хід колеса, тож колесо ходить угору й униз і не повертається.':
    'A cast knuckle with the hub. Five links hold it, each on its own joint, and each takes away one way it could move. One is left, the wheel’s travel, so the wheel moves up and down and does not turn.',
  'Одна з двох нижніх тяг. Кожна тримає кулак лише вздовж себе, а пара разом працює як нижній важіль з уявною кульовою опорою там, де сходяться їхні лінії. Ця уявна опора рухається на ходу, тож довжини й кути тяг задають, як колесо змінює розвал і сходження.':
    'One of the two lower links. Each holds the knuckle only along itself, and together the pair works as a lower arm with a virtual ball joint where their lines meet. That virtual joint moves with suspension travel, so the links’ lengths and angles set how camber and toe change.',
  'Тримає вагу авто й приймає удари від дороги. Від її жорсткості залежать висота кузова й частота його коливань. Тут вона стоїть на тязі ближче до кузова, ніж колесо, тож стискається менше, ніж піднімається колесо, і мусить бути жорсткішою.':
    'Carries the car’s weight and takes the blows from the road. Its rate sets the ride height and how fast the body bounces. Here it sits on a link nearer the body than the wheel, so it compresses less than the wheel rises and has to be stiffer.',
  'Тримає вагу авто й приймає удари від дороги. Від її жорсткості залежать висота кузова й частота його коливань. Тут вона стоїть просто на кулаці, тож стискається майже на стільки ж, на скільки піднімається колесо.':
    'Carries the car’s weight and takes the blows from the road. Its rate sets the ride height and how fast the body bounces. Here it sits right on the knuckle, so it compresses almost as much as the wheel rises.',
  'Корпус з оливою й поршнем. Нижнім вушком стоїть на важелі, тязі чи кулаці, верхнім кінцем кріпиться до кузова. Пружина стоїть окремо від нього, а ланкою він не працює: кулак тримають важелі чи тяги, тож бічні сили шток не згинають.':
    'A body with oil and a piston. Its lower eye sits on an arm, a link or the knuckle, its top end is fixed to the body. The spring stands apart from it, and it is not a link: the arms or links hold the knuckle, so side forces do not bend the piston rod.',
  'Опора амортизатора, лонжерон і кронштейн, на якому хитаються верхні ланки. Сюди приходять сили від колеса, а вагу авто пружина передає через свою верхню чашку.':
    'The shock absorber’s tower, the frame rail and the bracket the upper links pivot on. The forces from the wheel end up here, and the spring passes the car’s weight on through its own upper seat.',
  'Передає момент від диференціала до колеса. На її кінцях стоять шарніри рівних кутових швидкостей, тож колесо крутиться рівномірно, хоч піввісь нахиляється з ходом підвіски. Біля диференціала її обрізано.':
    'Carries torque from the differential to the wheel. Constant-velocity joints at its ends keep the wheel turning evenly while the shaft tilts with suspension travel. It is cut off near the differential.',
  'Кульковий шарнір рівних кутових швидкостей біля маточини. Кермом це колесо не повертається, тож кути в шарнірі невеликі, а довжини він не змінює.':
    'A ball-type constant-velocity joint at the hub. This wheel does not steer, so the joint works at small angles, and it does not change length.',
};
