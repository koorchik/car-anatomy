// Page semi-trailing (stage P5): the typical semi-trailing arm at the rear of a rear-driven car and two real cars, each
// written as a design (src/suspension-designer/page-cars.ts). English: src/i18n/en/suspension-semi-trailing.ts.
//
// What is sourced (docs/suspension-model.md, the pivot pages' section):
// - BMW 325i (E30): struts in front and semi-trailing arms at the rear, a compact layout that left room in the cabin
//   and the trunk, criticised for the toe and camber the arms change on the travel (Wikipedia, «BMW 3 Series (E30)»);
//   the 325i from 1985 to 1993 (the same page); NHTSA's measurement of a 1986 325i (Heydinger et al. 1999, through a
//   copy, docs/suspension-research/real_car_data.md): 1252 kg on the test, 53.3 % in front, centre of mass 0.533 m up,
//   wheelbase 2570 mm, tracks 1402 and 1394 mm. The tyre size is not checked.
// - Porsche 944: front engine and a rear transaxle, 50.7 % of the weight in front; cast alloy control arms and
//   semi-trailing arms from mid-1985; 1180 kg before 1988, which Wikipedia warns may be a dry weight; wheelbase 2400 mm;
//   built 1982–1991 (Wikipedia, «Porsche 944»). The centre of mass, the tracks and the tyres are not checked.

import { t } from '../../i18n/t.ts';
import { designCorner, figuresDesign, TYPICAL_RWD_SEMI, type PageCar, type SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { DRIVER_KG } from '../../vehicle/mass.ts';
import { suspensionCarLink } from '../suspension-links.ts';

const BMW_325I_E30: PageCar = {
  link: suspensionCarLink('semi-trailing', 'bmw-325i-e30')!,
  design: figuresDesign({
    car: 'bmw-325i-e30',
    massKg: 1252,
    frontShare: 0.533,
    cgHeightMm: 533,
    wheelbaseMm: 2570,
    trackMm: [1402, 1394],
    drive: 'rwd',
    tyres: ['195/65 R14', '195/65 R14'],
    layouts: ['macpherson', 'semi-trailing'],
  }),
  facts: [
    t('Спереду стійки Макферсон, ззаду косі важелі. Така компактна схема лишала більше місця в салоні й багажнику, ніж інші при тих самих розмірах авто.'),
    t('Косі важелі критикують за те, що на ході вони змінюють сходження й розвал, і в різкому повороті на трасі чи автокросі колесо саме підрулює. Огляди при цьому хвалили керованість E30.'),
    t('NHTSA зважила й виміряла 325i 1986 року: 1252 кг, 53,3 % ваги спереду, центр мас на висоті 0,533 м.'),
  ],
  sources: ['https://en.wikipedia.org/wiki/BMW_3_Series_(E30)', 'https://www.lfs.net/attachment/44487'],
  unverified: ['tyre size'],
};

const PORSCHE_944: PageCar = {
  link: suspensionCarLink('semi-trailing', 'porsche-944')!,
  design: figuresDesign({
    car: 'porsche-944',
    massKg: 1180 + DRIVER_KG,
    frontShare: 0.507,
    cgHeightMm: null,
    wheelbaseMm: 2400,
    trackMm: [1477, 1451],
    drive: 'rwd',
    tyres: ['215/60 R15', '215/60 R15'],
    layouts: ['macpherson', 'semi-trailing'],
  }),
  facts: [
    t('Двигун спереду, а коробка разом із головною передачею ззаду, тож вага лягає на осі майже порівну: 50,7 % спереду й 49,3 % ззаду.'),
    t('З середини 1985 року косі важелі ззаду й поперечні важелі спереду литі з легкого сплаву.'),
  ],
  sources: ['https://en.wikipedia.org/wiki/Porsche_944'],
  // Wikipedia's 1180 kg may be a dry weight; the tracks are an estimate.
  unverified: ['massKg', 'cgHeightMm', 'trackMmF', 'trackMmR', 'tyre size'],
};

export const SEMI_TRAILING_PAGE: SuspensionPage = {
  id: 'semi-trailing',
  base: { end: 'R', corner: () => designCorner(TYPICAL_RWD_SEMI, 'R'), geometry: 'typical', design: () => TYPICAL_RWD_SEMI },
  cars: [BMW_325I_E30, PORSCHE_944],
};
