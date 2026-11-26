import type { GearboxArticle } from '../../drivetrain/catalogue.ts';
import type { GearboxTextEn } from './apply-gearbox.ts';

/** English for the manual-transaxle gearbox page, by record id. */
export const GEARBOX_MANUAL_TRANSAXLE_EN: Record<string, GearboxTextEn> = {
  'manual-transaxle': {
    verifyNote:
      'The gear ratios 3.625 / 2.115 / 1.529 / 1.125 / 0.911 / 0.734, the 3.757 reverse and the 4.111 final drive come from the Honda Europe specifications of the 2017 Civic Type R. ' +
      'The tooth counts, modules, helix angles and center distances are our reconstruction. We assume Honda cuts its figures off after the third place rather than rounding them: Honda gives sixth as 0.734, and DSPORT gives 0.735 for the same car. Our sixth, 36/49 = 0.73469, gives both, cut off and rounded. ' +
      'The 18/74 final drive is suggested by the Civic Type R FL5 with its 3.842 = 73/19 final drive: the tooth sum is the same (92), so in the same case both pairs run on one center distance. ' +
      'No pair through a single reverse idler that fits between shafts 80 mm apart gives 3.757, so we took a compound idler (19 → 34 and 20 → 42). ' +
      'The 80 mm center distance, the shaft positions, the face widths, the helix hand, the order of the sleeves (1–2 on the output shaft, 3–4 and 5–6 on the input shaft) and the place of the differential are estimates.',
  },
  'manual-transaxle/porsche-911-carrera-t-992': {
    verifyNote:
      'The gear ratios 3.91 / 2.29 / 1.58 / 1.18 / 0.94 / 0.79 / 0.62, the 3.55 reverse and the 3.56 final drive come from the Porsche technical specifications of the 911 Carrera T with the seven-speed manual transmission. ' +
      'The tooth counts, modules, helix angles and center distance are our reconstruction, which reproduces every ratio to the published place. ' +
      'The 9/32 final drive gives 3.556; the 991-generation 911 manual had a 3.44 = 31/9 final drive, so a 9-tooth pinion is plausible. ' +
      'The final drive is a bevel pair because the halfshafts run across the transmission’s shafts, but Porsche does not say whether it is a hypoid; we drew it as a straight bevel pair. ' +
      'A single reverse idler between shafts 85 mm apart gives 3.55 only with a very fine module, so we took a compound idler (18 → 25 and 18 → 46). ' +
      'The 85 mm center distance, the order of the sleeves, the face widths and the place of the differential are estimates.',
  },
};

/** English for the manual-transaxle page's article. */
export const GEARBOX_MANUAL_TRANSAXLE_ARTICLE_EN: GearboxArticle = {
  lead:
    'A two-shaft manual transmission sits where the engine and the driven wheels are close together: beside the transverse engine of a front-wheel-drive car, or by the driven axle of a rear-engine car. ' +
    'It has only two shafts, the input shaft and the output shaft, and the final drive and the differential lie in the same case, so the halfshafts to the wheels leave the transmission itself.',
  how:
    'Each speed is one pair of gears: one on the input shaft, the other on the output shaft, and the gear ratio is the ratio of their tooth counts. ' +
    'As in a transmission with a countershaft, every pair is always in mesh, and one gear of each pair turns freely on its shaft until a synchronizer sleeve locks it to the shaft. ' +
    'The sleeves sit on both shafts: the input shaft gear of a low speed is made small, cut on the shaft itself, so the gear that turns freely is its mate on the output shaft. ' +
    'A gear on the engine end of the output shaft always turns the final drive gear on the differential case. In a transverse transmission this is a helical pair; when the shafts run along the car, as in the Porsche 911, it is a bevel pair, because the halfshafts run across. ' +
    'So in any gear two pairs light up: the speed pair and the final drive. There is no direct drive here. Reverse runs through an idler that turns the direction around.',
  sound:
    'The speed gears are helical, so the pairs are quieter than straight-cut ones. Mostly the loaded meshes whine, and here two pairs are always loaded: there is no quiet direct drive as in a transmission with a countershaft. ' +
    'For now this page plays only the engine; the sound of the gears comes later.',
  pros: [
    'Each speed runs through one mesh, not two like an indirect speed in a transmission with a countershaft',
    'The transmission, the final drive and the differential share one case: no driveshaft and no separate axle',
    'It suits a transverse front-wheel-drive engine and a rear-engine car',
  ],
  cons: [
    'There is no direct drive: even in top gear the torque goes through two pairs',
    'The final drive cannot be changed apart from the transmission: it is in the same case',
    'A transverse engine and its transmission must fit between the wheels, so six speeds on two shafts are already tight',
  ],
  cars: [
    'Honda Civic Type R (FK8), 2017–2021: six speeds, a helical limited-slip differential',
    'Honda Civic Type R (FL5): the same gear set with a 3.842 final drive',
    'Porsche 911 Carrera T (992): seven speeds, a bevel final drive',
    'ZAZ-1102 Tavria: a transverse MeMZ-245, the transmission and the final drive in one case',
  ],
};
