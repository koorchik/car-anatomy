// Page multilink (stage P4): the typical five-link at the rear of a rear-driven car and three real cars, each written
// as a design (src/suspension-designer/page-cars.ts). English: src/i18n/en/suspension-multilink.ts.
//
// What is sourced, car by car (docs/suspension-model.md, the travel scene's section):
// - Mercedes-Benz 190 (W201): the five-link rear it introduced (Wikipedia, after von der Ohe, SAE 831045, 1983); NHTSA's
//   measurement of a 1987 190 (Heydinger et al. 1999, through a copy, docs/suspension-research/real_car_data.md): 1302
//   kg on the test, 54.4 % in front, centre of mass 0.559 m up, wheelbase 2664 mm, tracks 1438 and 1417 mm. The tyre
//   size is not checked.
// - Toyota GR Supra (A90): wheelbase 2470 mm and 1410–1520 kg (Wikipedia; the heavier is the 3.0 the page shows). The
//   strut with a double-joint lower arm in front and the five links at the rear are Toyota's press pack as the plan
//   cites it; not seen again here. Tracks, tyres and the weight split are not checked.
// - Volkswagen Golf 7: the «modular performance suspension» at the rear, 49 kg, on the stronger versions, and the 38 kg
//   «modular lightweight» axle on those under 90 kW (Volkswagen's 2012 launch text; another page of it puts the line
//   at 110 kW, which the 2.0 TDI's 110 kW meets either way); wheelbase 2637 mm (Wikipedia). The mass is a value inside
//   Wikipedia's 1205–1500 kg range, the weight split the Mk6 GTI's from Car and Driver; tracks and tyres not checked.

import { t } from '../../i18n/t.ts';
import { figuresDesign, TYPICAL_RWD, designCorner, type PageCar, type SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { DRIVER_KG } from '../../vehicle/mass.ts';
import { suspensionCarLink } from '../suspension-links.ts';

const W201: PageCar = {
  link: suspensionCarLink('multilink', 'mercedes-190-w201')!,
  design: figuresDesign({
    car: 'mercedes-190-w201',
    massKg: 1302,
    frontShare: 0.544,
    cgHeightMm: 559,
    wheelbaseMm: 2664,
    trackMm: [1438, 1417],
    drive: 'rwd',
    tyres: ['185/65 R15', '185/65 R15'],
    layouts: ['macpherson', 'multilink'],
  }),
  facts: [
    t('Перша серійна п’ятиважільна задня підвіска (1982). Кожна з п’яти тяг має кульові шарніри або сайлентблоки на обох кінцях і працює лише на розтяг і стиск, а разом вони лишають колесу один рух — хід угору-вниз.'),
    t('NHTSA зважила й виміряла 190 1987 року: 1302 кг, 54,4 % ваги спереду, центр мас на висоті 0,559 м.'),
  ],
  sources: ['https://en.wikipedia.org/wiki/Mercedes-Benz_W201', 'https://www.lfs.net/attachment/44487'],
  unverified: ['tyre size'],
};

const SUPRA_A90: PageCar = {
  link: suspensionCarLink('multilink', 'toyota-gr-supra-a90')!,
  design: figuresDesign({
    car: 'toyota-gr-supra-a90',
    massKg: 1520 + DRIVER_KG,
    frontShare: 0.5,
    cgHeightMm: null,
    wheelbaseMm: 2470,
    trackMm: [1594, 1589],
    drive: 'rwd',
    tyres: ['255/35 R19', '275/35 R19'],
    layouts: ['macpherson', 'multilink'],
  }),
  facts: [t('Спереду стійка Макферсон із подвійним шарніром унизу, ззаду п’ять тяг, важелі алюмінієві.')],
  sources: ['https://en.wikipedia.org/wiki/Toyota_GR_Supra'],
  unverified: ['frontShare', 'trackMmF', 'trackMmR', 'tyre size', 'suspension layout'],
};

const GOLF_7: PageCar = {
  link: suspensionCarLink('multilink', 'vw-golf-7')!,
  design: figuresDesign({
    car: 'vw-golf-7',
    massKg: 1350 + DRIVER_KG,
    frontShare: 0.615,
    cgHeightMm: null,
    wheelbaseMm: 2637,
    trackMm: [1549, 1520],
    drive: 'fwd',
    tyres: ['225/45 R17', '225/45 R17'],
    layouts: ['macpherson', 'multilink'],
  }),
  facts: [
    t('Ззаду «модульна спортивна» багаторичажна вісь вагою 49 кг. Слабші версії мають легшу вісь на 38 кг, тож одна модель авто їздить на двох різних задніх підвісках.'),
  ],
  sources: [
    'https://www.volkswagen-newsroom.com/en/the-new-golf-das-auto-international-driving-presentation-2797/the-new-golf-running-gear-suspensions-2847',
    'https://en.wikipedia.org/wiki/Volkswagen_Golf_Mk7',
  ],
  unverified: ['massKg', 'frontShare', 'trackMmF', 'trackMmR', 'tyre size'],
};

export const MULTILINK_PAGE: SuspensionPage = {
  id: 'multilink',
  base: { end: 'R', corner: () => designCorner(TYPICAL_RWD, 'R'), geometry: 'typical' },
  cars: [W201, SUPRA_A90, GOLF_7],
};
