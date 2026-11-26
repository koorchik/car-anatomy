// Page trailing-arm (stage P5): the typical trailing arm at the rear of a front-driven car and one real car, written as
// a design (src/suspension-designer/page-cars.ts). English: src/i18n/en/suspension-trailing-arm.ts.
//
// What is sourced (docs/suspension-model.md, the pivot pages' section):
// - Citroën 2CV: leading arms in front and trailing arms at the rear on bearings in cross tubes, the front and rear
//   springs of a side in one horizontal cylinder (Wikipedia, «Citroën 2CV», after Reynolds 2005); production 1948–1990
//   and the 2400 mm wheelbase (Wikipedia; Auto Motor und Sport's data as the research cites it); 560 kg for the 1970
//   2CV 4 and 2CV 6 (Citroënët, as the research cites it). The weight split, the centre of mass, the tracks, the tyre
//   size and whether it had anti-roll bars are not checked. The designer has no leading arm: the design's front axle
//   is the typical strut, and the page shows the rear one.

import { t } from '../../i18n/t.ts';
import { designCorner, figuresDesign, TYPICAL_FWD_TRAILING, type PageCar, type SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { DRIVER_KG } from '../../vehicle/mass.ts';
import { suspensionCarLink } from '../suspension-links.ts';

const CITROEN_2CV: PageCar = {
  link: suspensionCarLink('trailing-arm', 'citroen-2cv')!,
  design: figuresDesign({
    car: 'citroen-2cv',
    massKg: 560 + DRIVER_KG,
    frontShare: 0.6,
    cgHeightMm: null,
    wheelbaseMm: 2400,
    trackMm: [1260, 1260],
    drive: 'fwd',
    tyres: ['125/80 R15', '125/80 R15'],
    layouts: ['macpherson', 'trailing-arm'],
    bars: [false, false],
  }),
  facts: [
    t('Ззаду поздовжні важелі, спереду важелі, що тягнуться від своєї осі вперед. Усі чотири хитаються на великих підшипниках у трубах поперек рами.'),
    t('Пружини переднього й заднього колеса одного боку сидять в одному горизонтальному циліндрі, і тяги з’єднують їх із важелями. Коли переднє колесо наїжджає на горб, циліндр зсувається вперед і притискає заднє колесо того самого боку донизу, тож кузов менше кивається.'),
    t('У конструкторі сайту немає важелів, що тягнуться вперед, тому спереду в цьому дизайні стоїть типова стійка, а сторінка показує задню вісь.'),
  ],
  sources: [
    'https://en.wikipedia.org/wiki/Citro%C3%ABn_2CV',
    'https://citroenet.org.uk/passenger-cars/michelin/2cv/technical.html',
    'https://www.citroenet.org.uk/foreign/latin-america/argentina/argentina8.html',
  ],
  unverified: ['frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR', 'tyre size', 'barMmF', 'barMmR'],
};

export const TRAILING_ARM_PAGE: SuspensionPage = {
  id: 'trailing-arm',
  base: { end: 'R', corner: () => designCorner(TYPICAL_FWD_TRAILING, 'R'), geometry: 'typical', design: () => TYPICAL_FWD_TRAILING },
  cars: [CITROEN_2CV],
};
