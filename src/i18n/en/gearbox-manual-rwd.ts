import type { GearboxArticle } from '../../drivetrain/catalogue.ts';
import type { GearboxTextEn } from './apply-gearbox.ts';

/** English for the manual-rwd gearbox page, by record id. */
export const GEARBOX_MANUAL_RWD_EN: Record<string, GearboxTextEn> = {
  'manual-rwd': {
    verifyNote:
      'The gear ratios 3.717 / 2.404 / 1.766 / 1.264 / 1.000 come from the e9coupe.com forum for the close-ratio Getrag 265/5, without naming the car. ' +
      'For the M3 E30, the same ratios rounded to 3.72 / 2.40 / 1.77 / 1.26 / 1.00 and the 4.23 reverse come from the auto motor und sport test and the m3-klassik.de site, ' +
      'and the 76 mm center distance and the 380 N·m torque rating from an auto motor und sport article on this transmission. We found no BMW brochure or repair manual with these figures. ' +
      'The tooth counts, modules and helix angles are our reconstruction. At a 76 mm center distance, with helix angles of 15–35°, modules of 1.5–4.5 mm and 10–60 teeth per gear, only the 23/45 and 23/36 constant-mesh pairs reproduce all four exact ratios, ' +
      'so the input shaft gear most likely has 23 teeth. We took 23/45 because its pairs get by with 1.75–2.25 mm modules. ' +
      'The reverse teeth (25 and 54 through a 19-tooth idler), the face widths, the helix hand and the reverse synchronizer are estimates.',
  },
};

/** English for the manual-rwd page's article. */
export const GEARBOX_MANUAL_RWD_ARTICLE_EN: GearboxArticle = {
  lead:
    'A manual transmission with a countershaft sits behind the longitudinal engine of a rear-wheel-drive car. The input shaft enters it from the clutch side, the output shaft leaves from the other end on the same axis, and the countershaft lies below them. ' +
    'The gears of every speed are always in mesh, and a synchronizer sleeve engages a speed by locking one of them to the output shaft.',
  how:
    'The constant-mesh pair keeps the countershaft turning from the input shaft. Each countershaft gear meshes with the gear of its speed, which turns freely on the output shaft on a needle bearing. ' +
    'So in neutral everything turns except the output shaft itself. An indirect speed runs through two meshes, and its ratio is the product of the constant-mesh pair and the speed pair. ' +
    'Direct drive locks the input shaft to the output shaft with no mesh at all. Reverse runs through an idler on an axis of its own: the third mesh turns the direction around. ' +
    'In the BMW M3 E30\'s Getrag 265, fifth is direct and first sits to the left and back on the shift gate, apart from the rest (a dogleg pattern), so second and third lie on one straight line.',
  sound:
    'The speed gears are helical: a tooth comes into mesh gradually instead of striking across its whole width, so such pairs are quieter than straight-cut ones. On a NASA test rig a helical pair was about 9 dB quieter than a straight-cut one on average. ' +
    'Direct drive is the quietest: no pair carries torque. For now this page plays only the engine; the sound of the gears comes later.',
  pros: [
    'Direct drive needs no mesh: the lowest losses and the quietest running',
    'The shafts are coaxial, so the transmission is narrow and fits the tunnel behind a longitudinal engine',
    'The gears are always in mesh and only a sleeve shifts: simple and strong',
  ],
  cons: [
    'An indirect speed loses power in two meshes instead of one',
    'All the pairs stand one behind another along the shaft, so the transmission is long',
    'It does not suit a transverse front-wheel-drive engine: that takes a two-shaft transmission',
  ],
  cars: [
    'BMW M3 (E30), 1986–1989: Getrag 265/5',
    'BMW E12, E28, E24 and E23 series: other versions of the Getrag 265',
    'Chevrolet Corvette C6: Tremec TR-6060, six speeds',
  ],
};
