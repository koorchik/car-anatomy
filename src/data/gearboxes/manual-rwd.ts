// Page manual-rwd, the manual gearbox with a countershaft: BMW M3 E30 (1986–1989, European car) with the Getrag 265/5 dogleg.
//
// What is published (docs/gearbox-model.md, the BMW M3 E30 section):
// - ratios 3.72 / 2.40 / 1.77 / 1.26 / 1.00, reverse 4.23, final drive 3.25: auto motor und sport's test of the M3
//   E30 and m3-klassik.de (secondary); the same set to three places, 3.717 / 2.404 / 1.766 / 1.264 / 1.000, from the
//   e9coupe.com forum for the close-ratio 265/5 without naming the car (secondary). No BMW brochure or workshop
//   manual with these figures was found;
// - centre distance 76 mm and a 380 N·m rating: auto motor und sport on the Getrag 265 (secondary).
//
// Reconstructed (ours): at 76 mm with helix angles of 15–35°, modules of 1.5–4.5 mm and 10–60 teeth per gear only the
// main pairs 23/45 and 23/36 reproduce all four three-place ratios (finer modules allow others), so the input gear most
// likely has 23 teeth; 23/45 needs pair modules of 1.75–2.25 mm while 23/36 needs at most 1.77 mm on third and at least
// 2.65 mm on fourth. gear-pick.ts then gives each pair the teeth below, the nearest to the published ratio. Reverse,
// face widths, hands and the sleeves' order (1/R, 2/3, 4/5, which a dogleg pattern implies) are estimates.

import { applyGearboxEnglish } from '../../i18n/en/apply-gearbox.ts';
import { GEARBOX_MANUAL_RWD_EN } from '../../i18n/en/gearbox-manual-rwd.ts';
import { locale } from '../../i18n/locale.ts';
import type { GearboxPage, GearboxRecord } from '../../drivetrain/catalogue.ts';

const GETRAG_265_M3: GearboxRecord = {
  id: 'manual-rwd',
  name: 'Getrag 265/5',
  car: 'bmw-m3-e30',
  layout: {
    kind: 'layshaft',
    desc: {
      id: 'manual-rwd',
      centreMm: 76,
      pressureAngle: 20,
      counterHand: 'right',
      main: { teeth: [23, 45], module: 2, faceWidth: 20 },
      speeds: [
        { teeth: [20, 38], module: 2.25, faceWidth: 24 },
        { teeth: [35, 43], module: 1.75, faceWidth: 20 },
        { teeth: [41, 37], module: 1.75, faceWidth: 18 },
        { teeth: [48, 31], module: 1.75, faceWidth: 16 },
        'direct',
      ],
      reverse: { teeth: [25, 19, 54], module: 1.75, helix: 0, faceWidth: 16, side: 1, engage: 'synchro' },
      sleeves: [
        { id: '4-5', front: 5, back: 4 },
        { id: '2-3', front: 3, back: 2 },
        { id: '1-R', front: 1, back: 'R' },
      ],
      sleeveWidth: 20,
      meshEfficiency: 0.99,
    },
  },
  published: { ratios: [3.717, 2.404, 1.766, 1.264, 1.0], reverse: 4.23, ratedTorqueNm: 380, centreMm: 76 },
  verifyNote:
    'Передаточні числа 3,717 / 2,404 / 1,766 / 1,264 / 1,000 наводить форум e9coupe.com для близькоступеневої Getrag 265/5, не називаючи авто. ' +
    'Для M3 E30 ті самі числа, округлені до 3,72 / 2,40 / 1,77 / 1,26 / 1,00, і задній хід 4,23 дають тест auto motor und sport і сайт m3-klassik.de, ' +
    'а міжосьову відстань 76 мм і розрахунковий момент 380 Н·м — стаття auto motor und sport про цю коробку. Брошури чи керівництва з ремонту BMW із цими числами ми не знайшли. ' +
    'Зубці, модулі й кути нахилу — наша реконструкція. З міжосьовою 76 мм, кутами нахилу 15–35°, модулями 1,5–4,5 мм і 10–60 зубцями на шестерні усі чотири точні числа відтворюють лише головні пари 23/45 і 23/36, ' +
    'тож шестерня первинного вала, найімовірніше, має 23 зубці. Ми взяли 23/45, бо її пари обходяться модулями 1,75–2,25 мм. ' +
    'Зубці заднього ходу (25 і 54 через проміжну на 19), ширини вінців, напрям нахилу зубців і синхронізатор заднього ходу — оцінка.',
  sources: [
    'https://www.auto-motor-und-sport.de/test/bmw-m3-e30/technische-daten/',
    'https://www.auto-motor-und-sport.de/oldtimer/getrag-5-gang-265-275-dogleg-schaltgetriebe-erster-gang-hinten-links/',
    'http://www.m3-klassik.de/m3_daten.htm',
    'https://e9coupe.com/forum/posts/439266/',
    'https://en.wikipedia.org/wiki/BMW_M3_(E30)',
  ],
  unverified: [
    'published.ratios',
    'published.reverse',
    'published.centreMm',
    'published.ratedTorqueNm',
    'teeth',
    'module',
    'helix',
    'faceWidth',
    'counterHand',
    'reverse',
    'sleeves',
  ],
};

export const MANUAL_RWD: GearboxPage = { id: 'manual-rwd', base: GETRAG_265_M3, variants: [] };

if (locale === 'en') applyGearboxEnglish(MANUAL_RWD, GEARBOX_MANUAL_RWD_EN);
