// Page double-wishbone (stage P4): the typical double wishbone in front of a rear-driven car and four real cars, each
// written as a design (src/suspension-designer/page-cars.ts). English: src/i18n/en/suspension-double-wishbone.ts.
//
// What is sourced, car by car (docs/suspension-model.md, the travel scene's section):
// - Mazda MX-5 ND: double wishbones in front and a multilink at the rear (cars.co.za's pre-launch report, secondary);
//   wheelbase 2310 mm and the 1.5 MT's 2183 lb (990 kg) from Wikipedia after Car and Driver and Mazda USA; Car and
//   Driver's test of a pre-production 2016 MX-5 Club, in a third-party reprint: 0.90 g on a 300 ft skidpad, 70-0 mph in
//   158 ft. Tracks, tyres of the base car and the weight split are not checked.
// - Porsche 911 GT3 (992): the double wishbone front axle, the first on a production 911, taken from the 911 RSR
//   (Porsche's 2021 release); tyres 255/35 ZR 20 and 315/30 ZR 21, and the 992.2's shorter bump stops giving 27 mm more
//   travel in front and 24 mm at the rear (Porsche's press kit); wheelbase 2457 mm and 1435 kg from Wikipedia. Tracks
//   and the weight split are not checked.
// - Chevrolet Corvette Z06 (C8): the shared car record (src/data/cars/chevrolet-corvette-z06-c8.ts); unequal-length
//   forged aluminum wishbones front and rear and coilovers in place of the earlier cars' transverse leaf at the rear
//   (Wikipedia).
// - Subaru BRZ (ZD8): a strut in front and double wishbones at the rear (Wikipedia, «Toyota 86»); wheelbase 2575 mm and
//   1270 kg, the lightest version (Wikipedia). Tracks, tyres and the weight split are not checked.

import { CAR as CORVETTE_Z06 } from '../cars/chevrolet-corvette-z06-c8.ts';
import { t } from '../../i18n/t.ts';
import { figuresDesign, recordFigures, TYPICAL_RWD, designCorner, type PageCar, type SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { DRIVER_KG } from '../../vehicle/mass.ts';
import { suspensionCarLink } from '../suspension-links.ts';

const MX5_ND: PageCar = {
  link: suspensionCarLink('double-wishbone', 'mazda-mx5-nd')!,
  design: figuresDesign({
    car: 'mazda-mx5-nd',
    massKg: 990 + DRIVER_KG,
    frontShare: 0.5,
    cgHeightMm: null,
    wheelbaseMm: 2310,
    trackMm: [1495, 1505],
    drive: 'rwd',
    tyres: ['195/50 R16', '195/50 R16'],
    layouts: ['double-wishbone', 'multilink'],
  }),
  facts: [
    t('Спереду подвійні поперечні важелі, ззаду багаторичажна підвіска.'),
    t('Car and Driver на передсерійному MX-5 Club 2016 року: 0,90 g на колі діаметром 300 футів (91 м), гальмування з 70 миль/год до зупинки за 158 футів (48 м).'),
  ],
  sources: [
    'https://www.cars.co.za/motoring-news/2016-mazda-mx-5-details-revealed/66328/',
    'https://integrityexports.com/wp-content/uploads/2015/06/2016-mazda-mx-5-miata-club-test-review',
    'https://en.wikipedia.org/wiki/Mazda_MX-5_(ND)',
  ],
  unverified: ['frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR', 'tyre size'],
};

const GT3_992: PageCar = {
  link: suspensionCarLink('double-wishbone', 'porsche-911-gt3-992')!,
  design: figuresDesign({
    car: 'porsche-911-gt3-992',
    massKg: 1435 + DRIVER_KG,
    frontShare: 0.39,
    cgHeightMm: null,
    wheelbaseMm: 2457,
    trackMm: [1591, 1557],
    drive: 'rwd',
    tyres: ['255/35 ZR20', '315/30 ZR21'],
    layouts: ['double-wishbone', 'multilink'],
  }),
  facts: [
    t('Перший серійний 911 з подвійними поперечними важелями спереду замість стійок Макферсон. Таку передню підвіску Porsche перенесла з гоночного 911 RSR: кулак тримають два важелі, тож розвал набирається на всьому ході, а стійка не мусить ще й тримати колесо.'),
    t('На оновленому 992.2 коротші відбійники додали 27 мм ходу спереду й 24 мм ззаду.'),
  ],
  sources: [
    'https://newsroom.porsche.com/en_US/2021/products/porsche-911-gt3-motorsport-technology-world-premiere-23656.html',
    'https://newsroom.porsche.com/en/press-kits/911-GT3/Chassis-and-dynamics.html',
    'https://en.wikipedia.org/wiki/Porsche_911_GT3',
  ],
  // The tracks are the 992 Carrera's (auto motor und sport), not the GT3's.
  unverified: ['frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR'],
};

const CORVETTE: PageCar = {
  link: suspensionCarLink('double-wishbone', 'chevrolet-corvette-z06-c8')!,
  design: figuresDesign(recordFigures(CORVETTE_Z06, ['double-wishbone', 'double-wishbone'])),
  facts: [
    t('Спереду й ззаду подвійні поперечні важелі різної довжини з кованого алюмінію.'),
    t('Ззаду гвинтові пружини на амортизаторах замість поперечної ресори, яку мали попередні Corvette. На Z06 адаптивні магнітні амортизатори стоять серійно.'),
  ],
  sources: ['https://en.wikipedia.org/wiki/Chevrolet_Corvette_(C8)'],
  unverified: ['massKg', 'frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR'],
};

const BRZ_ZD8: PageCar = {
  link: suspensionCarLink('double-wishbone', 'subaru-brz-zd8')!,
  design: figuresDesign({
    car: 'subaru-brz-zd8',
    massKg: 1270 + DRIVER_KG,
    frontShare: 0.53,
    cgHeightMm: null,
    wheelbaseMm: 2575,
    trackMm: [1520, 1550],
    drive: 'rwd',
    tyres: ['215/40 R18', '215/40 R18'],
    layouts: ['macpherson', 'double-wishbone'],
  }),
  facts: [t('Спереду стійки Макферсон, ззаду подвійні поперечні важелі: сторінка показує задню вісь. Те саме шасі має Toyota GR86.')],
  sources: ['https://en.wikipedia.org/wiki/Toyota_86'],
  unverified: ['frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR', 'tyre size'],
};

export const DOUBLE_WISHBONE_PAGE: SuspensionPage = {
  id: 'double-wishbone',
  base: { end: 'F', corner: () => designCorner(TYPICAL_RWD, 'F'), geometry: 'typical' },
  cars: [MX5_ND, GT3_992, CORVETTE, BRZ_ZD8],
};
