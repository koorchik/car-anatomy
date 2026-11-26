// The torque converter on the automatic page (stage K12a): its part cards and its lab, demonstration 9. Spread into
// the automatic page's dictionary (gearbox-automatic-ui.ts), which loads with the page.

export const GEARBOX_CONVERTER_EN: Record<string, string> = {
  'Насосне колесо': 'Impeller',
  'Половина тора з лопатками, одне ціле з кришкою, яку кріплять до маховика. Крутиться з двигуном і жене оливу назовні, у лопатки турбіни.':
    'Half of the torus with blades, one piece with the cover that bolts to the flexplate. It turns with the engine and throws the oil outward into the turbine\'s blades.',
  'Турбінне колесо': 'Turbine',
  'Друга половина тора, на вхідному валу коробки. Олива з насоса б’є в її лопатки й крутить її. Поки авто стоїть, турбіна стоїть теж, а насос крутиться, тому двигун не глухне на передачі.':
    'The other half of the torus, on the transmission\'s input shaft. Oil from the impeller strikes its blades and turns it. While the car stands, the turbine stands too and the impeller turns, which is why the engine does not stall in gear.',
  'Реактор': 'Stator',
  'Колесо з лопатками між турбіною й насосом на муфті вільного ходу. Повертає оливу з турбіни так, щоб вона допомагала насосу, тому на турбіні моменту більше, ніж дає двигун: на зупинці в 1,81 раза. За точкою зчеплення муфта відпускає реактор, і він крутиться разом з оливою.':
    'A bladed wheel between the turbine and the impeller, on a one-way clutch. It turns the oil leaving the turbine so that it helps the impeller, which is why the turbine gets more torque than the engine gives: 1.81 times at stall. Past the coupling point the one-way clutch lets the stator go, and it turns with the oil.',
  'Муфта блокування': 'Lockup clutch',
  'Диск між турбіною й кришкою. Притиснутий оливою, він з’єднує двигун із коробкою без ковзання оливи, і втрати майже зникають. Керування зазвичай лишає кілька десятків обертів ковзання, щоб вібрація двигуна не йшла в кузов.':
    'A plate between the turbine and the cover. Pressed by oil, it joins the engine to the transmission without the oil\'s slip, and the losses almost vanish. The control usually leaves a few tens of rpm of slip so that the engine\'s vibration does not reach the body.',
  // The lab, demonstration 9.
  'Лабораторія': 'Lab',
  'гідротрансформатор': 'torque converter',
  'Гідротрансформатор': 'Torque converter',
  'Гідротрансформатор · {n} з {count}': 'Torque converter · {n} of {count}',
  'Ще раз': 'Again',
  'Лабораторія гідротрансформатора: перша передача, вхідний вал крутить турбіна': 'Torque converter lab: first gear, the turbine turns the input shaft',
  'Двигун і насос': 'Engine and impeller',
  'Відношення': 'Ratios',
  'Ковзання': 'Slip',
  'насос': 'impeller',
  'турбіна': 'turbine',
  'реактор': 'stator',
  'потік оливи': 'oil flow',
  'крутиться вільно': 'freewheels',
  'тримається на муфті вільного ходу': 'held by its one-way clutch',
  '{rpm} об/хв · {nm} Н·м': '{rpm} rpm · {nm} N·m',
  'газ {pedal} %, гальмо': 'throttle {pedal} %, brake on',
  'газ {pedal} %': 'throttle {pedal} %',
  'ковзання, об/хв': 'slip, rpm',
  'с': 's',
  'двигун, повний газ': 'engine, full throttle',
  'насос: (n/K)²': 'impeller: (n/K)²',
  'точка зчеплення': 'coupling point',
  'муфта замикається': 'clutch closes',
  'Тест на зупинці': 'Stall test',
  'Гальмо втиснуте, газ до упору. Турбіна стоїть, а насос крутиться з двигуном. Оберти ростуть, доки момент двигуна не зрівняється з тим, що забирає насос: T = (n/K)². Для K = {k} крива двигуна перетинає параболу на {rpm} об/хв, і модель стає на {settled}. Реактор тримається на муфті вільного ходу й повертає оливу, тому на турбіні в 1,81 раза більше моменту, ніж дає двигун.':
    'Brake pressed, throttle floored. The turbine stands while the impeller turns with the engine. The revs rise until the engine\'s torque equals what the impeller absorbs: T = (n/K)². For K = {k} the engine\'s curve meets the parabola at {rpm} rpm, and the model settles at {settled}. The stator is held by its one-way clutch and turns the oil back, so the turbine gets 1.81 times the torque the engine gives.',
  'Рушання': 'Pulling away',
  'Газ відпущено, двигун повернувся до холостого ходу. Тепер гальмо відпускається, а педаль іде на {pedal} %. Турбіна розкручується, швидкісне відношення SR = n_т/n_н росте, а коефіцієнт трансформації TR падає з 1,81 майже лінійно. Точка на графіку йде виміряною кривою GM 6T40.':
    'The throttle is off and the engine is back at idle. Now the brake comes off and the pedal goes to {pedal} %. The turbine speeds up, the speed ratio SR = n_t/n_i rises, and the torque ratio TR falls from 1.81 almost linearly. The dot follows the measured curve of the GM 6T40.',
  'Точка зчеплення': 'Coupling point',
  'На SR = {sc} TR доходить до 1: далі реактор мав би штовхати оливу вперед, і муфта вільного ходу його відпускає. Він крутиться разом з оливою, а гідротрансформатор працює як звичайна гідромуфта: момент на турбіні майже дорівнює моменту насоса, а турбіна крутиться трохи повільніше.':
    'At SR = {sc} TR reaches 1: beyond it the stator would have to push the oil forward, so its one-way clutch lets it go. It turns with the oil, and the converter works as a plain fluid coupling: the turbine gets almost the impeller\'s torque and turns a little slower.',
  'Блокування': 'Lockup',
  'Стенд тримає швидкість авто на {kmh} км/год, педаль та сама. Відкритий гідротрансформатор при цьому ковзає на {from} об/хв. Тепер замикається муфта блокування, і ковзання між двигуном і турбіною падає до {to} об/хв: керування навмисно лишає кілька десятків обертів, щоб вібрація двигуна не йшла в кузов. Більшу частину моменту тепер передає муфта, і втрати в оливі майже зникають.':
    'The rig holds the car at {kmh} km/h, the pedal unchanged. The open converter slips {from} rpm here. Now the lockup clutch closes, and the slip between the engine and the turbine falls to {to} rpm: the control leaves a few tens of rpm on purpose, so that the engine\'s vibration does not reach the body. The clutch now carries most of the torque, and the losses in the oil almost vanish.',
  // The article.
  'На столі коробка крутиться без авто: двигун крутить вхідний вал так, ніби муфта блокування гідротрансформатора замкнена, вихід крутиться вільно, а муфти й гальма замикаються одразу. Замикайте елементи кнопками A–E, і модель та номограма покажуть, що вони лишають.':
    'On the table the transmission turns without the car: the engine turns the input shaft as if the torque converter\'s lockup clutch were closed, the output turns freely, and the clutches and brakes close at once. Close the elements with the A–E buttons, and the model and the lever diagram show what they leave.',
  'Між двигуном і коробкою стоїть гідротрансформатор: насосне колесо на двигуні жене оливу в лопатки турбінного колеса на вході коробки, а реактор між ними повертає оливу назад так, що вона допомагає насосу. Поки авто стоїть, турбіна стоїть, а двигун крутиться: тому автомат не глухне на передачі. На рушанні турбіна отримує більше моменту, ніж дає двигун, на зупинці в 1,81 раза. Коли турбіна наздоганяє насос, реактор відпускає муфта вільного ходу, а пізніше муфта блокування з’єднує двигун із коробкою майже без ковзання.':
    'A torque converter stands between the engine and the transmission: the impeller on the engine throws oil into the blades of the turbine on the transmission\'s input, and the stator between them turns the oil back so that it helps the impeller. While the car stands, the turbine stands and the engine turns, which is why an automatic does not stall in gear. Pulling away, the turbine gets more torque than the engine gives, 1.81 times at stall. Once the turbine catches up with the impeller, the one-way clutch lets the stator go, and later the lockup clutch joins the engine to the transmission with almost no slip.',
  'Показати: гідротрансформатор': 'Show: the torque converter',
};
