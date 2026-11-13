// Page manual-transaxle, the two-shaft manual with the final drive and the differential in its case: Honda Civic
// Type R FK8 (the base) and Porsche 911 Carrera T (992) with the seven-speed manual (a variant).
//
// What is published (docs/gearbox-model.md, the manual-transaxle section):
// - Civic: 3.625 / 2.115 / 1.529 / 1.125 / 0.911 / 0.734, reverse 3.757, final drive 4.111 and the helical limited-slip
//   differential, from Honda Europe's 2017 release (primary). DSPORT gives sixth as 0.735 (secondary); the Civic Type
//   R FL5 has the same set with a 3.842 final drive (Honda, primary).
// - 911 Carrera T: 3.91 / 2.29 / 1.58 / 1.18 / 0.94 / 0.79 / 0.62, reverse 3.55, final drive 3.56 and the 9.0 in
//   (229 mm) clutch, from Porsche's US technical specifications (primary).
//
// Reconstructed (ours): every tooth count, module, helix and centre distance. Honda's figures are the tooth ratios cut
// after three places rather than rounded (sixth 36/49 = 0.73469 is Honda's 0.734 and DSPORT's 0.735), so the Civic's
// teeth reproduce them that way; the final drive 18/74 shares its tooth sum 92 with the FL5's 19/73 = 3.842, so both
// run on one centre distance in one case. No single reverse idler between shafts 80 mm apart gives 3.757, so the
// Civic's reverse runs through a compound idler. The 911's pairs reproduce Porsche's two places; its 9/32 crown wheel
// and pinion matches the 991 manual's 3.44 = 31/9. Shaft positions, face widths, hands, the sleeves' order and the
// differential's place are layout estimates.

import { applyGearboxEnglish } from '../../i18n/en/apply-gearbox.ts';
import { GEARBOX_MANUAL_TRANSAXLE_EN } from '../../i18n/en/gearbox-manual-transaxle.ts';
import { locale } from '../../i18n/locale.ts';
import type { GearboxPage, GearboxRecord } from '../../drivetrain/catalogue.ts';

const CIVIC_FK8: GearboxRecord = {
  id: 'manual-transaxle',
  name: 'Honda 6MT',
  car: 'civic-type-r-fk8',
  layout: {
    kind: 'transaxle',
    desc: {
      id: 'manual-transaxle',
      centreMm: 80,
      // The countershaft behind and below the mainshaft, the differential further back on the front axle's line.
      outputDeg: 216,
      pressureAngle: 20,
      inputHand: 'right',
      speeds: [
        { teeth: [16, 58], module: 2, faceWidth: 22 },
        { teeth: [26, 55], module: 1.75, faceWidth: 20 },
        { teeth: [34, 52], module: 1.75, faceWidth: 18 },
        { teeth: [40, 45], module: 1.75, faceWidth: 17 },
        { teeth: [45, 41], module: 1.75, faceWidth: 16 },
        { teeth: [49, 36], module: 1.75, faceWidth: 15 },
      ],
      reverse: { teeth: [19, 34, 20, 42], module: 2, helix: 0, faceWidth: 14, side: 1, engage: 'synchro' },
      sleeves: [
        { id: '1-2', shaft: 'output', front: 1, back: 2 },
        { id: '3-4', shaft: 'input', front: 3, back: 4 },
        { id: '5-6', shaft: 'input', front: 5, back: 6 },
        { id: 'R', shaft: 'output', front: 'R', back: null },
      ],
      sleeveWidth: 18,
      final: { kind: 'helical', teeth: [18, 74], module: 2.5, faceWidth: 28, centreMm: 130, deg: 261 },
      meshEfficiency: 0.99,
    },
  },
  published: { ratios: [3.625, 2.115, 1.529, 1.125, 0.911, 0.734], reverse: 3.757, ratedTorqueNm: null, centreMm: null, finalDrive: 4.111 },
  verifyNote:
    'Передаточні числа 3,625 / 2,115 / 1,529 / 1,125 / 0,911 / 0,734, задній хід 3,757 і головна передача 4,111 — з технічних характеристик Honda Europe для Civic Type R 2017 року. ' +
    'Зубці, модулі, кути нахилу й міжосьові відстані — наша реконструкція. Числа Honda збігаються з відношеннями зубців, обрізаними після третього знака, а не округленими: шоста 36/49 = 0,73469 у Honda 0,734, а в DSPORT для того самого авто 0,735. ' +
    'Головну пару 18/74 підказує Civic Type R FL5 з головною передачею 3,842 = 73/19: сума зубців та сама (92), тож у тому самому картері обидві пари стоять на одній міжосьовій. ' +
    'Задній хід 3,757 не дає жодна пара через одну проміжну шестерню, що вміщується між валами за 80 мм, тож ми взяли подвійну проміжну шестерню (19 → 34 і 20 → 42). ' +
    'Міжосьова 80 мм, розташування валів, ширини вінців, напрям нахилу зубців, порядок муфт (1–2 на вторинному валу, 3–4 і 5–6 на первинному) і місце диференціала — оцінка.',
  sources: [
    'https://hondanews.eu/eu/en/cars/media/pressreleases/108909/2017-honda-civic-type-r1',
    'https://hondanews.com/en-US/honda-automobiles/releases/2023-honda-civic-type-r-specifications-features',
    'https://dsportmag.com/the-cars/first-drive/first-drive-2017-honda-civic-type-r/2/',
  ],
  unverified: ['teeth', 'module', 'helix', 'faceWidth', 'inputHand', 'centreMm', 'outputDeg', 'reverse', 'sleeves', 'final.teeth', 'final.module', 'final.centreMm', 'final.deg'],
};

const PORSCHE_992_CARRERA_T: GearboxRecord = {
  id: 'manual-transaxle/porsche-911-carrera-t-992',
  name: 'Porsche 7MT',
  car: 'porsche-911-carrera-t-992',
  layout: {
    kind: 'transaxle',
    desc: {
      id: 'manual-transaxle/porsche-911-carrera-t-992',
      centreMm: 85,
      // The pinion shaft under the input shaft, which passes over the differential to the clutch.
      outputDeg: 180,
      pressureAngle: 20,
      inputHand: 'right',
      speeds: [
        { teeth: [11, 43], module: 3, faceWidth: 26, shift: [0.4, -0.4] },
        { teeth: [17, 39], module: 2.75, faceWidth: 24 },
        { teeth: [26, 41], module: 2.25, faceWidth: 22 },
        { teeth: [28, 33], module: 2.5, faceWidth: 20 },
        { teeth: [35, 33], module: 2.25, faceWidth: 18 },
        { teeth: [43, 34], module: 2, faceWidth: 17 },
        { teeth: [50, 31], module: 2, faceWidth: 16 },
      ],
      reverse: { teeth: [20, 30, 71], module: 1.5, helix: 0, faceWidth: 16, side: 1, engage: 'synchro' },
      sleeves: [
        { id: '1-2', shaft: 'output', front: 1, back: 2 },
        { id: '3-4', shaft: 'input', front: 3, back: 4 },
        { id: '5-6', shaft: 'input', front: 5, back: 6 },
        { id: '7-R', shaft: 'output', front: 7, back: 'R' },
      ],
      sleeveWidth: 20,
      // −1: with the crank turning clockwise seen from its front (kinematics.ts) the car then moves forward.
      final: { kind: 'bevel', teeth: [9, 32], module: 6.5, faceWidth: 32, shift: 0.5, side: -1 },
      meshEfficiency: 0.99,
    },
  },
  published: { ratios: [3.91, 2.29, 1.58, 1.18, 0.94, 0.79, 0.62], reverse: 3.55, ratedTorqueNm: null, centreMm: null, finalDrive: 3.56 },
  verifyNote:
    'Передаточні числа 3,91 / 2,29 / 1,58 / 1,18 / 0,94 / 0,79 / 0,62, задній хід 3,55 і головна передача 3,56 — з технічних характеристик Porsche для 911 Carrera T із семиступінчастою механікою. ' +
    'Зубці, модулі, кути нахилу й міжосьова відстань — наша реконструкція, що відтворює кожне число до опублікованого знака. ' +
    'Головна пара 9/32 дає 3,556; механічна 911 покоління 991 мала головну передачу 3,44 = 31/9, тож ведуча шестерня на 9 зубців правдоподібна. ' +
    'Головна пара конічна, бо піввісі йдуть поперек валів коробки, але чи вона гіпоїдна, Porsche не пише; ми намалювали її прямозубою. ' +
    'Міжосьова 85 мм, порядок муфт, задній хід через одну проміжну шестерню, ширини вінців і місце диференціала — оцінка.',
  sources: [
    'https://newsroom.porsche.com/dam/jcr:f50e6bb0-6e82-4062-b167-532afdf23ac9/992%20911%20Carrera%20T%20Technical%20Specifications.pdf',
    'https://newsroom.porsche.com/dam/jcr:e1638451-d7dc-4f0e-a00d-b169cf342b86/2013_911_Technical_Specifications.pdf.PDF',
  ],
  unverified: ['teeth', 'module', 'helix', 'faceWidth', 'inputHand', 'centreMm', 'outputDeg', 'reverse', 'sleeves', 'final.teeth', 'final.module', 'final.shift', 'final.side'],
};

export const MANUAL_TRANSAXLE: GearboxPage = { id: 'manual-transaxle', base: CIVIC_FK8, variants: [PORSCHE_992_CARRERA_T] };

if (locale === 'en') applyGearboxEnglish(MANUAL_TRANSAXLE, GEARBOX_MANUAL_TRANSAXLE_EN);
