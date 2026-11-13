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
      'The 85 mm center distance, the order of the sleeves, the reverse through a single idler, the face widths and the place of the differential are estimates.',
  },
};
