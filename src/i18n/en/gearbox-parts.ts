/** English for the gearbox part cards (src/scene/gearbox/parts.ts). */
export const GEARBOX_PARTS_EN: Record<string, string> = {
  'Первинний вал': 'Input shaft',
  'Виходить із картера зчеплення й крутиться разом із диском зчеплення. Його шестерня постійно зачеплена з проміжним валом, а на прямій передачі муфта з’єднує його з вторинним валом напряму.':
    'It comes out of the bellhousing and turns with the clutch disc. Its gear is always in mesh with the countershaft, and in direct drive a sleeve locks it straight to the output shaft.',
  'Проміжний вал': 'Countershaft',
  'Головна пара постійно крутить його від первинного вала. Його шестерні зачеплені з шестернями всіх передач одночасно, тому в коробці крутяться всі шестерні, хоч би яка передача була ввімкнена.':
    'The constant-mesh pair turns it from the input shaft all the time. Its gears mesh with the gears of every speed at once, so every gear in the box turns whichever gear is selected.',
  'Вторинний вал': 'Output shaft',
  'Стоїть на одній осі з первинним і веде до кардана. Шестерні передач сидять на ньому вільно, а вал крутять лише муфти синхронізаторів: муфта з’єднує з ним одну з цих шестерень, а на прямій передачі — сам первинний вал.':
    'It sits on the same axis as the input shaft and leads to the driveshaft. The speed gears run free on it, and only the synchronizer sleeves turn the shaft: a sleeve locks one of those gears to it, or the input shaft itself in direct drive.',
  'Шестерня проміжного вала': 'Countershaft gear',
  'Закріплена на проміжному валу й крутиться разом із ним. Шестерня головної пари бере обертання від первинного вала, а решта віддають його шестерням передач. Число передачі — у скільки разів вихід крутиться повільніше за вхід — це добуток чисел двох пар, якими йде потужність: головної й пари цієї передачі.':
    'It is fixed to the countershaft and turns with it. The gear of the constant-mesh pair takes the drive from the input shaft, and the others pass it on to the speed gears. The gear ratio, how many times slower the output turns than the input, is the product of the two pairs the power runs through: the constant-mesh pair and the pair of that gear.',
  'Шестерня передачі': 'Speed gear',
  'Крутиться на вторинному валу вільно, на голчастому підшипнику, і завжди зачеплена з шестернею проміжного вала, а шестерня заднього ходу — з проміжною шестернею. Передача вмикається, коли муфта синхронізатора з’єднує цю шестерню з валом.':
    'It runs free on the output shaft on a needle bearing and is always in mesh with a countershaft gear, or the reverse gear with the reverse idler. The gear is engaged when a synchronizer sleeve locks this gear to the shaft.',
  'Маточина синхронізатора': 'Synchronizer hub',
  'Сидить на шліцах вторинного вала й крутиться разом із ним. По її зовнішніх шліцах ковзає муфта.':
    'It sits on splines of the output shaft and turns with it. The sleeve slides on its outer splines.',
  'Муфта синхронізатора': 'Synchronizer sleeve',
  'Вилка зсуває її до шестерні. Спершу конус вирівнює швидкості вала й шестерні, а тоді шліци муфти насуваються на вінець шестерні й замикають її на валу.':
    'The fork pushes it toward a gear. First a cone matches the speeds of the shaft and the gear, then the sleeve splines slide over the gear’s dog ring and lock it to the shaft.',
  'Блокувальне кільце': 'Blocker ring',
  'Латунне кільце з конусом. Тертям на конусі воно розганяє або гальмує шестерню до швидкості вала й не пускає муфту далі, доки швидкості не зрівняються.':
    'A brass ring with a cone. Friction on the cone speeds the gear up or slows it down to the shaft’s speed, and the ring holds the sleeve back until the speeds match.',
  'Вінець включення': 'Dog ring',
  'Дрібні зубці збоку шестерні. На них насувається муфта, і шестерня стає одним цілим із валом.':
    'Small teeth on the side of a gear. The sleeve slides over them, and the gear becomes one with the shaft.',
  'Вилка перемикання': 'Shift fork',
  'Охоплює муфту в її канавці й зсуває її вздовж вала, коли водій рухає важіль.': 'It rides in the sleeve’s groove and slides the sleeve along the shaft when the driver moves the lever.',
  'Шток вилки': 'Shift rail',
  'Ковзає вздовж картера й несе вилку. Замок між штоками не дає ввімкнути дві передачі одночасно.':
    'It slides along the case and carries a fork. An interlock between the rails keeps two gears from being engaged at once.',
  'Проміжна шестерня заднього ходу': 'Reverse idler',
  'Стоїть між проміжним і вторинним валами на окремій осі. Ще одне зачеплення міняє напрям обертання, тому вторинний вал крутиться назад.':
    'It sits between the countershaft and the output shaft on an axis of its own. One more mesh reverses the direction of rotation, so the output shaft turns backward.',
  'Картер коробки': 'Transmission case',
  'Литий алюмінієвий корпус. Тримає підшипники валів на точній міжосьовій відстані й вміщує оливу, у якій купаються шестерні.':
    'A cast aluminum housing. It holds the shaft bearings at a precise center distance and contains the oil the gears run in.',
  'Картер зчеплення': 'Bellhousing',
  'Розтруб між двигуном і коробкою. Усередині маховик, зчеплення й вижимний підшипник.': 'The flared housing between the engine and the transmission. The flywheel, the clutch and the release bearing are inside.',
  'Подовжувач': 'Extension housing',
  'Задня частина картера. Тримає кінець вторинного вала й несе опору важеля перемикання.': 'The rear part of the case. It supports the end of the output shaft and carries the shifter mount.',
  'Опора важеля': 'Shifter mount',
  'Тут стоїть важіль перемикання. Через тягу він рухає штоки й вилки всередині коробки.': 'The shift lever stands here. Through a linkage it moves the rails and forks inside the transmission.',
  'Важіль перемикання': 'Shift lever',
  'Ним водій вибирає передачу. Рух убік вибирає шток, а вперед чи назад — бік муфти.':
    'The driver selects a gear with it. A sideways move picks the rail, and forward or back picks the side of the sleeve.',
  'Підшипник': 'Bearing',
  'Кульковий або роликовий підшипник у стінці картера. Тримає вал на місці й сприймає осьові сили косих зубців.':
    'A ball or roller bearing in the case wall. It keeps the shaft in place and takes the axial forces of the helical teeth.',
  'Фланець виходу': 'Output flange',
  'Кінець вторинного вала. До нього кріпиться кардан, часто через еластичну муфту.': 'The end of the output shaft. The driveshaft bolts to it, often through a flexible coupling.',
  'Виходить із картера зчеплення й крутиться разом із диском зчеплення. На ньому шестерні всіх передач: одні нарізані на самому валу, інші крутяться на ньому вільно, доки муфта не з’єднає їх із валом.':
    'It comes out of the bellhousing and turns with the clutch disc. It carries a gear for every speed: some are cut on the shaft itself, the others run free on it until a sleeve locks them to it.',
  'Стоїть паралельно первинному, і кожна передача — одна пара шестерень між цими двома валами. На його кінці біля двигуна ведуча шестерня головної передачі, тож вал крутить диференціал.':
    'It runs parallel to the input shaft, and every speed is one pair of gears between the two shafts. At its end next to the engine sits the final drive pinion, so the shaft turns the differential.',
  'Шестерня на валу': 'Fixed gear',
  'Нарізана на валу або закріплена на ньому й крутиться разом із ним. Завжди зачеплена з шестернею передачі на другому валу. Число передачі — це відношення зубців пари: у скільки разів вторинний вал крутиться повільніше за первинний.':
    'It is cut on the shaft or fixed to it and turns with it. It is always in mesh with a speed gear on the other shaft. The gear ratio is the ratio of the pair’s teeth: how many times slower the output shaft turns than the input shaft.',
  'Крутиться на своєму валу вільно, на голчастому підшипнику, і завжди зачеплена з шестернею другого вала. Передача вмикається, коли муфта синхронізатора з’єднує цю шестерню з валом. Шестерні нижчих передач зазвичай вільні на вторинному валу, вищих — на первинному.':
    'It runs free on its shaft on a needle bearing and is always in mesh with a gear of the other shaft. The gear is engaged when a synchronizer sleeve locks this gear to the shaft. The gears of the low speeds usually run free on the output shaft, those of the high speeds on the input shaft.',
  'Сидить на шліцах свого вала й крутиться разом із ним. По її зовнішніх шліцах ковзає муфта. У двовальній коробці муфти стоять на обох валах, біля вільних шестерень.':
    'It sits on splines of its shaft and turns with it. The sleeve slides on its outer splines. In a two-shaft transmission the sleeves sit on both shafts, next to the free-running gears.',
  'Стоїть між двома валами на окремій осі. Ще одне зачеплення міняє напрям обертання, тому авто їде назад. Подвійна проміжна має дві шестерні з різною кількістю зубців, і так невелика коробка отримує потрібне число заднього ходу.':
    'It sits between the two shafts on an axis of its own. One more mesh reverses the direction of rotation, so the car moves backward. A compound idler has two gears with different tooth counts, which gives a compact transmission the reverse ratio it needs.',
  'Головна передача': 'Final drive',
  'Ведуча шестерня на вторинному валу крутить велике ведене колесо на корпусі диференціала. Її число множиться на число кожної передачі. Коли двигун стоїть упоперек, це косозуба пара на паралельних осях; коли вздовж, — конічна, бо колеса крутяться поперек валів коробки.':
    'The pinion on the output shaft turns a large gear on the differential case. Its ratio multiplies the ratio of every speed. With a transverse engine it is a helical pair on parallel axes; with a longitudinal one it is a bevel pair, because the wheels turn across the transmission’s shafts.',
  'Корпус диференціала': 'Differential case',
  'Крутиться разом із веденим колесом головної передачі. Сателіти й напівосьові шестерні всередині дають колесам у повороті крутитися з різною швидкістю. У самоблоці тертя чи косозубі сателіти не дають колесу, яке буксує, забрати весь момент.':
    'It turns with the final drive gear. The spider gears and side gears inside let the wheels turn at different speeds in a corner. In a limited-slip differential, friction or helical planet gears keep a spinning wheel from taking all the torque.',
  'Піввісь': 'Halfshaft',
  'Веде від диференціала до колеса. Тут видно лише її початок біля коробки: решту показує підвіска.':
    'It runs from the differential to the wheel. Only its start next to the transmission is shown here; the suspension shows the rest.',
  'Внутрішній ШРУС': 'Inner CV joint',
  'Шарнір рівних кутових швидкостей на внутрішньому кінці піввісі. Дає піввісі змінювати кут і довжину, коли колесо ходить угору й униз, і передає обертання рівно, без ривків.':
    'The constant-velocity joint at the inner end of the halfshaft. It lets the halfshaft change its angle and length as the wheel moves up and down, and passes the rotation on smoothly.',
};
