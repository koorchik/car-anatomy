/** English for the gearbox part cards (src/scene/gearbox/parts.ts). */
export const GEARBOX_PARTS_EN: Record<string, string> = {
  'Первинний вал': 'Input shaft',
  'Виходить із картера зчеплення й крутиться разом із диском зчеплення. Його шестерня постійно зачеплена з проміжним валом, а на прямій передачі муфта з’єднує його з вторинним валом напряму.':
    'It comes out of the bellhousing and turns with the clutch disc. Its gear is always in mesh with the countershaft, and in direct drive a sleeve locks it straight to the output shaft.',
  'Проміжний вал': 'Countershaft',
  'Головна пара постійно крутить його від первинного вала. Його шестерні зачеплені з шестернями всіх передач одночасно, тому в коробці крутяться всі шестерні, хоч би яка передача була ввімкнена.':
    'The constant-mesh pair turns it from the input shaft all the time. Its gears mesh with the gears of every speed at once, so every gear in the box turns whichever gear is selected.',
  'Вторинний вал': 'Output shaft',
  'Стоїть на одній осі з первинним і веде до кардана. Шестерні передач сидять на ньому вільно, а вал крутять лише муфти синхронізаторів, коли з’єднують із ним одну з цих шестерень.':
    'It sits on the same axis as the input shaft and leads to the driveshaft. The speed gears run free on it, and only the synchronizer sleeves turn the shaft, when they lock one of those gears to it.',
  'Шестерня проміжного вала': 'Countershaft gear',
  'Закріплена на проміжному валу. Разом із шестернею вторинного вала, з якою вона зачеплена, задає число передачі: у скільки разів вихід крутиться повільніше за вхід.':
    'It is fixed to the countershaft. Together with the output shaft gear it meshes with, it sets the gear ratio: how many times slower the output turns than the input.',
  'Шестерня передачі': 'Speed gear',
  'Крутиться на вторинному валу вільно, на голчастому підшипнику, і завжди зачеплена з проміжним валом. Передача вмикається, коли муфта синхронізатора з’єднує цю шестерню з валом.':
    'It runs free on the output shaft on a needle bearing and is always in mesh with the countershaft. The gear is engaged when a synchronizer sleeve locks this gear to the shaft.',
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
};
