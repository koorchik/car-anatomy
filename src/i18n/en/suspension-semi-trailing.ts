// English for the semi-trailing page: its cars (src/data/suspensions/semi-trailing.ts) and its article
// (src/ui/suspensions/articles/semi-trailing.ts). Each suspension page has its own dictionary (build order, shared files).

export const SUSPENSION_SEMI_TRAILING_EN: Record<string, string> = {
  'Спереду стійки Макферсон, ззаду косі важелі. Така компактна схема лишала більше місця в салоні й багажнику, ніж інші при тих самих розмірах авто.':
    'MacPherson struts in front, semi-trailing arms at the rear. This compact layout left more room in the cabin and the trunk than others in a car of the same size.',
  'Косі важелі критикують за те, що на ході вони змінюють сходження й розвал, і в різкому повороті на трасі чи автокросі колесо саме підрулює. Огляди при цьому хвалили керованість E30.':
    'Semi-trailing arms are criticized for changing toe and camber over the travel, so that in a sharp corner on a track or at an autocross the wheel steers itself. Reviews nonetheless praised the E30’s handling.',
  'NHTSA зважила й виміряла 325i 1986 року: 1252 кг, 53,3 % ваги спереду, центр мас на висоті 0,533 м.':
    'NHTSA weighed and measured a 1986 325i: 1252 kg, 53.3 % of the weight in front, the center of gravity 0.533 m up.',
  'Двигун спереду, а коробка разом із головною передачею ззаду, тож вага лягає на осі майже порівну: 50,7 % спереду й 49,3 % ззаду.':
    'The engine in front and the gearbox with the final drive at the rear, so the weight falls on the axles almost equally: 50.7 % in front and 49.3 % at the rear.',
  'З середини 1985 року косі важелі ззаду й поперечні важелі спереду литі з легкого сплаву.':
    'From mid-1985 the semi-trailing arms at the rear and the control arms in front are cast from light alloy.',
  'Про косі важелі':
    'About semi-trailing arms',
  'Це поздовжній важіль, вісь хитання якого повернута в плані: внутрішня опора стоїть ближче до середини авто, ніж зовнішня. Колесо тоді ходить не в площині боку авто, а по дузі навколо косої осі, тож на стиску набирає від’ємний розвал, а сходження змінюється трохи і в один бік: усередину і на стиску, і на відбої. Кут осі в плані зазвичай від 10° до 25°.':
    'This is a trailing arm whose pivot axis is turned in plan: the inner bushing stands closer to the middle of the car than the outer one. The wheel then moves not in the plane of the car’s side but on an arc around the slanted axis, so it gains negative camber in bump, and its toe changes a little and one way only: toe-in both in bump and in droop. The axis angle in plan is usually from 10° to 25°.',
  'Як читати сцену':
    'How to read the scene',
  'Повзунок «Кут осі хитання» у «Ході колеса» показує, що косий важіль лежить між поздовжнім і хитним мостом: на 15° типова вісь дає центр крену близько 126 мм і набір розвалу −30,5° на метр ходу, а на +120 мм ходу розвал −3,7°. На 0° обидва числа нульові, на 90° центр крену доходить до висоти осі.':
    'The “Pivot axis angle” slider in “Wheel travel” shows that the semi-trailing arm lies between the trailing arm and the swing axle: at 15° the typical axis gives a roll center of about 126 mm and a camber gain of −30.5° per meter of travel, and −3.7° of camber at +120 mm of travel. At 0° both numbers are zero; at 90° the roll center reaches the height of the axis.',
  'Піввісь іде від диференціала до маточини, а маточина ходить по дузі навколо іншої осі, ніж вал. Тому відстань між шарнірами змінюється: на +120 мм ходу на 10,5 мм. Внутрішній шарнір має осьовий хід, і число під графіком показує, скільки його витрачено.':
    'The halfshaft runs from the differential to the hub, and the hub moves on an arc around another axis than the shaft’s. So the distance between the joints changes: by 10.5 mm at +120 mm of travel. The inner joint has plunge, and the number under the chart shows how much of it is used.',
  'Як це відчувається':
    'How it feels',
  'Схема компактна й лишає місце в салоні й багажнику, тому її мали ззаду, наприклад, BMW 3 серії E30 і Porsche 944. Головна претензія — колесо змінює сходження й розвал на ході, і в різкому повороті на межі зчеплення задня вісь трохи підрулює сама.':
    'The layout is compact and leaves room in the cabin and the trunk, so it was at the rear of, for example, the BMW 3 Series E30 and the Porsche 944. The main complaint is that the wheel changes toe and camber over the travel, and in a sharp corner at the limit of grip the rear axle steers a little by itself.',
  'Звідки цифри':
    'Where the numbers come from',
  'Геометрія типова: кут осі 15°, внутрішня опора на 0,35 м попереду центра колеса й на 0,20 м від осі авто, вісь на висоті центра колеса, колія 1,54 м. Кут осі навмисно не прив’язано до жодного авто: число «15° у BMW E30» знайшлося лише в блозі без джерела. Межі ходу й кута ШРУСів — типові для ШРУСів GKN, як у стійки Макферсон.':
    'The geometry is typical: an axis angle of 15°, the inner bushing 0.35 m ahead of the wheel center and 0.20 m from the car’s center line, the axis at the height of the wheel center, track 1.54 m. The axis angle is deliberately not tied to any car: the figure “15° on the BMW E30” turned up only in a blog without a source. The limits of the CV joints’ plunge and angle are typical of GKN joints, as on the MacPherson strut.',
};
