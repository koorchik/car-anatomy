import type { GearboxTextEn } from './apply-gearbox.ts';

/** English for the manual-rwd gearbox page, by record id. */
export const GEARBOX_MANUAL_RWD_EN: Record<string, GearboxTextEn> = {
  'manual-rwd': {
    verifyNote:
      'The gear ratios 3.717 / 2.404 / 1.766 / 1.264 / 1.000 come from the e9coupe.com forum for the close-ratio Getrag 265/5, without naming the car. ' +
      'For the M3 E30, the same ratios rounded to 3.72 / 2.40 / 1.77 / 1.26 / 1.00 and the 4.23 reverse come from the auto motor und sport test and the m3-klassik.de site, ' +
      'and the 76 mm center distance and the 380 N·m torque rating from an auto motor und sport article on this transmission. We found no BMW brochure or repair manual with these figures. ' +
      'The tooth counts, modules and helix angles are our reconstruction. At a 76 mm center distance with helix angles of 15–35°, only the 23/45 and 23/36 constant-mesh pairs reproduce all four exact ratios, ' +
      'so the input shaft gear most likely has 23 teeth. We took 23/45 because its pairs get by with 1.75–2.25 mm modules. ' +
      'The reverse teeth (25 and 54 through a 19-tooth idler), the face widths, the helix hand and the reverse synchronizer are estimates.',
  },
};
